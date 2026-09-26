'use client';

// ————————————————————————————————————————————————————————————————
// Hesap (G1–G6) + uçtan uca şifreli senkron (S1–S7, 26 eylül).
//
// Hesapsız kullanımın verisi cihazdaki 'ritos' (misafir) veritabanında durur; sunucuya hiçbir
// şey gitmez. Hesap açılınca bu veri hesabın kendi veritabanına taşınır ve şifreli olarak
// senkronlanır. Her hesabın cihazda ayrı veritabanı var; hangisinin açık olduğu değişince
// sayfa yeniden yüklenir (tüm canlı sorgular yeni veritabanına bağlansın diye).
// Test döneminde Supabase'de e-posta doğrulaması kapalı: kayıt biter bitmez girişli.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import Dexie from 'dexie';
import type { Session } from '@supabase/supabase-js';
import { MISAFIR_DB, RitosDB, SENKRON_TABLOLARI, aktifHesap, aktifHesapAyarla, db, dbAdi } from './db';
import { supabase } from './supabase';
import { dekGetir, dekSakla, dekSil } from './anahtarDeposu';
import { b64, coz, dekUret, girisSifresi, kurtarmaUret, rastgele, sar, sarimiAc, sarmaAnahtari, sifrele } from './sifre';
import { senkronBaslat, senkronDurdur, senkronla } from './senkron';

export const SIFRE_EN_AZ = 8;

export interface Oturum {
  hazir: boolean;
  session: Session | null;
  gorunenAd: string | null;
  /** Bu cihazda açık olan veri bir hesaba mı ait (misafir değil)? */
  hesapli: boolean;
  /** Hesaplı veri açık ama oturum ya da anahtar yok — yeniden giriş gerekli. */
  kilitli: boolean;
}

export function useOturum(): Oturum {
  const hesapli = !!aktifHesap();
  const [o, setO] = useState<Oturum>({ hazir: false, session: null, gorunenAd: null, hesapli, kilitli: false });
  useEffect(() => {
    const sb = supabase();
    if (!sb) { setO({ hazir: true, session: null, gorunenAd: null, hesapli, kilitli: hesapli }); return; }
    let iptal = false;
    async function yukle(session: Session | null) {
      let gorunenAd: string | null = null;
      if (session) gorunenAd = await profilGaranti(session.user.id, session.user.email ?? '');
      const aktif = aktifHesap();
      const kilitli = !!aktif && (!session || session.user.id !== aktif || !(await dekGetir(aktif)));
      if (!iptal) setO({ hazir: true, session, gorunenAd, hesapli: !!aktif, kilitli });
    }
    sb.auth.getSession().then(({ data }) => yukle(data.session));
    // Geri çağrının içinde başka Supabase çağrısı beklemek kilitlenmeye yol açabiliyor — bir sonraki tura bırak.
    const { data: abone } = sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => yukle(session), 0); });
    return () => { iptal = true; abone.subscription.unsubscribe(); };
  }, [hesapli]);
  return o;
}

/** Uygulama açılışında bir kez: durum tutarlı mı, senkronu başlat. */
export function useHesapBaslat() {
  useEffect(() => {
    (async () => {
      const sb = supabase();
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      const aktif = aktifHesap();
      if (!aktif) {
        // Misafir veri açıkken kalmış bir oturum (eski sürüm ya da yarım kalmış işlem): kapat.
        if (data.session) await sb.auth.signOut();
        return;
      }
      const dek = await dekGetir(aktif);
      if (data.session?.user.id === aktif && dek) await senkronBaslat(aktif, dek);
    })();
    return () => senkronDurdur();
  }, []);
}

// Aynı Supabase hesabı paylaşım tabloları kurulmadan önce açılmış olabilir:
// oturum açıldığında Ritos profili yoksa oluştur, yoksa kimse bu kişiyi e-postasıyla bulamaz.
export async function profilGaranti(uid: string, eposta: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const r = await sb.from('cat_profil').select('gorunen_ad').eq('id', uid).maybeSingle();
  if (r.data) return r.data.gorunen_ad;
  if (r.error || !eposta) return null;
  const ad = eposta.split('@')[0];
  const e = await sb.from('cat_profil').insert({ id: uid, gorunen_ad: ad, eposta: eposta.trim().toLowerCase() });
  return e.error ? null : ad;
}

// ———————————————— misafir veri ————————————————

function misafirDb(): RitosDB {
  return db.name === MISAFIR_DB ? db : new RitosDB(MISAFIR_DB);
}

/** Misafir veritabanında kullanıcının girdiği bir şey var mı (varsayılan Home düzeni sayılmaz)? */
export async function misafirDoluMu(): Promise<boolean> {
  const m = misafirDb();
  for (const t of ['ajanda_kart', 'program', 'klasor', 'gelen'] as const) {
    if ((await m.table(t).count()) > 0) return true;
  }
  return false;
}

/** Misafir veriyi hesabın veritabanına ekle (üzerine yazmaz, birleştirir) ve misafiri boşalt. */
async function misafiriHesabaTasi(uid: string) {
  const kaynak = misafirDb();
  const hedef = new RitosDB(dbAdi(uid));
  for (const t of SENKRON_TABLOLARI) {
    const satirlar = await kaynak.table(t).toArray();
    if (satirlar.length) await hedef.table(t).bulkPut(satirlar);
  }
  const ayarlar = (await kaynak.ayar.toArray()).filter((a) => !a.anahtar.startsWith('senkron_'));
  if (ayarlar.length) await hedef.ayar.bulkPut(ayarlar);
  await hedef.hepsiniIsaretle();
  for (const t of SENKRON_TABLOLARI) await kaynak.table(t).clear();
  hedef.close();
}

// ———————————————— kayıt (G2 + S2) ————————————————

export type KayitSonuc = { tamam: true; kurtarma: string[] } | { tamam: false; hata: string };

export async function kayitOl(gorunenAd: string, eposta: string, sifre: string, misafiriTasi: boolean): Promise<KayitSonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const email = eposta.trim().toLowerCase();
  const r = await sb.auth.signUp({ email, password: await girisSifresi(sifre, email) });
  if (r.error) {
    if (/registered|already/i.test(r.error.message)) return { tamam: false, hata: 'Bu e-postayla bir hesap var — giriş yap.' };
    return { tamam: false, hata: r.error.message };
  }
  const uid = r.data.user?.id;
  if (!uid || !r.data.session) return { tamam: false, hata: 'Kayıt tamamlanamadı (e-posta doğrulaması açık olabilir).' };

  const p = await sb.from('cat_profil').insert({ id: uid, gorunen_ad: gorunenAd.trim(), eposta: email });
  if (p.error) return { tamam: false, hata: p.error.message };

  // Veri anahtarı: şifreyle ve kurtarma kelimeleriyle ayrı ayrı sarılır.
  const dek = await dekUret();
  const tuz = b64(rastgele(16));
  const kurtarmaTuz = b64(rastgele(16));
  const kurtarma = kurtarmaUret();
  const a = await sb.from('cat_anahtar').insert({
    id: uid,
    tuz,
    sarili_sifre: await sar(dek, await sarmaAnahtari(sifre, tuz)),
    kurtarma_tuz: kurtarmaTuz,
    sarili_kurtarma: await sar(dek, await sarmaAnahtari(kurtarma.join(' '), kurtarmaTuz, 'kurtarma')),
    kurtarma_sifreli: await sifrele(dek, kurtarma.join(' ')),
  });
  if (a.error) return { tamam: false, hata: `Anahtar kaydedilemedi: ${a.error.message}` };

  await dekSakla(uid, dek);
  // Cihazdaki hesapsız veri: kullanıcı seçer — hesaba taşınır ya da cihazda ayrı (özel) kalır.
  if (misafiriTasi) await misafiriHesabaTasi(uid);
  aktifHesapAyarla(uid);
  return { tamam: true, kurtarma };
}

// ———————————————— giriş (G3 + S3) ————————————————

export type GirisSonuc = { tamam: true; uid: string; misafirVar: boolean } | { tamam: false; hata: string };

export async function girisYap(eposta: string, sifre: string): Promise<GirisSonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const email = eposta.trim().toLowerCase();
  const r = await sb.auth.signInWithPassword({ email, password: await girisSifresi(sifre, email) });
  if (r.error || !r.data.user) {
    // Şifreleme öncesi açılmış (ya da Rite'ın) hesabı mı? Açıkça söyle, ama şifresini değiştirme.
    const eski = await sb.auth.signInWithPassword({ email, password: sifre });
    if (!eski.error) {
      await sb.auth.signOut();
      return { tamam: false, hata: "Bu hesap şifreli senkrondan önce (ya da Rite'ta) açılmış. Ritos için yeni bir e-postayla hesap aç." };
    }
    return { tamam: false, hata: 'E-posta ya da şifre hatalı.' }; // G3: hangi alan olduğu söylenmez
  }
  const uid = r.data.user.id;
  const k = await sb.from('cat_anahtar').select('tuz, sarili_sifre').eq('id', uid).maybeSingle();
  if (!k.data) {
    await sb.auth.signOut();
    return { tamam: false, hata: 'Bu hesabın şifreleme anahtarı bulunamadı.' };
  }
  let dek: CryptoKey;
  try {
    dek = await sarimiAc(k.data.sarili_sifre, await sarmaAnahtari(sifre, k.data.tuz));
  } catch {
    await sb.auth.signOut();
    return { tamam: false, hata: 'Veri anahtarı açılamadı.' };
  }
  await profilGaranti(uid, email);
  await dekSakla(uid, dek);
  const zatenAcik = aktifHesap() === uid; // kilitli hesaba yeniden giriş
  return { tamam: true, uid, misafirVar: !zatenAcik && (await misafirDoluMu()) };
}

/** Giriş sonrası: misafir veri hesaba eklensin mi (S3 açık sorusu → "ekle / ayrı tut"). */
export async function girisiTamamla(uid: string, misafiriEkle: boolean) {
  if (misafiriEkle) await misafiriHesabaTasi(uid);
  aktifHesapAyarla(uid);
  location.reload();
}

// ———————————————— çıkış (G5 + S5) ————————————————

export async function cikisYap(buCihazdanSil: boolean) {
  const uid = aktifHesap();
  try { await senkronla(); } catch { /* çevrimdışıysa bekleyenler cihazda kalır */ }
  senkronDurdur();
  await supabase()?.auth.signOut();
  if (uid) {
    await dekSil(uid);
    if (buCihazdanSil) {
      db.close();
      await Dexie.delete(dbAdi(uid));
    }
  }
  aktifHesapAyarla(null);
  location.reload();
}

// ———————————————— şifre ve kurtarma (S6) ————————————————

async function anahtarKaydi() {
  const sb = supabase()!;
  const { data: s } = await sb.auth.getSession();
  if (!s.session) throw new Error('Oturum yok');
  const k = await sb.from('cat_anahtar').select('*').eq('id', s.session.user.id).single();
  if (k.error) throw new Error(k.error.message);
  return { sb, uid: s.session.user.id, email: s.session.user.email ?? '', k: k.data as { tuz: string; sarili_sifre: string; kurtarma_sifreli: string } };
}

export async function kurtarmaGoster(sifre: string): Promise<string[]> {
  const { k } = await anahtarKaydi();
  let dek: CryptoKey;
  try { dek = await sarimiAc(k.sarili_sifre, await sarmaAnahtari(sifre, k.tuz)); } catch { throw new Error('Şifre hatalı.'); }
  return (await coz<string>(dek, k.kurtarma_sifreli)).split(' ');
}

export async function sifreDegistir(eski: string, yeni: string) {
  const { sb, uid, email, k } = await anahtarKaydi();
  let dek: CryptoKey;
  try { dek = await sarimiAc(k.sarili_sifre, await sarmaAnahtari(eski, k.tuz), true); } catch { throw new Error('Mevcut şifre hatalı.'); }
  // Veri yeniden şifrelenmez; yalnız anahtar yeni şifreyle yeniden sarılır.
  const tuz = b64(rastgele(16));
  const sarili = await sar(dek, await sarmaAnahtari(yeni, tuz));
  // Önce anahtar, sonra giriş şifresi; ikincisi olmazsa anahtarı eski haline döndür.
  const w = await sb.from('cat_anahtar').update({ tuz, sarili_sifre: sarili, guncellendi: new Date().toISOString() }).eq('id', uid);
  if (w.error) throw new Error(`Anahtar güncellenemedi: ${w.error.message}`);
  const u = await sb.auth.updateUser({ password: await girisSifresi(yeni, email) });
  if (u.error) {
    await sb.from('cat_anahtar').update({ tuz: k.tuz, sarili_sifre: k.sarili_sifre }).eq('id', uid);
    throw new Error(u.error.message);
  }
}

export async function gorunenAdDegistir(uid: string, ad: string) {
  await supabase()?.from('cat_profil').update({ gorunen_ad: ad.trim() }).eq('id', uid);
}

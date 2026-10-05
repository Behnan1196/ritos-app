'use client';

// ————————————————————————————————————————————————————————————————
// Hesap + uçtan uca şifreli senkron (27 eylül — V1 sadelik kararı).
//
// Ritos hesapla kullanılır: ilk ekran kayıt / giriş. Bir cihazda bir hesap açık olur; verisi
// cihazda o hesabın veritabanında durur, şifreli olarak senkronlanır, internetsiz de çalışır.
// Çıkışta cihazdaki kopya silinir (veri hesapta durur). Hesapsız kullanım, özel alan, PIN,
// cihazı başkasına verme akışları ve yedek dosyası kaldırıldı (bkz. "V1 sadelik ilkesi").
//
// Kurtarma kelimeleri kayıtta gösterilmez; birkaç gün sonra hatırlatılır. Şifre unutulursa
// e-postayla yeni şifre belirlenir; veri ancak kurtarma kelimeleriyle geri açılır.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import Dexie from 'dexie';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { aktifHesap, aktifHesapAyarla, db, dbAdi } from './db';
import { supabase } from './supabase';
import { dekGetir, dekSakla, dekSil } from './anahtarDeposu';
import { b64, coz, dekUret, girisSifresi, kurtarmaNormalize, kurtarmaUret, rastgele, sar, sarimiAc, sarmaAnahtari, sifrele } from './sifre';
import { senkronBaslat, senkronDurdur, senkronla } from './senkron';

export const SIFRE_EN_AZ = 8;
export const KURTARMA_HATIRLATMA_GUN = 3;

export interface Oturum {
  hazir: boolean;
  session: Session | null;
  gorunenAd: string | null;
  /** Bu cihazda bir hesabın verisi açık mı? */
  hesapli: boolean;
  /** Hesabın verisi cihazda ama oturum ya da anahtar yok — yeniden giriş gerekli. */
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
      if (session) gorunenAd = await profilGaranti(session.user.id, session.user.email ?? '', metaAd(session.user));
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

/** Uygulama açılışında bir kez: senkronu başlat. */
export function useHesapBaslat() {
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const aktif = aktifHesap();
      if (!sb || !aktif) return;
      const { data } = await sb.auth.getSession();
      const dek = await dekGetir(aktif);
      if (data.session?.user.id === aktif && dek) await senkronBaslat(aktif, dek);
    })();
    return () => senkronDurdur();
  }, []);
}

/** Google gibi sağlayıcıların verdiği ad (varsa). */
export function metaAd(u: User | null | undefined): string | null {
  const m = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const ad = (typeof m.full_name === 'string' && m.full_name) || (typeof m.name === 'string' && m.name) || '';
  return ad.trim() || null;
}

/** Bu kullanıcı e-posta + şifreyle de girebiliyor mu? (Yalnız Google ise giriş şifresi yok.) */
export function epostaGirisiVar(u: User | null | undefined): boolean {
  const p = (u?.app_metadata?.providers as string[] | undefined) ?? [u?.app_metadata?.provider ?? 'email'];
  return p.includes('email');
}

// Oturum açıldığında Ritos profili yoksa oluştur (yoksa kimse bu kişiyi e-postasıyla bulamaz).
export async function profilGaranti(uid: string, eposta: string, adOnerisi?: string | null): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const r = await sb.from('cat_profil').select('gorunen_ad').eq('id', uid).maybeSingle();
  if (r.data) return r.data.gorunen_ad;
  if (r.error || !eposta) return null;
  const ad = adOnerisi || eposta.split('@')[0];
  const e = await sb.from('cat_profil').insert({ id: uid, gorunen_ad: ad, eposta: eposta.trim().toLowerCase() });
  return e.error ? null : ad;
}

// ———————————————— kayıt ————————————————

export type Sonuc = { tamam: true } | { tamam: false; hata: string };

async function anahtarlariOlustur(uid: string, sifre: string): Promise<{ dek: CryptoKey; satir: Record<string, string> }> {
  const dek = await dekUret();
  const tuz = b64(rastgele(16));
  const kurtarmaTuz = b64(rastgele(16));
  const kurtarma = kurtarmaUret();
  return {
    dek,
    satir: {
      id: uid,
      tuz,
      sarili_sifre: await sar(dek, await sarmaAnahtari(sifre, tuz)),
      kurtarma_tuz: kurtarmaTuz,
      sarili_kurtarma: await sar(dek, await sarmaAnahtari(kurtarma.join(' '), kurtarmaTuz, 'kurtarma')),
      kurtarma_sifreli: await sifrele(dek, kurtarma.join(' ')),
    },
  };
}

export async function kayitOl(gorunenAd: string, eposta: string, sifre: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  oauthBayrak(false);
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
  // Veri anahtarı: şifreyle ve kurtarma kelimeleriyle ayrı ayrı sarılır. Kelimeler şimdi gösterilmez.
  const { dek, satir } = await anahtarlariOlustur(uid, sifre);
  const a = await sb.from('cat_anahtar').insert(satir);
  if (a.error) return { tamam: false, hata: `Anahtar kaydedilemedi: ${a.error.message}` };
  await dekSakla(uid, dek);
  aktifHesapAyarla(uid);
  location.reload();
  return { tamam: true };
}

// ———————————————— giriş ————————————————

export async function girisYap(eposta: string, sifre: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  oauthBayrak(false);
  const email = eposta.trim().toLowerCase();
  const r = await sb.auth.signInWithPassword({ email, password: await girisSifresi(sifre, email) });
  if (r.error || !r.data.user) {
    // Şifreleme öncesi açılmış (ya da Rite'ın) hesabı mı? Açıkça söyle, ama şifresini değiştirme.
    const eski = await sb.auth.signInWithPassword({ email, password: sifre });
    if (!eski.error) {
      await sb.auth.signOut();
      return { tamam: false, hata: "Bu hesap şifreli senkrondan önce (ya da Rite'ta) açılmış. Ritos için yeni bir e-postayla hesap aç." };
    }
    return { tamam: false, hata: 'E-posta ya da şifre hatalı.' };
  }
  const uid = r.data.user.id;
  const k = await sb.from('cat_anahtar').select('tuz, sarili_sifre').eq('id', uid).maybeSingle();
  let dek: CryptoKey;
  if (!k.data) {
    // 5 ekim: Ritos verisi silinmiş (Hesabımı sil) ya da hiç oluşmamış hesap — şifre doğru olduğuna
    // göre Ritos'a temiz başlangıç: yeni veri anahtarı oluşturulur.
    const yeni = await anahtarlariOlustur(uid, sifre);
    const a = await sb.from('cat_anahtar').insert(yeni.satir);
    if (a.error) { await sb.auth.signOut(); return { tamam: false, hata: `Anahtar kaydedilemedi: ${a.error.message}` }; }
    dek = yeni.dek;
  } else {
    try {
      dek = await sarimiAc(k.data.sarili_sifre, await sarmaAnahtari(sifre, k.data.tuz));
    } catch {
      await sb.auth.signOut();
      return { tamam: false, hata: 'Veri anahtarı açılamadı.' };
    }
  }
  await profilGaranti(uid, email);
  // Cihazda başka bir hesabın verisi kalmışsa (beklenmez; çıkış siler) önce onu sil.
  const onceki = aktifHesap();
  if (onceki && onceki !== uid) { await dekSil(onceki); db.close(); await Dexie.delete(dbAdi(onceki)); }
  await dekSakla(uid, dek);
  aktifHesapAyarla(uid);
  location.reload();
  return { tamam: true };
}

// ———————————————— Google ile giriş + veri şifresi (5 ekim) ————————————————
// Google girişinde uygulama şifreyi hiç görmez; veri anahtarını açan "veri şifresi" ayrıca sorulur.
// E-postayla açılmış hesaplarda veri şifresi = bugüne kadarki giriş şifresi (aynı e-postalı Google
// girişi Supabase'de aynı kullanıcıya bağlanır). Yeni Google hesaplarında ilk girişte belirlenir.

const OAUTH_BAYRAK = 'ritos-oauth';
function oauthBayrak(v: boolean) {
  try { if (v) localStorage.setItem(OAUTH_BAYRAK, '1'); else localStorage.removeItem(OAUTH_BAYRAK); } catch { /* yoksay */ }
}
/** Google'dan dönüldü, veri şifresi bekleniyor mu? */
export function oauthBekliyor(): boolean {
  try { return localStorage.getItem(OAUTH_BAYRAK) === '1'; } catch { return false; }
}

export async function googleIleGir(): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  oauthBayrak(true);
  const r = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/`, queryParams: { prompt: 'select_account' } },
  });
  if (r.error) { oauthBayrak(false); return { tamam: false, hata: r.error.message }; }
  return { tamam: true }; // sayfa Google'a gider
}

/** Oturumdaki kullanıcının Ritos veri anahtarı var mı? (null: sorulamadı) */
export async function veriAnahtariVar(): Promise<boolean | null> {
  const sb = supabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  if (!sb || !data.session) return null;
  const k = await sb.from('cat_anahtar').select('id').eq('id', data.session.user.id).maybeSingle();
  return k.error ? null : !!k.data;
}

/** Veri şifresiyle anahtarı aç; hiç anahtar yoksa (yeni Ritos kullanıcısı) bu şifreyle oluştur. */
export async function veriSifresiyleAc(sifre: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return { tamam: false, hata: 'Oturum kapanmış; yeniden giriş yap.' };
  const uid = user.id;
  const k = await sb.from('cat_anahtar').select('tuz, sarili_sifre').eq('id', uid).maybeSingle();
  if (k.error) return { tamam: false, hata: k.error.message };
  let dek: CryptoKey;
  if (!k.data) {
    const yeni = await anahtarlariOlustur(uid, sifre);
    const a = await sb.from('cat_anahtar').insert(yeni.satir);
    if (a.error) return { tamam: false, hata: `Anahtar kaydedilemedi: ${a.error.message}` };
    dek = yeni.dek;
  } else {
    try { dek = await sarimiAc(k.data.sarili_sifre, await sarmaAnahtari(sifre, k.data.tuz)); }
    catch { return { tamam: false, hata: 'Veri şifresi hatalı.' }; }
  }
  await profilGaranti(uid, user.email ?? '', metaAd(user));
  const onceki = aktifHesap();
  if (onceki && onceki !== uid) { await dekSil(onceki); db.close(); await Dexie.delete(dbAdi(onceki)); }
  await dekSakla(uid, dek);
  aktifHesapAyarla(uid);
  oauthBayrak(false);
  location.replace(location.pathname);
  return { tamam: true };
}

/** Veri şifresi unutuldu: kurtarma kelimeleriyle (ya da baştan) yeni veri şifresi. Giriş şifresine dokunmaz. */
export function veriSifresiSifirla(yeni: string, kelimeler: string | null): Promise<Sonuc> {
  return sifirlamaTamamla(yeni, kelimeler, false);
}

/** Google'dan dönüldü ama vazgeçildi: oturumu kapat, giriş ekranına dön. */
export async function oauthVazgec() {
  oauthBayrak(false);
  await supabase()?.auth.signOut({ scope: 'local' });
  location.replace(location.pathname);
}

// ———————————————— çıkış ————————————————

/** Çıkış: bekleyenler gönderilir, cihazdaki kopya silinir; veri hesapta durur. */
export async function cikisYap() {
  const uid = aktifHesap();
  try { await senkronla(); } catch { /* çevrimdışıysa bekleyenler kaybolur — ekranda uyarılır */ }
  senkronDurdur();
  await supabase()?.auth.signOut({ scope: 'local' });
  if (uid) {
    await dekSil(uid);
    db.close();
    await Dexie.delete(dbAdi(uid));
  }
  aktifHesapAyarla(null);
  oauthBayrak(false);
  location.reload();
}

// ———————————————— kurtarma kelimeleri ————————————————

async function anahtarKaydi() {
  const sb = supabase()!;
  const { data: s } = await sb.auth.getSession();
  if (!s.session) throw new Error('Oturum yok');
  const k = await sb.from('cat_anahtar').select('*').eq('id', s.session.user.id).single();
  if (k.error) throw new Error(k.error.message);
  return {
    sb, uid: s.session.user.id, email: s.session.user.email ?? '', girisDe: epostaGirisiVar(s.session.user),
    k: k.data as { tuz: string; sarili_sifre: string; kurtarma_tuz: string; sarili_kurtarma: string; kurtarma_sifreli: string },
  };
}

export async function kurtarmaGoster(sifre: string): Promise<string[]> {
  const { k } = await anahtarKaydi();
  let dek: CryptoKey;
  try { dek = await sarimiAc(k.sarili_sifre, await sarmaAnahtari(sifre, k.tuz)); } catch { throw new Error('Şifre hatalı.'); }
  return (await coz<string>(dek, k.kurtarma_sifreli)).split(' ');
}

export interface KurtarmaDurumu { kaydedildi: boolean; hatirlat: boolean }

/** Kurtarma kelimeleri kaydedildi mi; kaydedilmediyse hesap açılalı birkaç gün geçti mi (ya da koç bağlantısı var mı)? */
export async function kurtarmaDurumu(uid: string, iliskiVar: boolean): Promise<KurtarmaDurumu> {
  const sb = supabase();
  if (!sb) return { kaydedildi: true, hatirlat: false };
  const r = await sb.from('cat_profil').select('olusturuldu, kurtarma_kaydedildi').eq('id', uid).maybeSingle();
  if (r.error || !r.data) return { kaydedildi: true, hatirlat: false };
  if (r.data.kurtarma_kaydedildi) return { kaydedildi: true, hatirlat: false };
  const gun = (Date.now() - new Date(r.data.olusturuldu).getTime()) / 86400000;
  return { kaydedildi: false, hatirlat: iliskiVar || gun >= KURTARMA_HATIRLATMA_GUN };
}

export async function kurtarmaKaydedildi(uid: string) {
  await supabase()?.from('cat_profil').update({ kurtarma_kaydedildi: new Date().toISOString() }).eq('id', uid);
}

// ———————————————— şifre değiştirme ve sıfırlama ————————————————

export async function sifreDegistir(eski: string, yeni: string) {
  const { sb, uid, email, k, girisDe } = await anahtarKaydi();
  let dek: CryptoKey;
  try { dek = await sarimiAc(k.sarili_sifre, await sarmaAnahtari(eski, k.tuz), true); } catch { throw new Error('Mevcut şifre hatalı.'); }
  await yeniSifreyleSar(sb, uid, email, dek, yeni, k, girisDe);
}

// girisDe: e-postayla giriş şifresi de birlikte değişsin mi (yalnız Google kullanıcısında giriş şifresi yok).
async function yeniSifreyleSar(sb: SupabaseClient, uid: string, email: string, dek: CryptoKey, yeni: string, eski: { tuz: string; sarili_sifre: string }, girisDe = true) {
  // Veri yeniden şifrelenmez; yalnız anahtar yeni şifreyle yeniden sarılır.
  const tuz = b64(rastgele(16));
  const sarili = await sar(dek, await sarmaAnahtari(yeni, tuz));
  const w = await sb.from('cat_anahtar').update({ tuz, sarili_sifre: sarili, guncellendi: new Date().toISOString() }).eq('id', uid);
  if (w.error) throw new Error(`Anahtar güncellenemedi: ${w.error.message}`);
  if (!girisDe) return;
  const u = await sb.auth.updateUser({ password: await girisSifresi(yeni, email) });
  if (u.error) {
    await sb.from('cat_anahtar').update({ tuz: eski.tuz, sarili_sifre: eski.sarili_sifre }).eq('id', uid);
    throw new Error(u.error.message);
  }
}

/** "Şifremi unuttum": e-postaya sıfırlama bağlantısı. Bağlantı uygulamayı ?sifirla=1 ile açar. */
export async function sifirlamaIste(eposta: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  const r = await sb.auth.resetPasswordForEmail(eposta.trim().toLowerCase(), { redirectTo: `${location.origin}/?sifirla=1` });
  return r.error ? { tamam: false, hata: r.error.message } : { tamam: true };
}

/**
 * Sıfırlama bağlantısından dönüldü (oturum açık, şifre bilinmiyor):
 *  • kurtarma kelimeleri verildiyse veri anahtarı onlarla açılır ve yeni şifreyle sarılır — veri geri gelir;
 *  • verilmediyse yeni bir anahtarla baştan başlanır — eski şifreli veri açılamaz, sunucudan silinir.
 */
export async function sifirlamaTamamla(yeni: string, kelimeler: string | null, girisDe = true): Promise<Sonuc> {
  const { sb, uid, email, k } = await anahtarKaydi();
  if (kelimeler) {
    const norm = kurtarmaNormalize(kelimeler);
    if (!norm) return { tamam: false, hata: 'Kurtarma kelimeleri tanınmadı; 12 kelimeyi aralarında boşlukla yaz.' };
    let dek: CryptoKey;
    try { dek = await sarimiAc(k.sarili_kurtarma, await sarmaAnahtari(norm, k.kurtarma_tuz, 'kurtarma'), true); }
    catch { return { tamam: false, hata: 'Kurtarma kelimeleri bu hesaba ait değil.' }; }
    try { await yeniSifreyleSar(sb, uid, email, dek, yeni, k, girisDe); } catch (e) { return { tamam: false, hata: e instanceof Error ? e.message : String(e) }; }
    await dekSakla(uid, dek);
  } else {
    const { dek, satir } = await anahtarlariOlustur(uid, yeni);
    const w = await sb.from('cat_anahtar').update({ ...satir, cift_sifreli: null, guncellendi: new Date().toISOString() }).eq('id', uid);
    if (w.error) return { tamam: false, hata: w.error.message };
    if (girisDe) {
      const u = await sb.auth.updateUser({ password: await girisSifresi(yeni, email) });
      if (u.error) return { tamam: false, hata: u.error.message };
    }
    await sb.from('cat_kayit').delete().eq('sahip', uid);           // açılamayacak eski veri
    await sb.from('cat_acik_anahtar').delete().eq('id', uid);       // danışmanlık anahtar çifti yeniden üretilecek
    await sb.from('cat_profil').update({ kurtarma_kaydedildi: null }).eq('id', uid);
    await dekSakla(uid, dek);
    // Bu cihazda hesabın verisi duruyorsa kaybolmaz: yeni anahtarla yeniden yüklenir.
    if (aktifHesap() === uid) { await db.hepsiniIsaretle(); await db.ayar.delete('senkron_sira'); }
  }
  const onceki = aktifHesap();
  if (onceki && onceki !== uid) { await dekSil(onceki); db.close(); await Dexie.delete(dbAdi(onceki)); }
  aktifHesapAyarla(uid);
  oauthBayrak(false);
  location.replace(location.pathname);
  return { tamam: true };
}

export async function gorunenAdDegistir(uid: string, ad: string) {
  await supabase()?.from('cat_profil').update({ gorunen_ad: ad.trim() }).eq('id', uid);
}

'use client';

// ————————————————————————————————————————————————————————————————
// Hesap + eşitleme (7 ekim — v1 şema: şifreleme kalktı).
//
// Ritos hesapla kullanılır: ilk ekran kayıt / giriş (e-posta + şifre). Bir cihazda bir hesap açık
// olur; verisi cihazda o hesabın veritabanında durur, sunucudaki `kayit` tablosuyla eşitlenir
// (düz JSON, yalnız sahibi okur — RLS), internetsiz de çalışır. Çıkışta cihazdaki kopya silinir.
// Veri şifresi, kurtarma kelimeleri ve Google girişi yok.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import Dexie from 'dexie';
import type { Session, User } from '@supabase/supabase-js';
import { aktifHesap, aktifHesapAyarla, db, dbAdi } from './db';
import { supabase } from './supabase';
import { senkronBaslat, senkronDurdur, senkronla } from './senkron';

export const SIFRE_EN_AZ = 8;

export interface Oturum {
  hazir: boolean;
  session: Session | null;
  gorunenAd: string | null;
  /** Bu cihazda bir hesabın verisi açık mı? */
  hesapli: boolean;
  /** Hesabın verisi cihazda ama oturum yok — yeniden giriş gerekli. */
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
      const kilitli = !!aktif && (!session || session.user.id !== aktif);
      if (!iptal) setO({ hazir: true, session, gorunenAd, hesapli: !!aktif, kilitli });
    }
    sb.auth.getSession().then(({ data }) => yukle(data.session));
    // Geri çağrının içinde başka Supabase çağrısı beklemek kilitlenmeye yol açabiliyor — bir sonraki tura bırak.
    const { data: abone } = sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => yukle(session), 0); });
    return () => { iptal = true; abone.subscription.unsubscribe(); };
  }, [hesapli]);
  return o;
}

/** Uygulama açılışında bir kez: eşitlemeyi başlat. */
export function useHesapBaslat() {
  useEffect(() => {
    (async () => {
      const sb = supabase();
      const aktif = aktifHesap();
      if (!sb || !aktif) return;
      const { data } = await sb.auth.getSession();
      if (data.session?.user.id === aktif) await senkronBaslat(aktif);
    })();
    return () => senkronDurdur();
  }, []);
}

/** Kayıtta verilen ad (user_metadata). */
export function metaAd(u: User | null | undefined): string | null {
  const m = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const ad = (typeof m.gorunen_ad === 'string' && m.gorunen_ad) || (typeof m.full_name === 'string' && m.full_name) || (typeof m.name === 'string' && m.name) || '';
  return ad.trim() || null;
}

/** Profil sunucuda kendiliğinden kurulur (yeni_kullanici tetiği); yine de yoksa burada oluşturulur. */
export async function profilGaranti(uid: string, eposta: string, adOnerisi?: string | null): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const r = await sb.from('profil').select('gorunen_ad').eq('id', uid).maybeSingle();
  if (r.data) return r.data.gorunen_ad || adOnerisi || eposta.split('@')[0] || null;
  if (r.error || !eposta) return adOnerisi ?? null;
  const ad = adOnerisi || eposta.split('@')[0];
  const e = await sb.from('profil').insert({ id: uid, gorunen_ad: ad, eposta: eposta.trim().toLowerCase() });
  return e.error ? ad : ad;
}

export type Sonuc = { tamam: true } | { tamam: false; hata: string };

/** Cihazda başka bir hesabın verisi kalmışsa (beklenmez; çıkış siler) önce onu sil, sonra bu hesabı aç. */
async function hesabiAc(uid: string) {
  const onceki = aktifHesap();
  if (onceki && onceki !== uid) { db.close(); await Dexie.delete(dbAdi(onceki)); }
  aktifHesapAyarla(uid);
}

// ———————————————— kayıt / giriş ————————————————

export async function kayitOl(gorunenAd: string, eposta: string, sifre: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const email = eposta.trim().toLowerCase();
  const r = await sb.auth.signUp({ email, password: sifre, options: { data: { gorunen_ad: gorunenAd.trim() } } });
  if (r.error) {
    if (/registered|already/i.test(r.error.message)) return { tamam: false, hata: 'Bu e-postayla bir hesap var — giriş yap.' };
    return { tamam: false, hata: r.error.message };
  }
  const uid = r.data.user?.id;
  if (!uid) return { tamam: false, hata: 'Kayıt tamamlanamadı.' };
  if (!r.data.session) return { tamam: false, hata: 'E-postana bir doğrulama bağlantısı gönderdik. Bağlantıyı açtıktan sonra giriş yap.' };
  await hesabiAc(uid);
  location.reload();
  return { tamam: true };
}

export async function girisYap(eposta: string, sifre: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const email = eposta.trim().toLowerCase();
  const r = await sb.auth.signInWithPassword({ email, password: sifre });
  if (r.error || !r.data.user) {
    if (r.error && /confirm/i.test(r.error.message)) return { tamam: false, hata: 'E-posta adresin henüz doğrulanmamış. Gelen kutundaki bağlantıyı aç.' };
    return { tamam: false, hata: 'E-posta ya da şifre hatalı.' };
  }
  await hesabiAc(r.data.user.id);
  location.reload();
  return { tamam: true };
}

// ———————————————— çıkış ————————————————

/** Çıkış: bekleyenler gönderilir, cihazdaki kopya silinir; veri hesapta durur. */
export async function cikisYap() {
  const uid = aktifHesap();
  try { await senkronla(); } catch { /* çevrimdışıysa bekleyenler kaybolur — ekranda uyarılır */ }
  senkronDurdur();
  await supabase()?.auth.signOut({ scope: 'local' });
  if (uid) { db.close(); await Dexie.delete(dbAdi(uid)); }
  aktifHesapAyarla(null);
  location.reload();
}

// ———————————————— şifre değiştirme ve sıfırlama ————————————————

export async function sifreDegistir(eski: string, yeni: string) {
  const sb = supabase();
  if (!sb) throw new Error('Sunucu ayarı yok');
  const { data } = await sb.auth.getSession();
  const email = data.session?.user.email;
  if (!email) throw new Error('Oturum yok');
  const dogrula = await sb.auth.signInWithPassword({ email, password: eski });
  if (dogrula.error) throw new Error('Mevcut şifre hatalı.');
  const u = await sb.auth.updateUser({ password: yeni });
  if (u.error) throw new Error(u.error.message);
}

/** "Şifremi unuttum": e-postaya sıfırlama bağlantısı. Bağlantı uygulamayı ?sifirla=1 ile açar. */
export async function sifirlamaIste(eposta: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  const r = await sb.auth.resetPasswordForEmail(eposta.trim().toLowerCase(), { redirectTo: `${location.origin}/?sifirla=1` });
  return r.error ? { tamam: false, hata: r.error.message } : { tamam: true };
}

/** Sıfırlama bağlantısından dönüldü (oturum açık): yeni şifreyi kaydet, hesabı bu cihazda aç. */
export async function sifirlamaTamamla(yeni: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return { tamam: false, hata: 'Bağlantının süresi dolmuş; yeniden iste.' };
  const u = await sb.auth.updateUser({ password: yeni });
  if (u.error) return { tamam: false, hata: u.error.message };
  await hesabiAc(uid);
  location.replace(location.pathname);
  return { tamam: true };
}

export async function gorunenAdDegistir(uid: string, ad: string) {
  await supabase()?.from('profil').update({ gorunen_ad: ad.trim(), guncellendi: new Date().toISOString() }).eq('id', uid);
}

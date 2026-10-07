'use client';

// ————————————————————————————————————————————————————————————————
// Hesap + eşitleme (7 ekim — v1 şema: şifreleme kalktı).
//
// 7 ekim: Ritos hesapsız da çalışır (misafir veritabanı, yalnız bu tarayıcıda); hesap Çevrem,
// danışmanlık, paylaşım, bildirim ve eşitleme için. Hesap açınca / girince hesapsız veri hesaba taşınır.
// 8 ekim: şifre yok — e-postaya gelen kodla girilir (yeni kullanıcı da aynı yoldan). "Hesap" kelimesi
// arayüzde geçmez; kullanıcı "e-postasını bağlar". Bağlıyken bir cihazda bir hesap açık
// olur; verisi cihazda o hesabın veritabanında durur, sunucudaki `kayit` tablosuyla eşitlenir
// (düz JSON, yalnız sahibi okur — RLS), internetsiz de çalışır. Çıkışta cihazdaki kopya silinir.
// Veri şifresi, kurtarma kelimeleri ve Google girişi yok.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import Dexie from 'dexie';
import type { Session, User } from '@supabase/supabase-js';
import { MISAFIR_DB, RitosDB, SENKRON_TABLOLARI, aktifHesap, aktifHesapAyarla, db, dbAdi } from './db';
import { supabase } from './supabase';
import { bekleyenleriGonder, senkronBaslat, senkronDurdur } from './senkron';

/** Hesapsızken "e-postanla devam et" penceresini aç (Gruplar, Paylaş gibi kimlik isteyen yerlerden). */
export const GIRIS_OLAY = 'ritos-giris-ac';
export function girisAc() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(GIRIS_OLAY)); }

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

/** Cihazda başka bir hesabın verisi kalmışsa (beklenmez; çıkış siler) önce onu sil, sonra bu hesabı aç.
 *  7 ekim — hesapsız kullanılmışsa bu tarayıcıdaki veri hesaba taşınır (sonra eşitlenir). */
async function hesabiAc(uid: string, nasil: 'kayit' | 'giris' = 'giris') {
  const onceki = aktifHesap();
  if (onceki && onceki !== uid) { db.close(); await Dexie.delete(dbAdi(onceki)); }
  if (!onceki) { try { await misafirVerisiniTasi(uid, nasil); } catch (e) { console.warn('[ritos] hesapsız veri taşınamadı', e); } }
  aktifHesapAyarla(uid);
}

/** 8 ekim — web (test ortamı): Google ile giriş. Dönüşte oturum açık gelir; oturumuBagla cihazı bu hesaba bağlar. */
export async function googleIleGir(): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  // Dönüş adresinde yalnız davet bağlantısı korunur (önceki denemenin ?error=… parametreleri taşınmasın).
  const u = new URL(location.href);
  const q = new URLSearchParams();
  for (const k of ['katil', 'davet']) { const v = u.searchParams.get(k); if (v) q.set(k, v); }
  const r = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}${location.pathname}${q.toString() ? `?${q}` : ''}` } });
  return r.error ? { tamam: false, hata: r.error.message } : { tamam: true };
}

/** Oturum açık ama bu cihaz henüz o hesaba bağlı değil (Google dönüşü): bağla, avatarı profile yaz (yoksa), yenile. */
export async function oturumuBagla(u: User) {
  const sb = supabase();
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof m.avatar_url === 'string' && m.avatar_url) || (typeof m.picture === 'string' && m.picture) || null;
  if (sb && resim) { try { await sb.from('profil').update({ avatar_url: resim }).eq('id', u.id).is('avatar_url', null); } catch { /* yoksay */ } }
  const yeni = Date.now() - Date.parse(u.created_at) < 15 * 60000;
  await hesabiAc(u.id, yeni ? 'kayit' : 'giris');
  location.reload();
}

/** Bu tarayıcıda hesapsız girilmiş bir şey var mı? (giriş ekranında "verin hesabına eklenir" demek için) */
export async function misafirVerisiVar(): Promise<boolean> {
  if (aktifHesap()) return false;
  const m = new RitosDB(MISAFIR_DB);
  try {
    for (const t of ['ajanda_kart', 'program', 'not', 'kutuphane_kart', 'olcum'] as const) if ((await m.table(t).count()) > 0) return true;
    return false;
  } finally { m.close(); }
}

/** Hesapsız alanın (misafir veritabanı) tüm satırlarını hesabın veritabanına kopyala, hepsini gönderilecek
 *  diye işaretle, misafir alanı boşalt. Girişte (var olan hesap) hazır yaşam alanları kopyalanmaz —
 *  hesaptaki düzenlemelerin üstüne yazılmasın. */
async function misafirVerisiniTasi(uid: string, nasil: 'kayit' | 'giris') {
  const m = new RitosDB(MISAFIR_DB);
  const hedef = new RitosDB(dbAdi(uid));
  try {
    let tasinan = 0;
    for (const t of m.tables) {
      if (t.name === 'bekleyen') continue;
      let satirlar = await t.toArray();
      if (t.name === 'ayar') satirlar = satirlar.filter((r) => !/^(senkron_|danismanlik_)/.test(String((r as { anahtar: string }).anahtar)));
      if (t.name === 'yasam_alani' && nasil === 'giris') satirlar = satirlar.filter((r) => !String((r as { id: string }).id).startsWith('alan:'));
      if (!satirlar.length) continue;
      await hedef.table(t.name).bulkPut(satirlar);
      if ((SENKRON_TABLOLARI as readonly string[]).includes(t.name)) tasinan += satirlar.length;
    }
    if (tasinan) await hedef.hepsiniIsaretle();
  } finally { m.close(); hedef.close(); }
  db.close();
  await Dexie.delete(MISAFIR_DB);
}

// ———————————————— e-posta kodu ile giriş (8 ekim) ————————————————

/** Hesapsız kullanırken verilen ad (karşılamada "Sana nasıl seslenelim?"). Bağlanınca profile geçer. */
const YEREL_AD = 'ritos-ad';
export function yerelAd(): string | null { try { return localStorage.getItem(YEREL_AD) || null; } catch { return null; } }
export function yerelAdKaydet(ad: string) { try { if (ad.trim()) localStorage.setItem(YEREL_AD, ad.trim()); else localStorage.removeItem(YEREL_AD); } catch { /* yoksay */ } }

function sunucuHatasi(m: string): string {
  if (/rate|too many|seconds/i.test(m)) return 'Biraz bekleyip yeniden dene.';
  if (/expired|invalid|token/i.test(m)) return 'Kod doğru değil ya da süresi dolmuş.';
  return m;
}

/** E-postaya giriş kodu gönder. Bu e-postayla daha önce gelinmediyse kişi kendiliğinden oluşur. */
export async function kodGonder(eposta: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const ad = yerelAd();
  const r = await sb.auth.signInWithOtp({ email: eposta.trim().toLowerCase(), options: { shouldCreateUser: true, data: ad ? { gorunen_ad: ad } : undefined } });
  return r.error ? { tamam: false, hata: sunucuHatasi(r.error.message) } : { tamam: true };
}

/** Kodu doğrula; bu cihazı o kişiye bağla (hesapsız girilenler sessizce eklenir) ve yeniden aç. */
export async function kodDogrula(eposta: string, kod: string): Promise<Sonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  const email = eposta.trim().toLowerCase();
  const token = kod.replace(/\s/g, '');
  let r = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (r.error) { const r2 = await sb.auth.verifyOtp({ email, token, type: 'signup' }); if (!r2.error) r = r2; }
  const u = r.data?.user;
  if (r.error || !u) return { tamam: false, hata: sunucuHatasi(r.error?.message ?? 'Kod doğru değil.') };
  const yeni = Date.now() - Date.parse(u.created_at) < 15 * 60000;
  const ad = yerelAd();
  if (yeni && ad) { try { await sb.from('profil').update({ gorunen_ad: ad }).eq('id', u.id); } catch { /* yoksay */ } }
  await hesabiAc(u.id, yeni ? 'kayit' : 'giris');
  location.reload();
  return { tamam: true };
}

// ———————————————— çıkış ————————————————

/** Çıkış: bekleyenler gönderilir, cihazdaki kopya silinir; veri hesapta durur. */
export async function cikisYap(zorla = false): Promise<Sonuc> {
  const uid = aktifHesap();
  // Bekleyen değişiklikler gönderilmeden cihazdaki kopya silinmez (yoksa son eklenen kart kaybolur).
  let kalan = 0;
  try { kalan = await bekleyenleriGonder(); } catch { kalan = 1; }
  if (kalan > 0 && !zorla) return { tamam: false, hata: 'Son değişikliklerin henüz gönderilemedi. İnternete bağlı olduğundan emin olup yeniden dene.' };
  senkronDurdur();
  await supabase()?.auth.signOut({ scope: 'local' });
  if (uid) { db.close(); await Dexie.delete(dbAdi(uid)); }
  aktifHesapAyarla(null);
  try { localStorage.removeItem('ritos-karsilandi'); } catch { /* yoksay */ } // karşılama yeniden: "Başla" ya da "Daha önce kullandım"
  location.reload();
  return { tamam: true };
}

export async function gorunenAdDegistir(uid: string, ad: string) {
  await supabase()?.from('profil').update({ gorunen_ad: ad.trim(), guncellendi: new Date().toISOString() }).eq('id', uid);
}

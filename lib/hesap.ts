'use client';

// ————————————————————————————————————————————————————————————————
// Hesap (G1–G6). Ritos hesapsız açılır; hesap yalnızca paylaşmak / bağlanmak için.
// Hesap açmak ya da çıkış yapmak yerel veriye dokunmaz.
// Test döneminde Supabase'de e-posta doğrulaması kapalı: kayıt biter bitmez girişli.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db } from './db';
import { supabase } from './supabase';

const SON_KULLANICI = 'son_kullanici';

export interface Oturum {
  hazir: boolean;
  session: Session | null;
  gorunenAd: string | null;
}

export function useOturum(): Oturum {
  const [o, setO] = useState<Oturum>({ hazir: false, session: null, gorunenAd: null });
  useEffect(() => {
    const sb = supabase();
    if (!sb) { setO({ hazir: true, session: null, gorunenAd: null }); return; }
    let iptal = false;
    async function yukle(session: Session | null) {
      let gorunenAd: string | null = null;
      if (session) {
        const r = await sb!.from('cat_profil').select('gorunen_ad').eq('id', session.user.id).maybeSingle();
        gorunenAd = r.data?.gorunen_ad ?? null;
      }
      if (!iptal) setO({ hazir: true, session, gorunenAd });
    }
    sb.auth.getSession().then(({ data }) => yukle(data.session));
    // Geri çağrının içinde başka Supabase çağrısı beklemek kilitlenmeye yol açabiliyor — bir sonraki tura bırak.
    const { data: abone } = sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => yukle(session), 0); });
    return () => { iptal = true; abone.subscription.unsubscribe(); };
  }, []);
  return o;
}

export type HesapSonuc = { tamam: true; baskaKullanici: boolean } | { tamam: false; hata: string };

// Tek cihaz = tek kişi: bu cihazda daha önce başka bir hesapla giriş yapılmışsa uyar.
async function kullaniciKontrol(id: string): Promise<boolean> {
  const son = await db.ayar.get(SON_KULLANICI);
  const baska = !!son && son.deger !== id;
  return baska;
}

export async function kullaniciOnayla(id: string) {
  await db.ayar.put({ anahtar: SON_KULLANICI, deger: id });
}

export async function kayitOl(gorunenAd: string, eposta: string, sifre: string): Promise<HesapSonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const r = await sb.auth.signUp({ email: eposta.trim(), password: sifre });
  if (r.error) {
    if (/registered|already/i.test(r.error.message)) return { tamam: false, hata: 'Bu e-postayla bir hesap var — giriş yap.' };
    return { tamam: false, hata: r.error.message };
  }
  const uid = r.data.user?.id;
  if (!uid || !r.data.session) return { tamam: false, hata: 'Kayıt tamamlanamadı (e-posta doğrulaması açık olabilir).' };
  const p = await sb.from('cat_profil').insert({ id: uid, gorunen_ad: gorunenAd.trim(), eposta: eposta.trim().toLowerCase() });
  if (p.error) return { tamam: false, hata: p.error.message };
  const baskaKullanici = await kullaniciKontrol(uid);
  if (!baskaKullanici) await kullaniciOnayla(uid);
  return { tamam: true, baskaKullanici };
}

export async function girisYap(eposta: string, sifre: string): Promise<HesapSonuc> {
  const sb = supabase();
  if (!sb) return { tamam: false, hata: 'Sunucu ayarı yok' };
  if (!navigator.onLine) return { tamam: false, hata: 'İnternet yok' };
  const r = await sb.auth.signInWithPassword({ email: eposta.trim(), password: sifre });
  if (r.error || !r.data.user) return { tamam: false, hata: 'E-posta ya da şifre hatalı.' }; // G3: hangi alan olduğu söylenmez
  const baskaKullanici = await kullaniciKontrol(r.data.user.id);
  if (!baskaKullanici) await kullaniciOnayla(r.data.user.id);
  return { tamam: true, baskaKullanici };
}

export async function cikisYap() {
  await supabase()?.auth.signOut();
}

export async function gorunenAdDegistir(uid: string, ad: string) {
  await supabase()?.from('cat_profil').update({ gorunen_ad: ad.trim() }).eq('id', uid);
}

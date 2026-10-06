'use client';

// ————————————————————————————————————————————————————————————————
// Dış uygulama kartları (2 ekim). Aynı Supabase'i kullanan bir uygulama kullanıcıya düşen görevi
// cat_dis_kart'a yazar; Ritos onu ajandaya bağlı bir kart olarak koyar (koçun kartı gibi: içerik
// ve günü uygulama yönetir). Kullanıcı işaretleyince / değer girince sonuç aynı satıra geri yazılır.
// Bkz. supabase/cat-10-dis-kart.sql.
// ————————————————————————————————————————————————————————————————

import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { db, type AjandaKartRow } from './db';
import { eskiSupabase } from './supabase';
import { metindenBelge } from './belge';
import { HAZIR_OLCULER, OLC_ONEK } from './olcum';
import type { Blok, Izinler } from './paket';

interface DisKart {
  id: string; kaynak: string; dis_id: string | null; ad: string; aciklama: string | null; video: string | null;
  tarih: string; saat: string | null; hatirlat_dk: number | null; sure: boolean; olcu_ad: string | null; olcu_birim: string | null;
  durum: 'aktif' | 'iptal'; guncellendi: string;
}

const DIS_IZIN: Izinler = { ac: true, duzenle: false, sil: false, gun_degistir: false, sirala: true, duzeltme_gun: null };
const imlecAnahtari = (uid: string) => `ritos-dis-imlec-${uid}`;
const sonucAnahtari = (uid: string) => `ritos-dis-sonuc-${uid}`;

function olcuAnahtari(ad: string) {
  const h = HAZIR_OLCULER.find((x) => x.ad.toLocaleLowerCase('tr') === ad.trim().toLocaleLowerCase('tr'));
  if (h) return OLC_ONEK + h.id;
  return OLC_ONEK + 'd-' + ad.trim().toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]+/g, '-');
}

function bloklar(r: DisKart): Blok[] {
  const b: Blok[] = [];
  if (r.aciklama?.trim()) b.push({ tur: 'belge', belge: metindenBelge(r.aciklama) });
  if (r.video?.trim()) b.push(/youtu\.?be|instagram/.test(r.video) ? { tur: 'video', url: r.video.trim() } : { tur: 'baglanti', url: r.video.trim() });
  if (r.sure) b.push({ tur: 'sayi', anahtar: 'sure_dk', etiket: 'Kaç dakika?', birim: 'dk' });
  if (r.olcu_ad?.trim()) b.push({ tur: 'sayi', anahtar: olcuAnahtari(r.olcu_ad), etiket: r.olcu_ad.trim(), ...(r.olcu_birim ? { birim: r.olcu_birim } : {}) });
  return b;
}

let cekiliyor = false;
/** Yeni / değişen satırları çekip ajandaya koyar. */
export async function disKartCek() {
  const sb = eskiSupabase();
  if (!sb || cekiliyor) return;
  const { data: o } = await sb.auth.getSession();
  const uid = o.session?.user.id;
  if (!uid) return;
  cekiliyor = true;
  try {
    let imlec = '1970-01-01T00:00:00Z';
    try { imlec = localStorage.getItem(imlecAnahtari(uid)) ?? imlec; } catch { /* yoksay */ }
    const { data, error } = await sb.from('cat_dis_kart').select('id, kaynak, dis_id, ad, aciklama, video, tarih, saat, hatirlat_dk, sure, olcu_ad, olcu_birim, durum, guncellendi')
      .gt('guncellendi', imlec).order('guncellendi').limit(500);
    if (error || !data?.length) return;
    let sira = (await db.ajanda_kart.toArray()).reduce((m, k) => Math.max(m, k.sira), 0);
    for (const r of data as DisKart[]) {
      const mevcut = await db.ajanda_kart.get(r.id);
      if (r.durum === 'iptal') {
        if (mevcut) {
          const kayit = await db.ajanda_kayit.get(`${r.id}|${mevcut.baslangic}`);
          if (!kayit?.yapildi) { await db.ajanda_kart.delete(r.id); if (kayit) await db.ajanda_kayit.delete(kayit.id); }
        }
        continue;
      }
      const satir: AjandaKartRow = {
        id: r.id, tip: 'yap', ad: r.ad, bloklar: bloklar(r),
        baslangic: r.tarih, bitis: r.tarih, gunler: null, saatler: r.saat ? [r.saat] : [],
        hatirlatma: r.hatirlat_dk == null ? null : r.saat ? { gun: 0, dk: r.hatirlat_dk } : { gun: 0, saat: '09:00' },
        kaynak_modul: 'dis', kaynak_ref: `dis:${r.kaynak}:${r.dis_id ?? r.id}`, kaynak_etiket: r.kaynak,
        sahip: 'dis', izinler: DIS_IZIN, geri_bildirim: 'yerel',
        sira: mevcut?.sira ?? ++sira, guncellendi: Date.now(),
      };
      await db.ajanda_kart.put(satir);
    }
    try { localStorage.setItem(imlecAnahtari(uid), (data[data.length - 1] as DisKart).guncellendi); } catch { /* yoksay */ }
  } finally { cekiliyor = false; }
}

/** Dış kartların sonucunu (yapıldı, zaman, değerler) satıra geri yazar — yalnız değişenleri. */
export async function disSonucGonder() {
  const sb = eskiSupabase();
  if (!sb) return;
  const { data: o } = await sb.auth.getSession();
  const uid = o.session?.user.id;
  if (!uid) return;
  const kartlar = await db.ajanda_kart.where('kaynak_modul').equals('dis').toArray();
  if (!kartlar.length) return;
  let onceki: Record<string, string> = {};
  try { onceki = JSON.parse(localStorage.getItem(sonucAnahtari(uid)) || '{}'); } catch { /* yoksay */ }
  const yeni: Record<string, string> = {};
  for (const k of kartlar) {
    const r = await db.ajanda_kayit.get(`${k.id}|${k.baslangic}`);
    const s = { yapildi: !!r?.yapildi, yapildi_zaman: r?.yapildi && r.zaman ? new Date(r.zaman).toISOString() : null, degerler: r?.degerler ?? null };
    const imza = JSON.stringify(s);
    yeni[k.id] = imza;
    if (onceki[k.id] === imza) continue;
    if (!onceki[k.id] && !s.yapildi && !s.degerler) continue; // hiç dokunulmamış
    const u = await sb.from('cat_dis_kart').update({ ...s, sonuc_zamani: new Date().toISOString() }).eq('id', k.id);
    if (u.error) yeni[k.id] = onceki[k.id] ?? '';
  }
  try { localStorage.setItem(sonucAnahtari(uid), JSON.stringify(yeni)); } catch { /* yoksay */ }
}

/** Uygulama düzeyinde: açılışta, görünür olunca ve 2 dk'da bir çek; işaretler değişince sonucu yaz. */
export function useDisKartlar() {
  useEffect(() => {
    void disKartCek();
    const iv = setInterval(() => { void disKartCek(); }, 2 * 60_000);
    const gor = () => { if (document.visibilityState === 'visible') void disKartCek(); };
    document.addEventListener('visibilitychange', gor);
    let zm: ReturnType<typeof setTimeout> | null = null;
    const ab = liveQuery(() => db.ajanda_kayit.toArray()).subscribe({
      next: () => { if (zm) clearTimeout(zm); zm = setTimeout(() => { void disSonucGonder(); }, 1500); },
      error: () => {},
    });
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', gor); ab.unsubscribe(); if (zm) clearTimeout(zm); };
  }, []);
}

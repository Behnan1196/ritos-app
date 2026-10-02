'use client';

// ————————————————————————————————————————————————————————————————
// Bildirimler (2 ekim) — Web Push. Bildirimler Supabase'deki cat_bildirim kuyruğundan
// 'ritos-bildirim' Edge Function'ı tarafından gönderilir (bkz. supabase/cat-09-bildirim.sql).
// Bu dosya: cihaz aboneliği, test, kaynakların aç/kapat'ı ve Ritos kart hatırlatmalarını
// kuyruğa yazan planlayıcı.
// ————————————————————————————————————————————————————————————————

import { useEffect } from 'react';
import { liveQuery } from 'dexie';
import { db } from './db';
import { supabase } from './supabase';
import { gorunur } from './ajanda';
import { bugun, tarihEkle, tarihParse } from './paket';

// Açık VAPID anahtarı (gizli değil; gizlisi yalnız Edge Function secret'ında).
const VAPID_ACIK = 'BKWYBbngjR3zUSXsuFOMLA4eB1SbFkRKCSkkfmyh8CEYuHzcRdGMxony65n_VQCq_EPBWumLy83u4bTKub9SJy0';

export type BildirimDurum = 'desteklenmiyor' | 'ana-ekran' | 'reddedildi' | 'kapali' | 'acik';

function b64(s: string) {
  const p = '='.repeat((4 - (s.length % 4)) % 4);
  const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
}
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const anaEkranda = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function bildirimDurumu(): Promise<BildirimDurum> {
  if (typeof window === 'undefined') return 'desteklenmiyor';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios() && !anaEkranda() ? 'ana-ekran' : 'desteklenmiyor';
  if (Notification.permission === 'denied') return 'reddedildi';
  const reg = await navigator.serviceWorker.getRegistration();
  const ab = await reg?.pushManager.getSubscription();
  return ab && Notification.permission === 'granted' ? 'acik' : 'kapali';
}

/** Bu cihazda bildirimleri açar (izin ister, abone olur, aboneliği Supabase'e yazar). */
export async function bildirimAc(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Bağlantı yok';
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') return 'İzin verilmedi';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let ab = await reg.pushManager.getSubscription();
  if (!ab) ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID_ACIK) });
  const j = ab.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const cihaz = /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'Bilgisayar';
  const r = await sb.from('cat_push_abone').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, cihaz });
  return r.error ? r.error.message : null;
}

export async function bildirimKapat() {
  const reg = await navigator.serviceWorker.getRegistration();
  const ab = await reg?.pushManager.getSubscription();
  if (!ab) return;
  await supabase()?.from('cat_push_abone').delete().eq('endpoint', ab.endpoint);
  await ab.unsubscribe();
}

export async function testBildirimi(): Promise<string | null> {
  const r = await supabase()?.from('cat_bildirim').insert({ kaynak: 'ritos', baslik: 'Ritos', metin: 'Test bildirimi ✓ — kuyruk çalışıyor', ac: '/' });
  return r?.error ? r.error.message : null;
}

export interface KaynakDurum { kaynak: string; acik: boolean }
export async function kaynaklar(): Promise<KaynakDurum[]> {
  const sb = supabase();
  if (!sb) return [];
  const [b, k] = await Promise.all([
    sb.from('cat_bildirim').select('kaynak').order('olusturuldu', { ascending: false }).limit(300),
    sb.from('cat_bildirim_kaynak').select('kaynak, acik'),
  ]);
  const ad = new Set<string>(['ritos', ...(b.data ?? []).map((x) => x.kaynak as string), ...(k.data ?? []).map((x) => x.kaynak as string)]);
  return Array.from(ad).map((kaynak) => ({ kaynak, acik: (k.data ?? []).find((x) => x.kaynak === kaynak)?.acik ?? true }));
}
export async function kaynakAyarla(kaynak: string, acik: boolean) {
  await supabase()?.from('cat_bildirim_kaynak').upsert({ kaynak, acik });
}

// ———————— Ritos kart hatırlatmaları → kuyruk ————————
// 🔔 ayarlı kartların önümüzdeki 8 günlük bildirimleri kuyruğa yazılır (anahtar: kart:<id>:<gün>);
// kart değişince, silinince ya da yapıldı işaretlenince plan yenilenir. Kart içerikleri şifreli
// kalır; kuyruğa yalnız başlık (ya da tercihe göre nötr metin) gider.
const ADI_GOSTER = 'ritos-bildirim-kart-adi';
const SON_PLAN = 'ritos-bildirim-son-plan';
export function kartAdiGoster(): boolean { try { return localStorage.getItem(ADI_GOSTER) !== '0'; } catch { return true; } }
export function kartAdiAyarla(v: boolean) { try { localStorage.setItem(ADI_GOSTER, v ? '1' : '0'); localStorage.removeItem(SON_PLAN); } catch { /* yoksay */ } void hatirlatmalariPlanla(); }

const PENCERE = 8;
function zamanHesapla(t: string, h: { gun: number; dk?: number | null; saat?: string | null }, kartSaat?: string): Date {
  const d = tarihParse(tarihEkle(t, -h.gun));
  const saat = h.gun === 0 && kartSaat ? kartSaat : h.saat ?? (h.gun === 0 ? '09:00' : '20:00');
  const [hh, mm] = saat.split(':').map(Number);
  d.setHours(hh || 0, mm || 0, 0, 0);
  if (h.gun === 0 && kartSaat && h.dk) d.setMinutes(d.getMinutes() - h.dk);
  return d;
}

let calisiyor = false;
export async function hatirlatmalariPlanla() {
  const sb = supabase();
  if (!sb || calisiyor) return;
  const { data: oturum } = await sb.auth.getSession();
  if (!oturum.session) return;
  calisiyor = true;
  try {
    const t0 = bugun(), simdi = Date.now(), ust = simdi + PENCERE * 86400_000;
    const adi = kartAdiGoster();
    const kartlar = (await db.ajanda_kart.toArray()).filter((k) => k.hatirlatma);
    const kayitlar = await db.ajanda_kayit.where('tarih').aboveOrEqual(t0).toArray();
    const yapildi = new Set(kayitlar.filter((r) => r.yapildi).map((r) => r.id));
    const satirlar: { kaynak: string; anahtar: string; baslik: string; metin: string; ac: string; gonder_zamani: string; gonderildi: null }[] = [];
    for (const k of kartlar) {
      const h = k.hatirlatma!;
      for (let i = 0; i <= PENCERE + h.gun; i++) {
        const t = tarihEkle(t0, i);
        if (!gorunur(k, t) || yapildi.has(`${k.id}|${t}`)) continue;
        const z = zamanHesapla(t, h, k.saatler[0]);
        if (z.getTime() <= simdi || z.getTime() > ust) continue;
        const ne = h.gun > 0 ? (h.gun === 7 ? '1 hafta sonra' : `${h.gun} gün sonra`) : k.saatler[0] ? `⏰ ${k.saatler[0]}` : 'Bugün';
        satirlar.push({
          kaynak: 'ritos', anahtar: `kart:${k.id}:${t}`,
          baslik: adi ? k.ad : 'Ritos', metin: adi ? ne : 'Ajandanda bir kart var',
          ac: '/', gonder_zamani: z.toISOString(), gonderildi: null,
        });
      }
    }
    const imza = JSON.stringify(satirlar.map((s) => [s.anahtar, s.gonder_zamani, s.baslik, s.metin]));
    let onceki: string | null = null;
    try { onceki = localStorage.getItem(SON_PLAN); } catch { /* yoksay */ }
    if (onceki === imza) return;
    // Artık planda olmayan, gönderilmemiş kart bildirimlerini sil; yenileri yaz/güncelle.
    const { data: mevcut } = await sb.from('cat_bildirim').select('id, anahtar').eq('kaynak', 'ritos').is('gonderildi', null).like('anahtar', 'kart:%');
    const yeni = new Set(satirlar.map((s) => s.anahtar));
    const silinecek = (mevcut ?? []).filter((m) => !yeni.has(m.anahtar as string)).map((m) => m.id as string);
    if (silinecek.length) await sb.from('cat_bildirim').delete().in('id', silinecek);
    if (satirlar.length) {
      const r = await sb.from('cat_bildirim').upsert(satirlar, { onConflict: 'alici,anahtar' });
      if (r.error) return;
    }
    try { localStorage.setItem(SON_PLAN, imza); } catch { /* yoksay */ }
  } finally { calisiyor = false; }
}

/** Uygulama düzeyinde bir kez: açılışta, 30 dk'da bir ve kart/kayıt değişince planı yeniler. */
export function useBildirimPlani() {
  useEffect(() => {
    let zm: ReturnType<typeof setTimeout> | null = null;
    const tetikle = () => { if (zm) clearTimeout(zm); zm = setTimeout(() => { void hatirlatmalariPlanla(); }, 2500); };
    const ab = liveQuery(() => Promise.all([db.ajanda_kart.toArray(), db.ajanda_kayit.where('tarih').aboveOrEqual(bugun()).toArray()])).subscribe({ next: tetikle, error: () => {} });
    const iv = setInterval(tetikle, 30 * 60_000);
    const gor = () => { if (document.visibilityState === 'visible') tetikle(); };
    document.addEventListener('visibilitychange', gor);
    return () => { ab.unsubscribe(); clearInterval(iv); document.removeEventListener('visibilitychange', gor); if (zm) clearTimeout(zm); };
  }, []);
}

'use client';

// ————————————————————————————————————————————————————————————————
// Kart sayaçları (2 ekim) — süre kaydı için zamanlayıcı. Sayaç pencereye değil KARTA bağlıdır:
// yalnız başlama anı saklanır, geçen süre her an ondan hesaplanır. Pencereyi kapatmak, sekme
// değiştirmek, uygulamayı kapatıp açmak sayacı durdurmaz. Her "kart|gün" için ayrı sayaç —
// aynı anda birden fazla çalışabilir. Yalnız bu cihazda (localStorage); bitince kaydedilen
// süre zaten eşitlenir.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';

export interface Sayac {
  bas: number | null;   // çalışıyorsa başlama anı (epoch ms); duraklatılmışsa null
  birikmis: number;     // önceki çalışmalardan biriken saniye
  hedef: number | null; // hedef saniye (geri sayım); null = serbest
  doldu?: boolean;      // hedef süre doldu (otomatik durdu)
}
type Depo = Record<string, Sayac>;

const ANAHTAR = 'ritos-sayaclar';
const OLAY = 'ritos-sayac';

function oku(): Depo {
  try { return JSON.parse(localStorage.getItem(ANAHTAR) || '{}') as Depo; } catch { return {}; }
}
function yaz(d: Depo) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(d)); } catch { /* yoksay */ }
  window.dispatchEvent(new Event(OLAY));
}

export const sayacAnahtari = (kartId: string, tarih: string) => `${kartId}|${tarih}`;

/** Geçen saniye (hedefi aşmaz). */
export function gecen(s: Sayac, simdi = Date.now()): number {
  const g = s.birikmis + (s.bas ? Math.floor((simdi - s.bas) / 1000) : 0);
  return s.hedef ? Math.min(g, s.hedef) : g;
}
/** Gösterilecek süre: hedef varsa kalan, yoksa geçen. */
export function sayacMetni(s: Sayac, simdi = Date.now()): string {
  const g = gecen(s, simdi);
  const v = s.hedef ? Math.max(0, s.hedef - g) : g;
  const sa = Math.floor(v / 3600), dk = Math.floor((v % 3600) / 60), sn = v % 60;
  return `${sa ? `${sa}:${String(dk).padStart(2, '0')}` : dk}:${String(sn).padStart(2, '0')}`;
}

export function sayacBaslat(k: string, hedefDk: number) {
  sesAc();
  const d = oku();
  const s = d[k];
  if (s && s.bas) return;
  if (s && s.doldu) return;
  d[k] = { bas: Date.now(), birikmis: s?.birikmis ?? 0, hedef: s?.hedef ?? (hedefDk > 0 ? hedefDk * 60 : null) };
  yaz(d);
}
export function sayacDuraklat(k: string) {
  const d = oku();
  const s = d[k];
  if (!s || !s.bas) return;
  d[k] = { ...s, birikmis: gecen(s), bas: null };
  yaz(d);
}
/** Sayacı kaldırır ve geçen dakikayı döner (en az 1). */
export function sayacBitir(k: string): number {
  const d = oku();
  const s = d[k];
  const dk = s ? Math.max(1, Math.round(gecen(s) / 60)) : 0;
  delete d[k];
  yaz(d);
  return dk;
}
export function sayacSil(k: string) {
  const d = oku();
  delete d[k];
  yaz(d);
}

/** Tüm sayaçları canlı izler; çalışan varsa saniyede bir yeniler. */
export function useSayaclar(): Depo {
  const [d, setD] = useState<Depo>({});
  const [, setTik] = useState(0);
  useEffect(() => {
    const yenile = () => setD(oku());
    yenile();
    window.addEventListener(OLAY, yenile);
    window.addEventListener('storage', yenile);
    return () => { window.removeEventListener(OLAY, yenile); window.removeEventListener('storage', yenile); };
  }, []);
  const calisan = Object.values(d).some((s) => s.bas);
  useEffect(() => {
    if (!calisan) return;
    const t = setInterval(() => setTik((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [calisan]);
  return d;
}
export function useSayac(k: string): Sayac | null {
  return useSayaclar()[k] ?? null;
}

/** Uygulama düzeyinde bir kez: hedefi dolan sayacı durdurur, titreşim + bip. */
export function useSayacIzleyici() {
  useEffect(() => {
    const kontrol = () => {
      const d = oku();
      let degisti = false;
      for (const [k, s] of Object.entries(d)) {
        if (s.bas && s.hedef && gecen(s) >= s.hedef) {
          d[k] = { ...s, bas: null, birikmis: s.hedef, doldu: true };
          degisti = true;
        }
      }
      if (degisti) { yaz(d); bitisUyarisi(); }
    };
    kontrol();
    const t = setInterval(kontrol, 1000);
    return () => clearInterval(t);
  }, []);
}

// Ses: iOS yalnız bir dokunuşla açılan ses bağlamında çalar — bağlam "Başlat"ta açılır.
let sesBaglami: AudioContext | null = null;
function sesAc() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sesBaglami) sesBaglami = new Ctx();
    void sesBaglami.resume();
  } catch { /* ses yok */ }
}
function bitisUyarisi() {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* yok */ }
  try {
    const ctx = sesBaglami;
    if (!ctx) return;
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.26);
    });
  } catch { /* ses yok */ }
}

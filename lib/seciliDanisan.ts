// Koçun o an çalıştığı danışan (28 eylül). Ajanda (sol) ile danışmanlık ekranı (sağ) aynı seçimi
// paylaşır: sağda danışan seçilince solda onun Ajanda'sı açılır. Oturum boyunca korunur.
import { useEffect, useState } from 'react';

const ANAH = 'ritos-ajanda-kisi';
const dinleyiciler = new Set<(v: string) => void>();
let deger: string | null = null;

function oku(): string {
  if (deger === null) { try { deger = sessionStorage.getItem(ANAH) ?? ''; } catch { deger = ''; } }
  return deger;
}

export function seciliDanisanAyarla(v: string) {
  deger = v;
  try { sessionStorage.setItem(ANAH, v); } catch { /* yok say */ }
  dinleyiciler.forEach((f) => f(v));
}

export function useSeciliDanisan(): [string, (v: string) => void] {
  const [v, setV] = useState('');
  useEffect(() => { setV(oku()); dinleyiciler.add(setV); return () => { dinleyiciler.delete(setV); }; }, []);
  return [v, seciliDanisanAyarla];
}

// Seçili hedef — iki kapsam (5 ekim): Çevrem (danışan / grup üyesi) ve Rutinlerim ("p:<program>").
// Program kimlikleri "p:" ile başlar; seçim kendi kapsamının anahtarına yazılır. Oturum boyunca korunur.
import { useEffect, useState } from 'react';

export type Kapsam = 'cevre' | 'kendim';
const ANAH: Record<Kapsam, string> = { cevre: 'ritos-ajanda-kisi', kendim: 'ritos-secili-rutin' };
const dinleyiciler: Record<Kapsam, Set<(v: string) => void>> = { cevre: new Set(), kendim: new Set() };
const deger: Record<Kapsam, string | null> = { cevre: null, kendim: null };
const kapsamOf = (v: string): Kapsam => (v.startsWith('p:') ? 'kendim' : 'cevre');

function oku(k: Kapsam): string {
  if (deger[k] === null) { try { deger[k] = sessionStorage.getItem(ANAH[k]) ?? ''; } catch { deger[k] = ''; } }
  return deger[k]!;
}

export function seciliDanisanAyarla(v: string, k: Kapsam = kapsamOf(v)) {
  deger[k] = v;
  try { sessionStorage.setItem(ANAH[k], v); } catch { /* yok say */ }
  dinleyiciler[k].forEach((f) => f(v));
}

export function useSeciliDanisan(k: Kapsam = 'cevre'): [string, (v: string) => void] {
  const [v, setV] = useState('');
  useEffect(() => { setV(oku(k)); dinleyiciler[k].add(setV); return () => { dinleyiciler[k].delete(setV); }; }, [k]);
  return [v, (x: string) => seciliDanisanAyarla(x, k)];
}

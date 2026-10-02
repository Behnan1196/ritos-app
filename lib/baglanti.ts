// ————————————————————————————————————————————————————————————————
// Bağlantı widget'ları (2 ekim). Kendi uygulamanın bir sayfası Home'da iframe içinde gösterilir.
// Ritos sayfanın verisini görmez ve saklamaz; sayfadaki form doğrudan o uygulamanın sunucusuna
// gider. Ritos yalnız adresi saklar ve açılışta yer tutucuları doldurur:
//   {tarih} → bugün (YYYY-MM-DD) · {hafta} → bu haftanın pazartesisi · {tema} → acik
// Sayfa Ritos'a postMessage ile şunları söyleyebilir:
//   { ritos: 'yukseklik', h: 320 }  → widget yüksekliği
//   { ritos: 'buyut' }              → büyük aç
// ————————————————————————————————————————————————————————————————

import { db, type BaglantiRow } from './db';
import { bugun, tarihEkle, tarihParse } from './paket';

export const BOY_PX: Record<BaglantiRow['boy'], number> = { k: 160, o: 300, b: 460 };

export async function baglantilar(): Promise<BaglantiRow[]> {
  return (await db.baglanti.toArray()).sort((a, b) => a.sira - b.sira);
}

export async function baglantiKaydet(b: Omit<BaglantiRow, 'id' | 'sira' | 'guncellendi'> & { id?: string }) {
  const mevcut = b.id ? await db.baglanti.get(b.id) : undefined;
  const sira = mevcut?.sira ?? (await db.baglanti.count());
  await db.baglanti.put({ id: b.id ?? crypto.randomUUID(), ad: b.ad.trim(), url: b.url.trim(), boy: b.boy, sira, guncellendi: Date.now() });
}

export async function baglantiSil(id: string) {
  await db.baglanti.delete(id);
}

export function urlDoldur(url: string): string {
  const t = bugun();
  const hafta = tarihEkle(t, -((tarihParse(t).getDay() + 6) % 7));
  return url.replace(/\{tarih\}/g, t).replace(/\{hafta\}/g, hafta).replace(/\{tema\}/g, 'acik');
}

export function urlGecerli(url: string): boolean {
  try { const u = new URL(url.replace(/\{\w+\}/g, 'x')); return u.protocol === 'https:' || u.hostname === 'localhost'; } catch { return false; }
}

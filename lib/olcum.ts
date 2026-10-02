// ————————————————————————————————————————————————————————————————
// Ölçüm katmanı (28 eylül).
// Kart bir kapıdır: "bugün kilonu gir". Değer kartta kalmaz, ölçü serisine yazılır.
// Aynı ölçü (ör. Kilo) kişinin kendi kartından da, koçun/diyetisyenin kartından da gelse
// tek seride birikir — bir giriş, iki görünüm (kişinin Ölçümlerim'i + koçun danışan dosyası).
// Değerlendirme/hesap karta değil seriye ya da alan paketine aittir.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type OlcuTanimRow, type OlcumRow } from './db';
import type { Blok } from './paket';

export const OLC_ONEK = 'olc:';

// Hazır ölçüler — anahtarları sabittir; koçun şablonu 'olc:kilo' dediğinde danışanın
// "Kilo" serisine yazılır. Liste kısa tutulur; gerisini kişi kendi tanımlar.
export const HAZIR_OLCULER: Omit<OlcuTanimRow, 'guncellendi'>[] = [
  { id: 'kilo', ad: 'Kilo', birim: 'kg' },
  { id: 'bel', ad: 'Bel çevresi', birim: 'cm' },
  { id: 'kalca', ad: 'Kalça çevresi', birim: 'cm' },
  { id: 'uyku', ad: 'Uyku', birim: 'saat' },
  { id: 'su', ad: 'Su', birim: 'bardak' },
  { id: 'adim', ad: 'Adım', birim: 'adım' },
  { id: 'ruh_hali', ad: 'Ruh hali', birim: '1–5' },
  { id: 'enerji', ad: 'Enerji', birim: '1–5' },
];

export async function olculer(): Promise<OlcuTanimRow[]> {
  const kisisel = await db.olcu_tanim.toArray();
  const hazir = HAZIR_OLCULER.map((h) => ({ ...h, guncellendi: 0 }));
  return [...hazir, ...kisisel.filter((k) => !hazir.some((h) => h.id === k.id))];
}

export async function olcuEkle(ad: string, birim: string): Promise<OlcuTanimRow> {
  const t: OlcuTanimRow = { id: `k-${crypto.randomUUID()}`, ad: ad.trim(), birim: birim.trim(), guncellendi: Date.now() };
  await db.olcu_tanim.put(t);
  return t;
}

export type OlcuBicim = 'sayi' | 'olcek' | 'adet';
export const olcuBlok = (t: Pick<OlcuTanimRow, 'id' | 'ad' | 'birim'> & { bicim?: OlcuBicim; hedef?: number | null }): Blok =>
  ({
    tur: 'sayi', anahtar: `${OLC_ONEK}${t.id}`, etiket: t.ad, ...(t.birim ? { birim: t.birim } : {}),
    ...(t.bicim && t.bicim !== 'sayi' ? { bicim: t.bicim } : {}), ...(t.bicim === 'adet' && t.hedef ? { hedef: t.hedef } : {}),
  });

// Hazır ölçülerin varsayılan giriş biçimi: su adetle (hedef 8), ruh hali/enerji 1–5 ölçekle.
export function varsayilanBicim(id: string): { bicim: OlcuBicim; hedef: number | null } {
  if (id === 'su') return { bicim: 'adet', hedef: 8 };
  if (id === 'ruh_hali' || id === 'enerji') return { bicim: 'olcek', hedef: null };
  return { bicim: 'sayi', hedef: null };
}

export const olcuBloklari = (bloklar: Blok[]) =>
  bloklar.filter((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi' && b.anahtar.startsWith(OLC_ONEK));

/** Kartta girilen değerlerden ölçü satırları. Tanımı bilinmeyen ölçü (koçun kişisel ölçüsü) bloktan tanımlanır. */
export async function olcumYaz(kart: AjandaKartRow, tarih: string, degerler: Record<string, unknown>) {
  const bloklar = olcuBloklari(kart.bloklar);
  if (!bloklar.length) return;
  const zaman = Date.now();
  await db.transaction('rw', db.olcum, db.olcu_tanim, async () => {
    for (const b of bloklar) {
      const olcuId = b.anahtar.slice(OLC_ONEK.length);
      const id = `${kart.id}|${tarih}|${olcuId}`;
      const v = degerler[b.anahtar];
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
      if (!Number.isFinite(n)) { await db.olcum.delete(id); continue; }
      if (!HAZIR_OLCULER.some((h) => h.id === olcuId) && !(await db.olcu_tanim.get(olcuId))) {
        await db.olcu_tanim.put({ id: olcuId, ad: b.etiket, birim: b.birim ?? '', guncellendi: zaman });
      }
      await db.olcum.put({ id, olcu_id: olcuId, tarih, deger: n, kart_id: kart.id, kaynak: kart.geri_bildirim !== 'yok' ? kart.kaynak_etiket : null, zaman });
    }
  });
}

/** İşaret geri alınınca o günün ölçüleri de geri alınır. */
export async function olcumSil(kartId: string, tarih: string) {
  await db.olcum.where('kart_id').equals(kartId).filter((o) => o.tarih === tarih).delete();
}

export interface OlcuOzeti {
  tanim: OlcuTanimRow;
  seri: OlcumRow[]; // tarih sırasına göre (eskiden yeniye)
  son: OlcumRow;
  onceki: OlcumRow | null;
}

/** Değeri olan her ölçünün serisi — son girilen en üstte. Aynı günde birden çok değer varsa sonuncusu. */
export async function olcuOzetleri(): Promise<OlcuOzeti[]> {
  const [tanimlar, tum] = await Promise.all([olculer(), db.olcum.toArray()]);
  const gruplar = new Map<string, Map<string, OlcumRow>>();
  for (const o of tum) {
    const g = gruplar.get(o.olcu_id) ?? new Map<string, OlcumRow>();
    const v = g.get(o.tarih);
    if (!v || v.zaman < o.zaman) g.set(o.tarih, o);
    gruplar.set(o.olcu_id, g);
  }
  const sonuc: OlcuOzeti[] = [];
  for (const [olcuId, g] of Array.from(gruplar.entries())) {
    const tanim = tanimlar.find((t) => t.id === olcuId) ?? { id: olcuId, ad: olcuId, birim: '', guncellendi: 0 };
    const seri = Array.from(g.values()).sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.zaman - b.zaman));
    sonuc.push({ tanim, seri, son: seri[seri.length - 1], onceki: seri.length > 1 ? seri[seri.length - 2] : null });
  }
  return sonuc.sort((a, b) => b.son.zaman - a.son.zaman);
}

export const sayiMetin = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

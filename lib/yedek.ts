'use client';

// Yedek dosyası (S1): açık olan veritabanının tamamı, kullanıcının parolasıyla cihazda
// şifrelenip tek dosya olarak iner. Kullanıcı dosyayı kendi bulutuna koyar; Ritos görmez.

import { SENKRON_TABLOLARI, db } from './db';
import { parolaylaCoz, parolaylaSifrele } from './sifre';
import { bugun } from './paket';

const SON_YEDEK = 'son_yedek';

type YedekIcerik = { surum: 1; alindi: number; tablolar: Record<string, unknown[]> };

export async function yedekAl(parola: string) {
  const tablolar: Record<string, unknown[]> = {};
  for (const t of SENKRON_TABLOLARI) tablolar[t] = await db.table(t).toArray();
  const icerik: YedekIcerik = { surum: 1, alindi: Date.now(), tablolar };
  const metin = await parolaylaSifrele(icerik, parola);
  const url = URL.createObjectURL(new Blob([metin], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ritos-yedek-${bugun()}.ritos`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  await db.ayar.put({ anahtar: SON_YEDEK, deger: Date.now() });
}

export async function sonYedek(): Promise<number | null> {
  return ((await db.ayar.get(SON_YEDEK))?.deger as number | undefined) ?? null;
}

/** Dosyayı çöz; doğruysa özetini döndür (henüz yazmaz). */
export async function yedekOku(dosya: File, parola: string): Promise<{ icerik: YedekIcerik; ozet: string }> {
  let icerik: YedekIcerik;
  try {
    icerik = await parolaylaCoz<YedekIcerik>(await dosya.text(), parola);
  } catch {
    throw new Error('Dosya açılamadı — parola yanlış ya da dosya Ritos yedeği değil.');
  }
  const n = (t: string) => icerik.tablolar[t]?.length ?? 0;
  const ozet = `${new Date(icerik.alindi).toLocaleDateString('tr-TR')} tarihli yedek · ${n('ajanda_kart')} Ajanda kartı · ${n('program')} program · ${n('gelen')} gelen`;
  return { icerik, ozet };
}

/** Açık veritabanının içeriğini yedekle değiştir. Hesaplıysa silme ve eklemeler senkronlanır. */
export async function yedegiYukle(icerik: YedekIcerik) {
  const tablolar = SENKRON_TABLOLARI.map((t) => db.table(t));
  await db.transaction('rw', tablolar, async () => {
    for (const t of SENKRON_TABLOLARI) {
      const tablo = db.table(t);
      // clear() kancaları tetiklemez; tek tek silmek senkronun da silmeyi görmesini sağlar.
      await tablo.bulkDelete(await tablo.toCollection().primaryKeys());
      const satirlar = icerik.tablolar[t] ?? [];
      if (satirlar.length) await tablo.bulkPut(satirlar);
    }
  });
}

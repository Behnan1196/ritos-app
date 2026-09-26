'use client';

// ————————————————————————————————————————————————————————————————
// Yaşam alanları + klasörler (K3 revizyonu, 26 eylül).
//
// En üst düzey = yaşam alanı: adını ve sayısını kullanıcı belirler (PERMA, Wheel of Life ya da
// kendi sınıflaması). Kriterler ve öz değerlendirme alandadır — alanların birlikte görünümü
// kişinin dengesini gösterir. Alanın altında programlar doğrudan ya da klasörler içinde durur
// (en fazla 3 seviye: alan → klasör → alt klasör). Hiçbir alana bağlı olmayan program "Alansız"dır.
// ————————————————————————————————————————————————————————————————

import { db, type AlanDegerlendirmeRow, type KlasorRow } from './db';

export const EN_FAZLA_SEVIYE = 3;
export const DEGER_ETIKET = ['Berbat', 'Zayıf', 'Orta', 'İyi', 'Çok iyi'];

export const alanMi = (k: KlasorRow) => k.tur === 'alan' || (k.tur === undefined && k.ust_id === null);

/** Bir klasörün seviyesi (alan = 1). */
export function seviye(k: KlasorRow, hepsi: KlasorRow[]): number {
  let n = 1;
  let ust = k.ust_id;
  while (ust) {
    n++;
    ust = hepsi.find((x) => x.id === ust)?.ust_id ?? null;
  }
  return n;
}

/** "Anlam › Gönüllülük" gibi tam yol. */
export function yol(id: string | null, hepsi: KlasorRow[]): string {
  const parcalar: string[] = [];
  let k = hepsi.find((x) => x.id === id);
  while (k) {
    parcalar.unshift(k.ad);
    k = hepsi.find((x) => x.id === k!.ust_id);
  }
  return parcalar.join(' › ');
}

async function sonSira(ustId: string | null) {
  const kardesler = ustId ? await db.klasor.where('ust_id').equals(ustId).toArray() : (await db.klasor.toArray()).filter((k) => k.ust_id === null);
  return kardesler.reduce((m, k) => Math.max(m, k.sira ?? 0), 0) + 1;
}

export async function alanEkle(ad: string, kriterler: string[] = [], aciklama = ''): Promise<string> {
  const id = crypto.randomUUID();
  await db.klasor.add({ id, ad, ust_id: null, tur: 'alan', sira: await sonSira(null), kriterler, aciklama, guncellendi: Date.now() });
  return id;
}

export async function klasorEkle(ad: string, ustId: string): Promise<string> {
  const hepsi = await db.klasor.toArray();
  const ust = hepsi.find((k) => k.id === ustId);
  if (!ust) throw new Error('Üst klasör yok');
  if (seviye(ust, hepsi) >= EN_FAZLA_SEVIYE) throw new Error(`En fazla ${EN_FAZLA_SEVIYE} seviye.`);
  const id = crypto.randomUUID();
  await db.klasor.add({ id, ad, ust_id: ustId, tur: 'klasor', sira: await sonSira(ustId), guncellendi: Date.now() });
  return id;
}

export async function klasorGuncelle(id: string, patch: Partial<KlasorRow>) {
  await db.klasor.update(id, { ...patch, guncellendi: Date.now() });
}

/** Silme: içindekiler bir üste taşınır (alan silinirse programlar Alansız'a düşer). */
export async function klasorSil(id: string) {
  const k = await db.klasor.get(id);
  if (!k) return;
  await db.transaction('rw', db.klasor, db.program, db.alan_degerlendirme, async () => {
    const altlar = await db.klasor.where('ust_id').equals(id).toArray();
    const programlar = await db.program.where('klasor_id').equals(id).toArray();
    if (k.ust_id === null) {
      // Alanın alt klasörleri yeni alan olmaz: içlerindeki programlar Alansız'a, klasörler silinir.
      const tumAltlar = [...altlar];
      for (let i = 0; i < tumAltlar.length; i++) tumAltlar.push(...(await db.klasor.where('ust_id').equals(tumAltlar[i].id).toArray()));
      for (const a of tumAltlar) {
        for (const p of await db.program.where('klasor_id').equals(a.id).toArray()) await db.program.update(p.id, { klasor_id: null });
        await db.klasor.delete(a.id);
      }
      for (const p of programlar) await db.program.update(p.id, { klasor_id: null });
      const d = await db.alan_degerlendirme.where('alan_id').equals(id).primaryKeys();
      await db.alan_degerlendirme.bulkDelete(d);
    } else {
      for (const a of altlar) await db.klasor.update(a.id, { ust_id: k.ust_id });
      for (const p of programlar) await db.program.update(p.id, { klasor_id: k.ust_id });
    }
    await db.klasor.delete(id);
  });
}

export async function programTasi(programId: string, klasorId: string | null) {
  await db.program.update(programId, { klasor_id: klasorId, guncellendi: Date.now() });
}

export async function degerlendir(alanId: string, deger: number) {
  await db.alan_degerlendirme.add({ id: crypto.randomUUID(), alan_id: alanId, deger, zaman: Date.now() });
}

/** Her alanın son değerlendirmesi. */
export async function sonDegerlendirmeler(): Promise<Record<string, AlanDegerlendirmeRow>> {
  const hepsi = await db.alan_degerlendirme.orderBy('zaman').toArray();
  const son: Record<string, AlanDegerlendirmeRow> = {};
  for (const d of hepsi) son[d.alan_id] = d;
  return son;
}

// ———————————————— hazır başlangıç setleri (özendiriyoruz, zorlamıyoruz) ————————————————

export interface HazirSet { ad: string; aciklama: string; alanlar: { ad: string; kriterler: string[] }[] }

export const HAZIR_SETLER: HazirSet[] = [
  {
    ad: 'PERMA',
    aciklama: 'Seligman\'ın iyi oluş modeli: beş alan.',
    alanlar: [
      { ad: 'Olumlu duygular', kriterler: ['Gün içinde sevinç, minnet ya da huzur hissediyorum'] },
      { ad: 'Bağlılık', kriterler: ['Kendimi kaptırdığım, zamanın nasıl geçtiğini unuttuğum uğraşlarım var'] },
      { ad: 'İlişkiler', kriterler: ['Destek aldığım ve destek verdiğim yakın ilişkilerim var'] },
      { ad: 'Anlam', kriterler: ['Kendimden büyük bir şeye katkı verdiğimi hissediyorum'] },
      { ad: 'Başarı', kriterler: ['Kendime koyduğum hedeflerde ilerliyorum'] },
    ],
  },
  {
    ad: 'PERMA + beden',
    aciklama: 'PERMA\'ya bedensel iyi oluş eklenmiş hali.',
    alanlar: [
      { ad: 'Olumlu duygular', kriterler: ['Gün içinde sevinç, minnet ya da huzur hissediyorum'] },
      { ad: 'Bağlılık', kriterler: ['Kendimi kaptırdığım uğraşlarım var'] },
      { ad: 'İlişkiler', kriterler: ['Destek aldığım ve destek verdiğim yakın ilişkilerim var'] },
      { ad: 'Anlam', kriterler: ['Kendimden büyük bir şeye katkı verdiğimi hissediyorum'] },
      { ad: 'Başarı', kriterler: ['Kendime koyduğum hedeflerde ilerliyorum'] },
      { ad: 'Beden', kriterler: ['Uykum düzenli', 'Beslenmem dengeli', 'Düzenli hareket ediyorum'] },
    ],
  },
  {
    ad: 'Yaşam çarkı',
    aciklama: 'Wheel of Life tarzı sekiz alan.',
    alanlar: [
      { ad: 'Sağlık', kriterler: [] },
      { ad: 'Aile', kriterler: [] },
      { ad: 'Arkadaşlar', kriterler: [] },
      { ad: 'İş / Uğraş', kriterler: [] },
      { ad: 'Maddi durum', kriterler: [] },
      { ad: 'Kişisel gelişim', kriterler: [] },
      { ad: 'Eğlence', kriterler: [] },
      { ad: 'Yaşadığım çevre', kriterler: [] },
    ],
  },
];

export async function hazirSetKur(set: HazirSet) {
  for (const a of set.alanlar) await alanEkle(a.ad, a.kriterler);
}

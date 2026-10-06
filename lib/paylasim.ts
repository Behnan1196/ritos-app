'use client';

// ————————————————————————————————————————————————————————————————
// Paylaşım paketi (P1–P7). Kartın ya da programın yalnızca TANIMI: yapıldı geçmişi, girilen
// değerler ve değerlendirme gitmez. "Al" deyince bağımsız bir yerel karta / rutine dönüşür.
// 7 ekim: taşıma artık Çevrem'in 'paylasim' tablosu (lib/cevrem.ts) ya da danışmanlık mesajı;
// eski Gelenler kutusu (cat_gelen), kişi arama ve engelleme kaldırıldı.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type ProgramAdimRow } from './db';
import { teslimAl } from './ajanda';
import { adimEkle } from './program';
import { PAKET_SURUM, TAM_IZIN, gunFarki, tarihEkle, type Blok, type PaketEk, type TemelTip } from './paket';

type AdimTanim = Omit<ProgramAdimRow, 'id' | 'program_id' | 'sira' | 'guncellendi'>;

export interface PaylasimPaketi {
  surum: typeof PAKET_SURUM;
  tur: 'kart' | 'program';
  ad: string;
  kart?: { tip: TemelTip; bloklar: Blok[]; gun_sayisi: number | null; gunler: number[] | null; saatler: string[]; ek?: PaketEk | null };
  program?: { amac: string; dikkat: string; kriterler: string[]; hedef: string; adimlar: AdimTanim[] };
}

// ———————————————— paket üretimi ————————————————

export function kartPaketi(k: AjandaKartRow): PaylasimPaketi {
  return {
    surum: PAKET_SURUM,
    tur: 'kart',
    ad: k.ad,
    kart: {
      tip: k.tip,
      bloklar: k.bloklar,
      gun_sayisi: k.bitis === null ? null : gunFarki(k.baslangic, k.bitis) + 1,
      gunler: k.gunler,
      saatler: k.saatler,
      ek: k.ek ?? null,
    },
  };
}

export async function programPaketi(programId: string): Promise<PaylasimPaketi | null> {
  const p = await db.program.get(programId);
  if (!p) return null;
  const adimlar = await db.program_adim.where('program_id').equals(programId).sortBy('sira');
  return {
    surum: PAKET_SURUM,
    tur: 'program',
    ad: p.ad,
    program: {
      amac: p.amac, dikkat: p.dikkat, kriterler: p.kriterler, hedef: p.hedef,
      adimlar: adimlar.map(({ tip, ad, bloklar, basla_gun, sure_gun, gunler, saatler, ek }) => ({ tip, ad, bloklar, basla_gun, sure_gun, gunler, saatler, ek: ek ?? null })),
    },
  };
}

// ———————————————— Sohbet'ten gelen paylaşımı almak (C3, 27 eylül) ————————————————

/** Paylaşılan kartı Ajanda'ya (verilen günden) ya da programı Kişisel Gelişim'e (verilen yere) ekler. */
export async function paketiAl(p: PaylasimPaketi, gonderenAd: string, secenek: { baslangic: string; klasor: string | null }): Promise<string> {
  if (p.tur === 'kart' && p.kart) {
    await teslimAl([{
      surum: PAKET_SURUM,
      id: crypto.randomUUID(),
      // veri üreten kart (Kaydet/Uygula) paylaşımda "Yap" olur — değer geçmişi programda yaşar
      tip: (p.kart.tip === 'kaydet' || p.kart.tip === 'uygula') && !p.kart.ek ? 'yap' : p.kart.tip,
      ad: p.ad,
      bloklar: p.kart.bloklar,
      zamanlama: {
        baslangic: secenek.baslangic,
        bitis: p.kart.gun_sayisi === null ? null : tarihEkle(secenek.baslangic, p.kart.gun_sayisi - 1),
        gunler: p.kart.gunler,
        saatler: p.kart.saatler,
      },
      kaynak: { modul: 'ajanda', ref: null, etiket: null },
      sahip: 'ben',
      izinler: TAM_IZIN,
      geri_bildirim: 'yok',
      ek: p.kart.ek ?? null,
    }]);
    return "Ajanda'na eklendi";
  }
  if (p.tur === 'program' && p.program) {
    const mevcut = await db.program.toArray();
    let ad = p.ad;
    if (mevcut.some((x) => x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) ad = `${p.ad} · ${gonderenAd}`;
    const id = crypto.randomUUID();
    await db.program.add({
      id, ad, amac: p.program.amac, dikkat: p.program.dikkat, kriterler: p.program.kriterler, hedef: p.program.hedef,
      klasor_id: secenek.klasor, home_goster: false, degerlendirme_acik: false, degerlendirme: null,
      calisma_baslangic: null, calisma_bitis: null, kimden: gonderenAd, guncellendi: Date.now(),
    });
    for (const a of p.program.adimlar) await adimEkle(id, a);
    return "Rutinlerine eklendi (Kuruluyor)";
  }
  throw new Error('Tanınmayan paylaşım');
}

// ————————————————————————————————————————————————————————————————
// Hazır hafta şablonları (4 ekim) — sunucuda herkese açık paket (paket = 'sablon').
// Sınav kataloğuyla aynı yol: cihaz son sürümü `katalog` tablosuna indirir (kod: 'sablon:<kod>');
// sunucuya ulaşılamazsa uygulamayla gelen kopya (public/paketler/sablonlar.v1.json).
// Kullanıcı "Benim şablonlarıma al" deyince kendi şablonu (ProgramRow, sablon) olur; sunucudaki
// sürüm güncellense de kopyası değişmez. Beslenme şablonları diyetisyen onayıyla `onayli` olur.
// ————————————————————————————————————————————————————————————————

import { db, type KatalogRow } from './db';
import { supabase } from './supabase';
import { useCanli } from './canli';
import type { HaftaKarti, KocKartTaslak } from './danisanAjanda';
import type { Blok } from './paket';

const PAKET = 'sablon';
const SON_KONTROL = 'sablon_son_kontrol';
const ARALIK = 6 * 3600_000;

export interface HazirSablon {
  kod: string; alan: string; ad: string; kcal?: number; aciklama?: string; onayli: boolean; surum: number;
  kartlar: { gun: number; ad: string; tip?: KocKartTaslak['tip']; bloklar: Blok[] }[];
}

interface Satir { kod: string; surum: number; onayli: boolean; veri: unknown }

async function sunucudan(): Promise<Satir[] | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('paket').select('kod, surum, onayli, veri').eq('paket', PAKET);
    if (error || !data?.length) return null;
    return data as Satir[];
  } catch { return null; }
}

async function yedekten(): Promise<Satir[]> {
  try {
    const j = await fetch('/paketler/sablonlar.v1.json').then((r) => r.json());
    return (j.sablonlar as { kod: string; veri: unknown }[]).map((x) => ({ kod: x.kod, surum: j.surum, onayli: false, veri: x.veri }));
  } catch { return []; }
}

export async function hazirSablonlariYenile(zorla = false): Promise<void> {
  const son = (await db.ayar.get(SON_KONTROL))?.deger as number | undefined;
  const mevcut = await db.katalog.where('paket').equals(PAKET).toArray();
  if (!zorla && mevcut.length && son && Date.now() - son < ARALIK) return;
  let satirlar = await sunucudan();
  if (!satirlar) {
    if (mevcut.length) return;
    satirlar = await yedekten();
  } else await db.ayar.put({ anahtar: SON_KONTROL, deger: Date.now() });
  const eski = new Map(mevcut.map((m) => [m.kod, m]));
  const yaz: KatalogRow[] = [];
  for (const s of satirlar) {
    const kod = `${PAKET}:${s.kod}`;
    const e = eski.get(kod);
    if (e && e.surum >= s.surum && e.onayli === s.onayli) continue;
    yaz.push({ kod, paket: PAKET, surum: s.surum, onayli: s.onayli, veri: s.veri, indirildi: Date.now(), fark: null });
  }
  if (yaz.length) await db.katalog.bulkPut(yaz);
}

const donustur = (r: KatalogRow): HazirSablon => {
  const v = r.veri as Omit<HazirSablon, 'kod' | 'onayli' | 'surum'>;
  return { ...v, kod: r.kod, onayli: r.onayli, surum: r.surum };
};

/** Bir alanın hazır şablonları (alan: 'beslenme' | 'sinav' | 'kisisel' …). */
export function useHazirSablonlar(alan: string): HazirSablon[] {
  return useCanli(async () => (await db.katalog.where('paket').equals(PAKET).toArray()).map(donustur).filter((s) => s.alan === alan), [alan], [] as HazirSablon[]);
}

export const hazirKartlar = (s: HazirSablon): HaftaKarti[] =>
  s.kartlar.map((k) => ({ gun: k.gun, kart: { tip: k.tip, ad: k.ad, bloklar: k.bloklar } }));

/** Hazır şablonu kendi şablonlarına kopyala (ProgramRow, sablon). */
export async function hazirSablonuAl(s: HazirSablon): Promise<string> {
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.add({
      id, ad: s.ad.replace(/\s*\(örnek\)\s*$/i, ''), amac: s.aciklama ?? '', dikkat: '', kriterler: [], hedef: '', klasor_id: null, home_goster: false,
      degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      kimden: 'Ritos hazır şablon', sablon: true, sablon_disiplin: s.alan, uzak: null, guncellendi: simdi,
    });
    await db.program_adim.bulkAdd(s.kartlar.map((k, i) => ({
      id: crypto.randomUUID(), program_id: id, sira: i + 1, tip: k.tip ?? 'yap', ad: k.ad, bloklar: k.bloklar,
      basla_gun: k.gun, sure_gun: 1, gunler: null, saatler: [], guncellendi: simdi,
    })));
  });
  return id;
}

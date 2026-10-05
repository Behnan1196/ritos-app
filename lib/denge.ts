'use client';

// ————————————————————————————————————————————————————————————————
// Denge (5 ekim) — Rutinlerim. Her yaşam alanı için iki katman:
//  • Emeğin: son 4 haftanın kaçında, o alana etiketli rutinlerin kartlarından en az biri yapıldı (0–4).
//    Kendiliğinden hesaplanır; puan değil.
//  • Hissin: ay sonu öz değerlendirmesi (1–5). Kriterli alanda kriterlerin ortalaması.
//  • Taban: alanına dokunan en az bir OTURMUŞ rutin varsa sabit 2 (ajandada izlenmese de alan boş görünmez).
//    Grafikte toplam = min(4, taban + emek).
// ————————————————————————————————————————————————————————————————

import { db, type AlanDegerlendirmeRow, type ProgramRow, type YasamAlaniRow } from './db';
import { bugun, tarihEkle, tarihParse } from './paket';

export const haftaBasi = (t: string) => tarihEkle(t, -((tarihParse(t).getDay() + 6) % 7));
export const ayKodu = (t = bugun()) => t.slice(0, 7);
export const oncekiAy = (ay: string) => { const [y, m] = ay.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const ayAdi = (ay: string, kisa = false) => { const a = AY_AD[Number(ay.slice(5, 7)) - 1] ?? ay; return kisa ? a.slice(0, 3) : a; };

export interface AlanEmek { hafta: number[]; emek: number; taban: number; toplam: number; oturan: string[] } // hafta: son 4 hafta (eskiden yeniye) yapılan kart sayısı

/** Her alan için son 4 haftanın yapılan sayıları ve emek (yapılan haftaların sayısı). */
export async function emekHesapla(alanlar: YasamAlaniRow[]): Promise<Record<string, AlanEmek>> {
  const tum = (await db.program.toArray()).filter((p) => !p.uzak && !p.sablon && p.alanlar?.length);
  const programlar = tum; // arşiv ve oturdu dahil: geçmiş işaretler emeğe sayılır
  const bas = tarihEkle(haftaBasi(bugun()), -21);
  const sonuc: Record<string, AlanEmek> = {};
  for (const a of alanlar) {
    const oturan = tum.filter((p) => p.durum === 'oturdu' && p.alanlar!.includes(a.id)).map((p) => p.ad);
    sonuc[a.id] = { hafta: [0, 0, 0, 0], emek: 0, taban: oturan.length ? 2 : 0, toplam: 0, oturan };
  }
  if (!programlar.length) return sonuc;
  const progAlan = new Map<string, string[]>(programlar.map((p) => [p.id, p.alanlar!]));
  const kartlar = (await db.ajanda_kart.where('kaynak_modul').equals('program').toArray())
    .filter((k) => progAlan.has((k.kaynak_ref ?? '').split('/')[0]));
  const kartAlan = new Map(kartlar.map((k) => [k.id, progAlan.get((k.kaynak_ref ?? '').split('/')[0])!]));
  const kayitlar = (await db.ajanda_kayit.where('tarih').aboveOrEqual(bas).toArray()).filter((r) => r.yapildi && kartAlan.has(r.kart_id) && r.tarih <= bugun());
  for (const r of kayitlar) {
    const hi = Math.min(3, Math.floor((tarihParse(r.tarih).getTime() - tarihParse(bas).getTime()) / (7 * 86400000)));
    for (const al of kartAlan.get(r.kart_id)!) if (sonuc[al]) sonuc[al].hafta[hi]++;
  }
  for (const al of Object.keys(sonuc)) {
    sonuc[al].emek = sonuc[al].hafta.filter((n) => n > 0).length;
    sonuc[al].toplam = Math.min(4, sonuc[al].emek + sonuc[al].taban);
  }
  return sonuc;
}

/** Değerlendirmeler alan başına, yeniden eskiye. */
export async function degerlendirmeler(): Promise<Record<string, AlanDegerlendirmeRow[]>> {
  const hepsi = (await db.alan_degerlendirme.toArray()).filter((d) => d.ay);
  const m: Record<string, AlanDegerlendirmeRow[]> = {};
  for (const d of hepsi) (m[d.alan_id] ??= []).push(d);
  for (const k of Object.keys(m)) m[k].sort((a, b) => (b.ay! < a.ay! ? -1 : 1));
  return m;
}

export async function degerlendir(alanId: string, ay: string, deger: number, kriter?: number[]) {
  await db.alan_degerlendirme.put({ id: `${alanId}|${ay}`, alan_id: alanId, ay, deger, kriter, zaman: Date.now() });
}

/** Ay sonu hatırlatması: bu ay için hiç değerlendirme yoksa ve ayın 24'ü geçtiyse (ya da hiç yapılmadıysa). */
export function degerlendirmeZamani(d: Record<string, AlanDegerlendirmeRow[]>): boolean {
  const ay = ayKodu();
  const hepsi = Object.values(d).flat();
  if (hepsi.some((x) => x.ay === ay)) return false;
  return Number(bugun().slice(8, 10)) >= 24 || hepsi.length === 0;
}

/** Bu alana dokunan (benim) rutinlerim. */
export async function alanRutinleri(alanId: string): Promise<ProgramRow[]> {
  return (await db.program.toArray()).filter((p) => !p.uzak && !p.sablon && p.alanlar?.includes(alanId)).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

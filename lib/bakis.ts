'use client';

// ————————————————————————————————————————————————————————————————
// "Hayatına bakalım" (8 ekim) — Yaşam Tarzım'ın rehberli kapısı: Bak → Seç → Küçük başla.
//  • Bak: her görünür alan için 3'lü cevap (İyi değil / İdare eder / İyi). Ay sonu değerlendirmesiyle aynı
//    tabloya (alan_degerlendirme, id '<alan>|<ay>') 1..5'e çevrilerek yazılır; olcek: 3, cerceve: 'ritos-8'.
//  • "Neyin biraz daha olmasını isterdin?" seçimleri: alan_id '__istek' satırı.
//  • Küçük başla: seçilen (hazır ya da kendi) rutin bir program olarak kurulur, alanına bağlanır,
//    kartı Ajanda'ya düşer; program "bu ayın odağı" olarak işaretlenir (yalnız biri).
// ————————————————————————————————————————————————————————————————

import { db, type AlanDegerlendirmeRow, type ProgramRow, type YasamAlaniRow } from './db';
import { ayKodu } from './denge';
import { bugun, gunFarki, tarihEkle, tarihParse } from './paket';
import { programGuncelle, programOlustur } from './program';
import { kocKartlariEkle } from './danisanAjanda';
import { metindenBelge } from './belge';
import { CERCEVE, ISTEKLER } from './hazirRutin';

export type Cevap3 = 1 | 2 | 3;
export const UC_DEN_BESE: Record<Cevap3, number> = { 1: 1, 2: 3, 3: 5 };
export const BESTEN_UCE = (d: number): Cevap3 => (d <= 2 ? 1 : d < 4 ? 2 : 3);
export const ISTEK_ALAN = '__istek';
export const ODAK_HAFTA = 4;

/** Bakışı kaydet: alan cevapları + istekler. */
export async function bakisKaydet(cevaplar: Record<string, Cevap3>, istek: string[], not: string) {
  const ay = ayKodu();
  const zaman = Date.now();
  const satirlar: AlanDegerlendirmeRow[] = Object.entries(cevaplar).map(([alan_id, c]) => ({
    id: `${alan_id}|${ay}`, alan_id, ay, deger: UC_DEN_BESE[c], olcek: 3, cerceve: CERCEVE, zaman,
  }));
  satirlar.push({ id: `${ISTEK_ALAN}|${ay}`, alan_id: ISTEK_ALAN, ay, deger: 0, istek, not: not.trim() || undefined, cerceve: CERCEVE, zaman });
  await db.alan_degerlendirme.bulkPut(satirlar);
}

/** Hiç bakış (ya da ay sonu değerlendirmesi) yapıldı mı? */
export async function bakisVarMi(): Promise<boolean> {
  return (await db.alan_degerlendirme.filter((d) => !!d.ay).count()) > 0;
}

/** Son bakışın istekleri. */
export async function sonIstek(): Promise<AlanDegerlendirmeRow | null> {
  const l = await db.alan_degerlendirme.where('alan_id').equals(ISTEK_ALAN).toArray();
  return l.sort((a, b) => b.zaman - a.zaman)[0] ?? null;
}

/** Öneri sırası: en düşük cevaplı alanlar önce; eşitlikte isteklerle eşleşen önce. İlk ikisi önerilir. */
export function alanOnerisi(alanlar: YasamAlaniRow[], cevaplar: Record<string, Cevap3>, istek: string[]): YasamAlaniRow[] {
  const istenen = new Set(ISTEKLER.filter(([e]) => istek.includes(e)).flatMap(([, k]) => k));
  const puan = (a: YasamAlaniRow) => (cevaplar[a.id] ?? 2) * 10 - (a.kod && istenen.has(a.kod) ? 5 : 0);
  return [...alanlar].sort((a, b) => puan(a) - puan(b) || a.sira - b.sira);
}

/** Seçili haftanın günlerinden bugüne ya da sonrasına düşen ilk tarih. */
export function ilkGun(gunler: number[] | null): string {
  const t = bugun();
  if (!gunler || !gunler.length) return t;
  for (let i = 0; i < 7; i++) { const g = tarihEkle(t, i); if (gunler.includes(tarihParse(g).getDay())) return g; }
  return t;
}

export interface YeniRutin { alanId: string; ad: string; ikon: string; gunler: number[] | null; ardindan: string | null; saat: string | null }

/** Rutini kur: program + alan etiketi + Ajanda kartı; bu ayın odağı yap. */
export async function odakRutinKur(r: YeniRutin): Promise<string> {
  for (const p of await db.program.filter((x) => !!x.odak).toArray()) await programGuncelle(p.id, { odak: null });
  const pid = await programOlustur(r.ad.trim(), '');
  await programGuncelle(pid, { ikon: r.ikon, kimden: 'Kendim', alanlar: [r.alanId], odak: { alan: r.alanId, baslangic: bugun() } });
  const not = r.ardindan && r.ardindan !== 'Belli bir saatte' ? r.ardindan : null;
  await kocKartlariEkle({ tur: 'program', programId: pid }, [{
    tarih: ilkGun(r.gunler),
    kart: { tip: 'yap', ad: r.ad.trim(), bloklar: not ? [{ tur: 'belge', belge: metindenBelge(not) }] : [], saatler: r.saat ? [r.saat] : [] },
    tekrar: { gun: null, gunler: r.gunler && r.gunler.length < 7 ? r.gunler : null },
  }]);
  return pid;
}

/** Bu ayın odağı (kuruluyor durumundaki odak rutini) ve kaçıncı haftada olduğu. */
export async function odak(): Promise<{ p: ProgramRow; hafta: number; yapilan: number } | null> {
  const p = (await db.program.filter((x) => !!x.odak && (x.durum ?? 'kuruluyor') === 'kuruluyor').toArray())[0];
  if (!p?.odak) return null;
  const hafta = Math.min(ODAK_HAFTA, Math.floor(gunFarki(p.odak.baslangic, bugun()) / 7) + 1);
  const kartlar = await db.ajanda_kart.where('kaynak_ref').startsWith(`${p.id}/`).toArray();
  const idler = new Set(kartlar.map((k) => k.id));
  const yapilan = (await db.ajanda_kayit.where('tarih').aboveOrEqual(p.odak.baslangic).toArray()).filter((r) => r.yapildi && idler.has(r.kart_id)).length;
  return { p, hafta, yapilan };
}

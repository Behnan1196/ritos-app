'use client';

// ————————————————————————————————————————————————————————————————
// "Hayatına bakalım" (8 ekim) — Yaşam Tarzım'ın rehberli kapısı: Bak → Seç → Küçük başla.
//  • Bak: her görünür alan için 3'lü cevap (İyi değil / İdare eder / İyi). Ay sonu değerlendirmesiyle aynı
//    tabloya (alan_degerlendirme, id '<alan>|<ay>') 1..5'e çevrilerek yazılır; olcek: 3, cerceve: 'ritos-8'.
//  • "Neyin biraz daha olmasını isterdin?" seçimleri: alan_id '__istek' satırı.
//  • Küçük başla: seçilen (hazır ya da kendi) rutin bir program olarak kurulur, alanına bağlanır,
//    kartı Ajanda'ya düşer; program "bu ayın odağı" olarak işaretlenir (yalnız biri).
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type AlanDegerlendirmeRow, type ProgramRow, type YasamAlaniRow } from './db';
import { ikonOner } from './programIkon';
import { ayKodu, haftaBasi } from './denge';
import { arsivle } from './rutinDongu';
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
  return rutinKur({ ...r, alanIdler: [r.alanId] }, { alan: r.alanId, baslangic: bugun() });
}

/** Kendi rutinini kur (Kendim kurayım): program + alan etiketleri (boş olabilir) + Ajanda kartı. */
export async function rutinKur(r: Omit<YeniRutin, 'alanId'> & { alanIdler: string[] }, odakBilgi: ProgramRow['odak'] = null): Promise<string> {
  const pid = await programOlustur(r.ad.trim(), '');
  await programGuncelle(pid, { ikon: r.ikon, kimden: 'Kendim', alanlar: r.alanIdler, ...(odakBilgi ? { odak: odakBilgi } : {}) });
  const not = r.ardindan && r.ardindan !== 'Belli bir saatte' ? r.ardindan : null;
  await kocKartlariEkle({ tur: 'program', programId: pid }, [{
    tarih: ilkGun(r.gunler),
    kart: { tip: 'yap', ad: r.ad.trim(), bloklar: not ? [{ tur: 'belge', belge: metindenBelge(not) }] : [], saatler: r.saat ? [r.saat] : [] },
    tekrar: { gun: null, gunler: r.gunler && r.gunler.length < 7 ? r.gunler : null },
  }]);
  return pid;
}

/** Bu ayın odağı (kuruluyor durumundaki odak rutini): kaçıncı haftada, kaç kez yapıldı, haftalık cevaplar; 4 hafta dolduysa bitti. */
export async function odak(): Promise<{ p: ProgramRow; hafta: number; yapilan: number; bitti: boolean; haftalik: (Cevap3 | null)[] } | null> {
  const p = (await db.program.filter((x) => !!x.odak && (x.durum ?? 'kuruluyor') === 'kuruluyor').toArray())[0];
  if (!p?.odak) return null;
  const gun = gunFarki(p.odak.baslangic, bugun());
  const hafta = Math.min(ODAK_HAFTA, Math.floor(gun / 7) + 1);
  const kartlar = await db.ajanda_kart.where('kaynak_ref').startsWith(`${p.id}/`).toArray();
  const idler = new Set(kartlar.map((k) => k.id));
  const yapilan = (await db.ajanda_kayit.where('tarih').aboveOrEqual(p.odak.baslangic).toArray()).filter((r) => r.yapildi && idler.has(r.kart_id) && r.tarih <= bugun()).length;
  const satirlar = (await db.alan_degerlendirme.where('alan_id').equals(p.odak.alan).toArray()).filter((d) => d.program_id === p.id && d.hafta);
  const ilkHafta = haftaBasi(p.odak.baslangic);
  const haftalik = Array.from({ length: ODAK_HAFTA }, (_, i) => {
    const d = satirlar.find((x) => x.hafta === tarihEkle(ilkHafta, 7 * i));
    return d ? BESTEN_UCE(d.deger) : null;
  });
  return { p, hafta, yapilan, bitti: gun >= ODAK_HAFTA * 7, haftalik };
}

/** Dört hafta sonunda: oturdu (odak kapanır, rutin ajandada sürer) · devam (4 hafta daha) · bırak (rutin arşive, kartlar yarından kalkar). */
export async function odakSonu(pid: string, sonuc: 'oturdu' | 'devam' | 'birak') {
  const p = await db.program.get(pid);
  if (!p?.odak) return;
  if (sonuc === 'devam') { await programGuncelle(pid, { odak: { ...p.odak, baslangic: bugun() } }); return; }
  await programGuncelle(pid, { odak: null });
  if (sonuc === 'birak') await arsivle(pid);
}

// ———————————————— haftalık bakış (pazar akşamı / pazartesi, Home) ————————————————

export interface HaftalikBakis { p: ProgramRow; alanId: string; hafta: string; yapilan: number }

/** Pazar günü bu haftanın, pazartesi geçen haftanın bakışı (cevaplanmadıysa ve odak o hafta varsa). */
export async function haftalikBakisDurumu(): Promise<HaftalikBakis | null> {
  const t = bugun();
  const g = tarihParse(t).getDay();
  if (g !== 0 && g !== 1) return null;
  const hb = g === 0 ? haftaBasi(t) : tarihEkle(haftaBasi(t), -7);
  const p = (await db.program.filter((x) => !!x.odak && (x.durum ?? 'kuruluyor') === 'kuruluyor').toArray())[0];
  if (!p?.odak || p.odak.baslangic > tarihEkle(hb, 6)) return null;
  if (await db.alan_degerlendirme.get(haftalikId(p.id, hb))) return null;
  const kartlar = await db.ajanda_kart.where('kaynak_ref').startsWith(`${p.id}/`).toArray();
  const idler = new Set(kartlar.map((k) => k.id));
  const yapilan = (await db.ajanda_kayit.where('tarih').between(hb, tarihEkle(hb, 6), true, true).toArray()).filter((r) => r.yapildi && idler.has(r.kart_id)).length;
  return { p, alanId: p.odak.alan, hafta: hb, yapilan };
}
const haftalikId = (pid: string, hb: string) => `hafta|${pid}|${hb}`;

export async function haftalikKaydet(b: HaftalikBakis, c: Cevap3, not: string) {
  await db.alan_degerlendirme.put({
    id: haftalikId(b.p.id, b.hafta), alan_id: b.alanId, deger: UC_DEN_BESE[c], olcek: 3, cerceve: CERCEVE,
    hafta: b.hafta, program_id: b.p.id, not: not.trim() || undefined, zaman: Date.now(),
  });
}

// ———————————————— Ajanda kartından Yaşam Tarzı'na (8 ekim) ————————————————

/** Kendi (bağımsız, tekrar eden) Ajanda kartını rutine çevir: aynı kart yarından rutinin kartı olarak sürer, eskisi bugün biter
 *  (henüz başlamadıysa yenisi aynı günden başlar, eskisi kalkar). İşaret geçmişi yerinde kalır. */
export async function ajandaKartiniBagla(k: AjandaKartRow, alanIdler: string[]): Promise<string> {
  const t = bugun();
  const pid = await programOlustur(k.ad, '');
  await programGuncelle(pid, { ikon: ikonOner(k.ad) ?? undefined, kimden: 'Kendim', alanlar: alanIdler });
  const bas = k.baslangic > t ? k.baslangic : tarihEkle(t, 1);
  await kocKartlariEkle({ tur: 'program', programId: pid }, [{
    tarih: bas,
    kart: { tip: k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null, saatler: k.saatler },
    tekrar: { gun: k.bitis ? gunFarki(bas, k.bitis) + 1 : null, gunler: k.gunler },
  }]);
  if (k.baslangic > t) await db.ajanda_kart.delete(k.id);
  else await db.ajanda_kart.update(k.id, { bitis: t, guncellendi: Date.now() });
  return pid;
}

/** Kartın Yaşam Tarzı durumu: bağlanabilir (kendi tekrar eden kartı), rutin (kendi programı; alanları) ya da yok. */
export async function kartYasamDurumu(k: AjandaKartRow): Promise<{ tur: 'baglanir' } | { tur: 'rutin'; p: ProgramRow } | null> {
  const t = bugun();
  if (k.kaynak_modul === 'ajanda' && k.tip !== 'oku' && k.bitis !== k.baslangic && (k.bitis === null || k.bitis > t)) return { tur: 'baglanir' };
  if (k.kaynak_modul === 'program') {
    const p = await db.program.get((k.kaynak_ref ?? '').split('/')[0]);
    if (p && !p.uzak && !p.sablon) return { tur: 'rutin', p };
  }
  return null;
}

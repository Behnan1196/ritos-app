// ————————————————————————————————————————————————————————————————
// Kişisel Gelişim — Bireysel Program (25 eylül).
// Program Ajanda'ya yalnızca kart paketi teslim eder (teslimAl) ve Ajanda'dan yalnızca
// geri bildirim okur. Ajanda'nın tablolarına doğrudan dokunmaz — sahibi kullanıcının
// kendisi olduğu için yerel görünür, ama izlediği yol danışmanlığınkiyle aynı.
// ————————————————————————————————————————————————————————————————

import { db, type ProgramAdimRow, type ProgramRow } from './db';
import { kaynaktanCek, teslimAl, yenidenTeslim } from './ajanda';
import { BAGLI_YEREL_IZIN, PAKET_SURUM, bugun, gunAktif, gunFarki, tarihEkle, type KartPaketi, type Zamanlama } from './paket';

// Danışmanlık kancaları (lib/danismanlik.ts doldurur). Koçun danışana atadığı programda değişiklik
// koçun Ajanda'sına değil, danışana gider (D8).
export const programKancalari: {
  degisti?: (programId: string, etkin: string) => void;
  durduruldu?: (programId: string) => void;
} = {};

const kocProgrami = (p?: ProgramRow | null) => p?.uzak?.rol === 'koc';

export async function programOlustur(ad: string, amac = ''): Promise<string> {
  const id = crypto.randomUUID();
  const p: ProgramRow = {
    id, ad, amac, dikkat: '', kriterler: [], hedef: '', klasor_id: null,
    home_goster: false, degerlendirme_acik: false, degerlendirme: null,
    calisma_baslangic: null, calisma_bitis: null, guncellendi: Date.now(),
  };
  await db.program.add(p);
  return id;
}

export async function programGuncelle(id: string, patch: Partial<ProgramRow>) {
  await db.program.update(id, { ...patch, guncellendi: Date.now() });
  const p = await db.program.get(id);
  if (kocProgrami(p) && Object.keys(patch).some((k) => ['ad', 'amac', 'dikkat', 'kriterler', 'hedef'].includes(k))) programKancalari.degisti?.(id, bugun());
}

export async function adimEkle(programId: string, a: Omit<ProgramAdimRow, 'id' | 'program_id' | 'sira' | 'guncellendi'>) {
  const mevcut = await db.program_adim.where('program_id').equals(programId).toArray();
  const sira = mevcut.reduce((m, x) => Math.max(m, x.sira), 0) + 1;
  const adim: ProgramAdimRow = { ...a, id: crypto.randomUUID(), program_id: programId, sira, guncellendi: Date.now() };
  await db.program_adim.add(adim);
  // Çalışan programa eklenen adım bugünden itibaren Ajanda'ya düşer.
  await calisanaYansit(programId, adim, bugun());
}

// K9 — adım düzenleme. Program çalışıyorsa değişiklik seçilen tarihten (bugün ya da yarın)
// itibaren Ajanda'daki kartlara yansır; geçmiş günler değişmez.
export async function adimGuncelle(adimId: string, patch: Partial<ProgramAdimRow>, etkin: string) {
  await db.program_adim.update(adimId, { ...patch, guncellendi: Date.now() });
  const adim = await db.program_adim.get(adimId);
  if (adim) await calisanaYansit(adim.program_id, adim, etkin);
}

export async function calisanaYansit(programId: string, adim: ProgramAdimRow, etkin: string) {
  const p = await db.program.get(programId);
  if (kocProgrami(p)) { programKancalari.degisti?.(programId, etkin); return; } // danışana gider
  if (!p || !p.calisma_baslangic || !aktifMi(p) || p.calisma_bitis === bugun()) return; // durdurulmuş programa yansımaz
  await yenidenTeslim(`${programId}/${adim.id}`, etkin, adimPaketi(p, adim, p.calisma_baslangic));
  const adimlar = await db.program_adim.where('program_id').equals(programId).toArray();
  await programGuncelle(programId, { calisma_bitis: programBitisi(p, adimlar, p.calisma_baslangic) });
}

/** Koçun Ajanda planı (uzak.plan) kendiliğinden bitmez: koç ileriki haftalara kart ekledikçe akar. */
export function programBitisi(p: ProgramRow | null | undefined, adimlar: ProgramAdimRow[], baslangic: string): string | null {
  return p?.uzak?.plan ? null : calismaBitisi(adimlar, baslangic);
}

export function calismaBitisi(adimlar: ProgramAdimRow[], baslangic: string): string | null {
  const bitisler = adimlar.map((a) => adimZamanlama(a, baslangic).bitis);
  return bitisler.includes(null) ? null : (bitisler as string[]).sort().at(-1) ?? null;
}

function adimPaketi(p: ProgramRow, a: ProgramAdimRow, baslangic: string): KartPaketi {
  return {
    surum: PAKET_SURUM,
    // Koçtan gelen programda kart kimliği belirleyici: danışanın iki cihazı aynı güncellemeyi
    // işlese de aynı kart oluşur (çift kart olmaz).
    id: p.uzak?.rol === 'danisan' ? `k-${a.id}-${p.uzak.surum}` : crypto.randomUUID(),
    tip: a.tip,
    ad: a.ad,
    bloklar: a.bloklar,
    zamanlama: adimZamanlama(a, baslangic),
    // Koçtan gelen programın kartları: koçun izinleri, geri bildirim koça gider (D6/D7).
    kaynak: { modul: p.uzak?.rol === 'danisan' ? 'danismanlik' : 'program', ref: `${p.id}/${a.id}`, etiket: p.uzak?.rol === 'danisan' ? p.uzak.karsi_ad : p.ad },
    sahip: p.uzak?.rol === 'danisan' ? p.uzak.karsi_id : 'ben',
    izinler: p.uzak?.rol === 'danisan' ? p.uzak.izinler : BAGLI_YEREL_IZIN,
    geri_bildirim: p.uzak?.rol === 'danisan' ? 'uzak' : 'yerel',
    ek: a.ek ?? null,
  };
}

export async function adimSil(adimId: string) {
  const a = await db.program_adim.get(adimId);
  await db.program_adim.delete(adimId);
  if (a && kocProgrami(await db.program.get(a.program_id))) programKancalari.degisti?.(a.program_id, bugun());
}

// Program aktif mi? Arka planda iş çalıştırmadan, tarihlerden türetilir:
// süre dolunca kendiliğinden aktif değil olur (K9).
export function aktifMi(p: ProgramRow, tarih = bugun()): boolean {
  if (!p.calisma_baslangic) return false;
  if (p.calisma_baslangic > tarih) return true; // ileri tarihli başlatma
  return p.calisma_bitis === null || p.calisma_bitis >= tarih;
}

export function adimZamanlama(a: ProgramAdimRow, baslangic: string): Zamanlama {
  const bas = tarihEkle(baslangic, a.basla_gun);
  return {
    baslangic: bas,
    bitis: a.sure_gun === null ? null : tarihEkle(bas, a.sure_gun - 1),
    gunler: a.gunler,
    saatler: a.saatler,
  };
}

// K7 — programı başlat: her adım için bir kart paketi, Ajanda'ya bağlı kart olarak teslim.
export async function baslat(programId: string, baslangic = bugun()) {
  const p = await db.program.get(programId);
  if (!p || aktifMi(p) || kocProgrami(p) || p.sablon) return; // atanan program ve şablon koçun Ajanda'sına düşmez
  const adimlar = await db.program_adim.where('program_id').equals(programId).sortBy('sira');
  // V1: görev planı olmadan da "aktif" olunur (başka yerde yürüyen bir program — Kişisel Gelişim haritası için).
  if (adimlar.length === 0) { await programGuncelle(programId, { calisma_baslangic: baslangic, calisma_bitis: null }); return; }

  const paketler = adimlar.map((a) => adimPaketi(p, a, baslangic));
  const calismaBitis = programBitisi(p, adimlar, baslangic);

  await teslimAl(paketler);
  await programGuncelle(programId, { calisma_baslangic: baslangic, calisma_bitis: calismaBitis });
}

// K9 — durdur: yarından itibaren kartlar Ajanda'dan çekilir; bugün son gün olarak kalır,
// böylece bugün işaretlenenler de dahil geçmiş kayıtlar korunur.
export async function durdur(programId: string) {
  const t = bugun();
  await kaynaktanCek(`${programId}/`, tarihEkle(t, 1));
  await db.program.update(programId, { calisma_bitis: t, guncellendi: Date.now() });
  if (kocProgrami(await db.program.get(programId))) programKancalari.durduruldu?.(programId);
}

// K8 — ilerleme: yalnızca geri bildirim günlüğünden türetilir.
export interface AdimIlerleme {
  adim: ProgramAdimRow;
  planli: number;                 // bugüne kadar planlanan gün sayısı
  yapildi: number;
  sonDegerler: Record<string, unknown> | null;
}

export interface ProgramIlerleme {
  gunN: number | null;
  gunM: number | null;            // null = süregelen
  adimlar: AdimIlerleme[];
}

export async function ilerleme(programId: string): Promise<ProgramIlerleme> {
  const p = await db.program.get(programId);
  const adimlar = await db.program_adim.where('program_id').equals(programId).sortBy('sira');
  if (!p || !p.calisma_baslangic) return { gunN: null, gunM: null, adimlar: adimlar.map((adim) => ({ adim, planli: 0, yapildi: 0, sonDegerler: null })) };

  const bas = p.calisma_baslangic;
  const t = bugun();
  const bitis = p.calisma_bitis;
  const olaylar = (await db.geri_bildirim.where('kaynak_ref').startsWith(`${programId}/`).toArray())
    .filter((o) => o.tarih >= bas)            // yeniden başlatmada önceki uygulama sayılmaz
    .sort((a, b) => a.zaman - b.zaman);

  // Her (adım, gün) için son olay kazanır.
  const durum = new Map<string, { yapildi: boolean; degerler: Record<string, unknown> | null; zaman: number }>();
  for (const o of olaylar) {
    const adimId = (o.kaynak_ref ?? '').split('/')[1];
    const anahtar = `${adimId}|${o.tarih}`;
    const onceki = durum.get(anahtar);
    durum.set(anahtar, {
      yapildi: o.olay !== 'geri_alindi',
      degerler: o.olay === 'deger' ? o.degerler : onceki?.degerler ?? null,
      zaman: o.zaman,
    });
  }

  const sonGun = bitis !== null && bitis < t ? bitis : t;
  const sonuc: AdimIlerleme[] = adimlar.map((adim) => {
    const z = adimZamanlama(adim, bas);
    let planli = 0;
    let yapildi = 0;
    let sonDegerler: Record<string, unknown> | null = null;
    let sonZaman = 0;
    for (let g = bas; g <= sonGun; g = tarihEkle(g, 1)) {
      if (!gunAktif(z, g)) continue;
      planli++;
      const d = durum.get(`${adim.id}|${g}`);
      if (d?.yapildi) yapildi++;
      if (d?.degerler && d.zaman > sonZaman) { sonDegerler = d.degerler; sonZaman = d.zaman; }
    }
    return { adim, planli, yapildi, sonDegerler };
  });

  const gunM = bitis ? Math.max(0, gunFarki(bas, bitis) + 1) : null;
  const gunN = Math.max(0, gunFarki(bas, sonGun) + 1);
  return { gunN: gunM === null ? gunN : Math.min(gunN, gunM), gunM, adimlar: sonuc };
}

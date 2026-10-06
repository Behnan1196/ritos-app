'use client';

// ————————————————————————————————————————————————————————————————
// Sınav hazırlığı paketi — katalog (26 eylül). Bkz. User Story'ler P1–P6.
//
// Katalog sunucuda herkese açık (paket). Cihaz son sürümü `katalog` tablosuna indirir.
// Kullanıcının gördüğü katalog = indirilen katalog + kendi düzenlemeleri (katalog_duzen).
// Düzenlemeler ayrı durduğu için yeni sürüm onları asla ezmez; katalogdan çıkan konu
// düzenlenmişse "katalogda yok" olarak kalır. Kimlikler sabittir (tyt-kimya.mol-kavrami).
// ————————————————————————————————————————————————————————————————

import { db, type KatalogDuzenRow, type KatalogFark, type KatalogRow, type KaynakRow, type KaynakTur, type PaketKurulumRow } from './db';
import { supabase } from './supabase';

export const PAKET = 'sinav';

export interface TestDers { ders: string; soru: number }
export interface Test { test: string; soru: number; dersler?: TestDers[]; not?: string }
export interface KonuVeri { id: string; ad: string }
export interface UniteVeri { ad: string | null; test?: string; konular: KonuVeri[] }
export interface DersVeri { id: string; ad: string; uniteler: UniteVeri[] }
export interface SinavVeri {
  kod: string; ad?: string; testler: Test[]; dersler: DersVeri[];
  notlar?: string[]; belgeler?: { baslik: string; url: string }[]; kaynaklar?: { baslik: string; url: string }[];
}

export const SINAVLAR: { kod: string; ad: string; aciklama: string }[] = [
  { kod: 'tyt', ad: 'TYT', aciklama: 'Temel Yeterlilik Testi · 120 soru' },
  { kod: 'ayt', ad: 'AYT', aciklama: 'Alan Yeterlilik Testleri · 160 soru' },
  { kod: 'lgs', ad: 'LGS', aciklama: 'Liselere Geçiş Sınavı · 90 soru' },
];

export const KAYNAK_TUR: [KaynakTur, string][] = [
  ['kitap', 'Kitap'], ['soru_bankasi', 'Soru bankası'], ['deneme', 'Deneme seti'], ['video', 'Video'], ['dokuman', 'Doküman'],
];

// ———————————————— indirme ————————————————

const SON_KONTROL = 'katalog_son_kontrol';
const KONTROL_ARALIGI = 6 * 3600_000;

interface SunucuSatir { kod: string; surum: number; onayli: boolean; veri: unknown }

async function sunucudanAl(): Promise<SunucuSatir[] | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('paket').select('kod, surum, onayli, veri').eq('paket', PAKET);
    if (error || !data?.length) return null;
    return data as SunucuSatir[];
  } catch { return null; }
}

// Sunucuya ulaşılamazsa uygulamayla gelen kopya (P1).
async function yedektenAl(): Promise<SunucuSatir[]> {
  const [k, o] = await Promise.all([
    fetch('/paketler/sinav-katalog.v1.json').then((r) => r.json()),
    fetch('/paketler/sinav-ornek-kaynaklar.v1.json').then((r) => r.json()),
  ]);
  const satirlar: SunucuSatir[] = (k.sinavlar as SinavVeri[]).map((s) => ({
    kod: s.kod.toLowerCase(), surum: k.surum, onayli: false,
    veri: { ...s, belgeler: s.kaynaklar, kaynaklar: undefined },
  }));
  satirlar.push({ kod: 'ornek-kaynaklar', surum: o.surum, onayli: false, veri: { kaynaklar: o.kaynaklar } });
  return satirlar;
}

/** Katalogu indir/yenile. `zorla` değilse en fazla 6 saatte bir sunucuya sorar. */
export async function katalogYenile(zorla = false): Promise<void> {
  const son = (await db.ayar.get(SON_KONTROL))?.deger as number | undefined;
  const mevcut = await db.katalog.where('paket').equals(PAKET).toArray();
  if (!zorla && mevcut.length && son && Date.now() - son < KONTROL_ARALIGI) return;
  let satirlar = await sunucudanAl();
  if (!satirlar) {
    if (mevcut.length) return;          // elde kopya var; sonra yeniden denenir
    satirlar = await yedektenAl();
  } else {
    await db.ayar.put({ anahtar: SON_KONTROL, deger: Date.now() });
  }
  const eski = new Map(mevcut.map((m) => [m.kod, m]));
  const yazilacak: KatalogRow[] = [];
  for (const s of satirlar) {
    const e = eski.get(s.kod);
    if (e && e.surum >= s.surum && e.onayli === s.onayli) continue;
    const fark = e && e.surum < s.surum && s.kod !== 'ornek-kaynaklar'
      ? farkHesapla(e.veri as SinavVeri, s.veri as SinavVeri, e.surum, s.surum) : (e?.fark ?? null);
    yazilacak.push({ kod: s.kod, paket: PAKET, surum: s.surum, onayli: s.onayli, veri: s.veri, indirildi: Date.now(), fark });
  }
  if (yazilacak.length) await db.katalog.bulkPut(yazilacak);
}

function konuHaritasi(v: SinavVeri): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of v.dersler) for (const u of d.uniteler) for (const k of u.konular) m.set(k.id, k.ad);
  return m;
}

export function farkHesapla(eski: SinavVeri, yeni: SinavVeri, es: number, ys: number): KatalogFark {
  const a = konuHaritasi(eski), b = konuHaritasi(yeni);
  const eklenen: string[] = [], adiDegisen: string[] = [], cikan: string[] = [];
  b.forEach((ad, id) => { if (!a.has(id)) eklenen.push(ad); else if (a.get(id) !== ad) adiDegisen.push(`${a.get(id)} → ${ad}`); });
  a.forEach((ad, id) => { if (!b.has(id)) cikan.push(ad); });
  return { eski: es, yeni: ys, eklenen, adiDegisen, cikan };
}

// ———————————————— kurulum (P1) ————————————————

export async function kurulum(): Promise<PaketKurulumRow | undefined> {
  return db.paket_kurulum.get(PAKET);
}

export async function paketKur(secim: string[], yeniOzel: string | null): Promise<void> {
  await katalogYenile();
  const k = await kurulum();
  const ozel = [...(k?.ozel ?? [])];
  const sec = [...secim];
  if (yeniOzel?.trim()) {
    const kod = `ozel-${crypto.randomUUID().slice(0, 8)}`;
    ozel.push({ kod, ad: yeniOzel.trim() });
    sec.push(kod);
  }
  const gorulen: Record<string, number> = { ...(k?.gorulen ?? {}) };
  for (const kat of await db.katalog.where('paket').equals(PAKET).toArray()) if (sec.includes(kat.kod) && !gorulen[kat.kod]) gorulen[kat.kod] = kat.surum;
  await db.paket_kurulum.put({ id: PAKET, secim: sec, ozel, gorulen, guncellendi: Date.now() });
}

/** Paketi kaldır — düzenlemeler ve kaynaklar kalır; yeniden kurulunca geri gelir. */
export async function paketKaldir(): Promise<void> {
  await db.paket_kurulum.delete(PAKET);
}

export async function farkGoruldu(kod: string, surum: number): Promise<void> {
  const k = await kurulum();
  if (!k) return;
  await db.paket_kurulum.put({ ...k, gorulen: { ...k.gorulen, [kod]: surum }, guncellendi: Date.now() });
}

// ———————————————— birleşik katalog (P2/P3) ————————————————

export interface Oge {
  id: string; tur: 'ders' | 'unite' | 'konu'; ad: string; sira: number;
  ek: boolean; degisti: boolean; gizli: boolean; katalogdaYok: boolean; ust_id: string | null;
}
export interface Konu extends Oge { tur: 'konu' }
export interface Unite extends Oge { tur: 'unite'; test?: string; konular: Konu[] }
export interface Ders extends Oge { tur: 'ders'; uniteler: Unite[] }

export function slug(s: string): string {
  const tr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => tr[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}
export const uniteId = (dersId: string, ad: string | null) => `${dersId}~${slug(ad ?? 'genel')}`;

/** İndirilen katalog + kullanıcının düzenlemeleri → gösterilecek ağaç. */
export function birlestir(veri: SinavVeri | null, duzenler: KatalogDuzenRow[]): Ders[] {
  const ogeler = new Map<string, Oge & { test?: string }>();
  if (veri) {
    veri.dersler.forEach((d, di) => {
      ogeler.set(d.id, { id: d.id, tur: 'ders', ad: d.ad, sira: di * 10, ek: false, degisti: false, gizli: false, katalogdaYok: false, ust_id: null });
      d.uniteler.forEach((u, ui) => {
        const uid = uniteId(d.id, u.ad);
        if (!ogeler.has(uid)) ogeler.set(uid, { id: uid, tur: 'unite', ad: u.ad ?? 'Genel', sira: ui * 10, ek: false, degisti: false, gizli: false, katalogdaYok: false, ust_id: d.id, test: u.test });
        u.konular.forEach((k, ki) => {
          ogeler.set(k.id, { id: k.id, tur: 'konu', ad: k.ad, sira: ki * 10, ek: false, degisti: false, gizli: false, katalogdaYok: false, ust_id: uid });
        });
      });
    });
  }
  for (const z of duzenler) {
    const o = ogeler.get(z.id);
    if (o) {
      const adDegisti = z.ad !== null && z.ad !== o.ad;
      const yerDegisti = z.ust_id !== null && z.ust_id !== o.ust_id && z.tur !== 'ders';
      ogeler.set(z.id, {
        ...o, ad: z.ad ?? o.ad, sira: z.sira ?? o.sira, gizli: z.gizli,
        ust_id: yerDegisti ? z.ust_id : o.ust_id, degisti: adDegisti || yerDegisti,
      });
    } else {
      ogeler.set(z.id, { id: z.id, tur: z.tur, ad: z.ad ?? '(adsız)', sira: z.sira ?? 9999, ek: z.ek, degisti: false, gizli: z.gizli, katalogdaYok: !z.ek, ust_id: z.ust_id });
    }
  }
  const sirali = <T extends Oge>(a: T[]) => a.sort((x, y) => x.sira - y.sira || x.ad.localeCompare(y.ad, 'tr'));
  const hepsi = Array.from(ogeler.values());
  const dersler = sirali(hepsi.filter((o) => o.tur === 'ders')).map((d) => ({ ...d, tur: 'ders' as const, uniteler: [] as Unite[] }));
  const dersMap = new Map(dersler.map((d) => [d.id, d]));
  const uniteMap = new Map<string, Unite>();
  for (const u of sirali(hepsi.filter((o) => o.tur === 'unite'))) {
    const d = u.ust_id ? dersMap.get(u.ust_id) : undefined;
    if (!d) continue;
    const un: Unite = { ...u, tur: 'unite', konular: [] };
    d.uniteler.push(un);
    uniteMap.set(u.id, un);
  }
  for (const k of sirali(hepsi.filter((o) => o.tur === 'konu'))) {
    const u = k.ust_id ? uniteMap.get(k.ust_id) : undefined;
    if (u) u.konular.push({ ...k, tur: 'konu' });
  }
  return dersler;
}

export function sinavVerisi(katalog: KatalogRow[], kod: string): SinavVeri | null {
  return (katalog.find((k) => k.kod === kod)?.veri as SinavVeri | undefined) ?? null;
}

export function sinavAdi(kod: string, k?: PaketKurulumRow): string {
  return SINAVLAR.find((s) => s.kod === kod)?.ad ?? k?.ozel.find((o) => o.kod === kod)?.ad ?? kod;
}

export function konuSayisi(dersler: Ders[], gizliDahil = false): number {
  return dersler.reduce((t, d) => t + (d.gizli && !gizliDahil ? 0 : d.uniteler.reduce((a, u) => a + (u.gizli && !gizliDahil ? 0 : u.konular.filter((k) => gizliDahil || !k.gizli).length), 0)), 0);
}

// ———————————————— düzenleme (P3) ————————————————

async function duzenYaz(o: Pick<Oge, 'id' | 'tur' | 'ust_id'> & { ek: boolean }, sinav: string, degisiklik: Partial<Pick<KatalogDuzenRow, 'ad' | 'sira' | 'gizli' | 'ust_id'>>) {
  const v = await db.katalog_duzen.get(o.id);
  const temel: KatalogDuzenRow = v ?? { id: o.id, sinav, tur: o.tur, ek: o.ek, ust_id: o.ek ? o.ust_id : null, ad: null, sira: null, gizli: false, guncellendi: 0 };
  await db.katalog_duzen.put({ ...temel, ...degisiklik, guncellendi: Date.now() });
}

export async function ogeAdlandir(o: Oge, sinav: string, ad: string) {
  await duzenYaz(o, sinav, { ad: ad.trim() || null });
}

export async function ogeGizle(o: Oge, sinav: string, gizli: boolean) {
  await duzenYaz(o, sinav, { gizli });
}

/** Kardeşler arasında bir yukarı/aşağı taşı: tüm kardeşlerin sırası yazılır (katalogdaki sıra bozulmasın diye). */
export async function ogeTasi(o: Oge, kardesler: Oge[], sinav: string, yon: -1 | 1) {
  const i = kardesler.findIndex((k) => k.id === o.id);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= kardesler.length) return;
  const yeni = [...kardesler];
  [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
  for (let n = 0; n < yeni.length; n++) if (yeni[n].sira !== n * 10) await duzenYaz(yeni[n], sinav, { sira: n * 10 });
}

/** Katalogdaki haline döndür (yalnız katalog öğeleri). */
export async function ogeSifirla(o: Oge) {
  if (!o.ek) await db.katalog_duzen.delete(o.id);
}

/** Eklenen öğeyi sil — altındaki eklenen öğelerle birlikte. Katalog öğesi silinmez, gizlenir. */
export async function ogeSil(o: Oge) {
  if (!o.ek) return;
  const altlar = await db.katalog_duzen.where('sinav').equals((await db.katalog_duzen.get(o.id))?.sinav ?? '').toArray();
  const silinecek = new Set([o.id]);
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const a of altlar) if (a.ust_id && silinecek.has(a.ust_id) && !silinecek.has(a.id)) { silinecek.add(a.id); degisti = true; }
  }
  await db.katalog_duzen.bulkDelete(Array.from(silinecek));
}

export async function ogeEkle(sinav: string, tur: Oge['tur'], ust_id: string | null, ad: string, sira: number): Promise<string> {
  const id = `${sinav}-ek-${crypto.randomUUID().slice(0, 8)}`;
  await db.katalog_duzen.put({ id, sinav, tur, ek: true, ust_id, ad: ad.trim(), sira, gizli: false, guncellendi: Date.now() });
  return id;
}

// ———————————————— tablodan içe aktarma (P4) ————————————————

export interface IceAktarimSatir { ders: string; unite: string; konu: string }

/** Excel'den yapıştırılan metin: sekme, noktalı virgül ya da | ile ayrılmış Ders | Ünite | Konu (ya da Ders | Konu). */
export function tabloCoz(metin: string): { satirlar: IceAktarimSatir[]; hatali: number } {
  const satirlar: IceAktarimSatir[] = [];
  let hatali = 0;
  let sonDers = '', sonUnite = '';
  for (const ham of metin.split(/\r?\n/)) {
    if (!ham.trim()) continue;
    const ayrac = ham.includes('\t') ? '\t' : ham.includes(';') ? ';' : ham.includes('|') ? '|' : null;
    const h = (ayrac ? ham.split(ayrac) : [ham]).map((x) => x.trim());
    let ders: string, unite: string, konu: string;
    if (h.length >= 3) [ders, unite, konu] = h;
    else if (h.length === 2) { [ders, konu] = h; unite = ''; }
    else { hatali++; continue; }
    // Excel'de birleştirilmiş hücreler boş gelir: üstteki değeri devral.
    ders = ders || sonDers; unite = unite || (ders === sonDers ? sonUnite : '');
    if (!ders || !konu) { hatali++; continue; }
    if (/^ders$/i.test(ders) && /^konu$/i.test(konu)) continue; // başlık satırı
    sonDers = ders; sonUnite = unite;
    satirlar.push({ ders, unite, konu });
  }
  return { satirlar, hatali };
}

/** Satırları mevcut ağaca ekle: ders/ünite adıyla eşleşirse ona, yoksa yenisini açar. Aynı adlı konu tekrar eklenmez. */
export async function iceAktar(sinav: string, mevcut: Ders[], satirlar: IceAktarimSatir[]): Promise<{ ders: number; unite: number; konu: number }> {
  const say = { ders: 0, unite: 0, konu: 0 };
  const esit = (a: string, b: string) => a.toLocaleLowerCase('tr').trim() === b.toLocaleLowerCase('tr').trim();
  const agac = mevcut.map((d) => ({ id: d.id, ad: d.ad, uniteler: d.uniteler.map((u) => ({ id: u.id, ad: u.ad, konular: u.konular.map((k) => k.ad), n: u.konular.length })), n: d.uniteler.length }));
  for (const s of satirlar) {
    let d = agac.find((x) => esit(x.ad, s.ders));
    if (!d) {
      const id = await ogeEkle(sinav, 'ders', null, s.ders, (agac.length + 1) * 10 + 1000);
      d = { id, ad: s.ders, uniteler: [], n: 0 }; agac.push(d); say.ders++;
    }
    const uAd = s.unite || 'Genel';
    let u = d.uniteler.find((x) => esit(x.ad, uAd));
    if (!u) {
      const id = await ogeEkle(sinav, 'unite', d.id, uAd, (d.uniteler.length + 1) * 10 + 1000);
      u = { id, ad: uAd, konular: [], n: 0 }; d.uniteler.push(u); say.unite++;
    }
    if (u.konular.some((k) => esit(k, s.konu))) continue;
    await ogeEkle(sinav, 'konu', u.id, s.konu, (u.konular.length + 1) * 10 + 1000);
    u.konular.push(s.konu); say.konu++;
  }
  return say;
}

// ———————————————— kaynaklar (P6) ————————————————

export async function kaynakKaydet(k: Omit<KaynakRow, 'id' | 'guncellendi'> & { id?: string }) {
  await db.kaynak.put({ ...k, id: k.id ?? crypto.randomUUID(), ad: k.ad.trim(), url: k.url.trim(), guncellendi: Date.now() });
}

export async function kaynakSil(id: string) {
  await db.kaynak.delete(id);
}

/** Örnek listeyi ekle — aynı bağlantıdaki kaynak tekrar eklenmez. */
export async function ornekKaynaklariEkle(): Promise<number> {
  await katalogYenile();
  const o = (await db.katalog.get('ornek-kaynaklar'))?.veri as { kaynaklar: { ad: string; tur: KaynakTur; url: string; dersler: string[] }[] } | undefined;
  if (!o) return 0;
  const var_ = new Set((await db.kaynak.toArray()).map((k) => k.url));
  let n = 0;
  for (const k of o.kaynaklar) {
    if (var_.has(k.url)) continue;
    await kaynakKaydet({ ad: k.ad, tur: k.tur, url: k.url, dersler: k.dersler, not: '' });
    n++;
  }
  return n;
}

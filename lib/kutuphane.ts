// ————————————————————————————————————————————————————————————————
// Kütüphane (30 eylül) — topla, tasnif et, uygula.
// Gelişim sekmesinin yerini alır: klasör ağacı (en fazla 3 seviye) ve içinde tarihsiz kartlar.
// Kart Ajanda'dakiyle aynı tek karttır (çoklu video, açıklama, süre kaydı…). "Ajandaya al" ile
// kopyası seçilen güne/günlere düşer (kaynak_ref "kut:<id>"); asıl kart burada kalır ve kaç kez
// uygulandığını bilir. Taşıma kes/yapıştır ile (sürükle-bırak yok).
// Alanlar V1'de yok; eski alan satırları üst klasör gibi görünür. Programlar (eski) klasörde ayrı öğe.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type KlasorRow, type KutuphaneKartRow } from './db';
import { teslimAl } from './ajanda';
import { EN_FAZLA_SEVIYE, seviye } from './alan';
import { PAKET_SURUM, TAM_IZIN, bugun, tarihEkle, type Blok, type PaketEk, type TemelTip } from './paket';

export const KUT_ONEK = 'kut:';

async function sonSira(klasorId: string | null): Promise<number> {
  const kartlar = await db.kutuphane_kart.filter((k) => k.klasor_id === klasorId).toArray();
  const klasorler = await db.klasor.filter((k) => k.ust_id === klasorId).toArray();
  return Math.max(0, ...kartlar.map((k) => k.sira), ...klasorler.map((k) => k.sira ?? 0)) + 1;
}

// ———————————————— klasörler ————————————————

export async function klasorOlustur(ad: string, ustId: string | null): Promise<string> {
  const hepsi = await db.klasor.toArray();
  if (ustId) {
    const ust = hepsi.find((k) => k.id === ustId);
    if (!ust) throw new Error('Üst klasör bulunamadı.');
    if (seviye(ust, hepsi) >= EN_FAZLA_SEVIYE) throw new Error(`En fazla ${EN_FAZLA_SEVIYE} seviye klasör olur.`);
  }
  const id = crypto.randomUUID();
  await db.klasor.add({ id, ad: ad.trim(), ust_id: ustId, tur: 'klasor', sira: await sonSira(ustId), guncellendi: Date.now() });
  return id;
}

export const klasorAdDegistir = (id: string, ad: string) => db.klasor.update(id, { ad: ad.trim(), guncellendi: Date.now() });

/** Alt ağacın derinliği (klasörün kendisi = 1). */
function derinlik(id: string, hepsi: KlasorRow[]): number {
  const altlar = hepsi.filter((k) => k.ust_id === id);
  return 1 + (altlar.length ? Math.max(...altlar.map((a) => derinlik(a.id, hepsi))) : 0);
}

export async function klasorTasi(id: string, hedefUst: string | null) {
  const hepsi = await db.klasor.toArray();
  if (hedefUst === id) return;
  // Kendi alt klasörüne taşınamaz.
  let u = hedefUst;
  while (u) { if (u === id) throw new Error('Klasör kendi içine taşınamaz.'); u = hepsi.find((k) => k.id === u)?.ust_id ?? null; }
  const hedefSeviye = hedefUst ? seviye(hepsi.find((k) => k.id === hedefUst)!, hepsi) : 0;
  if (hedefSeviye + derinlik(id, hepsi) > EN_FAZLA_SEVIYE) throw new Error(`Taşınınca ${EN_FAZLA_SEVIYE} seviyeyi aşıyor.`);
  await db.klasor.update(id, { ust_id: hedefUst, tur: 'klasor', sira: await sonSira(hedefUst), guncellendi: Date.now() });
}

/** Silme: içindekiler (kartlar, alt klasörler, programlar) bir üst klasöre çıkar; hiçbir şey kaybolmaz. */
export async function klasorSilIcerikUste(id: string) {
  const k = await db.klasor.get(id);
  if (!k) return;
  await db.transaction('rw', db.klasor, db.kutuphane_kart, db.program, async () => {
    const simdi = Date.now();
    await db.klasor.where('ust_id').equals(id).modify({ ust_id: k.ust_id, tur: 'klasor', guncellendi: simdi });
    await db.kutuphane_kart.where('klasor_id').equals(id).modify({ klasor_id: k.ust_id, guncellendi: simdi });
    await db.program.where('klasor_id').equals(id).modify({ klasor_id: k.ust_id, guncellendi: simdi });
    await db.klasor.delete(id);
  });
}

// ———————————————— kartlar ————————————————

export interface KutKartTaslak { tip?: TemelTip; ad: string; bloklar: Blok[]; ek?: PaketEk | null }

export async function kutKartEkle(klasorId: string | null, t: KutKartTaslak): Promise<string> {
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.kutuphane_kart.add({ id, klasor_id: klasorId, tip: t.tip ?? 'yap', ad: t.ad.trim(), bloklar: t.bloklar, ek: t.ek ?? null, sira: await sonSira(klasorId), olusturuldu: simdi, guncellendi: simdi });
  return id;
}

export const kutKartGuncelle = (id: string, t: KutKartTaslak) =>
  db.kutuphane_kart.update(id, { ad: t.ad.trim(), bloklar: t.bloklar, guncellendi: Date.now() });

export async function kutKartTasi(id: string, klasorId: string | null) {
  await db.kutuphane_kart.update(id, { klasor_id: klasorId, sira: await sonSira(klasorId), guncellendi: Date.now() });
}

export const kutKartSil = (id: string) => db.kutuphane_kart.delete(id);

/** Ajanda'daki bir kartın tanımını kütüphaneye kopyala. */
export async function ajandadanKaydet(k: AjandaKartRow, klasorId: string | null): Promise<string> {
  return kutKartEkle(klasorId, { tip: k.tip === 'oku' ? 'yap' : k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null });
}

/** "Ajandaya al": kopyası seçilen güne (istenirse birkaç güne) düşer; bağımsız, düzenlenebilir bir kart olur. */
export async function ajandayaAl(k: KutuphaneKartRow, secim: { tarih: string; saat: string; gun: number | null; gunler: number[] | null }) {
  const n = secim.gun;
  await teslimAl([{
    surum: PAKET_SURUM, id: crypto.randomUUID(), tip: k.tip, ad: k.ad, bloklar: k.bloklar,
    zamanlama: {
      baslangic: secim.tarih,
      bitis: n === 1 ? secim.tarih : n && n > 1 ? tarihEkle(secim.tarih, n - 1) : null,
      gunler: secim.gunler && secim.gunler.length && secim.gunler.length < 7 ? secim.gunler : null,
      saatler: secim.saat ? [secim.saat] : [],
    },
    kaynak: { modul: 'ajanda', ref: `${KUT_ONEK}${k.id}`, etiket: null },
    sahip: 'ben', izinler: TAM_IZIN, geri_bildirim: 'yok', ek: k.ek ?? null,
  }]);
}

export interface KutKullanim { yapildi: number; son: string | null; siradaki: string | null }

/** Kaç kez uygulandı, en son ne zaman, Ajanda'da sıradaki gün. */
export async function kutKullanimlari(): Promise<Record<string, KutKullanim>> {
  const kartlar = (await db.ajanda_kart.where('kaynak_ref').startsWith(KUT_ONEK).toArray());
  if (!kartlar.length) return {};
  const kayitlar = await db.ajanda_kayit.where('kart_id').anyOf(kartlar.map((k) => k.id)).filter((r) => r.yapildi).toArray();
  const t0 = bugun();
  const sonuc: Record<string, KutKullanim> = {};
  for (const k of kartlar) {
    const id = k.kaynak_ref!.slice(KUT_ONEK.length);
    const s = sonuc[id] ?? { yapildi: 0, son: null, siradaki: null };
    for (const r of kayitlar.filter((x) => x.kart_id === k.id)) { s.yapildi++; if (!s.son || r.tarih > s.son) s.son = r.tarih; }
    const ileri = k.bitis === null || k.bitis >= t0 ? (k.baslangic > t0 ? k.baslangic : t0) : null;
    if (ileri && (!s.siradaki || ileri < s.siradaki)) s.siradaki = ileri;
    sonuc[id] = s;
  }
  return sonuc;
}

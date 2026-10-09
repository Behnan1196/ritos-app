'use client';

// ————————————————————————————————————————————————————————————————
// Yaşam alanları (5 ekim) — Rutinlerim. Alanlar KAP değil MERCEK: rutin (program) düz listede durur,
// etiketle bir ya da birkaç alana dokunur (ProgramRow.alanlar). 8 hazır alanla başlar; kullanıcı
// sıralar, gizler, adını/simgesini değiştirir, kendi alanını ekler. Hazırlar silinmez, gizlenir.
// Öz değerlendirme ve denge 3. adımda (alan_degerlendirme tablosu).
// ————————————————————————————————————————————————————————————————

import { db, type YasamAlaniRow } from './db';
import { aktifCerceve, bilinenAlanAdi, cerceve } from './cerceve';

/** Etkin çerçevenin hazır alanları (9 ekim: alanlar paketten gelir, bkz. lib/cerceve.ts). */
export const hazirAlanlar = () => cerceve().alanlar;
export const EN_FAZLA_GORUNEN = 10;
export const ALAN_IKONLARI = ['🏃', '🥗', '😴', '🧘', '🤝', '📚', '🎨', '🧭', '💼', '💰', '🏡', '🌿', '🙏', '❤️', '🧠', '🎵', '✈️', '🐾', '👶', '🛠'];
export const hazirId = (kod: string) => `alan:${kod}`;

/**
 * Hazır alanlar yoksa kurar. Senkron işareti koymadan yazılır (db.uzaktan): böylece yeni bir cihazda
 * kurulan varsayılanlar sunucudaki (kullanıcının değiştirdiği) halin üzerine yazmaz; sunucu hali gelince yerini alır.
 */
export async function alanlariGaranti() {
  const c = await aktifCerceve();
  const var_ = new Set((await db.yasam_alani.toArray()).map((a) => a.id));
  const eksik: YasamAlaniRow[] = c.alanlar
    .map((h, i) => ({ id: hazirId(h.kod), kod: h.kod, ad: h.ad, ikon: h.ikon, aciklama: h.kisa ?? '', sira: i + 1, gizli: false, guncellendi: 0 }))
    .filter((a) => !var_.has(a.id));
  if (!eksik.length) return;
  db.uzaktan = true;
  try { await db.yasam_alani.bulkPut(eksik); } finally { db.uzaktan = false; }
}

/** Görünen alan listesi: etkin çerçevenin alanları + kişinin kendi alanları (başka çerçevenin alanları saklanır, görünmez). */
export async function alanlar(): Promise<YasamAlaniRow[]> {
  const c = await aktifCerceve();
  const kodlar = new Set(c.alanlar.map((a) => a.kod));
  return (await db.yasam_alani.toArray()).filter((a) => !a.kod || kodlar.has(a.kod)).sort((a, b) => a.sira - b.sira);
}

export async function alanGuncelle(id: string, patch: Partial<Omit<YasamAlaniRow, 'id' | 'kod'>>) {
  // Ad değiştiyse hazır alanın adı artık kullanıcınındır (dil değişse de korunur).
  const ek = patch.ad !== undefined ? { ad_ozel: true } : {};
  await db.yasam_alani.update(id, { ...patch, ...ek, guncellendi: Date.now() });
}

/** Ekranda görünen ad: hazır alanın adını kullanıcı değiştirmediyse o anki dilin adı (şimdilik Türkçe). Etiketler addan değil kimlikten (alan:<kod>) gider. */
export function alanAdi(a: Pick<YasamAlaniRow, 'kod' | 'ad' | 'ad_ozel'>): string {
  if (a.kod && !a.ad_ozel) return bilinenAlanAdi(a.kod) ?? a.ad;
  return a.ad;
}

export async function alanEkle(ad: string, ikon: string, aciklama = ''): Promise<string> {
  const hepsi = await db.yasam_alani.toArray();
  const id = crypto.randomUUID();
  await db.yasam_alani.add({ id, kod: null, ad: ad.trim(), ikon, aciklama: aciklama.trim(), sira: hepsi.reduce((m, a) => Math.max(m, a.sira), 0) + 1, gizli: false, guncellendi: Date.now() });
  return id;
}

/** Yalnız kullanıcının eklediği alan silinir; rutinlerdeki etiketi de kalkar. */
export async function alanSil(id: string) {
  const a = await db.yasam_alani.get(id);
  if (!a || a.kod) return;
  await db.transaction('rw', db.yasam_alani, db.program, async () => {
    for (const p of await db.program.toArray()) {
      if (p.alanlar?.includes(id)) await db.program.update(p.id, { alanlar: p.alanlar.filter((x) => x !== id), guncellendi: Date.now() });
    }
    await db.yasam_alani.delete(id);
  });
}

/** Sırayı yeniden yazar (verilen kimlik sırasına göre). */
export async function alanSirala(idler: string[]) {
  await db.transaction('rw', db.yasam_alani, async () => {
    for (let i = 0; i < idler.length; i++) await db.yasam_alani.update(idler[i], { sira: i + 1, guncellendi: Date.now() });
  });
}

export async function rutinAlanlari(programId: string, alanIdler: string[]) {
  await db.program.update(programId, { alanlar: alanIdler, guncellendi: Date.now() });
}

/** Rutin adından önerilen hazır alan kimlikleri (etkin çerçevedeki anahtar kelimelerden). */
export function alanOner(ad: string): string[] {
  const m = ` ${ad.toLocaleLowerCase('tr')} `;
  return cerceve().alanlar.filter((a) => (a.anahtarlar ?? []).some((k) => m.includes(k))).map((a) => hazirId(a.kod));
}

/** Hazır alan için önerilen kriterler (kriterli değerlendirme açılınca gelir; kullanıcı değiştirir). */
export const onerilenKriter = (kod: string | null | undefined): string[] => (kod ? cerceve().alanlar.find((a) => a.kod === kod)?.kriterler ?? [] : []);

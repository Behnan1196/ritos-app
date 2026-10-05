'use client';

// ————————————————————————————————————————————————————————————————
// Yaşam alanları (5 ekim) — Rutinlerim. Alanlar KAP değil MERCEK: rutin (program) düz listede durur,
// etiketle bir ya da birkaç alana dokunur (ProgramRow.alanlar). 8 hazır alanla başlar; kullanıcı
// sıralar, gizler, adını/simgesini değiştirir, kendi alanını ekler. Hazırlar silinmez, gizlenir.
// Öz değerlendirme ve denge 3. adımda (alan_degerlendirme tablosu).
// ————————————————————————————————————————————————————————————————

import { db, type YasamAlaniRow } from './db';

export const HAZIR_ALANLAR: { kod: string; ad: string; ikon: string; aciklama: string }[] = [
  { kod: 'hareket', ad: 'Hareket', ikon: '🏃', aciklama: 'egzersiz, yürüyüş, esneme' },
  { kod: 'beslenme', ad: 'Beslenme', ikon: '🥗', aciklama: 'öğünler, su, mutfak' },
  { kod: 'uyku', ad: 'Uyku', ikon: '😴', aciklama: 'uyku düzeni, dinlenme' },
  { kod: 'zihin', ad: 'Zihin', ikon: '🧘', aciklama: 'nefes, meditasyon, stres' },
  { kod: 'sosyal', ad: 'Sosyal bağlar', ikon: '🤝', aciklama: 'aile, arkadaşlar, birlikte vakit' },
  { kod: 'ogrenme', ad: 'Öğrenme', ikon: '📚', aciklama: 'okuma, kurs, beceri' },
  { kod: 'keyif', ad: 'Keyif', ikon: '🎨', aciklama: 'hobi, oyun, yaratıcılık' },
  { kod: 'anlam', ad: 'Anlam', ikon: '🧭', aciklama: 'değerler, katkı, gönüllülük' },
];
export const EN_FAZLA_GORUNEN = 10;
export const ALAN_IKONLARI = ['🏃', '🥗', '😴', '🧘', '🤝', '📚', '🎨', '🧭', '💼', '💰', '🏡', '🌿', '🙏', '❤️', '🧠', '🎵', '✈️', '🐾', '👶', '🛠'];
export const hazirId = (kod: string) => `alan:${kod}`;

/**
 * Hazır alanlar yoksa kurar. Senkron işareti koymadan yazılır (db.uzaktan): böylece yeni bir cihazda
 * kurulan varsayılanlar sunucudaki (kullanıcının değiştirdiği) halin üzerine yazmaz; sunucu hali gelince yerini alır.
 */
export async function alanlariGaranti() {
  const var_ = new Set((await db.yasam_alani.toArray()).map((a) => a.id));
  const eksik: YasamAlaniRow[] = HAZIR_ALANLAR
    .map((h, i) => ({ id: hazirId(h.kod), kod: h.kod, ad: h.ad, ikon: h.ikon, aciklama: h.aciklama, sira: i + 1, gizli: false, guncellendi: 0 }))
    .filter((a) => !var_.has(a.id));
  if (!eksik.length) return;
  db.uzaktan = true;
  try { await db.yasam_alani.bulkPut(eksik); } finally { db.uzaktan = false; }
}

export async function alanlar(): Promise<YasamAlaniRow[]> {
  return (await db.yasam_alani.toArray()).sort((a, b) => a.sira - b.sira);
}

export async function alanGuncelle(id: string, patch: Partial<Omit<YasamAlaniRow, 'id' | 'kod'>>) {
  await db.yasam_alani.update(id, { ...patch, guncellendi: Date.now() });
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

// Addan alan önerisi — yalnız hazır alanlar için, kaba anahtar kelimeler.
const ONERI: [string, string[]][] = [
  ['yürü', ['hareket']], ['koş', ['hareket']], ['spor', ['hareket']], ['egzersiz', ['hareket']], ['esneme', ['hareket']], ['yoga', ['hareket', 'zihin']],
  ['pilates', ['hareket']], ['bisiklet', ['hareket']], ['yüz', ['hareket']], ['salon', ['hareket']], ['tai chi', ['hareket', 'zihin']],
  ['öğün', ['beslenme']], ['kahvaltı', ['beslenme']], ['yemek', ['beslenme']], ['su iç', ['beslenme']], ['beslen', ['beslenme']], ['diyet', ['beslenme']], ['tarif', ['beslenme', 'keyif']],
  ['uyku', ['uyku']], ['uyu', ['uyku']], ['ekran kapat', ['uyku']], ['yatış', ['uyku']],
  ['medit', ['zihin']], ['nefes', ['zihin']], ['şükran', ['zihin', 'anlam']], ['günlük yaz', ['zihin']], ['stres', ['zihin']],
  ['arkadaş', ['sosyal']], ['aile', ['sosyal']], ['ara ', ['sosyal']], ['ziyaret', ['sosyal']], ['buluş', ['sosyal']],
  ['kitap', ['ogrenme', 'keyif']], ['oku', ['ogrenme']], ['ingilizce', ['ogrenme']], ['dil', ['ogrenme']], ['kurs', ['ogrenme']], ['ders', ['ogrenme']], ['lgs', ['ogrenme']], ['tyt', ['ogrenme']],
  ['gitar', ['ogrenme', 'keyif']], ['piyano', ['ogrenme', 'keyif']], ['müzik', ['keyif']], ['resim', ['keyif']], ['çiz', ['keyif']], ['bahçe', ['keyif', 'hareket']], ['hobi', ['keyif']],
  ['gönüllü', ['anlam', 'sosyal']], ['bağış', ['anlam']], ['ibadet', ['anlam']], ['dua', ['anlam']],
];
/** Rutin adından önerilen hazır alan kimlikleri. */
export function alanOner(ad: string): string[] {
  const a = ` ${ad.toLocaleLowerCase('tr')} `;
  return Array.from(new Set(ONERI.filter(([k]) => a.includes(k)).flatMap(([, v]) => v))).map(hazirId);
}

// Hazır alanlar için önerilen kriterler (kriterli değerlendirme açılınca gelir; kullanıcı değiştirir).
export const ONERILEN_KRITER: Record<string, string[]> = {
  hareket: ['Haftada yeterince hareket ediyorum', 'Gün içinde uzun süre oturmuyorum', 'Bedenim güçlü ve esnek hissediyor'],
  beslenme: ['Düzenli ve dengeli yiyorum', 'Yeterince su içiyorum', 'Ne yediğimin farkındayım'],
  uyku: ['Dinlenmiş uyanıyorum', 'Uyku saatim düzenli', 'Kolay uykuya dalıyorum'],
  zihin: ['Stresle baş edebiliyorum', 'Kendime sakin anlar ayırıyorum', 'Duygularımı fark ediyorum'],
  sosyal: ['Yakınlarımla yeterince vakit geçiriyorum', 'Derdimi anlatabileceğim biri var', 'Yalnız hissetmiyorum'],
  ogrenme: ['Yeni bir şey öğreniyorum', 'Merakımı besliyorum'],
  keyif: ['Kendime keyif veren şeylere vakit ayırıyorum', 'Gülüyor, eğleniyorum'],
  anlam: ['Yaptıklarım bana önemli geliyor', 'Kendimden büyük bir şeye katkı veriyorum'],
};

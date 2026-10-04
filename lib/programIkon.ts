// 4 ekim — kişisel program simgesi. Ada göre öneri (gitar → 🎸), elle seçilebilir; yoksa 🌱.

export const VARSAYILAN_IKON = '🌱';

const ONERILER: [RegExp, string][] = [
  [/gitar/, '🎸'], [/piyano|klavye|org\b/, '🎹'], [/keman|viyolin/, '🎻'], [/davul|bateri/, '🥁'], [/şarkı|vokal|müzik|nota/, '🎵'],
  [/koşu|maraton/, '🏃'], [/yürüyüş|adım/, '🚶'], [/bisiklet/, '🚴'], [/yüzme|havuz/, '🏊'], [/yoga|esneme|pilates/, '🧘'],
  [/meditasyon|nefes|farkındalık/, '🧘'], [/fitness|ağırlık|spor|egzersiz|antrenman|kas/, '🏋️'],
  [/kitap|okuma|oku/, '📖'], [/ingilizce|almanca|fransızca|ispanyolca|dil\b|kelime/, '🗣️'],
  [/kod|yazılım|program|python|javascript/, '💻'], [/yazı|günlük|blog|roman/, '✍️'], [/resim|çizim|boya|sanat/, '🎨'], [/fotoğraf/, '📷'],
  [/beslenme|diyet|öğün|yemek|kalori/, '🥗'], [/su içme|\bsu\b/, '💧'], [/uyku/, '😴'], [/sağlık|ilaç|vitamin/, '💊'],
  [/sınav|tyt|ayt|lgs|kpss|ders|matematik|fizik|kimya/, '📚'], [/bahçe|bitki|çiçek/, '🌿'], [/tasarruf|bütçe|para|birikim/, '💰'],
  [/temizlik|ev işi|düzen/, '🧹'], [/aile|çocuk/, '👪'], [/köpek|kedi|evcil/, '🐾'], [/satranç/, '♟️'], [/iş\b|kariyer|proje/, '💼'],
];

export function ikonOner(ad: string): string | null {
  const s = ad.toLocaleLowerCase('tr');
  for (const [r, ik] of ONERILER) if (r.test(s)) return ik;
  return null;
}

export const IKON_SECENEKLERI = [
  '🌱', '🎸', '🎹', '🎵', '🏃', '🚶', '🚴', '🏊', '🧘', '🏋️', '📖', '🗣️', '💻', '✍️', '🎨', '📷',
  '🥗', '💧', '😴', '💊', '📚', '🌿', '💰', '🧹', '🐾', '♟️', '💼', '⭐', '🎯', '🔥',
];

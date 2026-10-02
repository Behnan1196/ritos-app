// ————————————————————————————————————————————————————————————————
// Ritos teslimat protokolü — kart paketi + geri bildirim paketi (25 eylül).
// Bkz. "Ritos — User Story'ler (PRD çekirdeği)": Teslimat protokolü, Ortak sözleşme.
//
// Ajanda'ya teslimat yapan HER modül (Ajanda'nın kendisi, Program, ileride
// Hatırlatıcı / Gelenler / Danışmanlık / dış platform) yalnızca bir KartPaketi
// üretir. Ajanda paketin içini bilmez; yalnızca zamanlama, durum, kaynak, sahip,
// izinler ve temel tip ile çalışır. Bağlı kartlarda Ajanda'da olan her şey bir
// GeriBildirim olarak kaynağa döner — kaynağın cihazda mı uzakta mı olduğu yalnızca
// `geri_bildirim` alanıyla ayrışır, akış aynıdır.
// ————————————————————————————————————————————————————————————————

export const PAKET_SURUM = 1 as const;

// Dört temel tip — konuya göre değil, davranışa göre.
export type TemelTip = 'yap' | 'oku' | 'kaydet' | 'uygula';

export const TIP_ETIKET: Record<TemelTip, string> = {
  yap: 'Yap',
  oku: 'Oku',
  kaydet: 'Kaydet',
  uygula: 'Uygula',
};

// Kapalı blok paleti. Yeni ihtiyaç önce mevcut blokların birleşimiyle karşılanır;
// yeni blok ancak gerçekten yeni bir etkileşim gerekiyorsa eklenir.
export type Blok =
  | { tur: 'metin'; metin: string }
  | { tur: 'belge'; belge: unknown }   // 30 eylül — stilli açıklama (Tiptap JSON): listeler, checklist, vurgu
  | { tur: 'video'; url: string; baslik?: string; bas?: number; bit?: number }
  | { tur: 'baglanti'; url: string; baslik?: string }
  // bicim (2 ekim): sayi = serbest değer, olcek = 1–5 seçim (ruh hali), adet = gün boyunca +1 (su); adette hedef dolunca yapıldı
  | { tur: 'sayi'; anahtar: string; etiket: string; birim?: string; hedef?: number; bicim?: 'sayi' | 'olcek' | 'adet' }
  | { tur: 'secenek'; anahtar: string; etiket: string; secenekler: string[] }
  | { tur: 'metin_girdi'; anahtar: string; etiket: string }
  | { tur: 'zamanlayici'; dakika: number };

// Değer bloklarının anahtarları — Kaydet kartında girilen değerler bu anahtarlarla tutulur.
export function degerBloklari(bloklar: Blok[]) {
  return bloklar.filter(
    (b): b is Extract<Blok, { anahtar: string }> => 'anahtar' in b,
  );
}

export interface Zamanlama {
  baslangic: string;        // YYYY-MM-DD
  bitis: string | null;     // null = süregelen
  gunler: number[] | null;  // JS getDay (0=Paz..6=Cmt); null = her gün
  saatler: string[];        // "HH:MM" — sırayı değiştirmez, yalnız bilgi + hatırlatma
  hatirlatma?: Hatirlatma | null;
  bekle?: number | null;    // 2 ekim — yapıldıktan sonra bekleme süresi (dk); satırda geri sayım + uyarı
}

// Bildirim (30 eylül) — kartın gününden `gun` gün önce. Aynı gün (gun 0) + saatli kartta
// saatten `dk` dakika önce; diğer durumlarda `saat`te. Şimdilik yalnız saklanır; bildirim
// altyapısı geldiğinde buradan okunur.
export interface Hatirlatma {
  gun: number;
  dk?: number | null;
  saat?: string | null;
}

export type KaynakModul = 'ajanda' | 'program' | 'hatirlatici' | 'gelenler' | 'danismanlik';

export interface Izinler {
  ac: boolean;              // kartı açma (bazı atanmış kartlarda kapalı — A5)
  duzenle: boolean;         // içerik / zamanlama düzenleme
  sil: boolean;
  gun_degistir: boolean;
  sirala: boolean;          // gün içi sıralama
  duzeltme_gun: number | null; // değer düzeltme süresi: null = her zaman, 0 = aynı gün, N gün (A9)
}

export const TAM_IZIN: Izinler = { ac: true, duzenle: true, sil: true, gun_degistir: true, sirala: true, duzeltme_gun: null };
export const BAGLI_YEREL_IZIN: Izinler = { ac: true, duzenle: false, sil: false, gun_degistir: false, sirala: true, duzeltme_gun: null };

// Alan paketinden gelen kartın ek bilgisi (26 eylül). Ajanda bunu bilmez, yalnız taşır;
// paket kendi analizini (konu ilerlemesi, deneme netleri) buradan ve girilen değerlerden türetir.
export type SinavGorevTur = 'calisma' | 'soru' | 'tekrar' | 'deneme' | 'seans';
export interface SinavEk {
  paket: 'sinav';
  tur: SinavGorevTur;
  sinav: string | null;                          // 'tyt' | 'ayt' | 'lgs' | 'ozel-…'; seansta null
  ders: { id: string; ad: string } | null;
  konular: { id: string; ad: string }[];         // ad da taşınır: katalog değişse de kart okunur kalır
  kaynak: { id: string; ad: string } | null;
  hedef_soru?: number | null;
  deneme?: { tur: string; dersler: { id: string; ad: string }[]; yanlis_bolen: number } | null; // net = D − Y/bölen
}
export type PaketEk = SinavEk;

export interface KartPaketi {
  surum: typeof PAKET_SURUM;
  id: string;                                   // UUID
  tip: TemelTip;
  ad: string;
  bloklar: Blok[];
  zamanlama: Zamanlama;
  kaynak: { modul: KaynakModul; ref: string | null; etiket: string | null }; // etiket: satırda görünen kaynak adı (A8)
  sahip: 'ben' | string;                        // 'ben' ya da uzak sahibin kimliği
  izinler: Izinler;
  geri_bildirim: 'yok' | 'yerel' | 'uzak';      // bağımsız / bağlı-yerel / bağlı-uzak
  ek?: PaketEk | null;                          // alan paketinin bilgisi (Sınav…)
}

export type GeriBildirimOlay = 'yapildi' | 'geri_alindi' | 'deger';

export interface GeriBildirim {
  surum: typeof PAKET_SURUM;
  id: string;
  kart_id: string;
  kaynak: { modul: KaynakModul; ref: string | null };
  tarih: string;                                // kartın hangi gününe ait (YYYY-MM-DD)
  olay: GeriBildirimOlay;
  degerler: Record<string, unknown> | null;
  zaman: number;                                // olayın oluştuğu an (epoch ms)
}

// ———————————————————————————————— tarih yardımcıları (yerel saat, string tabanlı) ————————————————————————————————

export function tarihStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

export function bugun(): string {
  return tarihStr(new Date());
}

export function tarihParse(t: string): Date {
  const [y, m, g] = t.split('-').map(Number);
  return new Date(y, m - 1, g);
}

export function tarihEkle(t: string, n: number): string {
  const d = tarihParse(t);
  d.setDate(d.getDate() + n);
  return tarihStr(d);
}

export function gunFarki(a: string, b: string): number {
  // b - a, gün cinsinden
  return Math.round((tarihParse(b).getTime() - tarihParse(a).getTime()) / 86400000);
}

// Kart o gün Ajanda'da görünür mü? (Rite tekrar motorunun aynısı: tarih penceresi + haftanın günleri)
export function gunAktif(z: Zamanlama, tarih: string): boolean {
  if (tarih < z.baslangic) return false;
  if (z.bitis !== null && tarih > z.bitis) return false;
  if (z.gunler && z.gunler.length > 0 && z.gunler.length < 7) {
    return z.gunler.includes(tarihParse(tarih).getDay());
  }
  return true;
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const GUN_KISA: [number, string][] = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [0, 'Paz']];

export function tarihEtiket(t: string): string {
  const d = tarihParse(t);
  return `${d.getDate()} ${AYLAR[d.getMonth()]}, ${GUN_ADLARI[d.getDay()]}`;
}

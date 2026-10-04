// ————————————————————————————————————————————————————————————————
// Beslenme alanı — temel hesap (4 ekim). Rehberdir; karar diyetisyenindir.
//  • Bazal metabolizma: Mifflin-St Jeor.  Günlük harcama = bazal × aktivite katsayısı.
//  • Hedef: kilo ver / koru / al; haftalık hız (kg) → günlük fark ≈ hız × 7700 kcal / 7.
//  • Alt sınır: kadın 1200, erkek 1500 kcal (altına inilmez, uyarı verilir).
//  • Makro: protein g/kg (ver 1,6 · koru 1,2 · al 1,4), yağ enerjinin %30'u, kalan karbonhidrat.
//  • Su: 33 ml/kg.
// Bilgiler, Atölye › Bilgiler'deki alanlardan (iliski_ayar.bilgiler, metin) okunur.
// ————————————————————————————————————————————————————————————————

export type Cinsiyet = 'k' | 'e';
export type HedefTur = 'ver' | 'koru' | 'al';

export const AKTIVITE: [string, string, string][] = [
  ['1.2', 'Hareketsiz', 'masa başı, spor yok'],
  ['1.375', 'Az hareketli', 'haftada 1–3 gün hafif'],
  ['1.55', 'Orta', 'haftada 3–5 gün'],
  ['1.725', 'Çok hareketli', 'haftada 6–7 gün'],
];
export const HIZLAR: [string, string][] = [['0.25', '0,25 kg/hafta'], ['0.5', '0,5 kg/hafta'], ['0.75', '0,75 kg/hafta']];

const sayi = (v?: string) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

export interface Hesap {
  vki: number | null;
  bazal: number;
  harcama: number;
  onerilen: number;          // hesaplanan hedef kalori
  hedefKcal: number;         // elle düzeltilmişse o
  elle: boolean;
  makro: { protein: number; yag: number; karb: number }; // gram
  su: number;                // ml
  sureHafta: number | null;  // hedef kiloya tahmini süre
  hiz: number;               // kg/hafta (ver/al), koru'da 0
  hedef: HedefTur;
  uyarilar: string[];
}

/** Eksik bilgi varsa null ve eksiklerin listesi. */
export function beslenmeHesap(b: Record<string, string>, bugunYil = new Date().getFullYear()): { hesap: Hesap | null; eksik: string[] } {
  const cins = b.cinsiyet as Cinsiyet | undefined;
  const yil = sayi(b.dogum_yili), boy = sayi(b.boy), kilo = sayi(b.baslangic_kilo), pal = sayi(b.aktivite);
  const hedef = (b.hedef as HedefTur) || 'koru';
  const eksik: string[] = [];
  if (!cins) eksik.push('cinsiyet');
  if (!yil) eksik.push('doğum yılı');
  if (!boy) eksik.push('boy');
  if (!kilo) eksik.push('kilo');
  if (!pal) eksik.push('aktivite');
  if (eksik.length) return { hesap: null, eksik };
  const yas = bugunYil - yil!;
  const bazal = Math.round(10 * kilo! + 6.25 * boy! - 5 * yas + (cins === 'e' ? 5 : -161));
  const harcama = Math.round(bazal * pal!);
  const hiz = hedef === 'koru' ? 0 : Math.min(sayi(b.hiz) ?? 0.5, hedef === 'al' ? 0.5 : 1);
  const fark = Math.round((hiz * 7700) / 7);
  const altSinir = cins === 'e' ? 1500 : 1200;
  const uyarilar: string[] = [];
  let onerilen = hedef === 'ver' ? harcama - fark : hedef === 'al' ? harcama + fark : harcama;
  if (onerilen < altSinir) { uyarilar.push(`Hesap ${onerilen} kcal çıktı; ${altSinir} kcal altına inilmedi. Hızı düşürmeyi düşün.`); onerilen = altSinir; }
  onerilen = Math.round(onerilen / 10) * 10;
  const elleKcal = sayi(b.kalori_elle);
  const hedefKcal = elleKcal ? Math.round(elleKcal) : onerilen;
  const proteinGkg = hedef === 'ver' ? 1.6 : hedef === 'al' ? 1.4 : 1.2;
  const protein = Math.round(proteinGkg * kilo!);
  const yag = Math.round((hedefKcal * 0.3) / 9);
  const karb = Math.max(0, Math.round((hedefKcal - protein * 4 - yag * 9) / 4));
  const vki = Math.round((kilo! / ((boy! / 100) ** 2)) * 10) / 10;
  const hk = sayi(b.hedef_kilo);
  const sureHafta = hiz && hk ? Math.ceil(Math.abs(kilo! - hk) / hiz) : null;
  if (hk && hedef === 'ver' && hk >= kilo!) uyarilar.push('Hedef kilo şimdiki kilodan düşük olmalı.');
  if (hk && hedef === 'al' && hk <= kilo!) uyarilar.push('Hedef kilo şimdiki kilodan yüksek olmalı.');
  if (yas < 18) uyarilar.push('18 yaş altı için bu formül uygun değil; çocuk/ergen değerlendirmesi gerekir.');
  return { hesap: { vki, bazal, harcama, onerilen, hedefKcal, elle: !!elleKcal, makro: { protein, yag, karb }, su: Math.round(kilo! * 33 / 50) * 50, sureHafta, hiz, hedef, uyarilar }, eksik: [] };
}

export function vkiEtiket(v: number) {
  return v < 18.5 ? 'zayıf' : v < 25 ? 'normal' : v < 30 ? 'fazla kilolu' : 'obez';
}

/** Başlangıçtan bu yana beklenen kilo (hedefe ulaşınca orada durur). */
export function beklenenKilo(b: Record<string, string>, tarih: string): number | null {
  const bas = b.baslangic_tarihi, kilo = sayi(b.baslangic_kilo);
  if (!bas || !kilo) return null;
  const hedef = (b.hedef as HedefTur) || 'koru';
  if (hedef === 'koru') return kilo;
  const hiz = sayi(b.hiz) ?? 0.5;
  const hafta = (new Date(tarih).getTime() - new Date(bas).getTime()) / (7 * 86400000);
  if (hafta < 0) return kilo;
  let v = hedef === 'ver' ? kilo - hiz * hafta : kilo + hiz * hafta;
  const hk = sayi(b.hedef_kilo);
  if (hk) v = hedef === 'ver' ? Math.max(v, hk) : Math.min(v, hk);
  return Math.round(v * 10) / 10;
}

export type KiloDurum = { tur: 'uygun' | 'yavas' | 'hizli' | 'ters'; fark: number; metin: string; oneri: string };

/** Son ölçümü beklenenle karşılaştırır (±0,5 kg tolerans). */
export function kiloDurumu(b: Record<string, string>, son: { t: string; v: number }): KiloDurum | null {
  const beklenen = beklenenKilo(b, son.t);
  if (beklenen === null) return null;
  const hedef = (b.hedef as HedefTur) || 'koru';
  const fark = Math.round((son.v - beklenen) * 10) / 10; // + = beklenenden ağır
  const yon = hedef === 'al' ? -fark : fark;              // + = hedeften geride
  const kg = (x: number) => `${Math.abs(x).toLocaleString('tr-TR')} kg`;
  if (hedef === 'koru') {
    return Math.abs(fark) <= 1
      ? { tur: 'uygun', fark, metin: 'Kilo korunuyor.', oneri: 'Plana devam.' }
      : { tur: fark > 0 ? 'yavas' : 'hizli', fark, metin: `Başlangıçtan ${kg(fark)} ${fark > 0 ? 'fazla' : 'eksik'}.`, oneri: `Kaloriyi ${fark > 0 ? 'biraz azaltmayı' : 'biraz artırmayı'} düşün.` };
  }
  if (Math.abs(fark) <= 0.5) return { tur: 'uygun', fark, metin: 'Beklenen çizgide.', oneri: 'Plana devam.' };
  if (yon > 0) {
    const ters = hedef === 'ver' ? son.v > Number(String(b.baslangic_kilo).replace(',', '.')) : son.v < Number(String(b.baslangic_kilo).replace(',', '.'));
    return ters
      ? { tur: 'ters', fark, metin: `Başlangıcın ${hedef === 'ver' ? 'üstünde' : 'altında'}.`, oneri: 'Uyumu ve notları kontrol et; gerekirse kaloriyi ve öğünleri yeniden gözden geçir.' }
      : { tur: 'yavas', fark, metin: `Beklenenden ${kg(yon)} geride.`, oneri: `Uyum iyiyse hedef kaloriyi 100–150 kcal ${hedef === 'ver' ? 'azaltmayı' : 'artırmayı'} düşün.` };
  }
  return { tur: 'hizli', fark, metin: `Beklenenden ${kg(yon)} hızlı.`, oneri: `Çok hızlı gidiyor; kaloriyi 100–150 kcal ${hedef === 'ver' ? 'artırmayı' : 'azaltmayı'} düşün.` };
}

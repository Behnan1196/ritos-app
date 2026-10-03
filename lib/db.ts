// ————————————————————————————————————————————————————————————————
// Ritos yerel veritabanı — IndexedDB üzerinde Dexie (25 eylül).
//
// Neden düz localStorage değil: Ritos'un verisi (Supabase'deki az sayıda
// cat_* tablosu hariç) cihazda kalıyor — gizlilik konumlandırmasının parçası.
// Bu yüzden burası "pratiklik için anahtar-değer" değil, gerçek bir yerel DB:
// şemalı tablolar, sürümlü göçler (version(n)), indeksli sorgu, transaction.
//
// Mobil hizalama kuralı: her tablo DÜZ satırlardan oluşur (iç içe nesne yok,
// ilişki = başka tablonun id'si). Böylece aynı model ileride SQLite'a
// tablo/alan düzeyinde birebir taşınabilir. Her şema değişikliği yeni bir
// db.version(n) ile yapılır — eski sürümü DEĞİŞTİRME (SQLite migration'ı gibi).
// ————————————————————————————————————————————————————————————————

import Dexie, { type EntityTable } from 'dexie';
import type { Blok, GeriBildirimOlay, Hatirlatma, Izinler, KaynakModul, PaketEk, TemelTip } from './paket';

export type CustomWidgetType = 'pomodoro' | 'foto' | 'sayac';

// Uygulamanın kullandığı biçim (UI state).
export interface CustomWidget {
  id: string;             // olmazsa olmaz: satır kimliği — silme/güncelleme ve ileride senkron için sabit kalmalı
  type: CustomWidgetType; // olmazsa olmaz: hangi widget bileşeni çizilecek
  x: number;              // ızgara sütunu (0..CUSTOM_COLS-1) — düzen yenilemede kaybolmasın diye
  y: number;              // ızgara satırı
  w: number;              // genişlik (hücre)
  h: number;              // yükseklik (hücre)
}

// DB'deki satır: UI biçimi + kayıt meta alanı.
export interface HomeWidgetRow extends CustomWidget {
  guncellendi: number;    // son değişiklik (epoch ms) — ileride çakışma çözümü/senkron için; UI kullanmaz
}

// Genel amaçlı küçük ayarlar/bayraklar (ör. "ilk kurulum tohumları yazıldı mı").
export interface AyarRow {
  anahtar: string;        // olmazsa olmaz: benzersiz ayar adı
  deger: unknown;         // JSON'a dönüşebilir değer
}


// ———————————————————————————————— v2 — 25 eylül: Ajanda + Program + teslimat protokolü ————————————————————————————————
// Düz satır kuralı: iç içe nesne yerine düz kolonlar; liste/nesne değerleri (bloklar, gunler,
// saatler, izinler, degerler) SQLite'ta JSON metin kolonu olacak alanlar.

// Ajanda'daki her satır — bir KartPaketi'nin Ajanda'daki hali. Ajanda yalnızca bunu bilir.
export interface AjandaKartRow {
  id: string;
  tip: TemelTip;                 // olmazsa olmaz: satırın davranışı (yapıldı var mı, değer girişi var mı)
  ad: string;
  bloklar: Blok[];               // içerik (JSON)
  baslangic: string;             // zamanlama — YYYY-MM-DD
  bitis: string | null;          // null = süregelen
  gunler: number[] | null;       // null = her gün
  saatler: string[];
  kaynak_modul: KaynakModul;     // olmazsa olmaz: kim teslim etti
  kaynak_ref: string | null;     // kaynağın kendi kimliği (program: "<programId>/<adimId>")
  kaynak_etiket: string | null;  // satırda görünen kaynak adı (A8)
  sahip: string;                 // 'ben' ya da uzak sahip
  izinler: Izinler;
  geri_bildirim: 'yok' | 'yerel' | 'uzak';
  sira: number;                  // gün listesindeki sıra — kart düzeyinde (A7)
  ek?: PaketEk | null;           // alan paketi bilgisi (26 eylül) — indekssiz
  isaret?: number | null;        // D8 — koç güncelledi (zaman); kartta kısa süre "güncellendi" görünür
  hatirlatma?: Hatirlatma | null; // bildirim ayarı (30 eylül) — indekssiz
  ortak?: { aile: string; olusturan: string; olusturan_ad: string; ustlenen: string | null; ustlenen_ad: string | null; yapan_ad: string | null } | null; // aile ortak kartı (3 ekim)
  bekle?: number | null;         // yapıldıktan sonra bekleme (dk, 2 ekim) — indekssiz
  atla?: string[];               // tekrar eden kartın "yalnız bu gün" kaldırılan günleri (A7) — indekssiz, göç gerektirmez
  guncellendi: number;
}

// Ajanda'nın gün bazında durumu (yapıldı + girilen değerler). id = "<kartId>|<tarih>".
export interface AjandaKayitRow {
  id: string;
  kart_id: string;
  tarih: string;
  yapildi: boolean;
  degerler: Record<string, unknown> | null;
  zaman?: number | null;         // 2 ekim — yapıldığı an (epoch ms); işaretlerken otomatik, sonradan düzeltilebilir
  guncellendi: number;
}

// Geri bildirim olay günlüğü (bağlı kartlar). Yerel sahip (Program) buradan okur;
// uzak sahipte aynı satırlar giden kuyruğuna da düşecek (sonra).
export interface GeriBildirimRow {
  id: string;
  kart_id: string;
  kaynak_modul: KaynakModul;
  kaynak_ref: string | null;
  tarih: string;
  olay: GeriBildirimOlay;
  degerler: Record<string, unknown> | null;
  zaman: number;
}

// Kişisel Gelişim — Bireysel Program (çekirdek + çalışma durumu).
export interface ProgramRow {
  id: string;
  ad: string;
  amac: string;
  dikkat: string;
  kriterler: string[];           // JSON
  hedef: string;                 // serbest metin
  klasor_id: string | null;
  home_goster: boolean;
  degerlendirme_acik: boolean;   // isteğe bağlı (K4)
  degerlendirme: number | null;  // 0..4, yalnız güncel değer (tarihsel değil)
  calisma_baslangic: string | null; // son başlatmanın tarihi; null = hiç başlatılmadı
  calisma_bitis: string | null;     // null + baslangic dolu = süregelen; durdurunca dün
  kimden?: string;               // V1 (27 eylül): programı kim hazırladı — Kendim, Ayşe Hoca, X Kliniği (serbest metin)
  sablon?: boolean;              // D4 — koçun şablonu: başlatılmaz, yalnız atanır
  sablon_disiplin?: string | null; // D4 — şablonlar disipline göre gruplanır
  plan?: boolean;                // 28 eylül — kişisel program Ajanda'dan planlanır: tarihler mutlak, kendiliğinden bitmez
  uzak?: UzakProgram | null;     // D5/D6 — danışana atanmış (koç tarafı) ya da koçtan gelen (danışan tarafı)
  guncellendi: number;
}

// Danışmanlık programı: iki tarafta AYNI kimlikle durur (geri bildirim kaynak_ref'i eşleşsin diye).
export interface UzakProgram {
  iliski_id: string;
  rol: 'koc' | 'danisan';        // bu cihazın sahibinin rolü
  karsi_id: string;              // karşı tarafın kullanıcı kimliği
  karsi_ad: string;
  disiplin: string;
  durum: 'taslak' | 'gonderildi' | 'kabul' | 'ret' | 'ayrildi';
  baslangic: string;             // koçun seçtiği başlangıç (YYYY-MM-DD)
  izinler: Izinler;              // danışanın Ajanda'sındaki kart izinleri (D9 varsayılanı)
  surum: number;                 // her gönderimde artar — eski güncelleme yenisini ezmesin
  plan?: boolean;                // 28 eylül — koçun Ajanda'dan yönettiği plan: takvim tarihleri mutlak, kendiliğinden bitmez
  // 3 ekim — Atölye taslak planı (yalnız koç tarafında anlamlı; danışana gitmez):
  gonderim?: 'hemen' | 'gonder'; // hemen (varsayılan): her değişiklik kısa gecikmeyle gider; gonder: "Gönder" deyince
  bekleyen?: { etkin: string; adimlar: string[] } | null; // gönderilmemiş değişiklikler (en erken etkin gün, değişen kartlar)
}

export interface ProgramAdimRow {
  id: string;
  program_id: string;
  sira: number;
  tip: TemelTip;
  ad: string;
  bloklar: Blok[];
  basla_gun: number;             // program başına göre gün (0 = ilk gün)
  sure_gun: number | null;       // null = süregelen
  gunler: number[] | null;
  saatler: string[];
  ek?: PaketEk | null;           // alan paketi bilgisi (26 eylül)
  guncellendi: number;
}

export interface KlasorRow {
  id: string;
  ad: string;
  ust_id: string | null;         // en fazla 3 seviye (K3)
  // 26 eylül — en üst düzey "yaşam alanı" olabilir (PERMA, Wheel of Life ya da kullanıcının kendi sınıflaması).
  // Öz değerlendirme ve kriterler programda değil alanda (K3/K4 revizyonu).
  tur?: 'alan' | 'klasor';       // eski satırlarda yok → 'klasor' sayılır
  sira?: number;
  kriterler?: string[];          // yalnız alanda
  aciklama?: string;
  guncellendi?: number;
}

// Alan öz değerlendirmesi — tarihiyle saklanır (denge zamanla izlenebilsin), şimdilik sonuncusu gösterilir.
export interface AlanDegerlendirmeRow {
  id: string;
  alan_id: string;
  deger: number;                 // 0..4 (Berbat..Çok iyi)
  zaman: number;
}

// ———————————————————————————————— v3 — 25 eylül: Gelenler + kişiler ————————————————————————————————

// Gelenler (P3–P6): sunucudan indirilen paylaşım paketleri cihazda yaşar; süre sınırı yok,
// kullanıcı kendisi temizler.
export interface GelenRow {
  id: string;                    // sunucudaki cat_gelen id'si
  gonderen_id: string;
  gonderen_ad: string;
  kaynak: 'dogrudan' | 'sohbet' | 'koc';
  paket: unknown;                // PaylasimPaketi (JSON)
  gelis: number;                 // sunucuya bırakıldığı an (epoch ms)
  alindi: number | null;         // "Al" denen an; null = alınmadı
  boyut: number;                 // bayt — depolama göstergesi için
}

// Kişiler (P2): daha önce paylaştığım ya da benden paylaşım almış kişiler.
// v4 — 26 eylül: senkronu bekleyen yerel değişiklikler (hesaplı kullanımda).
export interface BekleyenRow {
  anahtar: string;        // `${tablo}|${id}` — aynı satırın ardışık değişiklikleri tek kayda iner
  tablo: SenkronTablo;
  id: string;
  zaman: number;          // son değişiklik (epoch ms) — son yazan kazanır
}

export interface KisiRow {
  id: string;                    // kullanıcı id'si
  gorunen_ad: string;
  son: number;                   // son etkileşim
}


// ———————————————————————————————— v6 — 26 eylül: alan paketleri (Sınav hazırlığı) ————————————————————————————————
// Katalog sunucuda herkese açık (cat_paket); cihaz son sürümü indirir → `katalog` (senkronsuz, her cihaz kendi indirir).
// Kullanıcının kurulumu, katalog düzenlemeleri ve kaynakları kişisel veridir → senkronlanır (şifreli).

export interface KatalogRow {
  kod: string;                   // 'tyt' | 'ayt' | 'lgs' | 'ornek-kaynaklar'
  paket: string;                 // 'sinav'
  surum: number;
  onayli: boolean;
  veri: unknown;                 // sınav: { kod, ad, testler, dersler, notlar, belgeler } (JSON)
  indirildi: number;
  fark?: KatalogFark | null;     // bir önceki indirilen sürüme göre değişiklik özeti (P5)
}

export interface KatalogFark { eski: number; yeni: number; eklenen: string[]; adiDegisen: string[]; cikan: string[] }

// Paket kurulumu — id = paket adı ('sinav').
export interface PaketKurulumRow {
  id: string;
  secim: string[];               // kurulu sınav kodları: ['tyt','ayt'] ya da kendi listeleri ('ozel-…')
  ozel: { kod: string; ad: string }[]; // kullanıcının kendi (boş başlayan) katalogları (P4)
  gorulen: Record<string, number>; // kullanıcının gördüğü son katalog sürümü — güncelleme bildirimi için
  guncellendi: number;
}

// Kullanıcının katalog üzerindeki düzenlemesi — katalogdaki öğenin üstüne yazılır (P3/P4).
// id = öğe kimliği (katalogdaki öğe için aynısı; eklenen öğe için yeni kimlik).
export interface KatalogDuzenRow {
  id: string;
  sinav: string;
  tur: 'ders' | 'unite' | 'konu';
  ek: boolean;                   // kullanıcı ekledi (katalogda yok)
  ust_id: string | null;         // ders için null
  ad: string | null;             // null = katalogdaki ad
  sira: number | null;           // null = katalogdaki sıra
  gizli: boolean;
  guncellendi: number;
}

// v7 — 26 eylül: konu durumu (P8) — kullanıcının elle verdiği durum; yoksa kartlardan türetilir.
export type KonuDurum = 'baslanmadi' | 'calisiliyor' | 'tamam' | 'tekrar';
export interface KonuDurumRow {
  id: string;                    // konu kimliği
  durum: KonuDurum;
  guncellendi: number;
}

// v8 — 26 eylül: danışmanlık. İlişkiler sunucudan gelir (burada önbellek, senkronsuz);
// giden = gönderilmeyi bekleyen şifreli mesajlar (cihaza özel, senkronsuz).
export interface IliskiRow {
  id: string;
  koc: string;
  danisan: string;
  disiplin: string;
  koc_ad: string;
  danisan_ad: string;
  durum: 'aktif' | 'sonlandi';
  olusturuldu: string;
  sonlandi: string | null;
}

export interface GidenRow {
  id: string;
  iliski_id: string;             // koç–danışan kanalı ('' = aile)
  aile_id?: string | null;       // aile grubu kanalı
  alici: string;
  icerik: unknown;               // MesajIcerik — gönderirken ilişki anahtarıyla şifrelenir
  zaman: number;
}

// v9 — 26 eylül: koçun danışan başına kart izinleri (D9). id = ilişki kimliği.
export interface IliskiAyarRow {
  id: string;
  izinler: Izinler;
  guncellendi: number;
}

// v10 — 27 eylül: Sohbet (C1–C4) ve aile grubu (F1–F4).
// konusma = 'i:<ilişki id>' (koç–danışan) ya da 'a:<aile id>'. Mesajlar senkronlanır (diğer cihazlarda da geçmiş görünsün).
export interface MesajRow {
  id: string;
  konusma: string;
  gonderen: string;
  gonderen_ad: string;
  tur: 'metin' | 'paylasim';
  metin: string;
  paket: unknown | null;         // PaylasimPaketi — yalnız tanım (kart / program)
  zaman: number;
  durum: 'bekliyor' | 'gitti';
  alindi?: number | null;        // paylaşımı "Al" dediğim an
}

export interface KonusmaOkunduRow { id: string; zaman: number }

// Ölçüm katmanı (28 eylül). Kart değeri toplar, veri ölçü serisinde yaşar: kart silinse de seri kalır.
// Tanım: hazır ölçüler koddadır (lib/olcum.ts); kişinin kendi tanımladıkları burada.
export interface OlcuTanimRow {
  id: string;            // hazırlarda sabit anahtar ('kilo', 'bel'…), kişisellerde 'k-<uuid>'
  ad: string;
  birim: string;
  guncellendi: number;
}
// Tek değer. id = "<kartId>|<tarih>|<olçüId>" — aynı kartın aynı günkü değeri üzerine yazılır.
export interface OlcumRow {
  id: string;
  olcu_id: string;
  tarih: string;
  deger: number;
  kart_id: string | null;
  kaynak: string | null; // satırda görünen kaynak (koç adı / program adı)
  zaman: number;
}

// Kütüphane (30 eylül) — tarihsiz kartlar, klasör ağacında (klasor tablosu). Ajanda'ya "alınınca"
// kopyası düşer (kaynak_ref = "kut:<id>"); asıl kart kütüphanede kalır.
export interface KutuphaneKartRow {
  id: string;
  klasor_id: string | null;      // null = kök
  tip: TemelTip;
  ad: string;
  bloklar: Blok[];
  ek?: PaketEk | null;
  sira: number;
  olusturuldu: number;
  guncellendi: number;
}

// Notlar (30 eylül) — stilli hızlı notlar (Tiptap belgesi, JSON). Uçtan uca şifreli senkronlanır.
export interface NotRow {
  id: string;
  belge: unknown;                // Tiptap JSON belgesi
  baslik: string;                // ilk satır (liste ve arama için)
  metin: string;                 // düz metin (önizleme ve arama)
  sabit: boolean;                // 📌 üstte
  olusturuldu: number;
  guncellendi: number;
}

// Bağlantı widget'ı (2 ekim) — kendi uygulamanın sayfası Home'da iframe içinde. Ritos sayfanın
// verisini görmez; yalnız adresi (yer tutucularıyla) saklar.
export interface BaglantiRow {
  id: string;
  ad: string;
  url: string;                   // {tarih} {hafta} {tema} yer tutucuları açılışta doldurulur
  boy: 'k' | 'o' | 'b';          // küçük / orta / büyük (sayfa postMessage ile kendi yüksekliğini de bildirebilir)
  sira: number;
  guncellendi: number;
}

// Aile ortak listeleri (3 ekim) — aile kanalındaki şifreli işlemlerden (op) her cihazda kurulur;
// senkronlanmaz (kaynağı kanal). Silinen kayıt iz olarak kalır ki geç gelen işlem onu diriltmesin.
export interface OrtakListeRow { id: string; aile: string; ad: string; olusturan: string; zaman: number; silindi?: boolean }
export interface OrtakMaddeRow {
  id: string; liste: string; metin: string; ekleyen: string; zaman: number;
  isaretli: boolean; isaret_kim: string | null; isaret_zaman: number; silindi?: boolean;
}

export interface AileUyesi { uye: string; ad: string; rol: 'yonetici' | 'uye'; durum: 'davet' | 'aktif' | 'ayrildi' }
export interface AileRow {
  id: string;
  ad: string;
  kurucu: string;
  anahtar_surum: number;
  uyeler: AileUyesi[];           // bana görünen üyeler (davetliyken yalnız ben)
}

export type KaynakTur = 'kitap' | 'soru_bankasi' | 'deneme' | 'video' | 'dokuman';
export interface KaynakRow {
  id: string;
  ad: string;
  tur: KaynakTur;
  dersler: string[];             // ders kimlikleri (JSON)
  url: string;
  not: string;
  guncellendi: number;
}

export class RitosDB extends Dexie {
  home_widget!: EntityTable<HomeWidgetRow, 'id'>;
  ayar!: EntityTable<AyarRow, 'anahtar'>;
  ajanda_kart!: EntityTable<AjandaKartRow, 'id'>;
  ajanda_kayit!: EntityTable<AjandaKayitRow, 'id'>;
  geri_bildirim!: EntityTable<GeriBildirimRow, 'id'>;
  program!: EntityTable<ProgramRow, 'id'>;
  program_adim!: EntityTable<ProgramAdimRow, 'id'>;
  klasor!: EntityTable<KlasorRow, 'id'>;
  gelen!: EntityTable<GelenRow, 'id'>;
  kisi!: EntityTable<KisiRow, 'id'>;
  bekleyen!: EntityTable<BekleyenRow, 'anahtar'>;
  alan_degerlendirme!: EntityTable<AlanDegerlendirmeRow, 'id'>;
  katalog!: EntityTable<KatalogRow, 'kod'>;
  paket_kurulum!: EntityTable<PaketKurulumRow, 'id'>;
  katalog_duzen!: EntityTable<KatalogDuzenRow, 'id'>;
  kaynak!: EntityTable<KaynakRow, 'id'>;
  konu_durum!: EntityTable<KonuDurumRow, 'id'>;
  iliski!: EntityTable<IliskiRow, 'id'>;
  giden!: EntityTable<GidenRow, 'id'>;
  iliski_ayar!: EntityTable<IliskiAyarRow, 'id'>;
  mesaj!: EntityTable<MesajRow, 'id'>;
  konusma_okundu!: EntityTable<KonusmaOkunduRow, 'id'>;
  aile!: EntityTable<AileRow, 'id'>;
  olcu_tanim!: EntityTable<OlcuTanimRow, 'id'>;
  olcum!: EntityTable<OlcumRow, 'id'>;
  kutuphane_kart!: EntityTable<KutuphaneKartRow, 'id'>;
  not!: EntityTable<NotRow, 'id'>;
  baglanti!: EntityTable<BaglantiRow, 'id'>;
  ortak_liste!: EntityTable<OrtakListeRow, 'id'>;
  ortak_madde!: EntityTable<OrtakMaddeRow, 'id'>;

  /** Sunucudan gelen değişiklik uygulanırken true — kancalar bunu yerel değişiklik saymaz. */
  uzaktan = false;
  readonly hesapli: boolean;

  constructor(ad: string) {
    super(ad);
    this.hesapli = ad !== MISAFIR_DB;
    // v1 — 25 eylül: Home "Senin alanın" düzeni + ayarlar.
    // Dexie söz dizimi: ilk alan birincil anahtar, sonrakiler indeks.
    this.version(1).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
    });
    // v2 — 25 eylül: Ajanda (teslimat kapısı), Program, geri bildirim günlüğü, klasör.
    this.version(2).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
    });
    // v3 — 25 eylül: Gelenler + kişiler.
    this.version(3).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
    });
    // v4 — 26 eylül: uçtan uca şifreli senkron için bekleyen değişiklikler.
    this.version(4).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
    });
    // v5 — 26 eylül: yaşam alanı öz değerlendirmesi (tarihli).
    this.version(5).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
    });

    // v6 — 26 eylül: alan paketleri — indirilen katalog, kurulum, katalog düzenleri, kaynaklar.
    this.version(6).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
    });
    // v7 — 26 eylül: konu durumu (P8).
    this.version(7).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
    });
    // v8 — 26 eylül: danışmanlık — ilişki önbelleği, giden mesaj kuyruğu.
    this.version(8).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
    });
    // v9 — 26 eylül: danışan başına kart izinleri.
    this.version(9).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
    });
    // v10 — 27 eylül: sohbet mesajları, okundu işaretleri, aile önbelleği.
    this.version(10).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
    });
    // v11 (28 eylül): ölçüm katmanı.
    this.version(11).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
      olcu_tanim: 'id',
      olcum: 'id, olcu_id, tarih, kart_id',
    });
    // v12 (30 eylül): kütüphane.
    this.version(12).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
      olcu_tanim: 'id',
      olcum: 'id, olcu_id, tarih, kart_id',
      kutuphane_kart: 'id, klasor_id',
    });
    // v13 (30 eylül): notlar.
    this.version(13).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
      olcu_tanim: 'id',
      olcum: 'id, olcu_id, tarih, kart_id',
      kutuphane_kart: 'id, klasor_id',
      not: 'id, guncellendi',
    });
    this.version(14).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
      olcu_tanim: 'id',
      olcum: 'id, olcu_id, tarih, kart_id',
      kutuphane_kart: 'id, klasor_id',
      not: 'id, guncellendi',
      baglanti: 'id, sira',
    });
    this.version(15).stores({
      home_widget: 'id, type',
      ayar: 'anahtar',
      ajanda_kart: 'id, kaynak_modul, kaynak_ref, baslangic',
      ajanda_kayit: 'id, kart_id, tarih',
      geri_bildirim: 'id, kart_id, kaynak_ref, zaman',
      program: 'id, klasor_id',
      program_adim: 'id, program_id',
      klasor: 'id, ust_id',
      gelen: 'id, gelis, alindi',
      kisi: 'id, son',
      bekleyen: 'anahtar, zaman',
      alan_degerlendirme: 'id, alan_id, zaman',
      katalog: 'kod, paket',
      paket_kurulum: 'id',
      katalog_duzen: 'id, sinav',
      kaynak: 'id',
      konu_durum: 'id',
      iliski: 'id, durum',
      giden: 'id, zaman',
      iliski_ayar: 'id',
      mesaj: 'id, konusma, zaman',
      konusma_okundu: 'id',
      aile: 'id',
      olcu_tanim: 'id',
      olcum: 'id, olcu_id, tarih, kart_id',
      kutuphane_kart: 'id, klasor_id',
      not: 'id, guncellendi',
      baglanti: 'id, sira',
      ortak_liste: 'id, aile',
      ortak_madde: 'id, liste',
    });

    // Senkronlanan tablolardaki her yerel değişikliği "bekleyen"e işaretle.
    // Kanca transaction içinde çalışır; bekleyen'e yazmayı transaction dışına erteleriz.
    for (const tablo of SENKRON_TABLOLARI) {
      const t = this.table(tablo);
      t.hook('creating', (pk, obj) => { this.isaretle(tablo, (pk ?? (obj as { id: string }).id) as string); });
      t.hook('updating', (_m, pk) => { this.isaretle(tablo, pk as string); });
      t.hook('deleting', (pk) => { this.isaretle(tablo, pk as string); });
    }
  }

  private kuyruk = new Map<string, BekleyenRow>();
  private zamanlayici: ReturnType<typeof setTimeout> | null = null;

  isaretle(tablo: SenkronTablo, id: string, zaman = Date.now()) {
    if (!this.hesapli || this.uzaktan || id == null) return;
    const anahtar = `${tablo}|${id}`;
    this.kuyruk.set(anahtar, { anahtar, tablo, id: String(id), zaman });
    if (this.zamanlayici) return;
    this.zamanlayici = setTimeout(() => {
      this.zamanlayici = null;
      const satirlar = Array.from(this.kuyruk.values());
      this.kuyruk.clear();
      Dexie.ignoreTransaction(() => this.bekleyen.bulkPut(satirlar)).then(() => degisiklikDinleyicisi?.()).catch(() => {});
    }, 0);
  }

  /** Hesaba geçişte tüm yerel satırları yüklenecek diye işaretle (S2). */
  async hepsiniIsaretle() {
    const zaman = Date.now();
    const satirlar: BekleyenRow[] = [];
    for (const tablo of SENKRON_TABLOLARI) {
      const idler = (await this.table(tablo).toCollection().primaryKeys()) as string[];
      for (const id of idler) satirlar.push({ anahtar: `${tablo}|${id}`, tablo, id: String(id), zaman });
    }
    await this.bekleyen.bulkPut(satirlar);
    degisiklikDinleyicisi?.();
  }
}

// ———————————————— hangi veritabanı açık (S5) ————————————————
// Hesapsız kullanımın verisi 'ritos' (misafir) veritabanında; her hesabın kendi veritabanı var.
// Hangisinin açık olduğu cihazda küçük bir işarette tutulur; değişince sayfa yeniden yüklenir.

export const SENKRON_TABLOLARI = ['home_widget', 'ajanda_kart', 'ajanda_kayit', 'geri_bildirim', 'program', 'program_adim', 'klasor', 'gelen', 'kisi', 'alan_degerlendirme', 'paket_kurulum', 'katalog_duzen', 'kaynak', 'konu_durum', 'iliski_ayar', 'mesaj', 'konusma_okundu', 'olcu_tanim', 'olcum', 'kutuphane_kart', 'not', 'baglanti'] as const;
export type SenkronTablo = (typeof SENKRON_TABLOLARI)[number];

export const MISAFIR_DB = 'ritos';
const AKTIF_HESAP = 'ritos-aktif-hesap';

/** Özel alanın (misafir) veritabanı: açık olan o ise kendisi, değilse ayrı bir bağlantı. */
export function misafirDb(): RitosDB {
  return db.name === MISAFIR_DB ? db : new RitosDB(MISAFIR_DB);
}

export function dbAdi(uid: string | null) {
  return uid ? `ritos-u-${uid}` : MISAFIR_DB;
}

export function aktifHesap(): string | null {
  try { return typeof window === 'undefined' ? null : localStorage.getItem(AKTIF_HESAP); } catch { return null; }
}

export function aktifHesapAyarla(uid: string | null) {
  try { if (uid) localStorage.setItem(AKTIF_HESAP, uid); else localStorage.removeItem(AKTIF_HESAP); } catch { /* yoksay */ }
}

let degisiklikDinleyicisi: (() => void) | null = null;
export function degisiklikDinle(f: (() => void) | null) { degisiklikDinleyicisi = f; }

// Sunucu tarafında (SSR) modül yüklenirse sorun yok: Dexie IndexedDB'ye
// ancak ilk sorguda dokunur, sorgular da yalnızca useEffect içinde çalışır.
export const db = new RitosDB(dbAdi(aktifHesap()));

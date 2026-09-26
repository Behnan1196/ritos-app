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
import type { Blok, GeriBildirimOlay, Izinler, KaynakModul, TemelTip } from './paket';
import { kilitKatmani } from './kilit';

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
  guncellendi: number;
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
  kaynak: 'dogrudan' | 'sohbet';
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

  /** Sunucudan gelen değişiklik uygulanırken true — kancalar bunu yerel değişiklik saymaz. */
  uzaktan = false;
  readonly hesapli: boolean;

  constructor(ad: string) {
    super(ad);
    this.hesapli = ad !== MISAFIR_DB;
    // Özel alan (misafir veritabanı) PIN konunca satır satır şifrelenir (lib/kilit.ts).
    if (!this.hesapli) this.use(kilitKatmani);
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

export const SENKRON_TABLOLARI = ['home_widget', 'ajanda_kart', 'ajanda_kayit', 'geri_bildirim', 'program', 'program_adim', 'klasor', 'gelen', 'kisi', 'alan_degerlendirme'] as const;
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

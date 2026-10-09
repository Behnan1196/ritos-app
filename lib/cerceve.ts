'use client';

// ————————————————————————————————————————————————————————————————
// Yaşam Tarzım çerçevesi (9 ekim) — alanlar, sorular, ölçek, istekler, "neyin ardından" seçenekleri,
// öneri kuralı ve hazır rutinler KODDA DEĞİL bir pakette durur. Uygulama yalnız okuyucudur:
// paket değişince (yeni sürüm ya da yeni çerçeve) akış uygulama güncellenmeden değişir.
//
// Kaynaklar (öncelik sırasıyla):
//   1. Sunucudaki herkese açık 'paket' tablosu (paket = 'cerceve', yalnız onayli) — cihaz yerel 'katalog'a indirir.
//   2. Uygulamayla gelen kopya: lib/cerceveler/ritos-8.json (sunucuya ulaşılamazsa / ilk açılış).
// Kişinin seçtiği çerçeve: ayar 'yasam_cerceve' (yoksa 'ritos-8').
//
// MOTOR: bu uygulamanın anladığı paket biçimi. Pakete uygulamanın bilmediği bir davranış gerekiyorsa
// (ör. 5 basamaklı ölçek, yeni soru türü) paketin 'motor'u artırılır; eski uygulama o paketi yok sayar,
// uygulama güncellenince kullanır.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import { db, type KatalogRow } from './db';
import { supabase } from './supabase';
import ritos8 from './cerceveler/ritos-8.json';

export const MOTOR = 1;
export const VARSAYILAN_KOD = 'ritos-8';
const PAKET = 'cerceve';
const SECIM = 'yasam_cerceve';
const SON_KONTROL = 'cerceve_son_kontrol';
const ARALIK = 6 * 3600_000;
/** "Neyin ardından" listesinin sonuna uygulamanın eklediği seçenek: saat sorar (davranışı kodda). */
export const SAAT_SECENEGI = 'Belli bir saatte';

export interface CerceveAlan {
  kod: string;                    // kalıcı kimlik: rutin etiketi 'alan:<kod>' olur; ad değişse de etiket bozulmaz
  ad: string;
  ikon: string;
  kisa: string;                   // alan listesinde kısa açıklama
  soru: string;                   // "Hayatına bakalım" sorusu
  hafta_sorusu: string;           // haftalık bakış sorusu
  nedir?: { ne: string; neden: string; ornek: string[] };  // "X ne demek?"
  kriterler?: string[];           // kriterli değerlendirmede önerilen kriterler
  anahtarlar?: string[];          // rutin adından alan önerisi için küçük harfli parçalar
}
export interface HazirRutin { kod: string; alanlar: string[]; ikon: string; ad: string; alt: string; gunler: number[] | null; ardindan: string | null }
export interface Cerceve {
  tur: 'cerceve';
  motor: number;
  kod: string;
  surum: number;
  dil: string;
  ad: string;
  aciklama?: string;
  yayinci?: string;
  olcek: { etiketler: [string, string, string] };   // motor 1: üç yüzlü ölçek (kötü / orta / iyi)
  metinler?: { istek_sorusu?: string; uzman_notu?: string };
  alanlar: CerceveAlan[];
  istekler: { metin: string; alanlar: string[] }[];
  ardindan: string[];
  oneri?: { kural: 'en-dusuk'; istek_onceligi?: boolean; adet?: number };
  rutinler: HazirRutin[];
  /** Başka bir çerçeveden geçişte eski alan kodlarının yenileri (rutin etiketleri ve odak taşınır). */
  esleme?: { kaynak: string; alanlar: Record<string, string[]> }[];
}

export const VARSAYILAN = ritos8 as unknown as Cerceve;

/** Paket bu uygulamanın anlayacağı biçimde mi? (Bozuk ya da yeni motor isteyen paket kullanılmaz.) */
export function gecerliMi(x: unknown): x is Cerceve {
  const c = x as Cerceve;
  if (!c || typeof c !== 'object' || c.tur !== 'cerceve' || typeof c.kod !== 'string') return false;
  if (typeof c.motor !== 'number' || c.motor > MOTOR) return false;
  if (!Array.isArray(c.alanlar) || !c.alanlar.length) return false;
  if (!c.alanlar.every((a) => a && typeof a.kod === 'string' && a.kod && typeof a.ad === 'string' && typeof a.ikon === 'string')) return false;
  if (new Set(c.alanlar.map((a) => a.kod)).size !== c.alanlar.length) return false;
  if (!c.olcek || !Array.isArray(c.olcek.etiketler) || c.olcek.etiketler.length !== 3) return false;
  if (!Array.isArray(c.rutinler) || !Array.isArray(c.istekler) || !Array.isArray(c.ardindan)) return false;
  return true;
}

// ———————————————— etkin çerçeve (bellekte; ekranlar senkron okur) ————————————————

let etkin: Cerceve = VARSAYILAN;
const dinleyiciler = new Set<(c: Cerceve) => void>();
function ayarla(c: Cerceve) {
  if (c.kod === etkin.kod && c.surum === etkin.surum) return;
  etkin = c;
  dinleyiciler.forEach((f) => f(c));
}

/** Şu an etkin çerçeve (senkron; ilk yüklemeden önce uygulamayla gelen). */
export const cerceve = (): Cerceve => etkin;

/** Etkin çerçeve: React kancası. İlk çağrıda yerel seçimi ve indirilmiş paketi okur, sunucuyu arka planda yokler. */
export function useCerceve(): Cerceve {
  const [c, setC] = useState(etkin);
  useEffect(() => {
    dinleyiciler.add(setC);
    setC(etkin);
    void aktifCerceve().catch(() => {});
    void cerceveleriYenile().catch(() => {});
    return () => { dinleyiciler.delete(setC); };
  }, []);
  return c;
}

const katalogKodu = (kod: string) => `${PAKET}:${kod}`;

/** Kişinin seçtiği çerçeve (yerel). Canlı sorgular içinde çağrılabilir: seçim ya da paket değişince yeniden çalışır. */
export async function aktifCerceve(): Promise<Cerceve> {
  const kod = ((await db.ayar.get(SECIM))?.deger as string | undefined) ?? VARSAYILAN_KOD;
  const r = await db.katalog.get(katalogKodu(kod));
  let c: Cerceve | null = r && gecerliMi(r.veri) ? (r.veri as Cerceve) : null;
  if (!c && kod === VARSAYILAN_KOD) c = VARSAYILAN;
  // Uygulamayla gelen kopya sunucudakinden yeniyse onu kullan.
  if (c && c.kod === VARSAYILAN_KOD && VARSAYILAN.surum > c.surum) c = VARSAYILAN;
  if (!c) c = VARSAYILAN;   // seçilen paket bu cihazda yok ya da anlaşılmıyor: varsayılana düş
  ayarla(c);
  return c;
}

/** Sunucudaki onaylı çerçeveleri indir (6 saatte bir; zorla = hemen). */
export async function cerceveleriYenile(zorla = false): Promise<void> {
  const son = (await db.ayar.get(SON_KONTROL))?.deger as number | undefined;
  if (!zorla && son && Date.now() - son < ARALIK) return;
  const sb = supabase();
  if (!sb) return;
  let satirlar: { kod: string; surum: number; onayli: boolean; veri: unknown }[];
  try {
    const { data, error } = await sb.from('paket').select('kod, surum, onayli, veri').eq('paket', PAKET).eq('onayli', true);
    if (error || !data) return;
    satirlar = data as typeof satirlar;
  } catch { return; }
  await db.ayar.put({ anahtar: SON_KONTROL, deger: Date.now() });
  const mevcut = new Map((await db.katalog.where('paket').equals(PAKET).toArray()).map((m) => [m.kod, m]));
  const yaz: KatalogRow[] = [];
  for (const s of satirlar) {
    if (!gecerliMi(s.veri)) continue;
    const e = mevcut.get(katalogKodu(s.kod));
    if (e && e.surum >= s.surum) continue;
    yaz.push({ kod: katalogKodu(s.kod), paket: PAKET, surum: s.surum, onayli: true, veri: { ...(s.veri as Cerceve), surum: s.surum }, indirildi: Date.now(), fark: null });
  }
  if (yaz.length) { await db.katalog.bulkPut(yaz); await aktifCerceve(); }
}

/** Seçilebilir çerçeveler (uygulamayla gelen + indirilmiş, bu uygulamanın anladıkları). */
export async function cerceveler(): Promise<Cerceve[]> {
  const indir = (await db.katalog.where('paket').equals(PAKET).toArray()).map((r) => r.veri).filter(gecerliMi);
  const liste = new Map<string, Cerceve>([[VARSAYILAN.kod, VARSAYILAN]]);
  for (const c of indir) { const v = liste.get(c.kod); if (!v || v.surum < c.surum) liste.set(c.kod, c); }
  return Array.from(liste.values());
}

/** Bu çerçeveye geç: seçimi yaz, alanlarını kur, eski alanlardaki rutin etiketlerini ve odağı eşlemeyle taşı. */
export async function cerceveSec(kod: string): Promise<void> {
  const once = await aktifCerceve();
  if (once.kod === kod) return;
  const yeni = (await cerceveler()).find((c) => c.kod === kod);
  if (!yeni) throw new Error('Bu çerçeve bu cihazda yok.');
  await db.ayar.put({ anahtar: SECIM, deger: kod });
  ayarla(yeni);
  const { alanlariGaranti } = await import('./yasamAlani');
  await alanlariGaranti();
  const es = yeni.esleme?.find((e) => e.kaynak === once.kod)?.alanlar;
  if (!es) return;
  const harita = (id: string): string[] => {
    if (!id.startsWith('alan:')) return [id];                     // kişinin kendi alanı aynen kalır
    const yeniKodlar = es[id.slice(5)];
    return yeniKodlar ? yeniKodlar.map((k) => `alan:${k}`) : [id];
  };
  await db.transaction('rw', db.program, async () => {
    for (const p of await db.program.toArray()) {
      const patch: Record<string, unknown> = {};
      if (p.alanlar?.length) {
        const y = Array.from(new Set(p.alanlar.flatMap(harita)));
        if (y.join('|') !== p.alanlar.join('|')) patch.alanlar = y;
      }
      if (p.odak) { const y = harita(p.odak.alan)[0]; if (y !== p.odak.alan) patch.odak = { ...p.odak, alan: y }; }
      if (Object.keys(patch).length) await db.program.update(p.id, { ...patch, guncellendi: Date.now() });
    }
  });
}

// ———————————————— okuma yardımcıları (etkin çerçeveden) ————————————————

export const alanTanimi = (kod: string | null | undefined, c: Cerceve = etkin): CerceveAlan | undefined =>
  (kod ? c.alanlar.find((a) => a.kod === kod) : undefined);

/** Bir alan kodunun adı: etkin çerçevede yoksa bilinen diğer çerçevelerde aranır (eski etiketler için). */
export function bilinenAlanAdi(kod: string): string | undefined {
  return alanTanimi(kod)?.ad ?? alanTanimi(kod, VARSAYILAN)?.ad;
}

export const ardindanSecenekleri = (c: Cerceve = etkin) => [...c.ardindan.filter((x) => x !== SAAT_SECENEGI), SAAT_SECENEGI];
export const istekSorusu = (c: Cerceve = etkin) => c.metinler?.istek_sorusu ?? 'Hayatında neyin biraz daha olmasını isterdin?';
export const uzmanNotu = (c: Cerceve = etkin) => c.metinler?.uzman_notu ?? 'Uzun süredir kendini iyi hissetmiyorsan bir uzmanla konuşmak iyi gelir.';

'use client';

// ————————————————————————————————————————————————————————————————
// Çevrem (7 ekim — v1 şema). Ailem ve arkadaş grupları: üyeler, davet kodu, ortak listeler,
// ortak işler, ricalar. Kaynağı sunucu (supabase/v1/03-cevrem.sql); şifre yok, yetki RLS.
//
//  • Durum bellekte tutulur; açılışta ve her değişiklikte (Realtime) grup verisi yeniden çekilir.
//    Veri küçük (bir ailenin listeleri), bu yüzden "değişince hepsini çek" yeterli ve sağlam.
//  • Yazmalar önce bellekteki duruma uygulanır (anında görünür), sonra sunucuya gider.
//  • Ajanda köprüsü: üstlendiğim ortak işler ve kabul ettiğim ricalar ajandamda kart olarak
//    durur (kimliği belirli: c-is-…, c-rc-…; eşitlenmez — kaynağı burası). Ajandada işaretleyince
//    sonuç sunucuya geri yazılır.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { db, type AjandaKartRow } from './db';
import { supabase } from './supabase';
import { ajandaKancalari } from './ajanda';
import { metindenBelge } from './belge';
import { bugun, gunAktif, type Blok, type Izinler } from './paket';

export type GrupTur = 'aile' | 'arkadas';
export const GRUP_SINIR = 12;
export const GRUP_TUR: Record<GrupTur, { ikon: string; ad: string; ornek: string }> = {
  aile: { ikon: '🏠', ad: 'Ailem', ornek: 'ör. Ev' },
  arkadas: { ikon: '🫂', ad: 'Arkadaşlar', ornek: 'ör. Pazar yürüyüşçüleri' },
};

export interface Grup { id: string; ad: string; tur: GrupTur; ikon: string | null; kurucu: string }
export interface Uye { grup_id: string; uye_id: string; rol: 'yonetici' | 'uye'; durum: 'aktif' | 'ayrildi'; katildi: string; ad: string; avatar: string | null }
export interface Liste { id: string; grup_id: string; ad: string; ikon: string | null; olusturan: string | null; silindi: boolean; olusturuldu: string }
export interface Madde { id: string; liste_id: string; grup_id: string; metin: string; ekleyen: string | null; isaretli: boolean; isaret_kim: string | null; isaret_zaman: string | null; silindi: boolean; olusturuldu: string }
export interface OrtakIs {
  id: string; grup_id: string; ad: string; aciklama: string | null; tarih: string; bitis: string | null; gunler: number[] | null; saat: string | null;
  ustlenen: string | null; ustlenme_zaman: string | null; olusturan: string | null; silindi: boolean; olusturuldu: string;
}
export interface IsKayit { is_id: string; tarih: string; grup_id: string; yapildi: boolean; yapan: string | null; zaman: string }
export type RicaDurum = 'bekliyor' | 'kabul' | 'ret' | 'yapildi' | 'iptal';
export interface Rica { id: string; grup_id: string; isteyen: string; istenen: string; ad: string; aciklama: string | null; tarih: string; saat: string | null; durum: RicaDurum; olusturuldu: string; guncellendi: string }

/** Birlikte rutin: "haftada N kez" ortak hedef (supabase/v1/08-birlikte.sql). */
export interface BirlikteRutin { id: string; grup_id: string; ad: string; ikon: string | null; aciklama: string | null; hedef: number; olusturan: string | null; silindi: boolean; olusturuldu: string }
export interface BirlikteKatilim { rutin_id: string; grup_id: string; uye_id: string; durum: 'aktif' | 'ayrildi'; katildi: string }
export interface BirlikteKayit { rutin_id: string; grup_id: string; uye_id: string; tarih: string; zaman: string }
export type Yanit = 'geliyorum' | 'belki' | 'gelemem';
export interface Bulusma { id: string; grup_id: string; ad: string; aciklama: string | null; tarih: string; saat: string | null; yer: string | null; olusturan: string | null; iptal: boolean; olusturuldu: string; guncellendi: string }
export interface BulusmaYanit { bulusma_id: string; grup_id: string; uye_id: string; yanit: Yanit; zaman: string }

/** Çevrem'deki birinin bana gönderdiği kart/program tanımı (supabase/v1/07-paylasim.sql). */
export interface GelenPaylasim { id: string; gonderen: string; gonderen_ad: string; paket: unknown; alindi: string | null; olusturuldu: string }

export interface CevremDurum {
  hazir: boolean; uid: string | null; hata: string | null;
  gruplar: Grup[]; uyeler: Uye[]; listeler: Liste[]; maddeler: Madde[]; isler: OrtakIs[]; kayitlar: IsKayit[]; ricalar: Rica[];
  gelenler: GelenPaylasim[];
  rutinler: BirlikteRutin[]; katilimlar: BirlikteKatilim[]; bkayitlar: BirlikteKayit[];
  bulusmalar: Bulusma[]; yanitlar: BulusmaYanit[];
}

const BOS: CevremDurum = { hazir: false, uid: null, hata: null, gruplar: [], uyeler: [], listeler: [], maddeler: [], isler: [], kayitlar: [], ricalar: [], gelenler: [], rutinler: [], katilimlar: [], bkayitlar: [], bulusmalar: [], yanitlar: [] };
let durum: CevremDurum = BOS;
const dinleyiciler = new Set<(d: CevremDurum) => void>();
function yay(p: Partial<CevremDurum>) {
  durum = { ...durum, ...p };
  dinleyiciler.forEach((f) => f(durum));
  zamanlaAjanda();
}
export const cevremDurum = () => durum;

export function useCevrem(): CevremDurum {
  const [d, setD] = useState(durum);
  useEffect(() => { dinleyiciler.add(setD); setD(durum); return () => { dinleyiciler.delete(setD); }; }, []);
  return d;
}

// ———————————————— yükleme + canlılık ————————————————

let kanal: RealtimeChannel | null = null;
let gecikme: ReturnType<typeof setTimeout> | null = null;
let yukleniyor: Promise<void> | null = null;
let tekrar = false;

function hata(e: { message: string } | null | undefined) { if (e) throw new Error(e.message); }

async function yukle(): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  if (yukleniyor) { tekrar = true; return yukleniyor; }
  yukleniyor = (async () => {
    try {
      const { data: o } = await sb.auth.getSession();
      const uid = o.session?.user.id ?? null;
      if (!uid) { yay({ ...BOS, hazir: true }); return; }
      const benim = await sb.from('grup_uye').select('grup_id').eq('uye_id', uid).eq('durum', 'aktif');
      hata(benim.error);
      const ids = (benim.data ?? []).map((r) => r.grup_id as string);
      // Bana gelen paylaşımlar (son 60 gün; alınmamışlar ve yakında alınanlar)
      const pg = await sb.from('paylasim').select('id, gonderen, gonderen_ad, paket, alindi, olusturuldu').eq('alici', uid)
        .gte('olusturuldu', new Date(Date.now() - 60 * 86400000).toISOString()).order('olusturuldu', { ascending: false }).limit(100);
      const gelenler = (pg.error ? durum.gelenler : (pg.data ?? [])) as GelenPaylasim[];
      if (!ids.length) { yay({ ...BOS, hazir: true, uid, gelenler }); return; }
      const [g, u, l, m, i, k, r, br, bk, bkk, bl, by] = await Promise.all([
        sb.from('grup').select('id, ad, tur, ikon, kurucu').in('id', ids).order('olusturuldu'),
        sb.from('grup_uye').select('grup_id, uye_id, rol, durum, katildi').in('grup_id', ids),
        sb.from('liste').select('id, grup_id, ad, ikon, olusturan, silindi, olusturuldu').in('grup_id', ids).eq('silindi', false).order('olusturuldu'),
        sb.from('liste_madde').select('id, liste_id, grup_id, metin, ekleyen, isaretli, isaret_kim, isaret_zaman, silindi, olusturuldu').in('grup_id', ids).eq('silindi', false).order('olusturuldu'),
        sb.from('ortak_is').select('id, grup_id, ad, aciklama, tarih, bitis, gunler, saat, ustlenen, ustlenme_zaman, olusturan, silindi, olusturuldu').in('grup_id', ids).eq('silindi', false).order('olusturuldu'),
        sb.from('ortak_is_kayit').select('is_id, tarih, grup_id, yapildi, yapan, zaman').in('grup_id', ids).gte('tarih', tarihEkleGun(bugun(), -30)),
        sb.from('rica').select('id, grup_id, isteyen, istenen, ad, aciklama, tarih, saat, durum, olusturuldu, guncellendi').in('grup_id', ids).neq('durum', 'iptal').order('olusturuldu', { ascending: false }).limit(200),
        sb.from('birlikte_rutin').select('id, grup_id, ad, ikon, aciklama, hedef, olusturan, silindi, olusturuldu').in('grup_id', ids).eq('silindi', false).order('olusturuldu'),
        sb.from('birlikte_katilim').select('rutin_id, grup_id, uye_id, durum, katildi').in('grup_id', ids),
        sb.from('birlikte_kayit').select('rutin_id, grup_id, uye_id, tarih, zaman').in('grup_id', ids).gte('tarih', tarihEkleGun(bugun(), -42)),
        sb.from('bulusma').select('id, grup_id, ad, aciklama, tarih, saat, yer, olusturan, iptal, olusturuldu, guncellendi').in('grup_id', ids).gte('tarih', tarihEkleGun(bugun(), -14)).order('tarih'),
        sb.from('bulusma_yanit').select('bulusma_id, grup_id, uye_id, yanit, zaman').in('grup_id', ids),
      ]);
      for (const x of [g, u, l, m, i, k, r]) hata(x.error);
      // 08-birlikte.sql henüz çalıştırılmadıysa bu tablolar yok: Çevrem'in geri kalanı yine çalışsın.
      const ek = <T,>(x: { data: unknown; error: { message: string } | null }): T[] => (x.error ? [] : ((x.data ?? []) as T[]));
      const uyeSatir = (u.data ?? []) as Omit<Uye, 'ad' | 'avatar'>[];
      const kisiler = Array.from(new Set(uyeSatir.map((x) => x.uye_id)));
      const p = await sb.from('profil').select('id, gorunen_ad, eposta, avatar_url').in('id', kisiler);
      const prof = new Map((p.data ?? []).map((x) => [x.id as string, x as { gorunen_ad: string; eposta: string; avatar_url: string | null }]));
      const uyeler: Uye[] = uyeSatir.map((x) => {
        const pr = prof.get(x.uye_id);
        return { ...x, ad: pr?.gorunen_ad || pr?.eposta?.split('@')[0] || 'Üye', avatar: pr?.avatar_url ?? null };
      });
      yay({
        hazir: true, uid, hata: null,
        gruplar: (g.data ?? []) as Grup[], uyeler,
        listeler: (l.data ?? []) as Liste[], maddeler: (m.data ?? []) as Madde[],
        isler: (i.data ?? []) as OrtakIs[], kayitlar: (k.data ?? []) as IsKayit[], ricalar: (r.data ?? []) as Rica[],
        gelenler,
        rutinler: ek<BirlikteRutin>(br), katilimlar: ek<BirlikteKatilim>(bk), bkayitlar: ek<BirlikteKayit>(bkk),
        bulusmalar: ek<Bulusma>(bl), yanitlar: ek<BulusmaYanit>(by),
      });
    } catch (e) {
      yay({ hazir: true, hata: e instanceof Error ? e.message : String(e) });
    } finally {
      yukleniyor = null;
      if (tekrar) { tekrar = false; zamanla(0); }
    }
  })();
  return yukleniyor;
}

function zamanla(ms = 250) {
  if (gecikme) clearTimeout(gecikme);
  gecikme = setTimeout(() => { gecikme = null; void yukle(); }, ms);
}
export const cevremYenile = () => yukle();

/** Uygulama düzeyinde bir kez: yükle, Realtime'a abone ol, odakta yenile; ajanda köprüsünü çalıştır. */
export function useCevremBaslat() {
  useEffect(() => {
    const sb = supabase();
    if (!sb) { yay({ ...BOS, hazir: true }); return; }
    void yukle();
    const ad = `cevrem-${Math.random().toString(36).slice(2, 8)}`;
    let c = sb.channel(ad);
    for (const t of ['grup', 'grup_uye', 'liste', 'liste_madde', 'ortak_is', 'ortak_is_kayit', 'rica', 'paylasim', 'birlikte_rutin', 'birlikte_katilim', 'birlikte_kayit', 'bulusma', 'bulusma_yanit']) {
      c = c.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => zamanla());
    }
    kanal = c.subscribe();
    const odak = () => { if (document.visibilityState === 'visible') zamanla(0); };
    document.addEventListener('visibilitychange', odak);
    window.addEventListener('online', odak);
    return () => {
      if (kanal) sb.removeChannel(kanal);
      kanal = null;
      document.removeEventListener('visibilitychange', odak);
      window.removeEventListener('online', odak);
    };
  }, []);
}

// ———————————————— yardımcılar ————————————————

function tarihEkleGun(t: string, n: number) {
  const d = new Date(`${t}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const isGunu = (i: OrtakIs, tarih: string) => gunAktif({ baslangic: i.tarih, bitis: i.bitis, gunler: i.gunler, saatler: [] } as never, tarih);
export const isKaydi = (d: CevremDurum, isId: string, tarih: string) => d.kayitlar.find((k) => k.is_id === isId && k.tarih === tarih && k.yapildi) ?? null;
export const uyeAdi = (d: CevremDurum, kim: string | null | undefined) => (!kim ? '' : kim === d.uid ? 'Ben' : d.uyeler.find((u) => u.uye_id === kim)?.ad ?? 'Biri');
export const aktifUyeler = (d: CevremDurum, grup: string) => d.uyeler.filter((u) => u.grup_id === grup && u.durum === 'aktif').sort((a, b) => a.katildi.localeCompare(b.katildi));
export const benYoneticiyim = (d: CevremDurum, grup: string) => d.uyeler.some((u) => u.grup_id === grup && u.uye_id === d.uid && u.durum === 'aktif' && u.rol === 'yonetici');
export const grupIkonu = (g: Pick<Grup, 'tur' | 'ikon'>) => g.ikon || GRUP_TUR[g.tur]?.ikon || '🏠';

async function sb() {
  const s = supabase();
  if (!s) throw new Error('Sunucu ayarı yok');
  if (!navigator.onLine) throw new Error('İnternet yok');
  return s;
}
function yerel<K extends keyof CevremDurum>(k: K, f: (x: CevremDurum[K]) => CevremDurum[K]) { yay({ [k]: f(durum[k]) } as Partial<CevremDurum>); }
const simdi = () => new Date().toISOString();

// ———————————————— gruplar ————————————————

export async function grupKur(ad: string, tur: GrupTur): Promise<string> {
  const s = await sb();
  const r = await s.rpc('grup_kur', { p_ad: ad.trim(), p_tur: tur });
  hata(r.error);
  await yukle();
  return r.data as string;
}
export async function davetKodu(grup: string): Promise<string> {
  const r = await (await sb()).rpc('grup_davet_olustur', { p_grup: grup });
  hata(r.error);
  return r.data as string;
}
export async function davetBak(kod: string): Promise<{ grup_id: string; ad: string; tur: GrupTur; uye_sayisi: number } | null> {
  const r = await (await sb()).rpc('grup_davet_bak', { p_kod: kod });
  hata(r.error);
  return ((r.data ?? []) as { grup_id: string; ad: string; tur: GrupTur; uye_sayisi: number }[])[0] ?? null;
}
export async function grupKatil(kod: string): Promise<string> {
  const r = await (await sb()).rpc('grup_katil', { p_kod: kod });
  hata(r.error);
  await yukle();
  return r.data as string;
}
export async function grupAyril(grup: string, kisi: string | null = null) {
  const r = await (await sb()).rpc('grup_ayril', { p_grup: grup, p_kisi: kisi });
  hata(r.error);
  await yukle();
}
export async function grupGuncelle(grup: string, patch: { ad?: string; ikon?: string | null }) {
  yerel('gruplar', (x) => x.map((g) => (g.id === grup ? { ...g, ...patch } as Grup : g)));
  hata((await (await sb()).from('grup').update({ ...patch, guncellendi: simdi() }).eq('id', grup)).error);
}

// ———————————————— listeler ————————————————

export async function listeEkle(grup: string, ad: string, ikon: string | null): Promise<string> {
  const id = crypto.randomUUID();
  const l: Liste = { id, grup_id: grup, ad: ad.trim(), ikon, olusturan: durum.uid, silindi: false, olusturuldu: simdi() };
  yerel('listeler', (x) => [...x, l]);
  hata((await (await sb()).from('liste').insert({ id, grup_id: grup, ad: l.ad, ikon, olusturan: durum.uid })).error);
  return id;
}
export async function listeGuncelle(id: string, patch: { ad?: string; ikon?: string | null }) {
  yerel('listeler', (x) => x.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  hata((await (await sb()).from('liste').update({ ...patch, guncellendi: simdi() }).eq('id', id)).error);
}
export async function listeSil(id: string) {
  yerel('listeler', (x) => x.filter((l) => l.id !== id));
  hata((await (await sb()).from('liste').update({ silindi: true, guncellendi: simdi() }).eq('id', id)).error);
}
export async function maddeEkle(liste: Liste, metin: string) {
  const id = crypto.randomUUID();
  const m: Madde = { id, liste_id: liste.id, grup_id: liste.grup_id, metin: metin.trim(), ekleyen: durum.uid, isaretli: false, isaret_kim: null, isaret_zaman: null, silindi: false, olusturuldu: simdi() };
  yerel('maddeler', (x) => [...x, m]);
  hata((await (await sb()).from('liste_madde').insert({ id, liste_id: liste.id, grup_id: liste.grup_id, metin: m.metin, ekleyen: durum.uid })).error);
}
export async function maddeIsaretle(m: Madde, isaretli: boolean) {
  const patch = { isaretli, isaret_kim: isaretli ? durum.uid : null, isaret_zaman: isaretli ? simdi() : null };
  yerel('maddeler', (x) => x.map((y) => (y.id === m.id ? { ...y, ...patch } : y)));
  hata((await (await sb()).from('liste_madde').update({ ...patch, guncellendi: simdi() }).eq('id', m.id)).error);
}
export async function maddeSil(m: Madde) {
  yerel('maddeler', (x) => x.filter((y) => y.id !== m.id));
  hata((await (await sb()).from('liste_madde').update({ silindi: true, guncellendi: simdi() }).eq('id', m.id)).error);
}
export async function isaretlileriTemizle(liste: string) {
  yerel('maddeler', (x) => x.filter((y) => !(y.liste_id === liste && y.isaretli)));
  hata((await (await sb()).from('liste_madde').update({ silindi: true, guncellendi: simdi() }).eq('liste_id', liste).eq('isaretli', true)).error);
}

// ———————————————— ortak işler ————————————————

export interface IsGirdi { ad: string; aciklama: string | null; tarih: string; bitis: string | null; gunler: number[] | null; saat: string | null; ustlenen: string | null }

export async function isEkle(grup: string, g: IsGirdi): Promise<string> {
  const id = crypto.randomUUID();
  const satir = { id, grup_id: grup, ...g, ustlenme_zaman: g.ustlenen ? simdi() : null, olusturan: durum.uid };
  yerel('isler', (x) => [...x, { ...satir, silindi: false, olusturuldu: simdi() }]);
  hata((await (await sb()).from('ortak_is').insert(satir)).error);
  return id;
}
export async function isGuncelle(id: string, g: Partial<IsGirdi>) {
  yerel('isler', (x) => x.map((i) => (i.id === id ? { ...i, ...g } : i)));
  hata((await (await sb()).from('ortak_is').update({ ...g, guncellendi: simdi() }).eq('id', id)).error);
}
export async function isUstlen(id: string, kim: string | null) {
  const patch = { ustlenen: kim, ustlenme_zaman: kim ? simdi() : null };
  yerel('isler', (x) => x.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  hata((await (await sb()).from('ortak_is').update({ ...patch, guncellendi: simdi() }).eq('id', id)).error);
}
export async function isSil(id: string) {
  yerel('isler', (x) => x.filter((i) => i.id !== id));
  hata((await (await sb()).from('ortak_is').update({ silindi: true, guncellendi: simdi() }).eq('id', id)).error);
}
/** O günün işini yapıldı/yapılmadı yap. Kimse üstlenmemiş tek seferlik işi yapan otomatik üstlenmiş olur. */
export async function isYapildi(i: OrtakIs, tarih: string, yapildi: boolean) {
  const s = await sb();
  if (yapildi) {
    const k: IsKayit = { is_id: i.id, tarih, grup_id: i.grup_id, yapildi: true, yapan: durum.uid, zaman: simdi() };
    yerel('kayitlar', (x) => [...x.filter((y) => !(y.is_id === i.id && y.tarih === tarih)), k]);
    hata((await s.from('ortak_is_kayit').upsert(k, { onConflict: 'is_id,tarih' })).error);
    if (!i.ustlenen && i.bitis === i.tarih) await isUstlen(i.id, durum.uid);
  } else {
    yerel('kayitlar', (x) => x.filter((y) => !(y.is_id === i.id && y.tarih === tarih)));
    hata((await s.from('ortak_is_kayit').delete().eq('is_id', i.id).eq('tarih', tarih)).error);
  }
}

// ———————————————— ricalar ————————————————

export interface RicaGirdi { istenen: string; ad: string; aciklama: string | null; tarih: string; saat: string | null }

export async function ricaGonder(grup: string, g: RicaGirdi) {
  const id = crypto.randomUUID();
  const r: Rica = { id, grup_id: grup, isteyen: durum.uid!, ...g, durum: 'bekliyor', olusturuldu: simdi(), guncellendi: simdi() };
  yerel('ricalar', (x) => [r, ...x]);
  hata((await (await sb()).from('rica').insert({ id, grup_id: grup, isteyen: durum.uid, ...g })).error);
}
export async function ricaDurum(id: string, d: RicaDurum) {
  yerel('ricalar', (x) => (d === 'iptal' ? x.filter((r) => r.id !== id) : x.map((r) => (r.id === id ? { ...r, durum: d, guncellendi: simdi() } : r))));
  hata((await (await sb()).from('rica').update({ durum: d, guncellendi: simdi() }).eq('id', id)).error);
}

// ———————————————— birlikte rutin ————————————————

/** Haftanın pazartesisi (YYYY-MM-DD). */
export function haftaBasi(t: string) {
  const d = new Date(`${t}T12:00:00`);
  return tarihEkleGun(t, -((d.getDay() + 6) % 7));
}
export const katiliyorMu = (d: CevremDurum, rutin: string, kim = d.uid) => d.katilimlar.some((k) => k.rutin_id === rutin && k.uye_id === kim && k.durum === 'aktif');
export const rutinKatilimcilari = (d: CevremDurum, r: BirlikteRutin) =>
  d.katilimlar.filter((k) => k.rutin_id === r.id && k.durum === 'aktif' && d.uyeler.some((u) => u.grup_id === r.grup_id && u.uye_id === k.uye_id && u.durum === 'aktif'))
    .sort((a, b) => a.katildi.localeCompare(b.katildi));
/** O haftada (pazartesiden) kişinin kaç kez yaptığı. */
export function haftaSayisi(d: CevremDurum, rutin: string, kim: string | null, hafta = haftaBasi(bugun())) {
  const son = tarihEkleGun(hafta, 6);
  return d.bkayitlar.filter((k) => k.rutin_id === rutin && k.uye_id === kim && k.tarih >= hafta && k.tarih <= son).length;
}
export const bugunYaptiMi = (d: CevremDurum, rutin: string, kim = d.uid, t = bugun()) => d.bkayitlar.some((k) => k.rutin_id === rutin && k.uye_id === kim && k.tarih === t);
/** Kişinin üst üste hedefi tuttuğu hafta sayısı (bu hafta tutulduysa o da sayılır). */
export function seri(d: CevremDurum, r: BirlikteRutin, kim: string | null) {
  let h = haftaBasi(bugun()), n = 0;
  if (haftaSayisi(d, r.id, kim, h) >= r.hedef) n++;
  for (let i = 0; i < 5; i++) { h = tarihEkleGun(h, -7); if (haftaSayisi(d, r.id, kim, h) >= r.hedef) n++; else break; }
  return n;
}

export interface RutinGirdi { ad: string; ikon: string | null; aciklama: string | null; hedef: number }
export async function rutinEkle(grup: string, g: RutinGirdi, katil = true): Promise<string> {
  const id = crypto.randomUUID();
  const s = await sb();
  yerel('rutinler', (x) => [...x, { id, grup_id: grup, ...g, olusturan: durum.uid, silindi: false, olusturuldu: simdi() }]);
  hata((await s.from('birlikte_rutin').insert({ id, grup_id: grup, ...g, olusturan: durum.uid })).error);
  if (katil) await rutineKatil(grup, id, true);
  return id;
}
export async function rutinGuncelle(id: string, g: Partial<RutinGirdi>) {
  yerel('rutinler', (x) => x.map((r) => (r.id === id ? { ...r, ...g } : r)));
  hata((await (await sb()).from('birlikte_rutin').update({ ...g, guncellendi: simdi() }).eq('id', id)).error);
}
export async function rutinSil(id: string) {
  yerel('rutinler', (x) => x.filter((r) => r.id !== id));
  hata((await (await sb()).from('birlikte_rutin').update({ silindi: true, guncellendi: simdi() }).eq('id', id)).error);
}
export async function rutineKatil(grup: string, rutin: string, katil: boolean) {
  const k: BirlikteKatilim = { rutin_id: rutin, grup_id: grup, uye_id: durum.uid!, durum: katil ? 'aktif' : 'ayrildi', katildi: simdi() };
  yerel('katilimlar', (x) => [...x.filter((y) => !(y.rutin_id === rutin && y.uye_id === durum.uid)), k]);
  hata((await (await sb()).from('birlikte_katilim').upsert(k, { onConflict: 'rutin_id,uye_id' })).error);
}
export async function rutinYapildi(r: Pick<BirlikteRutin, 'id' | 'grup_id'>, tarih: string, yapildi: boolean) {
  const s = await sb();
  if (yapildi) {
    const k: BirlikteKayit = { rutin_id: r.id, grup_id: r.grup_id, uye_id: durum.uid!, tarih, zaman: simdi() };
    yerel('bkayitlar', (x) => [...x.filter((y) => !(y.rutin_id === r.id && y.uye_id === durum.uid && y.tarih === tarih)), k]);
    hata((await s.from('birlikte_kayit').upsert(k, { onConflict: 'rutin_id,uye_id,tarih' })).error);
  } else {
    yerel('bkayitlar', (x) => x.filter((y) => !(y.rutin_id === r.id && y.uye_id === durum.uid && y.tarih === tarih)));
    hata((await s.from('birlikte_kayit').delete().eq('rutin_id', r.id).eq('uye_id', durum.uid!).eq('tarih', tarih)).error);
  }
}

// ———————————————— buluşma ————————————————

export interface BulusmaGirdi { ad: string; aciklama: string | null; tarih: string; saat: string | null; yer: string | null }
export const yanitim = (d: CevremDurum, b: string, kim = d.uid) => d.yanitlar.find((y) => y.bulusma_id === b && y.uye_id === kim)?.yanit ?? null;
export function yanitSayilari(d: CevremDurum, b: Bulusma) {
  const aktif = new Set(aktifUyeler(d, b.grup_id).map((u) => u.uye_id));
  const ys = d.yanitlar.filter((y) => y.bulusma_id === b.id && aktif.has(y.uye_id));
  return { geliyorum: ys.filter((y) => y.yanit === 'geliyorum'), belki: ys.filter((y) => y.yanit === 'belki'), gelemem: ys.filter((y) => y.yanit === 'gelemem'), bekleyen: aktif.size - ys.length };
}
export async function bulusmaEkle(grup: string, g: BulusmaGirdi): Promise<string> {
  const id = crypto.randomUUID();
  const s = await sb();
  yerel('bulusmalar', (x) => [...x, { id, grup_id: grup, ...g, olusturan: durum.uid, iptal: false, olusturuldu: simdi(), guncellendi: simdi() }]);
  hata((await s.from('bulusma').insert({ id, grup_id: grup, ...g, olusturan: durum.uid })).error);
  await bulusmaYanitla({ id, grup_id: grup }, 'geliyorum');
  return id;
}
export async function bulusmaGuncelle(id: string, g: Partial<BulusmaGirdi> & { iptal?: boolean }) {
  yerel('bulusmalar', (x) => x.map((b) => (b.id === id ? { ...b, ...g, guncellendi: simdi() } : b)));
  hata((await (await sb()).from('bulusma').update({ ...g, guncellendi: simdi() }).eq('id', id)).error);
}
export async function bulusmaYanitla(b: Pick<Bulusma, 'id' | 'grup_id'>, yanit: Yanit) {
  const y: BulusmaYanit = { bulusma_id: b.id, grup_id: b.grup_id, uye_id: durum.uid!, yanit, zaman: simdi() };
  yerel('yanitlar', (x) => [...x.filter((z) => !(z.bulusma_id === b.id && z.uye_id === durum.uid)), y]);
  hata((await (await sb()).from('bulusma_yanit').upsert(y, { onConflict: 'bulusma_id,uye_id' })).error);
}

// ———————————————— paylaş (kart / program tanımı) ————————————————

/** Çevrem'deki kişiler (benden başka, grupları birleşik): Paylaş'ta alıcı listesi. */
export function paylasilacakKisiler(d: CevremDurum): { id: string; ad: string; gruplar: string[] }[] {
  const m = new Map<string, { id: string; ad: string; gruplar: string[] }>();
  for (const u of d.uyeler) {
    if (u.uye_id === d.uid || u.durum !== 'aktif') continue;
    const g = d.gruplar.find((x) => x.id === u.grup_id);
    const k = m.get(u.uye_id) ?? { id: u.uye_id, ad: u.ad, gruplar: [] };
    if (g) k.gruplar.push(g.ad);
    m.set(u.uye_id, k);
  }
  return Array.from(m.values()).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

export async function paylasimGonder(alici: string, paket: unknown) {
  const s = await sb();
  const benAd = durum.uyeler.find((u) => u.uye_id === durum.uid)?.ad ?? 'Biri';
  hata((await s.from('paylasim').insert({ gonderen: durum.uid, gonderen_ad: benAd, alici, paket })).error);
}
export async function paylasimAlindi(id: string) {
  yerel('gelenler', (x) => x.map((g) => (g.id === id ? { ...g, alindi: simdi() } : g)));
  hata((await (await sb()).from('paylasim').update({ alindi: simdi() }).eq('id', id)).error);
}
export async function paylasimSil(id: string) {
  yerel('gelenler', (x) => x.filter((g) => g.id !== id));
  hata((await (await sb()).from('paylasim').delete().eq('id', id)).error);
}

// ———————————————— ajanda köprüsü ————————————————

const IZIN: Izinler = { ac: true, duzenle: false, sil: false, gun_degistir: false, sirala: true, duzeltme_gun: null };
export const isKartId = (id: string) => `c-is-${id}`;
export const ricaKartId = (id: string) => `c-rc-${id}`;
export const rutinKartId = (id: string) => `c-br-${id}`;
export const bulusmaKartId = (id: string) => `c-bl-${id}`;
const bloklar = (aciklama: string | null): Blok[] => (aciklama?.trim() ? [{ tur: 'belge', belge: metindenBelge(aciklama) }] : []);

let ajandaZm: ReturnType<typeof setTimeout> | null = null;
function zamanlaAjanda() {
  if (typeof window === 'undefined') return;
  if (ajandaZm) clearTimeout(ajandaZm);
  ajandaZm = setTimeout(() => { ajandaZm = null; void ajandayaYansit(); }, 100);
}

/** Üstlendiğim ortak işleri ve kabul ettiğim ricaları ajandama kart olarak koy; diğerlerini kaldır. */
async function ajandayaYansit() {
  const d = durum;
  if (!d.hazir || !d.uid || d.hata) return;
  const grupAd = new Map(d.gruplar.map((g) => [g.id, `${grupIkonu(g)} ${g.ad}`]));
  const istenen = new Map<string, AjandaKartRow>();
  const mevcutlar = (await db.ajanda_kart.toArray()).filter((k) => k.id.startsWith('c-'));
  let sira = (await db.ajanda_kart.toArray()).reduce((m, k) => Math.max(m, k.sira), 0);
  const eski = new Map(mevcutlar.map((k) => [k.id, k]));
  const kart = (id: string, ad: string, aciklama: string | null, baslangic: string, bitis: string | null, gunler: number[] | null, saat: string | null, grup: string, olusturan: string | null): AjandaKartRow => ({
    id, tip: 'yap', ad, bloklar: bloklar(aciklama), baslangic, bitis, gunler, saatler: saat ? [saat] : [], hatirlatma: null,
    kaynak_modul: 'ortak', kaynak_ref: `cevrem:${grup}`, kaynak_etiket: grupAd.get(grup) ?? 'Çevrem', sahip: olusturan ?? 'cevrem',
    izinler: IZIN, geri_bildirim: 'yerel', sira: eski.get(id)?.sira ?? ++sira, guncellendi: Date.now(),
    ortak: { aile: grup, olusturan: olusturan ?? '', olusturan_ad: uyeAdi(d, olusturan), ustlenen: d.uid, ustlenen_ad: 'Ben', yapan_ad: null },
  });
  for (const i of d.isler) if (i.ustlenen === d.uid) istenen.set(isKartId(i.id), kart(isKartId(i.id), i.ad, i.aciklama, i.tarih, i.bitis, i.gunler, i.saat, i.grup_id, i.olusturan));
  for (const r of d.ricalar) if (r.istenen === d.uid && (r.durum === 'kabul' || r.durum === 'yapildi')) istenen.set(ricaKartId(r.id), kart(ricaKartId(r.id), r.ad, r.aciklama, r.tarih, r.tarih, null, r.saat, r.grup_id, r.isteyen));

  // Birlikte rutin (katıldıklarım): her gün görünen kart; bu haftanın hedefi tutunca haftanın kalanı kalkar,
  // geçmişte yapılmayan günler de "kaçırıldı" gibi durmasın diye atlanır.
  const t = bugun();
  for (const r of d.rutinler) {
    const k = d.katilimlar.find((x) => x.rutin_id === r.id && x.uye_id === d.uid && x.durum === 'aktif');
    if (!k) continue;
    const id = rutinKartId(r.id);
    const kd = new Date(k.katildi);
    const bas = `${kd.getFullYear()}-${String(kd.getMonth() + 1).padStart(2, '0')}-${String(kd.getDate()).padStart(2, '0')}`;
    const yapilan = new Set(d.bkayitlar.filter((x) => x.rutin_id === r.id && x.uye_id === d.uid).map((x) => x.tarih));
    const atla: string[] = [];
    for (let g = tarihEkleGun(t, -42); g < t; g = tarihEkleGun(g, 1)) if (g >= bas && !yapilan.has(g)) atla.push(g);
    const hb = haftaBasi(t);
    const sayi = haftaSayisi(d, r.id, d.uid, hb);
    if (sayi >= r.hedef) for (let g = t; g <= tarihEkleGun(hb, 6); g = tarihEkleGun(g, 1)) if (!yapilan.has(g)) atla.push(g);
    const c = kart(id, `${r.ikon ? `${r.ikon} ` : ''}${r.ad}`, r.aciklama, bas, null, null, null, r.grup_id, r.olusturan);
    c.kaynak_etiket = `${grupAd.get(r.grup_id) ?? 'Çevrem'} · bu hafta ${Math.min(sayi, r.hedef)}/${r.hedef}`;
    c.atla = atla;
    istenen.set(id, c);
  }
  // Buluşma ("geliyorum" dediklerim, iptal olmayan): o günün kartı.
  for (const b of d.bulusmalar) {
    if (b.iptal || yanitim(d, b.id) !== 'geliyorum') continue;
    const not = [b.yer ? `📍 ${b.yer}` : '', b.aciklama ?? ''].filter(Boolean).join('\n') || null;
    const c = kart(bulusmaKartId(b.id), `📅 ${b.ad}`, not, b.tarih, b.tarih, null, b.saat, b.grup_id, b.olusturan);
    istenen.set(c.id, c);
  }

  // Sunucudaki "yapıldı" bilgisini ajanda kayıtlarına yansıt (başkası işaretlediyse de görünsün).
  const kayitlar: { id: string; kart_id: string; tarih: string; yapildi: boolean; zaman: number }[] = [];
  for (const k of d.kayitlar) if (istenen.has(isKartId(k.is_id)) && k.yapildi) kayitlar.push({ id: `${isKartId(k.is_id)}|${k.tarih}`, kart_id: isKartId(k.is_id), tarih: k.tarih, yapildi: true, zaman: Date.parse(k.zaman) });
  for (const r of d.ricalar) if (r.durum === 'yapildi' && istenen.has(ricaKartId(r.id))) kayitlar.push({ id: `${ricaKartId(r.id)}|${r.tarih}`, kart_id: ricaKartId(r.id), tarih: r.tarih, yapildi: true, zaman: Date.parse(r.guncellendi) });
  for (const k of d.bkayitlar) if (k.uye_id === d.uid && istenen.has(rutinKartId(k.rutin_id))) kayitlar.push({ id: `${rutinKartId(k.rutin_id)}|${k.tarih}`, kart_id: rutinKartId(k.rutin_id), tarih: k.tarih, yapildi: true, zaman: Date.parse(k.zaman) });

  db.uzaktan = true; // türetilmiş satırlar: eşitlenmez
  try {
    await db.transaction('rw', db.ajanda_kart, db.ajanda_kayit, async () => {
      for (const [id, k] of Array.from(istenen.entries())) {
        const e = eski.get(id);
        const imza = (x: AjandaKartRow) => JSON.stringify([x.ad, x.bloklar, x.baslangic, x.bitis, x.gunler, x.saatler, x.kaynak_etiket, x.atla ?? []]);
        if (!e || imza(e) !== imza(k)) await db.ajanda_kart.put(k);
      }
      for (const e of mevcutlar) if (!istenen.has(e.id)) { await db.ajanda_kart.delete(e.id); await db.ajanda_kayit.where('kart_id').equals(e.id).delete(); }
      const yerelKayit = (await db.ajanda_kayit.toArray()).filter((r) => r.kart_id.startsWith('c-'));
      const sunucu = new Set(kayitlar.map((r) => r.id));
      for (const r of kayitlar) {
        const y = yerelKayit.find((x) => x.id === r.id);
        if (!y?.yapildi) await db.ajanda_kayit.put({ id: r.id, kart_id: r.kart_id, tarih: r.tarih, yapildi: true, degerler: y?.degerler ?? null, zaman: r.zaman, guncellendi: Date.now() });
      }
      // Buluşma kartının işareti yalnız yerel (sunucuya gitmez) — geri alınmasın.
      for (const y of yerelKayit) if (y.yapildi && istenen.has(y.kart_id) && !y.kart_id.startsWith('c-bl-') && !sunucu.has(y.id) && !bekleyenIsaret.has(y.id)) {
        await db.ajanda_kayit.put({ ...y, yapildi: false, zaman: null, guncellendi: Date.now() });
      }
    });
  } finally { db.uzaktan = false; }
}

// Ajandada işaretlenince sunucuya yaz. Yazma bitene kadar bu kayıt "bekliyor" sayılır (yansıtma geri almasın).
const bekleyenIsaret = new Set<string>();
ajandaKancalari.ortakOlay = (kart, tarih, yapildi) => {
  if (!kart.id.startsWith('c-')) return;
  const anahtar = `${kart.id}|${tarih}`;
  bekleyenIsaret.add(anahtar);
  (async () => {
    try {
      if (kart.id.startsWith('c-bl-')) return;
      if (kart.id.startsWith('c-br-')) {
        const r = durum.rutinler.find((x) => rutinKartId(x.id) === kart.id);
        if (r) await rutinYapildi(r, tarih, yapildi);
      } else if (kart.id.startsWith('c-is-')) {
        const i = durum.isler.find((x) => isKartId(x.id) === kart.id);
        if (i) await isYapildi(i, tarih, yapildi);
      } else {
        const r = durum.ricalar.find((x) => ricaKartId(x.id) === kart.id);
        if (r) await ricaDurum(r.id, yapildi ? 'yapildi' : 'kabul');
      }
    } catch (e) { console.warn('[ritos] çevrem işareti', e); }
    finally { bekleyenIsaret.delete(anahtar); }
  })();
};

/** Bugün için özet (Home widget'ı). */
export function bugunOzet(d: CevremDurum) {
  const t = bugun();
  const isler = d.isler.filter((i) => isGunu(i, t));
  const acikIs = isler.filter((i) => !isKaydi(d, i.id, t)).length;
  const bekleyenRica = d.ricalar.filter((r) => r.istenen === d.uid && r.durum === 'bekliyor').length;
  const acikMadde = d.maddeler.filter((m) => !m.isaretli).length;
  return { acikIs, bekleyenRica, acikMadde };
}

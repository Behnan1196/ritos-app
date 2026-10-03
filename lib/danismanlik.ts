'use client';

// ————————————————————————————————————————————————————————————————
// Danışmanlık motoru (D1–D10, 26 eylül). Bkz. User Story'ler "Danışmanlık".
//
//  • İlişki (koç ↔ danışan, disiplin başına) sunucuda; içerik yok.
//  • Program ve geri bildirim iki taraf arasında ŞİFRELİ mesajla gider (ilişki anahtarı,
//    lib/iliskiAnahtar.ts). Sunucu yalnız zarfı görür.
//  • Program iki tarafta aynı kimlikle durur: danışanın işaretleri koçta aynı program/adım
//    kimliğine düşer, ilerleme ekranı (lib/program.ts ilerleme) değişmeden çalışır.
//  • İlk atama danışanın Gelenler'ine düşer (onay); sonraki güncellemeler kendiliğinden uygulanır.
//  • Mesaj işlemek tekrarlanabilir (aynı kimlikler, sürüm numarası): danışanın iki cihazı
//    aynı mesajı işlese de çift kayıt oluşmaz.
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import { db, type AileRow, type AileUyesi, type GeriBildirimRow, type IliskiRow, type MesajRow, type ProgramAdimRow, type ProgramRow, type UzakProgram } from './db';
import { supabase } from './supabase';
import { b64, b64Coz, coz, dekUret, rastgele, sifrele } from './sifre';
import { ciftAc, ciftUret, iliskiAnahtariTuret, ozelSifrele, type AnahtarCifti } from './iliskiAnahtar';
import { bugun, tarihEkle, type Izinler } from './paket';
import { aktifMi, baslat, calisanaYansit, programBitisi, durdur, programKancalari } from './program';
import { ajandaKancalari, kaynaktanCek } from './ajanda';
import { senkronKancalari } from './senkron';

// ———————————————— disiplinler ve varsayılan izinler (D9) ————————————————

export const DISIPLINLER: [string, string][] = [['sinav', 'Sınav koçluğu'], ['beslenme', 'Beslenme'], ['genel', 'Yaşam / genel koçluk']];
export const disiplinAdi = (d: string) => (d === 'aile' ? 'Aile' : DISIPLINLER.find(([k]) => k === d)?.[1] ?? d);

export function varsayilanIzin(disiplin: string): Izinler {
  // Sınav ve beslenme: gün değişmez, danışan kartı düzenleyemez/silemez; sıralayabilir.
  return { ac: true, duzenle: false, sil: false, gun_degistir: disiplin === 'genel', sirala: true, duzeltme_gun: null };
}

export const KOC_DENEME_GUN = 60;

// ———————————————— taşıma (sunucu) ————————————————

export interface Profil { ad: string; koc: boolean; disiplinler: string[]; koc_baslangic: string | null }
export interface DavetSatir { kod: string; disiplin: string; son: string; kullanildi: boolean; alici?: string | null }
export interface UzakMesaj { sira: number; iliski: string; gonderen: string; veri: string }

/** Sunucuyla konuşan her şey burada — testte bellekteki bir taşımayla değiştirilir. */
export interface Tasima {
  profil(): Promise<Profil | null>;
  profilYaz(p: Partial<Pick<Profil, 'koc' | 'disiplinler' | 'koc_baslangic'>>): Promise<void>;
  ozelAnahtarim(): Promise<{ acik: string; ozel: string } | null>;
  anahtarKoy(acik: string, ozel: string): Promise<{ acik: string; ozel: string }>;
  acikAnahtar(kisi: string): Promise<string | null>;
  iliskiler(): Promise<IliskiRow[]>;
  davetOlustur(kod: string, disiplin: string, kocAd: string, alici?: string | null): Promise<void>;
  davetler(): Promise<DavetSatir[]>;
  davetSil(kod: string): Promise<void>;
  davetBak(kod: string): Promise<{ koc_ad: string; disiplin: string; gecerli: boolean; kendi: boolean } | null>;
  davetYanit(kod: string, kabul: boolean): Promise<string | null>;
  sonlandir(iliskiId: string): Promise<void>;
  mesajGonder(iliski: string, alici: string, veri: string): Promise<void>;
  mesajCek(sonra: number): Promise<UzakMesaj[]>;
  kisiBul(eposta: string): Promise<{ id: string; gorunen_ad: string } | null>;
  davetGonder(alici: string, paket: unknown): Promise<void>;
  // aile grubu (F1–F4)
  aileler(): Promise<AileRow[]>;
  aileKur(ad: string): Promise<string>;
  aileDavet(aile: string, eposta: string): Promise<string>;
  aileYanit(aile: string, kabul: boolean): Promise<void>;
  aileAyril(aile: string, uye: string): Promise<void>;
  aileAnahtarlarim(aile: string): Promise<{ surum: number; saran: string; sarili: string }[]>;
  aileAnahtarYaz(satirlar: { aile: string; uye: string; surum: number; saran: string; sarili: string }[]): Promise<void>;
  aileMesajGonder(aile: string, surum: number, veri: string): Promise<void>;
  aileMesajCek(aile: string, sonra: number): Promise<{ sira: number; gonderen: string; anahtar_surum: number; veri: string }[]>;
  aileGorevIliski(uye: string): Promise<string>;
}

function hata(e: { message: string } | null) { if (e) throw new Error(e.message); }

function supabaseTasima(uid: string): Tasima {
  const sb = supabase()!;
  return {
    async profil() {
      const r = await sb.from('cat_profil').select('gorunen_ad, koc, koc_disiplinler, koc_baslangic').eq('id', uid).maybeSingle();
      hata(r.error);
      return r.data ? { ad: r.data.gorunen_ad, koc: !!r.data.koc, disiplinler: r.data.koc_disiplinler ?? [], koc_baslangic: r.data.koc_baslangic } : null;
    },
    async profilYaz(p) {
      const satir: Record<string, unknown> = {};
      if (p.koc !== undefined) satir.koc = p.koc;
      if (p.disiplinler) satir.koc_disiplinler = p.disiplinler;
      if (p.koc_baslangic !== undefined) satir.koc_baslangic = p.koc_baslangic;
      hata((await sb.from('cat_profil').update(satir).eq('id', uid)).error);
    },
    async ozelAnahtarim() {
      const [a, k] = await Promise.all([
        sb.from('cat_acik_anahtar').select('acik').eq('id', uid).maybeSingle(),
        sb.from('cat_anahtar').select('cift_sifreli').eq('id', uid).maybeSingle(),
      ]);
      hata(a.error); hata(k.error);
      return a.data?.acik && k.data?.cift_sifreli ? { acik: a.data.acik, ozel: k.data.cift_sifreli } : null;
    },
    async anahtarKoy(acik, ozel) {
      const r = await sb.rpc('cat_anahtar_cifti_koy', { p_acik: acik, p_ozel: ozel });
      hata(r.error);
      const s = (r.data as { acik: string; ozel: string }[])[0];
      if (!s?.ozel) throw new Error('Anahtar çifti kaydedilemedi');
      return s;
    },
    async acikAnahtar(kisi) {
      const r = await sb.from('cat_acik_anahtar').select('acik').eq('id', kisi).maybeSingle();
      hata(r.error);
      return r.data?.acik ?? null;
    },
    async iliskiler() {
      const r = await sb.from('cat_iliski').select('id, koc, danisan, disiplin, koc_ad, danisan_ad, durum, olusturuldu, sonlandi');
      hata(r.error);
      return (r.data ?? []) as IliskiRow[];
    },
    async davetOlustur(kod, disiplin, kocAd, alici) {
      const r = await sb.from('cat_davet').insert({ kod, koc: uid, koc_ad: kocAd, disiplin, ...(alici ? { alici } : {}) });
      // cat-08 henüz çalıştırılmadıysa 'alici' sütunu yok: onsuz dene (davet yine çalışsın).
      if (r.error && alici && /alici/.test(r.error.message)) { hata((await sb.from('cat_davet').insert({ kod, koc: uid, koc_ad: kocAd, disiplin })).error); return; }
      hata(r.error);
    },
    async davetler() {
      const r = await sb.from('cat_davet').select('kod, disiplin, son, kullanildi, alici').eq('koc', uid).order('olusturuldu', { ascending: false });
      if (r.error && /alici/.test(r.error.message)) {
        const r2 = await sb.from('cat_davet').select('kod, disiplin, son, kullanildi').eq('koc', uid).order('olusturuldu', { ascending: false });
        hata(r2.error);
        return (r2.data ?? []) as DavetSatir[];
      }
      hata(r.error);
      return (r.data ?? []) as DavetSatir[];
    },
    async davetSil(kod) { hata((await sb.from('cat_davet').delete().eq('kod', kod)).error); },
    async davetBak(kod) {
      const r = await sb.rpc('cat_davet_bak', { p_kod: kod });
      hata(r.error);
      return (r.data as { koc_ad: string; disiplin: string; gecerli: boolean; kendi: boolean }[])[0] ?? null;
    },
    async davetYanit(kod, kabul) {
      const r = await sb.rpc('cat_davet_yanit', { p_kod: kod, p_kabul: kabul });
      hata(r.error);
      return (r.data as string | null) ?? null;
    },
    async sonlandir(id) { hata((await sb.rpc('cat_iliski_sonlandir', { p_id: id })).error); },
    async aileGorevIliski(uye) {
      const r = await sb.rpc('cat_aile_gorev_iliski', { p_uye: uye });
      hata(r.error);
      return r.data as string;
    },
    async mesajGonder(iliski, alici, veri) {
      hata((await sb.from('cat_mesaj').insert({ iliski, gonderen: uid, alici, veri })).error);
    },
    async mesajCek(sonra) {
      const r = await sb.from('cat_mesaj').select('sira, iliski, gonderen, veri').eq('alici', uid).gt('sira', sonra).order('sira').limit(200);
      hata(r.error);
      return (r.data ?? []) as UzakMesaj[];
    },
    async kisiBul(eposta) {
      const r = await sb.rpc('cat_kisi_bul', { p_eposta: eposta });
      hata(r.error);
      return (r.data as { id: string; gorunen_ad: string }[] | null)?.[0] ?? null;
    },
    async davetGonder(alici, paket) {
      hata((await sb.rpc('cat_gonder', { p_alici: alici, p_kaynak: 'dogrudan', p_paket: paket })).error);
    },
    async aileler() {
      const ben = await sb.from('cat_aile_uye').select('aile').eq('uye', uid).in('durum', ['davet', 'aktif']);
      hata(ben.error);
      const idler = (ben.data ?? []).map((x) => x.aile as string);
      if (!idler.length) return [];
      const [a, u] = await Promise.all([
        sb.from('cat_aile').select('id, ad, kurucu, anahtar_surum').in('id', idler),
        sb.from('cat_aile_uye').select('aile, uye, ad, rol, durum').in('aile', idler),
      ]);
      hata(a.error); hata(u.error);
      return (a.data ?? []).map((x) => ({ ...x, uyeler: (u.data ?? []).filter((y) => y.aile === x.id).map(({ aile: _, ...y }) => y) })) as AileRow[];
    },
    async aileKur(ad) { const r = await sb.rpc('cat_aile_kur', { p_ad: ad }); hata(r.error); return r.data as string; },
    async aileDavet(aile, eposta) { const r = await sb.rpc('cat_aile_davet', { p_aile: aile, p_eposta: eposta }); hata(r.error); return r.data as string; },
    async aileYanit(aile, kabul) { hata((await sb.rpc('cat_aile_yanit', { p_aile: aile, p_kabul: kabul })).error); },
    async aileAyril(aile, uye) { hata((await sb.rpc('cat_aile_ayril', { p_aile: aile, p_uye: uye })).error); },
    async aileAnahtarlarim(aile) {
      const r = await sb.from('cat_aile_anahtar').select('surum, saran, sarili').eq('aile', aile).eq('uye', uid);
      hata(r.error);
      return (r.data ?? []) as { surum: number; saran: string; sarili: string }[];
    },
    async aileAnahtarYaz(satirlar) {
      // upsert (ON CONFLICT) RLS'e takılıyordu: önce benim sardıklarımı oku, yalnız eksikleri düz insert et.
      const { aile, surum } = satirlar[0];
      const r = await sb.from('cat_aile_anahtar').select('uye').eq('aile', aile).eq('surum', surum).eq('saran', uid);
      hata(r.error);
      const var_ = new Set((r.data ?? []).map((x) => x.uye as string));
      for (const s of satirlar.filter((x) => !var_.has(x.uye))) {
        const e = (await sb.from('cat_aile_anahtar').insert(s)).error;
        if (e && e.code !== '23505') hata(e); // 23505: aynı anda başka cihaz yazmış — sorun değil
      }
    },
    async aileMesajGonder(aile, surum, veri) {
      hata((await sb.from('cat_aile_mesaj').insert({ aile, gonderen: uid, anahtar_surum: surum, veri })).error);
    },
    async aileMesajCek(aile, sonra) {
      const r = await sb.from('cat_aile_mesaj').select('sira, gonderen, anahtar_surum, veri').eq('aile', aile).gt('sira', sonra).order('sira').limit(200);
      hata(r.error);
      return (r.data ?? []) as { sira: number; gonderen: string; anahtar_surum: number; veri: string }[];
    },
  };
}

// ———————————————— durum (UI için) ————————————————

export interface DanismanlikDurum { etkin: boolean; uid: string | null; profil: Profil | null; hata: string | null }
let durum: DanismanlikDurum = { etkin: false, uid: null, profil: null, hata: null };
const dinleyiciler = new Set<(d: DanismanlikDurum) => void>();
function guncelle(p: Partial<DanismanlikDurum>) { durum = { ...durum, ...p }; dinleyiciler.forEach((f) => f(durum)); }

export function useDanismanlik(): DanismanlikDurum {
  const [d, setD] = useState(durum);
  useEffect(() => { dinleyiciler.add(setD); setD(durum); return () => { dinleyiciler.delete(setD); }; }, []);
  return d;
}

export function kocDenemeKalan(p: Profil | null): number | null {
  if (!p?.koc || !p.koc_baslangic) return null;
  return Math.max(0, KOC_DENEME_GUN - Math.floor((Date.now() - new Date(p.koc_baslangic).getTime()) / 86400000));
}

let t: Tasima | null = null;
let uid: string | null = null;
let dek: CryptoKey | null = null;
let cift: AnahtarCifti | null = null;
const iliskiAnahtarlari = new Map<string, CryptoKey>();
let calisiyor: Promise<void> | null = null;

export function danismanlikBaslat(kullanici: string, anahtar: CryptoKey, tasima?: Tasima) {
  t = tasima ?? supabaseTasima(kullanici);
  uid = kullanici;
  dek = anahtar;
  cift = null;
  iliskiAnahtarlari.clear();
  guncelle({ etkin: true, uid: kullanici, hata: null });
  profilYenile().catch(() => {});
}

export function danismanlikDurdur() {
  t = null; uid = null; dek = null; cift = null;
  iliskiAnahtarlari.clear();
  guncelle({ etkin: false, uid: null, profil: null });
}

async function profilYenile() {
  if (!t) return;
  guncelle({ profil: await t.profil() });
}

function tasimaVar(): Tasima {
  if (!t || !uid || !dek) throw new Error('Danışmanlık için hesapla giriş yapmış olmalısın.');
  return t;
}

// ———————————————— anahtarlar ————————————————

async function anahtarGaranti(): Promise<AnahtarCifti> {
  if (cift) return cift;
  const tt = tasimaVar();
  const var_ = await tt.ozelAnahtarim();
  if (var_) cift = await ciftAc(dek!, var_.ozel, var_.acik);
  else {
    const { cift: yeni, ozelJwk } = await ciftUret();
    const r = await tt.anahtarKoy(yeni.acik, await ozelSifrele(dek!, ozelJwk));
    cift = await ciftAc(dek!, r.ozel, r.acik); // başka cihaz önce yazdıysa onunki
  }
  return cift;
}

async function iliskiAnahtari(il: IliskiRow): Promise<CryptoKey | null> {
  const k = iliskiAnahtarlari.get(il.id);
  if (k) return k;
  const c = await anahtarGaranti();
  const karsi = il.koc === uid ? il.danisan : il.koc;
  const acik = await tasimaVar().acikAnahtar(karsi);
  if (!acik) return null; // karşı taraf uygulamayı henüz açmadı — mesaj kuyrukta bekler
  const yeni = await iliskiAnahtariTuret(c.ozel, acik, il.id);
  iliskiAnahtarlari.set(il.id, yeni);
  return yeni;
}

// ———————————————— mesajlar ————————————————

export interface ProgramOzeti {
  id: string; ad: string; amac: string; dikkat: string; kriterler: string[]; hedef: string;
  baslangic: string; izinler: Izinler; surum: number; disiplin: string;
  plan?: boolean;
  adimlar: Omit<ProgramAdimRow, 'program_id'>[];
}

type MesajIcerik =
  | { tur: 'program'; program: ProgramOzeti; etkin: string }
  | { tur: 'durdur'; program_id: string }
  | { tur: 'kabul'; program_id: string; baslangic: string }
  | { tur: 'ret'; program_id: string }
  | { tur: 'gb'; olaylar: GeriBildirimRow[] }
  | { tur: 'sohbet'; mesaj: MesajRow };

export interface KocPaketi { tur: 'koc_program'; iliski_id: string; koc_id: string; koc_ad: string; disiplin: string; program: ProgramOzeti }

async function kuyruk(iliskiId: string, alici: string, icerik: MesajIcerik, aileId: string | null = null) {
  await db.giden.put({ id: crypto.randomUUID(), iliski_id: iliskiId, aile_id: aileId, alici, icerik, zaman: Date.now() });
}

async function gidenleriGonder() {
  const tt = tasimaVar();
  const liste = await db.giden.orderBy('zaman').toArray();
  for (const g of liste) {
    if (g.aile_id) {
      const a = await db.aile.get(g.aile_id);
      if (!a || !aileAktifMi(a)) { await db.giden.delete(g.id); continue; }
      const k = await aileAnahtari(a, a.anahtar_surum);
      if (!k) continue;
      await tt.aileMesajGonder(a.id, a.anahtar_surum, await sifrele(k, g.icerik));
      await gittiIsaretle(g.icerik as MesajIcerik);
      await db.giden.delete(g.id);
      continue;
    }
    const il = await db.iliski.get(g.iliski_id);
    if (!il || il.durum !== 'aktif') { await db.giden.delete(g.id); continue; }
    const k = await iliskiAnahtari(il);
    if (!k) continue;
    await tt.mesajGonder(il.id, g.alici, await sifrele(k, g.icerik));
    await gittiIsaretle(g.icerik as MesajIcerik);
    await db.giden.delete(g.id);
  }
}

const MESAJ_SIRA = 'danismanlik_mesaj_sira';

async function mesajlariCek() {
  const tt = tasimaVar();
  let sira = ((await db.ayar.get(MESAJ_SIRA))?.deger as number | undefined) ?? 0;
  for (;;) {
    const liste = await tt.mesajCek(sira);
    if (!liste.length) return;
    for (const m of liste) {
      const il = await db.iliski.get(m.iliski);
      const k = il ? await iliskiAnahtari(il) : null;
      if (il && !k) return; // anahtar henüz yok: imleç ilerlemez, sonraki turda yeniden denenir (mesaj kaybolmaz)
      if (il && k) {
        try { await mesajIsle(il, await coz<MesajIcerik>(k, m.veri)); }
        catch (e) { console.warn('[ritos] mesaj işlenemedi', e); }
      }
      sira = Number(m.sira);
      await db.ayar.put({ anahtar: MESAJ_SIRA, deger: sira });
    }
    if (liste.length < 200) return;
  }
}

async function gittiIsaretle(m: MesajIcerik) {
  if (m.tur === 'sohbet') await db.mesaj.update(m.mesaj.id, { durum: 'gitti' });
}

/** Gelen sohbet mesajı: aynı kimlikle yazılır (iki cihaz işlese de tek kayıt). */
async function sohbetMesajiKaydet(m: MesajRow, konusma: string) {
  if (await db.mesaj.get(m.id)) return;
  await db.mesaj.put({ ...m, konusma, durum: 'gitti', alindi: null });
}

async function mesajIsle(il: IliskiRow, m: MesajIcerik) {
  if (m.tur === 'sohbet') return sohbetMesajiKaydet(m.mesaj, `i:${il.id}`);
  const benKocum = il.koc === uid;
  if (!benKocum) {
    if (m.tur === 'program') return programGeldi(il, m.program, m.etkin);
    if (m.tur === 'durdur') {
      const p = await db.program.get(m.program_id);
      if (p?.uzak?.rol === 'danisan' && aktifMi(p)) await durdur(p.id);
      return;
    }
    return;
  }
  if (m.tur === 'kabul' || m.tur === 'ret') {
    const p = await db.program.get(m.program_id);
    if (!p?.uzak || p.uzak.rol !== 'koc') return;
    if (m.tur === 'ret') { await db.program.update(p.id, { uzak: { ...p.uzak, durum: 'ret' }, guncellendi: Date.now() }); return; }
    const adimlar = await db.program_adim.where('program_id').equals(p.id).toArray();
    await db.program.update(p.id, {
      uzak: { ...p.uzak, durum: 'kabul' }, calisma_baslangic: m.baslangic,
      calisma_bitis: programBitisi(p, adimlar, m.baslangic), guncellendi: Date.now(),
    });
    return;
  }
  if (m.tur === 'gb') {
    // Yalnız bu ilişkinin programlarına ait olaylar kabul edilir.
    const idler = new Set((await db.program.toArray()).filter((p) => p.uzak?.iliski_id === il.id).map((p) => p.id));
    const olaylar = m.olaylar.filter((o) => idler.has((o.kaynak_ref ?? '').split('/')[0]));
    if (olaylar.length) await db.geri_bildirim.bulkPut(olaylar);
  }
}

// ———————————————— danışan tarafı (D6, D8) ————————————————

async function programGeldi(il: IliskiRow, s: ProgramOzeti, etkin: string) {
  const p = await db.program.get(s.id);
  if (p) {
    if (p.uzak?.rol !== 'danisan' || p.uzak.durum === 'ayrildi' || p.uzak.surum >= s.surum) return;
    await programUygula(p, s, etkin);
    return;
  }
  // V1 (27 eylül): onay davette verildi — plan Gelenler'e uğramadan doğrudan Ajanda'ya düşer.
  await kocPlaniniKur(il, s);
}

async function kocPlaniniKur(il: IliskiRow, s: ProgramOzeti) {
  // Ajanda planında tarihler mutlaktır (koçun takvimi = danışanın takvimi); geç açılan cihaz kaydırmaz.
  const bas = s.plan || s.baslangic > bugun() ? s.baslangic : bugun();
  const uzak: UzakProgram = {
    iliski_id: il.id, rol: 'danisan', karsi_id: il.koc, karsi_ad: il.koc_ad, disiplin: il.disiplin,
    durum: 'kabul', baslangic: s.baslangic, izinler: s.izinler, surum: s.surum, ...(s.plan ? { plan: true } : {}),
  };
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.put({
      id: s.id, ad: s.ad, amac: s.amac, dikkat: s.dikkat, kriterler: s.kriterler, hedef: s.hedef, klasor_id: null,
      home_goster: false, degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      uzak, guncellendi: Date.now(),
    });
    await db.program_adim.bulkPut(s.adimlar.map((a) => ({ ...a, program_id: s.id })));
  });
  await baslat(s.id, bas);
  await kuyruk(il.id, il.koc, { tur: 'kabul', program_id: s.id, baslangic: bas });
  tetikle();
}

/** Gelenler'den "Al": program aynı kimlikle kurulur, başlatılır, koça kabul gider. */
export async function kocProgramiAl(gelenId: string, klasorId: string | null): Promise<string> {
  const g = await db.gelen.get(gelenId);
  if (!g) throw new Error('Bulunamadı');
  const pk = g.paket as KocPaketi;
  const s = pk.program;
  const bas = s.baslangic > bugun() ? s.baslangic : bugun();
  const uzak: UzakProgram = {
    iliski_id: pk.iliski_id, rol: 'danisan', karsi_id: pk.koc_id, karsi_ad: pk.koc_ad, disiplin: pk.disiplin,
    durum: 'kabul', baslangic: s.baslangic, izinler: s.izinler, surum: s.surum,
  };
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.put({
      id: s.id, ad: s.ad, amac: s.amac, dikkat: s.dikkat, kriterler: s.kriterler, hedef: s.hedef, klasor_id: klasorId,
      home_goster: false, degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      uzak, guncellendi: Date.now(),
    });
    await db.program_adim.bulkPut(s.adimlar.map((a) => ({ ...a, program_id: s.id })));
  });
  await baslat(s.id, bas);
  await db.gelen.update(gelenId, { alindi: Date.now() });
  await kuyruk(pk.iliski_id, pk.koc_id, { tur: 'kabul', program_id: s.id, baslangic: bas });
  tetikle();
  return s.id;
}

export async function kocProgramiReddet(gelenId: string) {
  const g = await db.gelen.get(gelenId);
  if (!g) return;
  const pk = g.paket as KocPaketi;
  await kuyruk(pk.iliski_id, pk.koc_id, { tur: 'ret', program_id: pk.program.id });
  await db.gelen.delete(gelenId);
  tetikle();
}

async function programUygula(p: ProgramRow, s: ProgramOzeti, etkin: string) {
  const eski = await db.program_adim.where('program_id').equals(p.id).toArray();
  const izinDegisti = JSON.stringify(p.uzak!.izinler) !== JSON.stringify(s.izinler);
  await db.program.update(p.id, {
    ad: s.ad, amac: s.amac, dikkat: s.dikkat, kriterler: s.kriterler, hedef: s.hedef,
    uzak: { ...p.uzak!, izinler: s.izinler, surum: s.surum, baslangic: s.baslangic }, guncellendi: Date.now(),
  });
  const calisiyor = !!p.calisma_baslangic && aktifMi(p);
  const e = etkin < bugun() ? bugun() : etkin;
  for (const a of s.adimlar) {
    const o = eski.find((x) => x.id === a.id);
    const degisti = izinDegisti || !o || o.guncellendi !== a.guncellendi;
    await db.program_adim.put({ ...a, program_id: p.id });
    if (degisti && calisiyor) {
      await calisanaYansit(p.id, { ...a, program_id: p.id }, e);
      // "güncellendi" rozeti yalnız var olan kart değiştiğinde — yeni eklenen kart için değil.
      if (o) await db.ajanda_kart.where('kaynak_ref').equals(`${p.id}/${a.id}`).modify({ isaret: Date.now() });
    }
  }
  for (const o of eski) {
    if (s.adimlar.some((a) => a.id === o.id)) continue;
    await db.program_adim.delete(o.id);
    if (calisiyor) await kaynaktanCek(`${p.id}/${o.id}`, e);
  }
}

/** D10 — koçtan ayrılmış programı kendine al: artık senin, koça bir şey gitmez. */
export async function kendimeAl(programId: string) {
  const p = await db.program.get(programId);
  if (!p?.uzak || p.uzak.rol !== 'danisan') return;
  await db.program.update(programId, { uzak: null, guncellendi: Date.now() });
}

export async function programiSil(programId: string) {
  await kaynaktanCek(`${programId}/`, tarihEkle(bugun(), 1));
  await db.program_adim.where('program_id').equals(programId).delete();
  await db.program.delete(programId);
}

function geriBildirimKuyrugu(gb: GeriBildirimRow) {
  (async () => {
    const pid = (gb.kaynak_ref ?? '').split('/')[0];
    const p = await db.program.get(pid);
    if (!p?.uzak || p.uzak.rol !== 'danisan' || p.uzak.durum === 'ayrildi') return;
    await kuyruk(p.uzak.iliski_id, p.uzak.karsi_id, { tur: 'gb', olaylar: [gb] });
    tetikle(1500);
  })().catch((e) => console.warn('[ritos] geri bildirim kuyruğu', e));
}

// ———————————————— koç tarafı (D1, D4, D5, D8) ————————————————

export async function kocOl(disiplinler: string[]) {
  const tt = tasimaVar();
  await tt.profilYaz({ koc: true, disiplinler, ...(durum.profil?.koc_baslangic ? {} : { koc_baslangic: new Date().toISOString() }) });
  await profilYenile();
}

export async function kocKapat() {
  await tasimaVar().profilYaz({ koc: false });
  await profilYenile();
}

function davetKodu(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => a[b % a.length]).join('');
}

export async function davetOlustur(disiplin: string, alici: string | null = null): Promise<{ kod: string; baglanti: string }> {
  const tt = tasimaVar();
  await anahtarGaranti(); // danışan kabul edince hemen mesajlaşabilsin
  const kod = davetKodu();
  await tt.davetOlustur(kod, disiplin, durum.profil?.ad ?? 'Koç', alici);
  return { kod, baglanti: `${location.origin}/?davet=${kod}` };
}

/** D2 — e-postayla davet: davet kodu kişinin Gelenler'ine düşer (kişi Ritos'ta en az bir kez giriş yapmış olmalı). */
export async function ePostaDaveti(eposta: string, disiplin: string): Promise<string> {
  const tt = tasimaVar();
  const kisi = await tt.kisiBul(eposta.trim());
  if (!kisi) throw new Error("Bu e-postayla Ritos kullanan biri bulunamadı. Kişinin en az bir kez giriş yapmış olması gerekir; ya da bağlantıyı gönder.");
  if (kisi.id === uid) throw new Error('Kendini davet edemezsin.');
  const { kod } = await davetOlustur(disiplin, `${kisi.gorunen_ad} · ${eposta.trim().toLowerCase()}`);
  await tt.davetGonder(kisi.id, { surum: 1, tur: 'davet', ad: 'Danışmanlık daveti', davet: { kod, koc_ad: durum.profil?.ad ?? 'Koç', disiplin } });
  return kisi.gorunen_ad;
}

export const davetler = () => tasimaVar().davetler();
export const davetSil = (kod: string) => tasimaVar().davetSil(kod);
export const davetBak = (kod: string) => tasimaVar().davetBak(kod);

export async function davetYanit(kod: string, kabul: boolean): Promise<string | null> {
  const tt = tasimaVar();
  if (kabul) await anahtarGaranti();
  const id = await tt.davetYanit(kod, kabul);
  await iliskileriCek();
  return id;
}

// Aile içinde görev verme (3 ekim): veren → alan için 'aile' ilişkisi davetsiz kurulur (yoksa).
export async function aileGorevIliski(uye: string): Promise<string> {
  await anahtarGaranti();
  const id = await tasimaVar().aileGorevIliski(uye);
  await iliskileriCek();
  tetikle();
  return id;
}

export async function sonlandir(iliskiId: string) {
  await tasimaVar().sonlandir(iliskiId);
  await iliskileriCek();
}

// ———————————————— danışan başına kart izinleri (D9) ————————————————

export async function danisanIzinleri(il: IliskiRow): Promise<Izinler> {
  return (await db.iliski_ayar.get(il.id))?.izinler ?? varsayilanIzin(il.disiplin);
}

/** İzinleri kaydet; istenirse bu danışanın gönderilmiş programlarına da uygula (bugünden itibaren). */
export async function danisanIzinKaydet(il: IliskiRow, izinler: Izinler, mevcutlara: boolean): Promise<number> {
  await db.iliski_ayar.put({ id: il.id, izinler, guncellendi: Date.now() });
  if (!mevcutlara) return 0;
  const ps = (await db.program.toArray()).filter((p) => p.uzak?.iliski_id === il.id && p.uzak.rol === 'koc' && p.uzak.durum !== 'ret' && p.uzak.durum !== 'ayrildi');
  for (const p of ps) {
    await db.program.update(p.id, { uzak: { ...p.uzak!, izinler }, guncellendi: Date.now() });
    if (p.uzak!.durum !== 'taslak') await programGonder(p.id);
  }
  return ps.length;
}

/** D5 — atama: şablondan (ya da boş) danışana özel bağımsız kopya; koç düzenleyip gönderir. */
export async function programAta(il: IliskiRow, kaynakId: string | null, ad: string, baslangic: string): Promise<string> {
  const id = crypto.randomUUID();
  const izinler = await danisanIzinleri(il);
  const k = kaynakId ? await db.program.get(kaynakId) : null;
  const adimlar = kaynakId ? await db.program_adim.where('program_id').equals(kaynakId).sortBy('sira') : [];
  const simdi = Date.now();
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.add({
      id, ad: ad.trim() || k?.ad || 'Program', amac: k?.amac ?? '', dikkat: k?.dikkat ?? '', kriterler: k?.kriterler ?? [], hedef: k?.hedef ?? '',
      klasor_id: null, home_goster: false, degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      sablon: false,
      uzak: { iliski_id: il.id, rol: 'koc', karsi_id: il.danisan, karsi_ad: il.danisan_ad, disiplin: il.disiplin, durum: 'taslak', baslangic, izinler, surum: 0 },
      guncellendi: simdi,
    });
    await db.program_adim.bulkAdd(adimlar.map((a) => ({ ...a, id: crypto.randomUUID(), program_id: id, guncellendi: simdi })));
  });
  return id;
}

/** D4 — şablon olarak kaydet (kendi programından ya da danışana atanmış olandan). */
export async function sablonKaydet(programId: string, disiplin: string | null = null): Promise<string> {
  const p = await db.program.get(programId);
  if (!p) throw new Error('Bulunamadı');
  const adimlar = await db.program_adim.where('program_id').equals(programId).sortBy('sira');
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.add({
      ...p, id, klasor_id: null, calisma_baslangic: null, calisma_bitis: null, degerlendirme: null, home_goster: false,
      sablon: true, sablon_disiplin: p.uzak?.disiplin ?? disiplin ?? p.sablon_disiplin ?? null, uzak: null, guncellendi: simdi,
    });
    await db.program_adim.bulkAdd(adimlar.map((a) => ({ ...a, id: crypto.randomUUID(), program_id: id, guncellendi: simdi })));
  });
  return id;
}

export async function programOzeti(p: ProgramRow): Promise<ProgramOzeti> {
  const adimlar = await db.program_adim.where('program_id').equals(p.id).sortBy('sira');
  return {
    id: p.id, ad: p.ad, amac: p.amac, dikkat: p.dikkat, kriterler: p.kriterler, hedef: p.hedef,
    baslangic: p.uzak!.baslangic, izinler: p.uzak!.izinler, surum: p.uzak!.surum, disiplin: p.uzak!.disiplin,
    ...(p.uzak!.plan ? { plan: true } : {}),
    adimlar: adimlar.map(({ program_id: _, ...a }) => a),
  };
}

/** "Gönder" (ilk kez) ya da güncelleme: tam program + hangi günden itibaren geçerli. */
export async function programGonder(programId: string, etkin = bugun()) {
  const p = await db.program.get(programId);
  if (!p?.uzak || p.uzak.rol !== 'koc' || p.uzak.durum === 'ret' || p.uzak.durum === 'ayrildi') return;
  const il = await db.iliski.get(p.uzak.iliski_id);
  if (!il || il.durum !== 'aktif') throw new Error('Bu danışmanlık sonlanmış.');
  const uzak: UzakProgram = { ...p.uzak, surum: p.uzak.surum + 1, durum: p.uzak.durum === 'taslak' ? 'gonderildi' : p.uzak.durum };
  const guncel: ProgramRow = { ...p, uzak };
  const adimlar = await db.program_adim.where('program_id').equals(programId).toArray();
  await db.program.update(programId, {
    uzak, guncellendi: Date.now(),
    ...(p.calisma_baslangic ? { calisma_bitis: programBitisi(p, adimlar, p.calisma_baslangic) } : {}),
  });
  await kuyruk(il.id, il.danisan, { tur: 'program', program: await programOzeti(guncel), etkin });
  tetikle();
}

// D8 — gönderilmiş programdaki değişiklik kendiliğinden gider (kısa gecikmeyle, toplu).
const bekleyenGuncelleme = new Map<string, { etkin: string; z: ReturnType<typeof setTimeout> }>();
function kocDegisti(programId: string, etkin: string) {
  (async () => {
    const p = await db.program.get(programId);
    if (!p?.uzak || p.uzak.rol !== 'koc' || (p.uzak.durum !== 'gonderildi' && p.uzak.durum !== 'kabul')) return;
    const onceki = bekleyenGuncelleme.get(programId);
    if (onceki) clearTimeout(onceki.z);
    const e = onceki && onceki.etkin < etkin ? onceki.etkin : etkin;
    bekleyenGuncelleme.set(programId, { etkin: e, z: setTimeout(() => { bekleyenGuncelleme.delete(programId); programGonder(programId, e).catch(() => {}); }, 1200) });
  })().catch(() => {});
}

function kocDurdurdu(programId: string) {
  (async () => {
    const p = await db.program.get(programId);
    if (!p?.uzak || p.uzak.rol !== 'koc') return;
    await kuyruk(p.uzak.iliski_id, p.uzak.karsi_id, { tur: 'durdur', program_id: programId });
    tetikle();
  })().catch(() => {});
}

// ———————————————— ilişkiler, sonlandırma (D10) ————————————————

async function iliskileriCek() {
  const liste = await tasimaVar().iliskiler();
  const onceki = new Map((await db.iliski.toArray()).map((x) => [x.id, x]));
  await db.iliski.bulkPut(liste);
  for (const il of liste) {
    if (il.durum === 'sonlandi' && onceki.get(il.id)?.durum !== 'sonlandi') await sonlandiIsle(il);
  }
}

async function sonlandiIsle(il: IliskiRow) {
  const programlar = (await db.program.toArray()).filter((p) => p.uzak?.iliski_id === il.id && p.uzak.durum !== 'ayrildi');
  for (const p of programlar) {
    if (p.uzak!.rol === 'danisan') {
      // Gelecek kartlar kalkar, geçmiş kalır; program "koçtan ayrıldı" olarak durur.
      await kaynaktanCek(`${p.id}/`, tarihEkle(bugun(), 1));
      const bitis = p.calisma_bitis && p.calisma_bitis < bugun() ? p.calisma_bitis : (p.calisma_baslangic ? bugun() : null);
      await db.program.update(p.id, { uzak: { ...p.uzak!, durum: 'ayrildi' }, calisma_bitis: bitis, guncellendi: Date.now() });
    } else {
      await db.program.update(p.id, { uzak: { ...p.uzak!, durum: 'ayrildi' }, guncellendi: Date.now() });
    }
  }
  for (const g of await db.gelen.toArray()) {
    if (g.kaynak === 'koc' && !g.alindi && (g.paket as KocPaketi).iliski_id === il.id) await db.gelen.delete(g.id);
  }
  await db.giden.filter((g) => g.iliski_id === il.id).delete();
}

// ———————————————— tur ————————————————

let tetikZamani: ReturnType<typeof setTimeout> | null = null;
/** Senkron açıkken bir sonraki turu öne çek (test taşımasında doğrudan tur). */
export function tetikle(ms = 300) {
  if (tetikZamani) clearTimeout(tetikZamani);
  tetikZamani = setTimeout(() => { tetikZamani = null; danismanlikTur().catch(() => {}); }, ms);
}

export async function danismanlikTur(): Promise<void> {
  if (!t || !uid || !dek) return;
  if (calisiyor) return calisiyor;
  calisiyor = (async () => {
    try {
      await iliskileriCek();
      await aileleriCek();
      const aktifVar = (await db.iliski.toArray()).some((x) => x.durum === 'aktif');
      const aileler = (await db.aile.toArray()).filter(aileAktifMi);
      if (aktifVar || aileler.length || durum.profil?.koc) await anahtarGaranti();
      for (const a of aileler) await aileAnahtarDagit(a);
      if (aktifVar || aileler.length) await gidenleriGonder();
      if (aktifVar) await mesajlariCek();
      for (const a of aileler) await aileMesajlariCek(a);
      guncelle({ hata: null });
    } catch (e) {
      guncelle({ hata: e instanceof Error ? e.message : String(e) });
    } finally {
      calisiyor = null;
    }
  })();
  return calisiyor;
}

// ———————————————— sohbet (C1–C4) ————————————————

export const konusmaIliski = (id: string) => `i:${id}`;
export const konusmaAile = (id: string) => `a:${id}`;

/** Metin ya da paylaşım gönder. Mesaj önce cihaza yazılır ("gönderiliyor"), sonra şifreli gider. */
export async function sohbetGonder(konusma: string, icerik: { metin: string } | { paket: unknown; metin?: string }) {
  if (!uid) throw new Error('Sohbet için giriş yapmış olmalısın.');
  const paylasim = 'paket' in icerik;
  const m: MesajRow = {
    id: crypto.randomUUID(), konusma, gonderen: uid, gonderen_ad: durum.profil?.ad ?? 'Ben',
    tur: paylasim ? 'paylasim' : 'metin', metin: icerik.metin ?? '', paket: paylasim ? (icerik as { paket: unknown }).paket : null,
    zaman: Date.now(), durum: 'bekliyor', alindi: null,
  };
  if (konusma.startsWith('i:')) {
    const il = await db.iliski.get(konusma.slice(2));
    if (!il || il.durum !== 'aktif') throw new Error('Bu danışmanlık sonlanmış.');
    await db.mesaj.put(m);
    await kuyruk(il.id, il.koc === uid ? il.danisan : il.koc, { tur: 'sohbet', mesaj: m });
  } else {
    await db.mesaj.put(m);
    await kuyruk('', '', { tur: 'sohbet', mesaj: m }, konusma.slice(2));
  }
  tetikle(200);
}

export async function okunduIsaretle(konusma: string) {
  await db.konusma_okundu.put({ id: konusma, zaman: Date.now() });
}

// ———————————————— aile grubu (F1–F4) ————————————————

const aileAnahtarlari = new Map<string, CryptoKey>();
export const aileAktifMi = (a: AileRow) => a.uyeler.some((u) => u.uye === uid && u.durum === 'aktif');
export const benimAileRolum = (a: AileRow): AileUyesi | undefined => a.uyeler.find((u) => u.uye === uid);

async function aileleriCek() {
  const liste = await tasimaVar().aileler();
  const idler = new Set(liste.map((a) => a.id));
  await db.aile.bulkPut(liste);
  for (const a of await db.aile.toArray()) if (!idler.has(a.id)) await db.aile.delete(a.id);
}

async function ciftAnahtari(karsi: string, aileId: string): Promise<CryptoKey | null> {
  const c = await anahtarGaranti();
  const acik = await tasimaVar().acikAnahtar(karsi);
  if (!acik) return null;
  return iliskiAnahtariTuret(c.ozel, acik, `aile:${aileId}`);
}

/** Grup anahtarı (belirli sürüm): bana sarılı bırakılmış satırdan açılır. */
async function aileAnahtari(a: AileRow, surum: number): Promise<CryptoKey | null> {
  const ad = `${a.id}:${surum}`;
  const k = aileAnahtarlari.get(ad);
  if (k) return k;
  const satir = (await tasimaVar().aileAnahtarlarim(a.id)).find((x) => x.surum === surum);
  if (!satir) return null;
  const cift = await ciftAnahtari(satir.saran, a.id);
  if (!cift) return null;
  const ham = b64Coz(await coz<string>(cift, satir.sarili));
  const yeni = await crypto.subtle.importKey('raw', ham, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  aileAnahtarlari.set(ad, yeni);
  return yeni;
}

/** Yönetici cihazı: güncel sürümün grup anahtarı yoksa üretir; her aktif üyeye (kendisi dahil) sarılı bırakır. */
async function aileAnahtarDagit(a: AileRow) {
  if (benimAileRolum(a)?.rol !== 'yonetici') return;
  const tt = tasimaVar();
  let ham: Uint8Array;
  const benim = (await tt.aileAnahtarlarim(a.id)).find((x) => x.surum === a.anahtar_surum);
  if (benim) {
    const cift = await ciftAnahtari(benim.saran, a.id);
    if (!cift) return;
    ham = b64Coz(await coz<string>(cift, benim.sarili));
  } else {
    ham = rastgele(32);
  }
  const satirlar: { aile: string; uye: string; surum: number; saran: string; sarili: string }[] = [];
  for (const u of a.uyeler.filter((x) => x.durum === 'aktif')) {
    const cift = await ciftAnahtari(u.uye, a.id);
    if (!cift) continue; // üye uygulamayı henüz açmadı; sonraki turda
    satirlar.push({ aile: a.id, uye: u.uye, surum: a.anahtar_surum, saran: uid!, sarili: await sifrele(cift, b64(ham)) });
  }
  if (satirlar.length) await tt.aileAnahtarYaz(satirlar); // var olan satırlar değişmez (ignoreDuplicates)
}

async function aileMesajlariCek(a: AileRow) {
  const tt = tasimaVar();
  const ANAH = `aile_sira2_${a.id}`; // 27 eylül: '2' — anahtar beklenirken atlanmış mesajlar baştan yeniden çekilsin
  let sira = ((await db.ayar.get(ANAH))?.deger as number | undefined) ?? 0;
  for (;;) {
    const liste = await tt.aileMesajCek(a.id, sira);
    if (!liste.length) return;
    for (const m of liste) {
      const k = await aileAnahtari(a, m.anahtar_surum);
      // Grup anahtarı bana henüz bırakılmadı (yöneticinin cihazı açılınca bırakılır): imleç ilerlemez, mesaj kaybolmaz.
      if (!k) return;
      {
        try {
          const ic = await coz<MesajIcerik>(k, m.veri);
          if (ic.tur === 'sohbet') await sohbetMesajiKaydet(ic.mesaj, konusmaAile(a.id));
        } catch (e) { console.warn('[ritos] aile mesajı çözülemedi', e); }
      }
      sira = Number(m.sira);
      await db.ayar.put({ anahtar: ANAH, deger: sira });
    }
    if (liste.length < 200) return;
  }
}

export async function aileKur(ad: string) {
  await anahtarGaranti();
  await tasimaVar().aileKur(ad);
  await aileleriCek();
  tetikle();
}
export async function aileDavet(aile: string, eposta: string): Promise<string> {
  const ad = await tasimaVar().aileDavet(aile, eposta);
  await aileleriCek();
  return ad;
}
export async function aileYanit(aile: string, kabul: boolean) {
  if (kabul) await anahtarGaranti();
  await tasimaVar().aileYanit(aile, kabul);
  await aileleriCek();
  tetikle();
}
export async function aileAyril(aile: string, kisi: string | null = null) {
  await tasimaVar().aileAyril(aile, kisi ?? uid!);
  await aileleriCek();
  tetikle();
}

// ———————————————— kancaları bağla ————————————————

senkronKancalari.basla = (k, a) => danismanlikBaslat(k, a);
senkronKancalari.tur = danismanlikTur;
senkronKancalari.dur = danismanlikDurdur;
ajandaKancalari.uzakGeriBildirim = geriBildirimKuyrugu;
programKancalari.degisti = kocDegisti;
programKancalari.durduruldu = kocDurdurdu;

// Test: bellekteki bir taşımayla iki "hesabı" iki tarayıcı bağlamında konuşturmak için.
if (typeof window !== 'undefined') {
  (window as unknown as { __ritosDanismanlikTest?: unknown }).__ritosDanismanlikTest = async (kullanici: string, tasima: Tasima) => {
    danismanlikBaslat(kullanici, await dekUret(), tasima);
    await danismanlikTur();
  };
  (window as unknown as { __ritosDanismanlikTur?: unknown }).__ritosDanismanlikTur = () => danismanlikTur();
}

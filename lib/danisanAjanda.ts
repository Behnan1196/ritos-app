// ————————————————————————————————————————————————————————————————
// Koçun gözünden danışanın Ajanda'sı (28 eylül).
// Koç bir danışan seçer, ona atadığı kartları gün gün görür (yapıldı mı, girilen değerler),
// gelecek günlere doğrudan kart ekler, kartın gününü değiştirir ya da kaldırır.
//
// Yeni bir mekanizma yok: arkada koçun o danışan için tuttuğu bir "plan" programı var
// (uzak.plan). Her kart tek günlük bir program adımıdır; ekle/taşı/sil = adım ekle/güncelle/sil.
// Değişiklik mevcut kanal ile (şifreli, kısa gecikmeyle toplu) danışana gider; durum
// danışandan gelen geri bildirimlerden okunur. Danışanın kendi kartları koça görünmez.
// ————————————————————————————————————————————————————————————————

import { db, type GeriBildirimRow, type IliskiRow, type ProgramAdimRow, type ProgramRow } from './db';
import { adimEkle, adimGuncelle, adimSil, adimZamanlama } from './program';
import { disiplinAdi, danisanIzinleri, programGonder } from './danismanlik';
import { bugun, gunAktif, gunFarki, tarihEkle, type Blok, type PaketEk, type TemelTip } from './paket';

export interface KocKarti {
  adim: ProgramAdimRow;
  program: ProgramRow;
  tarih: string;
  tekGun: boolean;           // yalnız tek günlük kart Ajanda'dan taşınır/silinir
  yapildi: boolean;
  degerler: Record<string, unknown> | null;
}

const kocProgramlari = async (iliskiId: string) =>
  (await db.program.toArray()).filter((p) => p.uzak?.rol === 'koc' && p.uzak.iliski_id === iliskiId && p.uzak.durum !== 'ret' && p.uzak.durum !== 'ayrildi' && p.uzak.durum !== 'taslak');

/** Programın takvim tabanı: danışan kabul ettiyse onun başlangıcı, yoksa koçun seçtiği. */
const taban = (p: ProgramRow) => p.calisma_baslangic ?? p.uzak!.baslangic;

export async function danisanGunleri(iliskiId: string, tarihler: string[]): Promise<Record<string, KocKarti[]>> {
  const programlar = await kocProgramlari(iliskiId);
  const sonuc: Record<string, KocKarti[]> = Object.fromEntries(tarihler.map((t) => [t, []]));
  if (!programlar.length) return sonuc;
  const adimlar = await db.program_adim.where('program_id').anyOf(programlar.map((p) => p.id)).toArray();
  const refler = adimlar.map((a) => `${a.program_id}/${a.id}`);
  const olaylar = await db.geri_bildirim.where('kaynak_ref').anyOf(refler).toArray();
  const son = new Map<string, GeriBildirimRow>();
  for (const o of olaylar) {
    const k = `${o.kaynak_ref}|${o.tarih}`;
    const v = son.get(k);
    if (!v || v.zaman < o.zaman) son.set(k, o);
  }
  for (const a of adimlar.sort((x, y) => x.sira - y.sira)) {
    const p = programlar.find((x) => x.id === a.program_id)!;
    const z = adimZamanlama(a, taban(p));
    // Danışan tarafında program bitmişse (koç durdurduysa) sonrası gösterilmez.
    const bitti = p.calisma_bitis;
    for (const t of tarihler) {
      if (!gunAktif(z, t) || (bitti && t > bitti)) continue;
      const o = son.get(`${a.program_id}/${a.id}|${t}`);
      sonuc[t].push({
        adim: a, program: p, tarih: t, tekGun: a.sure_gun === 1,
        yapildi: !!o && o.olay !== 'geri_alindi',
        degerler: o && o.olay === 'deger' ? o.degerler : null,
      });
    }
  }
  return sonuc;
}

/** Danışanın Ajanda planı — yoksa ilk kartla birlikte oluşturulur ve gönderilir. */
async function planProgrami(il: IliskiRow): Promise<{ p: ProgramRow; yeni: boolean }> {
  const var_ = (await db.program.toArray()).find((p) => p.uzak?.rol === 'koc' && p.uzak.iliski_id === il.id && p.uzak.plan && p.uzak.durum !== 'ret' && p.uzak.durum !== 'ayrildi');
  if (var_) return { p: var_, yeni: false };
  const p: ProgramRow = {
    id: crypto.randomUUID(), ad: `${disiplinAdi(il.disiplin)} planı`, amac: '', dikkat: '', kriterler: [], hedef: '',
    klasor_id: null, home_goster: false, degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
    sablon: false,
    uzak: { iliski_id: il.id, rol: 'koc', karsi_id: il.danisan, karsi_ad: il.danisan_ad, disiplin: il.disiplin, durum: 'taslak', baslangic: bugun(), izinler: await danisanIzinleri(il), surum: 0, plan: true },
    guncellendi: Date.now(),
  };
  await db.program.add(p);
  return { p, yeni: true };
}

export interface KocKartTaslak { tip?: TemelTip; ad: string; bloklar: Blok[]; ek?: PaketEk | null }
/** Tekrar: kaç gün sürer (null = süresiz) ve haftanın hangi günleri (null = her gün). */
export interface KocTekrar { gun: number | null; gunler: number[] | null }

export async function kocKartEkle(il: IliskiRow, tarih: string, kart: KocKartTaslak, tekrar: KocTekrar | null = null) {
  await kocKartlariEkle(il, [{ tarih, kart, tekrar }]);
}

/** Toplu ekleme (şablon uygula, hafta kopyala): tek plan, değişiklik tek seferde gider. Geçmiş günler atlanır. */
export async function kocKartlariEkle(il: IliskiRow, liste: { tarih: string; kart: KocKartTaslak; tekrar?: KocTekrar | null }[]): Promise<number> {
  const t0 = bugun();
  const gecerli = liste.filter((x) => x.tarih >= t0);
  if (!gecerli.length) { if (liste.length) throw new Error('Geçmiş güne kart eklenmez.'); return 0; }
  const { p, yeni } = await planProgrami(il);
  for (const { tarih, kart, tekrar } of gecerli) {
    await adimEkle(p.id, {
      tip: kart.tip ?? 'yap', ad: kart.ad.trim(), bloklar: kart.bloklar, ...(kart.ek ? { ek: kart.ek } : {}),
      basla_gun: gunFarki(taban(p), tarih), sure_gun: tekrar ? tekrar.gun : 1, gunler: tekrar?.gunler ?? null, saatler: [],
    });
  }
  if (yeni) await programGonder(p.id);
  return gecerli.length;
}

/** Birden çok güne yayılan kart: bugünden itibaren biter (henüz başlamadıysa tamamen kalkar); yapılmış günler kalır. */
export async function kocSeriBitir(k: KocKarti) {
  const bas = tarihEkle(taban(k.program), k.adim.basla_gun);
  const t0 = bugun();
  if (bas >= t0) { await adimSil(k.adim.id); return; }
  await adimGuncelle(k.adim.id, { sure_gun: gunFarki(bas, tarihEkle(t0, -1)) + 1 }, t0);
}

// ———————————————— hafta şablonları (28 eylül) ————————————————
// Şablon bir haftadır: gün (0 = Pazartesi … 6 = Pazar) + kart. Koçun cihazında ProgramRow (sablon)
// + tek günlük adımlar olarak durur; danışana gitmez. Uygulanınca danışanın planına kart olarak eklenir.

export interface HaftaKarti { gun: number; kart: KocKartTaslak }

const taslak = (a: ProgramAdimRow): KocKartTaslak => ({ tip: a.tip, ad: a.ad, bloklar: a.bloklar, ek: a.ek ?? null });

export async function haftaKartlari(iliskiId: string, haftaBas: string): Promise<HaftaKarti[]> {
  const gunler = Array.from({ length: 7 }, (_, i) => tarihEkle(haftaBas, i));
  const v = await danisanGunleri(iliskiId, gunler);
  return gunler.flatMap((t, i) => v[t].map((k) => ({ gun: i, kart: taslak(k.adim) })));
}

export async function haftaSablonKaydet(il: IliskiRow, haftaBas: string, ad: string): Promise<number> {
  const kartlar = await haftaKartlari(il.id, haftaBas);
  if (!kartlar.length) throw new Error('Bu haftada kart yok.');
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.add({
      id, ad: ad.trim() || 'Hafta şablonu', amac: '', dikkat: '', kriterler: [], hedef: '', klasor_id: null, home_goster: false,
      degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      sablon: true, sablon_disiplin: il.disiplin, uzak: null, guncellendi: simdi,
    });
    await db.program_adim.bulkAdd(kartlar.map((x, i) => ({
      id: crypto.randomUUID(), program_id: id, sira: i + 1, tip: x.kart.tip ?? 'yap', ad: x.kart.ad, bloklar: x.kart.bloklar,
      ...(x.kart.ek ? { ek: x.kart.ek } : {}), basla_gun: x.gun, sure_gun: 1, gunler: null, saatler: [], guncellendi: simdi,
    })));
  });
  return kartlar.length;
}

export async function sablonKartlari(sablonId: string): Promise<HaftaKarti[]> {
  const adimlar = await db.program_adim.where('program_id').equals(sablonId).sortBy('sira');
  // Eski (adım tabanlı) şablonlar da uygulanabilsin: ilk haftaya düşen günler alınır.
  return adimlar.flatMap((a) => {
    const son = a.sure_gun === null ? 6 : Math.min(6, a.basla_gun + a.sure_gun - 1);
    const out: HaftaKarti[] = [];
    for (let g = a.basla_gun; g <= son; g++) if (!a.gunler?.length || a.gunler.includes((g + 1) % 7)) out.push({ gun: g, kart: taslak(a) });
    return out;
  });
}

/** Şablonu (ya da başka bir haftayı) bu haftadan itibaren N hafta uygula. */
export async function haftaUygula(il: IliskiRow, kaynak: HaftaKarti[], haftaBas: string, haftaSayisi = 1): Promise<number> {
  const liste = [];
  for (let h = 0; h < haftaSayisi; h++) for (const x of kaynak) liste.push({ tarih: tarihEkle(haftaBas, h * 7 + x.gun), kart: x.kart });
  return kocKartlariEkle(il, liste);
}


export async function kocKartTasi(k: KocKarti, yeniTarih: string) {
  if (!k.tekGun || yeniTarih === k.tarih) return;
  if (k.yapildi) throw new Error('Yapılmış kart taşınmaz.');
  if (yeniTarih < bugun() || k.tarih < bugun()) throw new Error('Geçmiş günler değişmez.');
  const etkin = yeniTarih < k.tarih ? yeniTarih : k.tarih;
  await adimGuncelle(k.adim.id, { basla_gun: gunFarki(taban(k.program), yeniTarih) }, etkin);
}

export async function kocKartGuncelle(k: KocKarti, patch: { ad: string; bloklar: Blok[] }) {
  await adimGuncelle(k.adim.id, patch, k.tarih < bugun() ? bugun() : k.tarih);
}

export async function kocKartSil(k: KocKarti) {
  if (k.tarih < bugun()) throw new Error('Geçmiş günler değişmez.');
  if (k.yapildi) throw new Error('Yapılmış kart kaldırılmaz.');
  await adimSil(k.adim.id);
}

// ————————————————————————————————————————————————————————————————
// Plan odaklı Ajanda (28 eylül) — iki hedef, tek motor:
//  • danışan: koç bir danışan seçer, ona atadığı kartları görür/planlar (aşağıdaki açıklama).
//  • program: kişi kendi programına odaklanır; yalnız o programın kartlarını görür/planlar.
//    Program yerel bir "plan" programıdır (tarihler mutlak, kendiliğinden bitmez); kartlar
//    kişinin kendi Ajanda'sına düşer, durum yerel geri bildirimden okunur.
//
// Koçun gözünden danışanın Ajanda'sı:
// Koç bir danışan seçer, ona atadığı kartları gün gün görür (yapıldı mı, girilen değerler),
// gelecek günlere doğrudan kart ekler, kartın gününü değiştirir ya da kaldırır.
//
// Yeni bir mekanizma yok: arkada koçun o danışan için tuttuğu bir "plan" programı var
// (uzak.plan). Her kart tek günlük bir program adımıdır; ekle/taşı/sil = adım ekle/güncelle/sil.
// Değişiklik mevcut kanal ile (şifreli, kısa gecikmeyle toplu) danışana gider; durum
// danışandan gelen geri bildirimlerden okunur. Danışanın kendi kartları koça görünmez.
// ————————————————————————————————————————————————————————————————

import { db, type GeriBildirimRow, type IliskiRow, type ProgramAdimRow, type ProgramRow } from './db';
import { adimEkle, adimGuncelle, adimSil, adimZamanlama, aktifMi, calisanaYansit, programGuncelle } from './program';
import { disiplinAdi, danisanIzinleri, programGonder, taslakGonder } from './danismanlik';
import { bugun, gunAktif, gunFarki, tarihEkle, type Blok, type PaketEk, type TemelTip } from './paket';

export interface KocKarti {
  adim: ProgramAdimRow;
  program: ProgramRow;
  tarih: string;
  tekGun: boolean;           // yalnız tek günlük kart Ajanda'dan taşınır/silinir
  yapildi: boolean;
  degerler: Record<string, unknown> | null;
  yorum: string | null;      // 3 ekim — danışanın bu güne bıraktığı not
  taslak: boolean;           // 3 ekim — gönderilmemiş değişiklik (Atölye taslak modu)
}

export type PlanHedef = { tur: 'danisan'; il: IliskiRow } | { tur: 'program'; programId: string };
/** Şablonların gruplandığı anahtar: danışmanlıkta disiplin, kişisel programlarda 'kisisel'. */
export const hedefGrubu = (h: PlanHedef) => (h.tur === 'danisan' ? h.il.disiplin : 'kisisel');

async function hedefProgramlari(h: PlanHedef): Promise<ProgramRow[]> {
  if (h.tur === 'program') { const p = await db.program.get(h.programId); return p ? [p] : []; }
  return (await db.program.toArray()).filter((p) => p.uzak?.rol === 'koc' && p.uzak.iliski_id === h.il.id && p.uzak.durum !== 'ret' && p.uzak.durum !== 'ayrildi' && (p.uzak.durum !== 'taslak' || !!p.uzak.plan));
}

/** Programın takvim tabanı: çalışmanın başladığı gün (danışan kabul ettiyse onun), yoksa koçun seçtiği. */
const taban = (p: ProgramRow) => p.calisma_baslangic ?? p.uzak?.baslangic ?? bugun();

export async function danisanGunleri(h: PlanHedef, tarihler: string[]): Promise<Record<string, KocKarti[]>> {
  const programlar = await hedefProgramlari(h);
  const sonuc: Record<string, KocKarti[]> = Object.fromEntries(tarihler.map((t) => [t, []]));
  if (!programlar.length) return sonuc;
  const adimlar = await db.program_adim.where('program_id').anyOf(programlar.map((p) => p.id)).toArray();
  const refler = adimlar.map((a) => `${a.program_id}/${a.id}`);
  const olaylar = await db.geri_bildirim.where('kaynak_ref').anyOf(refler).toArray();
  const son = new Map<string, GeriBildirimRow>();
  const yorumlar = new Map<string, GeriBildirimRow>();
  for (const o of olaylar) {
    const k = `${o.kaynak_ref}|${o.tarih}`;
    if (o.olay === 'yorum') { const y = yorumlar.get(k); if (!y || y.zaman < o.zaman) yorumlar.set(k, o); continue; }
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
      const y = (yorumlar.get(`${a.program_id}/${a.id}|${t}`)?.degerler as { metin?: string } | null)?.metin || null;
      sonuc[t].push({
        adim: a, program: p, tarih: t, tekGun: a.sure_gun === 1,
        yapildi: !!o && o.olay !== 'geri_alindi',
        degerler: o && o.olay === 'deger' ? o.degerler : null,
        yorum: y,
        taslak: !!p.uzak?.bekleyen?.adimlar.includes(a.id) || (p.uzak?.durum === 'taslak'),
      });
    }
  }
  return sonuc;
}

/** Kişisel program: planlanınca çalışır hale gelir (tabanı ilk planlandığı gün); durdurulmuşsa yeniden açılır. */
async function kisiselPlan(programId: string): Promise<ProgramRow> {
  const p = await db.program.get(programId);
  if (!p) throw new Error('Program bulunamadı.');
  if (p.plan && aktifMi(p) && p.calisma_bitis === null) return p;
  await programGuncelle(p.id, { plan: true, calisma_baslangic: p.calisma_baslangic ?? bugun(), calisma_bitis: null });
  const g = (await db.program.get(p.id))!;
  // Durdurulmuş programın ileri günleri geri gelsin (geçmiş değişmez).
  if (p.calisma_baslangic) for (const a of await db.program_adim.where('program_id').equals(p.id).toArray()) await calisanaYansit(p.id, a, bugun());
  return g;
}

/** Danışanın Ajanda planı — yoksa ilk kartla birlikte oluşturulur ve gönderilir. */
async function planProgrami(h: PlanHedef): Promise<{ p: ProgramRow; yeni: boolean }> {
  if (h.tur === 'program') return { p: await kisiselPlan(h.programId), yeni: false };
  const il = h.il;
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

export interface KocKartTaslak { tip?: TemelTip; ad: string; bloklar: Blok[]; ek?: PaketEk | null; saatler?: string[] }
/** Tekrar: kaç gün sürer (null = süresiz) ve haftanın hangi günleri (null = her gün). */
export interface KocTekrar { gun: number | null; gunler: number[] | null }

export async function kocKartEkle(h: PlanHedef, tarih: string, kart: KocKartTaslak, tekrar: KocTekrar | null = null) {
  await kocKartlariEkle(h, [{ tarih, kart, tekrar }]);
}

/** Toplu ekleme (şablon uygula, hafta kopyala): tek plan, değişiklik tek seferde gider. Geçmiş günler atlanır. */
export async function kocKartlariEkle(h: PlanHedef, liste: { tarih: string; kart: KocKartTaslak; tekrar?: KocTekrar | null }[]): Promise<number> {
  const t0 = bugun();
  const gecerli = liste.filter((x) => x.tarih >= t0);
  if (!gecerli.length) { if (liste.length) throw new Error('Geçmiş güne kart eklenmez.'); return 0; }
  const { p, yeni } = await planProgrami(h);
  for (const { tarih, kart, tekrar } of gecerli) {
    await adimEkle(p.id, {
      tip: kart.tip ?? 'yap', ad: kart.ad.trim(), bloklar: kart.bloklar, ...(kart.ek ? { ek: kart.ek } : {}),
      basla_gun: gunFarki(taban(p), tarih), sure_gun: tekrar ? tekrar.gun : 1, gunler: tekrar?.gunler ?? null, saatler: kart.saatler ?? [],
    });
  }
  // Hiç gönderilmemiş plan: "hemen" modunda şimdi gider; "gönder deyince" modunda taslakta bekler.
  const g = await db.program.get(p.id);
  if ((yeni || g?.uzak?.durum === 'taslak') && g?.uzak?.gonderim !== 'gonder') await programGonder(p.id);
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

const taslak = (a: ProgramAdimRow): KocKartTaslak => ({ tip: a.tip, ad: a.ad, bloklar: a.bloklar, ek: a.ek ?? null, saatler: a.saatler });

export async function haftaKartlari(h: PlanHedef, haftaBas: string): Promise<HaftaKarti[]> {
  const gunler = Array.from({ length: 7 }, (_, i) => tarihEkle(haftaBas, i));
  const v = await danisanGunleri(h, gunler);
  return gunler.flatMap((t, i) => v[t].map((k) => ({ gun: i, kart: taslak(k.adim) })));
}

export async function haftaSablonKaydet(h: PlanHedef, haftaBas: string, ad: string): Promise<number> {
  const kartlar = await haftaKartlari(h, haftaBas);
  if (!kartlar.length) throw new Error('Bu haftada kart yok.');
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.transaction('rw', db.program, db.program_adim, async () => {
    await db.program.add({
      id, ad: ad.trim() || 'Hafta şablonu', amac: '', dikkat: '', kriterler: [], hedef: '', klasor_id: null, home_goster: false,
      degerlendirme_acik: false, degerlendirme: null, calisma_baslangic: null, calisma_bitis: null,
      sablon: true, sablon_disiplin: hedefGrubu(h), uzak: null, guncellendi: simdi,
    });
    await db.program_adim.bulkAdd(kartlar.map((x, i) => ({
      id: crypto.randomUUID(), program_id: id, sira: i + 1, tip: x.kart.tip ?? 'yap', ad: x.kart.ad, bloklar: x.kart.bloklar,
      ...(x.kart.ek ? { ek: x.kart.ek } : {}), basla_gun: x.gun, sure_gun: 1, gunler: null, saatler: x.kart.saatler ?? [], guncellendi: simdi,
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
export async function haftaUygula(h: PlanHedef, kaynak: HaftaKarti[], haftaBas: string, haftaSayisi = 1): Promise<number> {
  const liste = [];
  for (let h = 0; h < haftaSayisi; h++) for (const x of kaynak) liste.push({ tarih: tarihEkle(haftaBas, h * 7 + x.gun), kart: x.kart });
  return kocKartlariEkle(h, liste);
}


export async function kocKartTasi(k: KocKarti, yeniTarih: string) {
  if (!k.tekGun || yeniTarih === k.tarih) return;
  if (k.yapildi) throw new Error('Yapılmış kart taşınmaz.');
  if (yeniTarih < bugun() || k.tarih < bugun()) throw new Error('Geçmiş günler değişmez.');
  const etkin = yeniTarih < k.tarih ? yeniTarih : k.tarih;
  await adimGuncelle(k.adim.id, { basla_gun: gunFarki(taban(k.program), yeniTarih) }, etkin);
}

export async function kocKartGuncelle(k: KocKarti, patch: { ad: string; bloklar: Blok[]; saatler?: string[] }) {
  await adimGuncelle(k.adim.id, patch, k.tarih < bugun() ? bugun() : k.tarih);
}

export async function kocKartSil(k: KocKarti) {
  if (k.tarih < bugun()) throw new Error('Geçmiş günler değişmez.');
  if (k.yapildi) throw new Error('Yapılmış kart kaldırılmaz.');
  await adimSil(k.adim.id);
}

// ———————————————— 3 ekim — Atölye: gönderim modu ve taslak ————————————————

export interface PlanDurumu { programId: string | null; gonderim: 'hemen' | 'gonder'; bekleyen: number; hicGonderilmedi: boolean }

/** Danışanın (ya da aile üyesinin) plan programının gönderim durumu. Kişisel programda anlamı yok. */
export async function planDurumu(h: PlanHedef): Promise<PlanDurumu | null> {
  if (h.tur !== 'danisan') return null;
  const p = (await db.program.toArray()).find((x) => x.uzak?.rol === 'koc' && x.uzak.iliski_id === h.il.id && x.uzak.plan && x.uzak.durum !== 'ret' && x.uzak.durum !== 'ayrildi');
  if (!p?.uzak) return { programId: null, gonderim: 'hemen', bekleyen: 0, hicGonderilmedi: true };
  const hic = p.uzak.durum === 'taslak';
  const adimSay = hic ? await db.program_adim.where('program_id').equals(p.id).count() : 0;
  return { programId: p.id, gonderim: p.uzak.gonderim ?? 'hemen', bekleyen: hic ? adimSay : (p.uzak.bekleyen?.adimlar.length ?? 0), hicGonderilmedi: hic };
}

/** Gönderim modunu değiştir. "Hemen"e dönülünce bekleyen taslak hemen gider. */
export async function gonderimAyarla(h: PlanHedef, mod: 'hemen' | 'gonder') {
  if (h.tur !== 'danisan') return;
  const { p } = await planProgrami(h);
  await db.program.update(p.id, { uzak: { ...p.uzak!, gonderim: mod }, guncellendi: Date.now() });
  if (mod === 'hemen') {
    const g = (await db.program.get(p.id))!;
    const adimVar = (await db.program_adim.where('program_id').equals(p.id).count()) > 0;
    if ((g.uzak?.bekleyen?.adimlar.length ?? 0) > 0 || (g.uzak?.durum === 'taslak' && adimVar)) await taslakGonder(p.id);
  }
}

export async function planGonder(h: PlanHedef) {
  const d = await planDurumu(h);
  if (d?.programId) await taslakGonder(d.programId);
}

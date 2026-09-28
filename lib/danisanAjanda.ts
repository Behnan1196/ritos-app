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
import { bugun, gunAktif, gunFarki, type Blok } from './paket';

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

export async function kocKartEkle(il: IliskiRow, tarih: string, kart: { ad: string; bloklar: Blok[] }) {
  if (tarih < bugun()) throw new Error('Geçmiş güne kart eklenmez.');
  const { p, yeni } = await planProgrami(il);
  await adimEkle(p.id, { tip: 'yap', ad: kart.ad.trim(), bloklar: kart.bloklar, basla_gun: gunFarki(taban(p), tarih), sure_gun: 1, gunler: null, saatler: [] });
  if (yeni) await programGonder(p.id);
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

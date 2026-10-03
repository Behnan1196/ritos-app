// ————————————————————————————————————————————————————————————————
// Ajanda — teslimat kapısı (25 eylül).
// Hangi modülden gelirse gelsin Ajanda'ya giren her kart `teslimAl` üzerinden girer.
// Ajanda kaynağın iç mantığını bilmez: bağlı bir kartta olan her şeyi bir geri
// bildirim olarak yayınlar; kaynağı ilgilendiren kısmı kaynak kendisi okur.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type AjandaKayitRow, type GeriBildirimRow } from './db';
import { olcumSil, olcumYaz } from './olcum';
import { gunAktif, gunFarki, tarihEkle, type GeriBildirimOlay, type KartPaketi } from './paket';

function paketToRow(p: KartPaketi, sira: number): AjandaKartRow {
  return {
    id: p.id,
    tip: p.tip,
    ad: p.ad,
    bloklar: p.bloklar,
    baslangic: p.zamanlama.baslangic,
    bitis: p.zamanlama.bitis,
    gunler: p.zamanlama.gunler,
    saatler: p.zamanlama.saatler,
    hatirlatma: p.zamanlama.hatirlatma ?? null,
    bekle: p.zamanlama.bekle ?? null,
    kaynak_modul: p.kaynak.modul,
    kaynak_ref: p.kaynak.ref,
    kaynak_etiket: p.kaynak.etiket,
    sahip: p.sahip,
    izinler: p.izinler,
    geri_bildirim: p.geri_bildirim,
    ek: p.ek ?? null,
    sira,
    guncellendi: Date.now(),
  };
}

export function rowZamanlama(k: AjandaKartRow) {
  return { baslangic: k.baslangic, bitis: k.bitis, gunler: k.gunler, saatler: k.saatler, hatirlatma: k.hatirlatma ?? null, bekle: k.bekle ?? null };
}

// Kart o gün listede görünür mü: zamanlama + "yalnız bu gün" kaldırılan günler.
export function gorunur(k: AjandaKartRow, tarih: string): boolean {
  return gunAktif(rowZamanlama(k), tarih) && !(k.atla ?? []).includes(tarih);
}

// Tek giriş kapısı. Yeni kartlar listenin sonuna eklenir (A7).
export async function teslimAl(paketler: KartPaketi[]): Promise<void> {
  await db.transaction('rw', db.ajanda_kart, async () => {
    const son = await db.ajanda_kart.orderBy('id').toArray();
    let sira = son.reduce((m, k) => Math.max(m, k.sira), 0);
    await db.ajanda_kart.bulkPut(paketler.map((p) => paketToRow(p, ++sira)));
  });
}

export interface GunSatiri {
  kart: AjandaKartRow;
  kayit: AjandaKayitRow | null;
}

export async function gununKartlari(tarih: string): Promise<GunSatiri[]> {
  const kartlar = (await db.ajanda_kart.toArray()).filter((k) => gorunur(k, tarih));
  kartlar.sort((a, b) => a.sira - b.sira);
  const kayitlar = await db.ajanda_kayit.where('tarih').equals(tarih).toArray();
  const byKart = new Map(kayitlar.map((r) => [r.kart_id, r]));
  return kartlar.map((kart) => ({ kart, kayit: byKart.get(kart.id) ?? null }));
}

// Danışmanlık kancası: koçun kartındaki olay şifrelenip koça gönderilecek (D7). lib/danismanlik.ts doldurur.
export const ajandaKancalari: {
  uzakGeriBildirim?: (gb: GeriBildirimRow) => void;
  ortakOlay?: (kart: AjandaKartRow, tarih: string, yapildi: boolean) => void; // aile ortak kartı işaretlendi (3 ekim)
} = {};

async function yayinla(kart: AjandaKartRow, tarih: string, olay: GeriBildirimOlay, degerler: Record<string, unknown> | null) {
  if (kart.geri_bildirim === 'yok') return;
  const gb: GeriBildirimRow = {
    id: crypto.randomUUID(),
    kart_id: kart.id,
    kaynak_modul: kart.kaynak_modul,
    kaynak_ref: kart.kaynak_ref,
    tarih,
    olay,
    degerler,
    zaman: Date.now(),
  };
  await db.geri_bildirim.add(gb);
  if (kart.kaynak_modul === 'ortak' && (olay === 'yapildi' || olay === 'geri_alindi' || olay === 'deger')) {
    const f = ajandaKancalari.ortakOlay;
    if (f) setTimeout(() => f(kart, tarih, olay !== 'geri_alindi'), 0);
  }
  if (kart.geri_bildirim === 'uzak') {
    const f = ajandaKancalari.uzakGeriBildirim;
    if (f) setTimeout(() => f(gb), 0); // transaction dışında kuyruğa al
  }
}

async function kayitYaz(kartId: string, tarih: string, patch: Partial<AjandaKayitRow>) {
  const id = `${kartId}|${tarih}`;
  const mevcut = await db.ajanda_kayit.get(id);
  // Yapılma anı: yapıldıya geçerken otomatik yazılır, geri alınınca silinir, zaten yapıldıysa korunur.
  const zaman = patch.yapildi === true ? (mevcut?.yapildi && mevcut.zaman ? mevcut.zaman : Date.now())
    : patch.yapildi === false ? null : mevcut?.zaman ?? null;
  await db.ajanda_kayit.put({
    id,
    kart_id: kartId,
    tarih,
    yapildi: mevcut?.yapildi ?? false,
    degerler: mevcut?.degerler ?? null,
    zaman,
    ...patch,
    guncellendi: Date.now(),
  });
}

// Yapılma anını düzelt (2 ekim — "15 dk sonra aklıma geldi").
export async function yapildiZamani(kartId: string, tarih: string, zaman: number) {
  const mevcut = await db.ajanda_kayit.get(`${kartId}|${tarih}`);
  if (!mevcut?.yapildi) return;
  await kayitYaz(kartId, tarih, { zaman });
}

// Adet (2 ekim): gün boyunca +1/−1 (örn. su). Hedefe ulaşınca kart yapıldı olur, altına inince geri alınır.
export async function degerArttir(kartId: string, tarih: string, anahtar: string, fark: number, hedef?: number) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart) return;
  const mevcut = await db.ajanda_kayit.get(`${kartId}|${tarih}`);
  const once = Number((mevcut?.degerler ?? {})[anahtar]) || 0;
  const v = Math.max(0, once + fark);
  const degerler = { ...(mevcut?.degerler ?? {}), [anahtar]: v };
  const yapildi = hedef ? v >= hedef : mevcut?.yapildi ?? false;
  await db.transaction('rw', db.ajanda_kayit, db.geri_bildirim, async () => {
    await kayitYaz(kartId, tarih, { degerler, yapildi });
    await yayinla(kart, tarih, 'deger', degerler);
  });
  await olcumYaz(kart, tarih, degerler);
}

// A4 — Yap kartında yapıldı işaretle / geri al.
export async function yapildiAyarla(kartId: string, tarih: string, yapildi: boolean) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart) return;
  await db.transaction('rw', db.ajanda_kayit, db.geri_bildirim, async () => {
    await kayitYaz(kartId, tarih, { yapildi });
    await yayinla(kart, tarih, yapildi ? 'yapildi' : 'geri_alindi', null);
  });
  if (!yapildi) await olcumSil(kartId, tarih);
}

// 3 ekim — karta kısa not (koçuna / görevi verene gider). Durumu değiştirmez; son yazılan geçerli.
export async function yorumYaz(kartId: string, tarih: string, metin: string) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart || kart.geri_bildirim !== 'uzak') return;
  await yayinla(kart, tarih, 'yorum', { metin: metin.trim() });
}

/** Bu karta bu gün yazdığım son not (boşsa null). */
export async function yorumOku(kartId: string, tarih: string): Promise<string | null> {
  const son = (await db.geri_bildirim.where('kart_id').equals(kartId).toArray())
    .filter((o) => o.tarih === tarih && o.olay === 'yorum').sort((a, b) => b.zaman - a.zaman)[0];
  const m = (son?.degerler as { metin?: string } | null)?.metin;
  return m ? m : null;
}

// A9 — Kaydet kartında değer gir (kaydedince yapıldı sayılır).
export async function degerKaydet(kartId: string, tarih: string, degerler: Record<string, unknown>) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart) return;
  await db.transaction('rw', db.ajanda_kayit, db.geri_bildirim, async () => {
    await kayitYaz(kartId, tarih, { yapildi: true, degerler });
    await yayinla(kart, tarih, 'deger', degerler);
  });
  await olcumYaz(kart, tarih, degerler);
}

// A7 — bağımsız kartı kaldır. Tekrar edende: "yalnız bu gün" (o gün atlanır) ya da
// "seriyi bitir" (bitiş dün olur). Geçmiş işaretler korunur.
export async function kartKaldir(kartId: string, tarih: string, kip: 'tamamen' | 'yalniz_bugun' | 'seriyi_bitir') {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart || !kart.izinler.sil) return;
  if (kip === 'yalniz_bugun') {
    await db.transaction('rw', db.ajanda_kart, db.ajanda_kayit, async () => {
      await db.ajanda_kart.update(kartId, { atla: [...(kart.atla ?? []), tarih], guncellendi: Date.now() });
      await db.ajanda_kayit.delete(`${kartId}|${tarih}`);
    });
  } else if (kip === 'tamamen' || kart.baslangic >= tarih) {
    await db.transaction('rw', db.ajanda_kart, db.ajanda_kayit, async () => {
      await db.ajanda_kart.delete(kartId);
      await db.ajanda_kayit.where('kart_id').equals(kartId).delete();
    });
  } else {
    await db.ajanda_kart.update(kartId, { bitis: tarihEkle(tarih, -1), guncellendi: Date.now() });
  }
}

// A6 — taşıma / erteleme. Tek günlük kart yeni güne geçer. Birden fazla gün süren kartta
// seri, taşınan günden itibaren aynı gün farkı kadar kayar; önceki günler (yapıldı ya da
// veri girilmiş) yerinde kalır, bitiş de o kadar uzar. Yalnızca gun_degistir izni olan kartta.
export async function kartTasi(kartId: string, tarih: string, yeniTarih: string) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart || !kart.izinler.gun_degistir || yeniTarih === tarih) return;
  const fark = gunFarki(tarih, yeniTarih);
  const kaydir = (t: string) => tarihEkle(t, fark);

  await db.transaction('rw', db.ajanda_kart, db.ajanda_kayit, async () => {
    const kayitlar = await db.ajanda_kayit.where('kart_id').equals(kartId).filter((r) => r.tarih >= tarih).toArray();
    let hedefId = kartId;
    if (kart.baslangic < tarih) {
      // Seri ortasından taşıma: geçmiş parça eski kartta kalır, kalan parça yeni kart olur.
      hedefId = crypto.randomUUID();
      await db.ajanda_kart.update(kartId, { bitis: tarihEkle(tarih, -1), guncellendi: Date.now() });
      await db.ajanda_kart.put({
        ...kart,
        id: hedefId,
        baslangic: yeniTarih,
        bitis: kart.bitis === null ? null : kaydir(kart.bitis),
        atla: (kart.atla ?? []).filter((t) => t >= tarih).map(kaydir),
        guncellendi: Date.now(),
      });
    } else {
      await db.ajanda_kart.update(kartId, {
        baslangic: kaydir(kart.baslangic),
        bitis: kart.bitis === null ? null : kaydir(kart.bitis),
        atla: (kart.atla ?? []).map(kaydir),
        guncellendi: Date.now(),
      });
    }
    for (const r of kayitlar) {
      await db.ajanda_kayit.delete(r.id);
      const t = kaydir(r.tarih);
      await db.ajanda_kayit.put({ ...r, id: `${hedefId}|${t}`, kart_id: hedefId, tarih: t });
    }
  });
}

// Kaynağın isteğiyle bağlı kartları gelecek günlerden çek (örn. program durdurulunca).
// Geçmiş hiç değişmez: o tarihten önce başlamış kartın bitişi bir gün öncesine çekilir,
// henüz başlamamış kart tamamen kalkar.
export async function kaynaktanCek(refOnEki: string, tarihten: string) {
  const kartlar = await db.ajanda_kart.where('kaynak_ref').startsWith(refOnEki).toArray();
  const dun = tarihEkle(tarihten, -1);
  await db.transaction('rw', db.ajanda_kart, async () => {
    for (const k of kartlar) {
      if (k.bitis !== null && k.bitis < tarihten) continue;
      if (k.baslangic >= tarihten) await db.ajanda_kart.delete(k.id);
      else await db.ajanda_kart.update(k.id, { bitis: dun, guncellendi: Date.now() });
    }
  });
}

// A1 — ay takvimi rozeti için: o gün kaç kart, kaçı yapıldı.
export async function ayOzeti(tarihler: string[]): Promise<Record<string, { toplam: number; yapildi: number }>> {
  const kartlar = await db.ajanda_kart.toArray();
  const kayitlar = await db.ajanda_kayit.where('tarih').anyOf(tarihler).toArray();
  const yap = new Set(kayitlar.filter((k) => k.yapildi).map((k) => k.id));
  const sonuc: Record<string, { toplam: number; yapildi: number }> = {};
  for (const t of tarihler) {
    const o = kartlar.filter((k) => k.tip !== 'oku' && gorunur(k, t));
    sonuc[t] = { toplam: o.length, yapildi: o.filter((k) => yap.has(`${k.id}|${t}`)).length };
  }
  return sonuc;
}

// A7 — gün içi sıralama. Sıra kart düzeyinde tutulur: görünen kartların mevcut sıra
// değerleri yeni düzene göre yeniden dağıtılır, böylece o gün görünmeyen kartların
// göreli yeri bozulmaz ve tekrar eden kart her gün aynı yerde kalır.
export async function siraDegistir(kartIdler: string[]) {
  const kartlar = await db.ajanda_kart.bulkGet(kartIdler);
  const siralar = kartlar.filter((k): k is AjandaKartRow => !!k).map((k) => k.sira).sort((a, b) => a - b);
  await db.transaction('rw', db.ajanda_kart, async () => {
    for (let i = 0; i < kartIdler.length; i++) {
      await db.ajanda_kart.update(kartIdler[i], { sira: siralar[i], guncellendi: Date.now() });
    }
  });
}

// Kaynağın bir kartı "şu tarihten itibaren" güncellenmiş haliyle yeniden teslim etmesi
// (K9 — adım düzenlemesi, çalışan programa yeni adım). Geçmiş hiç değişmez:
// etkin tarihten önce başlamış kart o tarihin bir gün öncesinde biter, yerine yeni
// kart açılır; etkin tarih ve sonrasına ait kayıtlar (yapıldı / değerler) yeni karta taşınır.
export async function yenidenTeslim(ref: string, etkin: string, paket: KartPaketi) {
  const mevcut = (await db.ajanda_kart.where('kaynak_ref').equals(ref).toArray())
    .filter((k) => k.bitis === null || k.bitis >= etkin);
  const tum = await db.ajanda_kart.toArray();
  const sira = mevcut[0]?.sira ?? tum.reduce((m, k) => Math.max(m, k.sira), 0) + 1;
  const yeniBas = paket.zamanlama.baslangic > etkin ? paket.zamanlama.baslangic : etkin;
  const yeniVar = paket.zamanlama.bitis === null || paket.zamanlama.bitis >= yeniBas;

  await db.transaction('rw', db.ajanda_kart, db.ajanda_kayit, async () => {
    for (const k of mevcut) {
      const tasinacak = await db.ajanda_kayit.where('kart_id').equals(k.id).filter((r) => r.tarih >= etkin).toArray();
      for (const r of tasinacak) {
        await db.ajanda_kayit.delete(r.id);
        if (yeniVar) await db.ajanda_kayit.put({ ...r, id: `${paket.id}|${r.tarih}`, kart_id: paket.id });
      }
      if (k.baslangic < etkin) await db.ajanda_kart.update(k.id, { bitis: tarihEkle(etkin, -1), guncellendi: Date.now() });
      else await db.ajanda_kart.delete(k.id);
    }
    if (yeniVar) {
      await db.ajanda_kart.put(paketToRow({ ...paket, zamanlama: { ...paket.zamanlama, baslangic: yeniBas } }, sira));
    }
  });
}

// Kişinin kendi kartını düzenleme (28 eylül — "ajandaya eklediğim kartın açıklamasını değiştiremiyorum").
// Yalnız düzenleme izni olan, bağımsız kartta. Başlangıç günü değişmez; taşıma ayrı (kartTasi).
// Geçmiş kayıtlar (yapıldı / değerler) yerinde kalır.
export async function kartGuncelle(
  kartId: string,
  patch: Partial<Pick<AjandaKartRow, 'tip' | 'ad' | 'bloklar' | 'bitis' | 'gunler' | 'saatler' | 'hatirlatma' | 'bekle'>>,
) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart || !kart.izinler.duzenle || kart.geri_bildirim !== 'yok') return;
  await db.ajanda_kart.update(kartId, { ...patch, guncellendi: Date.now() });
}

// Kart içindeki checklist (30 eylül) — işaretler günlüktür: o günün kaydında (degerler.liste)
// madde sıraları tutulur; tekrarlanan kartta her gün sıfırdan başlar. Hepsi işaretlenince kart
// yapıldı sayılır; biri kaldırılırsa yapıldı geri alınır.
export async function listeIsaretle(kartId: string, tarih: string, sira: number, acik: boolean, toplam: number) {
  const kart = await db.ajanda_kart.get(kartId);
  if (!kart) return;
  const id = `${kartId}|${tarih}`;
  const mevcut = await db.ajanda_kayit.get(id);
  const once = new Set<number>(((mevcut?.degerler as { liste?: number[] } | null)?.liste) ?? []);
  if (acik) once.add(sira); else once.delete(sira);
  const liste = Array.from(once).sort((a, b) => a - b);
  const hepsi = toplam > 0 && liste.length >= toplam;
  const yapildi = hepsi ? true : mevcut?.yapildi && !acik && once.size < toplam ? false : mevcut?.yapildi ?? false;
  await db.transaction('rw', db.ajanda_kayit, db.geri_bildirim, async () => {
    await kayitYaz(kartId, tarih, { degerler: { ...(mevcut?.degerler ?? {}), liste }, yapildi });
    if (yapildi !== (mevcut?.yapildi ?? false)) await yayinla(kart, tarih, yapildi ? 'yapildi' : 'geri_alindi', null);
  });
}

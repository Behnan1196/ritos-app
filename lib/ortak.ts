// ————————————————————————————————————————————————————————————————
// Aile ortak listeleri ve ortak kartları (3 ekim). Aile grubunun şifreli kanalında küçük işlemler
// (op) akar; her cihaz aynı işlemleri sırayla uygulayıp aynı durumu kurar. Gönderen işlemi önce
// kendi cihazında uygular (anında görünür), sonra kanala yazar; kanaldan geri geldiğinde ikinci
// uygulama zararsızdır (aynı sonuç).
//   Ortak liste (alışveriş…): herkes ekler, işaretler, temizler.
//   Ortak kart (randevu…): herkesin ajandasında 👪 Ortak; biri üstlenir; işaretlenince herkeste işaretlenir.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow } from './db';
import type { Blok, Hatirlatma, Izinler } from './paket';

export type OrtakOp =
  | { o: 'liste'; id: string; ad: string; kim: string; zaman: number }
  | { o: 'liste-sil'; id: string; zaman: number }
  | { o: 'madde'; liste: string; id: string; metin: string; kim: string; zaman: number }
  | { o: 'isaret'; liste: string; id: string; isaretli: boolean; kim: string; zaman: number }
  | { o: 'madde-sil'; liste: string; id: string; zaman: number }
  | { o: 'kart'; id: string; ad: string; bloklar: Blok[]; tarih: string; saatler: string[]; hatirlatma: Hatirlatma | null; kim: string; kim_ad: string; zaman: number }
  | { o: 'kart-sil'; id: string; zaman: number }
  | { o: 'ustlen'; id: string; kim: string | null; kim_ad: string | null; zaman: number }
  | { o: 'yapildi'; id: string; tarih: string; yapildi: boolean; kim: string; kim_ad: string; zaman: number };

const ORTAK_IZIN: Izinler = { ac: true, duzenle: false, sil: false, gun_degistir: false, sirala: true, duzeltme_gun: null };
export const ortakKartId = (id: string) => `o-${id}`;
const etiket = (ustlenen_ad: string | null) => (ustlenen_ad ? `Ortak · ${ustlenen_ad} üstlendi` : 'Ortak');

export async function ortakUygula(op: OrtakOp, aile: string) {
  switch (op.o) {
    case 'liste': {
      const l = await db.ortak_liste.get(op.id);
      if (l?.silindi) return;
      await db.ortak_liste.put({ id: op.id, aile, ad: op.ad, olusturan: op.kim, zaman: l?.zaman ?? op.zaman });
      return;
    }
    case 'liste-sil': {
      const l = await db.ortak_liste.get(op.id);
      await db.ortak_liste.put({ id: op.id, aile, ad: l?.ad ?? '', olusturan: l?.olusturan ?? '', zaman: l?.zaman ?? op.zaman, silindi: true });
      await db.ortak_madde.where('liste').equals(op.id).delete();
      return;
    }
    case 'madde': {
      const m = await db.ortak_madde.get(op.id);
      if (m) return;
      if ((await db.ortak_liste.get(op.liste))?.silindi) return;
      await db.ortak_madde.put({ id: op.id, liste: op.liste, metin: op.metin, ekleyen: op.kim, zaman: op.zaman, isaretli: false, isaret_kim: null, isaret_zaman: 0 });
      return;
    }
    case 'isaret': {
      const m = await db.ortak_madde.get(op.id);
      if (!m || m.silindi || op.zaman < m.isaret_zaman) return;
      await db.ortak_madde.update(op.id, { isaretli: op.isaretli, isaret_kim: op.kim, isaret_zaman: op.zaman });
      return;
    }
    case 'madde-sil': {
      const m = await db.ortak_madde.get(op.id);
      if (m) await db.ortak_madde.update(op.id, { silindi: true });
      return;
    }
    case 'kart': {
      const id = ortakKartId(op.id);
      const k = await db.ajanda_kart.get(id);
      const sira = k?.sira ?? (await db.ajanda_kart.toArray()).reduce((m, x) => Math.max(m, x.sira), 0) + 1;
      const ortak = k?.ortak ?? { aile, olusturan: op.kim, olusturan_ad: op.kim_ad, ustlenen: null, ustlenen_ad: null, yapan_ad: null };
      const satir: AjandaKartRow = {
        id, tip: 'yap', ad: op.ad, bloklar: op.bloklar, baslangic: op.tarih, bitis: op.tarih, gunler: null,
        saatler: op.saatler, hatirlatma: op.hatirlatma, kaynak_modul: 'ortak', kaynak_ref: `ortak:${aile}:${op.id}`,
        kaynak_etiket: etiket(ortak.ustlenen_ad), sahip: op.kim, izinler: ORTAK_IZIN, geri_bildirim: 'yerel',
        ortak, sira, guncellendi: Date.now(),
      };
      await db.ajanda_kart.put(satir);
      return;
    }
    case 'kart-sil': {
      const id = ortakKartId(op.id);
      await db.ajanda_kart.delete(id);
      await db.ajanda_kayit.where('kart_id').equals(id).delete();
      return;
    }
    case 'ustlen': {
      const id = ortakKartId(op.id);
      const k = await db.ajanda_kart.get(id);
      if (!k?.ortak) return;
      await db.ajanda_kart.update(id, { ortak: { ...k.ortak, ustlenen: op.kim, ustlenen_ad: op.kim_ad }, kaynak_etiket: etiket(op.kim_ad), guncellendi: Date.now() });
      return;
    }
    case 'yapildi': {
      const id = ortakKartId(op.id);
      const k = await db.ajanda_kart.get(id);
      if (!k?.ortak) return;
      const kid = `${id}|${op.tarih}`;
      const r = await db.ajanda_kayit.get(kid);
      if ((r?.yapildi ?? false) !== op.yapildi) {
        // Doğrudan yazılır (yayinla yok) — işlem yeniden kanala dönmesin.
        await db.ajanda_kayit.put({ id: kid, kart_id: id, tarih: op.tarih, yapildi: op.yapildi, degerler: r?.degerler ?? null, zaman: op.yapildi ? op.zaman : null, guncellendi: Date.now() });
      }
      await db.ajanda_kart.update(id, { ortak: { ...k.ortak, yapan_ad: op.yapildi ? op.kim_ad : null } });
      return;
    }
  }
}

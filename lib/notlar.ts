// Notlar (30 eylül) — hızlı not + stilli yazım (Tiptap). Belge JSON olarak saklanır;
// başlık ve düz metin liste/arama için ayrıca tutulur.
import { db, type NotRow } from './db';
import { teslimAl } from './ajanda';
import { PAKET_SURUM, TAM_IZIN } from './paket';
import { basliksizBelge, belgeBos, type BDugum } from './belge';

export async function hizliNot(metin: string): Promise<string> {
  const t = metin.trim();
  const id = crypto.randomUUID();
  const simdi = Date.now();
  await db.not.add({
    id, belge: { type: 'doc', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] },
    baslik: t.split('\n')[0] ?? '', metin: t, sabit: false, olusturuldu: simdi, guncellendi: simdi,
  });
  return id;
}

export async function notKaydet(id: string, belge: unknown, metin: string) {
  const baslik = metin.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  await db.not.update(id, { belge, metin, baslik, guncellendi: Date.now() });
}

export const notSabitle = (n: NotRow) => db.not.update(n.id, { sabit: !n.sabit, guncellendi: Date.now() });
export const notSil = (id: string) => db.not.delete(id);

/** Sabitlenenler üstte, sonra en son düzenlenen. */
export async function notlar(): Promise<NotRow[]> {
  const hepsi = await db.not.toArray();
  return hepsi.sort((a, b) => Number(b.sabit) - Number(a.sabit) || b.guncellendi - a.guncellendi);
}

/** Nottan Ajanda'ya (30 eylül): ilk satır kartın adı, geri kalanı stilli açıklama (checklist'ler dahil).
 *  Not yerinde kalır; kart bağımsız bir kopya olur. */
export async function notuAjandaya(n: NotRow, tarih: string, saat: string) {
  const { baslik, govde } = basliksizBelge(n.belge as BDugum);
  await teslimAl([{
    surum: PAKET_SURUM, id: crypto.randomUUID(), tip: 'yap', ad: baslik || n.baslik || 'Not',
    bloklar: belgeBos(govde) ? [] : [{ tur: 'belge', belge: govde }],
    zamanlama: { baslangic: tarih, bitis: tarih, gunler: null, saatler: saat ? [saat] : [] },
    kaynak: { modul: 'ajanda', ref: `not:${n.id}`, etiket: null }, sahip: 'ben', izinler: TAM_IZIN, geri_bildirim: 'yok',
  }]);
}

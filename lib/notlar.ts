// Notlar (30 eylül) — hızlı not + stilli yazım (Tiptap). Belge JSON olarak saklanır;
// başlık ve düz metin liste/arama için ayrıca tutulur.
import { db, type NotRow } from './db';

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

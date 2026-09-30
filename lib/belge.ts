// Stilli belge yardımcıları (30 eylül) — Tiptap JSON'u editör olmadan okur.
// Kart açıklaması ve notlar aynı biçimi kullanır.

export interface BDugum { type: string; attrs?: Record<string, unknown>; content?: BDugum[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }

export const bosBelge = (): BDugum => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/** Düz metinden belge: her satır bir paragraf (eski düz açıklamalar için). */
export function metindenBelge(metin: string): BDugum {
  const satirlar = metin.split('\n');
  return { type: 'doc', content: satirlar.map((s) => (s ? { type: 'paragraph', content: [{ type: 'text', text: s }] } : { type: 'paragraph' })) };
}

export function belgeMetni(d: BDugum | object | null | undefined): string {
  const n = d as BDugum | null | undefined;
  if (!n) return '';
  if (n.type === 'text') return n.text ?? '';
  const ic = (n.content ?? []).map(belgeMetni);
  if (n.type === 'tableRow') return ic.map((x) => x.trim()).join(' | ') + '\n';
  const blok = ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'].includes(n.type);
  return blok ? ic.join('') + '\n' : ic.join('');
}

export const belgeBos = (d: BDugum | object | null | undefined) => !belgeMetni(d).trim() && !JSON.stringify(d ?? {}).includes('"taskItem"');

/** Belgedeki checklist maddeleri, belge sırasıyla (iç içe olanlar dahil). */
export function gorevler(d: BDugum | null | undefined): BDugum[] {
  const out: BDugum[] = [];
  const gez = (n: BDugum) => { if (n.type === 'taskItem') out.push(n); (n.content ?? []).forEach(gez); };
  if (d) gez(d);
  return out;
}

/** Bir notu karta çevirirken ilk satır başlık olur; belgeden çıkarılır. */
export function basliksizBelge(d: BDugum): { baslik: string; govde: BDugum } {
  const ic = [...(d.content ?? [])];
  const ilk = ic[0];
  const baslik = ilk && ['paragraph', 'heading'].includes(ilk.type) ? belgeMetni(ilk).trim() : '';
  if (baslik) ic.shift();
  return { baslik, govde: { ...d, content: ic.length ? ic : [{ type: 'paragraph' }] } };
}

'use client';

// Stilli not editörü (30 eylül) — Tiptap. Kalın/italik/altı çizili/vurgu, başlıklar, madde ve
// numaralı liste, checklist, alıntı, ayraç. Yazdıkça kaydeder (kısa gecikmeyle).
// Kısayollar: "- " madde, "1. " numaralı, "[ ] " checklist, "# " başlık, "> " alıntı.

import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import type { NotRow } from '@/lib/db';
import { notKaydet } from '@/lib/notlar';

type Dugme = { etiket: React.ReactNode; baslik: string; aktif?: (e: Editor) => boolean; calis: (e: Editor) => void };

const DUGMELER: (Dugme | '|')[] = [
  { etiket: <b>B</b>, baslik: 'Kalın', aktif: (e) => e.isActive('bold'), calis: (e) => e.chain().focus().toggleBold().run() },
  { etiket: <i>I</i>, baslik: 'İtalik', aktif: (e) => e.isActive('italic'), calis: (e) => e.chain().focus().toggleItalic().run() },
  { etiket: <u>U</u>, baslik: 'Altı çizili', aktif: (e) => e.isActive('underline'), calis: (e) => e.chain().focus().toggleUnderline().run() },
  { etiket: <mark>A</mark>, baslik: 'Vurgula', aktif: (e) => e.isActive('highlight'), calis: (e) => e.chain().focus().toggleHighlight().run() },
  '|',
  { etiket: 'H1', baslik: 'Başlık', aktif: (e) => e.isActive('heading', { level: 1 }), calis: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { etiket: 'H2', baslik: 'Alt başlık', aktif: (e) => e.isActive('heading', { level: 2 }), calis: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  '|',
  { etiket: '•', baslik: 'Madde listesi', aktif: (e) => e.isActive('bulletList'), calis: (e) => e.chain().focus().toggleBulletList().run() },
  { etiket: '1.', baslik: 'Numaralı liste', aktif: (e) => e.isActive('orderedList'), calis: (e) => e.chain().focus().toggleOrderedList().run() },
  { etiket: '☑', baslik: 'Yapılacaklar listesi', aktif: (e) => e.isActive('taskList'), calis: (e) => e.chain().focus().toggleTaskList().run() },
  { etiket: '❝', baslik: 'Alıntı', aktif: (e) => e.isActive('blockquote'), calis: (e) => e.chain().focus().toggleBlockquote().run() },
  { etiket: '―', baslik: 'Ayraç', calis: (e) => e.chain().focus().setHorizontalRule().run() },
  '|',
  { etiket: '↶', baslik: 'Geri al', calis: (e) => e.chain().focus().undo().run() },
  { etiket: '↷', baslik: 'Yinele', calis: (e) => e.chain().focus().redo().run() },
];

// Kartın açıklaması için sade araç çubuğu.
const KOMPAKT = new Set(['Kalın', 'Vurgula', 'Madde listesi', 'Numaralı liste', 'Yapılacaklar listesi']);

/** Genel stilli editör — not ve kart açıklaması aynı editörü kullanır. */
export function ZenginEditor({ icerik, onDegis, kompakt, placeholder, autofocus, ilkSatirBaslik }: {
  icerik: unknown; onDegis: (belge: object, metin: string) => void; kompakt?: boolean; placeholder?: string; autofocus?: boolean; ilkSatirBaslik?: boolean;
}) {
  const degis = useRef(onDegis);
  degis.current = onDegis;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: true, autolink: true }, ...(kompakt ? { heading: false, blockquote: false, horizontalRule: false, codeBlock: false } : {}) }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({ placeholder: ({ pos }) => (ilkSatirBaslik && pos === 0 ? 'Başlık…' : placeholder ?? 'Yaz… ( - madde, [ ] yapılacak, # başlık )') }),
    ],
    content: (icerik as object) ?? '',
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    autofocus: autofocus ? 'end' : false,
    onUpdate: ({ editor: e }) => degis.current(e.getJSON(), e.getText({ blockSeparator: '\n' })),
  });
  const dugmeler = kompakt ? DUGMELER.filter((d) => d !== '|' && KOMPAKT.has(d.baslik)) : DUGMELER;
  return (
    <div className={`rt-not-edit${kompakt ? ' kompakt' : ''}`}>
      <div className="rt-not-arac" role="toolbar" aria-label="Biçim">
        {dugmeler.map((d, i) => d === '|'
          ? <span key={i} className="ayrac" />
          : <button key={i} type="button" title={d.baslik} aria-label={d.baslik} className={editor && d.aktif?.(editor) ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => editor && d.calis(editor)}>{d.etiket}</button>)}
      </div>
      <EditorContent editor={editor} className={`rt-not-icerik${ilkSatirBaslik ? ' baslikli' : ''}`} />
    </div>
  );
}

export default function NotEditor({ not, yeni }: { not: NotRow; yeni?: boolean }) {
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bekleyen = useRef<(() => Promise<void>) | null>(null);
  // Kapanırken bekleyen kaydı yaz.
  useEffect(() => () => { if (zaman.current) clearTimeout(zaman.current); bekleyen.current?.(); }, []);
  return (
    <ZenginEditor
      icerik={not.belge}
      autofocus={yeni}
      ilkSatirBaslik
      onDegis={(belge, metin) => {
        bekleyen.current = () => notKaydet(not.id, belge, metin);
        if (zaman.current) clearTimeout(zaman.current);
        zaman.current = setTimeout(() => { bekleyen.current?.(); bekleyen.current = null; }, 400);
      }}
    />
  );
}

'use client';

// Stilli belgeyi (Tiptap JSON) editörsüz çizer. Checklist maddeleri iki kipte:
//  • işaretler verilirse (Ajanda'da o günün kaydı) tıklanabilir, günlük durum gösterilir;
//  • verilmezse şablon gibi boş kutular (kütüphane, koç görünümü).

import React from 'react';
import type { BDugum } from '@/lib/belge';

export function BelgeGoster({ belge, isaretler, onIsaret }: { belge: unknown; isaretler?: number[]; onIsaret?: (i: number, acik: boolean) => void }) {
  let sayac = 0;
  const isaretliMi = (i: number, n: BDugum) => (isaretler ? isaretler.includes(i) : !!n.attrs?.checked && !onIsaret);
  const metin = (n: BDugum, k: number): React.ReactNode => {
    let el: React.ReactNode = n.text;
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') el = <b>{el}</b>;
      else if (m.type === 'italic') el = <i>{el}</i>;
      else if (m.type === 'underline') el = <u>{el}</u>;
      else if (m.type === 'strike') el = <s>{el}</s>;
      else if (m.type === 'highlight') el = <mark>{el}</mark>;
      else if (m.type === 'code') el = <code>{el}</code>;
      else if (m.type === 'link') el = <a href={String(m.attrs?.href ?? '')} target="_blank" rel="noreferrer">{el}</a>;
    }
    return <React.Fragment key={k}>{el}</React.Fragment>;
  };
  const ciz = (n: BDugum, k: number): React.ReactNode => {
    const ic = () => (n.content ?? []).map(ciz);
    switch (n.type) {
      case 'doc': return <React.Fragment key={k}>{ic()}</React.Fragment>;
      case 'text': return metin(n, k);
      case 'hardBreak': return <br key={k} />;
      case 'paragraph': return <p key={k}>{ic()}</p>;
      case 'heading': return n.attrs?.level === 1 ? <h3 key={k}>{ic()}</h3> : <h4 key={k}>{ic()}</h4>;
      case 'bulletList': return <ul key={k}>{ic()}</ul>;
      case 'orderedList': return <ol key={k}>{ic()}</ol>;
      case 'listItem': return <li key={k}>{ic()}</li>;
      case 'blockquote': return <blockquote key={k}>{ic()}</blockquote>;
      case 'horizontalRule': return <hr key={k} />;
      case 'taskList': return <ul key={k} className="gorev">{ic()}</ul>;
      case 'taskItem': {
        const i = sayac++;
        const acik = isaretliMi(i, n);
        return (
          <li key={k} className={acik ? 'on' : ''}>
            <input type="checkbox" checked={acik} disabled={!onIsaret} onChange={(e) => onIsaret?.(i, e.target.checked)} aria-label="Madde" />
            <div>{ic()}</div>
          </li>
        );
      }
      default: return <React.Fragment key={k}>{ic()}</React.Fragment>;
    }
  };
  return <div className="rt-belge">{ciz(belge as BDugum, 0)}</div>;
}

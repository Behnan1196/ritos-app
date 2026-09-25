'use client';

import React, { type ReactNode } from 'react';
import type { Blok } from '@/lib/paket';

// Modal — formlar ekranda sabit durmaz, modal ile açılır.
export function Modal({ baslik, onKapat, children }: { baslik: string; onKapat: () => void; children: ReactNode }) {
  return (
    <div className="rt-modal-bg" onClick={onKapat}>
      <div className="rt-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={baslik}>
        <div className="rt-modal-hd">
          <b>{baslik}</b>
          <button type="button" className="rt-x" onClick={onKapat} aria-label="Kapat">×</button>
        </div>
        <div className="rt-modal-body">{children}</div>
      </div>
    </div>
  );
}

// CardContainer'ın sade hali: başlık şeridi + sık kullanılan eylemler başlıkta.
export function Kap({ baslik, eylemler, children }: { baslik: ReactNode; eylemler?: ReactNode; children: ReactNode }) {
  return (
    <div className="rt-kap">
      <div className="rt-kap-hd">
        <div className="rt-kap-bas">{baslik}</div>
        <div className="rt-kap-ey">{eylemler}</div>
      </div>
      <div className="rt-kap-ic">{children}</div>
    </div>
  );
}

export function Chips<T extends string | number>({ secenekler, deger, onSec }: { secenekler: [T, string][]; deger: T; onSec: (v: T) => void }) {
  return (
    <div className="rt-chips">
      {secenekler.map(([v, e]) => (
        <button key={String(v)} type="button" className={`rt-chip${v === deger ? ' on' : ''}`} onClick={() => onSec(v)}>{e}</button>
      ))}
    </div>
  );
}

// Blok çizici — tüm kart tiplerinin içeriği bu tek bileşenden çizilir.
export function BlokGoster({ bloklar }: { bloklar: Blok[] }) {
  if (!bloklar.length) return <p className="rt-muted">İçerik yok.</p>;
  return (
    <div className="rt-bloklar">
      {bloklar.map((b, i) => {
        if (b.tur === 'metin') return <p key={i} className="rt-metin">{b.metin}</p>;
        if (b.tur === 'baglanti' || b.tur === 'video')
          return <a key={i} className="rt-link" href={b.url} target="_blank" rel="noreferrer">{b.tur === 'video' ? '▶ ' : '🔗 '}{b.baslik || b.url}</a>;
        if (b.tur === 'sayi') return <p key={i} className="rt-muted">Değer: {b.etiket}{b.birim ? ` (${b.birim})` : ''}{b.hedef !== undefined ? ` · hedef ${b.hedef}` : ''}</p>;
        if (b.tur === 'zamanlayici') return <p key={i} className="rt-muted">⏱ {b.dakika} dk</p>;
        return <p key={i} className="rt-muted">{b.etiket}</p>;
      })}
    </div>
  );
}

// Girilen değerlerin kısa metni (sure_dk → "12 dk").
export function degerMetni(d: Record<string, unknown>): string {
  return Object.entries(d).map(([k, v]) => (k === 'sure_dk' ? `${v} dk` : String(v))).join(' · ');
}

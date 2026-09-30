'use client';

import React, { type ReactNode } from 'react';
import type { Blok } from '@/lib/paket';
import { BelgeGoster } from './Belge';

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
export function BlokGoster({ bloklar, bosMetin }: { bloklar: Blok[]; bosMetin?: string | null }) {
  if (!bloklar.length) return bosMetin === null ? null : <p className="rt-muted">{bosMetin ?? 'İçerik yok.'}</p>;
  return (
    <div className="rt-bloklar">
      {bloklar.map((b, i) => {
        if (b.tur === 'metin') return <p key={i} className="rt-metin">{b.metin}</p>;
        if (b.tur === 'belge') return <BelgeGoster key={i} belge={b.belge} />;
        if (b.tur === 'video') {
          const id = youtubeId(b.url);
          if (id) {
            const q = [b.bas !== undefined ? `start=${b.bas}` : '', b.bit !== undefined ? `end=${b.bit}` : '', 'rel=0'].filter(Boolean).join('&');
            return (
              <div key={i} className="rt-video">
                {b.baslik && <span className="rt-video-bas">{b.baslik}</span>}
                <div className="rt-video-kutu"><iframe src={`https://www.youtube-nocookie.com/embed/${id}?${q}`} title={b.baslik || 'Video'} allow="encrypted-media; picture-in-picture; fullscreen" /></div>
              </div>
            );
          }
        }
        if (b.tur === 'baglanti' || b.tur === 'video')
          return <a key={i} className="rt-link" href={b.url} target="_blank" rel="noreferrer">{b.tur === 'video' ? '▶ ' : '🔗 '}{b.baslik || b.url}</a>;
        if (b.tur === 'sayi') return <p key={i} className="rt-muted">Değer: {b.etiket}{b.birim ? ` (${b.birim})` : ''}{b.hedef !== undefined ? ` · hedef ${b.hedef}` : ''}</p>;
        if (b.tur === 'zamanlayici') return <p key={i} className="rt-muted">⏱ {b.dakika} dk</p>;
        return <p key={i} className="rt-muted">{b.etiket}</p>;
      })}
    </div>
  );
}

// YouTube bağlantısından video kimliği (watch?v=, youtu.be/, shorts/, embed/).
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Girilen değerlerin kısa metni (sure_dk → "12 dk"). Bloklar verilirse birim de eklenir.
export function degerMetni(d: Record<string, unknown>, bloklar?: Blok[]): string {
  return Object.entries(d)
    .filter(([k, v]) => k !== 'liste' && v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => {
      const m = typeof v === 'number' ? v.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : String(v);
      if (k === 'sure_dk') return `${m} dk`;
      const b = bloklar?.find((x) => 'anahtar' in x && x.anahtar === k);
      return b && b.tur === 'sayi' && b.birim ? `${m} ${b.birim}` : m;
    })
    .join(' · ');
}

// Tarayıcının onay kutusu yerine sayfa içi onay (PWA'da confirm() güvenilmez; formlar da modalda).
export function OnayKutusu({ metin, evet, onEvet, onVazgec }: { metin: string; evet: string; onEvet: () => void; onVazgec: () => void }) {
  return (
    <div className="rt-onay-kutu">
      <span>{metin}</span>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onVazgec}>Vazgeç</button>
        <button type="button" className="rt-btn tehlike" onClick={onEvet}>{evet}</button>
      </div>
    </div>
  );
}

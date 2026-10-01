'use client';

import React, { useState, type ReactNode } from 'react';
import type { Blok } from '@/lib/paket';
import { BelgeGoster } from './Belge';
import { YansitDugmesi } from './Yansit';

// Modal — formlar ekranda sabit durmaz, modal ile açılır.
// ust: başlığın sağında, ✕'ten önce duran ek öğe (örn. kart editöründe tarih-saat çipi).
export function Modal({ baslik, onKapat, children, ust }: { baslik: string; onKapat: () => void; children: ReactNode; ust?: ReactNode }) {
  return (
    <div className="rt-modal-bg" onClick={onKapat}>
      <div className="rt-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={baslik}>
        <div className="rt-modal-hd">
          <b>{baslik}</b>
          {ust}
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

// Blok çizici — tüm kart tiplerinin içeriği bu tek bileşenden, bloklar SIRASIYLA çizilir.
// Art arda gelen YouTube videoları tek video grubu olur: birden fazlaysa alternatiflerdir
// (seviye/versiyon) ve sekmeyle seçilir (Rite'taki çoklu video). Kayıt blokları (süre, ölçüm,
// zamanlayıcı) için `kayit` verilirse onların ilk göründüğü yerde bir kez o çizilir (null = gizle).
// belgeIsaret: açıklamadaki checklist işaretleri (günlük) ve işaretleme.
export function BlokGoster({ bloklar, bosMetin, kayit, belgeIsaret }: {
  bloklar: Blok[]; bosMetin?: string | null; kayit?: ReactNode | null;
  belgeIsaret?: { isaretler: number[]; onIsaret?: (sira: number, acik: boolean, belge: unknown) => void };
}) {
  if (!bloklar.length) return bosMetin === null ? null : <p className="rt-muted">{bosMetin ?? 'İçerik yok.'}</p>;
  const out: ReactNode[] = [];
  let kayitCizildi = false;
  for (let i = 0; i < bloklar.length; i++) {
    const b = bloklar[i];
    if (b.tur === 'video' && oynatilir(b.url)) {
      const grup: Extract<Blok, { tur: 'video' }>[] = [b];
      while (i + 1 < bloklar.length) {
        const n = bloklar[i + 1];
        if (n.tur === 'video' && oynatilir(n.url)) { grup.push(n); i++; } else break;
      }
      out.push(<VideoGrubu key={`v${i}`} videolar={grup} />);
      continue;
    }
    if ((b.tur === 'sayi' || b.tur === 'zamanlayici') && kayit !== undefined) {
      if (!kayitCizildi && kayit) out.push(<React.Fragment key={`k${i}`}>{kayit}</React.Fragment>);
      kayitCizildi = true;
      continue;
    }
    if (b.tur === 'metin') out.push(<p key={i} className="rt-metin">{b.metin}</p>);
    else if (b.tur === 'belge') out.push(
      <BelgeGoster key={i} belge={b.belge} isaretler={belgeIsaret?.isaretler}
        onIsaret={belgeIsaret?.onIsaret ? (sira, acik) => belgeIsaret.onIsaret!(sira, acik, b.belge) : undefined} />,
    );
    else if (b.tur === 'baglanti' || b.tur === 'video')
      out.push(<a key={i} className="rt-link" href={b.url} target="_blank" rel="noreferrer">{b.tur === 'video' ? '▶ ' : '🔗 '}{b.baslik || b.url}</a>);
    else if (b.tur === 'sayi') out.push(
      <p key={i} className="rt-muted">{b.anahtar === 'sure_dk' ? '⏱ Süre kaydı' : `📏 ${b.etiket}${b.birim ? ` (${b.birim})` : ''}`}{b.hedef !== undefined ? ` · hedef ${b.hedef}` : ''}</p>,
    );
    else if (b.tur === 'zamanlayici') out.push(<p key={i} className="rt-muted">⏱ {b.dakika > 0 ? `Hedef ${b.dakika} dk` : 'Serbest süre'}</p>);
    else out.push(<p key={i} className="rt-muted">{b.etiket}</p>);
  }
  return <div className="rt-bloklar">{out}</div>;
}

// Video grubu: tek video ya da sekmeli videolar (YouTube + Instagram karışık olabilir); YouTube'da Yansıt.
export function VideoGrubu({ videolar }: { videolar: Extract<Blok, { tur: 'video' }>[] }) {
  const [sec, setSec] = useState(0);
  const v = videolar[Math.min(sec, videolar.length - 1)];
  const id = youtubeId(v.url);
  return (
    <div className="rt-video">
      {videolar.length > 1 ? (
        <div className="rt-chips">
          {videolar.map((x, i) => (
            <button key={i} type="button" className={`rt-chip${i === sec ? ' on' : ''}`} onClick={() => setSec(i)}>{x.baslik || `Video ${i + 1}`}</button>
          ))}
        </div>
      ) : v.baslik ? <span className="rt-video-bas">{v.baslik}</span> : null}
      <VideoOynatici key={sec} url={v.url} bas={v.bas} bit={v.bit} baslik={v.baslik} />
      {id && <div className="rt-video-alt"><YansitDugmesi videoId={id} bas={v.bas} /></div>}
    </div>
  );
}

// Tek oynatıcı: YouTube (başla/bitir ile) ya da Instagram (izin verilmiş, herkese açık gönderi).
export function VideoOynatici({ url, bas, bit, baslik }: { url: string; bas?: number; bit?: number; baslik?: string }) {
  const id = youtubeId(url);
  if (id) {
    const q = [bas !== undefined ? `start=${bas}` : '', bit !== undefined ? `end=${bit}` : '', 'rel=0', 'playsinline=1'].filter(Boolean).join('&');
    return <div className="rt-video-kutu"><iframe key={id} src={`https://www.youtube-nocookie.com/embed/${id}?${q}`} title={baslik || 'Video'} allow="encrypted-media; picture-in-picture; fullscreen" /></div>;
  }
  const ig = instagramEmbed(url);
  if (ig) return <iframe className="rt-ig-kutu" src={ig} title={baslik || 'Instagram'} scrolling="no" allow="encrypted-media; fullscreen" />;
  return null;
}

// Instagram gönderi/reel bağlantısından gömme adresi (yalnız herkese açık ve gömmeye izin verilenler oynar).
export function instagramEmbed(url: string): string | null {
  const m = url.match(/instagram\.com\/(reel|reels|p|tv)\/([\w-]+)/);
  if (!m) return null;
  return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/embed`;
}
export const oynatilir = (url: string) => !!youtubeId(url) || !!instagramEmbed(url);

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

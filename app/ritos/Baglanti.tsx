'use client';

// Bağlantı widget'ları (2 ekim) — Home'da kendi uygulamanın sayfası (iframe). Bkz. lib/baglanti.ts.

import React, { useEffect, useRef, useState } from 'react';
import { useCanli } from '@/lib/canli';
import type { BaglantiRow } from '@/lib/db';
import { BOY_PX, baglantiKaydet, baglantiSil, baglantilar, urlDoldur, urlGecerli } from '@/lib/baglanti';
import { Modal, OnayKutusu } from './ortak';

// Kısıtlı mod: sayfa kendi kökeninde çalışır (kendi oturumu/çerezleri), form gönderebilir, bağlantı
// açabilir; Ritos'un sayfasına ve adres çubuğuna dokunamaz.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
// Ritos'la aynı kökenden bir sayfa "allow-same-origin" ile kum havuzundan çıkabilir — o durumda verilmez.
const sandboxFor = (src: string) => {
  try { return new URL(src).origin === location.origin ? SANDBOX.replace(' allow-same-origin', '') : SANDBOX; } catch { return SANDBOX; }
};

export function BaglantiWidgetlari({ ekleAcik, onEkleKapat }: { ekleAcik: boolean; onEkleKapat: () => void }) {
  const liste = useCanli(baglantilar, [], [] as BaglantiRow[]);
  const [duzenle, setDuzenle] = useState<BaglantiRow | null>(null);
  return (
    <>
      {liste.map((b) => <BaglantiWidget key={b.id} b={b} onAyar={() => setDuzenle(b)} />)}
      {(ekleAcik || duzenle) && <BaglantiFormu b={duzenle} onKapat={() => { setDuzenle(null); onEkleKapat(); }} />}
    </>
  );
}

function useCevrimici() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const f = () => setOn(navigator.onLine);
    f();
    window.addEventListener('online', f); window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  return on;
}

// Sayfanın postMessage'larını dinler: yükseklik ve büyüt.
function useSayfaMesaji(ref: React.RefObject<HTMLIFrameElement>, onYukseklik: (h: number) => void, onBuyut?: () => void) {
  useEffect(() => {
    const f = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data as { ritos?: string; h?: number } | null;
      if (!d || typeof d !== 'object') return;
      if (d.ritos === 'yukseklik' && typeof d.h === 'number') onYukseklik(Math.max(60, Math.min(1400, Math.round(d.h))));
      if (d.ritos === 'buyut') onBuyut?.();
    };
    window.addEventListener('message', f);
    return () => window.removeEventListener('message', f);
  }, [ref, onYukseklik, onBuyut]);
}

function BaglantiWidget({ b, onAyar }: { b: BaglantiRow; onAyar: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState<number | null>(null);
  const [buyuk, setBuyuk] = useState(false);
  const [anahtar, setAnahtar] = useState(0); // yenile
  const cevrimici = useCevrimici();
  useSayfaMesaji(ref, setH, () => setBuyuk(true));
  const src = urlDoldur(b.url);
  return (
    <div className="rt-bag-w">
      <div className="rt-notlar-hd">
        <b>🔗 {b.ad}</b>
        <button type="button" className="rt-ikon" aria-label="Yenile" title="Yenile" onClick={() => setAnahtar((x) => x + 1)}>↻</button>
        <button type="button" className="rt-ikon" aria-label="Büyük aç" title="Büyük aç" onClick={() => setBuyuk(true)}>⤢</button>
        <button type="button" className="rt-ikon" aria-label="Widget ayarları" title="Ayarlar" onClick={onAyar}>⋯</button>
      </div>
      {cevrimici ? (
        <iframe key={anahtar} ref={ref} className="rt-bag-cerceve" src={src} title={b.ad} sandbox={sandboxFor(src)} style={{ height: h ?? BOY_PX[b.boy] }} loading="lazy" />
      ) : <p className="rt-muted rt-bag-yok">Bağlantı yok — internet gelince yüklenir.</p>}
      {buyuk && <BaglantiEkrani b={b} src={src} onKapat={() => setBuyuk(false)} />}
    </div>
  );
}

/** Home › bağlantı widget'ı tam ekran (5 ekim): iframe bölmeyi doldurur; yalnız açılınca yüklenir. */
export function BaglantiTam({ b, onAyar }: { b: BaglantiRow; onAyar: () => void }) {
  const [anahtar, setAnahtar] = useState(0);
  const cevrimici = useCevrimici();
  const src = urlDoldur(b.url);
  return (
    <div className="rt-bag-tam-w">
      <div className="rt-satir rt-bag-arac">
        <span className="rt-muted">{(() => { try { return new URL(src).host; } catch { return ''; } })()}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="rt-ikon" aria-label="Yenile" title="Yenile" onClick={() => setAnahtar((x) => x + 1)}>↻</button>
        <button type="button" className="rt-ikon" aria-label="Widget ayarları" title="Ayarlar" onClick={onAyar}>⋯</button>
      </div>
      {cevrimici
        ? <iframe key={anahtar} className="rt-bag-tam" src={src} title={b.ad} sandbox={sandboxFor(src)} />
        : <p className="rt-muted rt-bag-yok">Bağlantı yok — internet gelince yüklenir.</p>}
    </div>
  );
}

// Büyük açılış: geniş ekranda sağ panelde, telefonda tam ekran (Notlar ekranıyla aynı kalıp).
function BaglantiEkrani({ b, src, onKapat }: { b: BaglantiRow; src: string; onKapat: () => void }) {
  const [anahtar, setAnahtar] = useState(0);
  return (
    <div className="rt-not-ekran rt-bag-ekran">
      <div className="rt-not-ust">
        <button type="button" className="tool-back" onClick={onKapat}>‹ Geri</button>
        <b>🔗 {b.ad}</b>
        <button type="button" className="rt-ikon" aria-label="Yenile" onClick={() => setAnahtar((x) => x + 1)}>↻</button>
      </div>
      <iframe key={anahtar} className="rt-bag-tam" src={src} title={b.ad} sandbox={sandboxFor(src)} />
    </div>
  );
}

export function BaglantiFormu({ b, onKapat }: { b: BaglantiRow | null; onKapat: () => void }) {
  const [ad, setAd] = useState(b?.ad ?? '');
  const [url, setUrl] = useState(b?.url ?? '');
  const [boy, setBoy] = useState<BaglantiRow['boy']>(b?.boy ?? 'o');
  const [sil, setSil] = useState(false);
  const gecerli = urlGecerli(url);
  return (
    <Modal baslik={b ? 'Bağlantı widget’ı' : '＋ Bağlantı widget’ı'} onKapat={onKapat}>
      <input className="rt-inp" placeholder="Ad (örn. Beslenme özeti)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus={!b} />
      <input className="rt-inp" placeholder="https://uygulaman/ozet?k=…&tarih={tarih}" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
      {url && !gecerli && <p className="rt-hata">Adres https:// ile başlamalı.</p>}
      <div className="rt-chips">
        <span className="rt-muted">Yükseklik:</span>
        {([['k', 'Küçük'], ['o', 'Orta'], ['b', 'Büyük']] as [BaglantiRow['boy'], string][]).map(([v, e]) => (
          <button key={v} type="button" className={`rt-chip${boy === v ? ' on' : ''}`} onClick={() => setBoy(v)}>{e}</button>
        ))}
      </div>
      <details className="rt-bag-yardim">
        <summary>Kendi uygulamanda gerekenler</summary>
        <p>Adreste <code>{'{tarih}'}</code> (bugün), <code>{'{hafta}'}</code> (haftanın pazartesisi) ve <code>{'{tema}'}</code> kullanabilirsin; açılışta doldurulur.</p>
        <p>Sayfanın Ritos içinde açılabilmesi için yanıt başlığına <code>Content-Security-Policy: frame-ancestors {typeof location !== 'undefined' ? location.origin : 'https://ritos-adresi'}</code> ekle. Kimlik için adreste salt-okunur bir anahtar kullan (iPhone'da çerezler çerçeve içinde çalışmayabilir).</p>
        <p>Sayfa yüksekliğini bildirmek için: <code>{"parent.postMessage({ ritos: 'yukseklik', h: document.body.scrollHeight }, '*')"}</code></p>
      </details>
      {sil ? (
        <OnayKutusu metin="Widget kaldırılsın mı?" evet="Kaldır" onVazgec={() => setSil(false)} onEvet={async () => { await baglantiSil(b!.id); onKapat(); }} />
      ) : (
        <div className="rt-satir">
          {b && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Kaldır</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="rt-btn primary" disabled={!ad.trim() || !gecerli} onClick={async () => { await baglantiKaydet({ id: b?.id, ad, url, boy }); onKapat(); }}>{b ? 'Kaydet' : 'Ekle'}</button>
        </div>
      )}
    </Modal>
  );
}

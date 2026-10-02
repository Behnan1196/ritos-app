'use client';

// ————————————————————————————————————————————————————————————————
// Ritos — uygulama kabuğu (27 eylül, V1 sadelik).
//  • Hesap zorunlu: hesap açık değilse giriş ekranı (hesapsız kullanım kaldırıldı).
//  • Home'u biz tasarlarız: Odak alanları, (varsa) koçun, Danışmanlık ve Sınav (koç).
//    Kullanıcının widget ızgarası V2 — kod app/ritos/v2/SeninAlanin.tsx'te kapalı durur.
//  • Geniş ekranda Ajanda solda sabit, sağda sekmeler; dar ekranda alt sekme çubuğu.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import AjandaPane from './ritos/AjandaPane';
import { useBeklemeIzleyici, useSayacIzleyici } from '@/lib/sayac';
import { BaglantiWidgetlari } from './ritos/Baglanti';
import { useBildirimPlani } from '@/lib/bildirim';
import { OdakAlanlari } from './ritos/KisiselGelisim';
import Kutuphane from './ritos/Kutuphane';
import { V2 } from '@/lib/surum';
import { SinavTool, useSinavOzeti } from './ritos/Sinav';
import { DavetKarsilama, KoclarimSatiri } from './ritos/Danismanlik';
import { DanismanlikEkrani, DanismanlikSatiri, danismanlikBaslik, DISIPLIN_IKON } from './ritos/DanismanlikEkrani';
import { SenkronIsareti, useGelenSenkron } from './ritos/Paylasim';
import { SohbetEkrani, useSohbetOzeti } from './ritos/Sohbet';
import { OlcumlerSatiri } from './ritos/Olcum';
import { NotlarWidget } from './ritos/Notlar';
import { AyarlarPane, GirisEkrani, SifreSifirlaEkrani, useKurtarmaHatirlat } from './ritos/Hesap';
import { useHesapBaslat, useOturum } from '@/lib/hesap';
import { useDanismanlik } from '@/lib/danismanlik';

const NARROW_BREAKPOINT = 760;
// Testte (NEXT_PUBLIC_RITOS_TEST=1 ile derlenmiş sürüm) giriş kapısı atlanır; gerçek sürümde yok.
const TEST = process.env.NEXT_PUBLIC_RITOS_TEST === '1';

type ToolId = 'sinav';
type Sekme = 'home' | 'ajanda' | 'gelisim' | 'sohbet' | 'ayarlar';

const TOOL_META: Record<ToolId, { icon: string; title: string }> = {
  sinav: { icon: '📚', title: 'Sınav paketi' },
};

export default function RitosLab() {
  const o = useOturum();
  useBeklemeIzleyici(); // yaptıktan sonra bekleme dolunca uyarı
  useSayacIzleyici(); // kart sayaçları: hedef süre dolunca uyarı (hangi sekmede olunursa olunsun)
  const [sifirla, setSifirla] = useState(false);
  useEffect(() => { try { setSifirla(new URL(location.href).searchParams.has('sifirla')); } catch { /* yoksay */ } }, []);
  if (!o.hazir) return <div className="rt-kilit-bos" />;
  if (sifirla) return o.session ? <SifreSifirlaEkrani /> : <GirisEkrani />;
  if (!o.hesapli || (!TEST && o.kilitli)) return <GirisEkrani yeniden={o.hesapli} />;
  return <RitosUygulama />;
}

function RitosUygulama() {
  useHesapBaslat();
  useBildirimPlani(); // 🔔 ayarlı kartların bildirimlerini kuyruğa yazar
  useGelenSenkron();
  const [isNarrow, setIsNarrow] = useState(false);
  const [ratio, setRatio] = useState(58);
  const [sekme, setSekme] = useState<Sekme>('ajanda');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  // Açık danışmanlık alanı: geniş ekranda sağ bölmede, telefonda tam ekran (28 eylül).
  const [danismanlik, setDanismanlik] = useState<string | null>(null);
  const sinav = useSinavOzeti();

  // Başka ekrandan "Ajanda'ya git" (ör. Kişisel Gelişim › Planla): telefonda Ajanda sekmesine geçilir;
  // geniş ekranda Ajanda zaten solda.
  useEffect(() => {
    const f = () => { if (window.innerWidth < NARROW_BREAKPOINT) setSekme('ajanda'); };
    window.addEventListener('ritos-ajandaya-git', f);
    return () => window.removeEventListener('ritos-ajandaya-git', f);
  }, []);

  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < NARROW_BREAKPOINT); }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const home = <HomeEkrani onDanismanlik={(k) => { setDanismanlik(k); if (isNarrow) return; setSekme('home'); }} onGelisim={() => setSekme('gelisim')} onSohbet={() => setSekme('sohbet')} />;
  const danEkrani = (dar: boolean) => danismanlik && (
    <DanismanlikEkrani
      disiplin={danismanlik}
      dar={dar}
      onKapat={() => setDanismanlik(null)}
      onAjanda={() => { setDanismanlik(null); setSekme('ajanda'); }}
      onSinavPaketi={sinav.kurulu ? () => setActiveTool('sinav') : undefined}
    />
  );
  const danOverlay = isNarrow && danismanlik && (
    <div className="tool-overlay">
      <div className="tool-topbar">
        <button className="tool-back" onClick={() => setDanismanlik(null)}>‹ Geri</button>
        <b>{DISIPLIN_IKON[danismanlik] ?? '🤝'} {danismanlikBaslik(danismanlik)}</b>
      </div>
      <div className="tool-body"><div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>{danEkrani(true)}</div></div>
    </div>
  );
  const sohbet = useSohbetOzeti();
  const kurtarma = useKurtarmaHatirlat();
  const rozet = (k: Sekme) => (
    k === 'sohbet' && sohbet.toplam + sohbet.davet > 0 ? <i className="rt-sekme-rozet">{sohbet.toplam + sohbet.davet}</i>
      : k === 'ayarlar' && kurtarma ? <i className="rt-sekme-rozet nokta" aria-label="Hesabını güvenceye al" />
      : null
  );
  const sagSekme = (s: Sekme) => (
    s === 'gelisim' ? <Kutuphane />
      : s === 'sohbet' ? <SohbetEkrani />
      : s === 'ayarlar' ? <AyarlarPane />
      : home
  );
  const arac = activeTool && (
    <div className="tool-overlay">
      <div className="tool-topbar">
        <button className="tool-back" onClick={() => setActiveTool(null)}>‹ Geri</button>
        <b>{TOOL_META[activeTool].icon} {TOOL_META[activeTool].title}</b>
      </div>
      <div className="tool-body"><SinavTool /></div>
    </div>
  );

  return (
    <div className="shell">
      <DavetKarsilama />
      {isNarrow ? (
        <div className="mobile-app">
          <div className="mobile-hd"><b>Ritos</b><SenkronIsareti /></div>
          <div className="mobile-main">{sekme === 'ajanda' ? <AjandaPane /> : sagSekme(sekme)}</div>
          <div className="mobile-nav">
            {([['home', '🏠', 'Home'], ['ajanda', '📅', 'Ajanda'], ['gelisim', '📚', 'Kütüphane'], ['sohbet', '💬', 'Sohbet'], ['ayarlar', '⚙️', 'Ayarlar']] as [Sekme, string, string][]).map(([k, ic, ad]) => (
              <button key={k} className={sekme === k ? 'on' : ''} onClick={() => setSekme(k)}><span className="ic">{ic}{rozet(k)}</span>{ad}</button>
            ))}
          </div>
          {danOverlay}
          {arac}
        </div>
      ) : (
        <>
          <div className="topbar"><b>Ritos</b><SenkronIsareti /></div>
          <SplitPane
            ratio={ratio}
            setRatio={setRatio}
            left={<AjandaPane />}
            right={(
              <>
                <div className="side-content">{danismanlik && (sekme === 'home' || sekme === 'ajanda') ? danEkrani(false) : sagSekme(sekme === 'ajanda' ? 'home' : sekme)}</div>
                <div className="side-tabs">
                  {([['home', '🏠', 'Home'], ['gelisim', '📚', 'Kütüphane'], ['sohbet', '💬', 'Sohbet'], ['ayarlar', '⚙️', 'Ayarlar']] as [Sekme, string, string][]).map(([k, ic, ad]) => (
                    <button key={k} className={(sekme === 'ajanda' ? 'home' : sekme) === k ? 'on' : ''} onClick={() => { if (k === 'home') setDanismanlik(null); setSekme(k); }}><span>{ic}{rozet(k)}</span>{ad}</button>
                  ))}
                </div>
              </>
            )}
          />
          {arac}
        </>
      )}
    </div>
  );
}

// ———————————————————————————————————— yeniden kullanılabilir sürüklenebilir iki-panel ————————————————————————————————————

function SplitPane({
  left, right, ratio, setRatio, min = 25, max = 75,
}: {
  left: ReactNode; right: ReactNode; ratio: number; setRatio: (n: number) => void; min?: number; max?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    // Pointer olayları: fare + dokunmatik (iPad) + kalem aynı yoldan (28 eylül).
    function onMove(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let pct = ((e.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(min, Math.min(max, pct));
      setRatio(pct);
    }
    function onUp() { setDragging(false); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, min, max, setRatio]);

  return (
    <div className="split" ref={containerRef}>
      <div className="split-main" style={{ width: ratio + '%' }}>{left}</div>
      <div className={`split-divider${dragging ? ' dragging' : ''}`} onPointerDown={(e) => { e.preventDefault(); setDragging(true); }} />
      <div className="split-side" style={{ width: 100 - ratio + '%' }}>{right}</div>
    </div>
  );
}

// ———————————————————————————————————— Home (V1: bizim tasarladığımız sabit düzen) ————————————————————————————————————

function HomeEkrani({ onDanismanlik, onGelisim, onSohbet }: { onDanismanlik: (disiplin: string) => void; onGelisim: () => void; onSohbet: () => void }) {
  const sohbet = useSohbetOzeti();
  const [widgetEkle, setWidgetEkle] = useState(false);
  return (
    <div className="fixed-widgets">
      <NotlarWidget />
      <BaglantiWidgetlari ekleAcik={widgetEkle} onEkleKapat={() => setWidgetEkle(false)} />
      {/* 30 eylül: alanlar V1'de yok (ileride üst klasörler alanlara karşılık gelebilir). */}
      {V2 && <OdakAlanlari onAc={onGelisim} />}
      <KoclarimSatiri />
      <OlcumlerSatiri />
      {(sohbet.toplam > 0 || sohbet.davet > 0) && (
        <button type="button" className="wrow tool" onClick={onSohbet}>
          <span className="ic">💬</span>
          <span className="tx"><span className="t">Sohbet</span><span className="s">{[sohbet.davet ? `${sohbet.davet} davet` : '', sohbet.toplam ? `${sohbet.toplam} okunmamış mesaj` : ''].filter(Boolean).join(' · ')}</span></span>
          <span className="chev">›</span>
        </button>
      )}
      {/* Danışmanlık — tek kapı (28 eylül): her alan bir widget, ＋ ile yeni alan. */}
      <DanismanlikSatiri onAc={onDanismanlik} />
      <button type="button" className="rt-widget-ekle" onClick={() => setWidgetEkle(true)}>＋ Bağlantı widget&apos;ı ekle</button>
    </div>
  );
}


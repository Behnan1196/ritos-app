'use client';

// ————————————————————————————————————————————————————————————————
// Ritos — uygulama kabuğu (27 eylül, V1 sadelik).
//  • Hesap zorunlu: hesap açık değilse giriş ekranı (hesapsız kullanım kaldırıldı).
//  • Home'u biz tasarlarız: Odak alanları, (varsa) koçun, Danışmanlık ve Sınav (koç).
//    Kullanıcının widget ızgarası V2 — kod app/ritos/v2/SeninAlanin.tsx'te kapalı durur.
//  • 3 ekim: alt menü Home · Günüm · Atölye · Ayarlar. Sohbet yok (📥 Gelenler Home'da);
//    Kütüphane Atölye'nin içinde.
//  • Geniş ekranda: üstte Günüm | Atölye. Günüm'de ajanda solda, sağda Home/Ayarlar;
//    Atölye tam genişlik. Dar ekranda alt sekme çubuğu.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import AjandaPane from './ritos/AjandaPane';
import { useBeklemeIzleyici, useSayacIzleyici } from '@/lib/sayac';
import { BaglantiWidgetlari } from './ritos/Baglanti';
import { OrtakListeWidget } from './ritos/OrtakListe';
import { useBildirimPlani } from '@/lib/bildirim';
import { useDisKartlar } from '@/lib/disKart';
import { OdakAlanlari } from './ritos/KisiselGelisim';
import Atolye from './ritos/Atolye';
import { V2 } from '@/lib/surum';
import { SinavTool, useSinavOzeti } from './ritos/Sinav';
import { DavetKarsilama, KoclarimSatiri } from './ritos/Danismanlik';
import { DanismanlikEkrani, DanismanlikSatiri, danismanlikBaslik, DISIPLIN_IKON } from './ritos/DanismanlikEkrani';
import { SenkronIsareti, useGelenSenkron } from './ritos/Paylasim';
import { GelenlerEkrani, useGelenlerOzeti } from './ritos/Sohbet';
import { OlcumlerSatiri } from './ritos/Olcum';
import { NotlarWidget } from './ritos/Notlar';
import { AyarlarPane, GirisEkrani, SifreSifirlaEkrani, useKurtarmaHatirlat } from './ritos/Hesap';
import { useHesapBaslat, useOturum } from '@/lib/hesap';
import { useDanismanlik } from '@/lib/danismanlik';

const NARROW_BREAKPOINT = 760;
// Testte (NEXT_PUBLIC_RITOS_TEST=1 ile derlenmiş sürüm) giriş kapısı atlanır; gerçek sürümde yok.
const TEST = process.env.NEXT_PUBLIC_RITOS_TEST === '1';

type ToolId = 'sinav';
type Sekme = 'home' | 'gunum' | 'atolye' | 'ayarlar' | 'gelenler';
type Sag = 'home' | 'ayarlar' | 'gelenler'; // geniş ekranda Ajandam'ın yanındaki bölme

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
  useDisKartlar(); // dış uygulamaların kartları (cat_dis_kart)
  useBildirimPlani(); // 🔔 ayarlı kartların bildirimlerini kuyruğa yazar
  useGelenSenkron();
  const [isNarrow, setIsNarrow] = useState(false);
  const [ratio, setRatio] = useState(58);
  const [sekme, setSekme] = useState<Sekme>('gunum');
  const [sag, setSag] = useState<Sag>('home');
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  // Açık danışmanlık alanı: geniş ekranda sağ bölmede, telefonda tam ekran (28 eylül).
  const [danismanlik, setDanismanlik] = useState<string | null>(null);
  const sinav = useSinavOzeti();

  // Başka ekrandan "Ajanda'ya git" (ör. Kişisel Gelişim › Planla): telefonda Ajanda sekmesine geçilir;
  // geniş ekranda Ajanda zaten solda.
  useEffect(() => {
    const f = () => setSekme('gunum');
    // Atölye'ye git (ör. Ayarlar › Aile › Görev ver, Danışmanlık › Atölye'de planla): hedef önceden seçilir.
    const a = () => { setDanismanlik(null); setSekme('atolye'); };
    window.addEventListener('ritos-ajandaya-git', f);
    window.addEventListener('ritos-atolyeye-git', a);
    return () => { window.removeEventListener('ritos-ajandaya-git', f); window.removeEventListener('ritos-atolyeye-git', a); };
  }, []);

  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < NARROW_BREAKPOINT); }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const gelenlereGit = () => { if (isNarrow) setSekme('gelenler'); else setSag('gelenler'); };
  const homeyaDon = () => { if (isNarrow) setSekme('home'); else setSag('home'); };
  const home = <HomeEkrani onDanismanlik={(k) => { setDanismanlik(k); if (!isNarrow) setSag('home'); }} onGelenler={gelenlereGit} />;
  const danEkrani = (dar: boolean) => danismanlik && (
    <DanismanlikEkrani
      disiplin={danismanlik}
      dar={dar}
      onKapat={() => setDanismanlik(null)}
      onAjanda={() => { setDanismanlik(null); setSekme('atolye'); }}
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
  const gelenler = useGelenlerOzeti();
  const kurtarma = useKurtarmaHatirlat();
  const rozet = (k: Sekme) => (
    k === 'home' && gelenler.toplam > 0 ? <i className="rt-sekme-rozet">{gelenler.toplam}</i>
      : k === 'ayarlar' && kurtarma ? <i className="rt-sekme-rozet nokta" aria-label="Hesabını güvenceye al" />
      : null
  );
  const sagSekme = (s: Sekme) => (
    s === 'gelenler' ? <GelenlerEkrani onGeri={homeyaDon} />
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

  // Geniş ekran sekmeleri (4 ekim, B): Home · Atölye · Ayarlar sağ altta. Atölye seçilince ekranı kaplar.
  const genisSekme: Sag | 'atolye' = sekme === 'atolye' ? 'atolye' : sag === 'gelenler' ? 'home' : sag;
  const sekmeler = (
    <div className="side-tabs">
      {([['home', '🏠', 'Home'], ['atolye', '🗂', 'Atölye'], ['ayarlar', '⚙️', 'Ayarlar']] as [Sag | 'atolye', string, string][]).map(([k, ic, ad]) => (
        <button key={k} className={genisSekme === k ? 'on' : ''} onClick={() => {
          if (k === 'atolye') { setSekme('atolye'); return; }
          if (k === 'home') setDanismanlik(null);
          setSekme('gunum'); setSag(k);
        }}><span>{ic}{k !== 'atolye' && rozet(k)}</span>{ad}</button>
      ))}
    </div>
  );

  return (
    <div className="shell">
      <DavetKarsilama />
      {isNarrow ? (
        <div className="mobile-app">
          <div className="mobile-hd"><b>Ritos</b><SenkronIsareti /></div>
          <div className="mobile-main">{sekme === 'gunum' ? <AjandaPane /> : sekme === 'atolye' ? <Atolye genis={false} /> : sagSekme(sekme)}</div>
          <div className="mobile-nav">
            {([['home', '🏠', 'Home'], ['gunum', '📅', 'Ajandam'], ['atolye', '🗂', 'Atölye'], ['ayarlar', '⚙️', 'Ayarlar']] as [Sekme, string, string][]).map(([k, ic, ad]) => (
              <button key={k} className={(sekme === 'gelenler' ? 'home' : sekme) === k ? 'on' : ''} onClick={() => setSekme(k)}><span className="ic">{ic}{rozet(k)}</span>{ad}</button>
            ))}
          </div>
          {danOverlay}
          {arac}
        </div>
      ) : (
        <>
          <div className="topbar"><b>Ritos</b><SenkronIsareti /></div>
          {sekme === 'atolye' ? (
            <>
              {/* Atölye geniş ekranda tüm alanı kaplar; sekmeler aynı yerde (sağ altta) kalır. */}
              <div className="rt-atolye-tam"><Atolye genis /></div>
              <div className="rt-tam-sekmeler"><span style={{ width: ratio + '%' }} />{sekmeler}</div>
            </>
          ) : (
            <SplitPane
              ratio={ratio}
              setRatio={setRatio}
              left={<AjandaPane />}
              right={(
                <>
                  <div className="side-content">{danismanlik && sag === 'home' ? danEkrani(false) : sagSekme(sag)}</div>
                  {sekmeler}
                </>
              )}
            />
          )}
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

function HomeEkrani({ onDanismanlik, onGelenler }: { onDanismanlik: (disiplin: string) => void; onGelenler: () => void }) {
  const gelenler = useGelenlerOzeti();
  const [widgetEkle, setWidgetEkle] = useState(false);
  return (
    <div className="fixed-widgets">
      <NotlarWidget />
      <OrtakListeWidget />
      <BaglantiWidgetlari ekleAcik={widgetEkle} onEkleKapat={() => setWidgetEkle(false)} />
      {/* 30 eylül: alanlar V1'de yok (ileride üst klasörler alanlara karşılık gelebilir). */}
      {V2 && <OdakAlanlari onAc={() => window.dispatchEvent(new Event('ritos-atolyeye-git'))} />}
      <KoclarimSatiri />
      <OlcumlerSatiri />
      {gelenler.toplam > 0 && (
        <button type="button" className="wrow tool" onClick={onGelenler}>
          <span className="ic">📥</span>
          <span className="tx"><span className="t">Gelenler</span><span className="s">{[gelenler.davet ? `${gelenler.davet} davet` : '', gelenler.paylasim ? `${gelenler.paylasim} yeni paylaşım` : ''].filter(Boolean).join(' · ')}</span></span>
          <span className="chev">›</span>
        </button>
      )}
      {/* Danışmanlık — tek kapı (28 eylül): her alan bir widget, ＋ ile yeni alan. */}
      <DanismanlikSatiri onAc={onDanismanlik} />
      <button type="button" className="rt-widget-ekle" onClick={() => setWidgetEkle(true)}>＋ Bağlantı widget&apos;ı ekle</button>
    </div>
  );
}


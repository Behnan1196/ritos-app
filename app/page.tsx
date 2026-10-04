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
import { DavetKarsilama, KoclarimSatiri } from './ritos/Danismanlik';
import { SenkronIsareti, useGelenSenkron } from './ritos/Paylasim';
import { GelenlerEkrani, useGelenlerOzeti } from './ritos/Sohbet';
import { OlcumlerSatiri } from './ritos/Olcum';
import { NotlarWidget } from './ritos/Notlar';
import { AyarlarPane, GirisEkrani, SifreSifirlaEkrani, useKurtarmaHatirlat } from './ritos/Hesap';
import { useHesapBaslat, useOturum } from '@/lib/hesap';

const NARROW_BREAKPOINT = 760;
// Testte (NEXT_PUBLIC_RITOS_TEST=1 ile derlenmiş sürüm) giriş kapısı atlanır; gerçek sürümde yok.
const TEST = process.env.NEXT_PUBLIC_RITOS_TEST === '1';

type Sekme = 'home' | 'gunum' | 'atolye' | 'ayarlar' | 'gelenler';
type Sag = 'home' | 'atolye' | 'ayarlar' | 'gelenler'; // geniş ekranda Ajandam'ın yanındaki bölme

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

  // Başka ekrandan "Ajanda'ya git" (ör. Kişisel Gelişim › Planla): telefonda Ajanda sekmesine geçilir;
  // geniş ekranda Ajanda zaten solda.
  useEffect(() => {
    const f = () => setSekme('gunum');
    // Atölye'ye git (ör. Ayarlar › Aile › Görev ver, Danışmanlık › Atölye'de planla): hedef önceden seçilir.
    const a = () => { setSekme('atolye'); setSag('atolye'); };
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
  // 4 ekim: Home'daki Danışmanlık ekranı kalktı — davet, sonlananlar, alan açma Atölye seçicisinde;
  // şablonlar ve sınav paketi Atölye › Kütüphane'de; sonlandırma kişinin Bilgiler sekmesinde.
  const home = <HomeEkrani onGelenler={gelenlereGit} />;
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
      : s === 'atolye' ? <Atolye genis={false} />
      : home
  );
  // Geniş ekran (4 ekim): solda Ajandam, sağ bölmede Home · Atölye · Ayarlar. Atölye de telefondaki
  // düzeniyle (alt alta günler, geri tuşlu ekranlar) sağ bölmede çalışır; tam ekran kipi kaldırıldı.
  const genisSekme: Sag = sag === 'gelenler' ? 'home' : sag;
  const sekmeler = (
    <div className="side-tabs">
      {([['home', '🏠', 'Home'], ['atolye', '🗂', 'Atölye'], ['ayarlar', '⚙️', 'Ayarlar']] as [Sag, string, string][]).map(([k, ic, ad]) => (
        <button key={k} className={genisSekme === k ? 'on' : ''} onClick={() => { setSag(k); setSekme(k === 'atolye' ? 'atolye' : 'gunum'); }}><span>{ic}{rozet(k)}</span>{ad}</button>
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
                  <div className="side-content">{sagSekme(sag)}</div>
                  {sekmeler}
                </>
              )}
            />
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

function HomeEkrani({ onGelenler }: { onGelenler: () => void }) {
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
      <button type="button" className="rt-widget-ekle" onClick={() => setWidgetEkle(true)}>＋ Bağlantı widget&apos;ı ekle</button>
    </div>
  );
}


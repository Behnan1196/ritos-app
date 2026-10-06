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
import { useBildirimPlani } from '@/lib/bildirim';
import { useDisKartlar } from '@/lib/disKart';
import Atolye from './ritos/Atolye';
import { DavetKarsilama } from './ritos/Danismanlik';
import { SenkronIsareti } from './ritos/Paylasim';
import { GelenlerEkrani, useGelenlerOzeti } from './ritos/Sohbet';
import { HomeEkrani, homeEkraniAc } from './ritos/HomeEkrani';
import { CikisOnayi, GirisEkrani, HesapEkrani, KullaniciRozeti, MisafirSeridi, type HesapEkran, SifreSifirlaEkrani } from './ritos/Hesap';
import Cevrem from './ritos/Cevrem';
import { useCevremBaslat } from '@/lib/cevrem';
import { GIRIS_OLAY, girisAc, useHesapBaslat, useOturum } from '@/lib/hesap';

const NARROW_BREAKPOINT = 760;
// Testte (NEXT_PUBLIC_RITOS_TEST=1 ile derlenmiş sürüm) giriş kapısı atlanır; gerçek sürümde yok.
const TEST = process.env.NEXT_PUBLIC_RITOS_TEST === '1';

type Sekme = 'home' | 'gunum' | 'rutin' | 'atolye' | 'gelenler';
type Sag = 'home' | 'rutin' | 'atolye' | 'gelenler'; // geniş ekranda Ajandam'ın yanındaki bölme
// Alt menü (5 ekim): Ayarlar sekmesi kalktı, avatar menüsüne taşındı. Yeni sekme buraya eklenir.
// 5 ekim: Rutinlerim (kendim için: rutinler + Kütüphane) ve Çevrem (eski Atölye: danışmanlık + gruplar).
const MOBIL_SEKMELER: [Sekme, string, string][] = [['home', '🏠', 'Home'], ['gunum', '📅', 'Ajandam'], ['rutin', '🌱', 'Rutinlerim'], ['atolye', '👥', 'Çevrem']];
const GENIS_SEKMELER: [Sag, string, string][] = [['home', '🏠', 'Home'], ['rutin', '🌱', 'Rutinlerim'], ['atolye', '👥', 'Çevrem']];

export default function RitosLab() {
  const o = useOturum();
  useBeklemeIzleyici(); // yaptıktan sonra bekleme dolunca uyarı
  useSayacIzleyici(); // kart sayaçları: hedef süre dolunca uyarı (hangi sekmede olunursa olunsun)
  const [sifirla, setSifirla] = useState(false);
  // 7 ekim: hesapsız kullanım — giriş ekranı ilk ekran değil; hesap isteyen yerden ya da davet bağlantısıyla açılır.
  const [girisAcik, setGirisAcik] = useState(false);
  useEffect(() => {
    try {
      const u = new URL(location.href);
      setSifirla(u.searchParams.has('sifirla'));
      if (!o.hesapli && (u.searchParams.has('katil') || u.searchParams.has('davet'))) setGirisAcik(true);
    } catch { /* yoksay */ }
    const f = () => setGirisAcik(true);
    window.addEventListener(GIRIS_OLAY, f);
    return () => window.removeEventListener(GIRIS_OLAY, f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!o.hazir) return <div className="rt-kilit-bos" />;
  if (sifirla) return o.session ? <SifreSifirlaEkrani /> : <GirisEkrani />;
  if (o.hesapli && !TEST && o.kilitli) return <GirisEkrani yeniden />;
  if (girisAcik && !o.hesapli) return <GirisEkrani onVazgec={() => setGirisAcik(false)} />;
  return <RitosUygulama />;
}

function RitosUygulama() {
  useHesapBaslat();
  useDisKartlar(); // dış uygulamaların kartları (cat_dis_kart)
  useBildirimPlani(); // 🔔 ayarlı kartların bildirimlerini kuyruğa yazar
  useCevremBaslat(); // Çevrem (7 ekim): gruplar, listeler, ortak işler — Realtime
  const [isNarrow, setIsNarrow] = useState(false);
  const [ratio, setRatio] = useState(58);
  const [sekme, setSekme] = useState<Sekme>('gunum');
  const [sag, setSag] = useState<Sag>('home');

  // Başka ekrandan "Ajanda'ya git" (ör. Kişisel Gelişim › Planla): telefonda Ajanda sekmesine geçilir;
  // geniş ekranda Ajanda zaten solda.
  useEffect(() => {
    const f = () => setSekme('gunum');
    // Atölye'ye git (ör. Ayarlar › Aile › Görev ver, Danışmanlık › Atölye'de planla): hedef önceden seçilir.
    const a = () => { setHesap(null); setSekme('atolye'); setSag('atolye'); };
    // 7 ekim: danışmanlık Home'da — "Atölye'de planla" artık Home › Danışanlarım'ı açar.
    const d = () => { homeEkraniAc('danisanlar'); setHesap(null); setSekme('home'); setSag('home'); };
    const r = () => { setHesap(null); setSekme('rutin'); setSag('rutin'); };
    window.addEventListener('ritos-ajandaya-git', f);
    window.addEventListener('ritos-atolyeye-git', d);
    window.addEventListener('ritos-rutinlere-git', r);
    try { if (new URL(location.href).searchParams.has('katil')) a(); } catch { /* yoksay */ } // davet bağlantısı → Çevrem
    return () => { window.removeEventListener('ritos-ajandaya-git', f); window.removeEventListener('ritos-atolyeye-git', d); window.removeEventListener('ritos-rutinlere-git', r); };
  }, []);

  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < NARROW_BREAKPOINT); }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const homeyaDon = () => { if (isNarrow) setSekme('home'); else setSag('home'); };
  // Avatar menüsünden açılan hesap ekranları (Profil · Bildirimler · Ayarlar): telefonda ana alanda,
  // geniş ekranda sağ bölmede; bir sekmeye dokununca kapanır.
  const [hesap, setHesap] = useState<HesapEkran | null>(null);
  const [cikis, setCikis] = useState(false);
  const menuSec = (e: HesapEkran | 'cikis') => { if (e === 'cikis') setCikis(true); else setHesap(e); };
  // 4 ekim: Home'daki Danışmanlık ekranı kalktı — davet, sonlananlar, alan açma Atölye seçicisinde;
  // şablonlar ve sınav paketi Atölye › Kütüphane'de; sonlandırma kişinin Bilgiler sekmesinde.
  const home = <HomeEkrani />;
  const gelenler = useGelenlerOzeti();
  const kurtarma = false; // 7 ekim: kurtarma kelimeleri kalktı — avatar noktası şimdilik kullanılmıyor
  const rozet = (k: Sekme) => (
    k === 'home' && gelenler.toplam > 0 ? <i className="rt-sekme-rozet">{gelenler.toplam}</i>
      : null
  );
  // Üst köşe (5 ekim): hangi hesapta olduğun her an görünür; dokununca hesap menüsü.
  const o = useOturum();
  const ustSag = (
    <div className="rt-ust-sag">
      <SenkronIsareti />
      {o.hesapli ? <KullaniciRozeti onSec={menuSec} uyari={kurtarma} /> : <button type="button" className="rt-giris-dugme" onClick={girisAc}>Giriş · Hesap aç</button>}
    </div>
  );
  const hesapEkrani = hesap && <HesapEkrani ekran={hesap} onGeri={() => setHesap(null)} />;
  const sagSekme = (s: Sekme) => (
    s === 'gelenler' ? <GelenlerEkrani onGeri={homeyaDon} />
      : s === 'atolye' ? <Cevrem />
      : s === 'rutin' ? <Atolye key="kendim" genis={false} kapsam="kendim" />
      : home
  );
  // Geniş ekran (4 ekim): solda Ajandam, sağ bölmede Home · Atölye (5 ekim: Ayarlar avatar menüsünde). Atölye de telefondaki
  // düzeniyle (alt alta günler, geri tuşlu ekranlar) sağ bölmede çalışır; tam ekran kipi kaldırıldı.
  const genisSekme: Sag = sag === 'gelenler' ? 'home' : sag;
  const sekmeler = (
    <div className="side-tabs">
      {GENIS_SEKMELER.map(([k, ic, ad]) => (
        <button key={k} className={!hesap && genisSekme === k ? 'on' : ''} onClick={() => { setHesap(null); setSag(k); setSekme(k === 'home' ? 'gunum' : k); }}><span>{ic}{rozet(k)}</span>{ad}</button>
      ))}
    </div>
  );

  return (
    <div className="shell">
      <DavetKarsilama />
      {cikis && <CikisOnayi onKapat={() => setCikis(false)} />}
      {isNarrow ? (
        <div className="mobile-app">
          <div className="mobile-hd"><b>Ritos</b>{ustSag}</div>
          {!o.hesapli && <MisafirSeridi />}
          <div className="mobile-main">{hesapEkrani || (sekme === 'gunum' ? <AjandaPane /> : sagSekme(sekme))}</div>
          <div className="mobile-nav">
            {MOBIL_SEKMELER.map(([k, ic, ad]) => (
              <button key={k} className={!hesap && (sekme === 'gelenler' ? 'home' : sekme) === k ? 'on' : ''} onClick={() => { setHesap(null); setSekme(k); }}><span className="ic">{ic}{rozet(k)}</span>{ad}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="topbar"><b>Ritos</b>{ustSag}</div>
          {!o.hesapli && <MisafirSeridi />}
          <SplitPane
              ratio={ratio}
              setRatio={setRatio}
              left={<AjandaPane />}
              right={(
                <>
                  <div className="side-content">{hesapEkrani || sagSekme(sag)}</div>
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


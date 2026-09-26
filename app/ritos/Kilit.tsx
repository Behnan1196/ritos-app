'use client';

// Cihaz kilidi (G10) arayüzü: açılış kapısı, PIN tuş takımı, Ayarlar bölümü.

import React, { useEffect, useState, type ReactNode } from 'react';
import { aktifHesap } from '@/lib/db';
import { KILIT_GECIS, baskasiIcinHazirla, baskasiIcinVazgec, geciciHesap, hesapSifresiDogru } from '@/lib/hesap';
import { HesapModal } from './Paylasim';
import { PIN_UZUNLUK, kilitAcik, kilitDegisince, kilitDurumuYukle, kilitle, pinDogrula, pinVar } from '@/lib/kilit';
import { pinDegistir, pinKaldir, pinKoy, pinUnuttumOzelAlaniSil } from '@/lib/ozelAlan';
import { Kap, Modal } from './ortak';

const OTOMATIK_KILIT_MS = 5 * 60_000;

/** Bu hesaba cihaz kilidi uygulanır mı? ("Bu cihaz benim değil" hesabına uygulanmaz.) */
function kilitUygulanir() {
  const aktif = aktifHesap();
  return !(aktif && geciciHesap() === aktif);
}

export function KilitKapisi({ children }: { children: ReactNode }) {
  const [durum, setDurum] = useState<'yukleniyor' | 'kilitli' | 'acik'>('yukleniyor');

  useEffect(() => {
    (async () => {
      const d = await kilitDurumuYukle();
      if (!d.pinVar || d.acik || !kilitUygulanir()) return setDurum('acik');
      const aktif = aktifHesap();
      // Bilerek yapılan hesap geçişinden hemen sonra (hesaba giriş) PIN'i yeniden sorma.
      try {
        if (aktif && sessionStorage.getItem(KILIT_GECIS) === aktif) {
          sessionStorage.removeItem(KILIT_GECIS);
          return setDurum('acik');
        }
      } catch { /* yoksay */ }
      setDurum('kilitli');
    })();
    const kapat = kilitDegisince(() => setDurum(kilitAcik() || !kilitUygulanir() ? 'acik' : 'kilitli'));
    let gizlendi = 0;
    const gorunurluk = () => {
      if (document.visibilityState === 'hidden') gizlendi = Date.now();
      else if (gizlendi && Date.now() - gizlendi > OTOMATIK_KILIT_MS && pinVar() && kilitUygulanir()) { kilitle(); setDurum('kilitli'); }
    };
    document.addEventListener('visibilitychange', gorunurluk);
    return () => { kapat(); document.removeEventListener('visibilitychange', gorunurluk); };
  }, []);

  if (durum === 'yukleniyor') return <div className="rt-kilit-bos" />;
  if (durum === 'kilitli') return <KilitEkrani onAcildi={() => setDurum('acik')} />;
  return <>{children}</>;
}

function KilitEkrani({ onAcildi }: { onAcildi: () => void }) {
  const [unuttum, setUnuttum] = useState(false);
  const [baskasi, setBaskasi] = useState(false);
  return (
    <div className="rt-kilit">
      <div className="rt-kilit-kutu">
        <b className="rt-kilit-baslik">Ritos</b>
        <p className="rt-muted">Devam etmek için PIN&apos;ini gir.</p>
        <PinGir onGirildi={async (pin) => { const r = await pinDogrula(pin); if (r.tamam) onAcildi(); return r.tamam ? null : r.hata; }} />
        <button type="button" className="rt-linkbtn" onClick={() => setUnuttum(true)}>PIN&apos;i unuttum</button>
        <button type="button" className="rt-btn rt-baskasi" onClick={async () => { await baskasiIcinHazirla(); setBaskasi(true); }}>Başka biri kendi hesabıyla girecek</button>
      </div>
      {unuttum && <PinUnuttum onKapat={() => setUnuttum(false)} onAcildi={onAcildi} />}
      {baskasi && <HesapModal baskasi onKapat={() => { baskasiIcinVazgec(); setBaskasi(false); }} />}
    </div>
  );
}

function PinUnuttum({ onKapat, onAcildi }: { onKapat: () => void; onAcildi: () => void }) {
  const hesapli = !!aktifHesap();
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  return (
    <Modal baslik="PIN'i unuttum" onKapat={onKapat}>
      <p className="rt-metin">PIN olmadan cihazdaki özel alan (hesapsız veri) açılamaz. Onu silip kilidi kaldırabilirsin; yedek dosyan varsa sonra geri yükleyebilirsin.</p>
      {hesapli && <p className="rt-muted">Hesabın açık olduğu için önce hesabının şifresini soruyoruz. Hesabındaki veri etkilenmez.</p>}
      {hesapli && <input className="rt-inp" type="password" placeholder="Hesap şifresi" value={sifre} onChange={(e) => setSifre(e.target.value)} />}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn tehlike" disabled={bekle || (hesapli && !sifre)} onClick={async () => {
          setBekle(true); setHata(null);
          try {
            if (hesapli && !(await hesapSifresiDogru(sifre))) { setHata('Şifre hatalı.'); return; }
            await pinUnuttumOzelAlaniSil();
            onAcildi();
          } finally { setBekle(false); }
        }}>Özel alanı sil ve kilidi kaldır</button>
      </div>
    </Modal>
  );
}

/** 6 haneli PIN girişi: nokta göstergesi + tuş takımı (klavyeden de yazılabilir). */
export function PinGir({ onGirildi, etiket }: { onGirildi: (pin: string) => Promise<string | null>; etiket?: string }) {
  const [pin, setPin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);

  async function ekle(r: string) {
    if (bekle) return;
    const yeni = (pin + r).slice(0, PIN_UZUNLUK);
    setPin(yeni); setHata(null);
    if (yeni.length === PIN_UZUNLUK) {
      setBekle(true);
      const h = await onGirildi(yeni);
      setBekle(false);
      setPin('');
      if (h) setHata(h);
    }
  }
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const hedef = e.target as HTMLElement | null;
      if (hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) ekle(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });

  return (
    <div className="rt-pin">
      {etiket && <span className="rt-muted">{etiket}</span>}
      <div className="rt-pin-noktalar" aria-label={`${pin.length} / ${PIN_UZUNLUK}`}>
        {Array.from({ length: PIN_UZUNLUK }, (_, i) => <span key={i} className={i < pin.length ? 'dolu' : ''} />)}
      </div>
      {bekle ? <p className="rt-muted">Kontrol ediliyor…</p> : hata ? <p className="rt-hata">{hata}</p> : <p className="rt-muted">&nbsp;</p>}
      <div className="rt-pin-tuslar">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((t, i) =>
          t === '' ? <span key={i} /> : (
            <button key={i} type="button" className="rt-pin-tus" aria-label={t === '⌫' ? 'Sil' : t}
              onClick={() => (t === '⌫' ? setPin((p) => p.slice(0, -1)) : ekle(t))}>{t}</button>
          ))}
      </div>
    </div>
  );
}

/** Yeni PIN'i iki kez aldıran akış. */
function YeniPin({ onTamam }: { onTamam: (pin: string) => Promise<string | null> }) {
  const [ilk, setIlk] = useState<string | null>(null);
  return ilk === null
    ? <PinGir key="1" etiket={`Yeni ${PIN_UZUNLUK} haneli PIN`} onGirildi={async (p) => { setIlk(p); return null; }} />
    : <PinGir key="2" etiket="Aynı PIN'i tekrar gir" onGirildi={async (p) => { if (p !== ilk) { setIlk(null); return 'PIN\'ler aynı değil, baştan gir.'; } return onTamam(p); }} />;
}

export function KilitAyarlari() {
  const [var_, setVar] = useState(pinVar());
  const [modal, setModal] = useState<null | 'koy' | 'degistir' | 'kaldir'>(null);
  const [eski, setEski] = useState<string | null>(null);
  useEffect(() => kilitDegisince(() => setVar(pinVar())), []);
  const kapat = () => { setModal(null); setEski(null); };

  return (
    <Kap baslik="Cihaz kilidi">
      <p className="rt-muted">
        {var_
          ? 'Ritos açılırken ve 5 dakikadan uzun arka planda kaldıktan sonra PIN sorulur. Cihazdaki özel alan (hesapsız veri) bu PIN\'le şifreli. Telefonu başkasına vereceksen üstteki 🔒 ile kilitle; kilit ekranındaki "Başka biri kendi hesabıyla girecek" ile o kişi kendi hesabına girer, çıkınca her şey kilitli haline döner.'
          : 'PIN koyarsan Ritos açılırken sorulur ve cihazdaki özel alan (hesapsız veri) bu PIN\'le şifrelenir. Telefonunu başkasına verdiğinde verin görünmez.'}
      </p>
      <div className="rt-satir">
        {var_ ? (
          <>
            <button type="button" className="rt-btn" onClick={() => kilitle()}>Şimdi kilitle</button>
            <button type="button" className="rt-btn" onClick={() => setModal('degistir')}>PIN değiştir</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setModal('kaldir')}>Kilidi kaldır</button>
          </>
        ) : <button type="button" className="rt-btn primary" onClick={() => setModal('koy')}>PIN koy</button>}
      </div>

      {modal === 'koy' && (
        <Modal baslik="PIN koy" onKapat={kapat}>
          <YeniPin onTamam={async (p) => { await pinKoy(p); kapat(); return null; }} />
          <p className="rt-muted">PIN&apos;i unutursan özel alandaki veri yalnızca yedek dosyasından geri gelir.</p>
        </Modal>
      )}
      {modal === 'degistir' && (
        <Modal baslik="PIN değiştir" onKapat={kapat}>
          {eski === null
            ? <PinGir etiket="Mevcut PIN" onGirildi={async (p) => { const r = await pinDogrula(p); if (!r.tamam) return r.hata; setEski(p); return null; }} />
            : <YeniPin onTamam={async (p) => { try { await pinDegistir(eski, p); kapat(); return null; } catch (e) { return (e as Error).message; } }} />}
        </Modal>
      )}
      {modal === 'kaldir' && (
        <Modal baslik="Kilidi kaldır" onKapat={kapat}>
          <p className="rt-muted">Kilit kalkınca özel alan şifresiz saklanır.</p>
          <PinGir etiket="Mevcut PIN" onGirildi={async (p) => { try { await pinKaldir(p); kapat(); return null; } catch (e) { return (e as Error).message; } }} />
        </Modal>
      )}
    </Kap>
  );
}

/** Başlıkta: PIN varsa tek dokunuşla kilitle (telefonu başkasına vermeden önce). */
export function KilitDugmesi() {
  const [var_, setVar] = useState(false);
  useEffect(() => { setVar(pinVar() && kilitUygulanir()); return kilitDegisince(() => setVar(pinVar() && kilitUygulanir())); }, []);
  if (!var_) return null;
  return <button type="button" className="rt-kilit-dugme" aria-label="Kilitle" title="Kilitle" onClick={() => kilitle()}>🔒</button>;
}

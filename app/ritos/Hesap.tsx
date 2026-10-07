'use client';

// Hesap ekranları: karşılama, e-postayla devam (kod), Profil, Ayarlar. 8 ekim — şifre yok; arayüzde "hesap"
// kelimesi geçmez: kişi e-postasını bağlar, verisi sessizce yedeklenir.

import { BildirimAyarlari } from './BildirimAyar';
import React, { useEffect, useState } from 'react';
import { cikisYap, girisAc, gorunenAdDegistir, kodDogrula, kodGonder, useOturum, yerelAd, yerelAdKaydet } from '@/lib/hesap';
import { senkronla, useSenkronDurum } from '@/lib/senkron';
import { Kap, Modal } from './ortak';
import { PaketlerKap } from './Sinav';
import { DanismanlikAyarlari } from './Danismanlik';
import { useDanismanlik } from '@/lib/danismanlik';
import { hesabimiSil, verileriSifirla, type SifirlaSecim } from '@/lib/sifirla';

// ———————————————— giriş kapısı ————————————————

const EPOSTA = /\S+@\S+\.\S+/;

/** E-postayla devam: önce e-posta, sonra gelen kod. Modal içinde ya da tam ekranda kullanılır. */
function KodAdimlari({ ilkMetin }: { ilkMetin?: React.ReactNode }) {
  const [adim, setAdim] = useState<'eposta' | 'kod'>('eposta');
  const [eposta, setEposta] = useState('');
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [sure, setSure] = useState(0);
  useEffect(() => { if (sure <= 0) return; const t = setTimeout(() => setSure(sure - 1), 1000); return () => clearTimeout(t); }, [sure]);
  const gonder = async () => {
    setBekle(true); setHata(null);
    const r = await kodGonder(eposta);
    setBekle(false);
    if (!r.tamam) { setHata(r.hata); return; }
    setAdim('kod'); setKod(''); setSure(30);
  };
  const dogrula = async (k = kod) => {
    setBekle(true); setHata(null);
    const r = await kodDogrula(eposta, k);
    if (!r.tamam) { setHata(r.hata); setBekle(false); }
  };
  if (adim === 'eposta') return (
    <>
      {ilkMetin ?? <p className="rt-metin">E-postanı yaz, sana bir kod gönderelim.</p>}
      <input className="rt-inp" type="email" inputMode="email" placeholder="E-posta adresin" autoComplete="email" autoFocus value={eposta}
        onChange={(e) => setEposta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && EPOSTA.test(eposta) && !bekle) void gonder(); }} />
      {hata && <p className="rt-hata">{hata}</p>}
      <button type="button" className="rt-btn primary rt-genis" disabled={!EPOSTA.test(eposta) || bekle} onClick={gonder}>{bekle ? 'Gönderiliyor…' : 'Kod gönder'}</button>
    </>
  );
  return (
    <>
      <p className="rt-metin"><b>{eposta}</b> adresine bir kod gönderdik. Kodu buraya yaz.</p>
      <input className="rt-inp rt-kod-inp" inputMode="numeric" autoComplete="one-time-code" placeholder="Kod" autoFocus maxLength={10} value={kod}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setKod(v); if (v.length >= 6 && v.length <= 8 && !bekle && e.nativeEvent instanceof InputEvent && (e.nativeEvent.inputType === 'insertFromPaste' || e.nativeEvent.inputType === 'insertReplacementText')) void dogrula(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && kod.length >= 6 && !bekle) void dogrula(); }} />
      {hata && <p className="rt-hata">{hata}</p>}
      <button type="button" className="rt-btn primary rt-genis" disabled={kod.length < 6 || bekle} onClick={() => dogrula()}>{bekle ? 'Bekle…' : 'Devam'}</button>
      <div className="rt-satir rt-kod-alt">
        <button type="button" className="rt-linkbtn" onClick={() => { setAdim('eposta'); setHata(null); }}>‹ E-postayı değiştir</button>
        <button type="button" className="rt-linkbtn" disabled={sure > 0 || bekle} onClick={gonder}>{sure > 0 ? `Yeniden gönder (${sure})` : 'Yeniden gönder'}</button>
      </div>
      <p className="rt-muted kucuk">Gelmediyse istenmeyen (spam) klasörüne de bak.</p>
    </>
  );
}

/** Hesapsızken kimlik isteyen bir yerden açılır (Gruplar, Paylaş, davet bağlantısı, "Daha önce kullandım"). */
export function KodGirisModal({ onKapat, baslik = 'E-postanla devam et', metin }: { onKapat: () => void; baslik?: string; metin?: React.ReactNode }) {
  return <Modal baslik={baslik} onKapat={onKapat}><div className="rt-kod-kutu"><KodAdimlari ilkMetin={metin} /></div></Modal>;
}

/** Bu cihaz birine bağlıyken oturum kapanmışsa (nadir): tam ekran, yeniden kod. */
export function GirisEkrani() {
  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu">
        <div className="rt-giris-logo">Ritos</div>
        <KodAdimlari ilkMetin={<p className="rt-metin">Devam etmek için e-postanı yaz, sana bir kod gönderelim. Her şeyin yerinde.</p>} />
      </div>
    </div>
  );
}

/** İlk açılış: adını sor, başla. Daha önce kullanan e-postasıyla döner. */
export const KARSILAMA_ANAHTAR = 'ritos-karsilandi';
export function Karsilama({ onBasla, onDaha }: { onBasla: () => void; onDaha: () => void }) {
  const [ad, setAd] = useState(() => yerelAd() ?? '');
  const basla = () => { yerelAdKaydet(ad); onBasla(); };
  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu rt-karsilama">
        <div className="rt-giris-logo">Ritos</div>
        <p className="rt-metin">Günlük düzenin, rutinlerin ve sevdiklerinle paylaştıkların bir arada.</p>
        <ul className="rt-karsilama-liste">
          <li><span>📅</span><div><b>Ajandam</b><small>Günün kartları; yaptıkça işaretle.</small></div></li>
          <li><span>🌱</span><div><b>Yaşam Tarzım</b><small>Alışkanlıklarını kur, hayatının dengesini gör.</small></div></li>
          <li><span>👥</span><div><b>Gruplar</b><small>Ailen ve arkadaşlarınla listeler, buluşmalar, birlikte rutinler.</small></div></li>
        </ul>
        <label className="rt-alan">Sana nasıl seslenelim?<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Adın" onKeyDown={(e) => { if (e.key === 'Enter') basla(); }} /></label>
        <button type="button" className="rt-btn primary rt-genis" onClick={basla}>Başla</button>
        <button type="button" className="rt-linkbtn rt-karsilama-daha" onClick={onDaha}>Daha önce kullandım</button>
      </div>
    </div>
  );
}

// ———————————————— Ayarlar ————————————————

function zamanFarki(ms: number) {
  const dk = Math.round((Date.now() - ms) / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.round(dk / 60);
  if (sa < 24) return `${sa} saat önce`;
  return `${Math.round(sa / 24)} gün önce`;
}

// ———————————————— 5 ekim: avatar menüsü + hesap ekranları ————————————————
// Ayarlar alt menüden kalktı; üst köşedeki avatardan açılan menüde: Profil ve hesap · Bildirimler · Ayarlar · Çıkış.
// Her biri "‹ Geri" ile dönülen bir ekran (telefonda ana alanda, geniş ekranda sağ bölmede).

export type HesapEkran = 'profil' | 'bildirim' | 'ayarlar';
export const HESAP_EKRAN_AD: Record<HesapEkran, string> = { profil: '👤 Profil', bildirim: '🔔 Bildirimler', ayarlar: '⚙️ Ayarlar' };

export function HesapEkrani({ ekran, onGeri }: { ekran: HesapEkran; onGeri: () => void }) {
  return (
    <div className="rt-hesap-ekran">
      <div className="rt-geri-bar"><button type="button" className="rt-geri-dugme" onClick={onGeri}>‹ Geri</button><span className="rt-hw-tam-ad">{HESAP_EKRAN_AD[ekran]}</span></div>
      {ekran === 'profil' ? <ProfilIcerik /> : ekran === 'bildirim' ? <BildirimAyarlari /> : <AyarlarIcerik />}
    </div>
  );
}

function ProfilIcerik() {
  const o = useOturum();
  const d = useSenkronDurum();
  const [adDuzenle, setAdDuzenle] = useState<string | null>(null);
  const [baglan, setBaglan] = useState(false);
  const uid = o.session?.user.id;
  const u = o.session?.user;
  const ad = (o.hesapli ? o.gorunenAd : yerelAd()) ?? '—';
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  const kaydet = async () => {
    if (!adDuzenle?.trim()) return;
    if (o.hesapli && uid) { await gorunenAdDegistir(uid, adDuzenle); location.reload(); }
    else { yerelAdKaydet(adDuzenle); setAdDuzenle(null); }
  };
  return (
    <>
      <Kap baslik="Profil">
        <div className="rt-profil-bas">
          <Avatar ad={ad} resim={resim} boyut={48} />
          {adDuzenle === null ? (
            <span className="tx"><span><b>{ad}</b> <button type="button" className="rt-linkbtn" onClick={() => setAdDuzenle(ad === '—' ? '' : ad)}>değiştir</button></span>{u?.email && <small>{u.email}</small>}</span>
          ) : (
            <div className="rt-satir" style={{ flexWrap: 'nowrap', flex: 1 }}>
              <input className="rt-inp" value={adDuzenle} onChange={(e) => setAdDuzenle(e.target.value)} autoFocus />
              <button type="button" className="rt-btn primary" disabled={!adDuzenle.trim()} onClick={kaydet}>Kaydet</button>
            </div>
          )}
        </div>
        {o.hesapli
          ? <p className="rt-muted">{d.hata ? <span className="rt-hata">⚠ Şu an yedeklenemiyor; internet gelince kendiliğinden devam eder.</span> : d.son ? `Her şeyin yedekte · ${zamanFarki(d.son)}` : 'Her şeyin yedekte.'}</p>
          : (
            <>
              <p className="rt-muted">E-postanı bağlarsan ailenle, arkadaşlarınla paylaşabilir, Ritos'unu başka bir telefonda ya da bilgisayarda da açabilirsin.</p>
              <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={() => setBaglan(true)}>E-postamı bağla</button></div>
            </>
          )}
      </Kap>
      {baglan && <KodGirisModal onKapat={() => setBaglan(false)} />}
    </>
  );
}

function AyarlarIcerik() {
  const o = useOturum();
  const dn = useDanismanlik();
  const [veriModal, setVeriModal] = useState<null | 'cikis' | 'sifirla' | 'sil'>(null);
  return (
    <>
      {dn.profil?.koc && <PaketlerKap />}
      <DanismanlikAyarlari />
      {o.hesapli && (
        <Kap baslik="Bu cihaz ve verilerim">
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setVeriModal('cikis')}>Bu cihazdan çık</button>
            <button type="button" className="rt-btn" onClick={() => setVeriModal('sifirla')}>Verilerimi sıfırla</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setVeriModal('sil')}>Hesabımı sil</button>
          </div>
        </Kap>
      )}
      {veriModal === 'cikis' && <CikisOnayi onKapat={() => setVeriModal(null)} />}
      {veriModal === 'sifirla' && <SifirlaModal onKapat={() => setVeriModal(null)} />}
      {veriModal === 'sil' && <HesapSilModal onKapat={() => setVeriModal(null)} />}
    </>
  );
}

/** Çıkış onayı (avatar menüsünden). */
export function CikisOnayi({ onKapat }: { onKapat: () => void }) {
  const d = useSenkronDurum();
  return <CikisModal onKapat={onKapat} bekleyen={d.bekleyen} />;
}

function CikisModal({ onKapat, bekleyen }: { onKapat: () => void; bekleyen: number }) {
  const [bekle, setBekle] = useState(false);
  return (
    <Modal baslik="Bu cihazdan çık" onKapat={onKapat}>
      <p className="rt-metin">Ritos bu cihazda boş açılır. Her şeyin yedekte; e-postanla yeniden girince geri gelir.</p>
      {bekleyen > 0 && <p className="rt-uyari">Son değişikliklerin henüz gönderilmedi. İnternete bağlıyken çıkarsan onlar da gider.</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={bekle} onClick={async () => { setBekle(true); await cikisYap(); }}>{bekle ? 'Çıkılıyor…' : 'Çık'}</button>
      </div>
    </Modal>
  );
}

// ———————————————— 5 ekim: verileri sıfırla, hesabı sil ————————————————

function SifirlaModal({ onKapat }: { onKapat: () => void }) {
  const [s, setS] = useState<SifirlaSecim>({ ajanda: true, programlar: false, kutuphane: false, baglar: false });
  const [onay, setOnay] = useState('');
  const [bekle, setBekle] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const secim = (k: keyof SifirlaSecim, ad: string, ac: string) => (
    <label className="rt-sifirla-sec">
      <input type="checkbox" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
      <span><b>{ad}</b><small>{ac}</small></span>
    </label>
  );
  const bos = !s.ajanda && !s.programlar && !s.kutuphane && !s.baglar;
  if (sonuc) return <Modal baslik="Verilerimi sıfırla" onKapat={onKapat}><p className="rt-tamam">{sonuc}</p><div className="rt-satir"><button type="button" className="rt-btn" onClick={onKapat}>Kapat</button></div></Modal>;
  return (
    <Modal baslik="Verilerimi sıfırla" onKapat={onKapat}>
      <p className="rt-metin">Seçtiklerin bu hesaptan, bütün cihazlarından silinir. Geri alınamaz.</p>
      {secim('ajanda', 'Ajandam', 'kendi kartların, işaretlerin, ölçümlerin, dış uygulama kartları')}
      {secim('programlar', 'Kişisel programlarım ve şablonlarım', 'kartlarıyla birlikte')}
      {secim('kutuphane', 'Kütüphane ve notlar', 'kartlar, klasörler, notlar, bağlantı widget\'ları')}
      {secim('baglar', 'Koçluk, danışmanlık ve aile bağları', 'bağlar bitirilir (karşı taraf "sonlandı" görür); onlardan gelen kartlar, planlar, paylaşımlar silinir')}
      {!s.baglar && s.ajanda && <p className="rt-muted">Koçundan ya da ailenden gelen kartlar kalır; bağ sürdükçe yeniden gelirler.</p>}
      <label className="rt-alan">Onay için <b>SIFIRLA</b> yaz<input className="rt-inp" value={onay} onChange={(e) => setOnay(e.target.value)} /></label>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn tehlike" disabled={bos || bekle || onay.trim().toLocaleUpperCase('tr') !== 'SIFIRLA'} onClick={async () => {
          setBekle(true); setHata(null);
          try { const n = await verileriSifirla(s); setSonuc(`${n} kayıt silindi.`); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
          setBekle(false);
        }}>{bekle ? 'Siliniyor…' : 'Sıfırla'}</button>
      </div>
    </Modal>
  );
}

function HesapSilModal({ onKapat }: { onKapat: () => void }) {
  const [onay, setOnay] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Hesabımı sil" onKapat={onKapat}>
      <p className="rt-metin">Ritos'taki bütün verilerin sunucudan ve bu cihazdan silinir. Geri alınamaz.</p>
      <p className="rt-muted">Hesabın tamamen kapanır; aynı e-postayla yeniden kayıt olursan Ritos boş başlar.</p>
      <ul className="rt-maddeler rt-muted">
        <li>Koçların, danışanların ve ailen seninle bağlarının sonlandığını görür.</li>
        <li>Kurduğun aile grubu dağılır.</li>
        <li>Diğer cihazlarındaki kopyalar bir sonraki açılışta erişilemez olur.</li>
      </ul>
      <label className="rt-alan">Onay için <b>SİL</b> yaz<input className="rt-inp" value={onay} onChange={(e) => setOnay(e.target.value)} /></label>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn tehlike" disabled={bekle || onay.trim().toLocaleUpperCase('tr') !== 'SİL'} onClick={async () => {
          setBekle(true); setHata(null);
          try { await hesabimiSil(); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); setBekle(false); }
        }}>{bekle ? 'Siliniyor…' : 'Hesabımı sil'}</button>
      </div>
    </Modal>
  );
}

// ———————————— 7 ekim: hesapsız kullanım ————————————

const BAGLAN_GIZLI = 'ritos-baglan-gizli';
/** Hesapsız birkaç gün kullanıldıktan sonra Home'da bir kez: e-postanı bağla (fayda diliyle; × ile bir daha çıkmaz). */
export function BaglanKarti() {
  const o = useOturum();
  const [goster, setGoster] = useState(false);
  const [baglan, setBaglan] = useState(false);
  useEffect(() => {
    if (o.hesapli) return;
    try {
      if (localStorage.getItem(BAGLAN_GIZLI)) return;
      const ilk = Number(localStorage.getItem(KARSILAMA_ANAHTAR) ?? 0);
      setGoster(ilk > 1 && Date.now() - ilk > 3 * 86400000);
    } catch { /* yoksay */ }
  }, [o.hesapli]);
  if (!goster || o.hesapli) return null;
  return (
    <div className="rt-baglan-kart">
      <button type="button" className="rt-misafir-x" aria-label="Kapat" onClick={() => { try { localStorage.setItem(BAGLAN_GIZLI, '1'); } catch { /* yoksay */ } setGoster(false); }}>×</button>
      <b>Ritos'unu sevdiklerinle paylaş</b>
      <p>E-postanı bağlarsan ailenle, arkadaşlarınla listeler ve buluşmalar kurabilir, Ritos'unu başka bir telefonda da açabilirsin.</p>
      <button type="button" className="rt-btn primary" onClick={() => setBaglan(true)}>E-postamı bağla</button>
      {baglan && <KodGirisModal onKapat={() => setBaglan(false)} />}
    </div>
  );
}

/** Kimlik isteyen ekranlarda (Gruplar…) hesapsızken gösterilir. */
export function HesapGerekli({ ikon, baslik, metin }: { ikon: string; baslik: string; metin: string }) {
  const [acik, setAcik] = useState(false);
  return (
    <div className="rt-cv-bos">
      <div className="resim" aria-hidden>{ikon}</div>
      <h3>{baslik}</h3>
      <p className="rt-muted">{metin}</p>
      <button type="button" className="rt-btn primary rt-genis" onClick={() => setAcik(true)}>E-postanla devam et</button>
      {acik && <KodGirisModal onKapat={() => setAcik(false)} />}
    </div>
  );
}

// ———————————— Üst köşe: avatar + ad (5 ekim) — dokununca Ayarlar ————————————
// Resim: profilde avatar_url varsa o; yoksa baş harfler.
const AVATAR_RENK = ['#5b8a72', '#7a6aa8', '#b0704a', '#4f7fa8', '#a8576a', '#8a8a3c', '#3c8a8a'];
function basHarfler(ad: string): string {
  const p = ad.trim().split(/\s+/).filter(Boolean);
  const h = p.length > 1 ? p[0][0] + p[p.length - 1][0] : (p[0] ?? '?')[0];
  return h.toLocaleUpperCase('tr-TR');
}
function renkSec(s: string): string {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_RENK[n % AVATAR_RENK.length];
}

export function Avatar({ ad, resim, boyut = 28 }: { ad: string; resim?: string | null; boyut?: number }) {
  const [bozuk, setBozuk] = useState(false);
  const st = { width: boyut, height: boyut, fontSize: Math.round(boyut * 0.4) };
  if (resim && !bozuk) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="rt-avatar" style={st} src={resim} alt="" referrerPolicy="no-referrer" onError={() => setBozuk(true)} />;
  }
  return <span className="rt-avatar" style={{ ...st, background: renkSec(ad) }} aria-hidden>{basHarfler(ad)}</span>;
}

export function KullaniciRozeti({ onSec, uyari }: { onSec: (e: HesapEkran) => void; uyari?: boolean }) {
  const o = useOturum();
  const d = useSenkronDurum();
  const [acik, setAcik] = useState(false);
  const kok = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!acik) return;
    const dis = (e: PointerEvent) => { if (kok.current && !kok.current.contains(e.target as Node)) setAcik(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcik(false); };
    document.addEventListener('pointerdown', dis);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', dis); document.removeEventListener('keydown', esc); };
  }, [acik]);
  const u = o.hesapli ? o.session?.user : null;
  const eposta = u?.email ?? '';
  const ad = (o.hesapli ? o.gorunenAd : yerelAd()) ?? (eposta ? eposta.split('@')[0] : 'Ben');
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  const sec = (e: HesapEkran) => { setAcik(false); onSec(e); };
  return (
    <div className="rt-kullanici-kok" ref={kok}>
      <button type="button" className="rt-kullanici" onClick={() => setAcik(!acik)} aria-haspopup="menu" aria-expanded={acik} aria-label={`${ad} — hesap menüsü`}>
        <span className="rt-kullanici-ad">{ad}</span>
        <span className="rt-kullanici-av">
          <Avatar ad={ad} resim={resim} />
          {uyari && <i className="rt-sekme-rozet nokta" aria-label="Bakılması gereken bir şey var" />}
        </span>
      </button>
      {acik && (
        <div className="rt-kmenu" role="menu">
          <div className="rt-kmenu-bas">
            <Avatar ad={ad} resim={resim} boyut={38} />
            <span className="tx"><b>{ad}</b>{eposta && <small>{eposta}</small>}
              {o.hesapli && <small className={d.hata ? 'hata' : ''}>{d.hata ? '⚠ Şu an yedeklenemiyor' : d.son ? `Yedekte · ${zamanFarki(d.son)}` : ''}</small>}
            </span>
          </div>
          <button type="button" role="menuitem" onClick={() => sec('profil')}>👤 Profil{uyari && <i className="rt-kmenu-nokta" aria-label="Bakılması gereken bir şey var" />}</button>
          {o.hesapli && <button type="button" role="menuitem" onClick={() => sec('bildirim')}>🔔 Bildirimler</button>}
          <button type="button" role="menuitem" onClick={() => sec('ayarlar')}>⚙️ Ayarlar</button>
          {!o.hesapli && <button type="button" role="menuitem" onClick={() => { setAcik(false); girisAc(); }}>✉️ E-postamı bağla</button>}
        </div>
      )}
    </div>
  );
}

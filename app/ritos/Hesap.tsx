'use client';

// Hesap ekranları: giriş kapısı, şifre sıfırlama, Ayarlar. 7 ekim — v1: veri şifresi, kurtarma kelimeleri ve Google girişi kalktı.

import { BildirimAyarlari } from './BildirimAyar';
import React, { useEffect, useState } from 'react';
import { SIFRE_EN_AZ, cikisYap, girisYap, gorunenAdDegistir, kayitOl, sifirlamaIste, sifirlamaTamamla, sifreDegistir, useOturum } from '@/lib/hesap';
import { senkronla, useSenkronDurum } from '@/lib/senkron';
import { Chips, Kap, Modal } from './ortak';
import { PaketlerKap } from './Sinav';
import { DanismanlikAyarlari } from './Danismanlik';
import { useDanismanlik } from '@/lib/danismanlik';
import { hesabimiSil, verileriSifirla, type SifirlaSecim } from '@/lib/sifirla';

// ———————————————— giriş kapısı ————————————————

const EPOSTA = /\S+@\S+\.\S+/;

/** Hesap açık değilse uygulama yerine bu ekran görünür. */
export function GirisEkrani({ yeniden }: { yeniden?: boolean }) {
  const [kip, setKip] = useState<'giris' | 'kayit' | 'unuttum'>('giris');
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [sifre2, setSifre2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const gecerli = kip === 'unuttum'
    ? EPOSTA.test(eposta)
    : EPOSTA.test(eposta) && sifre.length >= SIFRE_EN_AZ && (kip === 'giris' || (ad.trim().length > 0 && sifre === sifre2));

  async function gonder() {
    setBekle(true); setHata(null); setBilgi(null);
    try {
      const r = kip === 'kayit' ? await kayitOl(ad, eposta, sifre) : kip === 'giris' ? await girisYap(eposta, sifre) : await sifirlamaIste(eposta);
      if (!r.tamam) setHata(r.hata);
      else if (kip === 'unuttum') setBilgi('E-postana bir bağlantı gönderdik. Bağlantıyı bu cihazda aç; yeni şifreni orada belirleyeceksin.');
    } finally { setBekle(false); }
  }

  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu">
        <div className="rt-giris-logo">Ritos</div>
        {yeniden
          ? <p className="rt-muted">Oturumun kapanmış. Devam etmek için yeniden giriş yap; verin bu cihazda duruyor.</p>
          : <p className="rt-muted">Günlük düzenin, rutinlerin ve çevrenle paylaştıkların için. Verin hesabında saklanır; bütün cihazlarında aynı.</p>}
        {kip !== 'unuttum' && (
          <>
            <Chips secenekler={[['giris', 'Giriş'], ['kayit', 'Hesap oluştur']]} deger={kip} onSec={(k) => { setKip(k); setHata(null); }} />
          </>
        )}
        {kip === 'unuttum' && <p className="rt-metin"><b>Şifremi unuttum</b></p>}
        {kip === 'kayit' && <input className="rt-inp" placeholder="Adın" value={ad} onChange={(e) => setAd(e.target.value)} />}
        <input className="rt-inp" type="email" placeholder="E-posta" autoComplete="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
        {kip !== 'unuttum' && (
          <input className="rt-inp" type="password" placeholder={`Şifre (en az ${SIFRE_EN_AZ})`} autoComplete={kip === 'giris' ? 'current-password' : 'new-password'} value={sifre}
            onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && gecerli && !bekle) gonder(); }} />
        )}
        {kip === 'kayit' && <input className="rt-inp" type="password" placeholder="Şifre tekrar" autoComplete="new-password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} />}
        {kip === 'kayit' && sifre2 && sifre !== sifre2 && <p className="rt-hata">Şifreler aynı değil.</p>}
        {hata && <p className="rt-hata">{hata}</p>}
        {bilgi && <p className="rt-tamam">{bilgi}</p>}
        <button type="button" className="rt-btn primary rt-genis" disabled={!gecerli || bekle} onClick={gonder}>
          {bekle ? 'Bekle…' : kip === 'giris' ? 'Giriş yap' : kip === 'kayit' ? 'Hesap oluştur' : 'Bağlantı gönder'}
        </button>
        {kip === 'giris' && <button type="button" className="rt-linkbtn" onClick={() => { setKip('unuttum'); setHata(null); }}>Şifremi unuttum</button>}
        {kip === 'unuttum' && <button type="button" className="rt-linkbtn" onClick={() => { setKip('giris'); setHata(null); setBilgi(null); }}>Girişe dön</button>}
      </div>
    </div>
  );
}

/** Sıfırlama bağlantısından dönüş: yeni şifre. */
export function SifreSifirlaEkrani() {
  const [sifre, setSifre] = useState('');
  const [sifre2, setSifre2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const gecerli = sifre.length >= SIFRE_EN_AZ && sifre === sifre2;
  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu">
        <div className="rt-giris-logo">Ritos</div>
        <p className="rt-metin"><b>Yeni şifre belirle</b></p>
        <input className="rt-inp" type="password" placeholder={`Yeni şifre (en az ${SIFRE_EN_AZ})`} autoComplete="new-password" value={sifre} onChange={(e) => setSifre(e.target.value)} />
        <input className="rt-inp" type="password" placeholder="Yeni şifre tekrar" autoComplete="new-password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} />
        {sifre2 && sifre !== sifre2 && <p className="rt-hata">Şifreler aynı değil.</p>}
        {hata && <p className="rt-hata">{hata}</p>}
        <button type="button" className="rt-btn primary rt-genis" disabled={!gecerli || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          try { const r = await sifirlamaTamamla(sifre); if (!r.tamam) setHata(r.hata); }
          catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
          finally { setBekle(false); }
        }}>{bekle ? 'Bekle…' : 'Şifreyi kaydet'}</button>
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
export const HESAP_EKRAN_AD: Record<HesapEkran, string> = { profil: '👤 Profil ve hesap', bildirim: '🔔 Bildirimler', ayarlar: '⚙️ Ayarlar' };

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
  const [modal, setModal] = useState<null | 'sifre'>(null);
  const [adDuzenle, setAdDuzenle] = useState<string | null>(null);
  const uid = o.session?.user.id;
  const u = o.session?.user;
  const ad = o.gorunenAd ?? '—';
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  return (
    <>
      <Kap baslik="Profil">
        <div className="rt-profil-bas">
          <Avatar ad={ad} resim={resim} boyut={48} />
          {adDuzenle === null ? (
            <span className="tx"><span><b>{ad}</b> <button type="button" className="rt-linkbtn" onClick={() => setAdDuzenle(o.gorunenAd ?? '')}>değiştir</button></span><small>{u?.email}</small></span>
          ) : (
            <div className="rt-satir" style={{ flexWrap: 'nowrap', flex: 1 }}>
              <input className="rt-inp" value={adDuzenle} onChange={(e) => setAdDuzenle(e.target.value)} autoFocus />
              <button type="button" className="rt-btn primary" disabled={!adDuzenle.trim()} onClick={async () => { await gorunenAdDegistir(uid!, adDuzenle); setAdDuzenle(null); location.reload(); }}>Kaydet</button>
            </div>
          )}
        </div>
        <p className="rt-muted">Görünen adın davetlerde, gruplarda ve koçunun listesinde görünür.</p>
      </Kap>
      <Kap baslik="Giriş ve güvenlik">
        <p className="rt-metin">Giriş: <b>e-posta + şifre</b></p>
        <div className="rt-satir">
          <button type="button" className="rt-btn" onClick={() => setModal('sifre')}>Şifre değiştir</button>
        </div>
        <p className="rt-muted">Şifreni unutursan giriş ekranındaki "Şifremi unuttum" ile e-postana bağlantı gelir; verin hesabında durur.</p>
      </Kap>
      <Kap baslik="Eşitleme">
        <p className="rt-muted">
          {d.hata ? <span className="rt-hata">⚠ {d.hata}</span> : d.son ? `Son eşitleme: ${zamanFarki(d.son)}` : 'Henüz eşitlenmedi'}
          {d.bekleyen > 0 && ` · ${d.bekleyen} değişiklik bekliyor`}
        </p>
        {o.session && <div className="rt-satir"><button type="button" className="rt-btn" disabled={d.calisiyor} onClick={() => senkronla()}>{d.calisiyor ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button></div>}
      </Kap>
      {modal === 'sifre' && <SifreModal onKapat={() => setModal(null)} />}
    </>
  );
}

function AyarlarIcerik() {
  const o = useOturum();
  const dn = useDanismanlik();
  const [veriModal, setVeriModal] = useState<null | 'sifirla' | 'sil'>(null);
  return (
    <>
      {dn.profil?.koc && <PaketlerKap />}
      <DanismanlikAyarlari />
      {o.hesapli && (
        <Kap baslik="Veriler">
          <p className="rt-muted">Bu cihazı temizlemek için &quot;Çıkış yap&quot; yeter: çıkışta cihazdaki kopya silinir, veri hesapta kalır.</p>
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setVeriModal('sifirla')}>Verilerimi sıfırla</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setVeriModal('sil')}>Hesabımı sil</button>
          </div>
        </Kap>
      )}
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
    <Modal baslik="Çıkış yap" onKapat={onKapat}>
      <p className="rt-metin">Çıkış yapınca bu cihazdaki kopya silinir. Verin hesabında durur; yeniden giriş yapınca geri iner.</p>
      {bekleyen > 0 && <p className="rt-uyari">{bekleyen} değişiklik henüz eşitlenmedi. İnternet varsa çıkıştan önce gönderilir; yoksa bu değişiklikler kaybolur.</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={bekle} onClick={async () => { setBekle(true); await cikisYap(); }}>{bekle ? 'Çıkılıyor…' : 'Çıkış yap'}</button>
      </div>
    </Modal>
  );
}

function SifreModal({ onKapat }: { onKapat: () => void }) {
  const ne = 'şifre';
  const [eski, setEski] = useState('');
  const [yeni, setYeni] = useState('');
  const [yeni2, setYeni2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [tamam, setTamam] = useState(false);
  if (tamam) return (
    <Modal baslik="Şifre değişti" onKapat={onKapat}>
      <p className="rt-metin">Yeni {ne}n diğer cihazlarda da geçerli.</p>
      <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onKapat}>Tamam</button></div>
    </Modal>
  );
  return (
    <Modal baslik="Şifre değiştir" onKapat={onKapat}>
      <input className="rt-inp" type="password" placeholder={`Mevcut ${ne}`} autoComplete="current-password" value={eski} onChange={(e) => setEski(e.target.value)} />
      <input className="rt-inp" type="password" placeholder={`Yeni ${ne} (en az ${SIFRE_EN_AZ})`} autoComplete="new-password" value={yeni} onChange={(e) => setYeni(e.target.value)} />
      <input className="rt-inp" type="password" placeholder={`Yeni ${ne} tekrar`} autoComplete="new-password" value={yeni2} onChange={(e) => setYeni2(e.target.value)} />
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={bekle || !eski || yeni.length < SIFRE_EN_AZ || yeni !== yeni2}
          onClick={async () => { setBekle(true); setHata(null); try { await sifreDegistir(eski, yeni); setTamam(true); } catch (e) { setHata((e as Error).message); } finally { setBekle(false); } }}>
          {bekle ? 'Değiştiriliyor…' : 'Değiştir'}
        </button>
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

export function KullaniciRozeti({ onSec, uyari }: { onSec: (e: HesapEkran | 'cikis') => void; uyari?: boolean }) {
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
  if (!o.hesapli) return null;
  const u = o.session?.user;
  const eposta = u?.email ?? '';
  const ad = o.gorunenAd ?? (eposta ? eposta.split('@')[0] : 'Ben');
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  const sec = (e: HesapEkran | 'cikis') => { setAcik(false); onSec(e); };
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
            <span className="tx"><b>{ad}</b><small>{eposta}</small>
              <small className={d.hata ? 'hata' : ''}>{d.hata ? '⚠ Eşitleme sorunu' : d.calisiyor ? 'Eşitleniyor…' : d.son ? `Eşitlendi · ${zamanFarki(d.son)}` : ''}</small>
            </span>
          </div>
          <button type="button" role="menuitem" onClick={() => sec('profil')}>👤 Profil ve hesap{uyari && <i className="rt-kmenu-nokta" aria-label="Bakılması gereken bir şey var" />}</button>
          <button type="button" role="menuitem" onClick={() => sec('bildirim')}>🔔 Bildirimler</button>
          <button type="button" role="menuitem" onClick={() => sec('ayarlar')}>⚙️ Ayarlar</button>
          <button type="button" role="menuitem" className="cikis" onClick={() => sec('cikis')}>Çıkış yap</button>
        </div>
      )}
    </div>
  );
}

'use client';

// Hesap ekranları (27 eylül — V1 sadelik): giriş kapısı, şifre sıfırlama, kurtarma hatırlatması, Ayarlar.

import { BildirimAyarlari } from './BildirimAyar';
import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db } from '@/lib/db';
import {
  SIFRE_EN_AZ, cikisYap, epostaGirisiVar, girisYap, googleIleGir, gorunenAdDegistir, kayitOl, kurtarmaDurumu, kurtarmaGoster, kurtarmaKaydedildi,
  metaAd, oauthVazgec, sifirlamaIste, sifirlamaTamamla, sifreDegistir, useOturum, veriAnahtariVar, veriSifresiSifirla, veriSifresiyleAc,
  type KurtarmaDurumu,
} from '@/lib/hesap';
import { senkronla, useSenkronDurum } from '@/lib/senkron';
import { Chips, Kap, Modal } from './ortak';
import { PaketlerKap } from './Sinav';
import { DanismanlikAyarlari } from './Danismanlik';
import { AileAyarlari } from './Sohbet';
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
          : <p className="rt-muted">Günlük düzenin, programların ve koçunla çalışman için. Verin cihazında şifrelenir; Ritos içeriği okuyamaz.</p>}
        {kip !== 'unuttum' && (
          <>
            <button type="button" className="rt-btn rt-genis rt-google" disabled={bekle} onClick={async () => {
              setBekle(true); setHata(null);
              const r = await googleIleGir();
              if (!r.tamam) { setHata(r.hata); setBekle(false); }
            }}><b aria-hidden>G</b> Google ile devam et</button>
            <div className="rt-ya-da"><span>ya da e-postayla</span></div>
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

/**
 * Google'dan dönüş (5 ekim): oturum açık, veri anahtarı henüz açılmadı.
 *  • anahtar varsa: veri şifresi sorulur (e-postayla açılmış hesapta = eski giriş şifresi);
 *  • yoksa: yeni veri şifresi belirlenir;
 *  • unutulduysa: kurtarma kelimeleriyle yeni veri şifresi (ya da baştan başla).
 */
export function VeriSifresiEkrani() {
  const o = useOturum();
  const [var_, setVar] = useState<boolean | null | 'yukleniyor'>('yukleniyor');
  const [kip, setKip] = useState<'ac' | 'unuttum'>('ac');
  const [sifre, setSifre] = useState('');
  const [sifre2, setSifre2] = useState('');
  const [kelimeler, setKelimeler] = useState('');
  const [kelimeYok, setKelimeYok] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  useEffect(() => { veriAnahtariVar().then(setVar); }, []);
  const u = o.session?.user;
  const ad = o.gorunenAd ?? metaAd(u) ?? (u?.email ?? '').split('@')[0];
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  const belirle = var_ === false || kip === 'unuttum';
  const gecerli = belirle
    ? sifre.length >= SIFRE_EN_AZ && sifre === sifre2 && (kip !== 'unuttum' || kelimeYok || kelimeler.trim().length > 0)
    : sifre.length > 0;

  async function gonder() {
    setBekle(true); setHata(null);
    try {
      const r = kip === 'unuttum' ? await veriSifresiSifirla(sifre, kelimeYok ? null : kelimeler) : await veriSifresiyleAc(sifre);
      if (!r.tamam) setHata(r.hata);
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setBekle(false); }
  }

  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu">
        <div className="rt-giris-logo">Ritos</div>
        <div className="rt-veri-kim">
          <Avatar ad={ad || '?'} resim={resim} boyut={40} />
          <span><b>{ad}</b><small>{u?.email}</small></span>
        </div>
        {var_ === 'yukleniyor' ? <p className="rt-muted">Bekle…</p>
          : var_ === null ? <p className="rt-hata">Sunucuya ulaşılamadı. İnternetini kontrol edip sayfayı yenile.</p>
          : (
            <>
              {var_ === false && <p className="rt-metin"><b>Veri şifresi belirle</b><br /><span className="rt-muted">Ritos'ta verin cihazında şifrelenir. Bu şifre Google şifrenden ayrıdır ve Ritos onu bilmez. Her yeni cihazda bir kez sorulur.</span></p>}
              {var_ === true && kip === 'ac' && <p className="rt-metin"><b>Veri şifren</b><br /><span className="rt-muted">Verini açmak için bir kez gerekiyor; bu cihaz hatırlar. Daha önce e-posta ve şifreyle girdiysen veri şifren o şifredir.</span></p>}
              {kip === 'unuttum' && (
                !kelimeYok ? (
                  <>
                    <p className="rt-metin"><b>Veri şifremi unuttum</b><br /><span className="rt-muted">Verini açmak için kurtarma anahtarındaki 12 kelime gerekir; sonra yeni bir veri şifresi belirlersin.</span></p>
                    <textarea className="rt-inp" rows={3} placeholder="12 kelime, aralarında boşluk" value={kelimeler} onChange={(e) => setKelimeler(e.target.value)} />
                    <button type="button" className="rt-linkbtn" onClick={() => setKelimeYok(true)}>Kurtarma kelimelerim yok</button>
                  </>
                ) : (
                  <>
                    <p className="rt-uyari">Kelimeler olmadan eski verin açılamaz. Ritos yeni veri şifresiyle boş başlar. Bu cihazda verin duruyorsa kaybolmaz, yeniden yüklenir.</p>
                    <button type="button" className="rt-linkbtn" onClick={() => setKelimeYok(false)}>Kelimelerim var</button>
                  </>
                )
              )}
              <input className="rt-inp" type="password" autoComplete={belirle ? 'new-password' : 'current-password'}
                placeholder={belirle ? `${kip === 'unuttum' ? 'Yeni veri şifresi' : 'Veri şifresi'} (en az ${SIFRE_EN_AZ})` : 'Veri şifresi'}
                value={sifre} onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && gecerli && !bekle) gonder(); }} />
              {belirle && <input className="rt-inp" type="password" autoComplete="new-password" placeholder="Tekrar" value={sifre2} onChange={(e) => setSifre2(e.target.value)} />}
              {belirle && sifre2 && sifre !== sifre2 && <p className="rt-hata">Şifreler aynı değil.</p>}
              {hata && <p className="rt-hata">{hata}</p>}
              <button type="button" className="rt-btn primary rt-genis" disabled={!gecerli || bekle} onClick={gonder}>
                {bekle ? 'Bekle…' : kip === 'unuttum' ? (kelimeYok ? 'Baştan başla' : 'Verimi aç') : var_ === false ? 'Başla' : 'Aç'}
              </button>
              {var_ === true && kip === 'ac' && <button type="button" className="rt-linkbtn" onClick={() => { setKip('unuttum'); setHata(null); setSifre(''); setSifre2(''); }}>Veri şifremi unuttum</button>}
              {kip === 'unuttum' && <button type="button" className="rt-linkbtn" onClick={() => { setKip('ac'); setHata(null); setKelimeYok(false); }}>Geri</button>}
            </>
          )}
        <button type="button" className="rt-linkbtn" onClick={() => oauthVazgec()}>Başka hesapla gir</button>
      </div>
    </div>
  );
}

/** Sıfırlama bağlantısından dönüş: yeni şifre + (varsa) kurtarma kelimeleri. */
export function SifreSifirlaEkrani() {
  const [sifre, setSifre] = useState('');
  const [sifre2, setSifre2] = useState('');
  const [kelimeler, setKelimeler] = useState('');
  const [yok, setYok] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const gecerli = sifre.length >= SIFRE_EN_AZ && sifre === sifre2 && (yok || kelimeler.trim().length > 0);
  return (
    <div className="rt-giris">
      <div className="rt-giris-kutu">
        <div className="rt-giris-logo">Ritos</div>
        <p className="rt-metin"><b>Yeni şifre belirle</b></p>
        <input className="rt-inp" type="password" placeholder={`Yeni şifre (en az ${SIFRE_EN_AZ})`} autoComplete="new-password" value={sifre} onChange={(e) => setSifre(e.target.value)} />
        <input className="rt-inp" type="password" placeholder="Yeni şifre tekrar" autoComplete="new-password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} />
        {!yok ? (
          <>
            <p className="rt-muted">Verin şifrelidir; açmak için kurtarma anahtarındaki 12 kelime gerekir.</p>
            <textarea className="rt-inp" rows={3} placeholder="12 kelime, aralarında boşluk" value={kelimeler} onChange={(e) => setKelimeler(e.target.value)} />
            <button type="button" className="rt-linkbtn" onClick={() => setYok(true)}>Kurtarma kelimelerim yok</button>
          </>
        ) : (
          <>
            <p className="rt-uyari">Kelimeler olmadan eski verin açılamaz. Hesabın yeni şifreyle açılır ama boş başlar. Bu cihazda verin duruyorsa kaybolmaz, yeniden yüklenir.</p>
            <button type="button" className="rt-linkbtn" onClick={() => setYok(false)}>Kelimelerim var</button>
          </>
        )}
        {sifre2 && sifre !== sifre2 && <p className="rt-hata">Şifreler aynı değil.</p>}
        {hata && <p className="rt-hata">{hata}</p>}
        <button type="button" className="rt-btn primary rt-genis" disabled={!gecerli || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          try { const r = await sifirlamaTamamla(sifre, yok ? null : kelimeler); if (!r.tamam) setHata(r.hata); }
          catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
          finally { setBekle(false); }
        }}>{bekle ? 'Bekle…' : yok ? 'Yeni şifreyle baştan başla' : 'Şifreyi değiştir ve verimi aç'}</button>
      </div>
    </div>
  );
}

// ———————————————— kurtarma kelimeleri: hatırlatma ————————————————

/** Kurtarma kelimeleri kaydedilmediyse: birkaç gün sonra ya da ilk koç bağlantısında Home'un üstünde. */
// Kurtarma hatırlatması (28 eylül): Home'dan Ayarlar › Hesap'a taşındı. Hatırlatma zamanı
// geldiyse Ayarlar sekmesinde küçük bir nokta görünür; kaydedilince her yerde birlikte kalkar.
const KURTARMA_OLAY = 'ritos-kurtarma-kaydedildi';
async function kurtarmaKaydet(uid: string) {
  await kurtarmaKaydedildi(uid);
  window.dispatchEvent(new Event(KURTARMA_OLAY));
}

export function useKurtarmaHatirlat(): boolean {
  const o = useOturum();
  const d = useDanismanlik();
  const iliskiVar = useCanli(async () => (await db.iliski.count()) > 0, [], false);
  const [durum, setDurum] = useState<KurtarmaDurumu | null>(null);
  const uid = o.session?.user.id;
  useEffect(() => { if (uid) kurtarmaDurumu(uid, iliskiVar).then(setDurum).catch(() => {}); }, [uid, iliskiVar, d.etkin]);
  useEffect(() => {
    const f = () => setDurum({ kaydedildi: true, hatirlat: false });
    window.addEventListener(KURTARMA_OLAY, f);
    return () => window.removeEventListener(KURTARMA_OLAY, f);
  }, []);
  return !!uid && !!durum?.hatirlat;
}

function KurtarmaHatirlatma() {
  const o = useOturum();
  const hatirlat = useKurtarmaHatirlat();
  const [acik, setAcik] = useState(false);
  const uid = o.session?.user.id;
  if (!hatirlat || !uid) return null;
  return (
    <>
      <div className="rt-uyari rt-kurtarma-uyari">
        <span><b>Hesabını güvenceye al.</b> Şifreni unutursan verini yalnız kurtarma anahtarın açar. Bir kez kaydetmen yeter.</span>
        <button type="button" className="rt-btn primary" onClick={() => setAcik(true)}>Şimdi kaydet</button>
      </div>
      {acik && <KurtarmaIste onKapat={() => setAcik(false)} onKaydedildi={async () => { await kurtarmaKaydet(uid); setAcik(false); }} />}
    </>
  );
}

function KurtarmaIste({ onKapat, onKaydedildi }: { onKapat: () => void; onKaydedildi?: () => void }) {
  const [sifre, setSifre] = useState('');
  const [kelimeler, setKelimeler] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [onay, setOnay] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  if (kelimeler) return (
    <Modal baslik="Kurtarma anahtarın" onKapat={onKapat}>
      <p className="rt-metin">Şifreni unutursan verine yalnızca bu 12 kelimeyle ulaşabilirsin. Kâğıda yaz ya da bir şifre yöneticisinde sakla; kimseyle paylaşma.</p>
      <ol className="rt-kurtarma">{kelimeler.map((k, i) => <li key={i}>{k}</li>)}</ol>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={async () => { try { await navigator.clipboard.writeText(kelimeler.join(' ')); setKopyalandi(true); } catch { /* izin yok */ } }}>{kopyalandi ? 'Kopyalandı' : 'Kopyala'}</button>
        <button type="button" className="rt-btn" onClick={() => window.print()}>Yazdır</button>
      </div>
      <label className="rt-onay"><input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} /> Bir yere kaydettim</label>
      <div className="rt-satir"><button type="button" className="rt-btn primary" disabled={!onay} onClick={() => (onKaydedildi ? onKaydedildi() : onKapat())}>Tamam</button></div>
    </Modal>
  );
  return (
    <Modal baslik="Kurtarma anahtarı" onKapat={onKapat}>
      <p className="rt-muted">Göstermeden önce şifreni soruyoruz.</p>
      <input className="rt-inp" type="password" placeholder="Şifre" autoComplete="current-password" value={sifre} onChange={(e) => setSifre(e.target.value)} />
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={!sifre || bekle}
          onClick={async () => { setBekle(true); setHata(null); try { setKelimeler(await kurtarmaGoster(sifre)); } catch (e) { setHata((e as Error).message); } finally { setBekle(false); } }}>
          {bekle ? '…' : 'Göster'}
        </button>
      </div>
    </Modal>
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

export function AyarlarPane() {
  const o = useOturum();
  const d = useSenkronDurum();
  const dn = useDanismanlik();
  const [modal, setModal] = useState<null | 'cikis' | 'sifre' | 'kurtarma'>(null);
  const [adDuzenle, setAdDuzenle] = useState<string | null>(null);
  const [veriModal, setVeriModal] = useState<null | 'sifirla' | 'sil'>(null);
  const uid = o.session?.user.id;
  const sadeceGoogle = !!o.session && !epostaGirisiVar(o.session.user);

  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      <h4>⚙️ Ayarlar</h4>
      <Kap baslik="Hesap">
        <KurtarmaHatirlatma />
        {o.session && (
          <>
            {adDuzenle === null ? (
              <p className="rt-metin"><b>{o.gorunenAd ?? '—'}</b> <button type="button" className="rt-linkbtn" onClick={() => setAdDuzenle(o.gorunenAd ?? '')}>değiştir</button><br /><span className="rt-muted">{o.session.user.email}</span></p>
            ) : (
              <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
                <input className="rt-inp" value={adDuzenle} onChange={(e) => setAdDuzenle(e.target.value)} />
                <button type="button" className="rt-btn primary" disabled={!adDuzenle.trim()} onClick={async () => { await gorunenAdDegistir(uid!, adDuzenle); setAdDuzenle(null); location.reload(); }}>Kaydet</button>
              </div>
            )}
            <p className="rt-muted">
              {d.hata ? <span className="rt-hata">⚠ {d.hata}</span> : d.son ? `Son eşitleme: ${zamanFarki(d.son)}` : 'Henüz eşitlenmedi'}
              {d.bekleyen > 0 && ` · ${d.bekleyen} değişiklik bekliyor`}
            </p>
          </>
        )}
        <div className="rt-satir">
          {o.session && <button type="button" className="rt-btn" disabled={d.calisiyor} onClick={() => senkronla()}>{d.calisiyor ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button>}
          <button type="button" className="rt-btn" onClick={() => setModal('kurtarma')}>Kurtarma anahtarı</button>
          <button type="button" className="rt-btn" onClick={() => setModal('sifre')}>{sadeceGoogle ? 'Veri şifresini değiştir' : 'Şifre değiştir'}</button>
          <button type="button" className="rt-btn" onClick={() => setModal('cikis')}>Çıkış yap</button>
        </div>
      </Kap>

      {dn.profil?.koc && <PaketlerKap />}
      <DanismanlikAyarlari />
      <AileAyarlari />
      <BildirimAyarlari />
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

      {modal === 'cikis' && <CikisModal onKapat={() => setModal(null)} bekleyen={d.bekleyen} />}
      {modal === 'sifre' && <SifreModal onKapat={() => setModal(null)} veri={sadeceGoogle} />}
      {modal === 'kurtarma' && <KurtarmaIste onKapat={() => setModal(null)} onKaydedildi={async () => { if (uid) await kurtarmaKaydet(uid); setModal(null); }} />}
    </div>
  );
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

function SifreModal({ onKapat, veri }: { onKapat: () => void; veri?: boolean }) {
  const ne = veri ? 'veri şifresi' : 'şifre';
  const [eski, setEski] = useState('');
  const [yeni, setYeni] = useState('');
  const [yeni2, setYeni2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [tamam, setTamam] = useState(false);
  if (tamam) return (
    <Modal baslik={veri ? 'Veri şifresi değişti' : 'Şifre değişti'} onKapat={onKapat}>
      <p className="rt-metin">Yeni {ne}n diğer cihazlarda da geçerli.</p>
      <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onKapat}>Tamam</button></div>
    </Modal>
  );
  return (
    <Modal baslik={veri ? 'Veri şifresini değiştir' : 'Şifre değiştir'} onKapat={onKapat}>
      {veri && <p className="rt-muted">Google ile giriyorsun; bu şifre yalnız verini açar.</p>}
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
      <p className="rt-muted">Aynı e-postayla kullandığın başka uygulamalar etkilenmez. Aynı e-posta ve şifreyle yeniden girersen Ritos boş başlar.</p>
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
// Resim: ileride Google girişinde user_metadata.avatar_url/picture gelir; yoksa baş harfler.
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

export function KullaniciRozeti({ onAc, uyari }: { onAc: () => void; uyari?: boolean }) {
  const o = useOturum();
  if (!o.hesapli) return null;
  const u = o.session?.user;
  const eposta = u?.email ?? '';
  const ad = o.gorunenAd ?? (eposta ? eposta.split('@')[0] : 'Ben');
  const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
  const resim = (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || null;
  return (
    <button type="button" className="rt-kullanici" onClick={onAc} title={eposta ? `${ad} · ${eposta}` : ad} aria-label={`${ad} — Ayarlar`}>
      <span className="rt-kullanici-ad">{ad}</span>
      <span className="rt-kullanici-av">
        <Avatar ad={ad} resim={resim} />
        {uyari && <i className="rt-sekme-rozet nokta" aria-label="Hesabını güvenceye al" />}
      </span>
    </button>
  );
}

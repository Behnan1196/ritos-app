'use client';

// Hesap ekranları (27 eylül — V1 sadelik): giriş kapısı, şifre sıfırlama, kurtarma hatırlatması, Ayarlar.

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db } from '@/lib/db';
import {
  SIFRE_EN_AZ, cikisYap, girisYap, gorunenAdDegistir, kayitOl, kurtarmaDurumu, kurtarmaGoster, kurtarmaKaydedildi,
  sifirlamaIste, sifirlamaTamamla, sifreDegistir, useOturum, type KurtarmaDurumu,
} from '@/lib/hesap';
import { senkronla, useSenkronDurum } from '@/lib/senkron';
import { Chips, Kap, Modal } from './ortak';
import { PaketlerKap } from './Sinav';
import { DanismanlikAyarlari } from './Danismanlik';
import { AileAyarlari } from './Sohbet';
import { useDanismanlik } from '@/lib/danismanlik';

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
        {kip !== 'unuttum' && <Chips secenekler={[['giris', 'Giriş'], ['kayit', 'Hesap oluştur']]} deger={kip} onSec={(k) => { setKip(k); setHata(null); }} />}
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
export function KurtarmaHatirlatma() {
  const o = useOturum();
  const d = useDanismanlik();
  const iliskiVar = useCanli(async () => (await db.iliski.count()) > 0, [], false);
  const [durum, setDurum] = useState<KurtarmaDurumu | null>(null);
  const [acik, setAcik] = useState(false);
  const uid = o.session?.user.id;
  useEffect(() => { if (uid) kurtarmaDurumu(uid, iliskiVar).then(setDurum).catch(() => {}); }, [uid, iliskiVar, d.etkin]);
  if (!durum?.hatirlat || !uid) return null;
  return (
    <>
      <div className="rt-uyari rt-kurtarma-uyari">
        <span><b>Hesabını güvenceye al.</b> Şifreni unutursan verini yalnız kurtarma anahtarın açar. Bir kez kaydetmen yeter.</span>
        <button type="button" className="rt-btn primary" onClick={() => setAcik(true)}>Şimdi kaydet</button>
      </div>
      {acik && <KurtarmaIste onKapat={() => setAcik(false)} onKaydedildi={async () => { await kurtarmaKaydedildi(uid); setDurum({ kaydedildi: true, hatirlat: false }); setAcik(false); }} />}
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
  const uid = o.session?.user.id;

  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      <h4>⚙️ Ayarlar</h4>
      <Kap baslik="Hesap">
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
          <button type="button" className="rt-btn" onClick={() => setModal('sifre')}>Şifre değiştir</button>
          <button type="button" className="rt-btn" onClick={() => setModal('cikis')}>Çıkış yap</button>
        </div>
      </Kap>

      {dn.profil?.koc && <PaketlerKap />}
      <DanismanlikAyarlari />
      <AileAyarlari />

      {modal === 'cikis' && <CikisModal onKapat={() => setModal(null)} bekleyen={d.bekleyen} />}
      {modal === 'sifre' && <SifreModal onKapat={() => setModal(null)} />}
      {modal === 'kurtarma' && <KurtarmaIste onKapat={() => setModal(null)} onKaydedildi={async () => { if (uid) await kurtarmaKaydedildi(uid); setModal(null); }} />}
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

function SifreModal({ onKapat }: { onKapat: () => void }) {
  const [eski, setEski] = useState('');
  const [yeni, setYeni] = useState('');
  const [yeni2, setYeni2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [tamam, setTamam] = useState(false);
  if (tamam) return (
    <Modal baslik="Şifre değişti" onKapat={onKapat}>
      <p className="rt-metin">Yeni şifren diğer cihazlarda da geçerli.</p>
      <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onKapat}>Tamam</button></div>
    </Modal>
  );
  return (
    <Modal baslik="Şifre değiştir" onKapat={onKapat}>
      <input className="rt-inp" type="password" placeholder="Mevcut şifre" autoComplete="current-password" value={eski} onChange={(e) => setEski(e.target.value)} />
      <input className="rt-inp" type="password" placeholder={`Yeni şifre (en az ${SIFRE_EN_AZ})`} autoComplete="new-password" value={yeni} onChange={(e) => setYeni(e.target.value)} />
      <input className="rt-inp" type="password" placeholder="Yeni şifre tekrar" autoComplete="new-password" value={yeni2} onChange={(e) => setYeni2(e.target.value)} />
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

'use client';

// Hesap (G1–G6), Paylaş (P1–P4), Gelenler (P5–P7, P10), Ayarlar › Hesap/Engellenenler.

import React, { useEffect, useState } from 'react';
import { db, type GelenRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { bugun } from '@/lib/paket';
import { SIFRE_EN_AZ, misafirDoluMu, cikisYap, girisYap, girisiTamamla, gorunenAdDegistir, kayitOl, kurtarmaGoster, sifreDegistir, useOturum } from '@/lib/hesap';
import { senkronla, useSenkronDurum } from '@/lib/senkron';
import { pinDogrula, pinVar } from '@/lib/kilit';
import { KilitAyarlari, PinGir } from './Kilit';
import { PaketlerKap } from './Sinav';
import { sonYedek, yedegiYukle, yedekAl, yedekOku } from '@/lib/yedek';
import { al, engelKaldir, engelle, engellenenler, gelenSil, gelenleriCek, gonder, kisiBul, type PaylasimPaketi } from '@/lib/paylasim';
import { BlokGoster, Chips, Kap, Modal, OnayKutusu } from './ortak';

// ———————————————— Hesap ————————————————

export function HesapModal({ onKapat, neden, baskasi }: { onKapat: () => void; onTamam?: () => void; neden?: string; baskasi?: boolean }) {
  const [kip, setKip] = useState<'giris' | 'kayit'>('giris');
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [sifre2, setSifre2] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [kurtarma, setKurtarma] = useState<string[] | null>(null);
  const [misafirSor, setMisafirSor] = useState<string | null>(null);
  const misafirDolu = useCanli(() => misafirDoluMu(), [], false);
  const [tasi, setTasi] = useState<'tasi' | 'ayri' | null>(null);
  const [gecici, setGecici] = useState(!!baskasi);
  const [pinOnay, setPinOnay] = useState(false); // özel alanı hesaba taşımak için PIN doğrulandı mı
  const kilitli = pinVar();

  const gecerli = /\S+@\S+\.\S+/.test(eposta) && sifre.length >= SIFRE_EN_AZ
    && (kip === 'giris' || (ad.trim().length > 0 && sifre === sifre2 && (!misafirDolu || tasi === 'ayri' || (tasi === 'tasi' && (!kilitli || pinOnay)))));

  async function gonderForm() {
    setBekle(true); setHata(null);
    try {
      if (kip === 'kayit') {
        const r = await kayitOl(ad, eposta, sifre, misafirDolu && tasi === 'tasi');
        if (!r.tamam) { setHata(r.hata); return; }
        setKurtarma(r.kurtarma);
      } else {
        const r = await girisYap(eposta, sifre, gecici);
        if (!r.tamam) { setHata(r.hata); return; }
        if (r.misafirVar) setMisafirSor(r.uid);
        else await girisiTamamla(r.uid, false);
      }
    } finally {
      setBekle(false);
    }
  }

  if (kurtarma) return <KurtarmaGoster kelimeler={kurtarma} onTamam={() => location.reload()} ilk />;

  if (misafirSor) return (
    <Modal baslik="Bu cihazda hesapsız girdiğin veriler var" onKapat={() => {}}>
      <p className="rt-metin">Hesabına giriş yapmadan önce bu cihazda kartlar ya da programlar oluşturmuşsun. Ne yapalım?</p>
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={kilitli && !pinOnay} onClick={() => girisiTamamla(misafirSor, true)}>Hesabıma ekle</button>
        <button type="button" className="rt-btn" onClick={() => girisiTamamla(misafirSor, false)}>Ayrı tut</button>
      </div>
      {kilitli && !pinOnay && <PinGir etiket="Eklemek için cihaz PIN'ini gir" onGirildi={async (p) => { const r = await pinDogrula(p); if (r.tamam) setPinOnay(true); return r.tamam ? null : r.hata; }} />}
      <p className="rt-muted">&quot;Ayrı tut&quot; dersen onlar yalnız bu cihazda, hesaptan çıktığında görünen özel alanında kalır; sunucuya gitmez.</p>
    </Modal>
  );

  return (
    <Modal baslik={kip === 'giris' ? 'Giriş yap' : 'Hesap oluştur'} onKapat={onKapat}>
      {neden && <p className="rt-muted">{neden}</p>}
      {baskasi
        ? <p className="rt-metin">Kendi Ritos hesabınla giriş yap. Çıkış yaptığında verin bu cihazdan silinir; telefon sahibinin verisini görmezsin.</p>
        : <Chips secenekler={[['giris', 'Giriş'], ['kayit', 'Hesap oluştur']]} deger={kip} onSec={(k) => { setKip(k); setHata(null); }} />}
      {kip === 'kayit' && <input className="rt-inp" placeholder="Görünen ad" value={ad} onChange={(e) => setAd(e.target.value)} />}
      <input className="rt-inp" type="email" placeholder="E-posta" autoComplete="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      <input className="rt-inp" type="password" placeholder={`Şifre (en az ${SIFRE_EN_AZ})`} autoComplete={kip === 'giris' ? 'current-password' : 'new-password'} value={sifre}
        onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && gecerli && !bekle) gonderForm(); }} />
      {kip === 'kayit' && <input className="rt-inp" type="password" placeholder="Şifre tekrar" autoComplete="new-password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} />}
      {kip === 'kayit' && sifre2 && sifre !== sifre2 && <p className="rt-hata">Şifreler aynı değil.</p>}
      {kip === 'kayit' && misafirDolu && (
        <div className="rt-secim">
          <span>Bu cihazda hesapsız oluşturduğun kartlar ve programlar var:</span>
          <Chips secenekler={[['tasi', 'Hesabıma taşı'], ['ayri', 'Cihazda ayrı kalsın']]} deger={tasi ?? ('' as 'tasi')} onSec={setTasi} />
          {tasi === 'ayri' && <span className="rt-muted">Onlar yalnız bu cihazda, hesaptan çıktığında görünen özel alanında kalır; sunucuya gitmez.</span>}
          {tasi === 'tasi' && kilitli && !pinOnay && <PinGir etiket="Taşımak için cihaz PIN'ini gir" onGirildi={async (p) => { const r = await pinDogrula(p); if (r.tamam) setPinOnay(true); return r.tamam ? null : r.hata; }} />}
        </div>
      )}
      {kip === 'giris' && !baskasi && (
        <label className="rt-onay"><input type="checkbox" checked={gecici} onChange={(e) => setGecici(e.target.checked)} /> Bu cihaz benim değil — çıkışta verim bu cihazdan silinsin</label>
      )}
      {kip === 'giris' && !gecici && misafirDolu && !kilitli && (
        <p className="rt-uyari">Bu cihazda kilitsiz bir özel alan var. Cihaz senin değilse yukarıdaki kutuyu işaretle; seninse Ayarlar'dan PIN koymanı öneririz.</p>
      )}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={!gecerli || bekle} onClick={gonderForm}>{bekle ? 'Anahtarlar hazırlanıyor…' : kip === 'giris' ? 'Giriş yap' : 'Hesap oluştur'}</button>
      </div>
      {kip === 'kayit'
        ? <p className="rt-muted">Verilerin cihazında şifrelenir; Ritos içeriği okuyamaz. Bu yüzden şifreni ve birazdan göreceğin kurtarma anahtarını ikisini birden kaybedersen verin geri gelmez. </p>
        : <p className="rt-muted">Giriş yapınca kartların ve programların diğer cihazlarınla şifreli olarak eşitlenir.</p>}
    </Modal>
  );
}

function KurtarmaGoster({ kelimeler, onTamam, ilk }: { kelimeler: string[]; onTamam: () => void; ilk?: boolean }) {
  const [tamam, setTamam] = useState(!ilk);
  const [kopyalandi, setKopyalandi] = useState(false);
  return (
    <Modal baslik="Kurtarma anahtarın" onKapat={ilk ? () => {} : onTamam}>
      <p className="rt-metin">Şifreni unutursan verine yalnızca bu 12 kelimeyle ulaşabilirsin. Kâğıda yaz ya da bir şifre yöneticisinde sakla; kimseyle paylaşma.</p>
      <ol className="rt-kurtarma">{kelimeler.map((k, i) => <li key={i}>{k}</li>)}</ol>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={async () => { try { await navigator.clipboard.writeText(kelimeler.join(' ')); setKopyalandi(true); } catch { /* izin yok */ } }}>{kopyalandi ? 'Kopyalandı' : 'Kopyala'}</button>
        <button type="button" className="rt-btn" onClick={() => window.print()}>Yazdır</button>
      </div>
      {ilk && <label className="rt-onay"><input type="checkbox" checked={tamam} onChange={(e) => setTamam(e.target.checked)} /> Bir yere kaydettim</label>}
      <div className="rt-satir"><button type="button" className="rt-btn primary" disabled={!tamam} onClick={onTamam}>{ilk ? 'Devam' : 'Kapat'}</button></div>
    </Modal>
  );
}

// Başlıktaki küçük senkron göstergesi (S7): yalnız hesaplıyken ve bir sorun varsa belirgin.
export function SenkronIsareti() {
  const d = useSenkronDurum();
  if (!d.etkin) return null;
  const metin = d.hata ? 'Senkron sorunu' : d.ilkIndirme ? 'Verilerin getiriliyor…' : d.calisiyor ? 'Eşitleniyor…' : null;
  return <span className={`rt-senkron${d.hata ? ' hata' : ''}`} title={d.hata ?? 'Eşitlendi'}>{d.hata ? '⚠' : '●'}{metin ? ` ${metin}` : ''}</span>;
}

// ———————————————— Paylaş ————————————————

export function PaylasDugmesi({ paketUret }: { paketUret: () => Promise<PaylasimPaketi | null> | PaylasimPaketi }) {
  const [acik, setAcik] = useState(false);
  return (
    <>
      <button type="button" className="rt-btn" onClick={() => setAcik(true)}>Paylaş</button>
      {acik && <PaylasAkisi paketUret={paketUret} onKapat={() => setAcik(false)} />}
    </>
  );
}

function PaylasAkisi({ paketUret, onKapat }: { paketUret: () => Promise<PaylasimPaketi | null> | PaylasimPaketi; onKapat: () => void }) {
  const o = useOturum();
  if (!o.hazir) return null;
  if (!o.session || o.kilitli) return <HesapModal onKapat={onKapat} neden="Paylaşmak için bir hesap gerekiyor." />;
  return <PaylasModal paketUret={paketUret} onKapat={onKapat} benId={o.session.user.id} />;
}

function PaylasModal({ paketUret, onKapat, benId }: { paketUret: () => Promise<PaylasimPaketi | null> | PaylasimPaketi; onKapat: () => void; benId: string }) {
  const kisiler = useCanli(() => db.kisi.orderBy('son').reverse().limit(12).toArray(), [], []);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [eposta, setEposta] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);

  const degistir = (id: string) => setSecili((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function ekle() {
    setHata(null);
    const r = await kisiBul(eposta);
    if ('hata' in r) { setHata(r.hata); return; }
    const k = r.kisi;
    if (k.id === benId) { setHata('Bu senin hesabın.'); return; }
    setSecili((s) => new Set(s).add(k.id)); setEposta('');
  }

  async function paylas() {
    setBekle(true); setHata(null);
    const p = await paketUret();
    if (!p) { setBekle(false); setHata('Paylaşılacak içerik bulunamadı.'); return; }
    const r = await gonder(p, Array.from(secili));
    setBekle(false);
    if (r.hata) setHata(r.hata);
    if (r.basarili) setDurum(`${r.basarili} kişiye gönderildi.`);
  }

  if (durum) return (
    <Modal baslik="Paylaşıldı" onKapat={onKapat}>
      <p className="rt-metin">{durum} Alıcı, Gelenler&apos;den kendi Ajanda&apos;sına ya da Kişisel Gelişim&apos;ine alabilir.</p>
      <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onKapat}>Tamam</button></div>
    </Modal>
  );

  return (
    <Modal baslik="Paylaş" onKapat={onKapat}>
      <p className="rt-muted">Yalnızca kartın/programın tanımı gider — yapıldı işaretlerin, girdiğin değerler ve değerlendirmen gitmez.</p>
      {kisiler.length > 0 && (
        <div className="rt-kisiler">
          {kisiler.filter((k) => k.id !== benId).map((k) => (
            <button key={k.id} type="button" className={`rt-chip${secili.has(k.id) ? ' on' : ''}`} onClick={() => degistir(k.id)}>{k.gorunen_ad}</button>
          ))}
        </div>
      )}
      <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
        <input className="rt-inp" type="email" placeholder="E-posta ile kişi ekle" value={eposta} onChange={(e) => setEposta(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && eposta) ekle(); }} />
        <button type="button" className="rt-btn" disabled={!/\S+@\S+\.\S+/.test(eposta)} onClick={ekle}>Ekle</button>
      </div>
      {secili.size > 0 && <p className="rt-muted">{secili.size} kişi seçili</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={!secili.size || bekle} onClick={paylas}>{bekle ? 'Gönderiliyor…' : 'Gönder'}</button>
      </div>
    </Modal>
  );
}

// ———————————————— Gelenler ————————————————

// Oturum varken açılışta, pencere odaklanınca ve dakikada bir sunucudan çek.
export function useGelenSenkron() {
  const o = useOturum();
  const uid = o.session?.user.id;
  useEffect(() => {
    if (!uid) return;
    const cek = () => { gelenleriCek().catch(() => {}); };
    cek();
    window.addEventListener('focus', cek);
    const t = setInterval(cek, 60_000);
    return () => { window.removeEventListener('focus', cek); clearInterval(t); };
  }, [uid]);
}

export function useGelenOzeti(): { yeni: number; toplam: number } {
  return useCanli(async () => ({ yeni: await db.gelen.filter((g) => g.alindi === null).count(), toplam: await db.gelen.count() }), [], { yeni: 0, toplam: 0 });
}

function boyutMetni(b: number) {
  return b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function zamanMetni(ms: number) {
  const d = new Date(ms);
  const fark = Math.floor((Date.now() - ms) / 86400000);
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return fark === 0 ? `bugün ${saat}` : fark === 1 ? `dün ${saat}` : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function GelenlerTool({ compact, onBack }: { compact?: boolean; onBack: () => void }) {
  const o = useOturum();
  const gelenler = useCanli(() => db.gelen.orderBy('gelis').reverse().toArray(), [], [] as GelenRow[]);
  const [acik, setAcik] = useState<GelenRow | null>(null);
  const [hesap, setHesap] = useState(false);
  const toplam = gelenler.reduce((s, g) => s + g.boyut, 0);

  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      {compact && <button className="tool-back" style={{ marginBottom: 10 }} onClick={onBack}>‹ Home</button>}
      <Kap baslik="📥 Gelenler" eylemler={<span className="rt-muted">{gelenler.length} öğe · {boyutMetni(toplam)}</span>}>
        {!o.session && o.hazir && (
          <p className="rt-muted">Sana gönderilenleri almak için <button type="button" className="rt-linkbtn" onClick={() => setHesap(true)}>giriş yap</button>.</p>
        )}
        {gelenler.length === 0 && o.session && <p className="rt-muted">Henüz gelen yok.</p>}
        {gelenler.map((g) => {
          const p = g.paket as PaylasimPaketi;
          return (
            <button key={g.id} type="button" className={`rt-gelen${g.alindi ? ' alindi' : ''}`} onClick={() => setAcik(g)}>
              <span className="ic">{p.tur === 'program' ? '🌱' : '🗂️'}</span>
              <span className="tx">
                <span className="t">{p.ad}</span>
                <span className="s">{g.gonderen_ad}{g.kaynak === 'sohbet' ? ' · sohbetten' : ''} · {zamanMetni(g.gelis)}{g.alindi ? ' · alındı' : ''}</span>
              </span>
            </button>
          );
        })}
      </Kap>
      {acik && <GelenDetay g={acik} onKapat={() => setAcik(null)} />}
      {hesap && <HesapModal onKapat={() => setHesap(false)} />}
    </div>
  );
}

function GelenDetay({ g, onKapat }: { g: GelenRow; onKapat: () => void }) {
  const p = g.paket as PaylasimPaketi;
  const [tarih, setTarih] = useState(bugun());
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [engelSor, setEngelSor] = useState(false);
  const [silSor, setSilSor] = useState(false);

  return (
    <Modal baslik={p.ad} onKapat={onKapat}>
      <p className="rt-muted">{g.gonderen_ad} gönderdi · {p.tur === 'program' ? 'Program' : 'Kart'}</p>
      {p.tur === 'kart' && p.kart && (
        <>
          <BlokGoster bloklar={p.kart.bloklar} />
          <p className="rt-muted">{p.kart.gun_sayisi === null ? 'Süregelen' : p.kart.gun_sayisi === 1 ? 'Tek gün' : `${p.kart.gun_sayisi} gün`}</p>
        </>
      )}
      {p.tur === 'program' && p.program && (
        <>
          {p.program.amac && <p className="rt-metin"><b>Amaç:</b> {p.program.amac}</p>}
          <ul className="rt-maddeler">{p.program.adimlar.map((a, i) => <li key={i}>{a.ad} <span className="rt-muted">· {a.sure_gun ? `${a.sure_gun} gün` : 'süregelen'}</span></li>)}</ul>
        </>
      )}

      {mesaj ? <p className="rt-tamam">{mesaj}</p> : !g.alindi && (
        <>
          {p.tur === 'kart' && <label className="rt-alan"><span>Başlangıç günü</span><input className="rt-inp" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>}
          <div className="rt-satir">
            <button type="button" className="rt-btn primary" onClick={async () => { const r = await al(g.id, tarih); setMesaj(r.mesaj); }}>
              {p.tur === 'program' ? "Kişisel Gelişim'e al" : "Ajanda'ya al"}
            </button>
          </div>
        </>
      )}

      {silSor && <OnayKutusu metin="Gelenlerden silinsin mi?" evet="Sil" onVazgec={() => setSilSor(false)} onEvet={async () => { await gelenSil([g.id]); onKapat(); }} />}
      {!engelSor ? (
        <div className="rt-satir">
          <button type="button" className="rt-btn tehlike" onClick={() => setSilSor(true)}>Sil</button>
          <button type="button" className="rt-btn" onClick={() => setEngelSor(true)}>Göndereni engelle</button>
        </div>
      ) : (
        <div className="rt-satir">
          <span className="rt-muted">{g.gonderen_ad} artık sana gönderemeyecek.</span>
          <button type="button" className="rt-btn tehlike" onClick={async () => { await engelle(g.gonderen_id, g.gonderen_ad); setEngelSor(false); setMesaj('Engellendi.'); }}>Engelle</button>
          <button type="button" className="rt-btn" onClick={() => setEngelSor(false)}>Vazgeç</button>
        </div>
      )}
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
  const [modal, setModal] = useState<null | 'hesap' | 'cikis' | 'sifre' | 'kurtarma' | 'yedekAl' | 'yedekYukle'>(null);
  const [adDuzenle, setAdDuzenle] = useState<string | null>(null);
  const [engeller, setEngeller] = useState<{ engellenen: string; gorunen_ad: string | null }[]>([]);
  const sonYedekZamani = useCanli(() => sonYedek(), [], null as number | null);
  const uid = o.session?.user.id;

  useEffect(() => { if (uid && !o.kilitli) engellenenler().then(setEngeller); else setEngeller([]); }, [uid, o.kilitli]);
  const yedekEski = !sonYedekZamani || Date.now() - sonYedekZamani > 30 * 86400000;

  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      <h4>⚙️ Ayarlar</h4>
      <Kap baslik="Hesap">
        {!o.hazir ? null : !o.hesapli ? (
          <>
            <p className="rt-muted">Giriş yapmadın. Ritos hesapsız çalışır ve bu durumda hiçbir verin sunucuya gitmez. Başka cihazlarla eşitlemek ve paylaşmak için hesap gerekir.</p>
            <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={() => setModal('hesap')}>Giriş yap / Hesap oluştur</button></div>
          </>
        ) : o.kilitli ? (
          <>
            <p className="rt-metin">Oturumun kapanmış. Verin bu cihazda duruyor; eşitlemeye devam etmek için yeniden giriş yap.</p>
            <div className="rt-satir">
              <button type="button" className="rt-btn primary" onClick={() => setModal('hesap')}>Yeniden giriş yap</button>
              <button type="button" className="rt-btn" onClick={() => setModal('cikis')}>Çıkış yap</button>
            </div>
          </>
        ) : o.session && (
          <>
            {adDuzenle === null ? (
              <p className="rt-metin"><b>{o.gorunenAd ?? '—'}</b> <button type="button" className="rt-linkbtn" onClick={() => setAdDuzenle(o.gorunenAd ?? '')}>değiştir</button><br /><span className="rt-muted">{o.session.user.email}</span></p>
            ) : (
              <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
                <input className="rt-inp" value={adDuzenle} onChange={(e) => setAdDuzenle(e.target.value)} />
                <button type="button" className="rt-btn primary" disabled={!adDuzenle.trim()} onClick={async () => { await gorunenAdDegistir(o.session!.user.id, adDuzenle); setAdDuzenle(null); location.reload(); }}>Kaydet</button>
              </div>
            )}
            <p className="rt-muted">
              {d.hata ? <span className="rt-hata">⚠ {d.hata}</span> : d.son ? `Son eşitleme: ${zamanFarki(d.son)}` : 'Henüz eşitlenmedi'}
              {d.bekleyen > 0 && ` · ${d.bekleyen} değişiklik bekliyor`}
            </p>
            <div className="rt-satir">
              <button type="button" className="rt-btn" disabled={d.calisiyor} onClick={() => senkronla()}>{d.calisiyor ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button>
              <button type="button" className="rt-btn" onClick={() => setModal('kurtarma')}>Kurtarma anahtarı</button>
              <button type="button" className="rt-btn" onClick={() => setModal('sifre')}>Şifre değiştir</button>
              <button type="button" className="rt-btn" onClick={() => setModal('cikis')}>Çıkış yap</button>
            </div>
          </>
        )}
      </Kap>

      <PaketlerKap />

      <KilitAyarlari />

      <Kap baslik="Yedek">
        <p className="rt-muted">
          {sonYedekZamani ? `Son yedek: ${new Date(sonYedekZamani).toLocaleDateString('tr-TR')}` : 'Henüz yedek alınmadı.'}
          {' '}Yedek dosyası senin belirlediğin bir parolayla şifrelenir; onu kendi iCloud ya da Drive'ına koyabilirsin.
        </p>
        {!o.hesapli && yedekEski && <p className="rt-uyari">Hesabın olmadığı için verin yalnız bu cihazda. Telefon kaybolursa yedek dosyası tek kurtarma yolun.</p>}
        <div className="rt-satir">
          <button type="button" className="rt-btn" onClick={() => setModal('yedekAl')}>Yedek dosyası al</button>
          <button type="button" className="rt-btn" onClick={() => setModal('yedekYukle')}>Yedekten geri yükle</button>
        </div>
      </Kap>

      {o.session && !o.kilitli && (
        <Kap baslik="Engellenenler">
          {engeller.length === 0 ? <p className="rt-muted">Kimse engellenmedi.</p> : engeller.map((e) => (
            <div key={e.engellenen} className="rt-satir" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{e.gorunen_ad ?? 'Bilinmeyen'}</span>
              <button type="button" className="rt-btn" onClick={async () => { await engelKaldir(e.engellenen); setEngeller(await engellenenler()); }}>Engeli kaldır</button>
            </div>
          ))}
        </Kap>
      )}

      {modal === 'hesap' && <HesapModal onKapat={() => setModal(null)} />}
      {modal === 'cikis' && <CikisModal onKapat={() => setModal(null)} bekleyen={d.bekleyen} />}
      {modal === 'sifre' && <SifreModal onKapat={() => setModal(null)} />}
      {modal === 'kurtarma' && <KurtarmaIste onKapat={() => setModal(null)} />}
      {modal === 'yedekAl' && <YedekAlModal onKapat={() => setModal(null)} />}
      {modal === 'yedekYukle' && <YedekYukleModal onKapat={() => setModal(null)} hesapli={o.hesapli} />}
    </div>
  );
}

function CikisModal({ onKapat, bekleyen }: { onKapat: () => void; bekleyen: number }) {
  const [sil, setSil] = useState(false);
  const [bekle, setBekle] = useState(false);
  return (
    <Modal baslik="Çıkış yap" onKapat={onKapat}>
      <p className="rt-metin">Çıkış yapınca bu hesabın verisi ekrandan kalkar; hesapsız kullanımın verisi görünür.</p>
      {bekleyen > 0 && <p className="rt-uyari">{bekleyen} değişiklik henüz eşitlenmedi. İnternet varsa çıkıştan önce gönderilir.</p>}
      <label className="rt-onay"><input type="checkbox" checked={sil} onChange={(e) => setSil(e.target.checked)} /> Bu hesabın verisini bu cihazdan da sil</label>
      <p className="rt-muted">{sil ? 'Veri diğer cihazlarında ve şifreli kopyada kalır; bu cihaza yeniden giriş yapınca tekrar iner.' : 'Veri bu cihazda kalır; yeniden giriş hızlı olur. Uygulama kilidi (G10) korur.'}</p>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={bekle} onClick={async () => { setBekle(true); await cikisYap(sil); }}>{bekle ? 'Çıkılıyor…' : 'Çıkış yap'}</button>
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
      <p className="rt-metin">Yeni şifren diğer cihazlarda da geçerli. Verin yeniden şifrelenmedi; yalnız anahtarın yeni şifreyle korunuyor.</p>
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

function KurtarmaIste({ onKapat }: { onKapat: () => void }) {
  const [sifre, setSifre] = useState('');
  const [kelimeler, setKelimeler] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  if (kelimeler) return <KurtarmaGoster kelimeler={kelimeler} onTamam={onKapat} />;
  return (
    <Modal baslik="Kurtarma anahtarını göster" onKapat={onKapat}>
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

function YedekAlModal({ onKapat }: { onKapat: () => void }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [bekle, setBekle] = useState(false);
  const [tamam, setTamam] = useState(false);
  return (
    <Modal baslik="Yedek dosyası al" onKapat={onKapat}>
      {tamam ? (
        <>
          <p className="rt-metin">Dosya indirildi. Onu kendi bulutuna (iCloud, Drive) koy; parolasını da ayrı bir yerde sakla.</p>
          <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onKapat}>Tamam</button></div>
        </>
      ) : (
        <>
          <p className="rt-muted">Bu parola dosyayı açmak için gerekir. Unutursan yedek açılmaz.</p>
          <input className="rt-inp" type="password" placeholder={`Yedek parolası (en az ${SIFRE_EN_AZ})`} autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
          <input className="rt-inp" type="password" placeholder="Parola tekrar" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
          <div className="rt-satir">
            <button type="button" className="rt-btn primary" disabled={bekle || p1.length < SIFRE_EN_AZ || p1 !== p2}
              onClick={async () => { setBekle(true); try { await yedekAl(p1); setTamam(true); } finally { setBekle(false); } }}>{bekle ? 'Hazırlanıyor…' : 'İndir'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function YedekYukleModal({ onKapat, hesapli }: { onKapat: () => void; hesapli: boolean }) {
  const [dosya, setDosya] = useState<File | null>(null);
  const [parola, setParola] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [okunan, setOkunan] = useState<Awaited<ReturnType<typeof yedekOku>> | null>(null);
  return (
    <Modal baslik="Yedekten geri yükle" onKapat={onKapat}>
      {!okunan ? (
        <>
          <input className="rt-inp" type="file" accept=".ritos,application/octet-stream" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} />
          <input className="rt-inp" type="password" placeholder="Yedek parolası" value={parola} onChange={(e) => setParola(e.target.value)} />
          {hata && <p className="rt-hata">{hata}</p>}
          <div className="rt-satir">
            <button type="button" className="rt-btn primary" disabled={!dosya || !parola || bekle}
              onClick={async () => { setBekle(true); setHata(null); try { setOkunan(await yedekOku(dosya!, parola)); } catch (e) { setHata((e as Error).message); } finally { setBekle(false); } }}>{bekle ? 'Açılıyor…' : 'Aç'}</button>
          </div>
        </>
      ) : (
        <>
          <p className="rt-metin">{okunan.ozet}</p>
          <p className="rt-uyari">Bu cihazdaki mevcut veri yedekteki halle değiştirilecek{hesapli ? ' ve diğer cihazlarına da eşitlenecek' : ''}.</p>
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
            <button type="button" className="rt-btn tehlike" disabled={bekle} onClick={async () => { setBekle(true); await yedegiYukle(okunan.icerik); location.reload(); }}>Geri yükle</button>
          </div>
        </>
      )}
    </Modal>
  );
}

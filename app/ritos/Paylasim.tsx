'use client';

// Hesap (G1–G6), Paylaş (P1–P4), Gelenler (P5–P7, P10), Ayarlar › Hesap/Engellenenler.

import React, { useEffect, useState } from 'react';
import { db, type GelenRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { bugun } from '@/lib/paket';
import { cikisYap, girisYap, gorunenAdDegistir, kayitOl, kullaniciOnayla, useOturum } from '@/lib/hesap';
import { al, engelKaldir, engelle, engellenenler, gelenSil, gelenleriCek, gonder, kisiBul, type PaylasimPaketi } from '@/lib/paylasim';
import { supabase } from '@/lib/supabase';
import { BlokGoster, Chips, Kap, Modal } from './ortak';

// ———————————————— Hesap ————————————————

export function HesapModal({ onKapat, onTamam, neden }: { onKapat: () => void; onTamam?: () => void; neden?: string }) {
  const [kip, setKip] = useState<'giris' | 'kayit'>('giris');
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);
  const [uyari, setUyari] = useState(false);

  const gecerli = /\S+@\S+\.\S+/.test(eposta) && sifre.length >= 6 && (kip === 'giris' || ad.trim().length > 0);

  async function gonderForm() {
    setBekle(true); setHata(null);
    const r = kip === 'giris' ? await girisYap(eposta, sifre) : await kayitOl(ad, eposta, sifre);
    setBekle(false);
    if (!r.tamam) { setHata(r.hata); return; }
    if (r.baskaKullanici) { setUyari(true); return; }
    onTamam?.(); onKapat();
  }

  if (uyari) return (
    <Modal baslik="Bu cihazda başka bir hesap kullanılmıştı" onKapat={onKapat}>
      <p className="rt-metin">Ritos&apos;taki kartlar, programlar ve Gelenler bu cihazda durur ve hesaba bağlı değildir. Bu hesapla devam edersen önceki hesabın yerel verisini de görürsün.</p>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={async () => { await cikisYap(); onKapat(); }}>Çıkış yap</button>
        <button type="button" className="rt-btn primary" onClick={async () => {
          const { data } = await supabase()!.auth.getSession();
          if (data.session) await kullaniciOnayla(data.session.user.id);
          onTamam?.(); onKapat();
        }}>Devam et</button>
      </div>
    </Modal>
  );

  return (
    <Modal baslik={kip === 'giris' ? 'Giriş yap' : 'Hesap oluştur'} onKapat={onKapat}>
      {neden && <p className="rt-muted">{neden}</p>}
      <Chips secenekler={[['giris', 'Giriş'], ['kayit', 'Hesap oluştur']]} deger={kip} onSec={(k) => { setKip(k); setHata(null); }} />
      {kip === 'kayit' && <input className="rt-inp" placeholder="Görünen ad" value={ad} onChange={(e) => setAd(e.target.value)} />}
      <input className="rt-inp" type="email" placeholder="E-posta" autoComplete="email" value={eposta} onChange={(e) => setEposta(e.target.value)} />
      <input className="rt-inp" type="password" placeholder="Şifre (en az 6)" autoComplete={kip === 'giris' ? 'current-password' : 'new-password'} value={sifre}
        onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && gecerli && !bekle) gonderForm(); }} />
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn primary" disabled={!gecerli || bekle} onClick={gonderForm}>{bekle ? '…' : kip === 'giris' ? 'Giriş yap' : 'Hesap oluştur'}</button>
      </div>
      <p className="rt-muted">Hesap yalnızca paylaşmak için gerekir. Kartların ve programların bu cihazda kalır.</p>
    </Modal>
  );
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
  if (!o.session) return <HesapModal onKapat={onKapat} neden="Paylaşmak için bir hesap gerekiyor." onTamam={() => {}} />;
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
    const k = await kisiBul(eposta);
    if (!k) { setHata('Bu e-postayla bir Ritos hesabı bulunamadı.'); return; }
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
          <ul className="rt-liste">{p.program.adimlar.map((a, i) => <li key={i}>{a.ad} <span className="rt-muted">· {a.sure_gun ? `${a.sure_gun} gün` : 'süregelen'}</span></li>)}</ul>
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

      {!engelSor ? (
        <div className="rt-satir">
          <button type="button" className="rt-btn tehlike" onClick={async () => { if (confirm('Gelenlerden silinsin mi?')) { await gelenSil([g.id]); onKapat(); } }}>Sil</button>
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

export function AyarlarPane() {
  const o = useOturum();
  const [hesap, setHesap] = useState(false);
  const [adDuzenle, setAdDuzenle] = useState<string | null>(null);
  const [engeller, setEngeller] = useState<{ engellenen: string; gorunen_ad: string | null }[]>([]);
  const uid = o.session?.user.id;

  useEffect(() => { if (uid) engellenenler().then(setEngeller); else setEngeller([]); }, [uid]);

  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      <h4>⚙️ Ayarlar</h4>
      <Kap baslik="Hesap">
        {!o.hazir ? null : !o.session ? (
          <>
            <p className="rt-muted">Giriş yapmadın. Ritos hesapsız çalışır; paylaşmak ve almak için hesap gerekir.</p>
            <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={() => setHesap(true)}>Giriş yap / Hesap oluştur</button></div>
          </>
        ) : (
          <>
            {adDuzenle === null ? (
              <p className="rt-metin"><b>{o.gorunenAd ?? '—'}</b> <button type="button" className="rt-linkbtn" onClick={() => setAdDuzenle(o.gorunenAd ?? '')}>değiştir</button><br /><span className="rt-muted">{o.session.user.email}</span></p>
            ) : (
              <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
                <input className="rt-inp" value={adDuzenle} onChange={(e) => setAdDuzenle(e.target.value)} />
                <button type="button" className="rt-btn primary" disabled={!adDuzenle.trim()} onClick={async () => { await gorunenAdDegistir(o.session!.user.id, adDuzenle); setAdDuzenle(null); location.reload(); }}>Kaydet</button>
              </div>
            )}
            <div className="rt-satir"><button type="button" className="rt-btn" onClick={() => { if (confirm('Çıkış yapılsın mı? Bu cihazdaki kartların ve programların silinmez.')) cikisYap(); }}>Çıkış yap</button></div>
          </>
        )}
      </Kap>
      {o.session && (
        <Kap baslik="Engellenenler">
          {engeller.length === 0 ? <p className="rt-muted">Kimse engellenmedi.</p> : engeller.map((e) => (
            <div key={e.engellenen} className="rt-satir" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{e.gorunen_ad ?? 'Bilinmeyen'}</span>
              <button type="button" className="rt-btn" onClick={async () => { await engelKaldir(e.engellenen); setEngeller(await engellenenler()); }}>Engeli kaldır</button>
            </div>
          ))}
        </Kap>
      )}
      {hesap && <HesapModal onKapat={() => setHesap(false)} />}
    </div>
  );
}

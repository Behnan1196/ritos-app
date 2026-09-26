'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ayOzeti, degerKaydet, gununKartlari, kartKaldir, kartTasi, siraDegistir, teslimAl, yapildiAyarla, type GunSatiri } from '@/lib/ajanda';
import { useCanli } from '@/lib/canli';
import {
  GUN_KISA, PAKET_SURUM, TAM_IZIN, bugun, degerBloklari, tarihEkle, tarihEtiket, tarihParse, tarihStr,
  type Blok, type KartPaketi, type TemelTip,
} from '@/lib/paket';
import { BlokGoster, Chips, Kap, Modal, OnayKutusu, degerMetni } from './ortak';
import { PaylasDugmesi } from './Paylasim';
import { kartPaketi } from '@/lib/paylasim';

// A1–A9 (ilk dilim). Ajanda yalnızca kart satırlarını bilir; kaynağın içini bilmez.
export default function AjandaPane() {
  const [tarih, setTarih] = useState(bugun());
  const [ekleAcik, setEkleAcik] = useState(false);
  const [ayAcik, setAyAcik] = useState(false);
  const [detay, setDetay] = useState<GunSatiri | null>(null);
  const satirlar = useCanli(() => gununKartlari(tarih), [tarih], [] as GunSatiri[]);
  const t0 = bugun();

  return (
    <div className="rt-ajanda">
      <div className="rt-daterow">
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, -1))} aria-label="Önceki gün">‹</button>
        <button className="rt-dlabel" onClick={() => setAyAcik(true)}>
          {tarihEtiket(tarih)}
          {tarih !== t0 && <span className="rt-totoday" onClick={(e) => { e.stopPropagation(); setTarih(t0); }}>↺ bugüne dön</span>}
        </button>
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, 1))} aria-label="Sonraki gün">›</button>
      </div>

      <Kap
        baslik="Gün"
        eylemler={<button type="button" className="rt-ikon" onClick={() => setEkleAcik(true)} aria-label="Kart ekle">＋</button>}
      >
        {satirlar.length === 0 && <p className="rt-muted">Bu gün için kart yok.</p>}
        <SiraliListe satirlar={satirlar} tarih={tarih} onAc={setDetay} />
      </Kap>

      {ekleAcik && <HizliEkle tarih={tarih} onKapat={() => setEkleAcik(false)} />}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
      {detay && <KartDetay satir={detay} tarih={tarih} onKapat={() => setDetay(null)} />}
    </div>
  );
}

// A7 — sürükle-bırak sıralama. Pointer olaylarıyla (fare + dokunmatik) çalışır;
// sürükleme sırasında liste yerelde yeniden dizilir, bırakınca sıra kalıcı yazılır.
function SiraliListe({ satirlar, tarih, onAc }: { satirlar: GunSatiri[]; tarih: string; onAc: (s: GunSatiri) => void }) {
  const [yerel, setYerel] = useState<GunSatiri[] | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const liste = yerel ?? satirlar;

  useEffect(() => {
    if (!surukle) return;
    function onMove(e: PointerEvent) {
      setYerel((onceki) => {
        const l = [...(onceki ?? satirlar)];
        const i = l.findIndex((x) => x.kart.id === surukle);
        if (i < 0) return onceki;
        const [x] = l.splice(i, 1);
        let hedef = l.length;
        for (let j = 0; j < l.length; j++) {
          const el = refs.current.get(l[j].kart.id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { hedef = j; break; }
        }
        if (hedef === i) return onceki;
        l.splice(hedef, 0, x);
        return l;
      });
    }
    async function onUp() {
      const son = yerel;
      setSurukle(null);
      if (son) await siraDegistir(son.map((x) => x.kart.id));
      setYerel(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [surukle, satirlar, yerel]);

  return (
    <div className="rt-liste">
      {liste.map((s) => (
        <div key={s.kart.id} ref={(el) => { if (el) refs.current.set(s.kart.id, el); else refs.current.delete(s.kart.id); }} className={surukle === s.kart.id ? 'rt-suruklenen' : ''}>
          <KartSatiri
            satir={s}
            tarih={tarih}
            onAc={() => onAc(s)}
            tutamac={s.kart.izinler.sirala && liste.length > 1 ? (
              <span className="rt-tutamac" aria-label="Sürükleyerek sırala" onPointerDown={(e) => { e.preventDefault(); setYerel(liste); setSurukle(s.kart.id); }}>⋮⋮</span>
            ) : null}
          />
        </div>
      ))}
    </div>
  );
}

function KartSatiri({ satir, tarih, onAc, tutamac }: { satir: GunSatiri; tarih: string; onAc: () => void; tutamac?: React.ReactNode }) {
  const { kart, kayit } = satir;
  const bagli = kart.geri_bildirim !== 'yok';
  const yapildi = kayit?.yapildi ?? false;
  const [degerAcik, setDegerAcik] = useState(false);
  const [uygulaAcik, setUygulaAcik] = useState(false);
  const meta = [kart.saatler.join(' · '), bagli && kart.kaynak_etiket ? `🌱 ${kart.kaynak_etiket}` : ''].filter(Boolean).join(' · ');

  return (
    <div className={`rt-kart${bagli ? ' bagli' : ''}${yapildi ? ' yapildi' : ''}`}>
      <div className="rt-kart-ust">
        {kart.tip === 'oku' ? (
          <span className="rt-tipik" title="Oku">📖</span>
        ) : kart.tip === 'uygula' ? (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} onClick={() => setUygulaAcik(true)} aria-label="Başlat">{yapildi ? '✓' : '▶'}</button>
        ) : kart.tip === 'kaydet' ? (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} onClick={() => setDegerAcik((v) => !v)} aria-label="Değer gir">{yapildi ? '✓' : '✎'}</button>
        ) : (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} onClick={() => yapildiAyarla(kart.id, tarih, !yapildi)} aria-label="Yapıldı">{yapildi ? '✓' : ''}</button>
        )}
        <button type="button" className="rt-kart-ad" onClick={kart.izinler.ac ? onAc : undefined}>
          <span className="t">{kart.ad}</span>
          {meta && <span className="m">{meta}</span>}
          {(kart.tip === 'kaydet' || kart.tip === 'uygula') && kayit?.degerler && <span className="m">✓ {degerMetni(kayit.degerler)}</span>}
        </button>
        {tutamac}
      </div>
      {uygulaAcik && <Uygula satir={satir} tarih={tarih} onKapat={() => setUygulaAcik(false)} />}
      {degerAcik && kart.tip === 'kaydet' && (
        <DegerGir bloklar={kart.bloklar} ilk={kayit?.degerler ?? null} onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDegerAcik(false); }} />
      )}
    </div>
  );
}

function DegerGir({ bloklar, ilk, onKaydet }: { bloklar: Blok[]; ilk: Record<string, unknown> | null; onKaydet: (d: Record<string, unknown>) => void }) {
  const alanlar = degerBloklari(bloklar);
  const [d, setD] = useState<Record<string, string>>(() => Object.fromEntries(alanlar.map((a) => [a.anahtar, String(ilk?.[a.anahtar] ?? '')])));
  return (
    <div className="rt-deger">
      {alanlar.map((a) => (
        <label key={a.anahtar} className="rt-alan">
          <span>{a.etiket}{a.tur === 'sayi' && a.birim ? ` (${a.birim})` : ''}</span>
          {a.tur === 'secenek' ? (
            <select value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })}>
              <option value="">—</option>
              {a.secenekler.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <input className="rt-inp" inputMode={a.tur === 'sayi' ? 'decimal' : 'text'} value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })} />
          )}
        </label>
      ))}
      <button type="button" className="rt-btn primary" onClick={() => onKaydet(Object.fromEntries(alanlar.map((a) => [a.anahtar, a.tur === 'sayi' && d[a.anahtar] !== '' ? Number(d[a.anahtar]) : d[a.anahtar]])))}>Kaydet</button>
    </div>
  );
}

function HizliEkle({ tarih, onKapat }: { tarih: string; onKapat: () => void }) {
  const [tip, setTip] = useState<TemelTip>('yap');
  const [ad, setAd] = useState('');
  const [metin, setMetin] = useState('');
  const [url, setUrl] = useState('');
  const [saat, setSaat] = useState('');
  const [tekrar, setTekrar] = useState<'tek' | 'tekrar'>('tek');
  const [gunler, setGunler] = useState<number[]>([]);
  const [sure, setSure] = useState('');

  async function ekle() {
    if (!ad.trim()) return;
    const bloklar: Blok[] = [];
    if (metin.trim()) bloklar.push({ tur: 'metin', metin: metin.trim() });
    if (url.trim()) bloklar.push({ tur: /youtu|vimeo|instagram/.test(url) ? 'video' : 'baglanti', url: url.trim() });
    const n = Number(sure);
    const paket: KartPaketi = {
      surum: PAKET_SURUM,
      id: crypto.randomUUID(),
      tip,
      ad: ad.trim(),
      bloklar,
      zamanlama: {
        baslangic: tarih,
        bitis: tekrar === 'tek' ? tarih : sure && n > 0 ? tarihEkle(tarih, n - 1) : null,
        gunler: tekrar === 'tekrar' && gunler.length ? gunler : null,
        saatler: saat ? [saat] : [],
      },
      kaynak: { modul: 'ajanda', ref: null, etiket: null },
      sahip: 'ben',
      izinler: TAM_IZIN,
      geri_bildirim: 'yok',
    };
    await teslimAl([paket]);
    onKapat();
  }

  return (
    <Modal baslik="Kart ekle" onKapat={onKapat}>
      <Chips<TemelTip> secenekler={[['yap', 'Yap'], ['oku', 'Oku']]} deger={tip} onSec={setTip} />
      <input className="rt-inp" placeholder="Ad" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      <textarea className="rt-inp" placeholder={tip === 'oku' ? 'Metin' : 'Açıklama (isteğe bağlı)'} value={metin} onChange={(e) => setMetin(e.target.value)} rows={3} />
      {tip === 'oku' && <input className="rt-inp" placeholder="Video ya da bağlantı (isteğe bağlı)" value={url} onChange={(e) => setUrl(e.target.value)} />}
      <label className="rt-alan"><span>Saat (isteğe bağlı)</span><input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      <Chips<'tek' | 'tekrar'> secenekler={[['tek', 'Yalnız bu gün'], ['tekrar', 'Tekrarla']]} deger={tekrar} onSec={setTekrar} />
      {tekrar === 'tekrar' && (
        <>
          <div className="rt-chips">
            {GUN_KISA.map(([g, e]) => (
              <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>
            ))}
          </div>
          <input className="rt-inp" inputMode="numeric" placeholder="Süre (gün) — boş = süregelen" value={sure} onChange={(e) => setSure(e.target.value.replace(/\D/g, ''))} />
        </>
      )}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={ekle}>Ekle</button>
    </Modal>
  );
}

function KartDetay({ satir, tarih, onKapat }: { satir: GunSatiri; tarih: string; onKapat: () => void }) {
  const { kart } = satir;
  const bagli = kart.geri_bildirim !== 'yok';
  const tekrarli = kart.bitis !== kart.baslangic;
  const [tasiAcik, setTasiAcik] = useState(false);
  const [yeniTarih, setYeniTarih] = useState(tarihEkle(tarih, 1));
  const [silAcik, setSilAcik] = useState(false);
  const [tekSil, setTekSil] = useState(false);

  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar} />
      {bagli && <p className="rt-muted">Bu kart <b>{kart.kaynak_etiket}</b> programından geliyor; içeriği ve günü programdan yönetilir.</p>}

      {tekSil && <OnayKutusu metin="Kart silinsin mi?" evet="Sil" onVazgec={() => setTekSil(false)} onEvet={() => kartKaldir(kart.id, tarih, 'tamamen').then(onKapat)} />}
      {!bagli && !tasiAcik && !silAcik && !tekSil && (
        <div className="rt-satir">
          {kart.izinler.gun_degistir && <button type="button" className="rt-btn" onClick={() => setTasiAcik(true)}>Taşı</button>}
          <PaylasDugmesi paketUret={() => kartPaketi(kart)} />
          {kart.izinler.sil && <button type="button" className="rt-btn tehlike" onClick={() => (tekrarli ? setSilAcik(true) : setTekSil(true))}>Kaldır</button>}
        </div>
      )}

      {tasiAcik && (
        <>
          <label className="rt-alan"><span>Yeni gün</span><input className="rt-inp" type="date" value={yeniTarih} onChange={(e) => setYeniTarih(e.target.value)} /></label>
          {tekrarli && <p className="rt-muted">Seri bu günden itibaren aynı gün farkı kadar kayar; önceki günler yerinde kalır.</p>}
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setTasiAcik(false)}>Vazgeç</button>
            <button type="button" className="rt-btn primary" disabled={!yeniTarih || yeniTarih === tarih} onClick={async () => { await kartTasi(kart.id, tarih, yeniTarih); onKapat(); }}>Taşı</button>
          </div>
        </>
      )}

      {silAcik && (
        <div className="rt-satir">
          <button type="button" className="rt-btn" onClick={async () => { await kartKaldir(kart.id, tarih, 'yalniz_bugun'); onKapat(); }}>Yalnız bu gün</button>
          <button type="button" className="rt-btn tehlike" onClick={async () => { await kartKaldir(kart.id, tarih, 'seriyi_bitir'); onKapat(); }}>Seriyi bugünden bitir</button>
          <button type="button" className="rt-btn" onClick={() => setSilAcik(false)}>Vazgeç</button>
        </div>
      )}
    </Modal>
  );
}

function AyTakvimi({ secili, onSec, onKapat }: { secili: string; onSec: (t: string) => void; onKapat: () => void }) {
  const [ay, setAy] = useState(() => { const d = tarihParse(secili); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const ilk = new Date(ay.getFullYear(), ay.getMonth(), 1);
  const gunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
  const bosluk = (ilk.getDay() + 6) % 7; // Pazartesi başlangıç
  const tarihler = Array.from({ length: gunSayisi }, (_, i) => tarihStr(new Date(ay.getFullYear(), ay.getMonth(), i + 1)));
  const ozet = useCanli(() => ayOzeti(tarihler), [tarihler[0]], {} as Record<string, { toplam: number; yapildi: number }>);
  const t0 = bugun();

  return (
    <div className="rt-modal-bg" onClick={onKapat}>
      <div className="rt-ay" onClick={(e) => e.stopPropagation()}>
        <div className="rt-ay-hd">
          <button className="arrow" onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() - 1, 1))}>‹</button>
          <b>{ay.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</b>
          <button className="arrow" onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="rt-ay-grid">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((g) => <span key={g} className="rt-ay-gad">{g}</span>)}
          {Array.from({ length: bosluk }, (_, i) => <span key={`b${i}`} />)}
          {tarihler.map((t) => {
            const o = ozet[t];
            return (
              <button key={t} type="button" className={`rt-ay-gun${t === secili ? ' secili' : ''}${t === t0 ? ' bugun' : ''}`} onClick={() => onSec(t)}>
                <span>{tarihParse(t).getDate()}</span>
                {o && o.toplam > 0 && <span className={`rt-rozet${o.yapildi === o.toplam ? ' tam' : ''}`}>{o.yapildi}/{o.toplam}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// Uygula — zamanlayıcılı/rehberli pratik. Bitince süre değer olarak kaydedilir ve
// bağlı kartta sahibine (programa) geri bildirim olarak gider.
function Uygula({ satir, tarih, onKapat }: { satir: GunSatiri; tarih: string; onKapat: () => void }) {
  const { kart } = satir;
  const zb = kart.bloklar.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  const hedefSn = zb ? zb.dakika * 60 : null;
  const [gecen, setGecen] = useState(0);
  const [calisiyor, setCalisiyor] = useState(false);

  useEffect(() => {
    if (!calisiyor) return;
    const t = setInterval(() => setGecen((g) => g + 1), 1000);
    return () => clearInterval(t);
  }, [calisiyor]);

  useEffect(() => {
    if (hedefSn !== null && gecen >= hedefSn && calisiyor) setCalisiyor(false);
  }, [gecen, hedefSn, calisiyor]);

  const goster = hedefSn !== null ? Math.max(0, hedefSn - gecen) : gecen;
  const mmss = `${String(Math.floor(goster / 60)).padStart(2, '0')}:${String(goster % 60).padStart(2, '0')}`;
  const bitti = hedefSn !== null && gecen >= hedefSn;

  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar.filter((b) => b.tur !== 'zamanlayici')} />
      <div className={`rt-sayac${bitti ? ' bitti' : ''}`}>{mmss}</div>
      <div className="rt-satir">
        {!bitti && <button type="button" className="rt-btn" onClick={() => setCalisiyor((c) => !c)}>{calisiyor ? 'Duraklat' : gecen ? 'Devam' : 'Başla'}</button>}
        <button type="button" className="rt-btn primary" disabled={gecen === 0} onClick={async () => { await degerKaydet(kart.id, tarih, { sure_dk: Math.max(1, Math.round(gecen / 60)) }); onKapat(); }}>Bitir ve kaydet</button>
      </div>
    </Modal>
  );
}

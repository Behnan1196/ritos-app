'use client';

// ————————————————————————————————————————————————————————————————
// Tek kart + ekler (28 eylül). Ajanda'da kullanıcı tip seçmez: her kart bir yapılacaktır
// ve işaretlenir. İhtiyaca göre ekler takılır — Açıklama, Video/bağlantı, Tekrar, Saat;
// "Daha fazla" altında Süre kaydı, Değer kaydı, Zamanlayıcı. Rite'taki Aktivite kartının
// kararları korunur (tek kart, tekrar süreyle, randevu = saatli kart); kayıt ekleri yenidir.
// Aynı editör hem ekleme hem düzenleme için kullanılır.
// ————————————————————————————————————————————————————————————————

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { belgeBos, metindenBelge } from '@/lib/belge';
import { useCanli } from '@/lib/canli';
import { OLC_ONEK, olcuBlok, olcuEkle, olculer } from '@/lib/olcum';
import type { OlcuTanimRow } from '@/lib/db';
import { teslimAl, kartGuncelle } from '@/lib/ajanda';
import { GUN_KISA, PAKET_SURUM, TAM_IZIN, gunFarki, tarihEkle, type Blok, type KartPaketi } from '@/lib/paket';
import type { AjandaKartRow } from '@/lib/db';
import type { KocKartTaslak, KocTekrar } from '@/lib/danisanAjanda';
import { Modal } from './ortak';
import { GorevFormu, gorevTeslim, useSinavOzeti } from './Sinav';
import type { GorevTaslak } from '@/lib/sinavGorev';
import { V2 } from '@/lib/surum';

// Açıklama stilli (Tiptap, sade araç çubuğu) — madde, numaralı liste, checklist, kalın, vurgu.
const ZenginEditor = dynamic(() => import('./NotEditor').then((m) => m.ZenginEditor), { ssr: false, loading: () => <p className="rt-muted">…</p> });

type Ek = 'aciklama' | 'video' | 'tekrar' | 'saat' | 'sure' | 'olcum' | 'zamanlayici';
interface VideoSatir { url: string; baslik: string; bas: string; bit: string }

export const SURE_ANAHTAR = 'sure_dk';

/** "1:30" → 90, "90" → 90, boş → undefined */
function sn(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  if (t.includes(':')) {
    const [d, n] = t.split(':').map((x) => Number(x) || 0);
    return d * 60 + n;
  }
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}
const snMetin = (v?: number) => (v === undefined ? '' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`);
const videoMu = (url: string) => /youtu\.?be|vimeo|instagram/.test(url);

const SURE_SECENEK: [string, string][] = [['7', '1 hafta'], ['21', '21 gün'], ['', 'Süresiz']];

// onPlan verilirse kart Ajanda'ya doğrudan değil, bir plana (kişisel program) adım olarak eklenir;
// düzenlemede tekrar değiştirilmez (tekrarYok).
// tarihsiz: kütüphane kartı — tekrar ve saat yok (onlar "Ajandaya al"da seçilir).
export function KartEditor({ tarih, kart, onKapat, onPlan, tekrarYok, tarihsiz, baslik }: {
  tarih: string; kart?: AjandaKartRow; onKapat: () => void;
  onPlan?: (kart: KocKartTaslak, tekrar: KocTekrar | null) => Promise<void>; tekrarYok?: boolean; tarihsiz?: boolean; baslik?: string;
}) {
  if (tarihsiz) tekrarYok = true;
  // V1: sınav görevleri yalnız koçun planında; kişinin kendi Ajanda'sında yok (V2'de açılır).
  const sinavKurulu = V2 && !kart && useSinavOzeti().kurulu; // eslint-disable-line react-hooks/rules-of-hooks
  const [sinav, setSinav] = useState(false);
  const [gorev, setGorev] = useState<GorevTaslak | null>(null);

  const b0 = kart?.bloklar ?? [];
  const sayilar = b0.filter((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi');
  const surB = sayilar.find((b) => b.anahtar === SURE_ANAHTAR);
  // Eski "Değer kaydı" (anahtar 'deger') kartları olduğu gibi korunur; yeni kartlar ölçü kullanır.
  const eskiDeg = sayilar.find((b) => b.anahtar === 'deger');
  const olc0 = sayilar.filter((b) => b.anahtar.startsWith(OLC_ONEK));
  const zamB = b0.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  const tekrarli0 = !!kart && kart.bitis !== kart.baslangic;
  const sure0 = kart && tekrarli0 && kart.bitis ? String(gunFarki(kart.baslangic, kart.bitis) + 1) : kart && tekrarli0 ? '' : '21';

  const [ad, setAd] = useState(kart?.ad ?? '');
  const [hataM, setHataM] = useState<string | null>(null);
  const [aciklama, setAciklama] = useState<object | null>(() => {
    const bb = b0.find((b): b is Extract<Blok, { tur: 'belge' }> => b.tur === 'belge');
    if (bb) return bb.belge as object;
    const m = b0.filter((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin').map((b) => b.metin).join('\n\n');
    return m ? metindenBelge(m) : null;   // eski düz açıklama belgeye çevrilir
  });
  const [videolar, setVideolar] = useState<VideoSatir[]>(
    b0.filter((b): b is Extract<Blok, { tur: 'video' | 'baglanti' }> => b.tur === 'video' || b.tur === 'baglanti')
      .map((b) => ({ url: b.url, baslik: b.baslik ?? '', bas: b.tur === 'video' ? snMetin(b.bas) : '', bit: b.tur === 'video' ? snMetin(b.bit) : '' })),
  );
  const [tekrar, setTekrar] = useState(tekrarli0);
  const [gunler, setGunler] = useState<number[]>(kart?.gunler ?? []);
  const [sure, setSure] = useState(sure0);
  const [saat, setSaat] = useState(kart?.saatler[0] ?? '');
  const [sureKaydi, setSureKaydi] = useState(!!surB || !!zamB);
  const tanimlar = useCanli(olculer, [], [] as OlcuTanimRow[]);
  const [seciliOlcu, setSeciliOlcu] = useState<Pick<OlcuTanimRow, 'id' | 'ad' | 'birim'>[]>(
    olc0.map((b) => ({ id: b.anahtar.slice(OLC_ONEK.length), ad: b.etiket, birim: b.birim ?? '' })),
  );
  const [eskiDegKalsin, setEskiDegKalsin] = useState(!!eskiDeg);
  const [yeniOlcu, setYeniOlcu] = useState<{ ad: string; birim: string } | null>(null);
  const [zamanDk, setZamanDk] = useState(zamB ? (zamB.dakika > 0 ? String(zamB.dakika) : '') : '');
  const [zamanlayici, setZamanlayici] = useState(!!zamB);

  // Hangi ek bölümleri açık: doluysa açık gelir, yoksa çipe dokununca açılır.
  const [acik, setAcik] = useState<Set<Ek>>(() => {
    const s = new Set<Ek>();
    if (aciklama && !belgeBos(aciklama)) s.add('aciklama');
    if (videolar.length) s.add('video');
    if (tekrarli0) s.add('tekrar');
    if (kart?.saatler.length) s.add('saat');
    if (surB || zamB) s.add('sure');
    if (olc0.length || eskiDeg) s.add('olcum');
    if (zamB) s.add('zamanlayici');
    return s;
  });
  const [dahaFazla, setDahaFazla] = useState(!!(surB || olc0.length || eskiDeg || zamB));
  const ac = (e: Ek) => {
    setAcik((s) => new Set(s).add(e));
    if (e === 'tekrar') setTekrar(true);
    if (e === 'video' && !videolar.length) setVideolar([{ url: '', baslik: '', bas: '', bit: '' }]);
    if (e === 'sure') setSureKaydi(true);
    if (e === 'zamanlayici') { setZamanlayici(true); setSureKaydi(true); setAcik((s) => new Set(s).add('sure')); }
  };
  const kapat = (e: Ek) => {
    setAcik((s) => { const n = new Set(s); n.delete(e); return n; });
    if (e === 'aciklama') setAciklama(null);
    if (e === 'video') setVideolar([]);
    if (e === 'tekrar') { setTekrar(false); setGunler([]); }
    if (e === 'saat') setSaat('');
    if (e === 'sure') { setSureKaydi(false); setZamanlayici(false); setAcik((s) => { const n = new Set(s); n.delete('zamanlayici'); return n; }); }
    if (e === 'olcum') { setSeciliOlcu([]); setEskiDegKalsin(false); setYeniOlcu(null); }
    if (e === 'zamanlayici') setZamanlayici(false);
  };

  function bloklarUret(): Blok[] {
    const b: Blok[] = [];
    if (aciklama && !belgeBos(aciklama)) b.push({ tur: 'belge', belge: aciklama });
    for (const v of videolar) {
      const url = v.url.trim();
      if (!url) continue;
      if (videoMu(url)) b.push({ tur: 'video', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}), ...(sn(v.bas) !== undefined ? { bas: sn(v.bas) } : {}), ...(sn(v.bit) !== undefined ? { bit: sn(v.bit) } : {}) });
      else b.push({ tur: 'baglanti', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}) });
    }
    if (sureKaydi) b.push({ tur: 'sayi', anahtar: SURE_ANAHTAR, etiket: 'Kaç dakika?', birim: 'dk' });
    if (eskiDeg && eskiDegKalsin) b.push(eskiDeg);
    for (const o of seciliOlcu) b.push(olcuBlok(o));
    if (zamanlayici) b.push({ tur: 'zamanlayici', dakika: Number(zamanDk) || 0 });
    return b;
  }

  function zamanlama(bas: string) {
    const n = Number(sure);
    return {
      baslangic: bas,
      bitis: !tekrar ? bas : sure && n > 0 ? tarihEkle(bas, n - 1) : null,
      gunler: tekrar && gunler.length && gunler.length < 7 ? gunler : null,
      saatler: saat ? [saat] : [],
    };
  }

  async function kaydet() {
    if (sinav) {
      if (!gorev) return;
      const z = zamanlama(tarih);
      await gorevTeslim(gorev, tarih, saat, z.bitis, z.gunler);
      onKapat();
      return;
    }
    if (!ad.trim()) return;
    if (onPlan) {
      const n = Number(sure);
      const tk: KocTekrar | null = tekrar && !tekrarYok ? { gun: sure && n > 0 ? n : null, gunler: gunler.length && gunler.length < 7 ? gunler : null } : null;
      try { await onPlan({ tip: 'yap', ad: ad.trim(), bloklar: bloklarUret(), saatler: saat ? [saat] : [] }, tk); onKapat(); } catch (e) { setHataM((e as Error).message); }
      return;
    }
    if (kart) {
      const z = zamanlama(kart.baslangic);
      await kartGuncelle(kart.id, { tip: 'yap', ad: ad.trim(), bloklar: bloklarUret(), bitis: z.bitis, gunler: z.gunler, saatler: z.saatler });
    } else {
      const paket: KartPaketi = {
        surum: PAKET_SURUM,
        id: crypto.randomUUID(),
        tip: 'yap',
        ad: ad.trim(),
        bloklar: bloklarUret(),
        zamanlama: zamanlama(tarih),
        kaynak: { modul: 'ajanda', ref: null, etiket: null },
        sahip: 'ben',
        izinler: TAM_IZIN,
        geri_bildirim: 'yok',
      };
      await teslimAl([paket]);
    }
    onKapat();
  }

  const cip = (e: Ek, etiket: string) => !acik.has(e) && (
    <button key={e} type="button" className="rt-chip rt-ek-cip" onClick={() => ac(e)}>{etiket}</button>
  );
  const bolum = (e: Ek, baslik: string, ic: React.ReactNode) => acik.has(e) && (
    <div className="rt-ek">
      <div className="rt-ek-hd"><span>{baslik}</span><button type="button" className="rt-x" onClick={() => kapat(e)} aria-label={`${baslik} kaldır`}>×</button></div>
      {ic}
    </div>
  );

  return (
    <Modal baslik={baslik ?? (kart ? 'Kartı düzenle' : 'Kart ekle')} onKapat={onKapat}>
      {sinavKurulu && (
        <div className="rt-chips">
          <button type="button" className={`rt-chip${!sinav ? ' on' : ''}`} onClick={() => setSinav(false)}>Kart</button>
          <button type="button" className={`rt-chip${sinav ? ' on' : ''}`} onClick={() => setSinav(true)}>📚 Sınav görevi</button>
        </div>
      )}
      {sinav ? <GorevFormu onChange={setGorev} /> : (
        <input className="rt-inp rt-ek-ad" placeholder="Ne yapacaksın? (örn. Tai chi serisi)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus={!kart} onKeyDown={(e) => { if (e.key === 'Enter' && ad.trim()) kaydet(); }} />
      )}

      {!sinav && bolum('aciklama', '📝 Açıklama', (
        <ZenginEditor icerik={aciklama} kompakt placeholder="Notun, adımlar… ( - madde, [ ] yapılacak )" onDegis={(b) => setAciklama(b)} />
      ))}

      {!sinav && bolum('video', '🎬 Video / bağlantı', (
        <>
          {videolar.map((v, i) => {
            const guncelle = (p: Partial<VideoSatir>) => setVideolar(videolar.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <div key={i} className="rt-ek-video">
                <div className="rt-satir">
                  <input className="rt-inp" placeholder="YouTube ya da bağlantı" value={v.url} onChange={(e) => guncelle({ url: e.target.value })} />
                  <button type="button" className="rt-x" onClick={() => setVideolar(videolar.filter((_, j) => j !== i))} aria-label="Sil">×</button>
                </div>
                {v.url.trim() && (
                  <div className="rt-satir">
                    <input className="rt-inp" placeholder="Başlık (isteğe bağlı)" value={v.baslik} onChange={(e) => guncelle({ baslik: e.target.value })} />
                    {videoMu(v.url) && <>
                      <input className="rt-inp rt-kisa" placeholder="Baş 0:00" value={v.bas} onChange={(e) => guncelle({ bas: e.target.value })} />
                      <input className="rt-inp rt-kisa" placeholder="Bit 0:00" value={v.bit} onChange={(e) => guncelle({ bit: e.target.value })} />
                    </>}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="rt-link-btn" onClick={() => setVideolar([...videolar, { url: '', baslik: '', bas: '', bit: '' }])}>＋ Bir video daha</button>
        </>
      ))}

      {!tekrarYok && bolum('tekrar', '🔁 Tekrar', (
        <>
          <div className="rt-chips">
            <button type="button" className={`rt-chip${!gunler.length ? ' on' : ''}`} onClick={() => setGunler([])}>Her gün</button>
            {GUN_KISA.map(([g, e]) => (
              <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>
            ))}
          </div>
          <div className="rt-chips">
            <span className="rt-muted">Ne kadar:</span>
            {SURE_SECENEK.map(([v, e]) => (
              <button key={e} type="button" className={`rt-chip${sure === v ? ' on' : ''}`} onClick={() => setSure(v)}>{e}</button>
            ))}
            <input className="rt-inp rt-kisa" inputMode="numeric" placeholder="gün" value={SURE_SECENEK.some(([v]) => v === sure) ? '' : sure} onChange={(e) => setSure(e.target.value.replace(/\D/g, ''))} />
          </div>
        </>
      ))}

      {!tarihsiz && bolum('saat', '🕐 Saat', (
        <input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} />
      ))}

      {!sinav && bolum('sure', '⏱ Süre kaydı', (
        <p className="rt-muted">İşaretlerken "Kaç dakika?" diye sorulur{zamanlayici ? '; zamanlayıcıyla yaparsan kendiliğinden yazılır' : ''}.</p>
      ))}

      {!sinav && bolum('zamanlayici', '⏲ Zamanlayıcı', (
        <input className="rt-inp" inputMode="numeric" placeholder="Dakika — boş bırakırsan serbest süre" value={zamanDk} onChange={(e) => setZamanDk(e.target.value.replace(/\D/g, ''))} />
      ))}

      {!sinav && bolum('olcum', '📏 Ölçüm', (
        <>
          <div className="rt-chips">
            {eskiDeg && (
              <button type="button" className={`rt-chip${eskiDegKalsin ? ' on' : ''}`} onClick={() => setEskiDegKalsin(!eskiDegKalsin)}>{eskiDeg.etiket}{eskiDeg.birim ? ` (${eskiDeg.birim})` : ''}</button>
            )}
            {[...tanimlar, ...seciliOlcu.filter((o) => !tanimlar.some((t) => t.id === o.id))].map((t) => {
              const on = seciliOlcu.some((o) => o.id === t.id);
              return (
                <button key={t.id} type="button" className={`rt-chip${on ? ' on' : ''}`} onClick={() => setSeciliOlcu(on ? seciliOlcu.filter((o) => o.id !== t.id) : [...seciliOlcu, { id: t.id, ad: t.ad, birim: t.birim }])}>
                  {t.ad}{t.birim ? ` (${t.birim})` : ''}
                </button>
              );
            })}
            {!yeniOlcu && <button type="button" className="rt-chip rt-ek-cip" onClick={() => setYeniOlcu({ ad: '', birim: '' })}>＋ Yeni ölçü</button>}
          </div>
          {yeniOlcu && (
            <div className="rt-satir">
              <input className="rt-inp" placeholder="Ölçü adı (örn. Tansiyon)" value={yeniOlcu.ad} onChange={(e) => setYeniOlcu({ ...yeniOlcu, ad: e.target.value })} autoFocus />
              <input className="rt-inp rt-kisa" placeholder="Birim" value={yeniOlcu.birim} onChange={(e) => setYeniOlcu({ ...yeniOlcu, birim: e.target.value })} />
              <button type="button" className="rt-btn" disabled={!yeniOlcu.ad.trim()} onClick={async () => { const t = await olcuEkle(yeniOlcu.ad, yeniOlcu.birim); setSeciliOlcu([...seciliOlcu, t]); setYeniOlcu(null); }}>Ekle</button>
            </div>
          )}
          <p className="rt-muted">İşaretlerken seçtiğin ölçüler sorulur; değerler Ölçümlerim'de birikir.</p>
        </>
      ))}

      <div className="rt-chips rt-ek-cipler">
        {!sinav && cip('aciklama', '📝 Açıklama')}
        {!sinav && cip('video', '🎬 Video')}
        {!tekrarYok && cip('tekrar', '🔁 Tekrar')}
        {!tarihsiz && cip('saat', '🕐 Saat')}
        {!sinav && !dahaFazla && <button type="button" className="rt-chip rt-ek-cip" onClick={() => setDahaFazla(true)}>＋ Daha fazla</button>}
        {!sinav && dahaFazla && cip('sure', '⏱ Süre kaydı')}
        {!sinav && dahaFazla && cip('zamanlayici', '⏲ Zamanlayıcı')}
        {!sinav && dahaFazla && cip('olcum', '📏 Ölçüm')}
      </div>

      {hataM && <p className="rt-hata">⚠ {hataM}</p>}
      <button type="button" className="rt-btn primary" disabled={sinav ? !gorev : !ad.trim() || (acik.has('olcum') && !seciliOlcu.length && !(eskiDeg && eskiDegKalsin))} onClick={kaydet}>{kart ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

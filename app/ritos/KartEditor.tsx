'use client';

// ————————————————————————————————————————————————————————————————
// Kart editörü (30 eylül — taslakla tasarlandı). Ajanda'da kullanıcı tip seçmez: her kart bir
// yapılacaktır. Yapı iki bölüm:
//   1) İçerik — başlığın altındaki şeritten eklenir: Açıklama, Video, Kayıt. Her biri BİR kez;
//      eklendiği sırayla dizilir, ⋯ ile taşınır ya da silinir (silince "Geri al"). Kart yukarıdan
//      aşağı bir akış gibi okunur: izle, oku, süreyi başlat, bitince kaydet.
//      · Video: birden fazla video alternatiftir (Rite'taki çoklu video) — kartta sekme olur.
//      · Kayıt: Süre (isteğe bağlı hedefle geri sayım; ⏱ ile ölçülüp kendiliğinden yazılır) ve/veya Ölçüm.
//        Ayrı "zamanlayıcı" yok: sayaç, süre kaydının parçası.
//   2) Zaman — tek satır ikon: 📅 tarih (değiştirmek = taşımak), 🕐 saat, 🔁 tekrar, 🔔 bildirim.
//      Boş olan soluk durur; dokununca ayarı hemen altında açılır.
// Aynı editör ekleme, düzenleme, plan (onPlan) ve kütüphane (tarihsiz) için kullanılır.
// Veri modeli değişmedi: içerik sırası `bloklar` dizisinin sırasıdır.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { belgeBos, metindenBelge } from '@/lib/belge';
import { useCanli } from '@/lib/canli';
import { OLC_ONEK, olcuBlok, olcuEkle, olculer } from '@/lib/olcum';
import type { OlcuTanimRow } from '@/lib/db';
import { teslimAl, kartGuncelle, kartTasi } from '@/lib/ajanda';
import { GUN_KISA, PAKET_SURUM, TAM_IZIN, gunFarki, tarihEkle, tarihParse, type Blok, type Hatirlatma, type KartPaketi } from '@/lib/paket';
import type { AjandaKartRow } from '@/lib/db';
import type { KocKartTaslak, KocTekrar } from '@/lib/danisanAjanda';
import { Modal } from './ortak';
import { GorevFormu, gorevTeslim, useSinavOzeti } from './Sinav';
import type { GorevTaslak } from '@/lib/sinavGorev';
import { V2 } from '@/lib/surum';

// Açıklama stilli (Tiptap, sade araç çubuğu) — madde, numaralı liste, checklist, kalın, vurgu, tablo.
const ZenginEditor = dynamic(() => import('./NotEditor').then((m) => m.ZenginEditor), { ssr: false, loading: () => <p className="rt-muted">…</p> });

type Icerik = 'aciklama' | 'video' | 'kayit';
type Panel = 'tarih' | 'saat' | 'tekrar' | 'bildirim';
interface VideoSatir { url: string; baslik: string; bas: string; bit: string }
const ICERIK: [Icerik, string][] = [['aciklama', '📝 Açıklama'], ['video', '🎬 Video'], ['kayit', '📊 Kayıt']];
const BOS_VIDEO: VideoSatir = { url: '', baslik: '', bas: '', bit: '' };
const HEDEFLER = [5, 10, 15, 20, 30, 45];

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

const AY_K = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN_K = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export function kisaTarih(t: string) { const d = tarihParse(t); return `${d.getDate()} ${AY_K[d.getMonth()]} ${GUN_K[d.getDay()]}`; }

/** Bildirimin kısa metni — satırda ve zaman ikonunda. */
export function bildirimMetni(h: Hatirlatma | null | undefined, saat: string | undefined): string | null {
  if (!h) return null;
  if (h.gun === 0) return saat ? (h.dk ? `${h.dk >= 60 ? `${h.dk / 60} sa` : `${h.dk} dk`} önce` : 'vaktinde') : (h.saat ?? '09:00');
  return `${h.gun === 7 ? '1 hafta' : `${h.gun} gün`} önce ${h.saat ?? '20:00'}`;
}

// Kayıtlı bloklardan içerik sırası: her türün ilk göründüğü yer.
function ilkSira(b0: Blok[]): Icerik[] {
  const s: Icerik[] = [];
  for (const b of b0) {
    const t: Icerik | null = b.tur === 'belge' || b.tur === 'metin' ? 'aciklama'
      : b.tur === 'video' || b.tur === 'baglanti' ? 'video'
      : b.tur === 'sayi' || b.tur === 'zamanlayici' ? 'kayit' : null;
    if (t && !s.includes(t)) s.push(t);
  }
  return s;
}

// onPlan verilirse kart Ajanda'ya doğrudan değil, bir plana (kişisel program / danışan) eklenir;
// orada tarih sürüklemeyle değişir, bildirim yok. tekrarYok: tekrar değiştirilmez.
// tarihsiz: kütüphane kartı — zaman bölümü yok (tarih, saat, tekrar "Ajandaya al"da seçilir).
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

  // ——— içerik ———
  const [aciklama, setAciklama] = useState<object | null>(() => {
    const bb = b0.find((b): b is Extract<Blok, { tur: 'belge' }> => b.tur === 'belge');
    if (bb) return bb.belge as object;
    const m = b0.filter((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin').map((b) => b.metin).join('\n\n');
    return m ? metindenBelge(m) : null;   // eski düz açıklama belgeye çevrilir
  });
  const [sira, setSira] = useState<Icerik[]>(() => ilkSira(b0).filter((t) => t !== 'aciklama' || (aciklama && !belgeBos(aciklama))));
  const [videolar, setVideolar] = useState<VideoSatir[]>(
    b0.filter((b): b is Extract<Blok, { tur: 'video' | 'baglanti' }> => b.tur === 'video' || b.tur === 'baglanti')
      .map((b) => ({ url: b.url, baslik: b.baslik ?? '', bas: b.tur === 'video' ? snMetin(b.bas) : '', bit: b.tur === 'video' ? snMetin(b.bit) : '' })),
  );
  const [vsec, setVsec] = useState(0);
  const [sureKaydi, setSureKaydi] = useState(!!surB || !!zamB);
  const [hedef, setHedef] = useState(zamB && zamB.dakika > 0 ? String(zamB.dakika) : '');
  const tanimlar = useCanli(olculer, [], [] as OlcuTanimRow[]);
  const [seciliOlcu, setSeciliOlcu] = useState<Pick<OlcuTanimRow, 'id' | 'ad' | 'birim'>[]>(
    olc0.map((b) => ({ id: b.anahtar.slice(OLC_ONEK.length), ad: b.etiket, birim: b.birim ?? '' })),
  );
  const [eskiDegKalsin, setEskiDegKalsin] = useState(!!eskiDeg);
  const [olcumAcik, setOlcumAcik] = useState(olc0.length > 0 || !!eskiDeg);
  const [yeniOlcu, setYeniOlcu] = useState<{ ad: string; birim: string } | null>(null);
  const [menu, setMenu] = useState<Icerik | null>(null);
  const [geri, setGeri] = useState<{ t: Icerik; i: number; veri: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (!geri) return;
    const tm = setTimeout(() => setGeri(null), 6000);
    return () => clearTimeout(tm);
  }, [geri]);

  // ——— zaman ———
  const [tarihSec, setTarihSec] = useState(tarih);
  const [tekrar, setTekrar] = useState(tekrarli0);
  const [gunler, setGunler] = useState<number[]>(kart?.gunler ?? []);
  const [belirliGun, setBelirliGun] = useState(!!kart?.gunler?.length);
  const [sure, setSure] = useState(sure0);
  const [saat, setSaat] = useState(kart?.saatler[0] ?? '');
  const [hatirlatma, setHatirlatma] = useState<Hatirlatma | null>(kart?.hatirlatma ?? null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const tarihGoster = !onPlan && (!kart || kart.izinler.gun_degistir);
  const bildirimGoster = !onPlan && !sinav;

  function ekle(t: Icerik) {
    setSira([...sira, t]);
    setMenu(null);
    if (t === 'video' && !videolar.length) { setVideolar([{ ...BOS_VIDEO }]); setVsec(0); }
    if (t === 'kayit' && !sureKaydi && !seciliOlcu.length && !eskiDegKalsin) setSureKaydi(true);
  }
  function tasi(t: Icerik, yon: -1 | 1) {
    const i = sira.indexOf(t), j = i + yon;
    if (j < 0 || j >= sira.length) return;
    const n = [...sira];
    [n[i], n[j]] = [n[j], n[i]];
    setSira(n);
    setMenu(null);
  }
  function sil(t: Icerik) {
    const veri: Record<string, unknown> = t === 'aciklama' ? { aciklama } : t === 'video' ? { videolar, vsec } : { sureKaydi, hedef, seciliOlcu, eskiDegKalsin, olcumAcik };
    setGeri({ t, i: sira.indexOf(t), veri });
    setSira(sira.filter((x) => x !== t));
    if (t === 'aciklama') setAciklama(null);
    else if (t === 'video') { setVideolar([]); setVsec(0); }
    else { setSureKaydi(false); setHedef(''); setSeciliOlcu([]); setEskiDegKalsin(false); setOlcumAcik(false); setYeniOlcu(null); }
    setMenu(null);
  }
  function geriAl() {
    if (!geri) return;
    const { t, i, veri } = geri;
    setSira((s) => { const n = [...s]; n.splice(i, 0, t); return n; });
    if (t === 'aciklama') setAciklama(veri.aciklama as object | null);
    else if (t === 'video') { setVideolar(veri.videolar as VideoSatir[]); setVsec(veri.vsec as number); }
    else {
      setSureKaydi(veri.sureKaydi as boolean); setHedef(veri.hedef as string); setSeciliOlcu(veri.seciliOlcu as typeof seciliOlcu);
      setEskiDegKalsin(veri.eskiDegKalsin as boolean); setOlcumAcik(veri.olcumAcik as boolean);
    }
    setGeri(null);
  }

  function bloklarUret(): Blok[] {
    const b: Blok[] = [];
    for (const t of sira) {
      if (t === 'aciklama') { if (aciklama && !belgeBos(aciklama)) b.push({ tur: 'belge', belge: aciklama }); }
      else if (t === 'video') {
        for (const v of videolar) {
          const url = v.url.trim();
          if (!url) continue;
          if (videoMu(url)) b.push({ tur: 'video', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}), ...(sn(v.bas) !== undefined ? { bas: sn(v.bas) } : {}), ...(sn(v.bit) !== undefined ? { bit: sn(v.bit) } : {}) });
          else b.push({ tur: 'baglanti', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}) });
        }
      } else {
        if (sureKaydi) {
          b.push({ tur: 'sayi', anahtar: SURE_ANAHTAR, etiket: 'Kaç dakika?', birim: 'dk' });
          if (Number(hedef) > 0) b.push({ tur: 'zamanlayici', dakika: Number(hedef) });
        }
        if (eskiDeg && eskiDegKalsin) b.push(eskiDeg);
        for (const o of seciliOlcu) b.push(olcuBlok(o));
      }
    }
    return b;
  }

  function zamanlama(bas: string) {
    const n = Number(sure);
    const secili = belirliGun && gunler.length && gunler.length < 7 ? gunler : null;
    return {
      baslangic: bas,
      bitis: !tekrar ? bas : sure && n > 0 ? tarihEkle(bas, n - 1) : null,
      gunler: tekrar ? secili : null,
      saatler: saat ? [saat] : [],
      hatirlatma: bildirimGoster ? hatirlatma : null,
    };
  }

  const kayitEksik = sira.includes('kayit') && !sureKaydi && !seciliOlcu.length && !(eskiDeg && eskiDegKalsin);

  async function kaydet() {
    if (sinav) {
      if (!gorev) return;
      const z = zamanlama(tarihSec);
      await gorevTeslim(gorev, tarihSec, saat, z.bitis, z.gunler);
      onKapat();
      return;
    }
    if (!ad.trim() || kayitEksik) return;
    if (onPlan) {
      const n = Number(sure);
      const tk: KocTekrar | null = tekrar && !tekrarYok ? { gun: sure && n > 0 ? n : null, gunler: belirliGun && gunler.length && gunler.length < 7 ? gunler : null } : null;
      try { await onPlan({ tip: 'yap', ad: ad.trim(), bloklar: bloklarUret(), saatler: saat ? [saat] : [] }, tk); onKapat(); } catch (e) { setHataM((e as Error).message); }
      return;
    }
    if (kart) {
      const z = zamanlama(kart.baslangic);
      await kartGuncelle(kart.id, { tip: 'yap', ad: ad.trim(), bloklar: bloklarUret(), bitis: z.bitis, gunler: z.gunler, saatler: z.saatler, hatirlatma: z.hatirlatma });
      if (tarihGoster && tarihSec && tarihSec !== tarih) await kartTasi(kart.id, tarih, tarihSec);
    } else {
      const paket: KartPaketi = {
        surum: PAKET_SURUM,
        id: crypto.randomUUID(),
        tip: 'yap',
        ad: ad.trim(),
        bloklar: bloklarUret(),
        zamanlama: zamanlama(tarihSec || tarih),
        kaynak: { modul: 'ajanda', ref: null, etiket: null },
        sahip: 'ben',
        izinler: TAM_IZIN,
        geri_bildirim: 'yok',
      };
      await teslimAl([paket]);
    }
    onKapat();
  }

  // ——— içerik blokları ———
  const v = videolar[vsec];
  const vGuncelle = (p: Partial<VideoSatir>) => setVideolar(videolar.map((x, j) => (j === vsec ? { ...x, ...p } : x)));

  function icerikGovde(t: Icerik) {
    if (t === 'aciklama') return <ZenginEditor icerik={aciklama} kompakt placeholder="Notun, adımlar… ( - madde, [ ] yapılacak )" onDegis={(b) => setAciklama(b)} />;
    if (t === 'video') return (
      <>
        <div className="rt-chips">
          {videolar.map((x, i) => (
            <button key={i} type="button" className={`rt-chip${i === vsec ? ' on' : ''}`} onClick={() => setVsec(i)}>{x.baslik.trim() || `Video ${i + 1}`}</button>
          ))}
          <button type="button" className="rt-chip rt-ek-cip" onClick={() => { setVideolar([...videolar, { ...BOS_VIDEO }]); setVsec(videolar.length); }}>＋ Alternatif</button>
        </div>
        {v && (
          <>
            <input className="rt-inp" placeholder="YouTube ya da bağlantı" value={v.url} onChange={(e) => vGuncelle({ url: e.target.value })} />
            <input className="rt-inp" placeholder={videolar.length > 1 ? 'Sekme adı (örn. Kolay seviye)' : 'Başlık (isteğe bağlı)'} value={v.baslik} onChange={(e) => vGuncelle({ baslik: e.target.value })} />
            {videoMu(v.url) && (
              <div className="rt-satir rt-sure-satir">
                <span className="rt-muted">Başla</span><input className="rt-inp rt-kisa" placeholder="0:00" value={v.bas} onChange={(e) => vGuncelle({ bas: e.target.value })} />
                <span className="rt-muted">Bitir</span><input className="rt-inp rt-kisa" placeholder="son" value={v.bit} onChange={(e) => vGuncelle({ bit: e.target.value })} />
              </div>
            )}
          </>
        )}
        {videolar.length > 1 && <button type="button" className="rt-link-btn tehlike" onClick={() => { setVideolar(videolar.filter((_, j) => j !== vsec)); setVsec(Math.max(0, vsec - 1)); }}>Bu videoyu kaldır</button>}
        <p className="rt-muted">Birden fazla video alternatif olur (seviye, versiyon); kartta sekme olarak görünür.</p>
      </>
    );
    return (
      <>
        <div className="rt-chips">
          <button type="button" className={`rt-chip${sureKaydi ? ' on' : ''}`} onClick={() => setSureKaydi(!sureKaydi)}>⏱ Süre</button>
          <button type="button" className={`rt-chip${olcumAcik ? ' on' : ''}`} onClick={() => { if (olcumAcik) { setSeciliOlcu([]); setEskiDegKalsin(false); setYeniOlcu(null); } setOlcumAcik(!olcumAcik); }}>📏 Ölçüm</button>
        </div>
        {sureKaydi && (
          <>
            <div className="rt-chips">
              <span className="rt-muted">Hedef:</span>
              <button type="button" className={`rt-chip${!hedef ? ' on' : ''}`} onClick={() => setHedef('')}>Yok</button>
              {HEDEFLER.map((d) => (
                <button key={d} type="button" className={`rt-chip${hedef === String(d) ? ' on' : ''}`} onClick={() => setHedef(String(d))}>{d} dk</button>
              ))}
              <input className="rt-inp rt-kisa" inputMode="numeric" placeholder="dk" value={HEDEFLER.map(String).includes(hedef) ? '' : hedef} onChange={(e) => setHedef(e.target.value.replace(/\D/g, ''))} />
            </div>
            <p className="rt-muted">{Number(hedef) > 0 ? `Kartta ⏱ ile ${hedef} dk geri sayılır, süre dolunca uyarır; bitince süre kendiliğinden yazılır.` : 'Kartta ⏱ ile süre tutulur ya da işaretlerken "Kaç dakika?" diye sorulur.'}</p>
          </>
        )}
        {olcumAcik && (
          <>
            <div className="rt-chips">
              {eskiDeg && (
                <button type="button" className={`rt-chip${eskiDegKalsin ? ' on' : ''}`} onClick={() => setEskiDegKalsin(!eskiDegKalsin)}>{eskiDeg.etiket}{eskiDeg.birim ? ` (${eskiDeg.birim})` : ''}</button>
              )}
              {[...tanimlar, ...seciliOlcu.filter((o) => !tanimlar.some((x) => x.id === o.id))].map((x) => {
                const on = seciliOlcu.some((o) => o.id === x.id);
                return (
                  <button key={x.id} type="button" className={`rt-chip${on ? ' on' : ''}`} onClick={() => setSeciliOlcu(on ? seciliOlcu.filter((o) => o.id !== x.id) : [...seciliOlcu, { id: x.id, ad: x.ad, birim: x.birim }])}>
                    {x.ad}{x.birim ? ` (${x.birim})` : ''}
                  </button>
                );
              })}
              {!yeniOlcu && <button type="button" className="rt-chip rt-ek-cip" onClick={() => setYeniOlcu({ ad: '', birim: '' })}>＋ Yeni ölçü</button>}
            </div>
            {yeniOlcu && (
              <div className="rt-satir">
                <input className="rt-inp" placeholder="Ölçü adı (örn. Tansiyon)" value={yeniOlcu.ad} onChange={(e) => setYeniOlcu({ ...yeniOlcu, ad: e.target.value })} autoFocus />
                <input className="rt-inp rt-kisa" placeholder="Birim" value={yeniOlcu.birim} onChange={(e) => setYeniOlcu({ ...yeniOlcu, birim: e.target.value })} />
                <button type="button" className="rt-btn" disabled={!yeniOlcu.ad.trim()} onClick={async () => { const x = await olcuEkle(yeniOlcu.ad, yeniOlcu.birim); setSeciliOlcu([...seciliOlcu, x]); setYeniOlcu(null); }}>Ekle</button>
              </div>
            )}
            <p className="rt-muted">İşaretlerken seçtiğin ölçüler sorulur; değerler Ölçümlerim'de birikir.</p>
          </>
        )}
        {kayitEksik && <p className="rt-hata">Süre ya da en az bir ölçü seç — ya da Kayıt'ı ⋯ menüsünden sil.</p>}
      </>
    );
  }

  // ——— zaman satırı ———
  const tekrarMetni = !tekrar ? null : belirliGun && gunler.length ? GUN_KISA.filter(([g]) => gunler.includes(g)).map(([, e]) => e).join('·') : 'Her gün';
  const bildirim = bildirimMetni(hatirlatma, saat);
  const zc = (k: Panel, ic: string, deger: string | null, etiket: string) => (
    <button key={k} type="button" className={`rt-zc${deger ? '' : ' bos'}${panel === k ? ' acik' : ''}`} onClick={() => setPanel(panel === k ? null : k)} aria-label={etiket} title={etiket}>
      <span className="zi">{ic}</span>{deger && <span>{deger}</span>}
    </button>
  );

  function panelGovde(k: Panel) {
    if (k === 'tarih') return (
      <>
        <input className="rt-inp rt-orta" type="date" value={tarihSec} onChange={(e) => e.target.value && setTarihSec(e.target.value)} />
        <p className="rt-muted">{kart ? (tekrarli0 ? 'Seri bu günden itibaren seçtiğin güne kayar; önceki günler yerinde kalır.' : 'Kart seçtiğin güne taşınır.') : tekrar ? 'Tekrar bu günden başlar.' : 'Kart bu güne eklenir.'}</p>
      </>
    );
    if (k === 'saat') return (
      <>
        <input className="rt-inp rt-orta" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} />
        <p className="rt-muted">{saat ? 'Kart ajandada bu saatte durur.' : 'Saat seçmezsen kart gün içinde serbest kalır.'}</p>
        {saat && <button type="button" className="rt-link-btn tehlike" onClick={() => setSaat('')}>Saati kaldır</button>}
      </>
    );
    if (k === 'tekrar') return (
      <>
        <div className="rt-chips">
          <button type="button" className={`rt-chip${!tekrar ? ' on' : ''}`} onClick={() => setTekrar(false)}>Bir kez</button>
          <button type="button" className={`rt-chip${tekrar && !belirliGun ? ' on' : ''}`} onClick={() => { setTekrar(true); setBelirliGun(false); }}>Her gün</button>
          <button type="button" className={`rt-chip${tekrar && belirliGun ? ' on' : ''}`} onClick={() => { setTekrar(true); setBelirliGun(true); if (!gunler.length) setGunler([1, 3, 5]); }}>Belirli günler</button>
        </div>
        {tekrar && belirliGun && (
          <div className="rt-chips">
            {GUN_KISA.map(([g, e]) => (
              <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>
            ))}
          </div>
        )}
        {tekrar && (
          <div className="rt-chips">
            <span className="rt-muted">Ne kadar:</span>
            {([['7', '1 hafta'], ['21', '21 gün'], ['', 'Süresiz']] as [string, string][]).map(([x, e]) => (
              <button key={e} type="button" className={`rt-chip${sure === x ? ' on' : ''}`} onClick={() => setSure(x)}>{e}</button>
            ))}
            <input className="rt-inp rt-kisa" inputMode="numeric" placeholder="gün" value={['7', '21', ''].includes(sure) ? '' : sure} onChange={(e) => setSure(e.target.value.replace(/\D/g, ''))} />
          </div>
        )}
      </>
    );
    const h = hatirlatma;
    const hGuncelle = (p: Partial<Hatirlatma>) => setHatirlatma({ gun: 0, ...(h ?? {}), ...p });
    return (
      <>
        <div className="rt-chips">
          <button type="button" className={`rt-chip${!h ? ' on' : ''}`} onClick={() => setHatirlatma(null)}>Yok</button>
          <button type="button" className={`rt-chip${h && h.gun === 0 ? ' on' : ''}`} onClick={() => setHatirlatma({ gun: 0, dk: h?.dk ?? 10, saat: h?.gun === 0 ? h.saat ?? '09:00' : '09:00' })}>Aynı gün</button>
          <button type="button" className={`rt-chip${h && h.gun > 0 ? ' on' : ''}`} onClick={() => setHatirlatma({ gun: h && h.gun > 0 ? h.gun : 1, saat: h && h.gun > 0 ? h.saat ?? '20:00' : '20:00' })}>Günler önce</button>
        </div>
        {h && h.gun === 0 && saat && (
          <div className="rt-chips">
            {([[0, 'Vaktinde'], [5, '5 dk'], [10, '10 dk'], [30, '30 dk'], [60, '1 saat']] as [number, string][]).map(([d, e]) => (
              <button key={d} type="button" className={`rt-chip${(h.dk ?? 0) === d ? ' on' : ''}`} onClick={() => hGuncelle({ dk: d })}>{e}</button>
            ))}
          </div>
        )}
        {h && h.gun > 0 && (
          <div className="rt-chips">
            {([[1, '1 gün'], [2, '2 gün'], [3, '3 gün'], [7, '1 hafta']] as [number, string][]).map(([d, e]) => (
              <button key={d} type="button" className={`rt-chip${h.gun === d ? ' on' : ''}`} onClick={() => hGuncelle({ gun: d })}>{e}</button>
            ))}
          </div>
        )}
        {h && (h.gun > 0 || !saat) && <input className="rt-inp rt-orta" type="time" value={h.saat ?? ''} onChange={(e) => hGuncelle({ saat: e.target.value })} />}
        {h && <p className="rt-muted">{h.gun === 0 ? (saat ? `${saat} kartından ${h.dk ? `${h.dk} dk önce` : 'tam vaktinde'} bildirim gelir.` : `Kartın saati yok; bildirim o gün ${h.saat ?? '09:00'}'da gelir.`) : `${h.gun === 7 ? 'Bir hafta' : `${h.gun} gün`} önce ${h.saat ?? '20:00'}'da bildirim gelir${tarihGoster ? ` (${kisaTarih(tarihEkle(tarihSec, -h.gun))})` : ''}.`} Bildirimler henüz gönderilmiyor; ayar saklanır.</p>}
      </>
    );
  }

  const PANEL_AD: Record<Panel, string> = { tarih: kart && tekrarli0 ? 'Bu günü taşı' : tekrar ? 'Başlangıç' : 'Tarih', saat: 'Saat', tekrar: 'Tekrar', bildirim: 'Bildirim' };

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

      {!sinav && (
        <>
          {sira.length < ICERIK.length && (
            <div className="rt-serit" aria-label="İçerik ekle">
              {ICERIK.filter(([t]) => !sira.includes(t)).map(([t, e]) => (
                <button key={t} type="button" className="rt-chip rt-ek-cip" onClick={() => ekle(t)}>＋ {e}</button>
              ))}
            </div>
          )}
          {sira.map((t, i) => (
            <div key={t} className="rt-ek rt-blok">
              <div className="rt-ek-hd">
                <span>{ICERIK.find(([x]) => x === t)![1]}</span>
                <button type="button" className="rt-blok-menu" onClick={() => setMenu(menu === t ? null : t)} aria-label="Blok menüsü">⋯</button>
              </div>
              {menu === t && (
                <div className="rt-pop">
                  <button type="button" disabled={i === 0} onClick={() => tasi(t, -1)}>↑ Yukarı taşı</button>
                  <button type="button" disabled={i === sira.length - 1} onClick={() => tasi(t, 1)}>↓ Aşağı taşı</button>
                  <button type="button" className="tehlike" onClick={() => sil(t)}>Sil</button>
                </div>
              )}
              {icerikGovde(t)}
            </div>
          ))}
        </>
      )}

      {!tarihsiz && (
        <div className="rt-zaman">
          <div className="rt-bolum-ad">Zaman</div>
          <div className="rt-zrow">
            {tarihGoster && zc('tarih', '📅', kart && tekrarli0 ? kisaTarih(tarihSec) : tekrar ? `Baş. ${kisaTarih(tarihSec)}` : kisaTarih(tarihSec), 'Tarih')}
            {zc('saat', '🕐', saat || null, 'Saat')}
            {!tekrarYok && zc('tekrar', '🔁', tekrarMetni, 'Tekrar')}
            {bildirimGoster && zc('bildirim', '🔔', bildirim, 'Bildirim')}
          </div>
          {panel && (
            <div className="rt-zpanel">
              <div className="rt-zpanel-hd"><span>{PANEL_AD[panel]}</span><button type="button" onClick={() => setPanel(null)}>Tamam</button></div>
              {panelGovde(panel)}
            </div>
          )}
        </div>
      )}

      {geri && (
        <div className="rt-geri">
          <span>{ICERIK.find(([x]) => x === geri.t)![1].slice(3)} silindi</span>
          <button type="button" onClick={geriAl}>Geri al</button>
        </div>
      )}
      {hataM && <p className="rt-hata">⚠ {hataM}</p>}
      <button type="button" className="rt-btn primary" disabled={sinav ? !gorev : !ad.trim() || kayitEksik} onClick={kaydet}>{kart ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

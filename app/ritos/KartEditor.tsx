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
//      Şerit eklenen içeriğin ALTINDA durur — yeni içerik akışın sonuna eklenir.
//   2) Tarih-saat üst şeritte tek çip (1 ekim): dokununca tek seçici — ay takvimi + saat + "Saati
//      kaldır". Tarihi değiştirmek = taşımak. Altta yalnız 🔁 tekrar ve 🔔 bildirim kalır.
// Aynı editör ekleme, düzenleme, plan (onPlan) ve kütüphane (tarihsiz) için kullanılır.
// Veri modeli değişmedi: içerik sırası `bloklar` dizisinin sırasıdır.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { belgeBos, metindenBelge } from '@/lib/belge';
import { useCanli } from '@/lib/canli';
import { OLC_ONEK, olcuBlok, olcuEkle, olculer, varsayilanBicim, type OlcuBicim } from '@/lib/olcum';
import type { OlcuTanimRow } from '@/lib/db';
import { teslimAl, kartGuncelle, kartTasi } from '@/lib/ajanda';
import { GUN_KISA, PAKET_SURUM, TAM_IZIN, bugun, gunFarki, tarihEkle, tarihParse, tarihStr, type Blok, type Hatirlatma, type KartPaketi } from '@/lib/paket';
import type { AjandaKartRow } from '@/lib/db';
import type { KocKartTaslak, KocTekrar } from '@/lib/danisanAjanda';
import { Adimlayici, Modal, VideoOynatici, instagramEmbed, useArkaPlan, youtubeId } from './ortak';
import { YansitDugmesi } from './Yansit';
import { GorevFormu, gorevTeslim, useSinavOzeti } from './Sinav';
import type { GorevTaslak } from '@/lib/sinavGorev';
import { V2 } from '@/lib/surum';
import { grupIkonu, isEkle, useCevrem } from '@/lib/cevrem';

// Açıklama stilli (Tiptap, sade araç çubuğu) — madde, numaralı liste, checklist, kalın, vurgu, tablo.
const ZenginEditor = dynamic(() => import('./NotEditor').then((m) => m.ZenginEditor), { ssr: false, loading: () => <p className="rt-muted">…</p> });

type Icerik = 'aciklama' | 'video' | 'sure' | 'olcum';
type Panel = 'tekrar' | 'bildirim' | 'bekle';
interface VideoSatir { url: string; baslik: string; bas: string; bit: string }
type SeciliOlcu = Pick<OlcuTanimRow, 'id' | 'ad' | 'birim'> & { bicim: OlcuBicim; hedef: number | null };
const BICIM: [OlcuBicim, string][] = [['sayi', 'Sayı'], ['olcek', '1–5'], ['adet', 'Adet (+1)']];
const ICERIK: [Icerik, string][] = [['aciklama', '📝 Açıklama'], ['video', '🎬 Video'], ['sure', '⏱ Süre'], ['olcum', '📏 Ölçüm']];
const BOS_VIDEO: VideoSatir = { url: '', baslik: '', bas: '', bit: '' };

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
      : b.tur === 'zamanlayici' || (b.tur === 'sayi' && b.anahtar === SURE_ANAHTAR) ? 'sure'
      : b.tur === 'sayi' ? 'olcum' : null;
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
  const [hedef, setHedef] = useState<number | null>(zamB && zamB.dakika > 0 ? zamB.dakika : null);
  const tanimlar = useCanli(olculer, [], [] as OlcuTanimRow[]);
  const [seciliOlcu, setSeciliOlcu] = useState<SeciliOlcu[]>(
    olc0.map((b) => ({ id: b.anahtar.slice(OLC_ONEK.length), ad: b.etiket, birim: b.birim ?? '', bicim: b.bicim ?? 'sayi', hedef: b.hedef ?? null })),
  );
  const [eskiDegKalsin, setEskiDegKalsin] = useState(!!eskiDeg);
  const [olcumAcik, setOlcumAcik] = useState(olc0.length > 0 || !!eskiDeg);
  const [yeniOlcu, setYeniOlcu] = useState<{ ad: string; birim: string } | null>(null);
  const [menu, setMenu] = useState<Icerik | null>(null);
  // 📌 Sabitle: video bloğu pencerenin üstüne yapışır; izlerken açıklamaya not alınabilir.
  const [izle, setIzle] = useState(false);
  // Video formu (küçük pencere): i null = yeni video; ⚙️ seçili videoyu düzenler. Ekran kaymasın diye
  // bağlantı/başla/bitir alanları blokta değil, pencerede.
  const [vform, setVform] = useState<(VideoSatir & { i: number | null }) | null>(null);
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
  const [bekle, setBekle] = useState<number | null>(kart?.bekle ?? null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [stilAcik, setStilAcik] = useState(false); // 5 ekim: açıklamanın stil şeridi varsayılan kapalı
  // Ortak iş (7 ekim — Çevrem): yeni kartta, bir gruptaysan — Çevrem'de "Bugün evde" listesine düşer,
  // biri "Ben alırım" der. Birden çok grup varsa hangisi, seçilir.
  const gruplar = useCevrem().gruplar;
  const [ortakGrup, setOrtakGrup] = useState<string | null>(null);
  const aile = gruplar.find((g) => g.id === ortakGrup) ?? gruplar[0] ?? null;
  const [ortak, setOrtak] = useState(false);
  const ortakSecilebilir = !!aile && !kart && !onPlan && !tarihsiz && !sinav;
  const [secici, setSecici] = useState(false);
  const tarihGoster = !onPlan && (!kart || kart.izinler.gun_degistir);
  const bildirimGoster = !onPlan && !sinav;

  function ekle(t: Icerik) {
    setSira([...sira, t]);
    setMenu(null);
    if (t === 'video') setVsec(0);
    if (t === 'sure') setSureKaydi(true);
    if (t === 'olcum') setOlcumAcik(true);
  }
  function sabitle() {
    if (izle) { setIzle(false); return; }
    // Açıklama videonun üstündeyse video öne alınır — yapışınca not alanı altında kalsın.
    const ai = sira.indexOf('aciklama'), vi = sira.indexOf('video');
    if (ai >= 0 && ai < vi) { const n: Icerik[] = sira.filter((x) => x !== 'video'); n.splice(ai, 0, 'video'); setSira(n); }
    setIzle(true); setMenu(null);
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
    const veri: Record<string, unknown> = t === 'aciklama' ? { aciklama } : t === 'video' ? { videolar, vsec } : t === 'sure' ? { hedef } : { seciliOlcu, eskiDegKalsin };
    setGeri({ t, i: sira.indexOf(t), veri });
    setSira(sira.filter((x) => x !== t));
    if (t === 'aciklama') setAciklama(null);
    else if (t === 'video') { setVideolar([]); setVsec(0); }
    else if (t === 'sure') { setSureKaydi(false); setHedef(null); }
    else { setSeciliOlcu([]); setEskiDegKalsin(false); setOlcumAcik(false); setYeniOlcu(null); }
    setMenu(null);
  }
  function geriAl() {
    if (!geri) return;
    const { t, i, veri } = geri;
    setSira((s) => { const n = [...s]; n.splice(i, 0, t); return n; });
    if (t === 'aciklama') setAciklama(veri.aciklama as object | null);
    else if (t === 'video') { setVideolar(veri.videolar as VideoSatir[]); setVsec(veri.vsec as number); }
    else {
      if (t === 'sure') { setSureKaydi(true); setHedef(veri.hedef as number | null); }
      else { setOlcumAcik(true); setSeciliOlcu(veri.seciliOlcu as SeciliOlcu[]); setEskiDegKalsin(veri.eskiDegKalsin as boolean); }
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
      } else if (t === 'sure') {
        b.push({ tur: 'sayi', anahtar: SURE_ANAHTAR, etiket: 'Kaç dakika?', birim: 'dk' });
        if (hedef && hedef > 0) b.push({ tur: 'zamanlayici', dakika: hedef });
      } else {
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
      bekle: bildirimGoster ? bekle : null,
    };
  }

  const kayitEksik = sira.includes('olcum') && !seciliOlcu.length && !(eskiDeg && eskiDegKalsin);

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
      await kartGuncelle(kart.id, { tip: 'yap', ad: ad.trim(), bloklar: bloklarUret(), bitis: z.bitis, gunler: z.gunler, saatler: z.saatler, hatirlatma: z.hatirlatma, bekle: z.bekle });
      if (tarihGoster && tarihSec && tarihSec !== tarih) await kartTasi(kart.id, tarih, tarihSec);
    } else if (ortak && ortakSecilebilir) {
      const z = zamanlama(tarihSec || tarih);
      try {
        await isEkle(aile!.id, { ad: ad.trim(), aciklama: null, tarih: z.baslangic, bitis: z.baslangic, gunler: null, saat: z.saatler[0] ?? null, ustlenen: null });
      } catch (e) { setHataM((e as Error).message); return; }
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
    if (t === 'aciklama') return <ZenginEditor icerik={aciklama} kompakt aracGizli={!stilAcik} placeholder={izle ? 'İzlerken notların…' : 'Notun, adımlar… ( - madde, [ ] yapılacak )'} onDegis={(b) => setAciklama(b)} />;
    if (t === 'video') {
      const vid = v ? youtubeId(v.url) : null;
      const bs = v ? sn(v.bas) : undefined, bt = v ? sn(v.bit) : undefined;
      return (
        <>
          {videolar.length > 1 && (
            <div className="rt-chips">
              {videolar.map((x, i) => (
                <button key={i} type="button" className={`rt-chip${i === vsec ? ' on' : ''}`} onClick={() => setVsec(i)}>{x.baslik.trim() || `Video ${i + 1}`}</button>
              ))}
            </div>
          )}
          {vform ? (
        <VideoFormu
          ilk={vform} cok={videolar.length > (vform.i === null ? 0 : 1)}
          onKapat={() => setVform(null)}
          onKaydet={(x) => {
            if (vform.i === null) { setVideolar([...videolar, x]); setVsec(videolar.length); }
            else setVideolar(videolar.map((y, j) => (j === vform.i ? x : y)));
            setVform(null);
          }}
          onKaldir={vform.i === null ? undefined : () => {
            const i = vform.i!;
            // Yalnız o video kalkar; son video da kalkınca blok boş (gri alan) kalır — bloğu silmek ⋯ menüsünde.
            setVideolar(videolar.filter((_, j) => j !== i)); setVsec(Math.max(0, Math.min(vsec, videolar.length - 2)));
            setVform(null);
          }}
        />
          ) : v && (vid || instagramEmbed(v.url)) ? (
            <VideoOynatici key={`${v.url}-${vsec}`} url={v.url} bas={bs} bit={bt} baslik={v.baslik} />
          ) : (
            <div className="rt-video-kutu rt-video-bos">
              {v ? <a href={v.url} target="_blank" rel="noreferrer">🔗 {v.baslik || v.url}</a> : <span className="rt-video-ipucu"><span><b>＋ Video ekle</b> ile ilk YouTube ya da Instagram videonu ekle</span></span>}
            </div>
          )}
          <div className="rt-video-alt">
            {vid && <YansitDugmesi videoId={vid} bas={bs} pasif={!!vform} />}
            {v && (vid || instagramEmbed(v.url)) && <button type="button" className={`rt-btn sm${izle ? ' on' : ''}`} disabled={!!vform} onClick={sabitle} title="İzlerken üstte tut">{izle ? '📌 Bırak' : '📌 Sabitle'}</button>}
            {v && !izle && <button type="button" className="rt-btn sm" disabled={!!vform} onClick={() => setVform({ ...v, i: vsec })} aria-label="Videoyu ayarla" title="Bağlantı, başla/bitir, kaldır">⚙️</button>}
            {!izle && <button type="button" className="rt-btn sm" disabled={!!vform} onClick={() => setVform({ ...BOS_VIDEO, i: null })}>＋ Video ekle</button>}
          </div>
        </>
      );
    }
    if (t === 'sure') return (
      <>
        <div className="rt-satir rt-adim-satir"><span className="rt-muted">Hedef</span>
          <Adimlayici deger={hedef} onDegis={setHedef} adim={5} varsayilan={5} />
        </div>
        <p className="rt-muted">{hedef ? `Kartta ▶ ile ${hedef} dk geri sayılır, dolunca uyarır; bitince süre kendiliğinden yazılır.` : 'Kartta ▶ ile süre tutulur ya da işaretlerken "Kaç dakika?" diye sorulur.'}</p>
      </>
    );
    return (
      <>
        <div className="rt-chips">
          {eskiDeg && (
            <button type="button" className={`rt-chip${eskiDegKalsin ? ' on' : ''}`} onClick={() => setEskiDegKalsin(!eskiDegKalsin)}>{eskiDeg.etiket}{eskiDeg.birim ? ` (${eskiDeg.birim})` : ''}</button>
          )}
          {[...tanimlar, ...seciliOlcu.filter((o) => !tanimlar.some((x) => x.id === o.id))].map((x) => {
            const on = seciliOlcu.some((o) => o.id === x.id);
            return (
              <button key={x.id} type="button" className={`rt-chip${on ? ' on' : ''}`} onClick={() => setSeciliOlcu(on ? seciliOlcu.filter((o) => o.id !== x.id) : [...seciliOlcu, { id: x.id, ad: x.ad, birim: x.birim, ...varsayilanBicim(x.id) }])}>
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
            <button type="button" className="rt-btn" disabled={!yeniOlcu.ad.trim()} onClick={async () => { const x = await olcuEkle(yeniOlcu.ad, yeniOlcu.birim); setSeciliOlcu([...seciliOlcu, { id: x.id, ad: x.ad, birim: x.birim, bicim: 'sayi', hedef: null }]); setYeniOlcu(null); }}>Ekle</button>
          </div>
        )}
        {seciliOlcu.map((o) => {
          const g = (p: Partial<SeciliOlcu>) => setSeciliOlcu(seciliOlcu.map((x) => (x.id === o.id ? { ...x, ...p } : x)));
          return (
            <div key={o.id} className="rt-olcu-ayar">
              <b>{o.ad}</b>
              <div className="rt-chips">
                {BICIM.map(([bc, e]) => (
                  <button key={bc} type="button" className={`rt-chip${o.bicim === bc ? ' on' : ''}`} onClick={() => g({ bicim: bc, hedef: bc === 'adet' ? o.hedef ?? 8 : null })}>{e}</button>
                ))}
              </div>
              {o.bicim === 'adet' && (
                <div className="rt-satir rt-adim-satir"><span className="rt-muted">Günlük hedef</span>
                  <Adimlayici deger={o.hedef} onDegis={(v) => g({ hedef: v })} adim={1} varsayilan={8} min={1} birim={o.birim || 'adet'} />
                </div>
              )}
            </div>
          );
        })}
        <p className="rt-muted">{seciliOlcu.some((o) => o.bicim === 'adet') ? 'Adet: gün boyunca satırdaki ＋ ile artar, hedefe ulaşınca kart yapıldı olur. ' : ''}Diğerleri işaretlerken sorulur; değerler Ölçümlerim'de birikir.</p>
        {kayitEksik && <p className="rt-hata">En az bir ölçü seç — ya da Ölçüm'ü ⋯ menüsünden sil.</p>}
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
    if (k === 'bekle') return (
      <>
        <Adimlayici deger={bekle} onDegis={setBekle} adim={5} varsayilan={5} />
        <p className="rt-muted">{bekle ? `Yaptım dediğinde satırda ${bekle} dk geri sayılır, dolunca uyarır (örn. kreatinden sonra kafein için bekleme).` : 'Yaptıktan sonra bir süre beklemen gerekiyorsa (örn. 45 dk kafein yok) süre ver.'}</p>
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
          <Adimlayici deger={h.dk || null} onDegis={(d) => hGuncelle({ dk: d ?? 0 })} adim={5} varsayilan={5} yokEtiket="Vaktinde" />
        )}
        {h && h.gun > 0 && (
          <div className="rt-chips">
            {([[1, '1 gün'], [2, '2 gün'], [3, '3 gün'], [7, '1 hafta']] as [number, string][]).map(([d, e]) => (
              <button key={d} type="button" className={`rt-chip${h.gun === d ? ' on' : ''}`} onClick={() => hGuncelle({ gun: d })}>{e}</button>
            ))}
          </div>
        )}
        {h && (h.gun > 0 || !saat) && <input className="rt-inp rt-orta" type="time" value={h.saat ?? ''} onChange={(e) => hGuncelle({ saat: e.target.value })} />}
        {h && <p className="rt-muted">{h.gun === 0 ? (saat ? `${saat} kartından ${h.dk ? `${h.dk} dk önce` : 'tam vaktinde'} bildirim gelir.` : `Kartın saati yok; bildirim o gün ${h.saat ?? '09:00'}'da gelir.`) : `${h.gun === 7 ? 'Bir hafta' : `${h.gun} gün`} önce ${h.saat ?? '20:00'}'da bildirim gelir${tarihGoster ? ` (${kisaTarih(tarihEkle(tarihSec, -h.gun))})` : ''}.`} Bildirim için Ayarlar → Bildirimler'de bu cihazda açık olmalı.</p>}
      </>
    );
  }

  const PANEL_AD: Record<Panel, string> = { tekrar: 'Tekrar', bildirim: 'Bildirim', bekle: 'Yaptıktan sonra bekle' };
  const zamanBolumu = !tarihsiz && (!tekrarYok || bildirimGoster);
  // Üst şeritteki tarih-saat çipi (kütüphane kartında yok; planda yalnız saat).
  const ustCip = tarihsiz ? undefined : (
    <button type="button" className={`rt-ts-cip${secici ? ' acik' : ''}`} onClick={() => setSecici(!secici)} aria-label="Tarih ve saat">
      {tarihGoster && `📅 ${kisaTarih(tarihSec)} · `}{!tarihGoster && '🕐 '}{saat || <span className="rt-ts-bos">--:--</span>}
    </button>
  );

  return (
    <Modal baslik={baslik ?? (kart ? 'Kartı düzenle' : 'Kart ekle')} onKapat={onKapat} ust={ustCip}>
      {secici && !tarihsiz && (
        <TarihSaatSecici
          tarih={tarihGoster ? tarihSec : null} saat={saat}
          onTarih={setTarihSec} onSaat={setSaat} onKapat={() => setSecici(false)}
          not={!tarihGoster ? null : kart ? (tekrarli0 ? 'Seri bu günden itibaren seçtiğin güne kayar; önceki günler yerinde kalır.' : 'Kart seçtiğin güne taşınır.') : tekrar ? 'Tekrar bu günden başlar.' : null}
        />
      )}
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
          {sira.map((t, i) => (
            <div key={t} className={`rt-ek rt-blok${t === 'video' && izle ? ' rt-yapis' : ''}`}>
              <div className="rt-ek-hd">
                <span>{ICERIK.find(([x]) => x === t)![1]}</span>
                {t === 'aciklama' && (
                  <button type="button" className={`rt-stil-dugme${stilAcik ? ' on' : ''}`} aria-pressed={stilAcik} aria-label={stilAcik ? 'Stil şeridini kapat' : 'Stil şeridini aç'} title="Stil" onClick={() => setStilAcik(!stilAcik)}>Aa</button>
                )}
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
          {sira.length < ICERIK.length && (
            <div className="rt-serit" aria-label="İçerik ekle">
              {ICERIK.filter(([t]) => !sira.includes(t)).map(([t, e]) => (
                <button key={t} type="button" className="rt-chip rt-ek-cip" onClick={() => ekle(t)}>＋ {e}</button>
              ))}
            </div>
          )}
        </>
      )}

      {zamanBolumu && (
        <div className="rt-zaman">
          <div className="rt-zrow">
            {!tekrarYok && !ortak && zc('tekrar', '🔁', tekrarMetni, 'Tekrar')}
            {bildirimGoster && zc('bildirim', '🔔', bildirim, 'Bildirim')}
            {V2 && bildirimGoster && zc('bekle', '⏳', bekle ? `${bekle} dk bekle` : null, 'Sonra bekle')}
          </div>
          {panel && (
            <div className="rt-zpanel">
              <div className="rt-zpanel-hd"><span>{PANEL_AD[panel]}</span><button type="button" onClick={() => setPanel(null)}>Tamam</button></div>
              {panelGovde(panel)}
            </div>
          )}
        </div>
      )}

      {ortakSecilebilir && (
        <label className="rt-satir rt-bil-sec">
          <input type="checkbox" checked={ortak} onChange={(e) => { setOrtak(e.target.checked); if (e.target.checked) setTekrar(false); }} />
          <span>{grupIkonu(aile!)} Ortak iş — {gruplar.length > 1
            ? <select className="rt-ortak-grup-sec" aria-label="Grup" value={aile!.id} onChange={(e) => setOrtakGrup(e.target.value)}>{gruplar.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}</select>
            : <b>{aile!.ad}</b>} grubunun Çevrem listesine düşer <span className="rt-muted">(biri &quot;Ben alırım&quot; der; üstlenenin ajandasına geçer)</span></span>
        </label>
      )}
      {geri && (
        <div className="rt-geri">
          <span>{ICERIK.find(([x]) => x === geri.t)![1].split(' ').slice(1).join(' ')} silindi</span>
          <button type="button" onClick={geriAl}>Geri al</button>
        </div>
      )}
      {hataM && <p className="rt-hata">⚠ {hataM}</p>}
      <button type="button" className="rt-btn primary" disabled={sinav ? !gorev : !ad.trim() || kayitEksik} onClick={kaydet}>{kart ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

// Tek tarih-saat seçici (1 ekim): ay takvimi (Bugün / Yarın kısayollarıyla) + saat + "Saati kaldır".
// tarih null ise (plan kartı) yalnız saat. Telefonun birleşik tarih-saat alanı saati boş
// bırakmaya izin vermediği için kendi seçicimiz.
function TarihSaatSecici({ tarih, saat, onTarih, onSaat, onKapat, not }: {
  tarih: string | null; saat: string; onTarih: (t: string) => void; onSaat: (s: string) => void; onKapat: () => void; not: string | null;
}) {
  const [ay, setAy] = useState(() => { const d = tarihParse(tarih ?? bugun()); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const t0 = bugun();
  const gunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
  const bosluk = (ay.getDay() + 6) % 7; // Pazartesi başlangıç
  const gunler = Array.from({ length: gunSayisi }, (_, i) => tarihStr(new Date(ay.getFullYear(), ay.getMonth(), i + 1)));
  const sec = (t: string) => { onTarih(t); const d = tarihParse(t); setAy(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const gunSec = (t: string) => { sec(t); onKapat(); };
  const arka = useArkaPlan(onKapat);
  return (
    <div className="rt-ts-bg" {...arka}>
    <div className="rt-ts" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tarih ve saat seç">
      <div className="rt-ts-saat">
        <span className="rt-muted">🕐 Saat</span>
        <input className="rt-inp rt-orta" type="time" value={saat} onChange={(e) => onSaat(e.target.value)} aria-label="Saat" />
        {saat ? <button type="button" className="rt-link-btn tehlike" onClick={() => { onSaat(''); if (!tarih) onKapat(); }}>Saati kaldır</button> : <span className="rt-muted">saatsiz</span>}
      </div>
      {tarih && (
        <>
          <div className="rt-chips">
            <button type="button" className={`rt-chip${tarih === t0 ? ' on' : ''}`} onClick={() => gunSec(t0)}>Bugün</button>
            <button type="button" className={`rt-chip${tarih === tarihEkle(t0, 1) ? ' on' : ''}`} onClick={() => gunSec(tarihEkle(t0, 1))}>Yarın</button>
          </div>
          <div className="rt-ts-ay">
            <button type="button" className="arrow" onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() - 1, 1))} aria-label="Önceki ay">‹</button>
            <b>{ay.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</b>
            <button type="button" className="arrow" onClick={() => setAy(new Date(ay.getFullYear(), ay.getMonth() + 1, 1))} aria-label="Sonraki ay">›</button>
          </div>
          <div className="rt-ts-grid">
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((g) => <span key={g} className="rt-ay-gad">{g}</span>)}
            {Array.from({ length: bosluk }, (_, i) => <span key={`b${i}`} />)}
            {gunler.map((g) => (
              <button key={g} type="button" className={`rt-ts-gun${g === tarih ? ' secili' : ''}${g === t0 ? ' bugun' : ''}`} onClick={() => gunSec(g)}>{tarihParse(g).getDate()}</button>
            ))}
          </div>
        </>
      )}
      {not && <p className="rt-muted">{not}</p>}
    </div>
    </div>
  );
}

// Video ekle / ayarla — oynatıcının durduğu gri alanın İÇİNDE (ekran kaymaz, pencere açılmaz).
function VideoFormu({ ilk, cok, onKaydet, onKaldir, onKapat }: {
  ilk: VideoSatir; cok: boolean; onKaydet: (v: VideoSatir) => void; onKaldir?: () => void; onKapat: () => void;
}) {
  const [f, setF] = useState<VideoSatir>({ url: ilk.url, baslik: ilk.baslik, bas: ilk.bas, bit: ilk.bit });
  const yeni = !onKaldir;
  return (
    <div className="rt-video-form" role="group" aria-label={yeni ? 'Video ekle' : 'Videoyu ayarla'}>
        <input className="rt-inp" placeholder="YouTube ya da bağlantı" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} autoFocus={yeni} />
        <input className="rt-inp" placeholder={cok ? 'Sekme adı (örn. 2. bölüm)' : 'Başlık (isteğe bağlı)'} value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} />
        {youtubeId(f.url) && (
          <div className="rt-satir rt-sure-satir">
            <span className="rt-muted">Başla</span><input className="rt-inp rt-kisa" placeholder="0:00" value={f.bas} onChange={(e) => setF({ ...f, bas: e.target.value })} />
            <span className="rt-muted">Bitir</span><input className="rt-inp rt-kisa" placeholder="son" value={f.bit} onChange={(e) => setF({ ...f, bit: e.target.value })} />
          </div>
        )}
        <div className="rt-satir rt-vform-alt">
          {onKaldir && <button type="button" className="rt-link-btn tehlike" onClick={onKaldir}>Bu videoyu kaldır</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
          <button type="button" className="rt-btn primary" disabled={!f.url.trim()} onClick={() => onKaydet({ ...f, url: f.url.trim() })}>{yeni ? 'Ekle' : 'Kaydet'}</button>
        </div>
    </div>
  );
}

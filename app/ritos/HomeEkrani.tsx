'use client';

// ————————————————————————————————————————————————————————————————
// Home (5 ekim) — widget kartları. Her widget yarım kolon bir kart: simge, ad, canlı durum, rozet.
//  • Kısa içerikliler (Notlar, Gelenler) YERİNDE açılır: ızgaranın üstündeki bölgeye tam genişlikte
//    geçer, kapalı kartlar sırasıyla boşluksuz kalır. 📌 ile hep açık tutulur.
//  • Uzun / etkileşimli olanlar (Ortak listeler, Koçlarım, Ölçümlerim, bağlantılar) TAM EKRAN açılır
//    ("‹ Home" ile dönülür). Bağlantı sayfası (iframe) yalnız açılınca yüklenir.
//  • Gelenler hep görünür (gizlenemez); yeni bir şey varken vurgulu.
//  • Düzenle: gizle, sırala, ekle. Düzen cihaz başına (localStorage) saklanır.
// Bkz. mockup "Ritos Home".
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { useCanli } from '@/lib/canli';
import { type BaglantiRow, type NotRow } from '@/lib/db';
import { notlar } from '@/lib/notlar';
import { baglantilar, urlDoldur } from '@/lib/baglanti';
import { disiplinAdi, useDanismanlik } from '@/lib/danismanlik';
import { sayiMetin } from '@/lib/olcum';
import { NotlarWidget } from './Notlar';
import { CevremListeleriWidget } from './Cevrem';
import Atolye from './Atolye';
import { grupIkonu, useCevrem } from '@/lib/cevrem';
import { GelenlerEkrani, useGelenlerOzeti } from './Sohbet';
import { Cizgi, OlcumlerListesi, useOlcumler } from './Olcum';
import { BaglantiFormu, BaglantiTam } from './Baglanti';
import { useIliskiler } from './Danismanlik';
import { DISIPLIN_IKON } from './DanismanlikEkrani';

type Mod = 'yerinde' | 'ekran';
interface Widget {
  k: string; ic: string; ad: string; mod: Mod;
  durum: ReactNode; imza: string;          // imza: durum değişti mi (canlı nokta) — metin hali
  rozet?: number | null; dikkat?: boolean; gizlenemez?: boolean; cizgi?: ReactNode;
  govde: () => ReactNode;
}

const DUZEN_ANAH = 'ritos-home-duzen';
interface Duzen { sira: string[]; gizli: string[]; sabit: Record<string, boolean> }
const VARSAYILAN_SIRA = ['gelenler', 'notlar', 'ortak', 'danisanlar', 'koc', 'olcum'];
function duzenOku(): Duzen {
  try { const d = JSON.parse(localStorage.getItem(DUZEN_ANAH) ?? 'null'); if (d?.sira) return { sira: d.sira, gizli: d.gizli ?? [], sabit: d.sabit ?? {} }; } catch { /* yoksay */ }
  return { sira: VARSAYILAN_SIRA, gizli: [], sabit: {} };
}
function duzenYaz(d: Duzen) { try { localStorage.setItem(DUZEN_ANAH, JSON.stringify(d)); } catch { /* yoksay */ } }

// Oturum boyunca: hangi yerinde widget açık, hangi tam ekran açık (sekme değişince korunur).
const oturum: { acik: Record<string, boolean>; ekran: string | null } = { acik: {}, ekran: null };
/** Home'u belirli bir tam ekran widget'la aç (ör. danışmanlıktan "Danışanlarım'da planla"). */
export function homeEkraniAc(k: string | null) { oturum.ekran = k; }

const host = (url: string) => { try { return new URL(urlDoldur(url)).host; } catch { return ''; } };

// ———————————————— widget verileri ————————————————

function useWidgetler(): Widget[] {
  const dn = useDanismanlik();
  const gelen = useGelenlerOzeti();
  const notList = useCanli(notlar, [], [] as NotRow[]);
  // 7 ekim: ortak listeler Çevrem'den (sunucu + Realtime)
  const cv = useCevrem();
  const ortak = cv.gruplar.length ? { gruplar: cv.gruplar, listeler: cv.listeler, acikSay: cv.maddeler.filter((m) => !m.isaretli).length } : null;
  const tumIliskiler = useIliskiler();
  const koclar = tumIliskiler.filter((x) => x.danisan === dn.uid && x.durum === 'aktif' && x.disiplin !== 'aile');
  const olcum = useOlcumler();
  const bag = useCanli(baglantilar, [], [] as BaglantiRow[]);
  const [bagAyar, setBagAyar] = useState<BaglantiRow | null>(null);

  const w: Widget[] = [];
  const gelenMetin = gelen.toplam > 0
    ? [gelen.davet ? `${gelen.davet} davet` : '', gelen.paylasim ? `${gelen.paylasim} yeni paylaşım` : ''].filter(Boolean).join(' · ')
    : 'Yeni bir şey yok';
  w.push({ k: 'gelenler', ic: '📥', ad: 'Gelenler', mod: 'yerinde', gizlenemez: true, durum: gelenMetin, imza: gelenMetin,
    rozet: gelen.toplam || null, dikkat: gelen.toplam > 0, govde: () => <GelenlerEkrani gomulu /> });

  const sonNot = notList.find((n) => n.baslik?.trim());
  w.push({ k: 'notlar', ic: '📝', ad: 'Notlar', mod: 'yerinde',
    durum: notList.length ? <>{notList.length} not{sonNot ? <> · son: <b>{sonNot.baslik}</b></> : null}</> : 'Hızlı bir not al',
    imza: `${notList.length}|${sonNot?.id ?? ''}|${sonNot?.guncellendi ?? ''}`, govde: () => <NotlarWidget gomulu /> });

  if (ortak) {
    const g = ortak.gruplar[0];
    const ilk = ortak.listeler[0];
    w.push({ k: 'ortak', ic: '🛒', ad: 'Ortak listeler', mod: 'ekran',
      durum: ilk
        ? <>{ortak.listeler.length > 1 ? `${ortak.listeler.length} liste` : ilk.ad} · <b>{ortak.acikSay ? `${ortak.acikSay} alınacak` : 'hepsi alındı'}</b>{ortak.gruplar.length === 1 ? ` · ${grupIkonu(g)} ${g.ad}` : ''}</>
        : <>Henüz liste yok · {grupIkonu(g)} {ortak.gruplar.length > 1 ? `${ortak.gruplar.length} grup` : g.ad}</>,
      imza: `${ortak.listeler.length}|${ortak.acikSay}`, govde: () => <CevremListeleriWidget /> });
  }

  if (koclar.length) {
    const ilk = koclar[0];
    w.push({ k: 'koc', ic: '🤝', ad: 'Koçlarım', mod: 'ekran',
      durum: <><b>{ilk.koc_ad}</b> · {disiplinAdi(ilk.disiplin)}{koclar.length > 1 ? ` · +${koclar.length - 1}` : ''}</>,
      imza: koclar.map((x) => x.id).join(','),
      govde: () => (
        <div className="rt-hw-koclar">
          {koclar.map((il) => (
            <div key={il.id} className="rt-hw-koc">
              <span className="ic">{DISIPLIN_IKON[il.disiplin] ?? '🤝'}</span>
              <span className="tx"><b>{il.koc_ad}</b><small>Koçun · {disiplinAdi(il.disiplin)}</small></span>
            </div>
          ))}
          <p className="rt-muted">Koçunun kartları Ajandam&apos;da &quot;Koçum&quot; kaynağıyla görünür; karta not ve haftalık değerlendirme oradan.</p>
        </div>
      ) });
  }

  // 7 ekim — danışmanlık Çevrem'den Home'a taşındı: koç tarafı tam ekran "Danışanlarım" (Atölye kapsam: çevre).
  if (dn.profil?.koc) {
    const danisanlar = tumIliskiler.filter((x) => x.koc === dn.uid && x.durum === 'aktif' && x.disiplin !== 'aile');
    w.push({ k: 'danisanlar', ic: '🧑‍⚕️', ad: 'Danışanlarım', mod: 'ekran',
      durum: danisanlar.length ? <><b>{danisanlar.length}</b> danışan · {Array.from(new Set(danisanlar.map((x) => disiplinAdi(x.disiplin)))).join(', ')}</> : 'Henüz danışan yok · davet et',
      imza: danisanlar.map((x) => x.id).join(','),
      govde: () => <Atolye genis={false} kapsam="cevre" /> });
  }

  if (olcum.length) {
    const o = olcum[0];
    const fark = o.onceki ? o.son.deger - o.onceki.deger : null;
    w.push({ k: 'olcum', ic: '📏', ad: 'Ölçümlerim', mod: 'ekran',
      durum: <>{o.tanim.ad} <b>{sayiMetin(o.son.deger)} {o.tanim.birim}</b>{fark ? ` · ${fark > 0 ? '▲' : '▼'} ${sayiMetin(Math.abs(fark))}` : ''}{olcum.length > 1 ? ` · +${olcum.length - 1}` : ''}</>,
      imza: `${o.tanim.id}|${o.son.deger}|${o.son.tarih}`, cizgi: <Cizgi seri={o.seri} />,
      govde: () => <OlcumlerListesi ozet={olcum} /> });
  }

  for (const b of bag) {
    w.push({ k: `b:${b.id}`, ic: '🔗', ad: b.ad, mod: 'ekran', durum: `${host(b.url)} · açılınca yüklenir`, imza: b.url,
      govde: () => <BaglantiTam b={b} onAyar={() => setBagAyar(b)} /> });
  }
  // Bağlantı ayar modalı widget listesinin bir parçası gibi taşınır.
  if (bagAyar) w.push({ k: '__bagAyar', ic: '', ad: '', mod: 'yerinde', durum: '', imza: '', govde: () => <BaglantiFormu b={bagAyar} onKapat={() => setBagAyar(null)} /> });
  return w;
}

// ———————————————— Home ————————————————

export function HomeEkrani() {
  const tum = useWidgetler();
  const ayarModal = tum.find((x) => x.k === '__bagAyar');
  const widgetler = tum.filter((x) => x.k !== '__bagAyar');
  const [duzen, setDuzenS] = useState<Duzen>({ sira: VARSAYILAN_SIRA, gizli: [], sabit: {} });
  useEffect(() => { setDuzenS(duzenOku()); }, []);
  const setDuzen = (d: Duzen) => { setDuzenS(d); duzenYaz(d); };
  const [acik, setAcikS] = useState<Record<string, boolean>>(oturum.acik);
  const setAcik = (a: Record<string, boolean>) => { oturum.acik = a; setAcikS(a); };
  const [ekran, setEkranS] = useState<string | null>(oturum.ekran);
  const setEkran = (e: string | null) => { oturum.ekran = e; setEkranS(e); };
  const [duzenle, setDuzenle] = useState(false);
  const [bagEkle, setBagEkle] = useState(false);

  // Sıra: kayıtlı sıradakiler, sonra yeni çıkanlar (bağlantı eklendi, ölçüm başladı…). Gizliler hariç.
  const varolan = new Map(widgetler.map((x) => [x.k, x]));
  const sira = [...duzen.sira.filter((k) => varolan.has(k)), ...widgetler.map((x) => x.k).filter((k) => !duzen.sira.includes(k))];
  const gorunen = sira.filter((k) => !duzen.gizli.includes(k) || varolan.get(k)?.gizlenemez).map((k) => varolan.get(k)!);
  const gizliler = sira.filter((k) => duzen.gizli.includes(k) && !varolan.get(k)?.gizlenemez).map((k) => varolan.get(k)!);
  const acikMi = (x: Widget) => x.mod === 'yerinde' && !duzenle && (acik[x.k] || duzen.sabit[x.k]);

  const tamW = ekran ? varolan.get(ekran) : undefined;
  if (tamW) {
    return (
      <div className="rt-hw-tam">
        <div className="rt-geri-bar"><button type="button" className="rt-geri-dugme" onClick={() => setEkran(null)}>‹ Home</button><span className="rt-hw-tam-ad">{tamW.ic} {tamW.ad}</span></div>
        <div className="rt-hw-tam-ic">{tamW.govde()}</div>
        {ayarModal?.govde()}
      </div>
    );
  }

  const tasi = (k: string, yon: -1 | 1) => {
    const s = gorunen.map((x) => x.k);
    const i = s.indexOf(k), j = i + yon;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    setDuzen({ ...duzen, sira: [...s, ...duzen.sira.filter((x) => !s.includes(x))] });
  };
  const ac = (x: Widget) => { if (duzenle) return; if (x.mod === 'ekran') setEkran(x.k); else setAcik({ ...acik, [x.k]: true }); };
  const kapat = (x: Widget) => { setAcik({ ...acik, [x.k]: false }); if (duzen.sabit[x.k]) setDuzen({ ...duzen, sabit: { ...duzen.sabit, [x.k]: false } }); };
  const sabitle = (x: Widget) => { setDuzen({ ...duzen, sabit: { ...duzen.sabit, [x.k]: !duzen.sabit[x.k] } }); setAcik({ ...acik, [x.k]: true }); };

  const acikler = gorunen.filter(acikMi);
  const acikSirali = [...acikler.filter((x) => duzen.sabit[x.k]), ...acikler.filter((x) => !duzen.sabit[x.k])];
  const kapalilar = gorunen.filter((x) => !acikMi(x));

  return (
    <div className={`rt-home${duzenle ? ' duzenle' : ''}`}>
      <div className="rt-home-bas">
        <span>HOME</span>
        <button type="button" className="rt-home-duz" onClick={() => setDuzenle(!duzenle)}>{duzenle ? 'Bitti' : 'Düzenle'}</button>
      </div>
      {acikSirali.length > 0 && (
        <div className="rt-hw-acik-alan">
          {acikSirali.map((x) => (
            <section key={x.k} className="rt-hw acik">
              <div className="rt-hw-acik-bas">
                <span className="ic">{x.ic}</span><b>{x.ad}</b>
                {!x.gizlenemez && <button type="button" className={`rt-ikon${duzen.sabit[x.k] ? ' on' : ''}`} title={duzen.sabit[x.k] ? 'Açık tutma' : 'Hep açık tut'} aria-label="Hep açık tut" aria-pressed={!!duzen.sabit[x.k]} onClick={() => sabitle(x)}>📌</button>}
                <button type="button" className="rt-ikon" aria-label="Kapat" onClick={() => kapat(x)}>⌃</button>
              </div>
              <div className="rt-hw-govde">{x.govde()}</div>
            </section>
          ))}
        </div>
      )}
      <div className="rt-hw-izgara">
        {kapalilar.map((x) => (
          <Kart key={x.k} w={x} duzenle={duzenle} onAc={() => ac(x)}
            onGizle={() => setDuzen({ ...duzen, gizli: [...duzen.gizli, x.k], sabit: { ...duzen.sabit, [x.k]: false } })}
            onTasi={(y) => tasi(x.k, y)} />
        ))}
      </div>
      {duzenle && (
        <div className="rt-hw-ekle">
          <span className="rt-hw-ekle-bas">Widget ekle</span>
          {gizliler.map((x) => (
            <button key={x.k} type="button" className="rt-hw-ekle-sat" onClick={() => setDuzen({ ...duzen, gizli: duzen.gizli.filter((k) => k !== x.k) })}>
              <span className="ic">{x.ic}</span><span className="tx"><b>{x.ad}</b><small>gizli</small></span><span className="art">＋</span>
            </button>
          ))}
          <button type="button" className="rt-hw-ekle-sat" onClick={() => setBagEkle(true)}>
            <span className="ic">🔗</span><span className="tx"><b>Bağlantı widget&apos;ı</b><small>bir uygulamanın ekranını Home&apos;a ekle</small></span><span className="art">＋</span>
          </button>
          <p className="rt-muted">Ortak listeler gruba katılınca, Koçlarım koç bağlantısıyla, Ölçümlerim ilk ölçümle kendiliğinden çıkar.</p>
        </div>
      )}
      {bagEkle && <BaglantiFormu b={null} onKapat={() => setBagEkle(false)} />}
      {ayarModal?.govde()}
    </div>
  );
}

function Kart({ w, duzenle, onAc, onGizle, onTasi }: { w: Widget; duzenle: boolean; onAc: () => void; onGizle: () => void; onTasi: (y: -1 | 1) => void }) {
  // Canlı: durum değişince köşede kısa bir nokta yanar (ilk çizimde değil).
  const onceki = useRef<string | null>(null);
  const [yan, setYan] = useState(0);
  useEffect(() => {
    if (onceki.current !== null && onceki.current !== w.imza) setYan((n) => n + 1);
    onceki.current = w.imza;
  }, [w.imza]);
  return (
    <div role="button" tabIndex={duzenle ? -1 : 0} aria-label={w.ad}
      className={`rt-hw kart${w.dikkat ? ' dikkat' : ''}`}
      onClick={onAc} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onAc(); } }}>
      {yan > 0 && <span key={yan} className="rt-hw-canli" aria-hidden />}
      {duzenle && !w.gizlenemez && <button type="button" className="rt-hw-gizle" aria-label={`${w.ad} gizle`} onClick={(e) => { e.stopPropagation(); onGizle(); }}>−</button>}
      <span className="rt-hw-bas">
        <span className="ic">{w.ic}</span>
        {w.rozet ? <span className="rt-hw-rozet">{w.rozet}</span> : null}
        {!duzenle && <span className="rt-hw-yon" aria-hidden>{w.mod === 'ekran' ? '›' : '⌄'}</span>}
      </span>
      <span className="rt-hw-ad">{w.ad}</span>
      <span className="rt-hw-durum">{w.durum}</span>
      {w.cizgi && !duzenle && <span className="rt-hw-cizgi">{w.cizgi}</span>}
      {duzenle && (
        <span className="rt-hw-tasi">
          <button type="button" aria-label="Öne al" onClick={(e) => { e.stopPropagation(); onTasi(-1); }}>‹</button>
          <button type="button" aria-label="Sona al" onClick={(e) => { e.stopPropagation(); onTasi(1); }}>›</button>
        </span>
      )}
    </div>
  );
}

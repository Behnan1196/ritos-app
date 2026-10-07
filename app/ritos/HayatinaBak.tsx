'use client';

// ————————————————————————————————————————————————————————————————
// "Hayatına bakalım" (8 ekim) — Yaşam Tarzım'ın rehberli kapısı. Teknolojiye ve kavramlara uzak biri
// için: tek soru, tek alan, tek küçük adım. Bak (alan alan, 3'lü) → Son bir soru → Bugünkü halin + Seç
// → Küçük bir adım (hazır ya da kendi) → Ne zaman / neyin ardından → Ajanda'ya. Bkz. lib/bakis.ts.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useMemo, useState } from 'react';
import { useCanli } from '@/lib/canli';
import type { YasamAlaniRow } from '@/lib/db';
import { alanAdi, alanlar as yAlanlar, alanlariGaranti } from '@/lib/yasamAlani';
import { ALAN_SORUSU, ARDINDAN, HAFTA_SORUSU, HAZIR_RUTINLER, ISTEKLER, type HazirRutin } from '@/lib/hazirRutin';
import { ODAK_HAFTA, ajandaKartiniBagla, alanOnerisi, bakisKaydet, bakisVarMi, haftalikBakisDurumu, haftalikKaydet, kartYasamDurumu, odak, odakRutinKur, odakSonu, rutinKur, type Cevap3 } from '@/lib/bakis';
import { programGuncelle } from '@/lib/program';
import { ikonOner } from '@/lib/programIkon';
import { Modal } from './ortak';
import type { AjandaKartRow } from '@/lib/db';
import { GUN_KISA } from '@/lib/paket';

const CEVAPLAR: [Cevap3, string][] = [[1, 'İyi değil'], [2, 'İdare eder'], [3, 'İyi']];

function Yuz({ c, boyut = 40 }: { c: Cevap3; boyut?: number }) {
  const agiz = c === 1 ? 'M11.5 23.5c3.3-3.3 7.7-3.3 11 0' : c === 2 ? 'M12 22h10' : 'M11 20.5c3.3 4 8.7 4 12 0';
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="17" cy="17" r="14" /><circle cx="12" cy="14" r="1.2" fill="currentColor" /><circle cx="22" cy="14" r="1.2" fill="currentColor" /><path d={agiz} />
    </svg>
  );
}

// ———————————————— Yaşam Tarzım'daki kapı / odak kartı ————————————————

export function YasamKapisi() {
  const [acik, setAcik] = useState(false);
  const bakis = useCanli(bakisVarMi, [], null as boolean | null);
  const od = useCanli(odak, [], null as Awaited<ReturnType<typeof odak>>);
  const alanlar = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  if (bakis === null) return null;
  // Pencere her zaman aynı yerde durur: kayıt sonrası kart değişince (kapı → odak) akışın durumu sıfırlanmasın.
  let kart: React.ReactNode;
  if (od?.bitti) {
    const a = alanlar.find((x) => x.id === od.p.odak!.alan);
    const sec = (s: 'oturdu' | 'devam' | 'birak') => { void odakSonu(od.p.id, s).catch(() => {}); };
    kart = (
      <div className="rt-hb-odak sonu">
        <div className="ust"><span>{ODAK_HAFTA} HAFTA OLDU</span><small>{a ? `${a.ikon} ${alanAdi(a)}` : ''}</small></div>
        <h3>{od.p.ikon ?? '🌱'} {od.p.ad}: {od.yapilan ? `${od.yapilan} kez yaptın.` : 'bu sefer olmadı, sorun değil.'}</h3>
        <div className="haftalik" aria-label="Haftalık cevapların">
          {od.haftalik.map((c, i) => <span key={i} className={c ? `c${c}` : 'bos'}>{c ? <Yuz c={c} boyut={26} /> : '–'}<small>{i + 1}. hf</small></span>)}
        </div>
        <b className="soru">Bu alışkanlık oturdu mu?</b>
        <button type="button" className="rt-hb-secenek" onClick={() => sec('oturdu')}><span className="bas"><b>Evet, artık alışkanlığım</b></span><small>Ajandanda kalır; sıradaki alana birlikte bakarız.</small></button>
        <button type="button" className="rt-hb-secenek" onClick={() => sec('devam')}><span className="bas"><b>Biraz daha deneyeyim</b></span><small>{ODAK_HAFTA} hafta daha; sonra yine sorarız.</small></button>
        <button type="button" className="rt-hb-secenek" onClick={() => sec('birak')}><span className="bas"><b>Bana göre değil</b></span><small>Ajandandan kalkar; başka küçük bir adım seçeriz.</small></button>
      </div>
    );
  } else if (od) {
    const a = alanlar.find((x) => x.id === od.p.odak!.alan);
    kart = (
      <div className="rt-hb-odak">
        <div className="ust"><span>BU AYIN ODAĞI</span><small>{od.hafta}. hafta</small></div>
        <h3>{a ? `${a.ikon} ${alanAdi(a)}` : od.p.ad}</h3>
        <div className="haftalar" aria-label={`${ODAK_HAFTA} haftanın ${od.hafta}. haftası`}>
          {Array.from({ length: ODAK_HAFTA }, (_, i) => <i key={i} className={i < od.hafta - 1 ? 'bitti' : i === od.hafta - 1 ? 'simdi' : ''} />)}
        </div>
        <div className="rutin"><span className="ik">{od.p.ikon ?? '🌱'}</span><span><b>{od.p.ad}</b><small>{od.yapilan ? `Şimdiye kadar ${od.yapilan} kez yaptın` : 'Ajandanda seni bekliyor'}</small></span></div>
        <div className="alt"><span className="rt-muted">{ODAK_HAFTA} haftanın sonunda nasıl gittiğini birlikte konuşacağız.</span><button type="button" className="rt-linkbtn" onClick={() => setAcik(true)}>Yeniden bak</button></div>
      </div>
    );
  } else if (!bakis) {
    kart = (
      <div className="rt-hb-kapi">
        <h3>Hayatına birlikte bakalım mı?</h3>
        <p>Birkaç kısa soru soracağız. Sonunda nereye biraz daha yer açmak istediğini birlikte seçeceğiz.</p>
        <button type="button" className="rt-btn primary rt-genis" onClick={() => setAcik(true)}>Başlayalım</button>
        <small>2 dakika sürer · cevapların yalnız sende kalır</small>
      </div>
    );
  } else {
    kart = (
      <div className="rt-hb-kapi kucuk">
        <span><b>Bu ay neye biraz yer açalım?</b><small>Hayatına bir daha bak, küçük bir adım seç.</small></span>
        <button type="button" className="rt-btn primary" onClick={() => setAcik(true)}>Bakalım</button>
      </div>
    );
  }
  return <>{kart}{acik && <HayatinaBak onKapat={() => setAcik(false)} />}</>;
}

// ———————————————— akış ————————————————

type Adim = { t: 'bak'; i: number } | { t: 'istek' } | { t: 'cark' } | { t: 'adim' } | { t: 'zaman' } | { t: 'bitti' };

export function HayatinaBak({ onKapat }: { onKapat: () => void }) {
  useEffect(() => { alanlariGaranti().catch(() => {}); }, []);
  const hepsi = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const alanlar = useMemo(() => hepsi.filter((a) => !a.gizli), [hepsi]);
  const [adim, setAdim] = useState<Adim>({ t: 'bak', i: 0 });
  const [cevap, setCevap] = useState<Record<string, Cevap3>>({});
  const [istek, setIstek] = useState<string[]>([]);
  const [not, setNot] = useState('');
  const [alanId, setAlanId] = useState<string | null>(null);
  const [baska, setBaska] = useState(false);
  const [rutin, setRutin] = useState<HazirRutin | null>(null);
  const [kendi, setKendi] = useState<string | null>(null);
  const [gunler, setGunler] = useState<number[]>([]);
  const [ardindan, setArdindan] = useState<string | null>(null);
  const [saat, setSaat] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const mevcutOdak = useCanli(odak, [], null as Awaited<ReturnType<typeof odak>>);
  const [odakIlk] = useState(() => ({ v: undefined as undefined | null | string }));
  if (odakIlk.v === undefined && mevcutOdak !== null) odakIlk.v = mevcutOdak.bitti ? null : mevcutOdak.p.id;

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  const alan = alanlar.find((a) => a.id === alanId) ?? null;
  const oneriler = useMemo(() => alanOnerisi(alanlar, cevap, istek), [alanlar, cevap, istek]);
  const hazirlar = alan?.kod ? HAZIR_RUTINLER.filter((r) => r.alanlar.includes(alan.kod!)).sort((a, b) => Number(b.alanlar[0] === alan.kod) - Number(a.alanlar[0] === alan.kod)).slice(0, 5) : [];
  const istekNotu = (a: YasamAlaniRow) => {
    const e = ISTEKLER.find(([ad, k]) => istek.includes(ad) && a.kod && k.includes(a.kod));
    return e ? `"${e[0]}" demiştin.` : null;
  };

  const geri = () => {
    if (adim.t === 'bak') { if (adim.i > 0) setAdim({ t: 'bak', i: adim.i - 1 }); else onKapat(); }
    else if (adim.t === 'istek') setAdim({ t: 'bak', i: Math.max(0, alanlar.length - 1) });
    else if (adim.t === 'cark') setAdim({ t: 'istek' });
    else if (adim.t === 'adim') setAdim({ t: 'cark' });
    else if (adim.t === 'zaman') setAdim({ t: 'adim' });
  };
  const ileriBak = (i: number) => (i + 1 < alanlar.length ? setAdim({ t: 'bak', i: i + 1 }) : setAdim({ t: 'istek' }));
  const istekBitti = async () => {
    setBekle(true);
    try { await bakisKaydet(cevap, istek, not); setAlanId(alanOnerisi(alanlar, cevap, istek)[0]?.id ?? null); setAdim({ t: 'cark' }); }
    catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setBekle(false); }
  };
  const rutinSec = (r: HazirRutin | null) => {
    setRutin(r);
    const varsayilan = r?.gunler ?? null;
    setGunler(varsayilan ?? [1, 2, 3, 4, 5, 6, 0]);
    setArdindan(r?.ardindan ?? null);
    setSaat('');
  };
  const ad = rutin ? rutin.ad : (kendi ?? '').trim();
  const kur = async () => {
    if (!alan || !ad || !gunler.length) return;
    setBekle(true); setHata(null);
    try {
      await odakRutinKur({ alanId: alan.id, ad, ikon: rutin?.ikon ?? alan.ikon, gunler: gunler.length === 7 ? null : gunler, ardindan, saat: ardindan === 'Belli bir saatte' && saat ? saat : null });
      setAdim({ t: 'bitti' });
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setBekle(false); }
  };
  const gunMetni = gunler.length === 7 ? 'Her gün' : GUN_KISA.filter(([g]) => gunler.includes(g)).map(([, a]) => a).join(' · ');

  const ust = (orta: React.ReactNode) => (
    <div className="rt-hb-ust">
      {adim.t !== 'bitti' ? <button type="button" className="rt-hb-ikon" aria-label="Geri" onClick={geri}>‹</button> : <span />}
      <div className="orta">{orta}</div>
      <button type="button" className="rt-hb-ikon" aria-label="Kapat" onClick={onKapat}>×</button>
    </div>
  );

  let govde: React.ReactNode = null;
  if (!alanlar.length) govde = <div className="rt-hb-govde"><p className="rt-muted">Hazırlanıyor…</p></div>;
  else if (adim.t === 'bak') {
    const a = alanlar[Math.min(adim.i, alanlar.length - 1)];
    govde = (
      <>
        {ust(<div className="rt-hb-ilerleme" aria-label={`${alanlar.length} sorudan ${adim.i + 1}.`}>{alanlar.map((x, i) => <i key={x.id} className={i <= adim.i ? 'on' : ''} />)}</div>)}
        <div className="rt-hb-govde">
          <div className="rt-hb-alan"><span>{a.ikon}</span>{alanAdi(a)}</div>
          <h1>{(a.kod && ALAN_SORUSU[a.kod]) || `${alanAdi(a)} tarafında son zamanlarda nasılsın?`}</h1>
          <div className="rt-hb-cevaplar">
            {CEVAPLAR.map(([c, e]) => (
              <button key={c} type="button" className={`c${c}${cevap[a.id] === c ? ' on' : ''}`} aria-pressed={cevap[a.id] === c}
                onClick={() => { setCevap({ ...cevap, [a.id]: c }); setTimeout(() => ileriBak(adim.i), 220); }}>
                <Yuz c={c} />{e}
              </button>
            ))}
          </div>
          <span className="bosluk" />
          <button type="button" className="rt-linkbtn rt-hb-gec" onClick={() => ileriBak(adim.i)}>Bu soruyu geç</button>
        </div>
      </>
    );
  } else if (adim.t === 'istek') {
    govde = (
      <>
        {ust(<b className="rt-hb-baslik">Son bir soru</b>)}
        <div className="rt-hb-govde">
          <h1>Hayatında neyin biraz daha olmasını isterdin?</h1>
          <p className="rt-muted">İstediğin kadarını seç.</p>
          <div className="rt-hb-cipler">
            {ISTEKLER.map(([e]) => <button key={e} type="button" className={`rt-hb-cip${istek.includes(e) ? ' on' : ''}`} aria-pressed={istek.includes(e)} onClick={() => setIstek(istek.includes(e) ? istek.filter((x) => x !== e) : [...istek, e])}>{e}</button>)}
          </div>
          <label className="rt-hb-etiket">Kendi sözlerinle yazmak istersen
            <textarea className="rt-inp" rows={3} value={not} onChange={(e) => setNot(e.target.value)} />
          </label>
          <small className="rt-muted">Bunu yalnız sen görürsün.</small>
          {hata && <p className="rt-hata">{hata}</p>}
          <span className="bosluk" />
          <button type="button" className="rt-btn primary rt-hb-ana" disabled={bekle} onClick={istekBitti}>Bakalım</button>
        </div>
      </>
    );
  } else if (adim.t === 'cark') {
    const ilkIki = oneriler.slice(0, 2);
    govde = (
      <>
        {ust(null)}
        <div className="rt-hb-govde">
          <h1>İşte bugünkü halin</h1>
          <p className="rt-muted">Doğrusu yanlışı yok; sadece bugün nasıl hissettiğin.</p>
          <div className="rt-hb-cark">
            {alanlar.map((a) => {
              const c = cevap[a.id];
              return (
                <div key={a.id} className={`sat${c === 1 ? ' dusuk' : ''}`}>
                  <span className="ad">{alanAdi(a)}</span>
                  <span className="dilim">{[1, 2, 3].map((n) => <i key={n} className={c && n <= c ? 'on' : ''} />)}</span>
                </div>
              );
            })}
          </div>
          {mevcutOdak && !mevcutOdak.bitti && odakIlk.v === mevcutOdak.p.id && (
            <div className="rt-hb-mevcut">
              <span>Şu an odağın <b>{mevcutOdak.p.ikon ?? '🌱'} {mevcutOdak.p.ad}</b> ({mevcutOdak.hafta}. hafta).</span>
              <button type="button" className="rt-btn primary" onClick={onKapat}>Böyle devam</button>
            </div>
          )}
          <h2>{mevcutOdak && !mevcutOdak.bitti && odakIlk.v === mevcutOdak.p.id ? 'Ya da yeni bir odak seç' : 'Bu ay neye biraz yer açalım?'}</h2>
          {(baska ? alanlar : ilkIki).map((a, i) => (
            <button key={a.id} type="button" className={`rt-hb-secenek${alanId === a.id ? ' on' : ''}`} aria-pressed={alanId === a.id} onClick={() => setAlanId(a.id)}>
              <span className="bas"><b>{a.ikon} {alanAdi(a)}</b>{!baska && i === 0 && <em>Önerimiz</em>}</span>
              {istekNotu(a) && <small>{istekNotu(a)}</small>}
            </button>
          ))}
          {!baska && <button type="button" className="rt-linkbtn rt-hb-gec" onClick={() => setBaska(true)}>Başka bir alan seçeyim</button>}
          <p className="rt-muted rt-hb-sinir">Uzun süredir kendini iyi hissetmiyorsan bir uzmanla konuşmak iyi gelir.</p>
          <span className="bosluk" />
          <button type="button" className="rt-btn primary rt-hb-ana" disabled={!alanId} onClick={() => { rutinSec(null); setKendi(null); setAdim({ t: 'adim' }); }}>Bunu seçiyorum</button>
        </div>
      </>
    );
  } else if (adim.t === 'adim' && alan) {
    govde = (
      <>
        {ust(<b className="rt-hb-baslik">{alan.ikon} {alanAdi(alan)}</b>)}
        <div className="rt-hb-govde">
          <h1>Küçük bir adımla başlayalım</h1>
          <p className="rt-muted">Hangisi sana en kolay geliyor? Küçük başlamak, kalıcı olmanın yolu.</p>
          {hazirlar.map((r) => (
            <button key={r.kod} type="button" className={`rt-hb-secenek satir${rutin?.kod === r.kod ? ' on' : ''}`} aria-pressed={rutin?.kod === r.kod} onClick={() => { rutinSec(r); setKendi(null); }}>
              <span className="ik">{r.ikon}</span><span className="tx"><b>{r.ad}</b><small>{r.alt}</small></span>
            </button>
          ))}
          {kendi === null
            ? <button type="button" className="rt-linkbtn rt-hb-gec" onClick={() => { rutinSec(null); setKendi(''); }}>{hazirlar.length ? 'Kendim yazayım' : 'Ne yapmak istediğini yaz'}</button>
            : <label className="rt-hb-etiket">Ne yapacaksın?<input className="rt-inp" autoFocus value={kendi} placeholder="ör. Bahçeyle ilgilenmek" onChange={(e) => setKendi(e.target.value)} /></label>}
          <span className="bosluk" />
          <button type="button" className="rt-btn primary rt-hb-ana" disabled={!ad} onClick={() => setAdim({ t: 'zaman' })}>Bunu deneyeyim</button>
        </div>
      </>
    );
  } else if (adim.t === 'zaman' && alan) {
    govde = (
      <>
        {ust(<b className="rt-hb-baslik">{alan.ikon} {alanAdi(alan)}</b>)}
        <div className="rt-hb-govde">
          <h1>Ne zaman yaparsın?</h1>
          <span className="rt-hb-alt-baslik">Hangi günler</span>
          <div className="rt-hb-gunler">
            {GUN_KISA.map(([g, e]) => <button key={g} type="button" className={gunler.includes(g) ? 'on' : ''} aria-pressed={gunler.includes(g)} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>)}
          </div>
          <span className="rt-hb-alt-baslik">Neyin ardından?</span>
          <small className="rt-muted">Her gün yaptığın bir şeye bağlarsan unutmazsın.</small>
          <div className="rt-hb-cipler">
            {ARDINDAN.map((e) => <button key={e} type="button" className={`rt-hb-cip${ardindan === e ? ' on' : ''}`} aria-pressed={ardindan === e} onClick={() => setArdindan(ardindan === e ? null : e)}>{e}</button>)}
          </div>
          {ardindan === 'Belli bir saatte' && <input className="rt-inp rt-hb-saat" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} aria-label="Saat" />}
          <span className="rt-hb-alt-baslik kucuk">AJANDANDA ŞÖYLE GÖRÜNECEK</span>
          <div className="rt-hb-onizleme"><span className="halka" /><span><b>{ad}</b><small>{[gunMetni, ardindan === 'Belli bir saatte' ? saat : ardindan?.toLocaleLowerCase('tr'), alanAdi(alan)].filter(Boolean).join(' · ')}</small></span></div>
          {hata && <p className="rt-hata">{hata}</p>}
          <span className="bosluk" />
          <button type="button" className="rt-btn primary rt-hb-ana" disabled={!gunler.length || bekle} onClick={kur}>{bekle ? 'Ekleniyor…' : 'Ajandama ekle'}</button>
        </div>
      </>
    );
  } else if (adim.t === 'bitti') {
    govde = (
      <>
        {ust(null)}
        <div className="rt-hb-govde ortali">
          <div className="rt-hb-tamam" aria-hidden>✓</div>
          <h1>Ajandana eklendi</h1>
          <p>Küçük bir adım attın. Yaptıkça Ajandam&apos;da işaretle; {ODAK_HAFTA} haftanın sonunda nasıl gittiğine birlikte bakacağız.</p>
          <span className="bosluk" />
          <button type="button" className="rt-btn primary rt-hb-ana" onClick={onKapat}>Tamam</button>
        </div>
      </>
    );
  }
  return <div className="rt-hb" role="dialog" aria-modal="true" aria-label="Hayatına bakalım"><div className="rt-hb-ic">{govde}</div></div>;
}

// ———————————————— haftalık bakış (Home, pazar / pazartesi) ————————————————

export function HaftalikBakisKarti() {
  const b = useCanli(haftalikBakisDurumu, [], null as Awaited<ReturnType<typeof haftalikBakisDurumu>>);
  const alanlar = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const [c, setC] = useState<Cevap3 | null>(null);
  const [not, setNot] = useState('');
  const [tamam, setTamam] = useState(false);
  if (tamam) return <div className="rt-hb-hafta tamam"><b>Teşekkürler.</b> Haftaya yine soracağız.</div>;
  if (!b) return null;
  const a = alanlar.find((x) => x.id === b.alanId);
  const soru = (a?.kod && HAFTA_SORUSU[a.kod]) || `Bu hafta ${a ? alanAdi(a).toLocaleLowerCase('tr') : ''} tarafında nasıldın?`;
  return (
    <div className="rt-hb-hafta">
      <span className="ust">HAFTAYA BİR BAKIŞ</span>
      <div className="rutin">
        <span className={`isaret${b.yapilan ? ' on' : ''}`} aria-hidden>{b.yapilan ? '✓' : ''}</span>
        <span><b>{b.yapilan ? `Bu hafta ${b.yapilan} kez yaptın` : 'Bu hafta olmadı'}</b><small>{b.p.ikon ?? '🌱'} {b.p.ad}</small></span>
      </div>
      <h3>{soru}</h3>
      <div className="cevap">
        {CEVAPLAR.map(([k, e]) => <button key={k} type="button" className={`c${k}${c === k ? ' on' : ''}`} aria-pressed={c === k} onClick={() => setC(k)}><Yuz c={k} boyut={32} />{e}</button>)}
      </div>
      <label className="rt-hb-etiket kucuk">Aklında kalan bir şey var mı? <span className="rt-muted">(istersen)</span>
        <input className="rt-inp" value={not} onChange={(e) => setNot(e.target.value)} />
      </label>
      <button type="button" className="rt-btn primary" disabled={!c} onClick={async () => { if (!c) return; await haftalikKaydet(b, c, not); setTamam(true); }}>Tamam</button>
    </div>
  );
}

// ———————————————— Kendim kurayım (8 ekim) ————————————————

/** Kendi rutinini kur: ne, hangi yanına iyi gelir (isteğe bağlı, tahmin yok), hangi günler, neyin ardından. Hazırlardan da seçilebilir. */
export function KendimKur({ alan0, onKapat, onOlustu }: { alan0?: string; onKapat: () => void; onOlustu: (pid: string) => void }) {
  useEffect(() => { alanlariGaranti().catch(() => {}); }, []);
  const hepsi = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const alanlar = hepsi.filter((a) => !a.gizli);
  const [hazirAcik, setHazirAcik] = useState(false);
  const [ad, setAd] = useState('');
  const [ikon, setIkon] = useState<string | null>(null);
  const [secili, setSecili] = useState<string[]>(alan0 ? [alan0] : []);
  const [gunler, setGunler] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [ardindan, setArdindan] = useState<string | null>(null);
  const [saat, setSaat] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const hazirdan = (r: HazirRutin) => {
    setAd(r.ad); setIkon(r.ikon);
    setSecili(alanlar.filter((a) => a.kod && r.alanlar.includes(a.kod)).map((a) => a.id));
    setGunler(r.gunler ?? [1, 2, 3, 4, 5, 6, 0]); setArdindan(r.ardindan); setSaat(''); setHazirAcik(false);
  };
  const kur = async () => {
    if (!ad.trim() || !gunler.length) return;
    setBekle(true); setHata(null);
    try {
      const ilk = alanlar.find((a) => a.id === secili[0]);
      const pid = await rutinKur({ alanIdler: secili, ad, ikon: ikon ?? ikonOner(ad) ?? ilk?.ikon ?? '🌱', gunler: gunler.length === 7 ? null : gunler, ardindan, saat: ardindan === 'Belli bir saatte' && saat ? saat : null });
      onOlustu(pid);
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); setBekle(false); }
  };
  if (hazirAcik) return (
    <Modal baslik="Hazır rutinler" onKapat={() => setHazirAcik(false)}>
      <div className="rt-hb-hazirlar">
        {alanlar.filter((a) => a.kod && HAZIR_RUTINLER.some((r) => r.alanlar[0] === a.kod)).map((a) => (
          <div key={a.id} className="grup">
            <span className="rt-hb-alt-baslik">{a.ikon} {alanAdi(a)}</span>
            {HAZIR_RUTINLER.filter((r) => r.alanlar[0] === a.kod).map((r) => (
              <button key={r.kod} type="button" className="rt-hb-secenek satir" onClick={() => hazirdan(r)}>
                <span className="ik">{r.ikon}</span><span className="tx"><b>{r.ad}</b><small>{r.alt}</small></span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
  return (
    <Modal baslik="Kendi rutinini kur" onKapat={onKapat}>
      <div className="rt-hb-form">
        <button type="button" className="rt-hb-fikir" onClick={() => setHazirAcik(true)}>Fikir mi lazım? Hazır rutinlere bak <span aria-hidden>›</span></button>
        <label className="rt-hb-etiket">Ne yapacaksın?<input className="rt-inp" value={ad} placeholder="ör. Bahçeyle ilgilenmek" onChange={(e) => { setAd(e.target.value); setIkon(null); }} /></label>
        <div className="rt-hb-etiket">Hayatının hangi yanına iyi gelir?
          <div className="rt-hb-cipler">
            {alanlar.map((a) => <button key={a.id} type="button" className={`rt-hb-cip kucuk${secili.includes(a.id) ? ' on' : ''}`} aria-pressed={secili.includes(a.id)} onClick={() => setSecili(secili.includes(a.id) ? secili.filter((x) => x !== a.id) : [...secili, a.id])}>{alanAdi(a)}</button>)}
          </div>
          <small className="rt-muted">Birden fazla seçebilirsin. Emin değilsen boş bırak.</small>
        </div>
        <div className="rt-hb-etiket">Hangi günler?
          <div className="rt-hb-gunler">
            {GUN_KISA.map(([g, e]) => <button key={g} type="button" className={gunler.includes(g) ? 'on' : ''} aria-pressed={gunler.includes(g)} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>)}
          </div>
        </div>
        <div className="rt-hb-etiket">Neyin ardından? <span className="rt-muted">(istersen)</span>
          <div className="rt-hb-cipler">
            {ARDINDAN.map((e) => <button key={e} type="button" className={`rt-hb-cip kucuk${ardindan === e ? ' on' : ''}`} aria-pressed={ardindan === e} onClick={() => setArdindan(ardindan === e ? null : e)}>{e}</button>)}
          </div>
          {ardindan === 'Belli bir saatte' && <input className="rt-inp rt-hb-saat" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} aria-label="Saat" />}
        </div>
        {hata && <p className="rt-hata">{hata}</p>}
        <button type="button" className="rt-btn primary rt-hb-ana" disabled={!ad.trim() || !gunler.length || bekle} onClick={kur}>{bekle ? 'Ekleniyor…' : 'Ajandama ekle'}</button>
      </div>
    </Modal>
  );
}

// ———————————————— Ajanda kart detayında: Yaşam Tarzı'na bağla (8 ekim) ————————————————

export function YasamBag({ kart, onBitti }: { kart: AjandaKartRow; onBitti?: () => void }) {
  useEffect(() => { alanlariGaranti().catch(() => {}); }, []);
  const durum = useCanli(() => kartYasamDurumu(kart), [kart.id, kart.kaynak_ref, kart.bitis], null as Awaited<ReturnType<typeof kartYasamDurumu>>);
  const hepsi = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const alanlar = hepsi.filter((a) => !a.gizli);
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState<string[]>([]);
  const [bekle, setBekle] = useState(false);
  const [tamam, setTamam] = useState(false);
  if (!durum) return null;
  if (tamam) return <p className="rt-hb-bag-tamam">🌱 Yaşam Tarzım&apos;a bağlandı. Kart ajandanda aynen sürüyor.</p>;
  if (durum.tur === 'rutin' && durum.p.alanlar?.length) {
    const adlar = durum.p.alanlar.map((id) => hepsi.find((a) => a.id === id)).filter(Boolean).map((a) => alanAdi(a!)).join(', ');
    return <p className="rt-muted rt-hb-bag-satir">🌱 Yaşam Tarzım · {adlar}</p>;
  }
  if (!acik) return <button type="button" className="rt-hb-bag-ac" onClick={() => setAcik(true)}><span>🌱 Bu bir alışkanlığın mı?</span><b>Yaşam Tarzına bağla ›</b></button>;
  const bagla = async () => {
    setBekle(true);
    try {
      if (durum.tur === 'rutin') await programGuncelle(durum.p.id, { alanlar: secili });
      else await ajandaKartiniBagla(kart, secili);
      setTamam(true); onBitti?.();
    } finally { setBekle(false); }
  };
  return (
    <div className="rt-hb-bag">
      <b>Bu bir alışkanlığın mı?</b>
      <span className="rt-muted">Hayatının hangi yanına iyi geldiğini seçersen Yaşam Tarzım&apos;da görünür, hayatına bakarken de sayılır.</span>
      <div className="rt-hb-cipler">
        {alanlar.map((a) => <button key={a.id} type="button" className={`rt-hb-cip kucuk${secili.includes(a.id) ? ' on' : ''}`} aria-pressed={secili.includes(a.id)} onClick={() => setSecili(secili.includes(a.id) ? secili.filter((x) => x !== a.id) : [...secili, a.id])}>{alanAdi(a)}</button>)}
      </div>
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={() => setAcik(false)}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!secili.length || bekle} onClick={bagla}>Yaşam Tarzıma bağla</button>
      </div>
    </div>
  );
}

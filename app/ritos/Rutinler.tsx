'use client';

// ————————————————————————————————————————————————————————————————
// Rutinlerim — denge, alan sayfası, ay sonu değerlendirmesi (5 ekim, 3. adım).
// Denge: örümcek grafik — yeşil "emeğin" (son 4 hafta), mavi kesik "hissin" (ay sonu, 1–5).
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import type { AlanDegerlendirmeRow, ProgramRow, YasamAlaniRow } from '@/lib/db';
import { alanGuncelle, alanlar as yAlanlar, onerilenKriter } from '@/lib/yasamAlani';
import { alanRutinleri, ayAdi, ayKodu, degerlendir, degerlendirmeler, degerlendirmeZamani, emekHesapla, oncekiAy, type AlanEmek } from '@/lib/denge';
import { Modal } from './ortak';
import { db } from '@/lib/db';
import { ajandadanRutinAdaylari, kuruluyoraDon, oneriAdaylari, oneriReddet, oturduIsaretle, rutinOnerisiReddet } from '@/lib/rutinDongu';
import { programGuncelle, programOlustur } from '@/lib/program';
import { ikonOner } from '@/lib/programIkon';
import { alanOner } from '@/lib/yasamAlani';
import { kocKartlariEkle } from '@/lib/danisanAjanda';
import { bugun, gunFarki, tarihEkle } from '@/lib/paket';

export function useDenge() {
  const liste = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const gorunen = liste.filter((a) => !a.gizli);
  const imza = gorunen.map((a) => a.id).join(',');
  const emek = useCanli(() => emekHesapla(gorunen), [imza], {} as Record<string, AlanEmek>);
  const deg = useCanli(degerlendirmeler, [], {} as Record<string, AlanDegerlendirmeRow[]>);
  return { alanlar: gorunen, tumAlanlar: liste, emek, deg };
}

const sonPuan = (d: AlanDegerlendirmeRow[] | undefined) => d?.[0]?.deger ?? null;

function Radar({ alanlar, emek, deg, boyut = 156 }: { alanlar: YasamAlaniRow[]; emek: Record<string, AlanEmek>; deg: Record<string, AlanDegerlendirmeRow[]>; boyut?: number }) {
  const n = alanlar.length;
  if (n < 3) return null;
  const c = boyut / 2, r = boyut / 2 - 20;
  const nokta = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const rr = (r * Math.max(0, Math.min(4, v))) / 4; return [c + rr * Math.cos(a), c + rr * Math.sin(a)]; };
  const poly = (f: (a: YasamAlaniRow) => number) => alanlar.map((a, i) => nokta(i, f(a)).map((x) => x.toFixed(1)).join(',')).join(' ');
  const hisVar = alanlar.some((a) => sonPuan(deg[a.id]) !== null);
  return (
    <svg className="rt-radar" viewBox={`0 0 ${boyut} ${boyut}`} role="img" aria-label="Denge grafiği">
      {[1, 2, 3, 4].map((k) => <polygon key={k} points={poly(() => k)} fill="none" stroke="var(--line)" strokeWidth="1" />)}
      <polygon points={poly((a) => emek[a.id]?.toplam ?? 0)} fill="var(--green2)" stroke="var(--green)" strokeWidth="1.5" />
      {alanlar.some((a) => (emek[a.id]?.taban ?? 0) > 0) && <polygon points={poly((a) => emek[a.id]?.taban ?? 0)} fill="#cfe2c4" stroke="none" />}
      {hisVar && <polygon points={poly((a) => (sonPuan(deg[a.id]) ?? 1) - 1)} fill="none" stroke="#4f7fa8" strokeWidth="2" strokeDasharray="4 3" />}
      {alanlar.map((a, i) => { const [x, y] = nokta(i, 4.95); const bos = (emek[a.id]?.toplam ?? 0) === 0; return <text key={a.id} x={x} y={y} fontSize="12" textAnchor="middle" dominantBaseline="central" opacity={bos ? 0.45 : 1}>{a.ikon}</text>; })}
    </svg>
  );
}

/** Rutinlerim'in üstü: denge kartı + ay sonu hatırlatması. */
export function DengeKarti({ onDegerlendir }: { onDegerlendir: () => void }) {
  const { alanlar, emek, deg } = useDenge();
  if (!alanlar.length) return null;
  const bos = alanlar.filter((a) => (emek[a.id]?.toplam ?? 0) === 0);
  const tabanVar = alanlar.some((a) => (emek[a.id]?.taban ?? 0) > 0);
  const zaman = degerlendirmeZamani(deg);
  return (
    <>
      {zaman && Object.keys(deg).length > 0 && ( // ilk bakış Yaşam Tarzım'daki "Hayatına bakalım" kapısından (8 ekim)
        <div className="rt-deg-uyari">
          <span>🗓 <b>Ay sonu:</b> hayatına bir daha bak — iki dakika.</span>
          <button type="button" className="rt-btn" onClick={onDegerlendir}>Başla</button>
        </div>
      )}
      <div className="rt-denge">
        <Radar alanlar={alanlar} emek={emek} deg={deg} />
        <div className="rt-denge-sag">
          <b>Denge</b>
          {tabanVar && <span className="rt-lejant"><i className="taban" />Oturmuş alışkanlıklar</span>}
          <span className="rt-lejant"><i className="emek" />Emeğin · son 4 hafta</span>
          <span className="rt-lejant"><i className="his" />Hissin · ay sonu</span>
          {bos.length > 0 && bos.length < alanlar.length && <span className="rt-denge-not"><b>{bos.slice(0, 3).map((a) => `${a.ikon} ${a.ad}`).join(', ')}</b>{bos.length > 3 ? ` +${bos.length - 3}` : ''} son 4 haftada boş.</span>}
          {bos.length === alanlar.length && <span className="rt-denge-not">Rutinlerine alan etiketi verip kartlarını işaretledikçe yeşil alan dolar.</span>}
          {!zaman && <button type="button" className="rt-linkbtn" onClick={onDegerlendir}>Değerlendir</button>}
        </div>
      </div>
    </>
  );
}

/** Alan karoları: emek noktaları (4 hafta). */
export function AlanKarolari({ onAlan, kompakt }: { onAlan: (id: string) => void; kompakt?: boolean }) {
  const { alanlar, emek } = useDenge();
  return (
    <div className={`rt-alan-karolar${kompakt ? ' kompakt' : ''}`}>
      {alanlar.map((a) => {
        const x = emek[a.id]; const tb = x?.taban ?? 0, top = x?.toplam ?? 0;
        return (
          <button key={a.id} type="button" className={`rt-alan-karo${top === 0 ? ' bos' : ''}`} title={a.aciklama} onClick={() => onAlan(a.id)}>
            <span className="ic">{a.ikon}</span><span className="ad">{a.ad}</span>
            <span className="nok" aria-label={`son 4 haftanın ${x?.emek ?? 0} haftasında${tb ? ', oturmuş alışkanlık var' : ''}`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < tb ? 't' : i < top ? 'd' : ''} />)}</span>
          </button>
        );
      })}
    </div>
  );
}

// ———————————————— alan sayfası ————————————————

export function AlanSayfasi({ alanId, onRutin, onYeniRutin, onDegerlendir }: {
  alanId: string; onRutin: (programId: string) => void; onYeniRutin: () => void; onDegerlendir: () => void;
}) {
  const { tumAlanlar, emek, deg } = useDenge();
  const a = tumAlanlar.find((x) => x.id === alanId);
  const rutinler = useCanli(() => alanRutinleri(alanId), [alanId], [] as ProgramRow[]);
  const [kriterAc, setKriterAc] = useState(false);
  if (!a) return null;
  const gecmis = (deg[alanId] ?? []).slice(0, 6).reverse();
  const buAy = (deg[alanId] ?? []).find((d) => d.ay === ayKodu());
  const e = emek[alanId] ?? { hafta: [0, 0, 0, 0], emek: 0, taban: 0, toplam: 0, oturan: [] };
  return (
    <div className="rt-yalan">
      <div className="rt-tek"><span className="ic">{a.ikon}</span><span className="tx"><b>{a.ad}</b><small>{a.aciklama || 'yaşam alanı'}</small></span></div>
      <div className="rt-arac">
        <h4>Bu ay nasıl hissediyorsun?</h4>
        {a.kriterli && a.kriterler?.length
          ? <KriterliPuan alan={a} mevcut={buAy} />
          : <PuanSatiri deger={buAy?.deger ?? null} onSec={(v) => degerlendir(a.id, ayKodu(), v)} />}
        {gecmis.length > 0 && (
          <div className="rt-yalan-gecmis" aria-label="Son değerlendirmeler">
            {gecmis.map((d) => <div key={d.id}><i style={{ height: `${d.deger * 9}px` }} />{ayAdi(d.ay!, true)} · {Number.isInteger(d.deger) ? d.deger : d.deger.toFixed(1)}</div>)}
          </div>
        )}
        <div className="rt-satir" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="rt-linkbtn" onClick={() => setKriterAc(true)}>{a.kriterli ? 'Kriterleri düzenle' : 'Kriterlerle değerlendir'}</button>
          <button type="button" className="rt-linkbtn" onClick={onDegerlendir}>Tüm alanlar ›</button>
        </div>
      </div>
      <div className="rt-arac">
        <h4>Son 4 hafta</h4>
        <div className="rt-yalan-hafta">{e.hafta.map((n, i) => <div key={i}><b>{n}</b>{i === 3 ? 'bu hafta' : `${3 - i} hf önce`}</div>)}</div>
        <p className="rt-muted">Bu alana etiketli rutinlerden yapılan kart sayısı.{e.oturan.length ? <> Oturmuş: <b>{e.oturan.join(', ')}</b> — ajandada izlenmese de dengede yerini korur.</> : null}</p>
      </div>
      <div className="rt-arac">
        <h4>Bu alana dokunan rutinler</h4>
        {rutinler.map((p) => (
          <button key={p.id} type="button" className={`rt-hedef-sat${p.durum === 'arsiv' ? ' soluk' : ''}`} onClick={() => onRutin(p.id)}><span className="ic">{p.ikon ?? '🌱'}</span><span className="ad">{p.ad}</span>
            {p.durum === 'oturdu' && <span className="rt-durum-tag oturdu">✓ oturdu</span>}{p.durum === 'arsiv' && <span className="rt-durum-tag">arşiv</span>}<span className="chev">›</span></button>
        ))}
        {!rutinler.length && <p className="rt-muted">Henüz yok. Küçük bir başlangıç yeter: haftada bir kez bile olsa.</p>}
        <button type="button" className="rt-hedef-sat yeni" onClick={onYeniRutin}><span className="ic">＋</span><span className="ad">Bu alana rutin</span></button>
      </div>
      {kriterAc && <KriterModal alan={a} onKapat={() => setKriterAc(false)} />}
    </div>
  );
}

function PuanSatiri({ deger, onSec, kucuk }: { deger: number | null; onSec: (v: number) => void; kucuk?: boolean }) {
  return (
    <div className={`rt-puan${kucuk ? ' kucuk' : ''}`} role="radiogroup">
      {[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={deger !== null && Math.round(deger) === v} className={deger !== null && Math.round(deger) === v ? 'on' : ''} onClick={() => onSec(v)}>{v}</button>)}
    </div>
  );
}

function KriterliPuan({ alan, mevcut }: { alan: YasamAlaniRow; mevcut?: AlanDegerlendirmeRow }) {
  const kr = alan.kriterler ?? [];
  const [p, setP] = useState<(number | null)[]>(() => kr.map((_, i) => mevcut?.kriter?.[i] ?? null));
  useEffect(() => { setP(kr.map((_, i) => mevcut?.kriter?.[i] ?? null)); }, [mevcut?.zaman, kr.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const kaydet = async (yeni: (number | null)[]) => {
    setP(yeni);
    const dolu = yeni.filter((x): x is number => x !== null);
    if (dolu.length === kr.length) await degerlendir(alan.id, ayKodu(), Math.round((dolu.reduce((s, x) => s + x, 0) / dolu.length) * 10) / 10, dolu);
  };
  return (
    <div className="rt-kriterler">
      {kr.map((k, i) => (
        <div key={i} className="rt-kriter"><span>{k}</span><PuanSatiri kucuk deger={p[i]} onSec={(v) => kaydet(p.map((x, j) => (j === i ? v : x)))} /></div>
      ))}
      {mevcut && <p className="rt-muted">Alan puanı: <b>{mevcut.deger}</b> (kriterlerin ortalaması)</p>}
    </div>
  );
}

function KriterModal({ alan, onKapat }: { alan: YasamAlaniRow; onKapat: () => void }) {
  const oneri = onerilenKriter(alan.kod);
  const [liste, setListe] = useState<string[]>(alan.kriterler?.length ? alan.kriterler : oneri.length ? oneri : ['']);
  const temiz = liste.map((x) => x.trim()).filter(Boolean);
  return (
    <Modal baslik={`${alan.ikon} ${alan.ad} — kriterler`} onKapat={onKapat}>
      <p className="rt-muted">2–4 kısa ifade; her biri 1–5 puanlanır, alan puanı ortalamaları olur. {oneri.length && !alan.kriterler?.length ? 'Öneriler hazır; istediğini değiştir.' : ''}</p>
      {liste.map((k, i) => (
        <div key={i} className="rt-satir" style={{ flexWrap: 'nowrap' }}>
          <input className="rt-inp" value={k} placeholder="ör. Yakınlarımla yeterince vakit geçiriyorum" onChange={(e) => setListe(liste.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="rt-ikon" aria-label="Kriteri kaldır" onClick={() => setListe(liste.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      {liste.length < 4 && <button type="button" className="rt-linkbtn" onClick={() => setListe([...liste, ''])}>＋ Kriter ekle</button>}
      <div className="rt-satir" style={{ justifyContent: 'space-between' }}>
        {alan.kriterli
          ? <button type="button" className="rt-btn" onClick={async () => { await alanGuncelle(alan.id, { kriterli: false }); onKapat(); }}>Tek soruya dön</button>
          : <span />}
        <button type="button" className="rt-btn primary" disabled={temiz.length < 2} onClick={async () => { await alanGuncelle(alan.id, { kriterli: true, kriterler: temiz }); onKapat(); }}>Kaydet</button>
      </div>
    </Modal>
  );
}

// ———————————————— ay sonu değerlendirmesi ————————————————

export function AySonu({ onBitti }: { onBitti: () => void }) {
  const { alanlar, deg } = useDenge();
  const ay = ayKodu();
  const [taslak, setTaslak] = useState<Record<string, number>>({});
  const [kAcik, setKAcik] = useState<Record<string, boolean>>({});
  const [kTaslak, setKTaslak] = useState<Record<string, (number | null)[]>>({});
  const onceki = (id: string) => (deg[id] ?? []).find((d) => d.ay !== ay);
  const buAy = (id: string) => (deg[id] ?? []).find((d) => d.ay === ay);
  const deger = (id: string) => taslak[id] ?? buAy(id)?.deger ?? null;
  const soru = alanlar.reduce((n, a) => n + (a.kriterli && a.kriterler?.length ? a.kriterler.length : 1), 0);
  const kriterSec = (a: YasamAlaniRow, i: number, v: number) => {
    const ilk = kTaslak[a.id] ?? (a.kriterler ?? []).map((_, j) => buAy(a.id)?.kriter?.[j] ?? null);
    const yeni = ilk.map((x, j) => (j === i ? v : x));
    setKTaslak({ ...kTaslak, [a.id]: yeni });
    const dolu = yeni.filter((x): x is number => x !== null);
    if (dolu.length === yeni.length) setTaslak({ ...taslak, [a.id]: Math.round((dolu.reduce((s, x) => s + x, 0) / dolu.length) * 10) / 10 });
  };
  const kaydet = async () => {
    for (const p of oturanlar) if (birakilan[p.id]) await kuruluyoraDon(p.id);
    for (const a of alanlar) {
      const v = taslak[a.id];
      if (v === undefined) continue;
      const kr = kTaslak[a.id]?.every((x) => x !== null) ? (kTaslak[a.id] as number[]) : undefined;
      await degerlendir(a.id, ay, v, kr);
    }
    onBitti();
  };
  const dolu = alanlar.filter((a) => deger(a.id) !== null).length;
  const oturanlar = useCanli(async () => (await db.program.toArray()).filter((p) => !p.uzak && !p.sablon && p.durum === 'oturdu'), [], [] as ProgramRow[]);
  const [birakilan, setBirakilan] = useState<Record<string, boolean>>({});
  return (
    <div className="rt-aysonu">
      <div className="rt-tek"><span className="ic">🗓</span><span className="tx"><b>{ayAdi(ay)} değerlendirmesi</b><small>{dolu}/{alanlar.length} alan</small></span></div>
      <p className="rt-muted">Her alan için içinden gelen sayıyı seç; doğru cevap yok. Geçen ayki değer yanında görünür.{soru > 20 ? ' Değerlendirme uzuyor; bazı alanları tek soruya döndürmeyi düşünebilirsin.' : ''}</p>
      {oturanlar.length > 0 && (
        <div className="rt-arac">
          <h4>Oturmuş rutinlerin sürüyor mu?</h4>
          {oturanlar.map((p) => (
            <label key={p.id} className="rt-tik-sat">
              <input type="checkbox" checked={!birakilan[p.id]} onChange={(e) => setBirakilan({ ...birakilan, [p.id]: !e.target.checked })} />
              <span>{p.ikon ?? '🌱'} {p.ad}</span>
            </label>
          ))}
          <p className="rt-muted">İşaretini kaldırdığın rutin &quot;kuruluyor&quot;a döner; kartları yarından Ajandam&apos;a geri gelir.</p>
        </div>
      )}
      <div className="rt-arac">
        {alanlar.map((a) => {
          const o = onceki(a.id);
          const kriterli = !!(a.kriterli && a.kriterler?.length);
          return (
            <div key={a.id} className="rt-aysonu-sat">
              <div className="ust"><span>{a.ikon} <b>{a.ad}</b></span><small>{o ? `${ayAdi(o.ay!, true)}: ${o.deger}` : 'ilk kez'}</small></div>
              <PuanSatiri deger={deger(a.id)} onSec={(v) => { setTaslak({ ...taslak, [a.id]: v }); setKTaslak({ ...kTaslak, [a.id]: (a.kriterler ?? []).map(() => null) }); }} />
              {kriterli && (
                <>
                  <button type="button" className="rt-linkbtn" onClick={() => setKAcik({ ...kAcik, [a.id]: !kAcik[a.id] })}>{kAcik[a.id] ? '▾' : '▸'} {a.kriterler!.length} kriter</button>
                  {kAcik[a.id] && a.kriterler!.map((k, i) => {
                    const v = (kTaslak[a.id] ?? (a.kriterler ?? []).map((_, j) => buAy(a.id)?.kriter?.[j] ?? null))[i];
                    return <div key={i} className="rt-kriter"><span>{k}</span><PuanSatiri kucuk deger={v} onSec={(x) => kriterSec(a, i, x)} /></div>;
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="rt-btn primary rt-genis" disabled={!Object.keys(taslak).length && !Object.values(birakilan).some(Boolean)} onClick={kaydet}>Kaydet</button>
      <p className="rt-muted">Bir önceki ay: {ayAdi(oncekiAy(ay))}. Değerlendirmeler hesabınla eşitlenir; yalnız sen görürsün.</p>
    </div>
  );
}

// ———————————————— "alışkanlık oldu mu?" önerisi ————————————————

export function AliskanlikOnerisi() {
  const adaylar = useCanli(oneriAdaylari, [], [] as Awaited<ReturnType<typeof oneriAdaylari>>);
  const [bekle, setBekle] = useState(false);
  const a = adaylar[0];
  if (!a) return null;
  return (
    <div className="rt-aliskanlik">
      <span className="ic">🌱</span>
      <span className="tx"><b>{a.p.ikon ?? ''} {a.p.ad}</b> {a.hafta} haftadır neredeyse hiç aksamadı (%{Math.round(a.oran * 100)}). Alışkanlık oldu mu? Olduysa Ajandam&apos;dan kaldırırım; dengede yerini korur.</span>
      <span className="ey">
        <button type="button" className="rt-btn" disabled={bekle} onClick={() => oneriReddet(a.p.id)}>Henüz değil</button>
        <button type="button" className="rt-btn primary" disabled={bekle} onClick={async () => { setBekle(true); await oturduIsaretle(a.p.id); setBekle(false); }}>Oturdu</button>
      </span>
    </div>
  );
}

// ———————————————— Ajandam'dan rutin önerisi ————————————————

export function AjandadanRutinOnerisi({ onOlustu }: { onOlustu: (programId: string) => void }) {
  const adaylar = useCanli(ajandadanRutinAdaylari, [], [] as Awaited<ReturnType<typeof ajandadanRutinAdaylari>>);
  const [bekle, setBekle] = useState(false);
  const a = adaylar[0];
  if (!a) return null;
  const kaydet = async () => {
    setBekle(true);
    try {
      const k = a.kart;
      const pid = await programOlustur(k.ad, '');
      await programGuncelle(pid, { ikon: ikonOner(k.ad) ?? undefined, kimden: 'Kendim', alanlar: alanOner(k.ad) });
      const yarin = tarihEkle(bugun(), 1);
      await kocKartlariEkle({ tur: 'program', programId: pid }, [{ tarih: yarin, kart: { tip: k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null, saatler: k.saatler }, tekrar: { gun: k.bitis ? gunFarki(yarin, k.bitis) + 1 : null, gunler: k.gunler } }]);
      await db.ajanda_kart.update(k.id, { bitis: bugun(), guncellendi: Date.now() });
      onOlustu(pid);
    } finally { setBekle(false); }
  };
  return (
    <div className="rt-aliskanlik ajanda">
      <span className="ic">✨</span>
      <span className="tx"><b>{a.kart.ad}</b> {a.hafta} haftadır Ajandam&apos;da tekrar ediyor. Rutin olarak kaydedeyim mi? Alanlarını ve dengedeki yerini birlikte izleriz.</span>
      <span className="ey">
        <button type="button" className="rt-btn" disabled={bekle} onClick={() => rutinOnerisiReddet(a.kart.id)}>Hayır</button>
        <button type="button" className="rt-btn primary" disabled={bekle} onClick={kaydet}>Kaydet</button>
      </span>
    </div>
  );
}

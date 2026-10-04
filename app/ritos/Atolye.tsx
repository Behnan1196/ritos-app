'use client';

// ————————————————————————————————————————————————————————————————
// Atölye (3 ekim) — kurduğun her şeyin hazırlandığı yer: danışanların, aile (verdiğin görevler),
// kişisel programların ve Kütüphane. Günüm yalnız kendi ajandandır; burada başkası ya da bir
// program için planlarsın.  [🗂 Planlar | 📚 Kütüphane]
//  • Telefonda hedefler üstte çip; geniş ekranda solda liste.
//  • Sekmeden çıkıp dönünce kaldığın yer korunur (hedef, alt sekme, tarih, görünüm) — oturum boyunca.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db, type AileRow, type IliskiRow, type KutuphaneKartRow, type ProgramRow } from '@/lib/db';
import { bugun, degerBloklari, iyelik, tarihEkle, tarihEtiket, tarihParse } from '@/lib/paket';
import { aileAktifMi, aileGorevIliski, haftaNotuGonder } from '@/lib/danismanlik';
import { danisanGunleri, gonderimAyarla, kocKartEkle, planDurumu, type KocKarti } from '@/lib/danisanAjanda';
import { SURE_ANAHTAR } from './KartEditor';
import { disiplinAdi, useDanismanlik } from '@/lib/danismanlik';
import { useSeciliDanisan } from '@/lib/seciliDanisan';
import type { PlanHedef } from '@/lib/danisanAjanda';
import { DanisanAjandasi } from './DanisanAjanda';
import { AyTakvimi, haftaBasi, haftaEtiket } from './AjandaPane';
import { DISIPLIN_IKON, danismanlikBaslik } from './DanismanlikEkrani';
import Kutuphane from './Kutuphane';

type Alt = 'planlar' | 'kutuphane';
// Oturum boyunca korunan durum (sekme değişince bileşen kapanır; modül değişkeni kalır).
// seciciAcik (4 ekim): telefonda Atölye'ye ilk girişte önce "kimi planlıyorum" seçimi açılır.
const durum: { alt: Alt; tarih: string | null; hafta: boolean; seciciAcik: boolean } = { alt: 'planlar', tarih: null, hafta: true, seciciAcik: true };
// Başka ekrandan "Atölye'de planla" (hedef önceden seçili): seçici atlanır. Atölye henüz açık değilken de yakalanır.
if (typeof window !== 'undefined') window.addEventListener('ritos-atolyeye-git', () => { durum.alt = 'planlar'; durum.seciciAcik = false; });

const SON_ANAH = 'ritos-atolye-son';
function sonlariOku(): string[] { try { return JSON.parse(localStorage.getItem(SON_ANAH) ?? '[]'); } catch { return []; } }
function sonaEkle(id: string) { try { localStorage.setItem(SON_ANAH, JSON.stringify([id, ...sonlariOku().filter((x) => x !== id)].slice(0, 5))); } catch { /* yok say */ } }

interface Hedef { id: string; grup: string; grupIc: string; ic: string; ad: string; alt?: string; h: PlanHedef }
/** 4 ekim — henüz görev verilmemiş aile üyesi: seçilince görev ilişkisi sessizce kurulur. */
interface Aday { id: string; uye: string; ad: string }

function useAdaylar(hedefler: Hedef[]): Aday[] {
  const dn = useDanismanlik();
  const aileler = useCanli(() => db.aile.toArray(), [], [] as AileRow[]);
  const aile = aileler.find(aileAktifMi);
  if (!aile) return [];
  const var_ = new Set(hedefler.filter((x) => x.h.tur === 'danisan' && x.h.il.disiplin === 'aile').map((x) => (x.h as { il: IliskiRow }).il.danisan));
  return aile.uyeler.filter((u) => u.uye !== dn.uid && u.durum === 'aktif' && !var_.has(u.uye)).map((u) => ({ id: `aile:${u.uye}`, uye: u.uye, ad: u.ad }));
}

function useHedefler(): Hedef[] {
  const dn = useDanismanlik();
  const iliskiler = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.durum === 'aktif' && i.koc === dn.uid), [dn.uid], [] as IliskiRow[]);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], [] as ProgramRow[]);
  const liste: Hedef[] = [];
  for (const i of iliskiler.filter((x) => x.disiplin !== 'aile').sort((a, b) => a.disiplin.localeCompare(b.disiplin) || a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: danismanlikBaslik(i.disiplin), grupIc: DISIPLIN_IKON[i.disiplin] ?? '🤝', ic: DISIPLIN_IKON[i.disiplin] ?? '🤝', ad: i.danisan_ad, alt: disiplinAdi(i.disiplin), h: { tur: 'danisan', il: i } });
  }
  for (const i of iliskiler.filter((x) => x.disiplin === 'aile').sort((a, b) => a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: 'Ailem', grupIc: '👪', ic: '👪', ad: i.danisan_ad, alt: 'verdiğin görevler', h: { tur: 'danisan', il: i } });
  }
  for (const p of programlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) {
    liste.push({ id: `p:${p.id}`, grup: 'Programlarım', grupIc: '🌱', ic: '🌱', ad: p.ad, alt: 'kişisel program', h: { tur: 'program', programId: p.id } });
  }
  return liste;
}

export default function Atolye({ genis }: { genis: boolean }) {
  const [alt, setAltS] = useState<Alt>(durum.alt);
  const setAlt = (a: Alt) => { durum.alt = a; setAltS(a); };
  // Başka yerden "Atölye'de planla" gelince Planlar açılır (hedef önceden seçilmiştir).
  useEffect(() => {
    const f = () => setAlt('planlar');
    window.addEventListener('ritos-atolyeye-git', f);
    return () => window.removeEventListener('ritos-atolyeye-git', f);
  }, []);
  return (
    <div className={`rt-atolye${genis ? ' genis' : ''}`}>
      <div className="rt-atolye-ust">
        <div className="rt-gorunum rt-atolye-alt" role="tablist" aria-label="Atölye">
          <button type="button" role="tab" aria-selected={alt === 'planlar'} className={alt === 'planlar' ? 'on' : ''} onClick={() => setAlt('planlar')}>🗂 Planlar</button>
          <button type="button" role="tab" aria-selected={alt === 'kutuphane'} className={alt === 'kutuphane' ? 'on' : ''} onClick={() => setAlt('kutuphane')}>📚 Kütüphane</button>
        </div>
      </div>
      {alt === 'planlar' ? <Planlar genis={genis} /> : <div className="rt-atolye-kut"><Kutuphane /></div>}
    </div>
  );
}

function Planlar({ genis }: { genis: boolean }) {
  const hedefler = useHedefler();
  const [secili, setSecili] = useSeciliDanisan();
  const [tarih, setTarihS] = useState(durum.tarih ?? bugun());
  const [hafta, setHaftaS] = useState(durum.hafta);
  const [ayAcik, setAyAcik] = useState(false);
  const setTarih = (t: string) => { durum.tarih = t; setTarihS(t); };
  const setHafta = (h: boolean) => { durum.hafta = h; setHaftaS(h); };
  const adaylar = useAdaylar(hedefler);
  const [kuruluyor, setKuruluyor] = useState<string | null>(null);
  const [kurHata, setKurHata] = useState<string | null>(null);
  const h = hedefler.find((x) => x.id === secili) ?? null;

  const [seciciAcik, setSeciciAcikS] = useState(durum.seciciAcik);
  const setSeciciAcik = (v: boolean) => { durum.seciciAcik = v; setSeciciAcikS(v); };
  const sec = (id: string) => { setSecili(id); sonaEkle(id); setSeciciAcik(false); };

  // Geniş ekranda liste hep görünür: seçim yoksa ilk hedef seçilir. Telefonda seçim ekranı açılır.
  useEffect(() => {
    if (h || kuruluyor || !hedefler.length) return;
    if (genis) setSecili(hedefler[0].id); else setSeciciAcik(true);
  }, [h, hedefler.length, kuruluyor, genis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aile üyesi ilk kez seçilince görev ilişkisi kurulur (ayrı bir "Görev ver" adımı yok).
  const adaySec = async (a: Aday) => {
    setKurHata(null); setKuruluyor(a.id);
    try { const id = await aileGorevIliski(a.uye); sec(id); }
    catch (e) { setKurHata(`${a.ad} için hazırlanamadı: ${(e as Error).message}`); }
    finally { setKuruluyor(null); }
  };

  if (!hedefler.length && !adaylar.length) {
    return (
      <div className="rt-atolye-bos">
        <p className="rt-metin"><b>Henüz planlayacağın bir şey yok.</b></p>
        <ul className="rt-maddeler rt-muted">
          <li>Aile grubu kur (Ayarlar › Aile); ailendekiler burada listelenir, görev verirsin.</li>
          <li>Danışanların varsa Home › Danışmanlık&apos;tan davet et.</li>
          <li>Aldığın programlar da burada planlanır.</li>
        </ul>
      </div>
    );
  }

  const t0 = bugun();
  const adim = hafta ? 7 : 1;
  const bugunGorunur = hafta ? haftaBasi(tarih) === haftaBasi(t0) : tarih === t0;

  const secici = (
    <HedefSecici hedefler={hedefler} adaylar={adaylar} seciliId={h?.id ?? null} kompakt={genis}
      kuruluyor={kuruluyor} onSec={(x) => sec(x.id)} onAday={adaySec} />
  );

  // Telefon: seçim açıkken yalnız seçici (ajanda görünmez); seçilince tek satıra iner.
  if (!genis && (seciciAcik || !h) && !kuruluyor) {
    return (
      <div className="rt-atolye-plan">
        {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
        {h && <button type="button" className="rt-linkbtn" onClick={() => setSeciciAcik(false)}>‹ {h.ad} planına dön</button>}
        {secici}
      </div>
    );
  }

  return (
    <div className="rt-atolye-plan">
      {genis && <aside className="rt-atolye-sol" aria-label="Kimi planlıyorum">{secici}</aside>}
      <section className="rt-atolye-orta">
        {kuruluyor && <p className="rt-muted">Hazırlanıyor…</p>}
        {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
        {!h && !kuruluyor && !kurHata && <p className="rt-muted">Kime plan yapacağını seç.</p>}
        {h && !kuruluyor && (
          <>
            {genis
              ? <div className="rt-hedef-bas"><b>{h.ic} {h.ad}</b>{h.alt && <span className="rt-muted"> · {h.alt}</span>}</div>
              : (
                <button type="button" className="rt-hedef-satir" onClick={() => setSeciciAcik(true)} aria-label="Kimi planladığını değiştir">
                  <span className="ic">{h.ic}</span>
                  <span className="tx"><b>{h.ad}</b><small>{h.grup}</small></span>
                  <span className="degis">Değiştir ▾</span>
                </button>
              )}
            <div className="rt-daterow">
              <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, -adim))} aria-label={hafta ? 'Önceki hafta' : 'Önceki gün'}>‹</button>
              <button className="rt-dlabel" onClick={() => setAyAcik(true)}>
                {hafta ? haftaEtiket(haftaBasi(tarih)) : tarihEtiket(tarih)}
                {!bugunGorunur && <span className="rt-totoday" onClick={(e) => { e.stopPropagation(); setTarih(t0); }}>↺ bugüne dön</span>}
              </button>
              <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, adim))} aria-label={hafta ? 'Sonraki hafta' : 'Sonraki gün'}>›</button>
              <div className="rt-gorunum" role="group" aria-label="Görünüm">
                <button type="button" className={!hafta ? 'on' : ''} onClick={() => setHafta(false)}>Gün</button>
                <button type="button" className={hafta ? 'on' : ''} onClick={() => setHafta(true)}>Hafta</button>
              </div>
            </div>
            <DanisanAjandasi
              key={h.id}
              h={h.h}
              baslik={h.h.tur === 'program'
                ? <>Yalnız bu programın kartları. Burada kurduğun kartlar Ajandam&apos;a da düşer.</>
                : h.grup === 'Ailem'
                  ? <>Ona verdiğin görevler ve durumları. İşaretleyince burada görürsün.</>
                  : <>Yalnız senin atadığın kartlar görünür.</>}
              tarih={tarih} hafta={hafta} haftaBas={haftaBasi(tarih)} onGun={(t) => { setTarih(t); setHafta(false); }} />
            {!genis && <AtolyeAraclari h={h} haftaBas={haftaBasi(tarih)} />}
          </>
        )}
      </section>
      {genis && h && (
        <aside className="rt-atolye-sag">
          <AtolyeAraclari h={h} haftaBas={haftaBasi(tarih)} />
          <KutuphaneSurukle h={h} />
        </aside>
      )}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
    </div>
  );
}

// ———————————————— Araçlar (3 ekim) ————————————————
// Hedefin son 4 haftası kartlardan okunur: bu hafta, uyum, ölçümler. Danışan / aile için gönderim.

const yuzde = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface Seri { ad: string; birim: string; noktalar: { t: string; v: number }[] }

function serileriCikar(kartlar: KocKarti[]): Seri[] {
  const m = new Map<string, Seri>();
  for (const k of kartlar) {
    if (!k.degerler) continue;
    const bloklar = degerBloklari(k.adim.bloklar);
    const ekle = (anahtar: string, ad: string, birim: string) => {
      const v = Number((k.degerler as Record<string, unknown>)[anahtar]);
      if (!Number.isFinite(v)) return;
      const key = anahtar === SURE_ANAHTAR ? `${k.adim.ad}|${anahtar}` : anahtar; // aynı ölçü (ör. kilo) farklı kartlardan tek seri
      if (!m.has(key)) m.set(key, { ad, birim, noktalar: [] });
      m.get(key)!.noktalar.push({ t: k.tarih, v });
    };
    for (const b of bloklar) if (b.tur === 'sayi') ekle(b.anahtar, b.etiket, b.bicim === 'olcek' ? '/5' : b.birim ?? '');
    if (SURE_ANAHTAR in (k.degerler as object)) ekle(SURE_ANAHTAR, `${k.adim.ad} · süre`, 'dk');
  }
  return Array.from(m.values()).filter((x) => x.noktalar.length).map((x) => ({ ...x, noktalar: x.noktalar.sort((a, b) => a.t.localeCompare(b.t)) }));
}

function Kivrim({ n }: { n: number[] }) {
  if (n.length < 2) return null;
  const min = Math.min(...n), max = Math.max(...n), g = 90, y = 24;
  const pts = n.map((v, i) => `${(i / (n.length - 1)) * g},${max === min ? y / 2 : y - 2 - ((v - min) / (max - min)) * (y - 4)}`).join(' ');
  return <svg className="rt-kivrim" viewBox={`0 0 ${g} ${y}`} width={g} height={y} aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}

function AtolyeAraclari({ h, haftaBas }: { h: Hedef; haftaBas: string }) {
  const gunler = Array.from({ length: 28 }, (_, i) => tarihEkle(haftaBas, i - 21));
  const veri = useCanli(() => danisanGunleri(h.h, gunler), [h.id, haftaBas], {} as Record<string, KocKarti[]>);
  const pd = useCanli(() => planDurumu(h.h), [h.id], null as Awaited<ReturnType<typeof planDurumu>>);
  const [hata, setHata] = useState<string | null>(null);
  const t0 = bugun();
  const hafta = gunler.slice(21).flatMap((t) => veri[t] ?? []);
  const haftalar = [0, 1, 2, 3].map((w) => {
    const ks = gunler.slice(w * 7, w * 7 + 7).filter((t) => t <= t0).flatMap((t) => veri[t] ?? []);
    return { bas: gunler[w * 7], yap: ks.filter((k) => k.yapildi).length, top: ks.length };
  });
  const seriler = serileriCikar(gunler.flatMap((t) => veri[t] ?? [])).slice(0, 5);
  const kim = h.h.tur === 'danisan' ? h.h.il.danisan_ad : '';
  const yap = hafta.filter((k) => k.yapildi).length;
  return (
    <div className="rt-araclar">
      <div className="rt-arac">
        <h4>Bu hafta</h4>
        <div className="rt-buyuk">%{yuzde(yap, hafta.length)}<small>{yap}/{hafta.length} kart yapıldı</small></div>
      </div>
      <div className="rt-arac">
        <h4>Son 4 hafta · bugüne kadar</h4>
        {haftalar.map((w) => (
          <div key={w.bas} className="rt-cizgi">
            <span className="ad">{tarihParse(w.bas).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
            <span className="yol"><i style={{ width: `${yuzde(w.yap, w.top)}%` }} /></span>
            <span className="d">{w.top ? `%${yuzde(w.yap, w.top)}` : '—'}</span>
          </div>
        ))}
      </div>
      <div className="rt-arac">
        <h4>Ölçümler</h4>
        {seriler.length === 0 && <p className="rt-muted">Son 4 haftada girilen değer yok. Karta 📏 ölçüm eklersen burada seri olarak görünür.</p>}
        {seriler.map((x) => {
          const n = x.noktalar.map((p) => p.v);
          const son = n[n.length - 1], fark = son - n[0];
          return (
            <div key={x.ad} className="rt-seri">
              <span className="ad">{x.ad}</span>
              <Kivrim n={n} />
              <span className="d"><b>{son.toLocaleString('tr-TR')}</b>{x.birim && x.birim !== '/5' ? ` ${x.birim}` : x.birim}{n.length > 1 && fark !== 0 && <small> {fark > 0 ? '↑' : '↓'}{Math.abs(Math.round(fark * 10) / 10).toLocaleString('tr-TR')}</small>}</span>
            </div>
          );
        })}
      </div>
      {pd && <GeriBildirim h={h} haftaBas={haftaBas} kartlar={hafta} programId={pd.programId} hicGonderilmedi={pd.hicGonderilmedi} />}
      {pd && (
        <div className="rt-arac">
          <h4>Gönderim</h4>
          <div className="rt-gorunum rt-gonderim" role="group" aria-label="Gönderim">
            <button type="button" className={pd.gonderim === 'hemen' ? 'on' : ''} onClick={() => gonderimAyarla(h.h, 'hemen').catch((e) => setHata((e as Error).message))}>Hemen gönder</button>
            <button type="button" className={pd.gonderim === 'gonder' ? 'on' : ''} onClick={() => gonderimAyarla(h.h, 'gonder').catch((e) => setHata((e as Error).message))}>Gönder deyince</button>
          </div>
          <p className="rt-muted">{pd.gonderim === 'gonder'
            ? `Değişiklikler taslak kalır; "Gönder" deyince ${iyelik(kim)} Ajanda'sına düşer.`
            : `Her değişiklik birkaç saniye içinde ${iyelik(kim)} Ajanda'sına yansır.`}</p>
          {hata && <p className="rt-hata">{hata}</p>}
        </div>
      )}
    </div>
  );
}

// Geniş ekranda: Kütüphane kartını haftanın bir gününe sürükle → seçili hedefin planına eklenir.
function KutuphaneSurukle({ h }: { h: Hedef }) {
  const kartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  const [tasi, setTasi] = useState<{ k: KutuphaneKartRow; x: number; y: number } | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  useEffect(() => {
    if (!tasi) return;
    const k = tasi.k;
    const hareket = (e: PointerEvent) => setTasi((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
    const birak = async (e: PointerEvent) => {
      setTasi(null);
      const gun = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-tarih]')?.dataset.tarih;
      if (!gun) return;
      try {
        await kocKartEkle(h.h, gun, { tip: k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null });
        setMesaj(`"${k.ad}" ${tarihEtiket(gun)} gününe eklendi.`);
      } catch (x) { setMesaj((x as Error).message); }
    };
    window.addEventListener('pointermove', hareket);
    window.addEventListener('pointerup', birak, { once: true });
    return () => { window.removeEventListener('pointermove', hareket); window.removeEventListener('pointerup', birak); };
  }, [tasi?.k.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kartlar.length) return null;
  return (
    <div className="rt-arac rt-kut-surukle">
      <h4>📚 Kütüphane — haftaya sürükle</h4>
      {mesaj && <p className="rt-tamam" onClick={() => setMesaj(null)}>{mesaj}</p>}
      {kartlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((k) => (
        <div key={k.id} className="rt-kut-oge" onPointerDown={(e) => { e.preventDefault(); setMesaj(null); setTasi({ k, x: e.clientX, y: e.clientY }); }}>{k.ad}</div>
      ))}
      {tasi && <div className="rt-hayalet" style={{ left: tasi.x, top: tasi.y }}>{tasi.k.ad}</div>}
    </div>
  );
}

// ———————————————— 3 ekim — geri bildirim (koç tarafı) ————————————————
// Haftanın kart notları (danışanın yazdıkları) + koçun haftalık değerlendirmesi.

function GeriBildirim({ h, haftaBas, kartlar, programId, hicGonderilmedi }: { h: Hedef; haftaBas: string; kartlar: KocKarti[]; programId: string | null; hicGonderilmedi: boolean }) {
  const p = useCanli(async () => (programId ? (await db.program.get(programId)) ?? null : null), [programId], null as ProgramRow | null);
  const kayitli = p?.hafta_notlari?.[haftaBas]?.metin ?? '';
  const [metin, setMetin] = useState(kayitli);
  const [durum, setDurum] = useState<string | null>(null);
  useEffect(() => { setMetin(kayitli); setDurum(null); }, [haftaBas, kayitli]);
  const notlar = kartlar.filter((k) => k.yorum).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const kim = h.h.tur === 'danisan' ? h.h.il.danisan_ad : '';
  return (
    <div className="rt-arac">
      <h4>Geri bildirim</h4>
      {notlar.length === 0 && <p className="rt-muted">Bu hafta karta not yok. {kim} kartı açıp &quot;💬 Not bırak&quot; ile yazar.</p>}
      {notlar.map((k) => (
        <div key={`${k.adim.id}|${k.tarih}`} className="rt-gb-not">
          <span className="ne">{tarihParse(k.tarih).toLocaleDateString('tr-TR', { weekday: 'short' })} · {k.adim.ad}</span>
          <span className="metin">💬 {k.yorum}</span>
        </div>
      ))}
      <label className="rt-alan rt-gb-deg">Haftalık değerlendirme
        <textarea className="rt-inp" rows={3} maxLength={1500} placeholder={`${kim} bu haftanın üstünde görür`} value={metin} onChange={(e) => { setMetin(e.target.value); setDurum(null); }} />
      </label>
      <div className="rt-satir">
        {durum && <span className={durum.startsWith('⚠') ? 'rt-hata' : 'rt-tamam'}>{durum}</span>}
        <button type="button" className="rt-btn primary" style={{ marginLeft: 'auto' }}
          disabled={!programId || hicGonderilmedi || metin.trim() === kayitli}
          onClick={async () => { try { await haftaNotuGonder(programId!, haftaBas, metin); setDurum(metin.trim() ? '✓ Gönderildi' : '✓ Kaldırıldı'); } catch (e) { setDurum('⚠ ' + (e as Error).message); } }}>
          {kayitli && !metin.trim() ? 'Kaldır' : kayitli ? 'Güncelle' : 'Gönder'}
        </button>
      </div>
      {(!programId || hicGonderilmedi) && <p className="rt-muted">Plan gönderilince değerlendirme yazabilirsin.</p>}
    </div>
  );
}

// ———————————————— Hedef seçici (4 ekim) ————————————————
// Gruplar: her danışmanlık alanı ayrı (Beslenme, Sınav…), Ailem, Programlarım. Kalabalıkta (30 öğrenci,
// 10 aile üyesi) arama kutusu ve "son seçilenler" çıkar; büyük gruplar kapalı başlar.

const kucuk = (x: string) => x.toLocaleLowerCase('tr');

function HedefSecici({ hedefler, adaylar, seciliId, kompakt, kuruluyor, onSec, onAday }: {
  hedefler: Hedef[]; adaylar: Aday[]; seciliId: string | null; kompakt: boolean; kuruluyor: string | null;
  onSec: (h: Hedef) => void; onAday: (a: Aday) => void;
}) {
  const [ara, setAra] = useState('');
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  const [sonlar, setSonlar] = useState<string[]>([]);
  useEffect(() => { setSonlar(sonlariOku()); }, []);
  type Oge = { id: string; ad: string; ic: string; grup: string; grupIc: string; hedef?: Hedef; aday?: Aday };
  const ogeler: Oge[] = [
    ...hedefler.map((x) => ({ id: x.id, ad: x.ad, ic: x.ic, grup: x.grup, grupIc: x.grupIc, hedef: x })),
    ...adaylar.map((a) => ({ id: a.id, ad: a.ad, ic: '👪', grup: 'Ailem', grupIc: '👪', aday: a })),
  ];
  const toplam = ogeler.length;
  const q = kucuk(ara.trim());
  const gorunen = q ? ogeler.filter((o) => kucuk(o.ad).includes(q)) : ogeler;
  const sira = (g: string) => (g === 'Programlarım' ? 2 : g === 'Ailem' ? 1 : 0);
  const gruplar = Array.from(new Set(ogeler.map((o) => o.grup))).sort((a, b) => sira(a) - sira(b) || a.localeCompare(b, 'tr'));
  const tikla = (o: Oge) => (o.hedef ? onSec(o.hedef) : o.aday && onAday(o.aday));
  const son = !q && !kompakt && toplam > 6 ? sonlar.map((id) => ogeler.find((o) => o.id === id)).filter((o): o is Oge => !!o).slice(0, 4) : [];
  const satir = (o: Oge) => (
    <button key={o.id} type="button" className={`rt-hedef-sat${o.id === seciliId || o.id === kuruluyor ? ' on' : ''}`} disabled={!!kuruluyor} onClick={() => tikla(o)}>
      <span className="ic">{o.ic}</span><span className="ad">{o.ad}</span>
      {!kompakt && <span className="chev">›</span>}
    </button>
  );
  return (
    <div className={`rt-hedef-secici${kompakt ? ' kompakt' : ''}`}>
      {!kompakt && <p className="rt-secici-baslik">Kimi planlıyorsun?</p>}
      {toplam > 8 && <input className="rt-inp rt-secici-ara" type="search" placeholder={kompakt ? 'Ara…' : `Ara (${toplam} kişi / program)`} value={ara} onChange={(e) => setAra(e.target.value)} />}
      {son.length > 1 && (
        <div className="rt-secici-son">
          <span className="rt-muted">Son seçilenler</span>
          <div className="rt-hedef-cipler">{son.map((o) => <button key={o.id} type="button" className={`rt-chip${o.id === seciliId ? ' on' : ''}`} onClick={() => tikla(o)}>{o.ic} {o.ad}</button>)}</div>
        </div>
      )}
      {gruplar.map((g) => {
        const grupOgeleri = gorunen.filter((o) => o.grup === g);
        if (!grupOgeleri.length) return null;
        const varsayilan = grupOgeleri.length <= 6 || grupOgeleri.some((o) => o.id === seciliId);
        const ac = q ? true : acik[g] ?? varsayilan;
        return (
          <div key={g} className="rt-secici-grup">
            <button type="button" className="rt-grup-ad" aria-expanded={ac} onClick={() => setAcik({ ...acik, [g]: !ac })}>
              <span>{grupOgeleri[0].grupIc} {g}</span><span className="say">{grupOgeleri.length} {ac ? '▾' : '▸'}</span>
            </button>
            {ac && grupOgeleri.map(satir)}
          </div>
        );
      })}
      {q && gorunen.length === 0 && <p className="rt-muted">“{ara}” bulunamadı.</p>}
    </div>
  );
}

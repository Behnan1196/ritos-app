'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ayOzeti, degerArttir, degerKaydet, yapildiZamani, gununKartlari, kartKaldir, kartTasi, listeIsaretle, siraDegistir, yapildiAyarla, type GunSatiri } from '@/lib/ajanda';
import { useCanli } from '@/lib/canli';
import {
  bugun, degerBloklari, gunFarki, tarihEkle, tarihEtiket, tarihParse, tarihStr,
  type Blok,
} from '@/lib/paket';
import { BlokGoster, Kap, Modal, OnayKutusu, degerMetni } from './ortak';
import { DenemeGir } from './Sinav';
import { sinavOzeti } from '@/lib/sinavGorev';
import { kartPaketi } from '@/lib/paylasim';
import { PaylasDugmesi } from './Sohbet';
import { KartEditor, SURE_ANAHTAR } from './KartEditor';
import { sayacAnahtari, sayacBaslat, sayacBitir, sayacDuraklat, sayacMetni, sayacSil, sesAc, useSayac, useTik } from '@/lib/sayac';
import { gorevler, type BDugum } from '@/lib/belge';
import { KlasorSecModal } from './Kutuphane';
import { ajandadanKaydet } from '@/lib/kutuphane';
import { DanisanAjandasi } from './DanisanAjanda';
import { useDanismanlik } from '@/lib/danismanlik';
import { db, type IliskiRow, type ProgramRow } from '@/lib/db';
import type { PlanHedef } from '@/lib/danisanAjanda';
import { disiplinAdi } from '@/lib/danismanlik';
import { useSeciliDanisan } from '@/lib/seciliDanisan';

// A1–A9 (ilk dilim). Ajanda yalnızca kart satırlarını bilir; kaynağın içini bilmez.
const GORUNUM_ANAH = 'ritos-ajanda-gorunum';
function gorunumOku(): 'gun' | 'hafta' {
  try { return localStorage.getItem(GORUNUM_ANAH) === 'hafta' ? 'hafta' : 'gun'; } catch { return 'gun'; }
}
/** Tarihin içinde olduğu haftanın pazartesisi. */
export function haftaBasi(t: string) {
  return tarihEkle(t, -((tarihParse(t).getDay() + 6) % 7));
}
function haftaEtiket(bas: string) {
  const a = tarihParse(bas), b = tarihParse(tarihEkle(bas, 6));
  const ay = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${ay(b)}` : `${a.getDate()} ${ay(a)} – ${b.getDate()} ${ay(b)}`;
}

export default function AjandaPane() {
  const [tarih, setTarih] = useState(bugun());
  const [gorunum, setGorunumS] = useState<'gun' | 'hafta'>('gun');
  useEffect(() => { setGorunumS(gorunumOku()); }, []);
  const setGorunum = (g: 'gun' | 'hafta') => { setGorunumS(g); try { localStorage.setItem(GORUNUM_ANAH, g); } catch { /* yok say */ } };
  const [ekle, setEkle] = useState<string | null>(null); // hangi güne kart eklenecek
  const [ayAcik, setAyAcik] = useState(false);
  const [detay, setDetay] = useState<{ satir: GunSatiri; tarih: string } | null>(null);
  const satirlar = useCanli(() => gununKartlari(tarih), [tarih], [] as GunSatiri[]);
  const t0 = bugun();
  const hafta = gorunum === 'hafta';
  const adim = hafta ? 7 : 1;
  const bugunGorunur = hafta ? haftaBasi(tarih) === haftaBasi(t0) : tarih === t0;
  // Koç: Ajanda'nın başında "kimin ajandası" seçimi (28 eylül). Danışan seçilince aynı gün/hafta
  // görünümünde o danışana atadığın kartlar ve durumları görünür.
  const dn = useDanismanlik();
  const danisanlar = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.durum === 'aktif' && i.koc === dn.uid), [dn.uid], [] as IliskiRow[]);
  // Seçim danışmanlık ekranıyla ortak ve oturum boyunca korunur (lib/seciliDanisan).
  const [kisi, setKisi] = useSeciliDanisan();
  // Kişisel programlar da odaklanabilir (28 eylül): "p:<id>" — yalnız o programın kartları, planlama araçlarıyla.
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], [] as ProgramRow[]);
  const secili = danisanlar.find((i) => i.id === kisi) ?? null;
  const seciliProgram = kisi.startsWith('p:') ? programlar.find((p) => p.id === kisi.slice(2)) ?? null : null;
  const hedef: PlanHedef | null = secili ? { tur: 'danisan', il: secili } : seciliProgram ? { tur: 'program', programId: seciliProgram.id } : null;
  const odakVar = (dn.profil?.koc && danisanlar.length > 0) || programlar.length > 0;

  return (
    <div className="rt-ajanda">
      {odakVar && (
        <div className={`rt-kisi-sec${hedef ? ' danisan' : ''}`}>
          <select value={hedef ? kisi : ''} onChange={(e) => setKisi(e.target.value)} aria-label="Ajanda odağı">
            <option value="">📅 Benim ajandam</option>
            {programlar.length > 0 && <optgroup label="Programlarım">
              {programlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((p) => <option key={p.id} value={`p:${p.id}`}>🌱 {p.ad}</option>)}
            </optgroup>}
            {dn.profil?.koc && danisanlar.length > 0 && <optgroup label="Danışanlarım">
              {danisanlar.map((i) => <option key={i.id} value={i.id}>🤝 {i.danisan_ad}</option>)}
            </optgroup>}
          </select>
        </div>
      )}
      <div className="rt-daterow">
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, -adim))} aria-label={hafta ? 'Önceki hafta' : 'Önceki gün'}>‹</button>
        <button className="rt-dlabel" onClick={() => setAyAcik(true)}>
          {hafta ? haftaEtiket(haftaBasi(tarih)) : tarihEtiket(tarih)}
          {!bugunGorunur && <span className="rt-totoday" onClick={(e) => { e.stopPropagation(); setTarih(t0); }}>↺ bugüne dön</span>}
        </button>
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, adim))} aria-label={hafta ? 'Sonraki hafta' : 'Sonraki gün'}>›</button>
        <div className="rt-gorunum" role="group" aria-label="Görünüm">
          <button type="button" className={!hafta ? 'on' : ''} onClick={() => setGorunum('gun')}>Gün</button>
          <button type="button" className={hafta ? 'on' : ''} onClick={() => setGorunum('hafta')}>Hafta</button>
        </div>
      </div>

      {hedef ? (
        <DanisanAjandasi
          h={hedef}
          baslik={secili
            ? <>🤝 <b>{secili.danisan_ad}</b> · {disiplinAdi(secili.disiplin)} — yalnız senin atadığın kartlar görünür.</>
            : <>🌱 <b>{seciliProgram!.ad}</b> — yalnız bu programın kartları. Burada kurduğun kartlar Benim ajandam&apos;a da düşer.</>}
          tarih={tarih} hafta={hafta} haftaBas={haftaBasi(tarih)} onGun={(t) => { setTarih(t); setGorunum('gun'); }} />
      ) : hafta ? (
        <HaftaGorunumu bas={haftaBasi(tarih)} onAc={(satir, t) => setDetay({ satir, tarih: t })} onEkle={setEkle} onGun={(t) => { setTarih(t); setGorunum('gun'); }} />
      ) : (
        <Kap
          baslik="Gün"
          eylemler={<button type="button" className="rt-ikon" onClick={() => setEkle(tarih)} aria-label="Kart ekle">＋</button>}
        >
          {satirlar.length === 0 && <p className="rt-muted">Bu gün için kart yok.</p>}
          <SiraliListe satirlar={satirlar} tarih={tarih} onAc={(s) => setDetay({ satir: s, tarih })} />
        </Kap>
      )}

      {ekle && <KartEditor tarih={ekle} onKapat={() => setEkle(null)} />}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
      {detay && <KartDetay satir={detay.satir} tarih={detay.tarih} onKapat={() => setDetay(null)} />}
    </div>
  );
}

// Haftalık görünüm (28 eylül — iPad/geniş ekran). Her gün kendi kabında; kaplar en az
// genişlik kuralıyla yan yana dizilir, sığmayanlar alt satıra kayar (CSS grid auto-fill).
function HaftaGorunumu({ bas, onAc, onEkle, onGun }: { bas: string; onAc: (s: GunSatiri, t: string) => void; onEkle: (t: string) => void; onGun: (t: string) => void }) {
  const gunler = Array.from({ length: 7 }, (_, i) => tarihEkle(bas, i));
  const veri = useCanli(() => Promise.all(gunler.map((t) => gununKartlari(t))), [bas], [] as GunSatiri[][]);
  const t0 = bugun();
  // Uzun basıp başka güne bırak (2 ekim): tek günlük, taşınabilir kartlarda. Tekrar eden kart
  // detaydaki "Başka güne taşı" ile taşınır (orada serinin nasıl kayacağı anlatılıyor).
  const gunRef = useRef(new Map<string, HTMLDivElement>());
  const [tasi, setTasi] = useState<{ id: string; ad: string; kaynak: string; hedef: string | null; x: number; y: number } | null>(null);
  const tasiRef = useRef(tasi);
  tasiRef.current = tasi;
  const bul = (id: string) => { for (let i = 0; i < 7; i++) { const s = (veri[i] ?? []).find((x) => x.kart.id === id); if (s) return { s, t: gunler[i] }; } return null; };
  const gunBul = (x: number, y: number) => { for (const [t, el] of Array.from(gunRef.current.entries())) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return t; } return null; };
  const uzun = useUzunBas({
    izin: (id) => { const b = bul(id); return !!b && b.s.kart.izinler.gun_degistir && b.s.kart.bitis === b.s.kart.baslangic; },
    onBasla: (id, x, y) => { const b = bul(id); if (b) setTasi({ id, ad: b.s.kart.ad, kaynak: b.t, hedef: b.t, x, y }); },
    onHareket: (x, y) => setTasi((o) => (o ? { ...o, x, y, hedef: gunBul(x, y) } : o)),
    onBirak: async () => {
      const o = tasiRef.current;
      setTasi(null);
      if (o?.hedef && o.hedef !== o.kaynak) await kartTasi(o.id, o.kaynak, o.hedef);
    },
  });
  return (
    <div className={`rt-hafta${tasi ? ' suruklu' : ''}`}>
      {gunler.map((t, i) => {
        const d = tarihParse(t);
        const liste = veri[i] ?? [];
        const yapilan = liste.filter((s) => s.kayit?.yapildi && s.kart.tip !== 'oku').length;
        const toplam = liste.filter((s) => s.kart.tip !== 'oku').length;
        return (
          <div key={t} ref={(el) => { if (el) gunRef.current.set(t, el); else gunRef.current.delete(t); }} className={`rt-hafta-gun${t === t0 ? ' bugun' : ''}${t < t0 ? ' gecmis' : ''}${tasi?.hedef === t ? ' hedef' : ''}`}>
            <div className="rt-hafta-hd">
              <button type="button" className="rt-hafta-ad" onClick={() => onGun(t)} title="Gün görünümünde aç">
                <b>{d.toLocaleDateString('tr-TR', { weekday: 'short' })}</b> {d.getDate()} <span className="ok">›</span>
              </button>
              {toplam > 0 && <span className={`rt-rozet${yapilan === toplam ? ' tam' : ''}`}>{yapilan}/{toplam}</span>}
              <button type="button" className="rt-ikon" onClick={() => onEkle(t)} aria-label={`${d.getDate()} için kart ekle`}>＋</button>
            </div>
            <div className="rt-liste">
              {liste.map((s) => (
                <div key={s.kart.id} className={`rt-uzun${tasi?.id === s.kart.id ? ' rt-suruklenen-kart' : ''}`} {...uzun(s.kart.id)}>
                  <KartSatiri satir={s} tarih={t} onAc={() => onAc(s, t)} />
                </div>
              ))}
              {liste.length === 0 && <p className="rt-muted rt-hafta-bos">—</p>}
            </div>
          </div>
        );
      })}
      {tasi && <div className="rt-hayalet" style={{ left: tasi.x, top: tasi.y }}>{tasi.ad}</div>}
    </div>
  );
}

// Uzun basıp sürükleme (2 ekim) — tutamak yerine: karta ~0,45 sn basılı tutunca kart kalkar
// (titreşim) ve sürüklenir. Süre dolmadan parmak kayarsa liste normal kaydırılır. Sürükleme
// bitince ardından gelen tıklama yutulur (kart açılmasın). Fare ile de basılı tutarak çalışır.
const ETKILESIM = '.rt-chk, .rt-oynat, .rt-sayac-k, .rt-adet-k, .rt-deger, input, textarea, select';
function useUzunBas(o: { izin: (id: string) => boolean; onBasla: (id: string, x: number, y: number) => void; onHareket: (x: number, y: number) => void; onBirak: (x: number, y: number) => void }) {
  const ref = useRef(o);
  ref.current = o;
  const st = useRef<{ id: string; x: number; y: number; t: ReturnType<typeof setTimeout>; aktif: boolean; sx: number; sy: number } | null>(null);
  const yut = useRef(false);
  useEffect(() => {
    const bitir = (x: number, y: number) => {
      const s = st.current;
      if (!s) return;
      clearTimeout(s.t);
      st.current = null;
      if (s.aktif) { yut.current = true; setTimeout(() => { yut.current = false; }, 400); ref.current.onBirak(x, y); }
    };
    const move = (e: PointerEvent) => {
      const s = st.current;
      if (!s) return;
      if (!s.aktif) { if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) { clearTimeout(s.t); st.current = null; } return; }
      s.sx = e.clientX; s.sy = e.clientY;
      ref.current.onHareket(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => bitir(e.clientX, e.clientY);
    const cancel = () => { const s = st.current; if (s) bitir(s.sx, s.sy); };
    const tm = (e: TouchEvent) => { if (st.current?.aktif) e.preventDefault(); };
    const click = (e: MouseEvent) => { if (yut.current) { e.stopPropagation(); e.preventDefault(); yut.current = false; } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', tm, { passive: false });
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', tm); window.removeEventListener('click', click, true);
    };
  }, []);
  return (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button > 0 || !ref.current.izin(id) || (e.target as HTMLElement).closest(ETKILESIM)) return;
      const x = e.clientX, y = e.clientY;
      const t = setTimeout(() => {
        const s = st.current;
        if (!s) return;
        s.aktif = true;
        try { navigator.vibrate?.(12); } catch { /* yok */ }
        ref.current.onBasla(id, s.sx, s.sy);
      }, 450);
      st.current = { id, x, y, t, aktif: false, sx: x, sy: y };
    },
    onContextMenu: (e: React.MouseEvent) => { if (st.current) e.preventDefault(); },
  });
}

// A7 — gün listesinde sıralama: uzun bas, sürükle, bırak; sıra kalıcı yazılır.
function SiraliListe({ satirlar, tarih, onAc }: { satirlar: GunSatiri[]; tarih: string; onAc: (s: GunSatiri) => void }) {
  const [yerel, setYerel] = useState<GunSatiri[] | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const yerelRef = useRef<GunSatiri[] | null>(null);
  const liste = yerel ?? satirlar;
  const bas = useUzunBas({
    izin: (id) => satirlar.length > 1 && !!satirlar.find((x) => x.kart.id === id)?.kart.izinler.sirala,
    onBasla: (id) => { yerelRef.current = satirlar; setYerel(satirlar); setSurukle(id); },
    onHareket: (_x, y) => {
      const l = [...(yerelRef.current ?? satirlar)];
      const i = l.findIndex((x) => x.kart.id === surukleRef.current);
      if (i < 0) return;
      const [k] = l.splice(i, 1);
      let hedef = l.length;
      for (let j = 0; j < l.length; j++) {
        const el = refs.current.get(l[j].kart.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { hedef = j; break; }
      }
      if (hedef === i) return;
      l.splice(hedef, 0, k);
      yerelRef.current = l;
      setYerel(l);
    },
    onBirak: async () => {
      const son = yerelRef.current;
      setSurukle(null);
      if (son) await siraDegistir(son.map((x) => x.kart.id));
      yerelRef.current = null;
      setYerel(null);
    },
  });
  const surukleRef = useRef<string | null>(null);
  surukleRef.current = surukle;

  return (
    <div className={`rt-liste${surukle ? ' suruklu' : ''}`}>
      {liste.map((s) => (
        <div key={s.kart.id} ref={(el) => { if (el) refs.current.set(s.kart.id, el); else refs.current.delete(s.kart.id); }} className={`rt-uzun${surukle === s.kart.id ? ' rt-suruklenen' : ''}`} {...bas(s.kart.id)}>
          <KartSatiri satir={s} tarih={tarih} onAc={() => onAc(s)} />
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
  const [sureOn, setSureOn] = useState<number | null>(null); // sayaçtan gelen süre (değer formuna)
  const sk = sayacAnahtari(kart.id, tarih);
  const sayac = useSayac(sk);
  const uzak = kart.geri_bildirim === 'uzak';
  // Yapılma saati + bekleme (2 ekim)
  const bekleSon = yapildi && kart.bekle && kayit?.zaman ? kayit.zaman + kart.bekle * 60000 : null;
  const bekliyor = !!bekleSon && Date.now() < bekleSon;
  useTik(bekliyor, 15000);
  const adetB = kart.tip === 'yap' ? kart.bloklar.find((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi' && b.bicim === 'adet') : undefined;
  const adetV = adetB ? Number((kayit?.degerler ?? {})[adetB.anahtar]) || 0 : 0;
  const meta = [yapildi && kayit?.zaman ? `✓ ${saatMetni(kayit.zaman)}` : '', kart.saatler.join(' · ') + (kart.hatirlatma ? ' 🔔' : ''), bagli && kart.kaynak_etiket ? `${uzak ? '🤝' : '🌱'} ${kart.kaynak_etiket}` : ''].filter(Boolean).join(' · ');
  const yeniGuncel = !!kart.isaret && Date.now() - kart.isaret < 3 * 86400000;
  // A9 — değer düzeltme süresi (koçun izni): süre geçtiyse yapılmış kart değiştirilemez.
  const kilitli = !!kayit?.yapildi && kart.izinler.duzeltme_gun !== null && gunFarki(tarih, bugun()) > kart.izinler.duzeltme_gun;
  // Tek kart + ekler (28 eylül): yapılacak kartına kayıt eki takılıysa işaretlerken değer sorulur,
  // zamanlayıcı takılıysa ▶ ile başlatılır; video sayısı satırda rozet olarak görünür.
  const kayitBl = kart.tip === 'yap' ? degerBloklari(kart.bloklar) : [];
  const zamanli = kart.tip === 'yap' && kart.bloklar.some((b) => b.tur === 'zamanlayici' || (b.tur === 'sayi' && b.anahtar === SURE_ANAHTAR));
  const videoSay = kart.bloklar.filter((b) => b.tur === 'video').length;
  const belge = kart.bloklar.find((b): b is Extract<Blok, { tur: 'belge' }> => b.tur === 'belge');
  const gorevSay = belge ? gorevler(belge.belge as BDugum).length : 0;
  const isaretli = ((kayit?.degerler as { liste?: number[] } | null)?.liste ?? []).length;
  const ekMeta = [videoSay ? `🎬 ${videoSay}` : '', gorevSay ? `☑ ${isaretli}/${gorevSay}` : ''].filter(Boolean).join(' ');
  function isaretle() {
    if (yapildi) { yapildiAyarla(kart.id, tarih, false); setDegerAcik(false); return; }
    if (sayac) { sayacBitti(); return; }
    if (kart.bekle) sesAc(); // bekleme dolunca bip için ses bağlamı bu dokunuşla açılır
    if (kayitBl.length) setDegerAcik((v) => !v);
    else yapildiAyarla(kart.id, tarih, true);
  }
  // Sayacı bitir: ölçü de soruluyorsa süre forma dolar; yoksa doğrudan kaydedilir.
  async function sayacBitti() {
    const dk = sayacBitir(sk);
    if (kayitBl.some((b) => b.anahtar !== SURE_ANAHTAR)) { setSureOn(dk); setDegerAcik(true); return; }
    await degerKaydet(kart.id, tarih, { ...(kayit?.degerler ?? {}), [SURE_ANAHTAR]: dk });
  }

  return (
    <div className={`rt-kart${bagli ? ' bagli' : ''}${yapildi ? ' yapildi' : ''}`}>
      <div className="rt-kart-ust">
        {kart.tip === 'oku' ? (
          <span className="rt-tipik" title="Oku">📖</span>
        ) : kart.tip === 'uygula' ? (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} disabled={kilitli} title={kilitli ? 'Düzeltme süresi geçti' : undefined} onClick={() => setUygulaAcik(true)} aria-label="Başlat">{yapildi ? '✓' : '▶'}</button>
        ) : kart.tip === 'kaydet' ? (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} disabled={kilitli} title={kilitli ? 'Düzeltme süresi geçti' : undefined} onClick={() => setDegerAcik((v) => !v)} aria-label="Değer gir">{yapildi ? '✓' : '✎'}</button>
        ) : (
          <button type="button" className={`rt-chk${yapildi ? ' on' : ''}`} disabled={kilitli} title={kilitli ? 'Düzeltme süresi geçti' : undefined} onClick={isaretle} aria-label="Yapıldı">{yapildi ? '✓' : ''}</button>
        )}
        <button type="button" className="rt-kart-ad" onClick={kart.izinler.ac ? onAc : undefined}>
          <span className="t">{kart.ad}{yeniGuncel && <span className="rt-rozet guncel">güncellendi</span>}</span>
          {(meta || ekMeta) && <span className="m">{[meta, ekMeta].filter(Boolean).join(' · ')}</span>}
          {(kart.tip === 'kaydet' || kart.tip === 'uygula' || (kart.tip === 'yap' && yapildi)) && kayit?.degerler && degerMetni(kayit.degerler, kart.bloklar) && <span className="m">✓ {(kart.ek && sinavOzeti(kart.ek, kayit.degerler)) || degerMetni(kayit.degerler, kart.bloklar)}</span>}
        </button>
        {zamanli && !yapildi && !kilitli && !sayac && <button type="button" className="rt-oynat" onClick={() => sayacBaslat(sk, hedefDakika(kart.bloklar))} aria-label="Sayacı başlat">▶</button>}
        {sayac && !yapildi && <SayacKontrol sayac={sayac} sk={sk} onBitir={sayacBitti} />}
        {adetB && !kilitli && (
          <span className="rt-adet-k" onClick={(e) => e.stopPropagation()}>
            <span className={adetB.hedef && adetV >= adetB.hedef ? 'tam' : ''}>{adetV}{adetB.hedef ? `/${adetB.hedef}` : ''}</span>
            <button type="button" aria-label={`${adetB.etiket} ekle`} onClick={() => { void degerArttir(kart.id, tarih, adetB.anahtar, 1, adetB.hedef); }}>＋</button>
          </span>
        )}
        {bekliyor && <span className="rt-bekle" title="Yaptıktan sonra bekleme">⏳ {saatMetni(bekleSon!)}{"'a kadar"}</span>}
        {tutamac}
      </div>
      {uygulaAcik && <Uygula satir={satir} tarih={tarih} onKapat={() => setUygulaAcik(false)} />}
      {degerAcik && kart.tip === 'kaydet' && kart.ek?.tur === 'deneme' && kart.ek.deneme && (
        <DenemeGir ek={kart.ek} ilk={kayit?.degerler ?? null} onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDegerAcik(false); }} />
      )}
      {degerAcik && kart.tip === 'kaydet' && kart.ek?.tur !== 'deneme' && (
        <DegerGir bloklar={kart.bloklar} ilk={kayit?.degerler ?? null} onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDegerAcik(false); }} />
      )}
      {degerAcik && kart.tip === 'yap' && !yapildi && (
        <DegerGir
          bloklar={kart.bloklar}
          ilk={sureOn !== null ? { ...(kayit?.degerler ?? {}), [SURE_ANAHTAR]: sureOn } : kayit?.degerler ?? null}
          onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDegerAcik(false); }}
          onSadeceIsaretle={async () => { await yapildiAyarla(kart.id, tarih, true); setDegerAcik(false); }}
        />
      )}
    </div>
  );
}

function DegerGir({ bloklar, ilk, onKaydet, onSadeceIsaretle }: { bloklar: Blok[]; ilk: Record<string, unknown> | null; onKaydet: (d: Record<string, unknown>) => void; onSadeceIsaretle?: () => void }) {
  const alanlar = degerBloklari(bloklar);
  const [d, setD] = useState<Record<string, string>>(() => Object.fromEntries(alanlar.map((a) => [a.anahtar, String(ilk?.[a.anahtar] ?? '')])));
  return (
    <div className="rt-deger">
      {alanlar.map((a) => (
        <label key={a.anahtar} className="rt-alan">
          <span>{a.etiket}{a.tur === 'sayi' && a.birim && a.bicim !== 'olcek' ? ` (${a.birim})` : ''}</span>
          {a.tur === 'secenek' ? (
            <select value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })}>
              <option value="">—</option>
              {a.secenekler.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : a.tur === 'sayi' && a.bicim === 'olcek' ? (
            <OlcekSec deger={d[a.anahtar]} ruh={/ruh|mood/i.test(a.anahtar + a.etiket)} onSec={(v) => setD({ ...d, [a.anahtar]: v })} />
          ) : a.tur === 'sayi' && a.bicim === 'adet' ? (
            <span className="rt-adim-k">
              <button type="button" aria-label="Azalt" onClick={(e) => { e.preventDefault(); setD({ ...d, [a.anahtar]: String(Math.max(0, (Number(d[a.anahtar]) || 0) - 1)) }); }}>−</button>
              <input inputMode="numeric" value={d[a.anahtar] || '0'} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value.replace(/\D/g, '') })} />
              <span className="birim">{a.hedef ? `/ ${a.hedef}` : ''}</span>
              <button type="button" aria-label="Artır" onClick={(e) => { e.preventDefault(); setD({ ...d, [a.anahtar]: String((Number(d[a.anahtar]) || 0) + 1) }); }}>+</button>
            </span>
          ) : (
            <input className="rt-inp" inputMode={a.tur === 'sayi' ? 'decimal' : 'text'} value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="rt-satir">
        {onSadeceIsaretle && <button type="button" className="rt-btn" onClick={onSadeceIsaretle}>Değer girmeden işaretle</button>}
        <button type="button" className="rt-btn primary" onClick={() => onKaydet(Object.fromEntries(alanlar.map((a) => [a.anahtar, a.tur === 'sayi' && d[a.anahtar] !== '' ? Number(d[a.anahtar].replace(',', '.')) : d[a.anahtar]])))}>Kaydet</button>
      </div>
    </div>
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
  const [duzenle, setDuzenle] = useState(false);
  const [kutKaydet, setKutKaydet] = useState(false);
  const [uygula, setUygula] = useState(false);
  const [detaySure, setDetaySure] = useState<number | null>(null);
  const [menuAcik, setMenuAcik] = useState(false);
  const [degerAc, setDegerAc] = useState(false);
  const dsk = sayacAnahtari(kart.id, tarih);
  const dSayac = useSayac(dsk);
  // Checklist işaretleri o günün kaydında; detay açıkken canlı izlenir.
  const kayitCanli = useCanli(() => db.ajanda_kayit.get(`${kart.id}|${tarih}`), [kart.id, tarih], satir.kayit ?? undefined);
  const kilitliDetay = !!kayitCanli?.yapildi && kart.izinler.duzeltme_gun !== null && gunFarki(tarih, bugun()) > kart.izinler.duzeltme_gun;
  // Kütüphaneye yalnız kendi (ya da kendi programının) kartı kaydedilir; koçun kartı danışanın olmaz.
  const kaydedilir = kart.geri_bildirim !== 'uzak';
  // Kendi kartı (Ajanda'dan eklenen, bağımsız) her zaman düzenlenebilir.
  const duzenlenir = !bagli && kart.kaynak_modul === 'ajanda' && kart.izinler.duzenle && (kart.tip === 'yap' || kart.tip === 'oku');

  if (duzenle) return <KartEditor tarih={tarih} kart={kart} onKapat={onKapat} />;
  // Kayıt bloğunun kart içindeki yeri: süre varsa ⏱ Başlat, ölçüler varsa bitince sorulacaklar.
  const hedefDk = hedefDakika(kart.bloklar);
  const sureli = kart.bloklar.some((b) => b.tur === 'zamanlayici' || (b.tur === 'sayi' && b.anahtar === SURE_ANAHTAR));
  const olcular = kart.bloklar.filter((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi' && b.anahtar !== SURE_ANAHTAR);
  const baslatilir = sureli && !kayitCanli?.yapildi && !kilitliDetay && kart.izinler.ac;
  const adetler = olcular.filter((o) => o.bicim === 'adet');
  const kayitAlani = baslatilir || dSayac || olcular.length ? (
    <div className="rt-kayit-kutu">
      {baslatilir && !dSayac && detaySure === null && <button type="button" className="rt-btn primary" onClick={() => sayacBaslat(dsk, hedefDk)}>⏱ Başlat{hedefDk > 0 ? ` · ${hedefDk} dk` : ''}</button>}
      {dSayac && <SayacKontrol sayac={dSayac} sk={dsk} buyuk onBitir={async () => {
        const dk = sayacBitir(dsk);
        if (olcular.length) setDetaySure(dk);
        else await degerKaydet(kart.id, tarih, { ...(kayitCanli?.degerler ?? {}), [SURE_ANAHTAR]: dk });
      }} />}
      {detaySure !== null && (
        <DegerGir bloklar={kart.bloklar} ilk={{ ...(kayitCanli?.degerler ?? {}), [SURE_ANAHTAR]: detaySure }}
          onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDetaySure(null); }} />
      )}
      {adetler.map((o) => {
        const v = Number((kayitCanli?.degerler ?? {})[o.anahtar]) || 0;
        return (
          <div key={o.anahtar} className="rt-satir rt-adim-satir"><span>{o.etiket}</span>
            <span className="rt-adim-k">
              <button type="button" aria-label="Azalt" disabled={kilitliDetay} onClick={() => degerArttir(kart.id, tarih, o.anahtar, -1, o.hedef)}>−</button>
              <input readOnly value={v} aria-label={o.etiket} />
              <span className="birim">{o.hedef ? `/ ${o.hedef} ` : ''}{o.birim}</span>
              <button type="button" aria-label="Artır" disabled={kilitliDetay} onClick={() => degerArttir(kart.id, tarih, o.anahtar, 1, o.hedef)}>+</button>
            </span>
          </div>
        );
      })}
      {olcular.some((o) => o.bicim !== 'adet') && detaySure === null && <p className="rt-muted">📏 İşaretlerken sorulur: {olcular.filter((o) => o.bicim !== 'adet').map((o) => o.etiket + (o.birim && o.bicim !== 'olcek' ? ` (${o.birim})` : '')).join(', ')}</p>}
    </div>
  ) : null;

  // Ana düğme: yapılmamış "yap" kartında ✓ Yapıldı (değer soruluyorsa form). Sayaç çalışırken sayaç kendi düğmesiyle biter.
  const anaDugme = kart.tip === 'yap' && !kayitCanli?.yapildi && !kilitliDetay && !dSayac && detaySure === null;
  // ⋯ menüsü: Düzenle dışındaki işler (taşı, kütüphane, paylaş, kaldır).
  const tasinir = kart.izinler.gun_degistir && (!bagli || kart.geri_bildirim === 'uzak');
  const silinir = !bagli && kart.izinler.sil;
  const paylasilir = !bagli;
  const menuVar = tasinir || silinir || paylasilir || kaydedilir;
  const ust = (
    <span className="rt-detay-ust">
      {duzenlenir && <button type="button" className="rt-x" onClick={() => setDuzenle(true)} aria-label="Düzenle" title="Düzenle">✎</button>}
      {menuVar && <button type="button" className="rt-x" onClick={() => setMenuAcik(!menuAcik)} aria-label="Diğer işlemler" title="Diğer işlemler">⋯</button>}
      {menuAcik && (
        <span className="rt-pop rt-detay-pop" onClick={(e) => e.stopPropagation()}>
          {tasinir && <button type="button" onClick={() => { setMenuAcik(false); setTasiAcik(true); }}>📅 Başka güne taşı</button>}
          {kaydedilir && <button type="button" onClick={() => { setMenuAcik(false); setKutKaydet(true); }}>📚 Kütüphaneye kaydet</button>}
          {paylasilir && <PaylasDugmesi paketUret={() => kartPaketi(kart)} />}
          {silinir && <button type="button" className="tehlike" onClick={() => { setMenuAcik(false); if (tekrarli) setSilAcik(true); else setTekSil(true); }}>🗑 Kaldır</button>}
        </span>
      )}
    </span>
  );

  if (uygula) return <Uygula satir={satir} tarih={tarih} onKapat={onKapat} />;
  if (kutKaydet) return <KlasorSecModal baslik="📚 Kütüphaneye kaydet" onKapat={onKapat} onSec={async (kl) => { await ajandadanKaydet(kart, kl); }} />;

  return (
    <Modal baslik={kart.ad} onKapat={onKapat} ust={ust}>
      {kayitCanli?.yapildi && kayitCanli.zaman && <YapildiSaati zaman={kayitCanli.zaman} kilitli={kilitliDetay} bekle={kart.bekle ?? null} onDegis={(z) => yapildiZamani(kart.id, tarih, z)} />}
      <BlokGoster
        bloklar={kart.bloklar}
        kayit={kart.tip === 'yap' ? kayitAlani : undefined}
        belgeIsaret={kart.tip === 'yap' ? {
          isaretler: (kayitCanli?.degerler as { liste?: number[] } | null)?.liste ?? [],
          onIsaret: kilitliDetay ? undefined : (sira, acik, belge) => listeIsaretle(kart.id, tarih, sira, acik, gorevler(belge as BDugum).length),
        } : undefined}
      />
      {bagli && (kart.geri_bildirim === 'uzak'
        ? <p className="rt-muted">🤝 Koçunun kartı · <b>{kart.kaynak_etiket}</b>. İşaretin ve girdiğin değerler yalnız koçuna gider.</p>
        : <p className="rt-muted">Bu kart <b>{kart.kaynak_etiket}</b> programından geliyor; içeriği ve günü programdan yönetilir.</p>)}

      {degerAc && (
        <DegerGir bloklar={kart.bloklar} ilk={kayitCanli?.degerler ?? null}
          onKaydet={async (d) => { await degerKaydet(kart.id, tarih, d); setDegerAc(false); }}
          onSadeceIsaretle={async () => { await yapildiAyarla(kart.id, tarih, true); setDegerAc(false); }} />
      )}
      {anaDugme && !degerAc && !tasiAcik && !silAcik && !tekSil && (
        <button type="button" className="rt-btn primary rt-ana" onClick={async () => {
          if (kart.bekle) sesAc();
          if (olcular.some((o) => o.bicim !== 'adet')) setDegerAc(true);
          else await yapildiAyarla(kart.id, tarih, true);
        }}>✓ Yapıldı</button>
      )}
      {tekSil && <OnayKutusu metin="Kart silinsin mi?" evet="Sil" onVazgec={() => setTekSil(false)} onEvet={() => kartKaldir(kart.id, tarih, 'tamamen').then(onKapat)} />}
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
          <span className="rt-muted">Tekrar eden kart:</span>
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


// Uygula — rehberli pratik (program kartları). Sayaç ortak depoda: pencere kapansa da sürer,
// satırda görünmeye devam eder.
function Uygula({ satir, tarih, onKapat }: { satir: GunSatiri; tarih: string; onKapat: () => void }) {
  const { kart } = satir;
  const sk = sayacAnahtari(kart.id, tarih);
  const sayac = useSayac(sk);
  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar} kayit={null} />
      {sayac ? (
        <SayacKontrol sayac={sayac} sk={sk} buyuk onBitir={async () => { const dk = sayacBitir(sk); await degerKaydet(kart.id, tarih, { ...(satir.kayit?.degerler ?? {}), sure_dk: dk }); onKapat(); }} />
      ) : (
        <button type="button" className="rt-btn primary" onClick={() => sayacBaslat(sk, hedefDakika(kart.bloklar))}>⏱ Başlat</button>
      )}
    </Modal>
  );
}

function hedefDakika(bloklar: Blok[]): number {
  return bloklar.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici')?.dakika ?? 0;
}

// Çalışan/duraklatılmış sayaç: süre + ⏸/▶ + ⏹ (bitir ve kaydet). Satırda küçük, detayda büyük.
function SayacKontrol({ sayac, sk, onBitir, buyuk }: { sayac: NonNullable<ReturnType<typeof useSayac>>; sk: string; onBitir: () => void; buyuk?: boolean }) {
  const [vazgec, setVazgec] = useState(false);
  return (
    <div className={`rt-sayac-k${buyuk ? ' buyuk' : ''}${sayac.bas ? ' akiyor' : ''}${sayac.doldu ? ' doldu' : ''}`} onClick={(e) => e.stopPropagation()}>
      <span className="sure">{sayac.doldu ? '✓ ' : '⏱ '}{sayacMetni(sayac)}</span>
      {!sayac.doldu && (sayac.bas
        ? <button type="button" onClick={() => sayacDuraklat(sk)} aria-label="Duraklat">⏸</button>
        : <button type="button" onClick={() => sayacBaslat(sk, 0)} aria-label="Devam">▶</button>)}
      <button type="button" className="bitir" onClick={onBitir} aria-label="Bitir ve kaydet">⏹{buyuk ? ' Bitir' : ''}</button>
      {buyuk && (vazgec
        ? <button type="button" className="sil" onClick={() => sayacSil(sk)}>Sıfırla?</button>
        : <button type="button" className="sil" onClick={() => setVazgec(true)} aria-label="Sayacı sıfırla">↺</button>)}
    </div>
  );
}

const saatMetni = (t: number) => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// Yapılma saati (2 ekim): otomatik kaydedilir; dokununca −5/−15/−30 dk ya da elle düzeltilir.
function YapildiSaati({ zaman, kilitli, bekle, onDegis }: { zaman: number; kilitli: boolean; bekle: number | null; onDegis: (z: number) => void }) {
  const [acik, setAcik] = useState(false);
  useTik(!!bekle, 15000);
  const son = bekle ? zaman + bekle * 60000 : null;
  const kalan = son ? Math.ceil((son - Date.now()) / 60000) : 0;
  return (
    <div className="rt-yapildi-saat">
      <button type="button" className="rt-chip" disabled={kilitli} onClick={() => setAcik(!acik)}>✓ Yapıldı · {saatMetni(zaman)} ✎</button>
      {son && (kalan > 0 ? <span className="rt-bekle">⏳ {saatMetni(son)}{"'a kadar"} · {kalan} dk</span> : <span className="rt-muted">⏳ Bekleme bitti</span>)}
      {acik && (
        <div className="rt-chips">
          {[5, 15, 30].map((d) => <button key={d} type="button" className="rt-chip" onClick={() => onDegis(zaman - d * 60000)}>−{d} dk</button>)}
          <input className="rt-inp rt-orta" type="time" aria-label="Yapıldığı saat" value={saatMetni(zaman)} onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) { const d = new Date(zaman); d.setHours(h, m, 0, 0); onDegis(d.getTime()); }
          }} />
          <button type="button" className="rt-chip on" onClick={() => setAcik(false)}>Tamam</button>
        </div>
      )}
    </div>
  );
}

// 1–5 ölçek; ruh halinde yüzler.
function OlcekSec({ deger, ruh, onSec }: { deger: string; ruh: boolean; onSec: (v: string) => void }) {
  const yuz = ['😞', '🙁', '😐', '🙂', '😄'];
  return (
    <span className="rt-olcek">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={deger === String(n) ? 'on' : ''} onClick={(e) => { e.preventDefault(); onSec(String(n)); }} aria-label={String(n)}>{ruh ? yuz[n - 1] : n}</button>
      ))}
    </span>
  );
}

'use client';

// ————————————————————————————————————————————————————————————————
// Tek kart + ekler (28 eylül). Ajanda'da kullanıcı tip seçmez: her kart bir yapılacaktır
// ve işaretlenir. İhtiyaca göre ekler takılır — Açıklama, Video/bağlantı, Tekrar, Saat;
// "Daha fazla" altında Süre kaydı, Değer kaydı, Zamanlayıcı. Rite'taki Aktivite kartının
// kararları korunur (tek kart, tekrar süreyle, randevu = saatli kart); kayıt ekleri yenidir.
// Aynı editör hem ekleme hem düzenleme için kullanılır.
// ————————————————————————————————————————————————————————————————

import React, { useState } from 'react';
import { teslimAl, kartGuncelle } from '@/lib/ajanda';
import { GUN_KISA, PAKET_SURUM, TAM_IZIN, gunFarki, tarihEkle, type Blok, type KartPaketi } from '@/lib/paket';
import type { AjandaKartRow } from '@/lib/db';
import { Modal } from './ortak';
import { GorevFormu, gorevTeslim, useSinavOzeti } from './Sinav';
import type { GorevTaslak } from '@/lib/sinavGorev';
import { V2 } from '@/lib/surum';

type Ek = 'aciklama' | 'video' | 'tekrar' | 'saat' | 'sure' | 'deger' | 'zamanlayici';
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

export function KartEditor({ tarih, kart, onKapat }: { tarih: string; kart?: AjandaKartRow; onKapat: () => void }) {
  // V1: sınav görevleri yalnız koçun planında; kişinin kendi Ajanda'sında yok (V2'de açılır).
  const sinavKurulu = V2 && !kart && useSinavOzeti().kurulu; // eslint-disable-line react-hooks/rules-of-hooks
  const [sinav, setSinav] = useState(false);
  const [gorev, setGorev] = useState<GorevTaslak | null>(null);

  const b0 = kart?.bloklar ?? [];
  const sayilar = b0.filter((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi');
  const surB = sayilar.find((b) => b.anahtar === SURE_ANAHTAR);
  const degB = sayilar.find((b) => b.anahtar !== SURE_ANAHTAR);
  const zamB = b0.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  const tekrarli0 = !!kart && kart.bitis !== kart.baslangic;
  const sure0 = kart && tekrarli0 && kart.bitis ? String(gunFarki(kart.baslangic, kart.bitis) + 1) : kart && tekrarli0 ? '' : '21';

  const [ad, setAd] = useState(kart?.ad ?? '');
  const [aciklama, setAciklama] = useState(b0.filter((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin').map((b) => b.metin).join('\n\n'));
  const [videolar, setVideolar] = useState<VideoSatir[]>(
    b0.filter((b): b is Extract<Blok, { tur: 'video' | 'baglanti' }> => b.tur === 'video' || b.tur === 'baglanti')
      .map((b) => ({ url: b.url, baslik: b.baslik ?? '', bas: b.tur === 'video' ? snMetin(b.bas) : '', bit: b.tur === 'video' ? snMetin(b.bit) : '' })),
  );
  const [tekrar, setTekrar] = useState(tekrarli0);
  const [gunler, setGunler] = useState<number[]>(kart?.gunler ?? []);
  const [sure, setSure] = useState(sure0);
  const [saat, setSaat] = useState(kart?.saatler[0] ?? '');
  const [sureKaydi, setSureKaydi] = useState(!!surB || !!zamB);
  const [degerEtiket, setDegerEtiket] = useState(degB?.etiket ?? '');
  const [degerBirim, setDegerBirim] = useState(degB?.birim ?? '');
  const [zamanDk, setZamanDk] = useState(zamB ? (zamB.dakika > 0 ? String(zamB.dakika) : '') : '');
  const [zamanlayici, setZamanlayici] = useState(!!zamB);
  const [degerKaydi, setDegerKaydi] = useState(!!degB);

  // Hangi ek bölümleri açık: doluysa açık gelir, yoksa çipe dokununca açılır.
  const [acik, setAcik] = useState<Set<Ek>>(() => {
    const s = new Set<Ek>();
    if (aciklama) s.add('aciklama');
    if (videolar.length) s.add('video');
    if (tekrarli0) s.add('tekrar');
    if (kart?.saatler.length) s.add('saat');
    if (surB || zamB) s.add('sure');
    if (degB) s.add('deger');
    if (zamB) s.add('zamanlayici');
    return s;
  });
  const [dahaFazla, setDahaFazla] = useState(!!(surB || degB || zamB));
  const ac = (e: Ek) => {
    setAcik((s) => new Set(s).add(e));
    if (e === 'tekrar') setTekrar(true);
    if (e === 'video' && !videolar.length) setVideolar([{ url: '', baslik: '', bas: '', bit: '' }]);
    if (e === 'sure') setSureKaydi(true);
    if (e === 'deger') setDegerKaydi(true);
    if (e === 'zamanlayici') { setZamanlayici(true); setSureKaydi(true); setAcik((s) => new Set(s).add('sure')); }
  };
  const kapat = (e: Ek) => {
    setAcik((s) => { const n = new Set(s); n.delete(e); return n; });
    if (e === 'aciklama') setAciklama('');
    if (e === 'video') setVideolar([]);
    if (e === 'tekrar') { setTekrar(false); setGunler([]); }
    if (e === 'saat') setSaat('');
    if (e === 'sure') { setSureKaydi(false); setZamanlayici(false); setAcik((s) => { const n = new Set(s); n.delete('zamanlayici'); return n; }); }
    if (e === 'deger') { setDegerKaydi(false); setDegerEtiket(''); setDegerBirim(''); }
    if (e === 'zamanlayici') setZamanlayici(false);
  };

  function bloklarUret(): Blok[] {
    const b: Blok[] = [];
    if (aciklama.trim()) b.push({ tur: 'metin', metin: aciklama.trim() });
    for (const v of videolar) {
      const url = v.url.trim();
      if (!url) continue;
      if (videoMu(url)) b.push({ tur: 'video', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}), ...(sn(v.bas) !== undefined ? { bas: sn(v.bas) } : {}), ...(sn(v.bit) !== undefined ? { bit: sn(v.bit) } : {}) });
      else b.push({ tur: 'baglanti', url, ...(v.baslik.trim() ? { baslik: v.baslik.trim() } : {}) });
    }
    if (sureKaydi) b.push({ tur: 'sayi', anahtar: SURE_ANAHTAR, etiket: 'Kaç dakika?', birim: 'dk' });
    if (degerKaydi && degerEtiket.trim()) b.push({ tur: 'sayi', anahtar: 'deger', etiket: degerEtiket.trim(), ...(degerBirim.trim() ? { birim: degerBirim.trim() } : {}) });
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
    <Modal baslik={kart ? 'Kartı düzenle' : 'Kart ekle'} onKapat={onKapat}>
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
        <textarea className="rt-inp" rows={3} value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Notun, adımlar…" />
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

      {bolum('tekrar', '🔁 Tekrar', (
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

      {bolum('saat', '🕐 Saat', (
        <input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} />
      ))}

      {!sinav && bolum('sure', '⏱ Süre kaydı', (
        <p className="rt-muted">İşaretlerken "Kaç dakika?" diye sorulur{zamanlayici ? '; zamanlayıcıyla yaparsan kendiliğinden yazılır' : ''}.</p>
      ))}

      {!sinav && bolum('zamanlayici', '⏲ Zamanlayıcı', (
        <input className="rt-inp" inputMode="numeric" placeholder="Dakika — boş bırakırsan serbest süre" value={zamanDk} onChange={(e) => setZamanDk(e.target.value.replace(/\D/g, ''))} />
      ))}

      {!sinav && bolum('deger', '🔢 Değer kaydı', (
        <div className="rt-satir">
          <input className="rt-inp" placeholder="Ne kaydedilecek (örn. Uyku)" value={degerEtiket} onChange={(e) => setDegerEtiket(e.target.value)} />
          <input className="rt-inp rt-kisa" placeholder="Birim" value={degerBirim} onChange={(e) => setDegerBirim(e.target.value)} />
        </div>
      ))}

      <div className="rt-chips rt-ek-cipler">
        {!sinav && cip('aciklama', '📝 Açıklama')}
        {!sinav && cip('video', '🎬 Video')}
        {cip('tekrar', '🔁 Tekrar')}
        {cip('saat', '🕐 Saat')}
        {!sinav && !dahaFazla && <button type="button" className="rt-chip rt-ek-cip" onClick={() => setDahaFazla(true)}>＋ Daha fazla</button>}
        {!sinav && dahaFazla && cip('sure', '⏱ Süre kaydı')}
        {!sinav && dahaFazla && cip('zamanlayici', '⏲ Zamanlayıcı')}
        {!sinav && dahaFazla && cip('deger', '🔢 Değer kaydı')}
      </div>

      <button type="button" className="rt-btn primary" disabled={sinav ? !gorev : !ad.trim() || (degerKaydi && !degerEtiket.trim())} onClick={kaydet}>{kart ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

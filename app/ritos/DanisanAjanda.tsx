'use client';

// Koçun danışan Ajanda'sı (28 eylül). AjandaPane'in tarih/görünüm başlığını paylaşır;
// yalnız içerik (kartların kaynağı ve eylemler) farklıdır. Danışanın kendi kartları görünmez.

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { danisanGunleri, kocKartEkle, kocKartGuncelle, kocKartSil, kocKartTasi, type KocKarti } from '@/lib/danisanAjanda';
import { disiplinAdi } from '@/lib/danismanlik';
import { OLC_ONEK, olcuBlok, olcuBloklari, olculer } from '@/lib/olcum';
import { bugun, tarihEkle, tarihParse, type Blok } from '@/lib/paket';
import type { IliskiRow, OlcuTanimRow } from '@/lib/db';
import { BlokGoster, Kap, Modal, OnayKutusu, degerMetni } from './ortak';

const olcumKarti = (b: Blok[]) => olcuBloklari(b).length > 0;

export function DanisanAjandasi({ il, tarih, hafta, haftaBas, onGun }: { il: IliskiRow; tarih: string; hafta: boolean; haftaBas: string; onGun: (t: string) => void }) {
  const gunler = hafta ? Array.from({ length: 7 }, (_, i) => tarihEkle(haftaBas, i)) : [tarih];
  const veri = useCanli(() => danisanGunleri(il.id, gunler), [il.id, gunler[0], gunler.length], {} as Record<string, KocKarti[]>);
  const [ekle, setEkle] = useState<string | null>(null);
  const [detay, setDetay] = useState<KocKarti | null>(null);
  const [surukle, setSurukle] = useState<KocKarti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const t0 = bugun();

  // Haftalık görünümde kartı başka güne sürükle (fare + dokunmatik): bırakılan yerin günü alınır.
  useEffect(() => {
    if (!surukle) return;
    async function onUp(e: PointerEvent) {
      const k = surukle!;
      setSurukle(null);
      const hedef = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-tarih]')?.dataset.tarih;
      if (hedef && hedef !== k.tarih) { try { await kocKartTasi(k, hedef); } catch (x) { setHata((x as Error).message); } }
    }
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointerup', onUp);
  }, [surukle]);

  const gunKutusu = (t: string) => {
    const liste = veri[t] ?? [];
    const yapilan = liste.filter((k) => k.yapildi).length;
    const d = tarihParse(t);
    return (
      <div key={t} data-tarih={t} className={`rt-hafta-gun${t === t0 ? ' bugun' : ''}${t < t0 ? ' gecmis' : ''}${surukle && t >= t0 ? ' hedef' : ''}`}>
        <div className="rt-hafta-hd">
          <button type="button" className="rt-hafta-ad" onClick={() => onGun(t)}><b>{d.toLocaleDateString('tr-TR', { weekday: 'short' })}</b> {d.getDate()}</button>
          {liste.length > 0 && <span className={`rt-rozet${yapilan === liste.length ? ' tam' : ''}`}>{yapilan}/{liste.length}</span>}
          {t >= t0 && <button type="button" className="rt-ikon" onClick={() => setEkle(t)} aria-label={`${d.getDate()} için kart ekle`}>＋</button>}
        </div>
        <div className="rt-liste">
          {liste.map((k) => <KocKartSatiri key={k.adim.id} k={k} onAc={() => setDetay(k)} onSurukle={k.tekGun && !k.yapildi && t >= t0 ? () => setSurukle(k) : undefined} suruklenen={surukle?.adim.id === k.adim.id} />)}
          {liste.length === 0 && <p className="rt-muted rt-hafta-bos">—</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="rt-danisan-ajanda">
      <p className="rt-muted rt-danisan-not">🤝 <b>{il.danisan_ad}</b> · {disiplinAdi(il.disiplin)} — yalnız senin atadığın kartlar görünür.</p>
      {hata && <p className="rt-hata" onClick={() => setHata(null)}>⚠ {hata}</p>}
      {hafta ? (
        <div className={`rt-hafta${surukle ? ' suruklu' : ''}`}>{gunler.map(gunKutusu)}</div>
      ) : (
        <Kap baslik="Gün" eylemler={tarih >= t0 ? <button type="button" className="rt-ikon" onClick={() => setEkle(tarih)} aria-label="Kart ekle">＋</button> : undefined}>
          {(veri[tarih] ?? []).length === 0 && <p className="rt-muted">Bu gün için atanmış kart yok.</p>}
          <div className="rt-liste">{(veri[tarih] ?? []).map((k) => <KocKartSatiri key={k.adim.id} k={k} onAc={() => setDetay(k)} />)}</div>
        </Kap>
      )}
      {ekle && <KocKartFormu il={il} tarih={ekle} onKapat={() => setEkle(null)} />}
      {detay && <KocKartDetay il={il} k={detay} onKapat={() => setDetay(null)} />}
    </div>
  );
}

function KocKartSatiri({ k, onAc, onSurukle, suruklenen }: { k: KocKarti; onAc: () => void; onSurukle?: () => void; suruklenen?: boolean }) {
  const gecmis = k.tarih < bugun();
  const deger = k.degerler && degerMetni(k.degerler, k.adim.bloklar);
  return (
    <div className={`rt-kart bagli${k.yapildi ? ' yapildi' : ''}${suruklenen ? ' rt-suruklenen-kart' : ''}`}>
      <div className="rt-kart-ust">
        <span className={`rt-durum${k.yapildi ? ' on' : gecmis ? ' kacti' : ''}`} title={k.yapildi ? 'Yapıldı' : gecmis ? 'Yapılmadı' : 'Bekliyor'}>{k.yapildi ? '✓' : gecmis ? '–' : ''}</span>
        <button type="button" className="rt-kart-ad" onClick={onAc}>
          <span className="t">{olcumKarti(k.adim.bloklar) ? '📏 ' : ''}{k.adim.ad}</span>
          {deger && <span className="m">✓ {deger}</span>}
          {!k.tekGun && <span className="m">{k.program.ad}</span>}
        </button>
        {onSurukle && <span className="rt-tutamac" aria-label="Başka güne sürükle" onPointerDown={(e) => { e.preventDefault(); onSurukle(); }}>⋮⋮</span>}
      </div>
    </div>
  );
}

function KocKartDetay({ il, k, onKapat }: { il: IliskiRow; k: KocKarti; onKapat: () => void }) {
  const gecmis = k.tarih < bugun();
  const [duzenle, setDuzenle] = useState(false);
  const [yeniTarih, setYeniTarih] = useState(k.tarih);
  const [sil, setSil] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  if (duzenle) return <KocKartFormu il={il} tarih={k.tarih} k={k} onKapat={onKapat} />;
  const calis = async (f: () => Promise<void>) => { try { await f(); onKapat(); } catch (e) { setHata((e as Error).message); } };
  return (
    <Modal baslik={k.adim.ad} onKapat={onKapat}>
      <BlokGoster bloklar={k.adim.bloklar.filter((b) => !(b.tur === 'sayi' && b.anahtar.startsWith(OLC_ONEK)))} />
      {olcumKarti(k.adim.bloklar) && <p className="rt-muted">📏 Sorulan: {olcuBloklari(k.adim.bloklar).map((b) => b.etiket).join(', ')}</p>}
      <p className="rt-metin">
        {tarihParse(k.tarih).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
        <b>{k.yapildi ? 'Yapıldı' : gecmis ? 'Yapılmadı' : 'Bekliyor'}</b>
        {k.degerler && <> · {degerMetni(k.degerler, k.adim.bloklar)}</>}
      </p>
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      {!k.tekGun && <p className="rt-muted">Bu kart <b>{k.program.ad}</b> programının tekrar eden adımı; Danışmanlık'taki programdan yönetilir.</p>}
      {k.tekGun && k.yapildi && !gecmis && <p className="rt-muted">Yapılmış kart taşınmaz ve kaldırılmaz; içeriğini düzenleyebilirsin.</p>}
      {k.tekGun && k.yapildi && !gecmis && <div className="rt-satir"><button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button></div>}
      {k.tekGun && !k.yapildi && !gecmis && !sil && (
        <>
          <div className="rt-satir">
            <input className="rt-inp" type="date" min={bugun()} value={yeniTarih} onChange={(e) => setYeniTarih(e.target.value)} />
            <button type="button" className="rt-btn" disabled={!yeniTarih || yeniTarih === k.tarih} onClick={() => calis(() => kocKartTasi(k, yeniTarih))}>Taşı</button>
          </div>
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Kaldır</button>
          </div>
        </>
      )}
      {sil && <OnayKutusu metin="Kart danışanın Ajanda'sından kaldırılsın mı?" evet="Kaldır" onVazgec={() => setSil(false)} onEvet={() => calis(() => kocKartSil(k))} />}
    </Modal>
  );
}

// İki kart: öğün/genel kart (ad + açıklama) ve ölçüm kartı (ad + ölçüler). İkisi de tek kartın ekleri.
function KocKartFormu({ il, tarih, k, onKapat }: { il: IliskiRow; tarih: string; k?: KocKarti; onKapat: () => void }) {
  const beslenme = il.disiplin === 'beslenme';
  const b0 = k?.adim.bloklar ?? [];
  const olc0 = olcuBloklari(b0);
  const [tur, setTur] = useState<'kart' | 'olcum'>(k ? (olc0.length ? 'olcum' : 'kart') : 'kart');
  const [ad, setAd] = useState(k?.adim.ad ?? '');
  const [aciklama, setAciklama] = useState(b0.filter((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin').map((b) => b.metin).join('\n\n'));
  const tanimlar = useCanli(olculer, [], [] as OlcuTanimRow[]);
  const [secili, setSecili] = useState<string[]>(olc0.length ? olc0.map((b) => b.anahtar.slice(OLC_ONEK.length)) : ['kilo', 'bel']);
  const [hata, setHata] = useState<string | null>(null);
  const varsayilanAd = tur === 'olcum' ? 'Haftalık ölçüm' : beslenme ? 'Günün menüsü' : '';

  async function kaydet() {
    const bloklar: Blok[] = [];
    if (aciklama.trim()) bloklar.push({ tur: 'metin', metin: aciklama.trim() });
    if (tur === 'olcum') for (const id of secili) { const t = tanimlar.find((x) => x.id === id); if (t) bloklar.push(olcuBlok(t)); }
    const kart = { ad: ad.trim() || varsayilanAd, bloklar };
    try {
      if (k) await kocKartGuncelle(k, kart); else await kocKartEkle(il, tarih, kart);
      onKapat();
    } catch (e) { setHata((e as Error).message); }
  }

  return (
    <Modal baslik={`${k ? 'Kartı düzenle' : 'Kart ekle'} · ${tarihParse(tarih).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}`} onKapat={onKapat}>
      {!k && (
        <div className="rt-chips">
          <button type="button" className={`rt-chip${tur === 'kart' ? ' on' : ''}`} onClick={() => setTur('kart')}>{beslenme ? '🍽 Öğün' : '☑ Kart'}</button>
          <button type="button" className={`rt-chip${tur === 'olcum' ? ' on' : ''}`} onClick={() => setTur('olcum')}>📏 Ölçüm</button>
        </div>
      )}
      <input className="rt-inp rt-ek-ad" placeholder={varsayilanAd || 'Kart adı'} value={ad} onChange={(e) => setAd(e.target.value)} />
      <textarea className="rt-inp" rows={tur === 'olcum' ? 2 : 6} placeholder={tur === 'olcum' ? 'Not (isteğe bağlı) — örn. sabah aç karnına' : beslenme ? 'Kahvaltı: …\nÖğle: …\nAkşam: …\nAra: …' : 'Açıklama'} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      {tur === 'olcum' && (
        <div className="rt-chips">
          {tanimlar.map((t) => {
            const on = secili.includes(t.id);
            return <button key={t.id} type="button" className={`rt-chip${on ? ' on' : ''}`} onClick={() => setSecili(on ? secili.filter((x) => x !== t.id) : [...secili, t.id])}>{t.ad}{t.birim ? ` (${t.birim})` : ''}</button>;
          })}
        </div>
      )}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <button type="button" className="rt-btn primary" disabled={tur === 'olcum' && !secili.length} onClick={kaydet}>{k ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ayOzeti, degerKaydet, gununKartlari, kartKaldir, kartTasi, siraDegistir, yapildiAyarla, type GunSatiri } from '@/lib/ajanda';
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
import { KartEditor } from './KartEditor';

// A1–A9 (ilk dilim). Ajanda yalnızca kart satırlarını bilir; kaynağın içini bilmez.
export default function AjandaPane() {
  const [tarih, setTarih] = useState(bugun());
  const [ekleAcik, setEkleAcik] = useState(false);
  const [ayAcik, setAyAcik] = useState(false);
  const [detay, setDetay] = useState<GunSatiri | null>(null);
  const satirlar = useCanli(() => gununKartlari(tarih), [tarih], [] as GunSatiri[]);
  const t0 = bugun();

  return (
    <div className="rt-ajanda">
      <div className="rt-daterow">
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, -1))} aria-label="Önceki gün">‹</button>
        <button className="rt-dlabel" onClick={() => setAyAcik(true)}>
          {tarihEtiket(tarih)}
          {tarih !== t0 && <span className="rt-totoday" onClick={(e) => { e.stopPropagation(); setTarih(t0); }}>↺ bugüne dön</span>}
        </button>
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, 1))} aria-label="Sonraki gün">›</button>
      </div>

      <Kap
        baslik="Gün"
        eylemler={<button type="button" className="rt-ikon" onClick={() => setEkleAcik(true)} aria-label="Kart ekle">＋</button>}
      >
        {satirlar.length === 0 && <p className="rt-muted">Bu gün için kart yok.</p>}
        <SiraliListe satirlar={satirlar} tarih={tarih} onAc={setDetay} />
      </Kap>

      {ekleAcik && <KartEditor tarih={tarih} onKapat={() => setEkleAcik(false)} />}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
      {detay && <KartDetay satir={detay} tarih={tarih} onKapat={() => setDetay(null)} />}
    </div>
  );
}

// A7 — sürükle-bırak sıralama. Pointer olaylarıyla (fare + dokunmatik) çalışır;
// sürükleme sırasında liste yerelde yeniden dizilir, bırakınca sıra kalıcı yazılır.
function SiraliListe({ satirlar, tarih, onAc }: { satirlar: GunSatiri[]; tarih: string; onAc: (s: GunSatiri) => void }) {
  const [yerel, setYerel] = useState<GunSatiri[] | null>(null);
  const [surukle, setSurukle] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const liste = yerel ?? satirlar;

  useEffect(() => {
    if (!surukle) return;
    function onMove(e: PointerEvent) {
      setYerel((onceki) => {
        const l = [...(onceki ?? satirlar)];
        const i = l.findIndex((x) => x.kart.id === surukle);
        if (i < 0) return onceki;
        const [x] = l.splice(i, 1);
        let hedef = l.length;
        for (let j = 0; j < l.length; j++) {
          const el = refs.current.get(l[j].kart.id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (e.clientY < r.top + r.height / 2) { hedef = j; break; }
        }
        if (hedef === i) return onceki;
        l.splice(hedef, 0, x);
        return l;
      });
    }
    async function onUp() {
      const son = yerel;
      setSurukle(null);
      if (son) await siraDegistir(son.map((x) => x.kart.id));
      setYerel(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [surukle, satirlar, yerel]);

  return (
    <div className="rt-liste">
      {liste.map((s) => (
        <div key={s.kart.id} ref={(el) => { if (el) refs.current.set(s.kart.id, el); else refs.current.delete(s.kart.id); }} className={surukle === s.kart.id ? 'rt-suruklenen' : ''}>
          <KartSatiri
            satir={s}
            tarih={tarih}
            onAc={() => onAc(s)}
            tutamac={s.kart.izinler.sirala && liste.length > 1 ? (
              <span className="rt-tutamac" aria-label="Sürükleyerek sırala" onPointerDown={(e) => { e.preventDefault(); setYerel(liste); setSurukle(s.kart.id); }}>⋮⋮</span>
            ) : null}
          />
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
  const uzak = kart.geri_bildirim === 'uzak';
  const meta = [kart.saatler.join(' · '), bagli && kart.kaynak_etiket ? `${uzak ? '🤝' : '🌱'} ${kart.kaynak_etiket}` : ''].filter(Boolean).join(' · ');
  const yeniGuncel = !!kart.isaret && Date.now() - kart.isaret < 3 * 86400000;
  // A9 — değer düzeltme süresi (koçun izni): süre geçtiyse yapılmış kart değiştirilemez.
  const kilitli = !!kayit?.yapildi && kart.izinler.duzeltme_gun !== null && gunFarki(tarih, bugun()) > kart.izinler.duzeltme_gun;
  // Tek kart + ekler (28 eylül): yapılacak kartına kayıt eki takılıysa işaretlerken değer sorulur,
  // zamanlayıcı takılıysa ▶ ile başlatılır; video sayısı satırda rozet olarak görünür.
  const kayitBl = kart.tip === 'yap' ? degerBloklari(kart.bloklar) : [];
  const zamanli = kart.tip === 'yap' && kart.bloklar.some((b) => b.tur === 'zamanlayici');
  const videoSay = kart.bloklar.filter((b) => b.tur === 'video').length;
  const ekMeta = [videoSay ? `🎬 ${videoSay}` : ''].filter(Boolean).join(' ');
  function isaretle() {
    if (yapildi) { yapildiAyarla(kart.id, tarih, false); setDegerAcik(false); return; }
    if (kayitBl.length) setDegerAcik((v) => !v);
    else yapildiAyarla(kart.id, tarih, true);
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
        {zamanli && !yapildi && !kilitli && <button type="button" className="rt-oynat" onClick={() => setUygulaAcik(true)} aria-label="Zamanlayıcıyı başlat">▶</button>}
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
          ilk={kayit?.degerler ?? null}
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
          <span>{a.etiket}{a.tur === 'sayi' && a.birim ? ` (${a.birim})` : ''}</span>
          {a.tur === 'secenek' ? (
            <select value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })}>
              <option value="">—</option>
              {a.secenekler.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <input className="rt-inp" inputMode={a.tur === 'sayi' ? 'decimal' : 'text'} value={d[a.anahtar]} onChange={(e) => setD({ ...d, [a.anahtar]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="rt-satir">
        {onSadeceIsaretle && <button type="button" className="rt-btn" onClick={onSadeceIsaretle}>Değer girmeden işaretle</button>}
        <button type="button" className="rt-btn primary" onClick={() => onKaydet(Object.fromEntries(alanlar.map((a) => [a.anahtar, a.tur === 'sayi' && d[a.anahtar] !== '' ? Number(d[a.anahtar]) : d[a.anahtar]])))}>Kaydet</button>
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
  // Kendi kartı (Ajanda'dan eklenen, bağımsız) her zaman düzenlenebilir.
  const duzenlenir = !bagli && kart.kaynak_modul === 'ajanda' && kart.izinler.duzenle && (kart.tip === 'yap' || kart.tip === 'oku');

  if (duzenle) return <KartEditor tarih={tarih} kart={kart} onKapat={onKapat} />;

  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar} />
      {bagli && (kart.geri_bildirim === 'uzak'
        ? <p className="rt-muted">🤝 Koçunun kartı · <b>{kart.kaynak_etiket}</b>. İşaretin ve girdiğin değerler yalnız koçuna gider.</p>
        : <p className="rt-muted">Bu kart <b>{kart.kaynak_etiket}</b> programından geliyor; içeriği ve günü programdan yönetilir.</p>)}

      {tekSil && <OnayKutusu metin="Kart silinsin mi?" evet="Sil" onVazgec={() => setTekSil(false)} onEvet={() => kartKaldir(kart.id, tarih, 'tamamen').then(onKapat)} />}
      {bagli && kart.geri_bildirim === 'uzak' && kart.izinler.gun_degistir && !tasiAcik && (
        <div className="rt-satir"><button type="button" className="rt-btn" onClick={() => setTasiAcik(true)}>Başka güne taşı</button></div>
      )}
      {!bagli && !tasiAcik && !silAcik && !tekSil && (
        <div className="rt-satir">
          {duzenlenir && <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>}
          {kart.izinler.gun_degistir && <button type="button" className="rt-btn" onClick={() => setTasiAcik(true)}>Taşı</button>}
          <PaylasDugmesi paketUret={() => kartPaketi(kart)} />
          {kart.izinler.sil && <button type="button" className="rt-btn tehlike" onClick={() => (tekrarli ? setSilAcik(true) : setTekSil(true))}>Kaldır</button>}
        </div>
      )}

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


// Uygula — zamanlayıcılı/rehberli pratik. Bitince süre değer olarak kaydedilir ve
// bağlı kartta sahibine (programa) geri bildirim olarak gider.
function Uygula({ satir, tarih, onKapat }: { satir: GunSatiri; tarih: string; onKapat: () => void }) {
  const { kart } = satir;
  const zb = kart.bloklar.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  const hedefSn = zb && zb.dakika > 0 ? zb.dakika * 60 : null; // 0 = serbest süre (ileri sayar)
  const [gecen, setGecen] = useState(0);
  const [calisiyor, setCalisiyor] = useState(false);

  useEffect(() => {
    if (!calisiyor) return;
    const t = setInterval(() => setGecen((g) => g + 1), 1000);
    return () => clearInterval(t);
  }, [calisiyor]);

  useEffect(() => {
    if (hedefSn !== null && gecen >= hedefSn && calisiyor) setCalisiyor(false);
  }, [gecen, hedefSn, calisiyor]);

  const goster = hedefSn !== null ? Math.max(0, hedefSn - gecen) : gecen;
  const mmss = `${String(Math.floor(goster / 60)).padStart(2, '0')}:${String(goster % 60).padStart(2, '0')}`;
  const bitti = hedefSn !== null && gecen >= hedefSn;

  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar.filter((b) => b.tur !== 'zamanlayici')} />
      <div className={`rt-sayac${bitti ? ' bitti' : ''}`}>{mmss}</div>
      <div className="rt-satir">
        {!bitti && <button type="button" className="rt-btn" onClick={() => setCalisiyor((c) => !c)}>{calisiyor ? 'Duraklat' : gecen ? 'Devam' : 'Başla'}</button>}
        <button type="button" className="rt-btn primary" disabled={gecen === 0} onClick={async () => { await degerKaydet(kart.id, tarih, { ...(satir.kayit?.degerler ?? {}), sure_dk: Math.max(1, Math.round(gecen / 60)) }); onKapat(); }}>Bitir ve kaydet</button>
      </div>
    </Modal>
  );
}

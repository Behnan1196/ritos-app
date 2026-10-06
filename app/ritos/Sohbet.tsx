'use client';

// 📥 Gelenler ve Paylaş (7 ekim — v1 sadeleştirmesi).
//  • Gelenler: e-postama gelen danışmanlık davetleri, Çevrem'den gelen kart/program paylaşımları
//    (supabase/v1/07-paylasim.sql) ve koçum/danışanımdan gelen paylaşımlar (danışmanlık mesajı).
//  • Paylaş: kartın ya da programın tanımını Çevrem'deki birine ya da koçuma/danışanıma gönder.
// Eski aile grubu (şifreli kanal) ve sohbet ekranları kaldırıldı; gruplar Çevrem'de (lib/cevrem.ts).

import React, { useMemo, useState } from 'react';
import { db, type IliskiRow, type MesajRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { bugun } from '@/lib/paket';
import { paketiAl, type PaylasimPaketi } from '@/lib/paylasim';
import { benMi, disiplinAdi, konusmaIliski, sohbetGonder, useDanismanlik, useEpostaDavetleri } from '@/lib/danismanlik';
import { paylasilacakKisiler, paylasimAlindi, paylasimGonder, paylasimSil, useCevrem, type GelenPaylasim } from '@/lib/cevrem';
import { danismanlikDavetiAc } from './Danismanlik';
import { Modal } from './ortak';

// ———————————————— koç / danışan konuşmaları (paylaşım kanalı) ————————————————

interface Konusma { id: string; ad: string; alt: string; aktif: boolean }

function useKonusmalar(): Konusma[] {
  const d = useDanismanlik();
  const iliskiler = useCanli(() => db.iliski.toArray(), [], [] as IliskiRow[]);
  return useMemo(() => iliskiler.filter((il) => il.disiplin !== 'aile' && !benMi(il.id)).map((il) => {
    const benKoc = il.koc === d.uid;
    return { id: konusmaIliski(il.id), ad: benKoc ? il.danisan_ad : il.koc_ad, alt: `${benKoc ? 'Danışanın' : 'Koçun'} · ${disiplinAdi(il.disiplin)}`, aktif: il.durum === 'aktif' };
  }), [iliskiler, d.uid]);
}

// ———————————————— 📥 Gelenler ————————————————

/** Bekleyen davetler + alınmamış paylaşımlar — Home kartı ve sekme rozeti için. */
export function useGelenlerOzeti(): { davet: number; paylasim: number; toplam: number } {
  const d = useDanismanlik();
  const davet = useEpostaDavetleri().length;
  const cv = useCevrem();
  const iliskiden = useCanli(() => db.mesaj.filter((m) => m.tur === 'paylasim' && !m.alindi && m.gonderen !== d.uid).count(), [d.uid], 0);
  const paylasim = iliskiden + cv.gelenler.filter((g) => !g.alindi).length;
  return { davet, paylasim, toplam: davet + paylasim };
}

interface GelenSatir { id: string; kim: string; paket: PaylasimPaketi; zaman: number; alindi: boolean; alindiYap: () => Promise<void>; sil?: () => Promise<void> }

export function GelenlerEkrani({ onGeri, gomulu }: { onGeri?: () => void; gomulu?: boolean }) {
  const d = useDanismanlik();
  const cv = useCevrem();
  const iliskiden = useCanli(() => db.mesaj.filter((m) => m.tur === 'paylasim' && m.gonderen !== d.uid).toArray(), [d.uid], [] as MesajRow[]);
  const [al, setAl] = useState<GelenSatir | null>(null);
  const davetSayisi = useEpostaDavetleri().length; // kanca koşulsuz, en üstte (React #310)
  const satirlar: GelenSatir[] = [
    ...cv.gelenler.map((g: GelenPaylasim) => ({
      id: g.id, kim: g.gonderen_ad, paket: g.paket as PaylasimPaketi, zaman: Date.parse(g.olusturuldu), alindi: !!g.alindi,
      alindiYap: () => paylasimAlindi(g.id), sil: () => paylasimSil(g.id),
    })),
    ...iliskiden.filter((m) => m.paket).map((m) => ({
      id: m.id, kim: m.gonderen_ad, paket: m.paket as PaylasimPaketi, zaman: m.zaman, alindi: !!m.alindi,
      alindiYap: async () => { await db.mesaj.update(m.id, { alindi: Date.now() }); },
    })),
  ].sort((a, b) => b.zaman - a.zaman);
  const yeni = satirlar.filter((x) => !x.alindi);
  const alinan = satirlar.filter((x) => x.alindi);
  const satir = (x: GelenSatir) => (
    <div key={x.id} className={`rt-gelen${x.alindi ? ' alindi' : ''}`}>
      <span className="tx">
        <span className="t">{x.paket.tur === 'program' ? '🌱' : '🗂'} {x.paket.ad}</span>
        <span className="s">{x.kim} · {saat(x.zaman)}</span>
      </span>
      {x.alindi
        ? (x.sil ? <button type="button" className="rt-linkbtn" onClick={() => void x.sil!().catch(() => {})}>Sil</button> : <span className="rt-tamam">Alındı</span>)
        : <button type="button" className="rt-btn primary" onClick={() => setAl(x)}>Al</button>}
    </div>
  );
  return (
    <div className={`rt-gelenler${gomulu ? ' gomulu' : ''}`}>
      {!gomulu && (
        <div className="rt-dan-bas">
          {onGeri && <button type="button" className="rt-geri" onClick={onGeri}>‹ Home</button>}
          <b>📥 Gelenler</b>
        </div>
      )}
      <EpostaDavetleri />
      {yeni.map(satir)}
      {!yeni.length && !davetSayisi && <p className="rt-muted">Yeni bir şey yok. Çevrendekiler ya da koçun sana kart veya program gönderince, davetler de burada görünür.</p>}
      {alinan.length > 0 && <details className="rt-belgeler"><summary>Alınanlar ({alinan.length})</summary>{alinan.map(satir)}</details>}
      {al && <AlModal p={al.paket} kim={al.kim} onAlindi={al.alindiYap} onKapat={() => setAl(null)} />}
    </div>
  );
}

/** E-postama gelmiş danışmanlık davetleri: "Bak" davet penceresini açar (Kabul / Reddet). */
function EpostaDavetleri() {
  const l = useEpostaDavetleri();
  if (!l.length) return null;
  return (
    <>
      {l.map((x) => (
        <div key={x.kod} className="rt-gelen">
          <span className="tx">
            <span className="t">🤝 Danışmanlık daveti</span>
            <span className="s">{x.koc_ad} · {disiplinAdi(x.disiplin)}</span>
          </span>
          <button type="button" className="rt-btn primary" onClick={() => danismanlikDavetiAc(x.kod)}>Bak</button>
        </div>
      ))}
    </>
  );
}

function saat(ms: number) {
  const d = new Date(ms);
  const t = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const g = new Date(ms).toISOString().slice(0, 10);
  return g === bugun() ? t : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${t}`;
}

// ———————————————— Paylaş ————————————————

/** Kart ya da program ekranındaki "Paylaş": Çevrem'deki biri ya da koçum/danışanım. */
export function PaylasDugmesi({ paketUret }: { paketUret: () => Promise<PaylasimPaketi | null> | PaylasimPaketi }) {
  const [acik, setAcik] = useState(false);
  const cv = useCevrem();
  const kisiler = paylasilacakKisiler(cv);
  const konusmalar = useKonusmalar().filter((k) => k.aktif);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  if (!kisiler.length && !konusmalar.length) return null;
  const gonder = async (ad: string, f: (p: PaylasimPaketi) => Promise<void>) => {
    setHata(null);
    try { const p = await paketUret(); if (!p) return; await f(p); setMesaj(`${ad} için gönderildi; Gelenler'inde görecek.`); }
    catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <button type="button" className="rt-btn" onClick={() => { setMesaj(null); setHata(null); setAcik(true); }}>Paylaş</button>
      {acik && (
        <Modal baslik="Kime gönderilsin?" onKapat={() => setAcik(false)}>
          {mesaj ? <><p className="rt-tamam">{mesaj}</p><div className="rt-satir"><button type="button" className="rt-btn" onClick={() => setAcik(false)}>Tamam</button></div></> : (
            <>
              <p className="rt-muted">Yalnız tanım gider; işaretlerin ve girdiğin değerler gitmez. Alan kişi kendi kopyasını alır.</p>
              {kisiler.length > 0 && <p className="rt-cv-alt-h">👥 Çevrem</p>}
              {kisiler.map((k) => (
                <button key={k.id} type="button" className="rt-gelen" onClick={() => gonder(k.ad, (p) => paylasimGonder(k.id, p))}>
                  <span className="tx"><span className="t">{k.ad}</span><span className="s">{k.gruplar.join(', ')}</span></span>
                </button>
              ))}
              {konusmalar.length > 0 && <p className="rt-cv-alt-h">🤝 Danışmanlık</p>}
              {konusmalar.map((k) => (
                <button key={k.id} type="button" className="rt-gelen" onClick={() => gonder(k.ad, async (p) => { await sohbetGonder(k.id, { paket: p }); })}>
                  <span className="tx"><span className="t">{k.ad}</span><span className="s">{k.alt}</span></span>
                </button>
              ))}
              {hata && <p className="rt-hata">{hata}</p>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function AlModal({ p, kim, onAlindi, onKapat }: { p: PaylasimPaketi; kim: string; onAlindi: () => Promise<void>; onKapat: () => void }) {
  const [tarih, setTarih] = useState(bugun());
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik={p.ad} onKapat={onKapat}>
      <p className="rt-muted">{kim} paylaştı · {p.tur === 'program' ? 'Program' : 'Kart'}</p>
      {p.tur === 'program' && p.program && (
        <>
          {p.program.amac && <p className="rt-metin"><b>Amaç:</b> {p.program.amac}</p>}
          <ul className="rt-maddeler">{p.program.adimlar.map((a, i) => <li key={i}>{a.ad}</li>)}</ul>
        </>
      )}
      {sonuc ? <><p className="rt-tamam">{sonuc}</p><div className="rt-satir"><button type="button" className="rt-btn" onClick={onKapat}>Tamam</button></div></> : (
        <>
          {p.tur === 'kart' && <label className="rt-alan">Başlangıç günü<input className="rt-inp" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>}
          {hata && <p className="rt-hata">{hata}</p>}
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
            <button type="button" className="rt-btn primary" onClick={async () => {
              try { setSonuc(await paketiAl(p, kim, { baslangic: tarih, klasor: null })); await onAlindi(); }
              catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
            }}>{p.tur === 'program' ? 'Rutinlerime al' : "Ajandama al"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

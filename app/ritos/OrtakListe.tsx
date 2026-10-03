'use client';

// Aile ortak listeleri (3 ekim) — Home widget'ı. Herkes ekler, işaretler, temizler; değişiklik aile
// kanalından şifreli gider ve herkesin listesine anında yansır. Bkz. lib/ortak.ts.

import React, { useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db, type AileRow, type OrtakListeRow, type OrtakMaddeRow } from '@/lib/db';
import { aileAktifMi, benAile, ortakGonder, useDanismanlik } from '@/lib/danismanlik';
import { OnayKutusu } from './ortak';

export function OrtakListeWidget() {
  const d = useDanismanlik();
  const aile = useCanli(async () => (await db.aile.toArray()).find((a) => a.uyeler.some((u) => u.uye === d.uid && u.durum === 'aktif')) ?? null, [d.uid], null as AileRow | null);
  const listeler = useCanli(async () => (aile ? (await db.ortak_liste.where('aile').equals(aile.id).toArray()).filter((l) => !l.silindi).sort((a, b) => a.zaman - b.zaman) : []), [aile?.id], [] as OrtakListeRow[]);
  const [secili, setSecili] = useState<string | null>(null);
  const [yeniAd, setYeniAd] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  if (!aile || !aileAktifMi(aile)) return null;
  const aktif = listeler.find((l) => l.id === secili) ?? listeler[0] ?? null;
  const ad = (id: string) => (id === d.uid ? 'sen' : aile.uyeler.find((u) => u.uye === id)?.ad ?? '');
  const calistir = (f: () => Promise<void>) => { setHata(null); f().catch((e) => setHata(e instanceof Error ? e.message : String(e))); };
  const listeKur = (isim: string) => calistir(async () => {
    const id = crypto.randomUUID();
    await ortakGonder({ o: 'liste', id, ad: isim, kim: benAile().kim, zaman: Date.now() });
    setSecili(id); setYeniAd(null);
  });

  return (
    <div className="rt-ortak-w">
      <div className="rt-notlar-hd">
        <b>🛒 Ortak listeler</b>
        <span className="rt-muted rt-ortak-aile">👪 {aile.ad}</span>
        <button type="button" className="rt-ikon" aria-label="Yeni liste" onClick={() => setYeniAd('')}>＋</button>
      </div>
      {listeler.length > 1 && (
        <div className="rt-chips">
          {listeler.map((l) => <button key={l.id} type="button" className={`rt-chip${aktif?.id === l.id ? ' on' : ''}`} onClick={() => setSecili(l.id)}>{l.ad}</button>)}
        </div>
      )}
      {yeniAd !== null && (
        <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
          <input className="rt-inp" autoFocus placeholder="Liste adı (örn. Eczane)" value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && yeniAd.trim()) listeKur(yeniAd.trim()); }} />
          <button type="button" className="rt-btn primary" disabled={!yeniAd.trim()} onClick={() => listeKur(yeniAd.trim())}>Kur</button>
        </div>
      )}
      {!aktif && yeniAd === null && <button type="button" className="rt-widget-ekle" onClick={() => listeKur('Alışveriş')}>＋ Alışveriş listesi oluştur</button>}
      {aktif && <OrtakListe liste={aktif} ad={ad} calistir={calistir} />}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
    </div>
  );
}

function OrtakListe({ liste, ad, calistir }: { liste: OrtakListeRow; ad: (id: string) => string; calistir: (f: () => Promise<void>) => void }) {
  const maddeler = useCanli(async () => (await db.ortak_madde.where('liste').equals(liste.id).toArray()).filter((m) => !m.silindi), [liste.id], [] as OrtakMaddeRow[]);
  const [yeni, setYeni] = useState('');
  const [sil, setSil] = useState(false);
  const acik = maddeler.filter((m) => !m.isaretli).sort((a, b) => a.zaman - b.zaman);
  const alinan = maddeler.filter((m) => m.isaretli).sort((a, b) => b.isaret_zaman - a.isaret_zaman);
  const ben = benAile().kim;
  const ekle = () => {
    const metinler = yeni.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (!metinler.length) return;
    setYeni('');
    calistir(async () => { for (const m of metinler) await ortakGonder({ o: 'madde', liste: liste.id, id: crypto.randomUUID(), metin: m, kim: ben, zaman: Date.now() }); });
  };
  const isaretle = (m: OrtakMaddeRow) => calistir(() => ortakGonder({ o: 'isaret', liste: liste.id, id: m.id, isaretli: !m.isaretli, kim: ben, zaman: Date.now() }));
  return (
    <>
      <input className="rt-inp rt-notlar-hizli" placeholder={`${liste.ad} listesine ekle… (Enter · virgülle birden çok)`} value={yeni} onChange={(e) => setYeni(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ekle(); }} />
      {acik.length === 0 && alinan.length === 0 && <p className="rt-muted">Liste boş.</p>}
      <div className="rt-ortak-maddeler">
        {acik.map((m) => (
          <button key={m.id} type="button" className="rt-ortak-madde" onClick={() => isaretle(m)}>
            <span className="kutu" />
            <span className="t">{m.metin}</span>
            {m.ekleyen !== ben && <span className="kim">{ad(m.ekleyen)}</span>}
          </button>
        ))}
        {alinan.map((m) => (
          <button key={m.id} type="button" className="rt-ortak-madde alindi" onClick={() => isaretle(m)}>
            <span className="kutu">✓</span>
            <span className="t">{m.metin}</span>
            {m.isaret_kim && <span className="kim">{ad(m.isaret_kim)}</span>}
          </button>
        ))}
      </div>
      <div className="rt-satir">
        {alinan.length > 0 && <button type="button" className="rt-linkbtn" onClick={() => calistir(async () => { for (const m of alinan) await ortakGonder({ o: 'madde-sil', liste: liste.id, id: m.id, zaman: Date.now() }); })}>Alınanları temizle ({alinan.length})</button>}
        <span style={{ flex: 1 }} />
        {!sil && <button type="button" className="rt-linkbtn tehlike" onClick={() => setSil(true)}>Listeyi sil</button>}
      </div>
      {sil && <OnayKutusu metin={`"${liste.ad}" herkesten silinsin mi?`} evet="Sil" onVazgec={() => setSil(false)} onEvet={() => { setSil(false); calistir(() => ortakGonder({ o: 'liste-sil', id: liste.id, zaman: Date.now() })); }} />}
    </>
  );
}

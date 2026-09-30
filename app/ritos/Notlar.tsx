'use client';

// Notlar widget'ı (30 eylül) — Home'da hızlı not + son notlar; tam liste ve stilli editör.

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useCanli } from '@/lib/canli';
import { db, type NotRow } from '@/lib/db';
import { hizliNot, notlar, notSabitle, notSil, notuAjandaya } from '@/lib/notlar';
import { bugun } from '@/lib/paket';
import { Modal, OnayKutusu } from './ortak';

const NotEditor = dynamic(() => import('./NotEditor'), { ssr: false, loading: () => <p className="rt-muted">Yükleniyor…</p> });

const zamanMetni = (t: number) => {
  const d = new Date(t);
  const bugun = new Date();
  return d.toDateString() === bugun.toDateString()
    ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};
const onizleme = (n: NotRow) => n.metin.split('\n').map((s) => s.trim()).filter(Boolean).slice(1).join(' · ');

export function NotlarWidget() {
  const liste = useCanli(notlar, [], [] as NotRow[]);
  const [hizli, setHizli] = useState('');
  const [acik, setAcik] = useState<{ id: string; yeni?: boolean } | null>(null);
  const [tumu, setTumu] = useState(false);
  const gorunen = [...liste.filter((n) => n.sabit), ...liste.filter((n) => !n.sabit).slice(0, 3)];
  return (
    <div className="rt-notlar-w">
      <div className="rt-notlar-hd">
        <b>📝 Notlar</b>
        {liste.length > 0 && <button type="button" className="rt-linkbtn" onClick={() => setTumu(true)}>Tümü ({liste.length}) ›</button>}
        <button type="button" className="rt-ikon" aria-label="Yeni not" onClick={async () => setAcik({ id: await hizliNot(''), yeni: true })}>＋</button>
      </div>
      <input
        className="rt-inp rt-notlar-hizli" placeholder="Hızlı not… (Enter)" value={hizli}
        onChange={(e) => setHizli(e.target.value)}
        onKeyDown={async (e) => { if (e.key === 'Enter' && hizli.trim()) { await hizliNot(hizli); setHizli(''); } }}
      />
      {gorunen.map((n) => <NotSatiri key={n.id} n={n} onAc={() => setAcik({ id: n.id })} />)}
      {tumu && <NotListesi onKapat={() => setTumu(false)} onAc={(id, yeni) => setAcik({ id, yeni })} />}
      {acik && <NotEkrani id={acik.id} yeni={acik.yeni} onKapat={() => setAcik(null)} />}
    </div>
  );
}

function NotSatiri({ n, onAc }: { n: NotRow; onAc: () => void }) {
  const alt = onizleme(n);
  return (
    <button type="button" className="rt-not-satir" onClick={onAc}>
      <span className="t">{n.sabit && '📌 '}{n.baslik || <span className="rt-muted">Boş not</span>}</span>
      <span className="m">{zamanMetni(n.guncellendi)}{alt ? ` · ${alt}` : ''}</span>
    </button>
  );
}

function NotListesi({ onKapat, onAc }: { onKapat: () => void; onAc: (id: string, yeni?: boolean) => void }) {
  const liste = useCanli(notlar, [], [] as NotRow[]);
  const [ara, setAra] = useState('');
  const q = ara.trim().toLocaleLowerCase('tr');
  const suzulmus = q ? liste.filter((n) => n.metin.toLocaleLowerCase('tr').includes(q)) : liste;
  return (
    <div className="rt-not-ekran">
      <div className="rt-not-ust">
        <button type="button" className="tool-back" onClick={onKapat}>‹ Geri</button>
        <b>📝 Notlar</b>
        <button type="button" className="rt-btn primary" onClick={async () => onAc(await hizliNot(''), true)}>＋ Yeni</button>
      </div>
      <div className="rt-not-govde">
        <input className="rt-inp" placeholder="Notlarda ara" value={ara} onChange={(e) => setAra(e.target.value)} />
        {suzulmus.length === 0 && <p className="rt-muted">{q ? 'Bulunamadı.' : 'Henüz not yok.'}</p>}
        {suzulmus.map((n) => <NotSatiri key={n.id} n={n} onAc={() => onAc(n.id)} />)}
      </div>
    </div>
  );
}

function NotEkrani({ id, yeni, onKapat }: { id: string; yeni?: boolean; onKapat: () => void }) {
  const n = useCanli(() => db.not.get(id), [id], undefined as NotRow | undefined);
  const [sil, setSil] = useState(false);
  const [aktar, setAktar] = useState(false);
  // Hiç yazılmadan kapatılan yeni not tutulmaz.
  const kapat = async () => { const son = await db.not.get(id); if (son && !son.metin.trim()) await notSil(id); onKapat(); };
  return (
    <div className="rt-not-ekran">
      <div className="rt-not-ust">
        <button type="button" className="tool-back" onClick={kapat}>‹ Notlar</button>
        <span className="rt-muted">{n ? zamanMetni(n.guncellendi) : ''}</span>
        {n && <button type="button" className={`rt-ikon${n.sabit ? ' on' : ''}`} aria-label={n.sabit ? 'Sabitlemeyi kaldır' : 'Sabitle'} onClick={() => notSabitle(n)}>📌</button>}
        {n && n.metin.trim() && <button type="button" className="rt-ikon" aria-label="Ajandaya aktar" title="Ajandaya aktar" onClick={() => setAktar(true)}>📅</button>}
        <button type="button" className="rt-ikon" aria-label="Notu sil" onClick={() => setSil(true)}>🗑</button>
      </div>
      {sil && <div className="rt-not-govde"><OnayKutusu metin="Not silinsin mi?" evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await notSil(id); onKapat(); }} /></div>}
      {aktar && n && <AktarModal n={n} onKapat={() => setAktar(false)} />}
      <div className="rt-not-govde">{n ? <NotEditor key={id} not={n} yeni={yeni} /> : null}</div>
    </div>
  );
}

function AktarModal({ n, onKapat }: { n: NotRow; onKapat: () => void }) {
  const [tarih, setTarih] = useState(bugun());
  const [saat, setSaat] = useState('');
  const [tamam, setTamam] = useState(false);
  return (
    <Modal baslik="📅 Ajandaya aktar" onKapat={onKapat}>
      {tamam ? (
        <>
          <p className="rt-tamam">&quot;{n.baslik || 'Not'}&quot; Ajanda&apos;na kart olarak eklendi. Not burada da duruyor.</p>
          <button type="button" className="rt-btn" onClick={onKapat}>Tamam</button>
        </>
      ) : (
        <>
          <p className="rt-muted">İlk satır kartın adı olur; geri kalanı (listeler, yapılacaklar) kartın açıklamasına geçer.</p>
          <div className="rt-satir">
            <label className="rt-alan"><span>Gün</span><input className="rt-inp" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
            <label className="rt-alan"><span>Saat (isteğe bağlı)</span><input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
          </div>
          <button type="button" className="rt-btn primary" disabled={!tarih} onClick={async () => { await notuAjandaya(n, tarih, saat); setTamam(true); }}>Aktar</button>
        </>
      )}
    </Modal>
  );
}

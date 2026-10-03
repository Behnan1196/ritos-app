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
import { db, type IliskiRow, type ProgramRow } from '@/lib/db';
import { bugun, tarihEkle, tarihEtiket } from '@/lib/paket';
import { disiplinAdi, useDanismanlik } from '@/lib/danismanlik';
import { useSeciliDanisan } from '@/lib/seciliDanisan';
import type { PlanHedef } from '@/lib/danisanAjanda';
import { DanisanAjandasi } from './DanisanAjanda';
import { AyTakvimi, haftaBasi, haftaEtiket } from './AjandaPane';
import { DISIPLIN_IKON } from './DanismanlikEkrani';
import Kutuphane from './Kutuphane';

type Alt = 'planlar' | 'kutuphane';
// Oturum boyunca korunan durum (sekme değişince bileşen kapanır; modül değişkeni kalır).
const durum: { alt: Alt; tarih: string | null; hafta: boolean } = { alt: 'planlar', tarih: null, hafta: true };

interface Hedef { id: string; grup: string; ic: string; ad: string; alt?: string; h: PlanHedef }

function useHedefler(): Hedef[] {
  const dn = useDanismanlik();
  const iliskiler = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.durum === 'aktif' && i.koc === dn.uid), [dn.uid], [] as IliskiRow[]);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], [] as ProgramRow[]);
  const liste: Hedef[] = [];
  for (const i of iliskiler.filter((x) => x.disiplin !== 'aile').sort((a, b) => a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: 'Danışanlar', ic: DISIPLIN_IKON[i.disiplin] ?? '🤝', ad: i.danisan_ad, alt: disiplinAdi(i.disiplin), h: { tur: 'danisan', il: i } });
  }
  for (const i of iliskiler.filter((x) => x.disiplin === 'aile')) {
    liste.push({ id: i.id, grup: 'Ailem', ic: '👪', ad: i.danisan_ad, alt: 'verdiğin görevler', h: { tur: 'danisan', il: i } });
  }
  for (const p of programlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) {
    liste.push({ id: `p:${p.id}`, grup: 'Programlarım', ic: '🌱', ad: p.ad, alt: 'kişisel program', h: { tur: 'program', programId: p.id } });
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
  const h = hedefler.find((x) => x.id === secili) ?? null;

  // Seçim yoksa (ya da seçili hedef artık yoksa) ilk hedef seçilir.
  useEffect(() => {
    if (!h && hedefler.length) setSecili(hedefler[0].id);
  }, [h, hedefler.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hedefler.length) {
    return (
      <div className="rt-atolye-bos">
        <p className="rt-metin"><b>Henüz planlayacağın bir şey yok.</b></p>
        <ul className="rt-maddeler rt-muted">
                    <li>Ailene görev ver: Ayarlar › Aile › 📋 Görev ver.</li>
          <li>Danışanların varsa Home › Danışmanlık&apos;tan davet et.</li>
          <li>Aldığın programlar da burada planlanır.</li>
        </ul>
      </div>
    );
  }

  const gruplar = Array.from(new Set(hedefler.map((x) => x.grup)));
  const t0 = bugun();
  const adim = hafta ? 7 : 1;
  const bugunGorunur = hafta ? haftaBasi(tarih) === haftaBasi(t0) : tarih === t0;

  const secici = genis ? (
    <aside className="rt-atolye-sol" aria-label="Kimi planlıyorum">
      {gruplar.map((g) => (
        <div key={g}>
          <div className="rt-grup-ad">{g}</div>
          {hedefler.filter((x) => x.grup === g).map((x) => (
            <button key={x.id} type="button" className={`rt-hedef-sat${x.id === h?.id ? ' on' : ''}`} onClick={() => setSecili(x.id)}>
              <span className="ic">{x.ic}</span><span className="ad">{x.ad}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  ) : (
    <div className="rt-hedef-cipler" aria-label="Kimi planlıyorum">
      {hedefler.map((x) => (
        <button key={x.id} type="button" className={`rt-chip${x.id === h?.id ? ' on' : ''}`} onClick={() => setSecili(x.id)}>{x.ic} {x.ad}</button>
      ))}
    </div>
  );

  return (
    <div className="rt-atolye-plan">
      {secici}
      <section className="rt-atolye-orta">
        {h && (
          <>
            <div className="rt-hedef-bas"><b>{h.ic} {h.ad}</b>{h.alt && <span className="rt-muted"> · {h.alt}</span>}</div>
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
                ? <>Yalnız bu programın kartları. Burada kurduğun kartlar Günüm&apos;e de düşer.</>
                : h.grup === 'Ailem'
                  ? <>Ona verdiğin görevler ve durumları. İşaretleyince burada görürsün.</>
                  : <>Yalnız senin atadığın kartlar görünür.</>}
              tarih={tarih} hafta={hafta} haftaBas={haftaBasi(tarih)} onGun={(t) => { setTarih(t); setHafta(false); }} />
          </>
        )}
      </section>
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
    </div>
  );
}

'use client';

// Senkron göstergesi + sunucu gelen kutusu (27 eylül — V1 sadelik).
// Gelenler ekranı ve e-postayla herkese paylaşım kaldırıldı; paylaşım Sohbet'ten yapılacak.
// cat_gelen şimdilik yalnızca e-postayla gelen danışmanlık davetini taşır (Bekleyen davetler).

import React, { useEffect, useState } from 'react';
import { db, type GelenRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { useOturum } from '@/lib/hesap';
import { useSenkronDurum } from '@/lib/senkron';
import { gelenleriCek } from '@/lib/paylasim';
import { DavetGelenDetay, type DavetPaketi } from './Danismanlik';

// Başlıktaki küçük senkron göstergesi: bir sorun varsa belirgin.
export function SenkronIsareti() {
  const d = useSenkronDurum();
  if (!d.etkin) return null;
  const metin = d.hata ? 'Senkron sorunu' : d.ilkIndirme ? 'Verilerin getiriliyor…' : d.calisiyor ? 'Eşitleniyor…' : null;
  return <span className={`rt-senkron${d.hata ? ' hata' : ''}`} title={d.hata ?? 'Eşitlendi'}>{d.hata ? '⚠' : '●'}{metin ? ` ${metin}` : ''}</span>;
}

// Oturum varken açılışta, pencere odaklanınca ve dakikada bir sunucudaki gelen kutusunu çek.
export function useGelenSenkron() {
  const o = useOturum();
  const uid = o.session?.user.id;
  useEffect(() => {
    if (!uid) return;
    const cek = () => { gelenleriCek().catch(() => {}); };
    cek();
    window.addEventListener('focus', cek);
    const t = setInterval(cek, 60_000);
    return () => { window.removeEventListener('focus', cek); clearInterval(t); };
  }, [uid]);
}

/** E-postayla gelen, henüz yanıtlanmamış danışmanlık davetleri. (Sohbet kurulunca oraya taşınacak.) */
export function BekleyenDavetler() {
  const davetler = useCanli(() => db.gelen.filter((g) => !g.alindi && (g.paket as { tur?: string }).tur === 'davet').toArray(), [], [] as GelenRow[]);
  const [acik, setAcik] = useState<GelenRow | null>(null);
  if (!davetler.length && !acik) return null; // kabul edilince liste boşalır; sonuç penceresi açık kalsın
  return (
    <div className="rt-davetler">
      {davetler.map((g) => {
        const p = g.paket as DavetPaketi;
        return (
          <button key={g.id} type="button" className="rt-davet" onClick={() => setAcik(g)}>
            <span>🤝 <b>{p.davet.koc_ad}</b> seni danışanı olarak eklemek istiyor</span>
            <span className="rt-btn primary">Gör</span>
          </button>
        );
      })}
      {acik && <DavetGelenDetay g={acik} onKapat={() => setAcik(null)} />}
    </div>
  );
}

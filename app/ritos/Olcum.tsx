'use client';

// Ölçümlerim (28 eylül) — kişinin ölçü serileri. Home'da tek satır; dokununca liste.
// V1: son değer, bir önceki değere göre değişim ve küçük bir çizgi. Hesap/yorum (bel/boy oranı vb.)
// alan paketinin işi (Beslenme, V2).

import React, { useState } from 'react';
import { useCanli } from '@/lib/canli';
import { olcuOzetleri, sayiMetin, type OlcuOzeti } from '@/lib/olcum';
import { tarihParse } from '@/lib/paket';
import { Modal } from './ortak';

const kisaTarih = (t: string) => tarihParse(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

export function useOlcumler() {
  return useCanli(olcuOzetleri, [], [] as OlcuOzeti[]);
}

export function OlcumlerSatiri() {
  const ozet = useOlcumler();
  const [acik, setAcik] = useState(false);
  if (!ozet.length) return null;
  const ilk = ozet[0];
  return (
    <>
      <button type="button" className="wrow tool olc" onClick={() => setAcik(true)}>
        <span className="ic">📏</span>
        <span className="tx">
          <span className="t">Ölçümlerim</span>
          <span className="s">{ilk.tanim.ad} {sayiMetin(ilk.son.deger)} {ilk.tanim.birim}{ozet.length > 1 ? ` · +${ozet.length - 1} ölçü` : ''}</span>
        </span>
        <span className="chev">›</span>
      </button>
      {acik && <OlcumlerModal ozet={ozet} onKapat={() => setAcik(false)} />}
    </>
  );
}

function Cizgi({ seri }: { seri: { deger: number }[] }) {
  const s = seri.slice(-12);
  if (s.length < 2) return null;
  const W = 96, H = 28;
  const min = Math.min(...s.map((x) => x.deger)), max = Math.max(...s.map((x) => x.deger));
  const y = (v: number) => (max === min ? H / 2 : H - 3 - ((v - min) / (max - min)) * (H - 6));
  const pts = s.map((x, i) => `${(i / (s.length - 1)) * (W - 4) + 2},${y(x.deger).toFixed(1)}`).join(' ');
  const [sx, sy] = pts.split(' ').pop()!.split(',');
  return (
    <svg className="rt-cizgi" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx} cy={sy} r="2.4" fill="currentColor" />
    </svg>
  );
}

function OlcumlerModal({ ozet, onKapat }: { ozet: OlcuOzeti[]; onKapat: () => void }) {
  const [secili, setSecili] = useState<string | null>(null);
  return (
    <Modal baslik="📏 Ölçümlerim" onKapat={onKapat}>
      <div className="rt-olcumler">
        {ozet.map((o) => {
          const fark = o.onceki ? o.son.deger - o.onceki.deger : null;
          const acik = secili === o.tanim.id;
          return (
            <div key={o.tanim.id} className="rt-olcu">
              <button type="button" className="rt-olcu-ust" onClick={() => setSecili(acik ? null : o.tanim.id)}>
                <span className="ad">{o.tanim.ad}<span className="rt-muted"> · {kisaTarih(o.son.tarih)}</span></span>
                <Cizgi seri={o.seri} />
                <span className="deger">
                  <span><b>{sayiMetin(o.son.deger)}</b> {o.tanim.birim}</span>
                  {fark !== null && fark !== 0 && <span className="fark">{fark > 0 ? '▲' : '▼'} {sayiMetin(Math.abs(fark))}</span>}
                </span>
              </button>
              {acik && (
                <ul className="rt-olcu-gecmis">
                  {[...o.seri].reverse().slice(0, 20).map((x) => (
                    <li key={x.id}><span>{kisaTarih(x.tarih)}</span><span>{x.kaynak ? <span className="rt-muted">🤝 {x.kaynak} · </span> : null}{sayiMetin(x.deger)} {o.tanim.birim}</span></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="rt-muted">Değerler Ajanda'daki ölçüm kartlarından gelir. Kart silinse de ölçüm geçmişin kalır.</p>
    </Modal>
  );
}

'use client';

// ————————————————————————————————————————————————————————————————
// Chromecast'e "Yansıt" — Rite'taki bilgiKart'ın aynısı (30 eylül).
// Gömülü YouTube oynatıcısı hiçbir platformda kendi Cast ikonunu göstermiyor. Bu düğme Google Cast
// Web Sender SDK'sını yükleyip videoyu YouTube'un kendi Cast alıcısına, ayarlanan saniyeden
// başlatarak gönderir. Sınırlar: yalnız Chromecast/Google TV (aynı Wi-Fi, Chrome/Android);
// Safari/iOS'ta Cast API yok, düğme hiç görünmez. Protokol resmî değil — değişirse düğme
// sessizce işlevsiz kalır (hata konsola yazılır).
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';

type W = Window & { chrome?: any; cast?: any; __onGCastApiAvailable?: (ok: boolean) => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

let sdk: Promise<boolean> | null = null;
function castYukle(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const w = window as W;
  if (sdk) return sdk;
  sdk = new Promise((resolve) => {
    if (w.chrome?.cast?.isAvailable) { resolve(true); return; }
    w.__onGCastApiAvailable = (ok: boolean) => {
      if (!ok) { resolve(false); return; }
      try {
        w.cast.framework.CastContext.getInstance().setOptions({
          receiverApplicationId: '233637DE', // YouTube'un kendi Cast alıcı uygulaması
          autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
        });
        resolve(true);
      } catch (e) { console.warn('Cast SDK başlatılamadı:', e); resolve(false); }
    };
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return sdk;
}

export function YansitDugmesi({ videoId, bas }: { videoId: string; bas?: number }) {
  const [hazir, setHazir] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  useEffect(() => {
    let canli = true;
    castYukle().then((ok) => { if (canli) setHazir(ok); });
    return () => { canli = false; };
  }, []);
  async function yansit() {
    const w = window as W;
    setMesgul(true);
    try {
      const ctx = w.cast.framework.CastContext.getInstance();
      let oturum = ctx.getCurrentSession();
      if (!oturum) { await ctx.requestSession(); oturum = ctx.getCurrentSession(); }
      if (oturum) {
        await oturum.sendMessage('urn:x-cast:com.google.youtube.mdx', {
          type: 'loadVideo',
          data: { videoId, currentTime: bas && bas > 0 ? Math.floor(bas) : 0, resumePlayback: false },
        });
      }
    } catch (e) { console.warn('Yansıtma başlatılamadı:', e); }
    setMesgul(false);
  }
  if (!hazir) return null;
  return <button type="button" className="rt-btn sm" onClick={yansit} disabled={mesgul} title="Chromecast/Google TV'ye yansıt — aynı Wi-Fi ağında bir cihaz gerekir">📺 {mesgul ? 'Bağlanıyor…' : 'Yansıt'}</button>;
}

'use client';

import { useEffect } from 'react';

// 6 ekim — telefonda klavye açıkken sabit alt menü gizlenir (iOS'ta klavyeyle birlikte zıplayıp
// alanın üstüne biniyordu). Klavye görsel alanı belirgin biçimde küçültünce <html>'e "klavye" sınıfı.
export default function MobilUyum() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const kok = document.documentElement;
    const f = () => {
      const odak = document.activeElement;
      const yaziAlani = !!odak && (odak.tagName === 'INPUT' || odak.tagName === 'TEXTAREA' || odak.tagName === 'SELECT' || (odak as HTMLElement).isContentEditable);
      kok.classList.toggle('klavye', yaziAlani && vv.height < window.innerHeight * 0.8);
    };
    vv.addEventListener('resize', f);
    window.addEventListener('focusin', f);
    window.addEventListener('focusout', () => setTimeout(f, 50));
    return () => { vv.removeEventListener('resize', f); window.removeEventListener('focusin', f); };
  }, []);
  return null;
}

'use client';

// Başlıktaki eşitleme göstergesi. (7 ekim: eski sunucu gelen kutusu — cat_gelen — kaldırıldı;
// Gelenler artık app/ritos/Sohbet.tsx'te: e-posta davetleri + Çevrem/danışmanlık paylaşımları.)

import React from 'react';
import { useSenkronDurum } from '@/lib/senkron';

export function SenkronIsareti() {
  const d = useSenkronDurum();
  if (!d.etkin) return null;
  // 7 ekim: arka planda çekiş sessiz; yalnız gönderilecek değişiklik varken "Eşitleniyor…" görünür.
  const metin = d.hata ? 'Eşitleme sorunu' : d.ilkIndirme ? 'Verilerin getiriliyor…' : d.calisiyor && d.bekleyen > 0 ? 'Eşitleniyor…' : null;
  return <span className={`rt-senkron${d.hata ? ' hata' : ''}`} title={d.hata ?? 'Eşitlendi'}>{d.hata ? '⚠' : '●'}{metin ? ` ${metin}` : ''}</span>;
}

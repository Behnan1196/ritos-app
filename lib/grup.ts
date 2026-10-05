// Gruplar (5 ekim) — aile grubunun genelleşmiş hali: aile / arkadaş / ekip. Davranış aynı;
// tür yalnız simgeyi, adlandırmayı ve önerilen adı belirler. Sunucuda tablolar cat_aile*.

import type { AileRow } from './db';

export type GrupTur = 'aile' | 'arkadas' | 'ekip';
export const GRUP_SINIR = 12;

export const GRUP_TUR: Record<GrupTur, { ikon: string; ad: string; ornek: string; aciklama: string }> = {
  aile: { ikon: '👪', ad: 'Aile', ornek: 'ör. Öztürkmen ailesi', aciklama: 'evdekilerle görevler, ortak listeler' },
  arkadas: { ikon: '🫂', ad: 'Arkadaşlar', ornek: 'ör. Pazar yürüyüşçüleri', aciklama: 'birlikte hedefler, ortak planlar' },
  ekip: { ikon: '👥', ad: 'Ekip', ornek: 'ör. Proje ekibi', aciklama: 'iş arkadaşlarıyla görev paylaşımı' },
};

export const grupTuru = (a: Pick<AileRow, 'tur'>): GrupTur => (a.tur && a.tur in GRUP_TUR ? a.tur : 'aile');
export const grupIkon = (a: Pick<AileRow, 'tur'>) => GRUP_TUR[grupTuru(a)].ikon;

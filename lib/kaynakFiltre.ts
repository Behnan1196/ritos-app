// ————————————————————————————————————————————————————————————————
// Ajanda kaynak filtresi (3 ekim). Ajandaya artık birçok yerden kart geliyor; kart hangi
// kaynaktan geldiğine göre sınıflanır:  ✍️ Benim · 🌱 Programlar · 🤝 Koçum · 👪 Aile · 🔗 Uygulamalar
// (ileride 📁 Projeler — programın bir türü). Her türün altında kaynak adları (program adı,
// kişi, uygulama) ikinci seviye seçimdir.
// ————————————————————————————————————————————————————————————————

import type { AjandaKartRow, ProgramRow } from './db';

export type KaynakTur = 'ben' | 'program' | 'koc' | 'aile' | 'uygulama';
export const KAYNAK_TUR: [KaynakTur, string, string][] = [
  ['ben', '✍️', 'Benim'], ['program', '🌱', 'Programlar'], ['koc', '🤝', 'Koçum'], ['aile', '👪', 'Aile'], ['uygulama', '🔗', 'Uygulamalar'],
];

export interface KaynakBilgi { tur: KaynakTur; ad: string | null }
export interface Filtre { turler: KaynakTur[]; ad: string | null } // turler boş = tümü; ad yalnız tek tür seçiliyken (3 ekim: çoklu seçim)

export function kaynakBilgi(k: AjandaKartRow, programlar: Map<string, ProgramRow>): KaynakBilgi {
  if (k.kaynak_modul === 'dis') return { tur: 'uygulama', ad: k.kaynak_etiket };
  if (k.kaynak_modul === 'ortak') return { tur: 'aile', ad: 'Ortak' };
  if (k.kaynak_modul === 'danismanlik' || k.geri_bildirim === 'uzak') {
    const p = programlar.get((k.kaynak_ref ?? '').split('/')[0]);
    return { tur: p?.uzak?.disiplin === 'aile' ? 'aile' : 'koc', ad: k.kaynak_etiket };
  }
  if (k.kaynak_modul === 'program') return { tur: 'program', ad: k.kaynak_etiket };
  return { tur: 'ben', ad: null };
}

export const uyar = (b: KaynakBilgi, f: Filtre) => !f.turler.length || (f.turler.includes(b.tur) && (!f.ad || f.turler.length > 1 || b.ad === f.ad));
export const filtreVar = (f: Filtre) => f.turler.length > 0;

const ANAHTAR = 'ritos-ajanda-filtre';
export function filtreOku(): Filtre {
  try {
    const f = JSON.parse(localStorage.getItem(ANAHTAR) || 'null');
    if (f && Array.isArray(f.turler)) return { turler: f.turler, ad: f.ad ?? null };
    if (f && 'tur' in f) return { turler: f.tur ? [f.tur] : [], ad: f.ad ?? null }; // eski tek seçimli kayıt
  } catch { /* yoksay */ }
  return { turler: [], ad: null };
}
export function filtreYaz(f: Filtre) { try { localStorage.setItem(ANAHTAR, JSON.stringify(f)); } catch { /* yoksay */ } }

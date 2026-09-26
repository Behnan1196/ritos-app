'use client';

// ————————————————————————————————————————————————————————————————
// Sınav görev kartları, konu ilerlemesi, deneme geçmişi (P7–P9, 26 eylül).
//
// Görevler yeni bir kart motoru değil: dört temel tip + blok paletiyle kurulur
// (Çalışma = Yap/Uygula, Soru çöz / Deneme / Seans = Kaydet). Kartın `ek` alanı
// hangi sınav, ders, konu ve kaynağa ait olduğunu taşır; analiz ek + girilen
// değerlerden türetilir. Ajanda bu bilgiyi bilmez, yalnız taşır.
// ————————————————————————————————————————————————————————————————

import { db, type KonuDurum } from './db';
import type { Blok, SinavEk, SinavGorevTur, TemelTip } from './paket';

export const GOREV_TUR: [SinavGorevTur, string][] = [
  ['calisma', 'Çalışma'], ['soru', 'Soru çöz'], ['tekrar', 'Tekrar'], ['deneme', 'Deneme'], ['seans', 'Koçluk seansı'],
];
export const GOREV_IKON: Record<SinavGorevTur, string> = { calisma: '📖', soru: '✏️', tekrar: '🔁', deneme: '🧪', seans: '🤝' };

export const DURUM_ETIKET: Record<KonuDurum, string> = { baslanmadi: 'Başlanmadı', calisiliyor: 'Çalışılıyor', tamam: 'Tamamlandı', tekrar: 'Tekrar gerekli' };

/** YKS'de 4 yanlış 1 doğruyu, LGS'de 3 yanlış 1 doğruyu götürür. */
export const yanlisBolen = (sinav: string | null) => (sinav === 'lgs' ? 3 : 4);
export const netHesapla = (d: number, y: number, bolen: number) => Math.round((d - y / bolen) * 100) / 100;

export interface GorevForm {
  tur: SinavGorevTur;
  sinav: string | null;
  sinavAd: string;
  ders: { id: string; ad: string } | null;
  konular: { id: string; ad: string }[];
  kaynak: { id: string; ad: string; url: string } | null;
  sure_dk: number | null;
  hedef_soru: number | null;
  deneme_tur: string;                            // 'genel' | 'tarama' | 'kurum'
  deneme_dersler: { id: string; ad: string }[];
  not: string;
}

export interface GorevTaslak { tip: TemelTip; ad: string; bloklar: Blok[]; ek: SinavEk }

const DENEME_TUR_AD: Record<string, string> = { tarama: 'Tarama', kurum: 'Kurum denemesi' };

export function denemeTurAdi(tur: string, sinavAd: string) {
  return tur === 'genel' ? `${sinavAd} denemesi` : `${sinavAd} ${DENEME_TUR_AD[tur] ?? tur}`;
}

/** Formdan kart taslağı. Eksikse null (ör. Deneme'de ders yok). */
export function gorevUret(f: GorevForm): GorevTaslak | null {
  const konuMetni = f.konular.length ? f.konular.map((k) => k.ad).join(', ') : null;
  const bloklar: Blok[] = [];
  const bilgi = [konuMetni && `Konular: ${konuMetni}`, f.kaynak && `Kaynak: ${f.kaynak.ad}`, f.hedef_soru && f.tur === 'soru' ? `Hedef: ${f.hedef_soru} soru` : null, f.not.trim() || null].filter(Boolean).join('\n');
  if (bilgi) bloklar.push({ tur: 'metin', metin: bilgi });
  if (f.kaynak?.url) bloklar.push({ tur: /youtu|vimeo/.test(f.kaynak.url) ? 'video' : 'baglanti', url: f.kaynak.url, baslik: f.kaynak.ad });
  const baslik = (on: string) => {
    const ic = [f.ders?.ad, f.konular.length === 1 ? f.konular[0].ad : f.konular.length > 1 ? `${f.konular[0].ad} +${f.konular.length - 1}` : null].filter(Boolean).join(' — ');
    return ic ? `${on}: ${ic}` : on;
  };
  const ek: SinavEk = {
    paket: 'sinav', tur: f.tur, sinav: f.tur === 'seans' ? null : f.sinav, ders: f.ders,
    konular: f.konular, kaynak: f.kaynak ? { id: f.kaynak.id, ad: f.kaynak.ad } : null,
    hedef_soru: f.tur === 'soru' ? f.hedef_soru : null, deneme: null,
  };

  switch (f.tur) {
    case 'calisma':
    case 'tekrar': {
      if (!f.ders) return null;
      const on = f.tur === 'calisma' ? 'Çalışma' : 'Tekrar';
      if (f.sure_dk && f.sure_dk > 0) {
        bloklar.push({ tur: 'zamanlayici', dakika: f.sure_dk });
        return { tip: 'uygula', ad: baslik(on), bloklar, ek };
      }
      return { tip: 'yap', ad: baslik(on), bloklar, ek };
    }
    case 'soru':
      if (!f.ders) return null;
      bloklar.push(
        { tur: 'sayi', anahtar: 'dogru', etiket: 'Doğru' },
        { tur: 'sayi', anahtar: 'yanlis', etiket: 'Yanlış' },
        { tur: 'sayi', anahtar: 'bos', etiket: 'Boş' },
      );
      return { tip: 'kaydet', ad: baslik('Soru çöz'), bloklar, ek };
    case 'deneme': {
      if (!f.sinav || !f.deneme_dersler.length) return null;
      for (const d of f.deneme_dersler) {
        bloklar.push({ tur: 'sayi', anahtar: `${d.id}.d`, etiket: `${d.ad} doğru` }, { tur: 'sayi', anahtar: `${d.id}.y`, etiket: `${d.ad} yanlış` });
      }
      return {
        tip: 'kaydet', ad: denemeTurAdi(f.deneme_tur, f.sinavAd), bloklar,
        ek: { ...ek, ders: null, konular: [], kaynak: ek.kaynak, deneme: { tur: f.deneme_tur, dersler: f.deneme_dersler, yanlis_bolen: yanlisBolen(f.sinav) } },
      };
    }
    case 'seans':
      bloklar.push({ tur: 'metin_girdi', anahtar: 'not', etiket: 'Görüşme notu' }, { tur: 'metin_girdi', anahtar: 'sonraki', etiket: 'Sonraki adımlar' });
      return { tip: 'kaydet', ad: 'Koçluk seansı', bloklar, ek: { ...ek, ders: null, konular: [], kaynak: null } };
  }
}

/** Ajanda satırında girilen değerin kısa özeti. */
export function sinavOzeti(ek: SinavEk, d: Record<string, unknown>): string | null {
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  if (ek.tur === 'soru') return `${n(d.dogru)} D · ${n(d.yanlis)} Y · ${n(d.bos)} B`;
  if (ek.tur === 'deneme' && ek.deneme) {
    const net = ek.deneme.dersler.reduce((t, x) => t + netHesapla(n(d[`${x.id}.d`]), n(d[`${x.id}.y`]), ek.deneme!.yanlis_bolen), 0);
    return `Net ${Math.round(net * 100) / 100}`;
  }
  if (ek.tur === 'seans') return d.not ? String(d.not).slice(0, 40) : 'not girildi';
  if (d.sure_dk) return `${d.sure_dk} dk`;
  return null;
}

// ———————————————— analiz ————————————————

export interface KonuIstatistik { calisma: number; tekrar: number; dakika: number; dogru: number; yanlis: number; bos: number; son: string | null }
const bosIstatistik = (): KonuIstatistik => ({ calisma: 0, tekrar: 0, dakika: 0, dogru: 0, yanlis: 0, bos: 0, son: null });

export interface DenemeSonuc {
  kartId: string; tarih: string; ad: string; sinav: string; tur: string; bolen: number;
  dersler: { id: string; ad: string; d: number; y: number; net: number }[]; net: number;
}

export interface SinavAnalizi { konular: Map<string, KonuIstatistik>; denemeler: DenemeSonuc[] }

/** Analize giren tek bir "yapılmış gün": kartın eki + o günün değerleri. */
export interface AnalizKaydi { kartId: string; ad: string; ek: SinavEk; tarih: string; yapildi: boolean; degerler: Record<string, unknown> | null }

/** Kendi Ajanda'm: sınav kartları + gün kayıtları. */
export async function sinavAnalizi(): Promise<SinavAnalizi> {
  const kartlar = (await db.ajanda_kart.toArray()).filter((k) => k.ek?.paket === 'sinav');
  if (!kartlar.length) return analizEt([]);
  const kartMap = new Map(kartlar.map((k) => [k.id, k]));
  const kayitlar = await db.ajanda_kayit.where('kart_id').anyOf(kartlar.map((k) => k.id)).toArray();
  return analizEt(kayitlar.map((r) => { const k = kartMap.get(r.kart_id)!; return { kartId: k.id, ad: k.ad, ek: k.ek as SinavEk, tarih: r.tarih, yapildi: r.yapildi, degerler: r.degerler }; }));
}

/** Koçun gördüğü: danışanın geri bildirimleri + program adımlarının eki (P10). */
export async function danisanAnalizi(programIdler: string[]): Promise<SinavAnalizi> {
  const kayitlar: AnalizKaydi[] = [];
  for (const pid of programIdler) {
    const adimlar = new Map((await db.program_adim.where('program_id').equals(pid).toArray()).map((a) => [a.id, a]));
    const olaylar = (await db.geri_bildirim.where('kaynak_ref').startsWith(`${pid}/`).toArray()).sort((a, b) => a.zaman - b.zaman);
    const son = new Map<string, AnalizKaydi>();
    for (const o of olaylar) {
      const a = adimlar.get((o.kaynak_ref ?? '').split('/')[1]);
      if (!a?.ek || a.ek.paket !== 'sinav') continue;
      const anahtar = `${o.kaynak_ref}|${o.tarih}`;
      const onceki = son.get(anahtar);
      son.set(anahtar, {
        kartId: o.kaynak_ref!, ad: a.ad, ek: a.ek, tarih: o.tarih, yapildi: o.olay !== 'geri_alindi',
        degerler: o.olay === 'deger' ? o.degerler : onceki?.degerler ?? null,
      });
    }
    kayitlar.push(...Array.from(son.values()));
  }
  return analizEt(kayitlar);
}

export function analizEt(kayitlar: AnalizKaydi[]): SinavAnalizi {
  const konular = new Map<string, KonuIstatistik>();
  const denemeler: DenemeSonuc[] = [];
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  for (const r of kayitlar) {
    if (!r.yapildi) continue;
    const ek = r.ek;
    const k = { id: r.kartId, ad: r.ad };
    const d = r.degerler ?? {};
    if (ek.tur === 'deneme' && ek.deneme && ek.sinav) {
      const dersler = ek.deneme.dersler.map((x) => {
        const dd = n(d[`${x.id}.d`]), yy = n(d[`${x.id}.y`]);
        return { id: x.id, ad: x.ad, d: dd, y: yy, net: netHesapla(dd, yy, ek.deneme!.yanlis_bolen) };
      });
      denemeler.push({ kartId: k.id, tarih: r.tarih, ad: k.ad, sinav: ek.sinav, tur: ek.deneme.tur, bolen: ek.deneme.yanlis_bolen, dersler, net: Math.round(dersler.reduce((t, x) => t + x.net, 0) * 100) / 100 });
      continue;
    }
    // Birden çok konulu kartta değer her konuya yazılır (oran konu başına anlamlı kalır).
    for (const kn of ek.konular) {
      const s = konular.get(kn.id) ?? bosIstatistik();
      if (ek.tur === 'calisma') s.calisma++;
      if (ek.tur === 'tekrar') s.tekrar++;
      if (ek.tur === 'soru') { s.dogru += n(d.dogru); s.yanlis += n(d.yanlis); s.bos += n(d.bos); }
      s.dakika += n(d.sure_dk);
      if (!s.son || r.tarih > s.son) s.son = r.tarih;
      konular.set(kn.id, s);
    }
  }
  denemeler.sort((a, b) => a.tarih.localeCompare(b.tarih));
  return { konular, denemeler };
}


export const soruSayisi = (s: KonuIstatistik) => s.dogru + s.yanlis + s.bos;
export const dogrulukOrani = (s: KonuIstatistik) => (soruSayisi(s) ? s.dogru / soruSayisi(s) : null);

/** Zayıf konu: en az 10 soru çözülmüş ve doğruluk %60'ın altında. */
export const ZAYIF_ESIK = { enAzSoru: 10, oran: 0.6 };
export const zayifMi = (s?: KonuIstatistik) => !!s && soruSayisi(s) >= ZAYIF_ESIK.enAzSoru && (dogrulukOrani(s) ?? 1) < ZAYIF_ESIK.oran;

/** Elle verilen durum yoksa kartlardan türet: etkinlik varsa "çalışılıyor". */
export function konuDurumu(elle: KonuDurum | undefined, s?: KonuIstatistik): KonuDurum {
  if (elle) return elle;
  if (!s) return 'baslanmadi';
  return s.calisma + s.tekrar + soruSayisi(s) + s.dakika > 0 ? 'calisiliyor' : 'baslanmadi';
}

export async function konuDurumYaz(id: string, durum: KonuDurum | null) {
  if (durum === null) await db.konu_durum.delete(id);
  else await db.konu_durum.put({ id, durum, guncellendi: Date.now() });
}

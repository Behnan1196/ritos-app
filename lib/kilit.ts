'use client';

// ————————————————————————————————————————————————————————————————
// Cihaz kilidi (G10) + özel alanın şifrelenmesi (26 eylül).
//
// PIN konunca cihazdaki özel alan (hesapsız / misafir veritabanı) PIN'den türetilen anahtarla
// satır satır şifrelenir. Anahtar yalnız bellekte durur; PIN girilmeden özel alan okunamaz.
// Kimlik ve tarih gibi indeks alanları (sorgular için) şifresiz kalır; içerik (ad, bloklar,
// değerler, notlar) şifrelidir.
//
// Şifreleme Dexie'nin en alt katmanında (DBCore) yapılır. İmleçlerde (filter, each, modify)
// satır eşzamanlı çözülmesi gerektiği için eşzamanlı çalışan @noble/ciphers AES-GCM kullanılır;
// anahtar türetme (PBKDF2) WebCrypto ile yapılır.
//
// Sınır — dürüst not: 6 haneli PIN, uygulamayı açan birine karşı güçlü bir kilittir; cihazı
// ele geçirip veritabanı dosyasını söken birine karşı asıl koruma telefonun kendi şifrelemesidir.
// ————————————————————————————————————————————————————————————————

import type { DBCore, DBCoreCursor, DBCoreTable, Middleware } from 'dexie';
import { gcm } from '@noble/ciphers/aes';
import { anahtarDeposu, type KilitRow } from './anahtarDeposu';
import { b64, b64Coz, rastgele } from './sifre';

export const PIN_UZUNLUK = 6;
const SIFRELI_TABLOLAR = new Set(['home_widget', 'ajanda_kart', 'ajanda_kayit', 'geri_bildirim', 'program', 'program_adim', 'klasor', 'gelen', 'kisi']);
const DOGRULAMA_METNI = 'ritos-kilit-v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

let anahtar: Uint8Array | null = null;
let pinTanimli = false;
let durumYuklendi = false;

// ———————————————— eşzamanlı şifreleme ————————————————

function sifrele(k: Uint8Array, veri: unknown): string {
  const nonce = rastgele(12);
  return b64(nonce) + '.' + b64(gcm(k, nonce).encrypt(enc.encode(JSON.stringify(veri))));
}
function coz(k: Uint8Array, s: string): unknown {
  const [n, c] = s.split('.');
  return JSON.parse(dec.decode(gcm(k, b64Coz(n)).decrypt(b64Coz(c))));
}

async function pinAnahtari(pin: string, tuzB64: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(`ritos-pin|${pin}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64Coz(tuzB64), iterations: 600_000 }, k, 256);
  return new Uint8Array(bits);
}

// ———————————————— durum ————————————————

export async function kilitDurumuYukle(): Promise<{ pinVar: boolean; acik: boolean }> {
  const r = await anahtarDeposu().kilit.get('cihaz');
  pinTanimli = !!r;
  durumYuklendi = true;
  return { pinVar: pinTanimli, acik: !pinTanimli || !!anahtar };
}
export const pinVar = () => pinTanimli;
export const kilitAcik = () => !pinTanimli || !!anahtar;

const dinleyiciler = new Set<() => void>();
export function kilitDegisince(f: () => void) { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; }
const haber = () => dinleyiciler.forEach((f) => f());

export function kilitle() {
  if (!pinTanimli) return;
  anahtar = null;
  haber();
}

// ———————————————— PIN ile açma (yanlış denemelerde artan bekleme) ————————————————

export type AcSonuc = { tamam: true } | { tamam: false; hata: string; bekle?: number };

export async function pinDogrula(pin: string): Promise<AcSonuc> {
  const depo = anahtarDeposu();
  const r = await depo.kilit.get('cihaz');
  if (!r) return { tamam: true };
  const simdi = Date.now();
  if (r.bekleBitis > simdi) return { tamam: false, hata: 'Çok fazla yanlış deneme.', bekle: r.bekleBitis - simdi };
  const k = await pinAnahtari(pin, r.tuz);
  try {
    if (coz(k, r.dogrulama) !== DOGRULAMA_METNI) throw new Error();
  } catch {
    const deneme = r.deneme + 1;
    const bekle = deneme >= 5 ? 30_000 * 2 ** (deneme - 5) : 0;
    await depo.kilit.update('cihaz', { deneme, bekleBitis: simdi + bekle });
    return { tamam: false, hata: bekle ? `PIN yanlış. ${Math.round(bekle / 1000)} sn bekle.` : `PIN yanlış (${5 - deneme} deneme sonra bekleme başlar).`, bekle: bekle || undefined };
  }
  await depo.kilit.update('cihaz', { deneme: 0, bekleBitis: 0 });
  anahtar = k;
  haber();
  return { tamam: true };
}

// ———————————————— PIN kaydı (yeniden şifreleme lib/ozelAlan.ts'te) ————————————————

/** Yeni PIN'i kaydet ve anahtarı etkinleştir. Bundan sonraki yazımlar bu anahtarla şifrelenir. */
export async function pinKaydet(pin: string) {
  const tuz = b64(rastgele(16));
  const k = await pinAnahtari(pin, tuz);
  const kayit: KilitRow = { id: 'cihaz', tuz, dogrulama: sifrele(k, DOGRULAMA_METNI), deneme: 0, bekleBitis: 0 };
  await anahtarDeposu().kilit.put(kayit);
  anahtar = k;
  pinTanimli = true;
  durumYuklendi = true;
  haber();
}

/** Kilidi kaldır: bundan sonraki yazımlar şifresiz. */
export async function pinSil() {
  await anahtarDeposu().kilit.delete('cihaz');
  anahtar = null;
  pinTanimli = false;
  haber();
}

// ———————————————— Dexie katmanı ————————————————

function cursorSar(c: DBCoreCursor, ac: (v: unknown) => unknown): DBCoreCursor {
  return Object.create(c, { value: { get: () => ac(c.value) } });
}

export const kilitKatmani: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'ritos-ozel-alan-kilidi',
  create(asagi) {
    return {
      ...asagi,
      table(ad: string): DBCoreTable {
        const t = asagi.table(ad);
        if (!SIFRELI_TABLOLAR.has(ad)) return t;
        const alanlar = [t.schema.primaryKey.keyPath, ...t.schema.indexes.map((i) => i.keyPath)]
          .flat().filter((x): x is string => typeof x === 'string' && x.length > 0);

        const kapat = (v: Record<string, unknown>) => {
          if (!anahtar) {
            if (pinTanimli || !durumYuklendi) throw new Error('Özel alan kilitli.');
            return v;
          }
          const o: Record<string, unknown> = {};
          for (const a of alanlar) if (v[a] !== undefined) o[a] = v[a];
          o.__s = sifrele(anahtar, v);
          return o;
        };
        const ac = (v: unknown) => {
          if (!v || typeof v !== 'object' || !('__s' in v)) return v;
          if (!anahtar) throw new Error('Özel alan kilitli.');
          return coz(anahtar, (v as { __s: string }).__s);
        };

        return {
          ...t,
          mutate: (req) => (req.type === 'add' || req.type === 'put')
            ? t.mutate({ ...req, values: req.values.map((v) => kapat(v as Record<string, unknown>)) })
            : t.mutate(req),
          get: (req) => t.get(req).then(ac),
          getMany: (req) => t.getMany(req).then((a) => a.map(ac)),
          query: (req) => t.query(req).then((r) => (req.values ? { ...r, result: r.result.map(ac) } : r)),
          openCursor: (req) => t.openCursor(req).then((c) => (c && req.values ? cursorSar(c, ac) : c)),
        };
      },
    };
  },
};

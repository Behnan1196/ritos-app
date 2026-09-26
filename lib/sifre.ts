'use client';

// ————————————————————————————————————————————————————————————————
// Uçtan uca şifreleme (V4, 26 eylül). Tamamı tarayıcının WebCrypto'suyla, cihazda.
//
//  • Veri anahtarı (DEK): rastgele AES-GCM 256. Bütün satırlar bununla şifrelenir.
//  • DEK sunucuda iki kez "sarılı" durur: şifreden türetilen anahtarla ve kurtarma
//    kelimelerinden türetilen anahtarla. Sunucu ikisini de açamaz.
//  • Supabase'e giden giriş şifresi, kullanıcının şifresinin kendisi değil ondan türetilmiş
//    ayrı bir değerdir — böylece sunucu gerçek şifreyi hiç görmez, DEK'i de türetemez.
// ————————————————————————————————————————————————————————————————

import { KELIMELER } from './kelimeler';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function b64Coz(s: string) {
  const bin = atob(s);
  const b = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
export function rastgele(n: number) {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

async function pbkdf2Anahtar(parola: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(parola.normalize('NFKC')), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
}

/** Supabase'e gönderilen giriş şifresi (gerçek şifre sunucuya gitmez). */
export async function girisSifresi(sifre: string, eposta: string): Promise<string> {
  const k = await pbkdf2Anahtar(sifre);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`ritos-giris|${eposta.trim().toLowerCase()}`), iterations: 200_000 }, k, 256);
  return Array.from(new Uint8Array(bits), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Şifreden (ya da kurtarma kelimelerinden) DEK'i sarıp açan anahtar. */
export async function sarmaAnahtari(parola: string, tuzB64: string, tur: 'sifre' | 'kurtarma' = 'sifre'): Promise<CryptoKey> {
  const k = await pbkdf2Anahtar(parola);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64Coz(tuzB64), iterations: tur === 'sifre' ? 600_000 : 150_000 },
    k, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export async function dekUret(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function sar(dek: CryptoKey, sarici: CryptoKey): Promise<string> {
  const iv = rastgele(12);
  const ct = await crypto.subtle.wrapKey('raw', dek, sarici, { name: 'AES-GCM', iv });
  return b64(iv) + '.' + b64(ct);
}

/** Sarılı DEK'i aç. Yanlış şifrede hata fırlatır. */
export async function sarimiAc(sarili: string, sarici: CryptoKey, disaAktarilabilir = false): Promise<CryptoKey> {
  const [iv, ct] = sarili.split('.');
  return crypto.subtle.unwrapKey('raw', b64Coz(ct), sarici, { name: 'AES-GCM', iv: b64Coz(iv) },
    { name: 'AES-GCM', length: 256 }, disaAktarilabilir, ['encrypt', 'decrypt']);
}

export async function sifrele(dek: CryptoKey, veri: unknown): Promise<string> {
  const iv = rastgele(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(veri)));
  return b64(iv) + '.' + b64(ct);
}

export async function coz<T = unknown>(dek: CryptoKey, s: string): Promise<T> {
  const [iv, ct] = s.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Coz(iv) }, dek, b64Coz(ct));
  return JSON.parse(dec.decode(pt)) as T;
}

// ———————————————— kurtarma kelimeleri (S6) ————————————————

export function kurtarmaUret(): string[] {
  return Array.from(rastgele(12), (x) => KELIMELER[x]);
}

/** Kullanıcının yazdığını normalize et: fazla boşluk, büyük harf, numaralar temizlenir. */
export function kurtarmaNormalize(metin: string): string | null {
  const kelimeler = metin.toLocaleLowerCase('tr').replace(/[0-9.,;:\-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (kelimeler.length !== 12 || kelimeler.some((k) => !KELIMELER.includes(k))) return null;
  return kelimeler.join(' ');
}

// ———————————————— yedek dosyası (S1) ————————————————

export async function parolaylaSifrele(veri: unknown, parola: string): Promise<string> {
  const tuz = rastgele(16);
  const k = await pbkdf2Anahtar(parola);
  const anahtar = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: tuz, iterations: 600_000 },
    k, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = rastgele(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, anahtar, enc.encode(JSON.stringify(veri)));
  return JSON.stringify({ ritos_yedek: 1, tuz: b64(tuz), iv: b64(iv), veri: b64(ct) });
}

export async function parolaylaCoz<T = unknown>(dosya: string, parola: string): Promise<T> {
  const d = JSON.parse(dosya) as { ritos_yedek: number; tuz: string; iv: string; veri: string };
  if (d.ritos_yedek !== 1) throw new Error('Tanınmayan yedek dosyası');
  const k = await pbkdf2Anahtar(parola);
  const anahtar = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64Coz(d.tuz), iterations: 600_000 },
    k, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Coz(d.iv) }, anahtar, b64Coz(d.veri));
  return JSON.parse(dec.decode(pt)) as T;
}

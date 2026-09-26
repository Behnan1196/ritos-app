'use client';

// ————————————————————————————————————————————————————————————————
// Danışmanlık anahtarları (D2, 26 eylül).
//
// Her hesabın bir ECDH (P-256) anahtar çifti var. Açık anahtar sunucuda, ilişkideki karşı
// taraf okuyabilir; özel anahtar hesabın veri anahtarıyla (DEK) şifreli durur — yani yalnız
// o hesabın cihazları açabilir. İki taraf kendi özel + karşının açık anahtarından AYNI
// ilişki anahtarını türetir (ECDH → HKDF, tuz = ilişki kimliği). Sunucu bu anahtarı hiç görmez.
// ————————————————————————————————————————————————————————————————

import { coz, sifrele } from './sifre';

const EC = { name: 'ECDH', namedCurve: 'P-256' } as const;
const enc = new TextEncoder();

export interface AnahtarCifti { ozel: CryptoKey; acik: string /* JWK metni */ }

export async function ciftUret(): Promise<{ cift: AnahtarCifti; ozelJwk: JsonWebKey }> {
  const k = await crypto.subtle.generateKey(EC, true, ['deriveBits']);
  const ozelJwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  const acikJwk = await crypto.subtle.exportKey('jwk', k.publicKey);
  const ozel = await crypto.subtle.importKey('jwk', ozelJwk, EC, false, ['deriveBits']);
  return { cift: { ozel, acik: JSON.stringify(acikJwk) }, ozelJwk };
}

export async function ozelSifrele(dek: CryptoKey, ozelJwk: JsonWebKey): Promise<string> {
  return sifrele(dek, ozelJwk);
}

export async function ciftAc(dek: CryptoKey, ozelSifreli: string, acik: string): Promise<AnahtarCifti> {
  const jwk = await coz<JsonWebKey>(dek, ozelSifreli);
  const ozel = await crypto.subtle.importKey('jwk', jwk, EC, false, ['deriveBits']);
  return { ozel, acik };
}

/** İki tarafın aynı sonucu bulduğu ilişki anahtarı (AES-GCM 256). */
export async function iliskiAnahtariTuret(ozel: CryptoKey, karsiAcik: string, iliskiId: string): Promise<CryptoKey> {
  const acik = await crypto.subtle.importKey('jwk', JSON.parse(karsiAcik), EC, false, []);
  const bitler = await crypto.subtle.deriveBits({ name: 'ECDH', public: acik }, ozel, 256);
  const hkdf = await crypto.subtle.importKey('raw', bitler, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(iliskiId), info: enc.encode('ritos-iliski-v1') },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

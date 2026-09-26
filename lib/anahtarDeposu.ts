'use client';

// Açılmış veri anahtarı (DEK) cihazda, dışa aktarılamaz bir CryptoKey olarak saklanır —
// her açılışta şifre sormamak için. Anahtarın ham baytları JavaScript'e bile çıkamaz.

import Dexie, { type EntityTable } from 'dexie';

interface AnahtarRow { uid: string; dek: CryptoKey }

class AnahtarDB extends Dexie {
  anahtar!: EntityTable<AnahtarRow, 'uid'>;
  constructor() {
    super('ritos-anahtar');
    this.version(1).stores({ anahtar: 'uid' });
  }
}

let adb: AnahtarDB | null = null;
const depo = () => (adb ??= new AnahtarDB());

export async function dekSakla(uid: string, dek: CryptoKey) {
  // Dışa aktarılabilir geldiyse dışa aktarılamaz bir kopyaya çevir.
  if (dek.extractable) {
    const ham = await crypto.subtle.exportKey('raw', dek);
    dek = await crypto.subtle.importKey('raw', ham, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  await depo().anahtar.put({ uid, dek });
}

export async function dekGetir(uid: string): Promise<CryptoKey | null> {
  return (await depo().anahtar.get(uid))?.dek ?? null;
}

export async function dekSil(uid: string) {
  await depo().anahtar.delete(uid);
}

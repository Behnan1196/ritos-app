'use client';

// Cihazdaki küçük anahtar deposu (uygulama veritabanlarından ayrı):
//  • anahtar: hesabın açılmış veri anahtarı (DEK), dışa aktarılamaz CryptoKey — her açılışta şifre sormamak için
//  • kilit:   cihaz PIN'inin doğrulama bilgisi ve yanlış deneme sayacı (PIN'in kendisi saklanmaz)

import Dexie, { type EntityTable } from 'dexie';

interface AnahtarRow { uid: string; dek: CryptoKey }
export interface KilitRow { id: 'cihaz'; tuz: string; dogrulama: string; deneme: number; bekleBitis: number }

class AnahtarDB extends Dexie {
  anahtar!: EntityTable<AnahtarRow, 'uid'>;
  kilit!: EntityTable<KilitRow, 'id'>;
  constructor() {
    super('ritos-anahtar');
    this.version(1).stores({ anahtar: 'uid' });
    this.version(2).stores({ anahtar: 'uid', kilit: 'id' });
  }
}

let adb: AnahtarDB | null = null;
export const anahtarDeposu = () => (adb ??= new AnahtarDB());

export async function dekSakla(uid: string, dek: CryptoKey) {
  // Dışa aktarılabilir geldiyse dışa aktarılamaz bir kopyaya çevir.
  if (dek.extractable) {
    const ham = await crypto.subtle.exportKey('raw', dek);
    dek = await crypto.subtle.importKey('raw', ham, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  await anahtarDeposu().anahtar.put({ uid, dek });
}

export async function dekGetir(uid: string): Promise<CryptoKey | null> {
  return (await anahtarDeposu().anahtar.get(uid))?.dek ?? null;
}

export async function dekSil(uid: string) {
  await anahtarDeposu().anahtar.delete(uid);
}

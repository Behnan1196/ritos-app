'use client';

// Özel alanın PIN işlemleri: satırlar okunur (mevcut anahtarla / şifresiz), anahtar değişir,
// aynı satırlar yeni anahtarla (ya da şifresiz) geri yazılır.

import { SENKRON_TABLOLARI, misafirDb, type RitosDB } from './db';
import { kilitAcik, pinDogrula, pinKaydet, pinSil, pinVar } from './kilit';

async function oku(m: RitosDB) {
  const veri: Record<string, unknown[]> = {};
  for (const t of SENKRON_TABLOLARI) veri[t] = await m.table(t).toArray();
  return veri;
}
async function yaz(m: RitosDB, veri: Record<string, unknown[]>) {
  await m.transaction('rw', SENKRON_TABLOLARI.map((t) => m.table(t)), async () => {
    for (const t of SENKRON_TABLOLARI) if (veri[t].length) await m.table(t).bulkPut(veri[t]);
  });
}

export async function pinKoy(pin: string) {
  if (pinVar() && !kilitAcik()) throw new Error('Önce kilidi aç.');
  const m = misafirDb();
  const veri = await oku(m);
  await pinKaydet(pin);
  await yaz(m, veri);
}

export async function pinDegistir(eski: string, yeni: string) {
  const r = await pinDogrula(eski);
  if (!r.tamam) throw new Error(r.hata);
  await pinKoy(yeni);
}

export async function pinKaldir(pin: string) {
  const r = await pinDogrula(pin);
  if (!r.tamam) throw new Error(r.hata);
  const m = misafirDb();
  const veri = await oku(m);
  await pinSil();
  await yaz(m, veri);
}

/** PIN unutuldu: özel alan açılamaz. Onu silip kilidi kaldır (hesaplardaki veri etkilenmez). */
export async function pinUnuttumOzelAlaniSil() {
  const m = misafirDb();
  for (const t of SENKRON_TABLOLARI) await m.table(t).clear();
  await pinSil();
}

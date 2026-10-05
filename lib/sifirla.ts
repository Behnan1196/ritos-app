// ————————————————————————————————————————————————————————————————
// Verileri sıfırla / hesabı sil (5 ekim).
// Veriler uçtan uca şifreli olduğu için temizlik sunucuda değil, cihazda yapılır: yerel satırlar
// silinir, senkron kancası her silmeyi "bekleyen"e yazar, silme bilgisi hesabın diğer cihazlarına
// ve sunucuya gider (sunucu içeriği okumadan satırı siler).
// ————————————————————————————————————————————————————————————————

import Dexie from 'dexie';
import { aktifHesap, aktifHesapAyarla, db, dbAdi } from './db';
import { supabase } from './supabase';
import { dekSil } from './anahtarDeposu';
import { senkronDurdur, senkronla } from './senkron';
import { aileAktifMi, aileAyril, sonlandir } from './danismanlik';

export interface SifirlaSecim {
  ajanda: boolean;      // kendi kartlarım, işaretlerim, ölçümlerim, dış uygulama kartları
  programlar: boolean;  // kişisel programlar ve hafta şablonları (kartlarıyla)
  kutuphane: boolean;   // kütüphane, klasörler, notlar, bağlantı widget'ları
  baglar: boolean;      // danışmanlık, koçluk ve aile bağlarını bitir; onlardan gelen her şey
}

const sil = async (tablo: Dexie.Table, idler: unknown[]) => { if (idler.length) await tablo.bulkDelete(idler as never[]); return idler.length; };

export async function verileriSifirla(s: SifirlaSecim): Promise<number> {
  const uid = aktifHesap();
  let n = 0;
  const kartlar = await db.ajanda_kart.toArray();
  const programlar = await db.program.toArray();
  const silinecekKart = new Set<string>();
  const silinecekProgram = new Set<string>();

  if (s.baglar) {
    // Sunucuda bağları bitir (karşı taraf "sonlandı" görür), sonra yerel izleri sil.
    for (const il of await db.iliski.toArray()) {
      if (il.durum === 'aktif') { try { await sonlandir(il.id); } catch { /* çevrimdışı: hesap silinirse yine düşer */ } }
    }
    for (const a of await db.aile.toArray()) {
      if (aileAktifMi(a)) { try { await aileAyril(a.id); } catch { /* yoksay */ } }
    }
    for (const p of programlar) if (p.uzak) silinecekProgram.add(p.id);
    for (const k of kartlar) if (k.geri_bildirim === 'uzak' || k.kaynak_modul === 'danismanlik' || k.kaynak_modul === 'ortak') silinecekKart.add(k.id);
    n += await sil(db.gelen, await db.gelen.toCollection().primaryKeys());
    n += await sil(db.mesaj, await db.mesaj.toCollection().primaryKeys());
    n += await sil(db.konusma_okundu, await db.konusma_okundu.toCollection().primaryKeys());
    n += await sil(db.iliski_ayar, await db.iliski_ayar.toCollection().primaryKeys());
    await db.ortak_madde.clear(); await db.ortak_liste.clear(); // senkronlanmaz; aile kanalından türetilir
  }
  if (s.programlar) {
    for (const p of programlar) if (!p.uzak) silinecekProgram.add(p.id);
    for (const k of kartlar) if (k.kaynak_modul === 'program' && silinecekProgram.has((k.kaynak_ref ?? '').split('/')[0])) silinecekKart.add(k.id);
  }
  if (s.ajanda) {
    for (const k of kartlar) {
      const disaridan = k.geri_bildirim === 'uzak' || k.kaynak_modul === 'danismanlik' || k.kaynak_modul === 'ortak';
      if (!disaridan || s.baglar) silinecekKart.add(k.id);
    }
    n += await sil(db.olcum, await db.olcum.toCollection().primaryKeys());
  }
  if (s.kutuphane) {
    n += await sil(db.kutuphane_kart, await db.kutuphane_kart.toCollection().primaryKeys());
    n += await sil(db.klasor, await db.klasor.toCollection().primaryKeys());
    n += await sil(db.not, await db.not.toCollection().primaryKeys());
    n += await sil(db.baglanti, await db.baglanti.toCollection().primaryKeys());
  }

  // Kartlar: işaretleri ve geri bildirimleriyle birlikte.
  if (silinecekKart.size) {
    const idler = Array.from(silinecekKart);
    n += await sil(db.ajanda_kayit, await db.ajanda_kayit.where('kart_id').anyOf(idler).primaryKeys());
    n += await sil(db.geri_bildirim, await db.geri_bildirim.where('kart_id').anyOf(idler).primaryKeys());
    n += await sil(db.ajanda_kart, idler);
  }
  if (silinecekProgram.size) {
    const idler = Array.from(silinecekProgram);
    n += await sil(db.program_adim, await db.program_adim.where('program_id').anyOf(idler).primaryKeys());
    n += await sil(db.program, idler);
    // Koç tarafında: danışanlardan gelen geri bildirimler (kaynak_ref = program/adım).
    const gb = (await db.geri_bildirim.toArray()).filter((g) => silinecekProgram.has((g.kaynak_ref ?? '').split('/')[0]));
    n += await sil(db.geri_bildirim, gb.map((g) => g.id));
  }
  if (uid) { try { await senkronla(); } catch { /* sonra gider */ } }
  return n;
}

/** Hesabı sil: sunucuda kullanıcı silinir (tüm satırları zincirleme gider), cihaz temizlenir. */
export async function hesabimiSil(): Promise<void> {
  const sb = supabase();
  const uid = aktifHesap();
  if (!sb || !uid) throw new Error('Hesap açık değil.');
  // Bağları önce bitir: karşı taraf "sonlandı" görür (hesap silinince satırlar zaten kalkar).
  for (const il of await db.iliski.toArray()) if (il.durum === 'aktif') { try { await sonlandir(il.id); } catch { /* yoksay */ } }
  const { error } = await sb.rpc('cat_hesabimi_sil');
  if (error) throw new Error(error.message.includes('cat_hesabimi_sil') ? 'Sunucuda hesap silme işlevi kurulu değil (supabase/cat-13-hesap-sil.sql).' : error.message);
  senkronDurdur();
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  await dekSil(uid);
  db.close();
  await Dexie.delete(dbAdi(uid));
  aktifHesapAyarla(null);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('ritos-')) localStorage.removeItem(k); } catch { /* yoksay */ }
  location.reload();
}

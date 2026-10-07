'use client';

// ————————————————————————————————————————————————————————————————
// Eşitleme motoru (S4, S7; 7 ekim — v1 şema: şifreleme kalktı). Yalnızca hesaplı veritabanında çalışır.
//
//  gönder: "bekleyen" tablosundaki her satırın güncel halini `kayit` tablosuna düz JSON olarak yaz
//  çek:    `kayit`ta son gördüğüm sıradan sonrasını al, yerel tabloya uygula
//  çakışma: aynı satır yerelde daha yeni değiştiyse (bekleyen.zaman > uzak.guncellendi) yerel kazanır
// ————————————————————————————————————————————————————————————————

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SENKRON_TABLOLARI, db, degisiklikDinle, type SenkronTablo } from './db';
import { supabase } from './supabase';

// Danışmanlık motoru senkronla birlikte çalışır (lib/danismanlik.ts doldurur).
// 7 ekim: v1 şemada danışmanlık tablolarla yeniden kurulana kadar kancalar çağrılmaz (DANISMANLIK_ACIK).
const DANISMANLIK_ACIK = true; // 7 ekim: v1 köprüsü (04-danismanlik.sql) ile açık
export const senkronKancalari: {
  basla?: (uid: string) => void;
  tur?: () => Promise<void>;
  dur?: () => void;
} = {};

const SIRA = 'senkron_sira';
const SON = 'senkron_son';

export interface SenkronDurum {
  etkin: boolean;
  calisiyor: boolean;
  son: number | null;
  bekleyen: number;
  hata: string | null;
  ilkIndirme: boolean;
}

let durum: SenkronDurum = { etkin: false, calisiyor: false, son: null, bekleyen: 0, hata: null, ilkIndirme: false };
const dinleyiciler = new Set<(d: SenkronDurum) => void>();
function guncelle(p: Partial<SenkronDurum>) {
  durum = { ...durum, ...p };
  dinleyiciler.forEach((f) => f(durum));
}

export function useSenkronDurum(): SenkronDurum {
  const [d, setD] = useState(durum);
  useEffect(() => { dinleyiciler.add(setD); setD(durum); return () => { dinleyiciler.delete(setD); }; }, []);
  return d;
}

let uid: string | null = null;
let kanal: RealtimeChannel | null = null;
let aralik: ReturnType<typeof setInterval> | null = null;
let gecikme: ReturnType<typeof setTimeout> | null = null;
let tur: Promise<void> | null = null;
let tekrar = false;

// Geliştirmede React (StrictMode) efektleri iki kez çalıştırır: başlat → durdur → başlat.
// Bu yüzden başlatma yeniden girilebilir olmalı: her başlatmanın bir nesil numarası var,
// eski nesil yarıda kalırsa kendini iptal eder; kanal adı her seferinde benzersiz.
let nesil = 0;
const odak = () => zamanla(0);
const gorunur = () => { if (document.visibilityState === 'visible') zamanla(0); };

export async function senkronBaslat(kullanici: string) {
  senkronDurdur();
  const benim = ++nesil;
  uid = kullanici;
  const son = (await db.ayar.get(SON))?.deger as number | undefined;
  const sira = (await db.ayar.get(SIRA))?.deger as number | undefined;
  if (benim !== nesil) return; // bu arada durduruldu
  guncelle({ etkin: true, son: son ?? null, ilkIndirme: !sira });
  degisiklikDinle(() => zamanla(1500));
  const sb = supabase();
  if (sb) {
    kanal = sb.channel(`kayit-${kullanici}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kayit', filter: `sahip=eq.${kullanici}` }, () => zamanla(300))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mesaj', filter: `alici=eq.${kullanici}` }, () => zamanla(300))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'iliski' }, () => zamanla(300))
      .subscribe();
  }
  if (DANISMANLIK_ACIK) senkronKancalari.basla?.(kullanici);
  window.addEventListener('focus', odak);
  window.addEventListener('online', odak);
  // 7 ekim: değişiklikler Realtime ile anında gelir; aralıklı tur yalnız yedek (kaçan bildirim, e-posta davetleri).
  aralik = setInterval(() => { if (document.visibilityState === 'visible') zamanla(0); }, 3 * 60_000);
  document.addEventListener('visibilitychange', gorunur);
  await senkronla();
}

export function senkronDurdur() {
  nesil++;
  if (DANISMANLIK_ACIK) senkronKancalari.dur?.();
  degisiklikDinle(null);
  if (kanal) supabase()?.removeChannel(kanal);
  kanal = null;
  if (aralik) clearInterval(aralik);
  aralik = null;
  if (gecikme) clearTimeout(gecikme);
  gecikme = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', odak);
    window.removeEventListener('online', odak);
    document.removeEventListener('visibilitychange', gorunur);
  }
  uid = null;
  guncelle({ etkin: false });
}

function zamanla(ms: number) {
  if (gecikme) clearTimeout(gecikme);
  gecikme = setTimeout(() => { gecikme = null; senkronla(); }, ms);
}

/** Bir tur gönder + çek. Aynı anda tek tur; o sırada istek gelirse bittiğinde bir tur daha. */
export async function senkronla(): Promise<void> {
  if (!uid) return;
  if (tur) { tekrar = true; return tur; }
  tur = (async () => {
    guncelle({ calisiyor: true });
    try {
      if (!navigator.onLine) throw new Error('İnternet yok — değişiklikler cihazda bekliyor.');
      await gonder();
      await cek();
      // Danışmanlık: önce kendi verim güncellensin, sonra mesajlar (başka cihazda alınmış program tekrar gelmesin).
      if (DANISMANLIK_ACIK && senkronKancalari.tur) await senkronKancalari.tur().catch((e) => console.warn('[ritos] danışmanlık', e));
      const son = Date.now();
      await db.ayar.put({ anahtar: SON, deger: son });
      guncelle({ son, hata: null, ilkIndirme: false });
    } catch (e) {
      guncelle({ hata: e instanceof Error ? e.message : String(e) });
    } finally {
      guncelle({ calisiyor: false, bekleyen: await db.bekleyen.count() });
      tur = null;
      if (tekrar) { tekrar = false; zamanla(0); }
    }
  })();
  return tur;
}

/** Çıkıştan önce: bekleyen her değişiklik gönderilene kadar tur at. O an süren bir tur varsa onu bekler,
 *  ardından kendi turunu çalıştırır (süren tur yeni eklenen kartı almamış olabilir). Kalan sayıyı döner. */
export async function bekleyenleriGonder(): Promise<number> {
  await new Promise((r) => setTimeout(r, 50)); // db.isaretle'nin ertelenmiş yazması bitsin
  for (let i = 0; i < 4; i++) {
    if (tur) await tur.catch(() => {});
    if (gecikme) { clearTimeout(gecikme); gecikme = null; }
    tekrar = false;
    if (!(await db.bekleyen.count())) return 0;
    if (!uid || !navigator.onLine) break;
    await senkronla();
  }
  return db.bekleyen.count();
}

async function gonder() {
  const sb = supabase()!;
  for (;;) {
    const parti = await db.bekleyen.orderBy('zaman').limit(100).toArray();
    if (!parti.length) return;
    const satirlar = await Promise.all(parti.map(async (b) => {
      const r = await db.table(b.tablo).get(b.id);
      return { sahip: uid!, tablo: b.tablo, kayit_id: b.id, veri: r ?? null, silindi: !r, guncellendi: b.zaman };
    }));
    const { error } = await sb.from('kayit').upsert(satirlar, { onConflict: 'sahip,tablo,kayit_id' });
    if (error) throw new Error(`Gönderilemedi: ${error.message}`);
    // Gönderirken yeniden değişen satır bekleyende kalsın.
    await db.transaction('rw', db.bekleyen, async () => {
      for (const b of parti) {
        const simdi = await db.bekleyen.get(b.anahtar);
        if (simdi && simdi.zaman === b.zaman) await db.bekleyen.delete(b.anahtar);
      }
    });
    guncelle({ bekleyen: await db.bekleyen.count() });
  }
}

interface UzakSatir { tablo: string; kayit_id: string; veri: unknown | null; silindi: boolean; guncellendi: number; sira: number }

async function cek() {
  const sb = supabase()!;
  let sira = ((await db.ayar.get(SIRA))?.deger as number | undefined) ?? 0;
  for (;;) {
    const { data, error } = await sb.from('kayit')
      .select('tablo, kayit_id, veri, silindi, guncellendi, sira')
      .eq('sahip', uid!).gt('sira', sira).order('sira').limit(500);
    if (error) throw new Error(`Alınamadı: ${error.message}`);
    const satirlar = (data ?? []) as UzakSatir[];
    if (!satirlar.length) return;

    const uygulanacak: { tablo: SenkronTablo; id: string; satir: unknown | null }[] = [];
    for (const u of satirlar) {
      if (!(SENKRON_TABLOLARI as readonly string[]).includes(u.tablo)) continue;
      const yerel = await db.bekleyen.get(`${u.tablo}|${u.kayit_id}`);
      if (yerel && yerel.zaman > Number(u.guncellendi)) continue; // yerel daha yeni — gönderilecek
      uygulanacak.push({ tablo: u.tablo as SenkronTablo, id: u.kayit_id, satir: u.silindi || !u.veri ? null : u.veri });
    }
    const tablolar = SENKRON_TABLOLARI.map((t) => db.table(t));
    db.uzaktan = true;
    try {
      await db.transaction('rw', [...tablolar, db.ayar], async () => {
        for (const x of uygulanacak) {
          if (x.satir) await db.table(x.tablo).put(x.satir);
          else await db.table(x.tablo).delete(x.id);
        }
        sira = Number(satirlar[satirlar.length - 1].sira);
        await db.ayar.put({ anahtar: SIRA, deger: sira });
      });
    } finally {
      db.uzaktan = false;
    }
    if (satirlar.length < 500) return;
  }
}

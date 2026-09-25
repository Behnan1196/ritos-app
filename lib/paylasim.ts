'use client';

// ————————————————————————————————————————————————————————————————
// Paylaşım + Gelenler (P1–P7, P10). Teslimat protokolünün "kopya" yolu:
// gönderen bir paylaşım paketi bırakır; alıcının cihazı indirince sunucudaki kopya
// silinir, paket Gelenler'de cihazda durur; "Al" deyince bağımsız bir yerel karta /
// programa dönüşür. Geri bildirim yok. Paket yalnızca tanımı taşır — yapıldı geçmişi,
// girilen değerler ve değerlendirme gitmez.
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type GelenRow, type ProgramAdimRow } from './db';
import { supabase } from './supabase';
import { teslimAl } from './ajanda';
import { adimEkle, programGuncelle } from './program';
import { PAKET_SURUM, TAM_IZIN, gunFarki, tarihEkle, type Blok, type TemelTip } from './paket';

type AdimTanim = Omit<ProgramAdimRow, 'id' | 'program_id' | 'sira' | 'guncellendi'>;

export interface PaylasimPaketi {
  surum: typeof PAKET_SURUM;
  tur: 'kart' | 'program';
  ad: string;
  kart?: { tip: TemelTip; bloklar: Blok[]; gun_sayisi: number | null; gunler: number[] | null; saatler: string[] };
  program?: { amac: string; dikkat: string; kriterler: string[]; hedef: string; adimlar: AdimTanim[] };
}

// ———————————————— paket üretimi ————————————————

export function kartPaketi(k: AjandaKartRow): PaylasimPaketi {
  return {
    surum: PAKET_SURUM,
    tur: 'kart',
    ad: k.ad,
    kart: {
      tip: k.tip,
      bloklar: k.bloklar,
      gun_sayisi: k.bitis === null ? null : gunFarki(k.baslangic, k.bitis) + 1,
      gunler: k.gunler,
      saatler: k.saatler,
    },
  };
}

export async function programPaketi(programId: string): Promise<PaylasimPaketi | null> {
  const p = await db.program.get(programId);
  if (!p) return null;
  const adimlar = await db.program_adim.where('program_id').equals(programId).sortBy('sira');
  return {
    surum: PAKET_SURUM,
    tur: 'program',
    ad: p.ad,
    program: {
      amac: p.amac, dikkat: p.dikkat, kriterler: p.kriterler, hedef: p.hedef,
      adimlar: adimlar.map(({ tip, ad, bloklar, basla_gun, sure_gun, gunler, saatler }) => ({ tip, ad, bloklar, basla_gun, sure_gun, gunler, saatler })),
    },
  };
}

// ———————————————— gönderme ————————————————

export async function kisiBul(eposta: string): Promise<{ id: string; gorunen_ad: string } | null> {
  const sb = supabase();
  if (!sb) return null;
  const r = await sb.rpc('cat_kisi_bul', { p_eposta: eposta });
  const satir = (r.data as { id: string; gorunen_ad: string }[] | null)?.[0];
  if (!satir) return null;
  await db.kisi.put({ id: satir.id, gorunen_ad: satir.gorunen_ad, son: Date.now() });
  return satir;
}

export async function gonder(paket: PaylasimPaketi, aliciIdler: string[], kaynak: 'dogrudan' | 'sohbet' = 'dogrudan') {
  const sb = supabase();
  if (!sb) return { basarili: 0, hata: 'Sunucu ayarı yok' };
  let basarili = 0;
  for (const id of aliciIdler) {
    const r = await sb.rpc('cat_gonder', { p_alici: id, p_kaynak: kaynak, p_paket: paket });
    if (!r.error) {
      basarili++;
      await db.kisi.update(id, { son: Date.now() });
    }
  }
  return { basarili, hata: basarili < aliciIdler.length ? 'Bazı gönderimler başarısız' : null };
}

// ———————————————— alma tarafı ————————————————

// Sunucudaki bekleyen paketleri cihaza indir, indirilenleri sunucudan sil (P6).
export async function gelenleriCek(): Promise<number> {
  const sb = supabase();
  if (!sb || !navigator.onLine) return 0;
  const { data: oturum } = await sb.auth.getSession();
  if (!oturum.session) return 0;
  const r = await sb.from('cat_gelen').select('*').eq('alici_id', oturum.session.user.id).order('olusturuldu');
  if (r.error || !r.data?.length) return 0;
  const satirlar: GelenRow[] = r.data.map((g) => ({
    id: g.id,
    gonderen_id: g.gonderen_id,
    gonderen_ad: g.gonderen_ad,
    kaynak: g.kaynak,
    paket: g.paket,
    gelis: new Date(g.olusturuldu).getTime(),
    alindi: null,
    boyut: JSON.stringify(g.paket).length,
  }));
  await db.transaction('rw', db.gelen, db.kisi, async () => {
    for (const g of satirlar) {
      if (!(await db.gelen.get(g.id))) await db.gelen.add(g);
      const k = await db.kisi.get(g.gonderen_id);
      await db.kisi.put({ id: g.gonderen_id, gorunen_ad: g.gonderen_ad, son: Math.max(k?.son ?? 0, g.gelis) });
    }
  });
  await sb.from('cat_gelen').delete().in('id', satirlar.map((g) => g.id));
  return satirlar.length;
}

// P5 — "Al": kart → Ajanda (seçilen tarihten), program → Kişisel Gelişim.
export async function al(gelenId: string, baslangic: string): Promise<{ tamam: boolean; mesaj: string }> {
  const g = await db.gelen.get(gelenId);
  if (!g) return { tamam: false, mesaj: 'Bulunamadı' };
  const p = g.paket as PaylasimPaketi;

  if (p.tur === 'kart' && p.kart) {
    await teslimAl([{
      surum: PAKET_SURUM,
      id: crypto.randomUUID(),
      tip: p.kart.tip === 'kaydet' || p.kart.tip === 'uygula' ? 'yap' : p.kart.tip, // veri üreten kart yalnız programda yaşar
      ad: p.ad,
      bloklar: p.kart.bloklar,
      zamanlama: {
        baslangic,
        bitis: p.kart.gun_sayisi === null ? null : tarihEkle(baslangic, p.kart.gun_sayisi - 1),
        gunler: p.kart.gunler,
        saatler: p.kart.saatler,
      },
      kaynak: { modul: 'gelenler', ref: g.id, etiket: null },
      sahip: 'ben',
      izinler: TAM_IZIN,
      geri_bildirim: 'yok',
    }]);
    await db.gelen.update(gelenId, { alindi: Date.now() });
    return { tamam: true, mesaj: "Ajanda'ya eklendi" };
  }

  if (p.tur === 'program' && p.program) {
    const mevcut = await db.program.toArray();
    let ad = p.ad;
    if (mevcut.some((x) => x.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) ad = `${p.ad} · ${g.gonderen_ad}`;
    const id = crypto.randomUUID();
    await db.program.add({
      id, ad, amac: p.program.amac, dikkat: p.program.dikkat, kriterler: p.program.kriterler, hedef: p.program.hedef,
      klasor_id: null, home_goster: false, degerlendirme_acik: false, degerlendirme: null,
      calisma_baslangic: null, calisma_bitis: null, guncellendi: Date.now(),
    });
    for (const a of p.program.adimlar) await adimEkle(id, a);
    await programGuncelle(id, {});
    await db.gelen.update(gelenId, { alindi: Date.now() });
    return { tamam: true, mesaj: ad === p.ad ? "Kişisel Gelişim'e eklendi" : `Aynı adda program vardı — "${ad}" olarak eklendi` };
  }
  return { tamam: false, mesaj: 'Tanınmayan paket' };
}

export async function gelenSil(ids: string[]) {
  await db.gelen.bulkDelete(ids);
}

// P10 — göndereni engelle (sunucuda; sonraki gönderimleri sessizce düşer).
export async function engelle(gonderenId: string, gorunenAd: string) {
  const sb = supabase();
  const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
  if (!sb || !data.session) return false;
  const r = await sb.from('cat_engel').upsert({ engelleyen: data.session.user.id, engellenen: gonderenId, gorunen_ad: gorunenAd });
  return !r.error;
}

export async function engellenenler(): Promise<{ engellenen: string; gorunen_ad: string | null }[]> {
  const sb = supabase();
  if (!sb) return [];
  const r = await sb.from('cat_engel').select('engellenen, gorunen_ad');
  return r.data ?? [];
}

export async function engelKaldir(gonderenId: string) {
  await supabase()?.from('cat_engel').delete().eq('engellenen', gonderenId);
}

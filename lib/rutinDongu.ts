'use client';

// ————————————————————————————————————————————————————————————————
// Rutin yaşam döngüsü (5 ekim, 4. adım): Kuruluyor → Oturdu → (Kuruluyor'a dönüş) · Arşiv → Yeniden başlat.
//  • Oturdu / Arşiv: rutinin ajanda kartları yarından itibaren çekilir (geçmiş ve bugün yerinde kalır);
//    kartların kalıbı programda saklanır.
//  • Geri dönüş / yeniden başlat: kalıplar yarından (ya da bugünden — bugün kartı yoksa) yeniden kurulur.
//  • Öneri: son 8 tamamlanmış haftanın hepsinde planlananların en az %80'i yapıldıysa "alışkanlık oldu mu?".
// ————————————————————————————————————————————————————————————————

import { db, type AjandaKartRow, type ProgramRow } from './db';
import { bugun, tarihEkle } from './paket';
import { gorunur, kaynaktanCek } from './ajanda';
import { haftaBasi } from './denge';

export const rutinDurumu = (p: ProgramRow) => p.durum ?? 'kuruluyor';
const ONERI_HAFTA = 8;
const ONERI_ORAN = 0.8;
const RET_GUN = 28;

async function kartlariniCek(programId: string) {
  const yarin = tarihEkle(bugun(), 1);
  const kartlar = await db.ajanda_kart.where('kaynak_ref').startsWith(`${programId}/`).toArray();
  // Yarın ve sonrasında görünecek kartların kalıbı (tarih bilgisiyle).
  const kaliplar = kartlar
    .filter((k) => k.bitis === null || k.bitis >= yarin)
    .map(({ id: _id, guncellendi: _g, ...k }) => k);
  await kaynaktanCek(`${programId}/`, yarin);
  return kaliplar;
}

async function kaliplariKur(p: ProgramRow) {
  const t = bugun();
  const yarin = tarihEkle(t, 1);
  for (const k of p.kaliplar ?? []) {
    // Bugün hâlâ görünen bir kopyası varsa çakışmasın diye yarından başlat.
    const bas = k.baslangic > yarin ? k.baslangic : yarin;
    if (k.bitis !== null && k.bitis < bas) continue;
    const yeni: AjandaKartRow = { ...k, id: crypto.randomUUID(), baslangic: bas, atla: [], guncellendi: Date.now() };
    await db.ajanda_kart.add(yeni);
  }
}

export async function oturduIsaretle(programId: string) {
  const kaliplar = await kartlariniCek(programId);
  await db.program.update(programId, { durum: 'oturdu', durum_tarih: bugun(), kaliplar, guncellendi: Date.now() });
}

export async function arsivle(programId: string) {
  const p = await db.program.get(programId);
  const kaliplar = p && rutinDurumu(p) === 'oturdu' ? p.kaliplar ?? [] : await kartlariniCek(programId);
  await db.program.update(programId, { durum: 'arsiv', durum_tarih: bugun(), kaliplar, guncellendi: Date.now() });
}

/** Oturdu → Kuruluyor ya da Arşiv → yeniden başlat: kartlar yarından yeniden ajandaya gelir. */
export async function kuruluyoraDon(programId: string) {
  const p = await db.program.get(programId);
  if (!p) return;
  await kaliplariKur(p);
  await db.program.update(programId, { durum: 'kuruluyor', durum_tarih: bugun(), kaliplar: [], oneri_ret: undefined, guncellendi: Date.now() });
}

export async function oneriReddet(programId: string) {
  await db.program.update(programId, { oneri_ret: bugun(), guncellendi: Date.now() });
}

/** "Alışkanlık oldu mu?" adayları: kuruluyor, son 8 tamamlanmış haftanın her birinde planlananın ≥ %80'i yapılmış. */
export async function oneriAdaylari(): Promise<{ p: ProgramRow; hafta: number; oran: number }[]> {
  const t = bugun();
  const programlar = (await db.program.toArray()).filter((p) => !p.uzak && !p.sablon && rutinDurumu(p) === 'kuruluyor'
    && !(p.oneri_ret && p.oneri_ret > tarihEkle(t, -RET_GUN)));
  if (!programlar.length) return [];
  const buHafta = haftaBasi(t);
  const bas = tarihEkle(buHafta, -7 * ONERI_HAFTA);
  const sonuc: { p: ProgramRow; hafta: number; oran: number }[] = [];
  for (const p of programlar) {
    const kartlar = (await db.ajanda_kart.where('kaynak_ref').startsWith(`${p.id}/`).toArray()).filter((k) => k.tip !== 'oku');
    if (!kartlar.length) continue;
    const yapilan = new Set((await db.ajanda_kayit.where('tarih').between(bas, buHafta).toArray()).filter((r) => r.yapildi).map((r) => r.id));
    let iyiHafta = 0, plan = 0, yap = 0;
    for (let h = ONERI_HAFTA - 1; h >= 0; h--) {
      const hb = tarihEkle(buHafta, -7 * (h + 1));
      let hp = 0, hy = 0;
      for (let g = 0; g < 7; g++) {
        const gun = tarihEkle(hb, g);
        for (const k of kartlar) if (gorunur(k, gun)) { hp++; if (yapilan.has(`${k.id}|${gun}`)) hy++; }
      }
      plan += hp; yap += hy;
      if (hp > 0 && hy / hp >= ONERI_ORAN) iyiHafta++;
    }
    if (iyiHafta >= ONERI_HAFTA) sonuc.push({ p, hafta: iyiHafta, oran: plan ? yap / plan : 0 });
  }
  return sonuc;
}

// ———————————————— Ajandam'dan doğan rutin: "önce uygula, sonra kaydet" ————————————————
// Kendi eklediğin, en az 3 haftadır tekrar eden ve son 4 haftanın en az 3'ünde yapılan kart → öneri.
// Kaydedince: aynı ad/alan önerisiyle rutin kurulur, kart yarından rutinin kartı olarak sürer (eski kart bugün biter).

const RUTIN_ONERI_RET = 'rutin_oneri_ret';

export async function ajandadanRutinAdaylari(): Promise<{ kart: AjandaKartRow; hafta: number }[]> {
  const t = bugun();
  const ret = new Set(((await db.ayar.get(RUTIN_ONERI_RET))?.deger as string[] | undefined) ?? []);
  const bas = tarihEkle(haftaBasi(t), -21);
  const kartlar = (await db.ajanda_kart.where('kaynak_modul').equals('ajanda').toArray()).filter((k) =>
    !ret.has(k.id) && k.tip !== 'oku' && k.baslangic <= tarihEkle(t, -14) && (k.bitis === null || k.bitis > t)
    && (k.gunler !== null || k.bitis === null));
  if (!kartlar.length) return [];
  const kayit = (await db.ajanda_kayit.where('tarih').aboveOrEqual(bas).toArray()).filter((r) => r.yapildi);
  const sonuc: { kart: AjandaKartRow; hafta: number }[] = [];
  for (const k of kartlar) {
    const haftalar = new Set(kayit.filter((r) => r.kart_id === k.id).map((r) => haftaBasi(r.tarih)));
    if (haftalar.size >= 3) sonuc.push({ kart: k, hafta: haftalar.size });
  }
  return sonuc;
}

export async function rutinOnerisiReddet(kartId: string) {
  const ret = ((await db.ayar.get(RUTIN_ONERI_RET))?.deger as string[] | undefined) ?? [];
  await db.ayar.put({ anahtar: RUTIN_ONERI_RET, deger: [...ret, kartId] });
}

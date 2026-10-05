'use client';

// ————————————————————————————————————————————————————————————————
// Atölye (3 ekim) — kurduğun her şeyin hazırlandığı yer: danışanların, aile (verdiğin görevler),
// kişisel programların ve Kütüphane. Günüm yalnız kendi ajandandır; burada başkası ya da bir
// program için planlarsın.  [🗂 Planlar | 📚 Kütüphane]
//  • Telefonda hedefler üstte çip; geniş ekranda solda liste.
//  • Sekmeden çıkıp dönünce kaldığın yer korunur (hedef, alt sekme, tarih, görünüm) — oturum boyunca.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db, type AileRow, type IliskiAyarRow, type IliskiRow, type KlasorRow, type KutuphaneKartRow, type ProgramRow } from '@/lib/db';
import { bugun, degerBloklari, iyelik, tarihEkle, tarihEtiket, tarihParse } from '@/lib/paket';
import { aileAktifMi, aileAyril, aileDavet, aileGorevIliski, aileKur, benimAileRolum, kocOl, davetler, davetSil, haftaNotuGonder, iliskiBilgiYaz, type DavetSatir } from '@/lib/danismanlik';
import { GRUP_SINIR, GRUP_TUR, grupIkon, grupTuru, type GrupTur } from '@/lib/grup';
import { danisanGunleri, gonderimAyarla, haftaUygula, kocKartEkle, planDurumu, sablonKartlari, type HaftaKarti, type KocKarti } from '@/lib/danisanAjanda';
import { SURE_ANAHTAR } from './KartEditor';
import { disiplinAdi, useDanismanlik } from '@/lib/danismanlik';
import { useSeciliDanisan, type Kapsam } from '@/lib/seciliDanisan';
import type { PlanHedef } from '@/lib/danisanAjanda';
import { DanisanAjandasi, HaftaSablonlari, KocKartFormu, useHaftaSablonlari } from './DanisanAjanda';
import { DavetModal, SonlandirModal } from './Danismanlik';
import { SinavTool } from './Sinav';
import { AyTakvimi, haftaBasi, haftaEtiket } from './AjandaPane';
import { AlanEkleModal, DISIPLIN_IKON, danismanlikBaslik } from './DanismanlikEkrani';
import Kutuphane from './Kutuphane';
import { Modal, OnayKutusu } from './ortak';
import { IKON_SECENEKLERI, VARSAYILAN_IKON, ikonOner } from '@/lib/programIkon';
import { programGuncelle, programOlustur } from '@/lib/program';
import { AKTIVITE, HIZLAR, beklenenKilo, beslenmeHesap, kiloDurumu, vkiEtiket, type HedefTur } from '@/lib/beslenme';
import { HAZIR_OLCULER, OLC_ONEK, olcuBlok } from '@/lib/olcum';
import { koleksiyonlar } from '@/lib/kutuphane';
import { ALAN_IKONLARI, EN_FAZLA_GORUNEN, alanEkle as yAlanEkle, alanGuncelle, alanOner, alanSil, alanSirala, alanlar as yAlanlar, alanlariGaranti } from '@/lib/yasamAlani';
import type { YasamAlaniRow } from '@/lib/db';
import { AjandadanRutinOnerisi, AlanKarolari, AlanSayfasi, AliskanlikOnerisi, AySonu, DengeKarti } from './Rutinler';
import { arsivle, kuruluyoraDon, oturduIsaretle, rutinDurumu } from '@/lib/rutinDongu';
import { hazirKartlar, hazirSablonlariYenile, hazirSablonuAl, useHazirSablonlar, type HazirSablon } from '@/lib/hazirSablon';

// 4 ekim (v6): üstte Planlar/Kütüphane düğmeleri yok. Telefonda ekranlar yığın gibi: liste → (kişi | alan | kütüphane),
// her alt ekranın ilk satırı "‹ Geri  PLANLAR".
type Ekran = 'liste' | 'hedef' | 'alan' | 'kut' | 'grup' | 'yalan' | 'deg'; // grup: alan = grup id · yalan: yaşam alanı sayfası (alan = id) · deg: ay sonu değerlendirmesi
type Dosya = 'plan' | 'gelisim' | 'bilgi';   // telefonda kişi dosyasının sekmesi
type Sag = 'gelisim' | 'bilgi' | 'kut';       // geniş ekranda sağ bölme
type AlanSek = 'malzeme' | 'sablon' | 'ayar';
// 5 ekim: aynı bileşen iki sekmede — Çevrem (danışmanlık + gruplar) ve Rutinlerim (kendi rutinlerin + Kütüphane).
// Her kapsamın kendi gezinme durumu var (sekmeler arasında karışmaz).
type Durum = { ekran: Ekran; alan: string | null; tarih: string | null; hafta: boolean; dosya: Dosya; sag: Sag };
const yeniDurum = (): Durum => ({ ekran: 'liste', alan: null, tarih: null, hafta: true, dosya: 'plan', sag: 'gelisim' });
const DURUMLAR: Record<Kapsam, Durum> = { cevre: yeniDurum(), kendim: yeniDurum() };
const alanSekDurum: { sek: AlanSek } = { sek: 'malzeme' };
export const KAPSAM_AD: Record<Kapsam, string> = { cevre: 'ÇEVREM', kendim: 'RUTİNLERİM' };
// Başka ekrandan "planla" (hedef önceden seçili): liste atlanır. Sekme henüz açık değilken de yakalanır.
if (typeof window !== 'undefined') {
  window.addEventListener('ritos-atolyeye-git', () => { DURUMLAR.cevre.ekran = 'hedef'; DURUMLAR.cevre.dosya = 'plan'; });
  window.addEventListener('ritos-rutinlere-git', () => { DURUMLAR.kendim.ekran = 'hedef'; DURUMLAR.kendim.dosya = 'plan'; });
}

const SON_ANAH = 'ritos-atolye-son';
function sonlariOku(): string[] { try { return JSON.parse(localStorage.getItem(SON_ANAH) ?? '[]'); } catch { return []; } }
function sonaEkle(id: string) { try { localStorage.setItem(SON_ANAH, JSON.stringify([id, ...sonlariOku().filter((x) => x !== id)].slice(0, 5))); } catch { /* yok say */ } }

interface Hedef { id: string; grup: string; grupIc: string; ic: string; ad: string; alt?: string; etiket?: string[]; h: PlanHedef }
/** 4 ekim — henüz görev verilmemiş aile üyesi: seçilince görev ilişkisi sessizce kurulur. */
interface Aday { id: string; uye: string; ad: string }

function useAdaylar(hedefler: Hedef[], gruplar: AileRow[]): Aday[] {
  const dn = useDanismanlik();
  const var_ = new Set(hedefler.filter((x) => grupKisisi(x)).map((x) => (x.h as { il: IliskiRow }).il.danisan));
  const m = new Map<string, Aday>();
  for (const g of gruplar) for (const u of g.uyeler) {
    if (u.uye !== dn.uid && u.durum === 'aktif' && !var_.has(u.uye) && !m.has(u.uye)) m.set(u.uye, { id: `aile:${u.uye}`, uye: u.uye, ad: u.ad });
  }
  return Array.from(m.values());
}

/** Gruptaki biri (görev verdiğim kişi) mi? — disiplini 'aile' olan görev ilişkisi. */
const grupKisisi = (h: Hedef | null | undefined) => !!h && h.h.tur === 'danisan' && h.h.il.disiplin === 'aile';
const GRUP_ETIKET = 'Gruplarım';
const RUTIN_BOLUM = 'Kuruluyor';
const OTURDU_BOLUM = 'Oturdu';
const ARSIV_BOLUM = 'Arşiv';

/** Aktif gruplarım (ada göre). */
function useGruplarim(): AileRow[] | null {
  const dn = useDanismanlik();
  const l = useCanli(() => db.aile.toArray(), [dn.uid], null as AileRow[] | null);
  return l ? l.filter(aileAktifMi).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')) : null;
}

/** Hedefler; ilk okuma bitmeden null (seçim ekranı yanlışlıkla açılmasın diye). */
function useHedeflerHazir(gruplar: AileRow[] | null, kapsam: Kapsam): Hedef[] | null {
  const dn = useDanismanlik();
  const iliskiler = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.durum === 'aktif' && i.koc === dn.uid), [dn.uid], null as IliskiRow[] | null);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], null as ProgramRow[] | null);
  if (!iliskiler || !programlar || !gruplar) return null;
  const liste: Hedef[] = [];
  if (kapsam === 'kendim') {
    for (const p of programlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) {
      const d = rutinDurumu(p);
      liste.push({ id: `p:${p.id}`, grup: d === 'oturdu' ? OTURDU_BOLUM : d === 'arsiv' ? ARSIV_BOLUM : RUTIN_BOLUM, grupIc: '🌱', ic: p.ikon ?? VARSAYILAN_IKON, ad: p.ad,
        alt: d === 'oturdu' ? 'oturmuş alışkanlık' : d === 'arsiv' ? 'arşiv' : 'rutin', etiket: p.alanlar ?? [], h: { tur: 'program', programId: p.id } });
    }
    return liste;
  }
  for (const i of iliskiler.filter((x) => x.disiplin !== 'aile').sort((a, b) => a.disiplin.localeCompare(b.disiplin) || a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: danismanlikBaslik(i.disiplin), grupIc: DISIPLIN_IKON[i.disiplin] ?? '🤝', ic: DISIPLIN_IKON[i.disiplin] ?? '🤝', ad: i.danisan_ad, alt: disiplinAdi(i.disiplin), h: { tur: 'danisan', il: i } });
  }
  for (const i of iliskiler.filter((x) => x.disiplin === 'aile').sort((a, b) => a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    // Aynı kişi birden çok grupta olabilir; plan kişiyle (ilişkiyle) tek, grup adları altta.
    const ortak = gruplar.filter((g) => g.uyeler.some((u) => u.uye === i.danisan && u.durum === 'aktif'));
    const ic = ortak[0] ? grupIkon(ortak[0]) : '👪';
    liste.push({ id: i.id, grup: GRUP_ETIKET, grupIc: ic, ic, ad: i.danisan_ad, alt: ortak.length ? ortak.map((g) => g.ad).join(', ') : 'verdiğin görevler', h: { tur: 'danisan', il: i } });
  }
  return liste;
}

export default function Atolye({ genis, kapsam = 'cevre' }: { genis: boolean; kapsam?: Kapsam }) {
  return <div className={`rt-atolye${genis ? ' genis' : ''}`}><Planlar key={kapsam} genis={genis} kapsam={kapsam} /></div>;
}

function Planlar({ genis, kapsam }: { genis: boolean; kapsam: Kapsam }) {
  const durum = DURUMLAR[kapsam];
  const dn = useDanismanlik();
  const gruplarHazir = useGruplarim();
  const gruplar = kapsam === 'cevre' ? gruplarHazir ?? [] : [];
  const hedeflerHazir = useHedeflerHazir(gruplarHazir, kapsam);
  const hazir = hedeflerHazir !== null;
  const hedefler = hedeflerHazir ?? [];
  const [secili, setSecili] = useSeciliDanisan(kapsam);
  const [ekran, setEkranS] = useState<Ekran>(durum.ekran);
  const [alan, setAlanS] = useState<string | null>(durum.alan);
  const [tarih, setTarihS] = useState(durum.tarih ?? bugun());
  const [hafta, setHaftaS] = useState(durum.hafta);
  const [dosya, setDosyaS] = useState<Dosya>(durum.dosya);
  const [sag, setSagS] = useState<Sag>(durum.sag);
  const [ayAcik, setAyAcik] = useState(false);
  const git = (e: Ekran, a: string | null = null) => { durum.ekran = e; durum.alan = a; setEkranS(e); setAlanS(a); };
  const setTarih = (t: string) => { durum.tarih = t; setTarihS(t); };
  const setHafta = (h: boolean) => { durum.hafta = h; setHaftaS(h); };
  const setDosya = (d: Dosya) => { durum.dosya = d; setDosyaS(d); };
  const setSag = (d: Sag) => { durum.sag = d; setSagS(d); };
  const adaylar = useAdaylar(hedefler, gruplar);
  const [grupKur, setGrupKur] = useState(false);
  const [uyeDavet, setUyeDavet] = useState<string | null>(null); // hangi gruba
  const [kuruluyor, setKuruluyor] = useState<string | null>(null);
  const [progForm, setProgForm] = useState<null | { id?: string; etiket?: string[] }>(null);
  const [yeniBekle, setYeniBekle] = useState<string | null>(null); // yeni program listeye düşene kadar liste açılmasın
  const [kurHata, setKurHata] = useState<string | null>(null);
  const [davet, setDavet] = useState<string | null>(null);      // hangi alana davet
  const [alanEkle, setAlanEkle] = useState(false);
  const [kartEkle, setKartEkle] = useState(false);
  const alanlar = kapsam === 'cevre' && dn.profil?.koc ? dn.profil.disiplinler : [];
  const [davetYenile, setDavetYenile] = useState(0);
  const [bekleyen, setBekleyen] = useState<DavetSatir[]>([]);
  useEffect(() => {
    if (!alanlar.length) return;
    davetler().then((l) => setBekleyen(l.filter((x) => !x.kullanildi && new Date(x.son).getTime() > Date.now()))).catch(() => setBekleyen([]));
  }, [davetYenile, alanlar.length]);
  const sonlananlar = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.koc === dn.uid && i.durum !== 'aktif' && i.disiplin !== 'aile'), [dn.uid], [] as IliskiRow[]);
  const h = hedefler.find((x) => x.id === secili) ?? null;

  const sec = (id: string) => {
    setSecili(id); sonaEkle(id); git('hedef');
    // Beslenme danışanında bilgiler girilmemişse dosya Bilgiler'le açılır (önce hesap, sonra plan).
    const x = hedefler.find((y) => y.id === id);
    if (x?.h.tur === 'danisan' && x.h.il.disiplin === 'beslenme') {
      db.iliski_ayar.get(x.h.il.id).then((a) => { if (!beslenmeHesap(a?.bilgiler ?? {}).hesap) { setDosya('bilgi'); setSag('bilgi'); } }).catch(() => {});
    }
  };

  // Seçili hedef yoksa: geniş ekranda ilk hedef seçilir; telefonda listeye dönülür.
  useEffect(() => {
    if (h) { if (yeniBekle) setYeniBekle(null); return; }
    if (kuruluyor || yeniBekle || !hazir) return;
    if (genis) { if (hedefler.length) setSecili(hedefler[0].id); }
    else if (ekran === 'hedef') git('liste');
  }, [h, hedefler.length, kuruluyor, genis, yeniBekle, hazir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aile üyesi ilk kez seçilince görev ilişkisi kurulur (ayrı bir "Görev ver" adımı yok).
  const adaySec = async (a: Aday) => {
    setKurHata(null); setKuruluyor(a.id);
    try { const id = await aileGorevIliski(a.uye); sec(id); }
    catch (e) { setKurHata(`${a.ad} için hazırlanamadı: ${(e as Error).message}`); }
    finally { setKuruluyor(null); }
  };

  const modallar = (
    <>
      {progForm && <ProgramFormu id={progForm.id} etiket0={progForm.etiket} onKapat={() => setProgForm(null)} onOlustu={(id) => { setProgForm(null); setYeniBekle(`p:${id}`); sec(`p:${id}`); }} />}
      {davet && <DavetModal sabitDisiplin={davet} onKapat={() => { setDavet(null); setDavetYenile((n) => n + 1); }} />}
      {alanEkle && <AlanEkleModal onKapat={() => setAlanEkle(false)} onEklendi={() => setAlanEkle(false)} />}
      {grupKur && <GrupKurModal onKapat={() => setGrupKur(false)} onKuruldu={(id) => { setGrupKur(false); git('grup', id); }} />}
      {uyeDavet && <UyeDavetModal grup={uyeDavet} onKapat={() => setUyeDavet(null)} />}
      {kartEkle && h && <KartEkle h={h} tarih={tarih < bugun() ? bugun() : tarih} onKapat={() => setKartEkle(false)} />}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
    </>
  );

  const seciliGorunsun = ekran === 'hedef' || (genis && ekran === 'liste');
  const secici = (
    <HedefSecici kapsam={kapsam} hedefler={hedefler} adaylar={adaylar} seciliId={seciliGorunsun ? h?.id ?? null : null} kompakt={genis}
      kuruluyor={kuruluyor} onSec={(x) => sec(x.id)} onAday={adaySec} onYeniProgram={() => setProgForm({})}
      alanlar={alanlar} bekleyen={bekleyen} sonlananlar={sonlananlar}
      onDavet={setDavet} onDavetIptal={async (kod) => { await davetSil(kod); setDavetYenile((n) => n + 1); }} onAlanEkle={() => setAlanEkle(true)}
      acikAlan={ekran === 'alan' || ekran === 'grup' ? alan : null} kutAcik={ekran === 'kut'}
      onAlan={(a) => git('alan', a)} onKutuphane={() => git('kut')}
      gruplar={gruplar} onGrup={(id) => git('grup', id)} onGrupKur={() => setGrupKur(true)} onUyeDavet={setUyeDavet}
      onYasamAlani={(id) => git('yalan', id)} onDegerlendir={() => git('deg')} />
  );
  const yasamEkrani = ekran === 'yalan' && alan
    ? <AlanSayfasi alanId={alan} onRutin={(pid) => sec(`p:${pid}`)} onYeniRutin={() => setProgForm({ etiket: [alan] })} onDegerlendir={() => git('deg')} />
    : ekran === 'deg' ? <AySonu onBitti={() => git('liste')} /> : null;
  const grupDosyasi = ekran === 'grup' && alan && (
    <GrupDosyasi id={alan} hedefler={hedefler} adaylar={adaylar} onSec={(x) => sec(x.id)} onAday={adaySec} onUyeDavet={() => setUyeDavet(alan)} onBitti={() => git('liste')} />
  );

  if (!hazir) return <div className="rt-atolye-plan" />;
  const geri = <div className="rt-geri-bar"><button type="button" className="rt-geri-dugme" onClick={() => git('liste')}>‹ Geri</button><span>{KAPSAM_AD[kapsam]}</span></div>;

  // ———— Telefon: ekran yığını ————
  if (!genis) {
    if (ekran === 'kut') return <div className="rt-atolye-plan">{geri}<Kutuphane />{modallar}</div>;
    if (ekran === 'alan' && alan) return <div className="rt-atolye-plan">{geri}<AlanDosyasi alan={alan} />{modallar}</div>;
    if (grupDosyasi) return <div className="rt-atolye-plan">{geri}{grupDosyasi}{modallar}</div>;
    if (yasamEkrani) return <div className="rt-atolye-plan">{geri}{yasamEkrani}{modallar}</div>;
    if (ekran === 'liste' || (!h && !kuruluyor && !yeniBekle)) {
      return (
        <div className="rt-atolye-plan">
          {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
          {kuruluyor && <p className="rt-muted">Hazırlanıyor…</p>}
          {secici}
          {modallar}
        </div>
      );
    }
  }

  const t0 = bugun();
  const adim = hafta ? 7 : 1;
  const bugunGorunur = hafta ? haftaBasi(tarih) === haftaBasi(t0) : tarih === t0;
  const aileMi = grupKisisi(h);
  const dosyaSek: [Dosya, string][] = [['plan', '📅 Plan'], ['gelisim', '📈 Gelişim'], ...(aileMi ? [] : [['bilgi', '🗂 Bilgiler'] as [Dosya, string]])];
  const etkinDosya: Dosya = aileMi && dosya === 'bilgi' ? 'plan' : dosya;
  const programMi = h?.h.tur === 'program';
  const sagSek: [Sag, string][] = [['gelisim', '📈 Gelişim'], ...(aileMi ? [] : [['bilgi', '🗂 Bilgiler'] as [Sag, string]]), ...(programMi || aileMi ? [['kut', '📚 Kütüphane'] as [Sag, string]] : [])];
  const etkinSag: Sag = (aileMi && sag === 'bilgi') || (!programMi && !aileMi && sag === 'kut') ? 'gelisim' : sag;

  const plan = h && (
    <>
      <div className="rt-daterow">
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, -adim))} aria-label={hafta ? 'Önceki hafta' : 'Önceki gün'}>‹</button>
        <button className="rt-dlabel" onClick={() => setAyAcik(true)}>
          {hafta ? haftaEtiket(haftaBasi(tarih)) : tarihEtiket(tarih)}
          {!bugunGorunur && <span className="rt-totoday" onClick={(e) => { e.stopPropagation(); setTarih(t0); }}>↺ bugüne dön</span>}
        </button>
        <button className="arrow" onClick={() => setTarih(tarihEkle(tarih, adim))} aria-label={hafta ? 'Sonraki hafta' : 'Sonraki gün'}>›</button>
        <div className="rt-gorunum" role="group" aria-label="Görünüm">
          <button type="button" className={!hafta ? 'on' : ''} onClick={() => setHafta(false)}>Gün</button>
          <button type="button" className={hafta ? 'on' : ''} onClick={() => setHafta(true)}>Hafta</button>
        </div>
      </div>
      {h.h.tur === 'danisan' && h.h.il.disiplin === 'beslenme' && <BeslenmeBaslangic h={h} haftaBas={haftaBasi(tarih)} onBilgiler={() => setDosya('bilgi')} />}
      <div className="rt-hafta-is"><button type="button" className="rt-chip rt-kut-ekle" onClick={() => setKartEkle(true)}>＋ Kart ekle</button></div>
      <DanisanAjandasi
        key={h.id}
        h={h.h}
        baslik={h.h.tur === 'program'
          ? <>Yalnız bu rutinin kartları. Burada kurduğun kartlar Ajandam&apos;a da düşer.</>
          : aileMi
            ? <>Ona verdiğin görevler ve durumları. İşaretleyince burada görürsün.</>
            : <>Yalnız senin atadığın kartlar görünür.</>}
        tarih={tarih} hafta={hafta} haftaBas={haftaBasi(tarih)} onGun={(t) => { setTarih(t); setHafta(false); }} />
      <GonderimKutusu h={h} />
    </>
  );

  // ———— Telefon: kişi / program dosyası ————
  if (!genis) {
    return (
      <div className="rt-atolye-plan">
        {geri}
        {kuruluyor && <p className="rt-muted">Hazırlanıyor…</p>}
        {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
        {h && !kuruluyor && (
          <>
            <div className="rt-tek"><span className="ic">{h.ic}</span><span className="tx"><b>{h.ad}</b><small>{h.grup}</small></span></div>
            <div className="rt-dosya-seg" role="tablist" aria-label="Dosya">
              {dosyaSek.map(([k, ad]) => <button key={k} type="button" role="tab" aria-selected={etkinDosya === k} className={etkinDosya === k ? 'on' : ''} onClick={() => setDosya(k)}>{ad}</button>)}
            </div>
            {etkinDosya === 'plan' ? plan
              : etkinDosya === 'gelisim' ? <AtolyeAraclari h={h} haftaBas={haftaBasi(tarih)} />
              : <Bilgiler h={h} onProgramDuzenle={(id) => setProgForm({ id })} />}
          </>
        )}
        {modallar}
      </div>
    );
  }

  // ———— Geniş ekran: solda liste, ortada plan / alan dosyası / kütüphane, sağda dosya bölmesi ————
  const ortaPlan = ekran !== 'alan' && ekran !== 'kut' && ekran !== 'grup' && !yasamEkrani;
  return (
    <div className="rt-atolye-plan">
      <aside className="rt-atolye-sol" aria-label="Plan seçimi">{secici}</aside>
      <section className="rt-atolye-orta">
        {ekran === 'kut' ? <div className="rt-orta-dar"><Kutuphane /></div>
          : ekran === 'alan' && alan ? <div className="rt-orta-dar"><AlanDosyasi alan={alan} /></div>
          : grupDosyasi ? <div className="rt-orta-dar">{grupDosyasi}</div>
          : yasamEkrani ? <div className="rt-orta-dar">{yasamEkrani}</div>
          : (
            <>
              {kuruluyor && <p className="rt-muted">Hazırlanıyor…</p>}
              {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
              {!h && !kuruluyor && !kurHata && <p className="rt-muted">Soldan bir plan seç ya da yenisini oluştur.</p>}
              {h && !kuruluyor && <><div className="rt-hedef-bas"><b>{h.ic} {h.ad}</b>{h.alt && <span className="rt-muted"> · {h.alt}</span>}</div>{plan}</>}
            </>
          )}
      </section>
      {ortaPlan && h && !kuruluyor && (
        <aside className="rt-atolye-sag">
          <div className="rt-dosya-seg" role="tablist" aria-label="Yan bölme">
            {sagSek.map(([k, ad]) => <button key={k} type="button" role="tab" aria-selected={etkinSag === k} className={etkinSag === k ? 'on' : ''} onClick={() => setSag(k)}>{ad}</button>)}
          </div>
          {etkinSag === 'gelisim' ? <AtolyeAraclari h={h} haftaBas={haftaBasi(tarih)} />
            : etkinSag === 'bilgi' ? <Bilgiler h={h} onProgramDuzenle={(id) => setProgForm({ id })} />
            : <KutuphaneSurukle h={h} />}
        </aside>
      )}
      {modallar}
    </div>
  );
}

// ———————————————— Kart ekle (4 ekim): önce alanın kart türleri ————————————————
// Danışan: alanın paleti (beslenme: öğün/ölçüm/kart; sınav: sınav görevi/kart/ölçüm) — DanisanAjanda'daki form.
// Kişisel program ve aile: yeni kart ya da Kütüphaneden.

function KartEkle({ h, tarih, onKapat }: { h: Hedef; tarih: string; onKapat: () => void }) {
  const [gun, setGun] = useState(tarih);
  const [yol, setYol] = useState<null | 'yeni' | 'kut'>(h.h.tur === 'danisan' && !grupKisisi(h) ? 'yeni' : null);
  if (yol === 'yeni') return <KocKartFormu h={h.h} tarih={gun} onKapat={onKapat} />;
  if (yol === 'kut') return <KutuphanedenEkle h={h} tarih={gun} onKapat={onKapat} />;
  return (
    <Modal baslik={`＋ ${h.ad} için kart`} onKapat={onKapat}>
      <label className="rt-alan">Hangi gün<input className="rt-inp" type="date" min={bugun()} value={gun} onChange={(e) => setGun(e.target.value)} /></label>
      <button type="button" className="rt-tur-kart" onClick={() => setYol('yeni')}><span className="ic">✏️</span><span><b>Yeni kart</b><small>başlık, açıklama, video, süre, ölçüm…</small></span></button>
      <button type="button" className="rt-tur-kart" onClick={() => setYol('kut')}><span className="ic">📚</span><span><b>Kütüphaneden</b><small>kayıtlı kartlarından seç</small></span></button>
    </Modal>
  );
}

// ———————————————— Gönderim (plan ayarı; danışan / aile) ————————————————

function GonderimKutusu({ h }: { h: Hedef }) {
  const pd = useCanli(() => planDurumu(h.h), [h.id], null as Awaited<ReturnType<typeof planDurumu>>);
  const [hata, setHata] = useState<string | null>(null);
  if (!pd) return null;
  const kim = h.h.tur === 'danisan' ? h.h.il.danisan_ad : '';
  return (
    <div className="rt-arac rt-gonderim-kutu">
      <h4>Gönderim</h4>
      <div className="rt-gorunum rt-gonderim" role="group" aria-label="Gönderim">
        <button type="button" className={pd.gonderim === 'hemen' ? 'on' : ''} onClick={() => gonderimAyarla(h.h, 'hemen').catch((e) => setHata((e as Error).message))}>Hemen gönder</button>
        <button type="button" className={pd.gonderim === 'gonder' ? 'on' : ''} onClick={() => gonderimAyarla(h.h, 'gonder').catch((e) => setHata((e as Error).message))}>Gönder deyince</button>
      </div>
      <p className="rt-muted">{pd.gonderim === 'gonder'
        ? `Değişiklikler taslak kalır; "Gönder" deyince ${iyelik(kim)} Ajanda'sına düşer.`
        : `Her değişiklik birkaç saniye içinde ${iyelik(kim)} Ajanda'sına yansır.`}</p>
      {hata && <p className="rt-hata">{hata}</p>}
    </div>
  );
}

// ———————————————— Bilgiler (4 ekim) ————————————————
// Danışan: alana göre birkaç temel alan + koç notu (yalnız koçun cihazlarında). Kişisel program: amaç, simge, notlar.

const BILGI_ALANLARI: Record<string, [string, string, string?][]> = {
  beslenme: [['boy', 'Boy (cm)'], ['baslangic_kilo', 'Başlangıç kilosu'], ['hedef_kilo', 'Hedef kilo'], ['kalori', 'Günlük kalori hedefi'], ['tercihler', 'Tercihler', 'ör. laktoz azaltılmış, ara öğün sever'], ['kacindiklari', 'Kaçındıkları']],
  sinav: [['hedef_sinav', 'Hedef sınav', 'ör. LGS 2027'], ['hedef_okul', 'Hedef okul / bölüm'], ['guclu', 'Güçlü dersler'], ['calisilacak', 'Çalışılacak dersler'], ['kaynaklar', 'Kaynaklar', 'kitaplar, soru bankaları']],
  genel: [['hedef', 'Hedef'], ['odak', 'Odak alanları']],
};

function Bilgiler({ h, onProgramDuzenle }: { h: Hedef; onProgramDuzenle: (programId: string) => void }) {
  if (h.h.tur === 'program') return <ProgramBilgileri programId={h.h.programId} onDuzenle={() => onProgramDuzenle((h.h as { programId: string }).programId)} />;
  return <DanisanBilgileri key={h.h.il.id} il={h.h.il} />;
}

function DanisanBilgileri({ il }: { il: IliskiRow }) {
  const ayar = useCanli(async () => (await db.iliski_ayar.get(il.id)) ?? null, [il.id], undefined as IliskiAyarRow | null | undefined);
  const [b, setB] = useState<Record<string, string>>({});
  const [not, setNot] = useState('');
  const [yuklendi, setYuklendi] = useState(false);
  const [durumMetni, setDurumMetni] = useState<string | null>(null);
  const [bitir, setBitir] = useState(false);
  useEffect(() => { if (ayar !== undefined && !yuklendi) { setB(ayar?.bilgiler ?? {}); setNot(ayar?.notlar ?? ''); setYuklendi(true); } }, [ayar, yuklendi]);
  const alanlar = BILGI_ALANLARI[il.disiplin] ?? BILGI_ALANLARI.genel;
  const degisti = yuklendi && (JSON.stringify(b) !== JSON.stringify(ayar?.bilgiler ?? {}) || not !== (ayar?.notlar ?? ''));
  return (
    <div className="rt-bilgiler">
      <p className="rt-muted">🔒 Bu bilgiler yalnız sende durur; {il.danisan_ad} görmez.</p>
      {il.disiplin === 'beslenme' ? <BeslenmeFormu b={b} setB={(x) => { setB(x); setDurumMetni(null); }} /> : (
      <div className="rt-arac">
        <h4>{danismanlikBaslik(il.disiplin)}</h4>
        {alanlar.map(([k, ad, ipucu]) => (
          <label key={k} className="rt-bilgi-sat">
            <span>{ad}</span>
            <input className="rt-inp" value={b[k] ?? ''} placeholder={ipucu ?? ''} onChange={(e) => { setB({ ...b, [k]: e.target.value }); setDurumMetni(null); }} />
          </label>
        ))}
      </div>
      )}
      <div className="rt-arac">
        <h4>Koç notları</h4>
        <textarea className="rt-inp" rows={4} value={not} placeholder="Gözlemlerin, dikkat edilecekler…" onChange={(e) => { setNot(e.target.value); setDurumMetni(null); }} />
      </div>
      <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
        {durumMetni && <span className="rt-tamam">{durumMetni}</span>}
        <button type="button" className="rt-btn primary" disabled={!degisti} onClick={async () => {
          const temiz: Record<string, string> = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
          // Beslenme: hesap ilk kez tamamlanınca başlangıç tarihi yazılır (beklenen çizgi buradan başlar).
          if (il.disiplin === 'beslenme' && !temiz.baslangic_tarihi && beslenmeHesap(temiz).hesap) temiz.baslangic_tarihi = bugun();
          await iliskiBilgiYaz(il, { bilgiler: temiz, notlar: not.trim() });
          setB(temiz); setNot(not.trim()); setDurumMetni('✓ Kaydedildi');
        }}>Kaydet</button>
      </div>
      <div className="rt-arac">
        <h4>Danışmanlık</h4>
        <p className="rt-metin">{new Date(il.olusturuldu).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}&apos;den beri · {il.durum === 'aktif' ? 'aktif' : 'sonlandı'}</p>
        {il.durum === 'aktif' && <button type="button" className="rt-btn tehlike" onClick={() => setBitir(true)}>Danışmanlığı sonlandır</button>}
      </div>
      {bitir && <SonlandirModal il={il} onKapat={() => setBitir(false)} />}
    </div>
  );
}

function ProgramBilgileri({ programId, onDuzenle }: { programId: string; onDuzenle: () => void }) {
  const p = useCanli(async () => (await db.program.get(programId)) ?? null, [programId], undefined as ProgramRow | null | undefined);
  const [not, setNot] = useState('');
  const [yuklendi, setYuklendi] = useState(false);
  const [tamam, setTamam] = useState(false);
  useEffect(() => { if (p !== undefined && !yuklendi) { setNot(p?.notlar ?? ''); setYuklendi(true); } }, [p, yuklendi]);
  if (!p) return null;
  return (
    <div className="rt-bilgiler">
      <div className="rt-arac">
        <h4>Program</h4>
        <div className="rt-prog-ozet"><span className="rt-prog-ikon">{p.ikon ?? VARSAYILAN_IKON}</span><span><b>{p.ad}</b>{p.amac && <span className="rt-muted"><br />{p.amac}</span>}</span></div>
        <button type="button" className="rt-linkbtn" onClick={onDuzenle}>✎ Ad, simge, alanlar ve amacı düzenle</button>
      </div>
      {!p.uzak && <RutinMalzemesi p={p} />}
      {!p.uzak && <RutinDurumu p={p} />}
      <div className="rt-arac">
        <h4>Notlar</h4>
        <textarea className="rt-inp" rows={4} value={not} placeholder="Bu programla ilgili notların" onChange={(e) => { setNot(e.target.value); setTamam(false); }} />
        <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
          {tamam && <span className="rt-tamam">✓ Kaydedildi</span>}
          <button type="button" className="rt-btn primary" disabled={not.trim() === (p.notlar ?? '')} onClick={async () => { await programGuncelle(p.id, { notlar: not.trim() }); setTamam(true); }}>Kaydet</button>
        </div>
      </div>
    </div>
  );
}

// 5 ekim — rutinin malzemesi: bağlı Kütüphane koleksiyonu (Kart ekle › Kütüphaneden'de önce gelir).
function RutinMalzemesi({ p }: { p: ProgramRow }) {
  const kols = useCanli(koleksiyonlar, [], [] as KlasorRow[]);
  const say = useCanli(async () => (p.malzeme ? db.kutuphane_kart.where('klasor_id').equals(p.malzeme).count() : 0), [p.malzeme], 0);
  return (
    <div className="rt-arac">
      <h4>Malzeme</h4>
      <select className="rt-inp" aria-label="Malzeme koleksiyonu" value={p.malzeme ?? ''} onChange={(e) => programGuncelle(p.id, { malzeme: e.target.value || null })}>
        <option value="">— koleksiyon bağlı değil —</option>
        {kols.map((c) => <option key={c.id} value={c.id}>{c.ikon ?? '📁'} {c.ad}</option>)}
      </select>
      <p className="rt-muted">{p.malzeme ? `${say} kart · "＋ Kart ekle › Kütüphaneden" önce bu koleksiyonu gösterir.` : 'Kütüphanedeki bir koleksiyonu bu rutinin malzemesi yap; kart eklerken önce o gelir.'}</p>
    </div>
  );
}

// 5 ekim — rutin yaşam döngüsü: kuruluyor / oturdu / arşiv.
function RutinDurumu({ p }: { p: ProgramRow }) {
  const d = rutinDurumu(p);
  const [onay, setOnay] = useState<null | 'oturdu' | 'arsiv' | 'don'>(null);
  const [bekle, setBekle] = useState(false);
  const yap = async (f: () => Promise<void>) => { setBekle(true); try { await f(); } finally { setBekle(false); setOnay(null); } };
  const tarih = p.durum_tarih ? tarihEtiket(p.durum_tarih) : '';
  return (
    <div className="rt-arac">
      <h4>Durum</h4>
      <p className="rt-metin">
        {d === 'kuruluyor' && <><span className="rt-durum-tag">● Kuruluyor</span> Ajandam&apos;da; işaretledikçe dengene emek olarak yansır.</>}
        {d === 'oturdu' && <><span className="rt-durum-tag oturdu">✓ Oturdu</span> {tarih && `${tarih}'den beri `}alışkanlık; Ajandam&apos;da görünmez, dengede taban olarak durur.</>}
        {d === 'arsiv' && <><span className="rt-durum-tag">🗄 Arşiv</span> {tarih && `${tarih}'de `}bırakıldı.</>}
      </p>
      <div className="rt-satir">
        {d === 'kuruluyor' && <button type="button" className="rt-btn" disabled={bekle} onClick={() => setOnay('oturdu')}>✓ Oturdu olarak işaretle</button>}
        {d !== 'kuruluyor' && <button type="button" className="rt-btn" disabled={bekle} onClick={() => setOnay('don')}>{d === 'arsiv' ? '↺ Yeniden başlat' : '↺ Kuruluyor’a döndür'}</button>}
        {d !== 'arsiv' && <button type="button" className="rt-btn" disabled={bekle} onClick={() => setOnay('arsiv')}>🗄 Arşivle</button>}
      </div>
      {onay === 'oturdu' && <OnayKutusu metin="Alışkanlık oldu mu? Kartları yarından Ajandam'dan kalkar; dengede bu rutinin alanları taban olarak dolu görünür. İstediğinde geri döndürebilirsin." evet="Oturdu" onVazgec={() => setOnay(null)} onEvet={() => yap(() => oturduIsaretle(p.id))} />}
      {onay === 'arsiv' && <OnayKutusu metin="Rutin arşivlenir; kartları yarından Ajandam'dan kalkar. Geçmişi saklanır, istediğinde yeniden başlatırsın." evet="Arşivle" onVazgec={() => setOnay(null)} onEvet={() => yap(() => arsivle(p.id))} />}
      {onay === 'don' && <OnayKutusu metin={`Kartları yarından Ajandam'a geri gelir (${(p.kaliplar ?? []).length} kart).`} evet={d === 'arsiv' ? 'Yeniden başlat' : 'Döndür'} onVazgec={() => setOnay(null)} onEvet={() => yap(() => kuruluyoraDon(p.id))} />}
    </div>
  );
}

// ———————————————— Kütüphaneden ekle (telefon da) ————————————————

function KutuphanedenEkle({ h, tarih, onKapat }: { h: Hedef; tarih: string; onKapat: () => void }) {
  const tumKartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  // 5 ekim — rutinin malzeme koleksiyonu varsa önce o (konu çipleriyle); "tümü" ile bütün kütüphane.
  const malzeme = useCanli(async () => (h.h.tur === 'program' ? (await db.program.get(h.h.programId))?.malzeme ?? null : null), [h.id], null as string | null);
  const kol = useCanli(async () => (malzeme ? (await db.klasor.get(malzeme)) ?? null : null), [malzeme], null as KlasorRow | null);
  const [tumu, setTumu] = useState(false);
  const [konu, setKonu] = useState<string | null>(null);
  const kolKartlari = malzeme ? tumKartlar.filter((k) => k.klasor_id === malzeme) : [];
  const konular = Array.from(new Set(kolKartlari.flatMap((k) => k.konular ?? []))).sort((a, b) => a.localeCompare(b, 'tr'));
  const kartlar = malzeme && !tumu ? kolKartlari.filter((k) => !konu || (k.konular ?? []).includes(konu)) : tumKartlar;
  const [gun, setGun] = useState(tarih);
  const [ara, setAra] = useState('');
  const [eklenen, setEklenen] = useState<string[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const q = kucuk(ara.trim());
  const liste = kartlar.filter((k) => !q || kucuk(k.ad).includes(q)).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return (
    <Modal baslik="📚 Kütüphaneden ekle" onKapat={onKapat}>
      <label className="rt-alan">Hangi gün<input className="rt-inp" type="date" min={bugun()} value={gun} onChange={(e) => setGun(e.target.value)} /></label>
      {malzeme && kol && (
        <div className="rt-kut-suz">
          <button type="button" className={`rt-chip${!tumu ? ' on' : ''}`} onClick={() => setTumu(false)}>{kol.ikon ?? '📁'} {kol.ad}</button>
          <button type="button" className={`rt-chip${tumu ? ' on' : ''}`} onClick={() => setTumu(true)}>Tüm kütüphane</button>
          {!tumu && konular.map((k) => <button key={k} type="button" className={`rt-chip${konu === k ? ' on' : ''}`} onClick={() => setKonu(konu === k ? null : k)}>{k}</button>)}
        </div>
      )}
      {kartlar.length > 6 && <input className="rt-inp" type="search" placeholder="Kartlarda ara…" value={ara} onChange={(e) => setAra(e.target.value)} />}
      {tumKartlar.length === 0 && <p className="rt-muted">Kütüphanen boş. Rutinlerim › 📚 Kütüphane&apos;den kart ekleyebilir ya da Ajandam&apos;daki bir kartı &quot;Kütüphaneye kaydet&quot; ile saklayabilirsin.</p>}
      <div className="rt-kut-liste">
        {liste.map((k) => (
          <div key={k.id} className="rt-kut-oge">
            <span className="t">{k.ad}</span>
            {eklenen.includes(k.id)
              ? <span className="rt-tamam">✓ Eklendi</span>
              : <button type="button" className="rt-btn" onClick={async () => {
                setHata(null);
                try { await kocKartEkle(h.h, gun, { tip: k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null }); setEklenen([...eklenen, k.id]); }
                catch (e) { setHata((e as Error).message); }
              }}>＋ Ekle</button>}
          </div>
        ))}
      </div>
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <p className="rt-muted">{h.ad} planına {tarihEtiket(gun)} günü eklenir. Bütün bir hafta için Plan&apos;daki &quot;📋 Şablon uygula&quot;.</p>
    </Modal>
  );
}


// ———————————————— Alan dosyası (4 ekim): Malzeme · Şablonlar · Ayarlar ————————————————
// Her danışmanlık alanı kendi malzemesini kendi biçiminde taşır (sınav: katalog + kaynaklar = sınav paketi).
// Kişisel programlarda yalnız Şablonlar.

function AlanDosyasi({ alan }: { alan: string }) {
  const dn = useDanismanlik();
  const kisisel = alan === 'kisisel';
  const sekler: [AlanSek, string][] = kisisel ? [['sablon', 'Şablonlar']] : [['malzeme', 'Malzeme'], ['sablon', 'Şablonlar'], ['ayar', 'Ayarlar']];
  const [sek, setSekS] = useState<AlanSek>(alanSekDurum.sek);
  const setSek = (s: AlanSek) => { alanSekDurum.sek = s; setSekS(s); };
  const etkin: AlanSek = sekler.some(([k]) => k === sek) ? sek : sekler[0][0];
  const aktifSay = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.koc === dn.uid && i.durum === 'aktif' && i.disiplin === alan).length, [dn.uid, alan], 0);
  const [kapat, setKapat] = useState(false);
  const ic = kisisel ? '🌱' : DISIPLIN_IKON[alan] ?? '🤝';
  const ad = kisisel ? 'Rutinler' : danismanlikBaslik(alan);
  return (
    <div className="rt-alan-dosyasi">
      <div className="rt-tek"><span className="ic">{ic}</span><span className="tx"><b>{ad}</b><small>alan dosyası</small></span></div>
      {sekler.length > 1 && (
        <div className="rt-dosya-seg" role="tablist" aria-label="Alan dosyası">
          {sekler.map(([k, a]) => <button key={k} type="button" role="tab" aria-selected={etkin === k} className={etkin === k ? 'on' : ''} onClick={() => setSek(k)}>{a}</button>)}
        </div>
      )}
      {etkin === 'malzeme' && (alan === 'sinav'
        ? <div className="rt-paket"><SinavTool /></div>
        : (
          <div className="rt-arac">
            <h4>Malzeme</h4>
            <p className="rt-muted">{alan === 'beslenme'
              ? 'Yakında: seçenekli öğün seti, basit değişim listesi ve takip edilen ölçüler. Kalori ve klinik hesap diyetisyen uygulamasında kalır.'
              : 'Bu alanın malzemesi henüz yok.'}</p>
          </div>
        ))}
      {etkin === 'sablon' && (
        <div className="rt-arac">
          <h4>Şablonlarım</h4>
          <HaftaSablonlari disiplin={alan} tam />
          {kisisel && <HaftaSablonlari disiplin="diger" tam />}
          <p className="rt-muted">Bir planın haftasını &quot;💾 Haftayı şablon kaydet&quot; ile buraya alırsın; &quot;📋 Şablon uygula&quot; bu alanın şablonlarını gösterir.</p>
        </div>
      )}
      {etkin === 'sablon' && <HazirSablonlar alan={alan} />}
      {etkin === 'ayar' && (
        <div className="rt-arac">
          <h4>Alan</h4>
          <p className="rt-metin">{aktifSay ? `${aktifSay} aktif kişi` : 'Bu alanda aktif kişi yok.'}</p>
          {aktifSay === 0 && (kapat
            ? <OnayKutusu metin="Bu danışmanlık alanı kapansın mı? Şablonlar silinmez." evet="Kapat" onVazgec={() => setKapat(false)} onEvet={async () => { await kocOl((dn.profil?.disiplinler ?? []).filter((x) => x !== alan)); setKapat(false); }} />
            : <button type="button" className="rt-btn tehlike" onClick={() => setKapat(true)}>Bu alanı kapat</button>)}
          {aktifSay > 0 && <p className="rt-muted">Alan, içinde aktif kişi yokken kapatılabilir.</p>}
        </div>
      )}
    </div>
  );
}

// ———————————————— Araçlar (3 ekim) ————————————————
// Hedefin son 4 haftası kartlardan okunur: bu hafta, uyum, ölçümler. Danışan / aile için gönderim.

const yuzde = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface Seri { ad: string; birim: string; noktalar: { t: string; v: number }[] }

function serileriCikar(kartlar: KocKarti[]): Seri[] {
  const m = new Map<string, Seri>();
  for (const k of kartlar) {
    if (!k.degerler) continue;
    const bloklar = degerBloklari(k.adim.bloklar);
    const ekle = (anahtar: string, ad: string, birim: string) => {
      const v = Number((k.degerler as Record<string, unknown>)[anahtar]);
      if (!Number.isFinite(v)) return;
      const key = anahtar === SURE_ANAHTAR ? `${k.adim.ad}|${anahtar}` : anahtar; // aynı ölçü (ör. kilo) farklı kartlardan tek seri
      if (!m.has(key)) m.set(key, { ad, birim, noktalar: [] });
      m.get(key)!.noktalar.push({ t: k.tarih, v });
    };
    for (const b of bloklar) if (b.tur === 'sayi') ekle(b.anahtar, b.etiket, b.bicim === 'olcek' ? '/5' : b.birim ?? '');
    if (SURE_ANAHTAR in (k.degerler as object)) ekle(SURE_ANAHTAR, `${k.adim.ad} · süre`, 'dk');
  }
  return Array.from(m.values()).filter((x) => x.noktalar.length).map((x) => ({ ...x, noktalar: x.noktalar.sort((a, b) => a.t.localeCompare(b.t)) }));
}

function Kivrim({ n }: { n: number[] }) {
  if (n.length < 2) return null;
  const min = Math.min(...n), max = Math.max(...n), g = 90, y = 24;
  const pts = n.map((v, i) => `${(i / (n.length - 1)) * g},${max === min ? y / 2 : y - 2 - ((v - min) / (max - min)) * (y - 4)}`).join(' ');
  return <svg className="rt-kivrim" viewBox={`0 0 ${g} ${y}`} width={g} height={y} aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}

function AtolyeAraclari({ h, haftaBas }: { h: Hedef; haftaBas: string }) {
  const gunler = Array.from({ length: 28 }, (_, i) => tarihEkle(haftaBas, i - 21));
  const veri = useCanli(() => danisanGunleri(h.h, gunler), [h.id, haftaBas], {} as Record<string, KocKarti[]>);
  const pd = useCanli(() => planDurumu(h.h), [h.id], null as Awaited<ReturnType<typeof planDurumu>>);
  const t0 = bugun();
  const hafta = gunler.slice(21).flatMap((t) => veri[t] ?? []);
  const haftalar = [0, 1, 2, 3].map((w) => {
    const ks = gunler.slice(w * 7, w * 7 + 7).filter((t) => t <= t0).flatMap((t) => veri[t] ?? []);
    return { bas: gunler[w * 7], yap: ks.filter((k) => k.yapildi).length, top: ks.length };
  });
  const seriler = serileriCikar(gunler.flatMap((t) => veri[t] ?? [])).slice(0, 5);
  const yap = hafta.filter((k) => k.yapildi).length;
  return (
    <div className="rt-araclar">
      {h.h.tur === 'danisan' && h.h.il.disiplin === 'beslenme' && <KiloTakip h={h} />}
      <div className="rt-arac">
        <h4>Bu hafta</h4>
        <div className="rt-buyuk">%{yuzde(yap, hafta.length)}<small>{yap}/{hafta.length} kart yapıldı</small></div>
      </div>
      <div className="rt-arac">
        <h4>Son 4 hafta · bugüne kadar</h4>
        {haftalar.map((w) => (
          <div key={w.bas} className="rt-cizgi">
            <span className="ad">{tarihParse(w.bas).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
            <span className="yol"><i style={{ width: `${yuzde(w.yap, w.top)}%` }} /></span>
            <span className="d">{w.top ? `%${yuzde(w.yap, w.top)}` : '—'}</span>
          </div>
        ))}
      </div>
      <div className="rt-arac">
        <h4>Ölçümler</h4>
        {seriler.length === 0 && <p className="rt-muted">Son 4 haftada girilen değer yok. Karta 📏 ölçüm eklersen burada seri olarak görünür.</p>}
        {seriler.map((x) => {
          const n = x.noktalar.map((p) => p.v);
          const son = n[n.length - 1], fark = son - n[0];
          return (
            <div key={x.ad} className="rt-seri">
              <span className="ad">{x.ad}</span>
              <Kivrim n={n} />
              <span className="d"><b>{son.toLocaleString('tr-TR')}</b>{x.birim && x.birim !== '/5' ? ` ${x.birim}` : x.birim}{n.length > 1 && fark !== 0 && <small> {fark > 0 ? '↑' : '↓'}{Math.abs(Math.round(fark * 10) / 10).toLocaleString('tr-TR')}</small>}</span>
            </div>
          );
        })}
      </div>
      {pd && <GeriBildirim h={h} haftaBas={haftaBas} kartlar={hafta} programId={pd.programId} hicGonderilmedi={pd.hicGonderilmedi} />}
    </div>
  );
}

// Geniş ekranda: Kütüphane kartını haftanın bir gününe sürükle → seçili hedefin planına eklenir.
function KutuphaneSurukle({ h }: { h: Hedef }) {
  const kartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  const [tasi, setTasi] = useState<{ k: KutuphaneKartRow; x: number; y: number } | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  useEffect(() => {
    if (!tasi) return;
    const k = tasi.k;
    const hareket = (e: PointerEvent) => setTasi((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
    const birak = async (e: PointerEvent) => {
      setTasi(null);
      const gun = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-tarih]')?.dataset.tarih;
      if (!gun) return;
      try {
        await kocKartEkle(h.h, gun, { tip: k.tip, ad: k.ad, bloklar: k.bloklar, ek: k.ek ?? null });
        setMesaj(`"${k.ad}" ${tarihEtiket(gun)} gününe eklendi.`);
      } catch (x) { setMesaj((x as Error).message); }
    };
    window.addEventListener('pointermove', hareket);
    window.addEventListener('pointerup', birak, { once: true });
    return () => { window.removeEventListener('pointermove', hareket); window.removeEventListener('pointerup', birak); };
  }, [tasi?.k.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kartlar.length) return null;
  return (
    <div className="rt-arac rt-kut-surukle">
      <h4>📚 Kütüphane — haftaya sürükle</h4>
      {mesaj && <p className="rt-tamam" onClick={() => setMesaj(null)}>{mesaj}</p>}
      {kartlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((k) => (
        <div key={k.id} className="rt-kut-oge" onPointerDown={(e) => { e.preventDefault(); setMesaj(null); setTasi({ k, x: e.clientX, y: e.clientY }); }}>{k.ad}</div>
      ))}
      {tasi && <div className="rt-hayalet" style={{ left: tasi.x, top: tasi.y }}>{tasi.k.ad}</div>}
    </div>
  );
}

// ———————————————— 3 ekim — geri bildirim (koç tarafı) ————————————————
// Haftanın kart notları (danışanın yazdıkları) + koçun haftalık değerlendirmesi.

function GeriBildirim({ h, haftaBas, kartlar, programId, hicGonderilmedi }: { h: Hedef; haftaBas: string; kartlar: KocKarti[]; programId: string | null; hicGonderilmedi: boolean }) {
  const p = useCanli(async () => (programId ? (await db.program.get(programId)) ?? null : null), [programId], null as ProgramRow | null);
  const kayitli = p?.hafta_notlari?.[haftaBas]?.metin ?? '';
  const [metin, setMetin] = useState(kayitli);
  const [durum, setDurum] = useState<string | null>(null);
  useEffect(() => { setMetin(kayitli); setDurum(null); }, [haftaBas, kayitli]);
  const notlar = kartlar.filter((k) => k.yorum).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const kim = h.h.tur === 'danisan' ? h.h.il.danisan_ad : '';
  return (
    <div className="rt-arac">
      <h4>Geri bildirim</h4>
      {notlar.length === 0 && <p className="rt-muted">Bu hafta karta not yok. {kim} kartı açıp &quot;💬 Not bırak&quot; ile yazar.</p>}
      {notlar.map((k) => (
        <div key={`${k.adim.id}|${k.tarih}`} className="rt-gb-not">
          <span className="ne">{tarihParse(k.tarih).toLocaleDateString('tr-TR', { weekday: 'short' })} · {k.adim.ad}</span>
          <span className="metin">💬 {k.yorum}</span>
        </div>
      ))}
      <label className="rt-alan rt-gb-deg">Haftalık değerlendirme
        <textarea className="rt-inp" rows={3} maxLength={1500} placeholder={`${kim} bu haftanın üstünde görür`} value={metin} onChange={(e) => { setMetin(e.target.value); setDurum(null); }} />
      </label>
      <div className="rt-satir">
        {durum && <span className={durum.startsWith('⚠') ? 'rt-hata' : 'rt-tamam'}>{durum}</span>}
        <button type="button" className="rt-btn primary" style={{ marginLeft: 'auto' }}
          disabled={!programId || hicGonderilmedi || metin.trim() === kayitli}
          onClick={async () => { try { await haftaNotuGonder(programId!, haftaBas, metin); setDurum(metin.trim() ? '✓ Gönderildi' : '✓ Kaldırıldı'); } catch (e) { setDurum('⚠ ' + (e as Error).message); } }}>
          {kayitli && !metin.trim() ? 'Kaldır' : kayitli ? 'Güncelle' : 'Gönder'}
        </button>
      </div>
      {(!programId || hicGonderilmedi) && <p className="rt-muted">Plan gönderilince değerlendirme yazabilirsin.</p>}
    </div>
  );
}

// ———————————————— Hedef seçici (4 ekim) ————————————————
// Gruplar: her danışmanlık alanı ayrı (Beslenme, Sınav…), Ailem, Kişisel programlarım. Kalabalıkta (30 öğrenci,
// 10 aile üyesi) arama kutusu ve "son seçilenler" çıkar; büyük gruplar kapalı başlar.

const kucuk = (x: string) => x.toLocaleLowerCase('tr');

function HedefSecici({ kapsam, hedefler, adaylar, seciliId, kompakt, kuruluyor, onSec, onAday, onYeniProgram, alanlar, bekleyen, sonlananlar, onDavet, onDavetIptal, onAlanEkle, acikAlan, kutAcik, onAlan, onKutuphane, gruplar, onGrup, onGrupKur, onUyeDavet, onYasamAlani, onDegerlendir }: {
  kapsam: Kapsam; hedefler: Hedef[]; adaylar: Aday[]; seciliId: string | null; kompakt: boolean; kuruluyor: string | null;
  onSec: (h: Hedef) => void; onAday: (a: Aday) => void; onYeniProgram: () => void;
  alanlar: string[]; bekleyen: DavetSatir[]; sonlananlar: IliskiRow[];
  onDavet: (disiplin: string) => void; onDavetIptal: (kod: string) => void; onAlanEkle: () => void;
  acikAlan: string | null; kutAcik: boolean; onAlan: (alan: string) => void; onKutuphane: () => void;
  gruplar: AileRow[]; onGrup: (id: string) => void; onGrupKur: () => void; onUyeDavet: (grup: string) => void;
  onYasamAlani: (id: string) => void; onDegerlendir: () => void;
}) {
  const dn = useDanismanlik();
  const [ara, setAra] = useState('');
  // 5 ekim — Rutinlerim: yaşam alanları üstte karo; dokununca rutinler o alana göre süzülür.
  useEffect(() => { if (kapsam === 'kendim') alanlariGaranti().catch(() => {}); }, [kapsam]);
  const yalanlar = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const gorunurAlan = yalanlar.filter((a) => !a.gizli);
  const suz = null as string | null; // 3. adım: karo artık alan sayfasını açar (süzme alan sayfasında)
  const [alanDuzen, setAlanDuzen] = useState(false);
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  const [sonAcik, setSonAcik] = useState<Record<string, boolean>>({});
  const [sonlar, setSonlar] = useState<string[]>([]);
  useEffect(() => { setSonlar(sonlariOku()); }, []);
  type Oge = { id: string; anahtar: string; ad: string; ic: string; grup: string; hedef?: Hedef; aday?: Aday; etiket?: string[] };
  // Grup üyeleri her grubun altında (aynı kişi iki grupta olabilir; seçince aynı plan açılır).
  const grupOgeleri: Oge[] = gruplar.flatMap((g) => g.uyeler.filter((u) => u.uye !== dn.uid && u.durum === 'aktif').map((u) => {
    const hedef = hedefler.find((x) => grupKisisi(x) && (x.h as { il: IliskiRow }).il.danisan === u.uye);
    const aday = hedef ? undefined : adaylar.find((a) => a.uye === u.uye);
    return { id: hedef?.id ?? `aile:${u.uye}`, anahtar: `${g.id}:${u.uye}`, ad: u.ad, ic: grupIkon(g), grup: `g:${g.id}`, hedef, aday };
  }).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')));
  const ogeler: Oge[] = [
    ...hedefler.filter((x) => x.grup !== GRUP_ETIKET && (!suz || x.etiket?.includes(suz))).map((x) => ({ id: x.id, anahtar: x.id, ad: x.ad, ic: x.ic, grup: x.grup, hedef: x, etiket: x.etiket })),
    ...grupOgeleri,
  ];
  // Gruplar: önce danışmanlık alanları (boş olsa da — davet buradan), sonra Ailem, sonra Kişisel programlarım.
  type Grup = { ad: string; ic: string; anahtar: string; alan?: string; dosya?: string; aile?: AileRow };
  const alanGruplari: Grup[] = Array.from(new Set([...alanlar, ...hedefler.filter((x) => x.h.tur === 'danisan' && !grupKisisi(x)).map((x) => (x.h as { il: IliskiRow }).il.disiplin)]))
    .map((d) => ({ ad: danismanlikBaslik(d), ic: DISIPLIN_IKON[d] ?? '🤝', anahtar: danismanlikBaslik(d), alan: d, dosya: d }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const bolumler: Grup[] = [
    ...alanGruplari,
    ...gruplar.map((g) => ({ ad: g.ad, ic: grupIkon(g), anahtar: `g:${g.id}`, aile: g })),
    ...(kapsam === 'kendim' ? [
      { ad: RUTIN_BOLUM, ic: '🌱', anahtar: RUTIN_BOLUM, dosya: 'kisisel' },
      ...(ogeler.some((o) => o.grup === OTURDU_BOLUM) ? [{ ad: OTURDU_BOLUM, ic: '✓', anahtar: OTURDU_BOLUM }] : []),
      ...(ogeler.some((o) => o.grup === ARSIV_BOLUM) ? [{ ad: ARSIV_BOLUM, ic: '🗄', anahtar: ARSIV_BOLUM }] : []),
    ] : []),
  ];
  const toplam = ogeler.length;
  const q = kucuk(ara.trim());
  const gorunen = q ? ogeler.filter((o) => kucuk(o.ad).includes(q)) : ogeler;
  const tikla = (o: Oge) => (o.hedef ? onSec(o.hedef) : o.aday && onAday(o.aday));
  const son = !q && !kompakt && toplam > 6 ? sonlar.map((id) => ogeler.find((o) => o.id === id)).filter((o): o is Oge => !!o).slice(0, 4) : [];
  const satir = (o: Oge) => (
    <button key={o.anahtar} type="button" className={`rt-hedef-sat${o.id === seciliId || o.id === kuruluyor ? ' on' : ''}${o.grup === OTURDU_BOLUM ? ' oturdu' : o.grup === ARSIV_BOLUM ? ' soluk' : ''}`} disabled={!!kuruluyor} onClick={() => tikla(o)}>
      <span className="ic">{o.ic}</span><span className="ad">{o.ad}</span>
      {kapsam === 'kendim' && !!o.etiket?.length && <span className="rt-etiket-ikon" aria-label={o.etiket.map((k) => yalanlar.find((a) => a.id === k)?.ad).filter(Boolean).join(', ')}>{o.etiket.map((k) => yalanlar.find((a) => a.id === k)?.ikon ?? '').join('')}</span>}
      {!kompakt && <span className="chev">›</span>}
    </button>
  );
  return (
    <div className={`rt-hedef-secici${kompakt ? ' kompakt' : ''}`}>
      {!kompakt && <p className="rt-ekran-bas">{KAPSAM_AD[kapsam]}</p>}
      {kapsam === 'kendim' && gorunurAlan.length > 0 && (
        <div className="rt-alan-blok">
          <DengeKarti onDegerlendir={onDegerlendir} />
          <AlanKarolari onAlan={onYasamAlani} kompakt={kompakt} />
          <AliskanlikOnerisi />
          <AjandadanRutinOnerisi onOlustu={() => { /* yeni rutin Kuruluyor listesinde görünür */ }} />
          <div className="rt-alan-alt">
            <span className="rt-muted">Alana dokun: değerlendirmesi ve rutinleri.</span>
            <button type="button" className="rt-linkbtn" onClick={() => setAlanDuzen(true)}>Alanları düzenle</button>
          </div>
        </div>
      )}
      {alanDuzen && <AlanlariDuzenle onKapat={() => setAlanDuzen(false)} />}
      {kapsam === 'cevre' && bolumler.length === 0 && (
        <p className="rt-muted rt-cevre-bos">Çevren; ailen, arkadaşların, ekibin ve danışmanlık verdiğin kişilerden oluşur. Bir grup kur ya da bir danışmanlık alanı aç; birbirinize görev verir, ortak liste tutarsınız.</p>
      )}
      {toplam > 8 && <input className="rt-inp rt-secici-ara" type="search" placeholder={kompakt ? 'Ara…' : `Ara (${toplam} kişi / program)`} value={ara} onChange={(e) => setAra(e.target.value)} />}
      {son.length > 1 && (
        <div className="rt-secici-son">
          <span className="rt-muted">Son seçilenler</span>
          <div className="rt-hedef-cipler">{son.map((o) => <button key={o.id} type="button" className={`rt-chip${o.id === seciliId ? ' on' : ''}`} onClick={() => tikla(o)}>{o.ic} {o.ad}</button>)}</div>
        </div>
      )}
      {bolumler.map((g) => {
        const tum = ogeler.filter((o) => o.grup === g.anahtar);
        const bolumOgeleri = gorunen.filter((o) => o.grup === g.anahtar);
        if (q && !bolumOgeleri.length) return null;
        const suzBos = kapsam === 'kendim' && !!suz && bolumOgeleri.length === 0;
        const varsayilan = g.anahtar === ARSIV_BOLUM ? tum.some((o) => o.id === seciliId) : tum.length <= 6 || tum.some((o) => o.id === seciliId);
        const ac = q ? true : acik[g.anahtar] ?? varsayilan;
        const yonetici = g.aile && benimAileRolum(g.aile)?.rol === 'yonetici';
        const davetliler = g.aile ? g.aile.uyeler.filter((u) => u.durum === 'davet') : [];
        const davetler_ = g.alan ? bekleyen.filter((x) => x.disiplin === g.alan) : [];
        const sonlanan = g.alan ? sonlananlar.filter((x) => x.disiplin === g.alan) : [];
        return (
          <div key={g.anahtar} className="rt-secici-grup">
            <div className="rt-grup-bas">
              <button type="button" className="rt-grup-ad" aria-expanded={ac} onClick={() => setAcik({ ...acik, [g.anahtar]: !ac })}>
                <span>{g.ic} {g.ad}</span><span className="say">{tum.length} {ac ? '▾' : '▸'}</span>
              </button>
              {g.dosya && <button type="button" className={`rt-alan-ac${acikAlan === g.dosya ? ' on' : ''}`} aria-label={`${g.ad} alan dosyası`} onClick={() => onAlan(g.dosya!)}>Alan ›</button>}
              {g.aile && <button type="button" className={`rt-alan-ac${acikAlan === g.aile.id ? ' on' : ''}`} aria-label={`${g.ad} grup dosyası`} onClick={() => onGrup(g.aile!.id)}>Grup ›</button>}
            </div>
            {ac && bolumOgeleri.map(satir)}
            {ac && suzBos && <p className="rt-muted rt-grup-bos">Bu alana dokunan rutin yok.</p>}
            {ac && !q && g.aile && (
              <>
                {davetliler.map((u) => (
                  <div key={u.uye} className="rt-hedef-sat bekliyor">
                    <span className="ic">✉️</span><span className="ad">{u.ad}</span><span className="ek">davet bekliyor</span>
                    {yonetici && <button type="button" className="rt-ikon" aria-label="Daveti geri al" onClick={() => aileAyril(g.aile!.id, u.uye).catch(() => {})}>×</button>}
                  </div>
                ))}
                {tum.length === 0 && !davetliler.length && <p className="rt-muted rt-grup-bos">Henüz yalnızsın.</p>}
                {yonetici && g.aile.uyeler.filter((u) => u.durum !== 'ayrildi').length < GRUP_SINIR && (
                  <button type="button" className="rt-hedef-sat yeni" onClick={() => onUyeDavet(g.aile!.id)}><span className="ic">✉️</span><span className="ad">＋ Üye davet et</span></button>
                )}
              </>
            )}
            {ac && !q && g.alan && (
              <>
                {davetler_.map((x) => (
                  <div key={x.kod} className="rt-hedef-sat bekliyor">
                    <span className="ic">✉️</span><span className="ad">{x.alici ?? 'Bağlantıyla davet'}</span>
                    <span className="ek">davet bekliyor</span>
                    <button type="button" className="rt-ikon" aria-label="Daveti iptal et" onClick={() => onDavetIptal(x.kod)}>×</button>
                  </div>
                ))}
                <button type="button" className="rt-hedef-sat yeni" onClick={() => onDavet(g.alan!)}>
                  <span className="ic">✉️</span><span className="ad">{g.alan === 'sinav' ? '＋ Yeni öğrenci' : '＋ Yeni danışan'}</span>
                </button>
                {sonlanan.length > 0 && (
                  <>
                    <button type="button" className="rt-hedef-sat soluk" onClick={() => setSonAcik({ ...sonAcik, [g.anahtar]: !sonAcik[g.anahtar] })}>
                      <span className="ic">{sonAcik[g.anahtar] ? '▾' : '▸'}</span><span className="ad">Sonlananlar ({sonlanan.length})</span>
                    </button>
                    {sonAcik[g.anahtar] && sonlanan.map((x) => (
                      <div key={x.id} className="rt-hedef-sat soluk"><span className="ic" /><span className="ad">{x.danisan_ad}</span><span className="ek">sonlandı</span></div>
                    ))}
                  </>
                )}
              </>
            )}
            {ac && !q && g.anahtar === RUTIN_BOLUM && (
              <button type="button" className="rt-hedef-sat yeni" onClick={onYeniProgram}><span className="ic">＋</span><span className="ad">Yeni rutin</span></button>
            )}
          </div>
        );
      })}
      {q && gorunen.length === 0 && <p className="rt-muted">“{ara}” bulunamadı.</p>}
      {!q && kapsam === 'cevre' && (
        <div className="rt-secici-alt">
          <button type="button" className="rt-linkbtn" onClick={onGrupKur}>＋ Grup kur</button>
          <button type="button" className="rt-linkbtn" onClick={onAlanEkle}>＋ Danışmanlık alanı aç</button>
        </div>
      )}
      {!q && kapsam === 'kendim' && (
        <button type="button" className={`rt-kut-sat${kutAcik ? ' on' : ''}`} onClick={onKutuphane}>
          <span className="ic">📚</span><span className="tx"><b>Kütüphane</b><small>genel kartların ve klasörlerin</small></span>{!kompakt && <span className="chev">›</span>}
        </button>
      )}
    </div>
  );
}

// ———————————————— Gruplar (5 ekim): kur, davet et, grup dosyası ————————————————
// Aile / arkadaş / ekip — davranış aynı: herkes gruptakilere görev verir, ortak liste ve ortak kart.
// Yönetici üye davet eder, çıkarır; yönetici ayrılırsa grup dağılır. En fazla 12 kişi.

function GrupKurModal({ onKapat, onKuruldu }: { onKapat: () => void; onKuruldu: (id: string) => void }) {
  const [tur, setTur] = useState<GrupTur>('aile');
  const [ad, setAd] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const kur = async () => {
    setBekle(true); setHata(null);
    try { onKuruldu(await aileKur(ad.trim(), tur)); }
    catch (e) { setHata(e instanceof Error ? e.message : String(e)); setBekle(false); }
  };
  return (
    <Modal baslik="＋ Grup kur" onKapat={onKapat}>
      {(Object.keys(GRUP_TUR) as GrupTur[]).map((k) => (
        <button key={k} type="button" className={`rt-tur-kart${tur === k ? ' on' : ''}`} aria-pressed={tur === k} onClick={() => setTur(k)}>
          <span className="ic">{GRUP_TUR[k].ikon}</span><span><b>{GRUP_TUR[k].ad}</b><small>{GRUP_TUR[k].aciklama}</small></span>
        </button>
      ))}
      <input className="rt-inp" placeholder={`Grup adı (${GRUP_TUR[tur].ornek})`} value={ad} onChange={(e) => setAd(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && ad.trim() && !bekle) kur(); }} />
      <p className="rt-muted">En fazla {GRUP_SINIR} kişi. Gruptakiler birbirine görev verir, ortak liste tutar; kimse kimsenin ajandasının geri kalanını görmez.</p>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim() || bekle} onClick={kur}>{bekle ? 'Kuruluyor…' : 'Kur'}</button>
      </div>
    </Modal>
  );
}

function UyeDavetModal({ grup, onKapat }: { grup: string; onKapat: () => void }) {
  const g = useCanli(async () => (await db.aile.get(grup)) ?? null, [grup], null as AileRow | null);
  const [eposta, setEposta] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [tamam, setTamam] = useState<string | null>(null);
  const gonder = async () => {
    setBekle(true); setHata(null); setTamam(null);
    try { const ad = await aileDavet(grup, eposta.trim()); setTamam(`${ad} davet edildi; Gelenler'inde görecek.`); setEposta(''); }
    catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setBekle(false); }
  };
  return (
    <Modal baslik={`✉️ ${g ? `${grupIkon(g)} ${g.ad}` : 'Gruba'} davet`} onKapat={onKapat}>
      <p className="rt-muted">Ritos kullanan birini e-postasıyla davet et. Kabul edince grupta görünür.</p>
      <input className="rt-inp" type="email" placeholder="E-posta" value={eposta} onChange={(e) => setEposta(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && /\S+@\S+\.\S+/.test(eposta) && !bekle) gonder(); }} autoFocus />
      {hata && <p className="rt-hata">{hata}</p>}
      {tamam && <p className="rt-tamam">{tamam}</p>}
      <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="rt-btn" onClick={onKapat}>{tamam ? 'Kapat' : 'Vazgeç'}</button>
        <button type="button" className="rt-btn primary" disabled={!/\S+@\S+\.\S+/.test(eposta) || bekle} onClick={gonder}>{bekle ? 'Gönderiliyor…' : 'Davet et'}</button>
      </div>
    </Modal>
  );
}

function GrupDosyasi({ id, hedefler, adaylar, onSec, onAday, onUyeDavet, onBitti }: {
  id: string; hedefler: Hedef[]; adaylar: Aday[]; onSec: (h: Hedef) => void; onAday: (a: Aday) => void; onUyeDavet: () => void; onBitti: () => void;
}) {
  const dn = useDanismanlik();
  const g = useCanli(async () => (await db.aile.get(id)) ?? null, [id], undefined as AileRow | null | undefined);
  const [onay, setOnay] = useState<null | { uye: string; ad: string } | 'ayril'>(null);
  const [hata, setHata] = useState<string | null>(null);
  if (g === undefined) return null;
  if (!g || !aileAktifMi(g)) return <p className="rt-muted">Bu grupta artık değilsin.</p>;
  const ben = benimAileRolum(g);
  const yonetici = ben?.rol === 'yonetici';
  const uyeler = g.uyeler.filter((u) => u.durum !== 'ayrildi').sort((a, b) => (a.uye === dn.uid ? -1 : b.uye === dn.uid ? 1 : a.ad.localeCompare(b.ad, 'tr')));
  const calistir = async (f: () => Promise<unknown>) => { setHata(null); try { await f(); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); } };
  const tur = GRUP_TUR[grupTuru(g)];
  return (
    <div className="rt-grup-dosyasi">
      <div className="rt-tek"><span className="ic">{tur.ikon}</span><span className="tx"><b>{g.ad}</b><small>{tur.ad} grubu · {uyeler.filter((u) => u.durum === 'aktif').length} kişi</small></span></div>
      <div className="rt-arac">
        <h4>Üyeler</h4>
        {uyeler.map((u) => {
          const hedef = hedefler.find((x) => grupKisisi(x) && (x.h as { il: IliskiRow }).il.danisan === u.uye);
          const aday = adaylar.find((a) => a.uye === u.uye);
          const benim = u.uye === dn.uid;
          const acilir = !benim && u.durum === 'aktif' && (hedef || aday);
          return (
            <div key={u.uye} className="rt-grup-uye">
              <button type="button" className="rt-grup-uye-ad" disabled={!acilir} onClick={() => (hedef ? onSec(hedef) : aday && onAday(aday))}>
                <b>{u.ad}{benim ? ' (sen)' : ''}</b>
                <small>{u.rol === 'yonetici' ? 'yönetici' : u.durum === 'davet' ? 'davet bekliyor' : 'üye'}{acilir ? ' · görev ver ›' : ''}</small>
              </button>
              {yonetici && !benim && <button type="button" className="rt-ikon" aria-label={u.durum === 'davet' ? 'Daveti geri al' : 'Gruptan çıkar'} onClick={() => setOnay({ uye: u.uye, ad: u.ad })}>×</button>}
            </div>
          );
        })}
        {yonetici && uyeler.length < GRUP_SINIR && <button type="button" className="rt-btn" style={{ marginTop: 8 }} onClick={onUyeDavet}>✉️ Üye davet et</button>}
        {!yonetici && <p className="rt-muted">Üyeleri grubun yöneticisi davet eder.</p>}
      </div>
      <div className="rt-arac">
        <h4>Birlikte</h4>
        <p className="rt-muted">Birine görev vermek için adına dokun. Ortak listeler Home&apos;da; ortak kart için Ajandam&apos;da yeni kartta &quot;Ortak kart&quot;ı seç.</p>
      </div>
      <div className="rt-satir" style={{ marginTop: 4 }}>
        <button type="button" className="rt-btn tehlike" onClick={() => setOnay('ayril')}>{yonetici ? 'Grubu dağıt' : 'Gruptan ayrıl'}</button>
      </div>
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      {onay === 'ayril' && (
        <OnayKutusu metin={yonetici ? `"${g.ad}" dağıtılsın mı? Herkes gruptan çıkar; başka ortak grubu olmayanlarla görevler biter.` : `"${g.ad}" grubundan ayrılınca başka ortak grubunuz olmayanlarla görevler biter.`}
          evet={yonetici ? 'Dağıt' : 'Ayrıl'} onVazgec={() => setOnay(null)}
          onEvet={() => { setOnay(null); calistir(async () => { await aileAyril(g.id); onBitti(); }); }} />
      )}
      {onay && onay !== 'ayril' && (
        <OnayKutusu metin={`${onay.ad} gruptan çıkarılsın mı? Yeni mesajları ve ortak listeleri göremez.`} evet="Çıkar"
          onVazgec={() => setOnay(null)} onEvet={() => { const u = onay.uye; setOnay(null); calistir(() => aileAyril(g.id, u)); }} />
      )}
    </div>
  );
}

// ———————————————— Yaşam alanlarını düzenle (5 ekim) ————————————————
// Sırala (↑ ↓), gizle / göster, ad · simge · açıklama düzenle, ＋ yeni alan; yalnız kendi eklediğin alan silinir.

function AlanlariDuzenle({ onKapat }: { onKapat: () => void }) {
  const liste = useCanli(yAlanlar, [], [] as YasamAlaniRow[]);
  const [duz, setDuz] = useState<null | { id?: string; ad: string; ikon: string; aciklama: string }>(null);
  const [sil, setSil] = useState<YasamAlaniRow | null>(null);
  const gorunen = liste.filter((a) => !a.gizli).length;
  const tasi = (i: number, y: -1 | 1) => { const s = liste.map((a) => a.id); const j = i + y; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; alanSirala(s); };
  if (duz) {
    return (
      <Modal baslik={duz.id ? 'Alanı düzenle' : '＋ Yeni alan'} onKapat={() => setDuz(null)}>
        <div className="rt-prog-ad">
          <span className="rt-prog-ikon" aria-hidden="true">{duz.ikon}</span>
          <input className="rt-inp" placeholder="Ad (ör. İş, Maddi düzen, İnanç)" value={duz.ad} onChange={(e) => setDuz({ ...duz, ad: e.target.value })} autoFocus />
        </div>
        <div className="rt-ikon-izgara" role="radiogroup" aria-label="Simge">
          {ALAN_IKONLARI.map((x) => <button key={x} type="button" role="radio" aria-checked={duz.ikon === x} className={duz.ikon === x ? 'on' : ''} onClick={() => setDuz({ ...duz, ikon: x })}>{x}</button>)}
        </div>
        <input className="rt-inp" placeholder="Kısa açıklama (isteğe bağlı)" value={duz.aciklama} onChange={(e) => setDuz({ ...duz, aciklama: e.target.value })} />
        <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="rt-btn" onClick={() => setDuz(null)}>Vazgeç</button>
          <button type="button" className="rt-btn primary" disabled={!duz.ad.trim()} onClick={async () => {
            if (duz.id) await alanGuncelle(duz.id, { ad: duz.ad.trim(), ikon: duz.ikon, aciklama: duz.aciklama.trim() });
            else await yAlanEkle(duz.ad, duz.ikon, duz.aciklama);
            setDuz(null);
          }}>{duz.id ? 'Kaydet' : 'Ekle'}</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal baslik="Alanları düzenle" onKapat={onKapat}>
      <p className="rt-muted">Alanlar rutinlerine etiket olur; dengeyi bunlar üzerinden görürsün. Hazır alanlar silinmez, gizlenir.</p>
      <div className="rt-alan-duzen">
        {liste.map((a, i) => (
          <div key={a.id} className={`rt-alan-duzen-sat${a.gizli ? ' gizli' : ''}`}>
            <span className="ic">{a.ikon}</span>
            <button type="button" className="tx" onClick={() => setDuz({ id: a.id, ad: a.ad, ikon: a.ikon, aciklama: a.aciklama })}><b>{a.ad}</b><small>{a.aciklama || (a.kod ? 'hazır alan' : 'kendi alanın')}</small></button>
            <button type="button" className="rt-ikon" aria-label={`${a.ad} yukarı`} disabled={i === 0} onClick={() => tasi(i, -1)}>↑</button>
            <button type="button" className="rt-ikon" aria-label={`${a.ad} aşağı`} disabled={i === liste.length - 1} onClick={() => tasi(i, 1)}>↓</button>
            <button type="button" className="rt-ikon" aria-label={a.gizli ? `${a.ad} göster` : `${a.ad} gizle`} title={a.gizli ? 'Göster' : 'Gizle'}
              disabled={a.gizli && gorunen >= EN_FAZLA_GORUNEN} onClick={() => alanGuncelle(a.id, { gizli: !a.gizli })}>{a.gizli ? '🙈' : '👁'}</button>
            {!a.kod && <button type="button" className="rt-ikon" aria-label={`${a.ad} sil`} onClick={() => setSil(a)}>🗑</button>}
          </div>
        ))}
      </div>
      {gorunen >= EN_FAZLA_GORUNEN && <p className="rt-muted">En fazla {EN_FAZLA_GORUNEN} alan görünür; yenisini göstermek için birini gizle.</p>}
      {sil && <OnayKutusu metin={`"${sil.ad}" silinsin mi? Rutinlerdeki bu etiket de kalkar.`} evet="Sil" onVazgec={() => setSil(null)} onEvet={async () => { await alanSil(sil.id); setSil(null); }} />}
      <div className="rt-satir" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="rt-btn" disabled={gorunen >= EN_FAZLA_GORUNEN} onClick={() => setDuz({ ad: '', ikon: '🌿', aciklama: '' })}>＋ Yeni alan</button>
        <button type="button" className="rt-btn primary" onClick={onKapat}>Bitti</button>
      </div>
    </Modal>
  );
}

// ———————————————— Kişisel program: oluştur / düzenle (4 ekim) ————————————————

function ProgramFormu({ id, etiket0, onKapat, onOlustu }: { id?: string; etiket0?: string[]; onKapat: () => void; onOlustu: (id: string) => void }) {
  const p = useCanli(async () => (id ? (await db.program.get(id)) ?? null : null), [id], null as ProgramRow | null);
  const [ad, setAd] = useState('');
  const [amac, setAmac] = useState('');
  const [ikon, setIkon] = useState<string | null>(null); // null = ada göre öneri
  const [etiket, setEtiket] = useState<string[]>(etiket0 ?? []);
  const [hazir, setHazir] = useState(!id);
  useEffect(() => { if (p && !hazir) { setAd(p.ad); setAmac(p.amac); setIkon(p.ikon ?? null); setEtiket(p.alanlar ?? []); setHazir(true); } }, [p, hazir]);
  useEffect(() => { alanlariGaranti().catch(() => {}); }, []);
  const yalanlar = useCanli(yAlanlar, [], [] as YasamAlaniRow[]).filter((a) => !a.gizli || etiket.includes(a.id));
  const alanOnerisi = alanOner(ad).filter((x) => !etiket.includes(x));
  const oneri = ikonOner(ad);
  const secili = ikon ?? oneri ?? VARSAYILAN_IKON;
  const kaydet = async () => {
    if (!ad.trim()) return;
    if (id) { await programGuncelle(id, { ad: ad.trim(), amac: amac.trim(), ikon: secili, alanlar: etiket }); onKapat(); return; }
    const yeni = await programOlustur(ad.trim(), amac.trim());
    await programGuncelle(yeni, { ikon: secili, kimden: 'Kendim', alanlar: etiket });
    onOlustu(yeni);
  };
  return (
    <Modal baslik={id ? 'Rutini düzenle' : 'Yeni rutin'} onKapat={onKapat}>
      {!hazir ? <p className="rt-muted">…</p> : (
        <>
          <div className="rt-prog-ad">
            <span className="rt-prog-ikon" aria-hidden="true">{secili}</span>
            <input className="rt-inp" placeholder="Ad (ör. Gitar çalışması, Sabah koşusu)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
          </div>
          <div className="rt-ikon-izgara" role="radiogroup" aria-label="Simge">
            {Array.from(new Set([...(oneri ? [oneri] : []), ...IKON_SECENEKLERI])).map((x) => (
              <button key={x} type="button" role="radio" aria-checked={secili === x} className={`${secili === x ? 'on' : ''}${x === oneri && ikon === null ? ' oneri' : ''}`} onClick={() => setIkon(x)}>{x}</button>
            ))}
          </div>
          <p className="rt-muted">{ikon === null && oneri ? 'Simge addan önerildi; istersen başka birini seç.' : 'Simge, programın kartlarında ve listelerde görünür.'}</p>
          <span className="rt-alan-lbl">Hangi alanlara dokunuyor?</span>
          <div className="rt-alan-sec">
            {yalanlar.map((a) => {
              const sec = etiket.includes(a.id), oner = !sec && alanOnerisi.includes(a.id);
              return <button key={a.id} type="button" aria-pressed={sec} className={`rt-chip${sec ? ' on' : ''}${oner ? ' oneri' : ''}`} onClick={() => setEtiket(sec ? etiket.filter((x) => x !== a.id) : [...etiket, a.id])}>{a.ikon} {a.ad}{oner ? ' ＋' : ''}</button>;
            })}
          </div>
          <p className="rt-muted">{alanOnerisi.length ? 'Kesik çerçeveliler addan önerildi. ' : ''}Birden çok alan seçebilirsin; hiç seçmesen de olur.</p>
          <textarea className="rt-inp" rows={2} placeholder="Amaç (isteğe bağlı)" value={amac} onChange={(e) => setAmac(e.target.value)} />
          <div className="rt-satir" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
            <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={kaydet}>{id ? 'Kaydet' : 'Oluştur'}</button>
          </div>
          {!id && <p className="rt-muted">Oluşunca haftasını açarız; kartlarını günlere eklersin, Ajandam&apos;a da düşer.</p>}
        </>
      )}
    </Modal>
  );
}

// ———————————————— Beslenme (4 ekim): bilgiler + hesap, başlangıç adımları, kilo takibi ————————————————

const sec2 = <T extends string>(liste: [T, string][], deger: string | undefined, onSec: (v: T) => void) => (
  <div className="rt-chips">{liste.map(([v, a]) => <button key={v} type="button" className={`rt-chip${deger === v ? ' on' : ''}`} onClick={() => onSec(v)}>{a}</button>)}</div>
);

function BeslenmeFormu({ b, setB }: { b: Record<string, string>; setB: (b: Record<string, string>) => void }) {
  const d = (k: string, v: string) => setB({ ...b, [k]: v });
  const sayiAlan = (k: string, ad: string, birim: string, ipucu = '') => (
    <label className="rt-bilgi-sat"><span>{ad}</span><input className="rt-inp" inputMode="decimal" value={b[k] ?? ''} placeholder={ipucu} onChange={(e) => d(k, e.target.value)} /><em className="birim">{birim}</em></label>
  );
  const hedef = b.hedef || '';
  return (
    <>
      <div className="rt-arac">
        <h4>Kişi</h4>
        {sec2<'k' | 'e'>([['k', 'Kadın'], ['e', 'Erkek']], b.cinsiyet, (v) => d('cinsiyet', v))}
        {sayiAlan('dogum_yili', 'Doğum yılı', '', 'ör. 1988')}
        {sayiAlan('boy', 'Boy', 'cm')}
        {sayiAlan('baslangic_kilo', 'Başlangıç kilosu', 'kg')}
        <p className="rt-bilgi-bas">Aktivite</p>
        <div className="rt-chips">{AKTIVITE.map(([v, a, ac]) => <button key={v} type="button" title={ac} className={`rt-chip${b.aktivite === v ? ' on' : ''}`} onClick={() => d('aktivite', v)}>{a}</button>)}</div>
        {b.aktivite && <p className="rt-muted">{AKTIVITE.find(([v]) => v === b.aktivite)?.[2]}</p>}
      </div>
      <div className="rt-arac">
        <h4>Hedef</h4>
        {sec2<HedefTur>([['ver', 'Kilo ver'], ['koru', 'Koru'], ['al', 'Kilo al']], hedef, (v) => d('hedef', v))}
        {hedef && hedef !== 'koru' && (
          <>
            {sayiAlan('hedef_kilo', 'Hedef kilo', 'kg')}
            <p className="rt-bilgi-bas">Hız</p>
            {sec2(HIZLAR.filter(([v]) => hedef === 'ver' || v !== '0.75'), b.hiz || '0.5', (v) => d('hiz', v))}
          </>
        )}
      </div>
      <div className="rt-arac">
        <h4>Tercihler</h4>
        <label className="rt-bilgi-sat"><span>Tercihler</span><input className="rt-inp" value={b.tercihler ?? ''} placeholder="ör. laktoz azaltılmış, ara öğün sever" onChange={(e) => d('tercihler', e.target.value)} /></label>
        <label className="rt-bilgi-sat"><span>Kaçındıkları</span><input className="rt-inp" value={b.kacindiklari ?? ''} onChange={(e) => d('kacindiklari', e.target.value)} /></label>
      </div>
      <HesapKutusu b={b} setB={setB} />
    </>
  );
}

function HesapKutusu({ b, setB }: { b: Record<string, string>; setB?: (b: Record<string, string>) => void }) {
  const { hesap, eksik } = beslenmeHesap(b);
  if (!hesap) return <div className="rt-arac rt-hesap"><h4>Hesap</h4><p className="rt-muted">Hesap için eksik: {eksik.join(', ')}.</p></div>;
  const tr = (n: number) => n.toLocaleString('tr-TR');
  return (
    <div className="rt-arac rt-hesap">
      <h4>Hesap</h4>
      <div className="rt-hesap-buyuk"><b>{tr(hesap.hedefKcal)}</b> kcal/gün{hesap.elle && <span className="rt-etk">elle</span>}</div>
      <div className="rt-hesap-izgara">
        <span>VKİ</span><b>{hesap.vki?.toLocaleString('tr-TR')} · {hesap.vki ? vkiEtiket(hesap.vki) : ''}</b>
        <span>Bazal</span><b>{tr(hesap.bazal)} kcal</b>
        <span>Günlük harcama</span><b>{tr(hesap.harcama)} kcal</b>
        {hesap.hedef !== 'koru' && <><span>Önerilen</span><b>{tr(hesap.onerilen)} kcal ({hesap.hedef === 'ver' ? '−' : '+'}{tr(Math.abs(hesap.harcama - hesap.onerilen))})</b></>}
        <span>Protein · yağ · karb.</span><b>{hesap.makro.protein} g · {hesap.makro.yag} g · {hesap.makro.karb} g</b>
        <span>Su</span><b>{(hesap.su / 1000).toLocaleString('tr-TR')} L</b>
        {hesap.sureHafta !== null && <><span>Hedefe tahmini</span><b>{hesap.sureHafta} hafta</b></>}
      </div>
      {setB && (
        <label className="rt-bilgi-sat"><span>Elle düzelt</span><input className="rt-inp" inputMode="numeric" value={b.kalori_elle ?? ''} placeholder={String(hesap.onerilen)} onChange={(e) => setB({ ...b, kalori_elle: e.target.value })} /><em className="birim">kcal</em></label>
      )}
      {hesap.uyarilar.map((u) => <p key={u} className="rt-hata">⚠ {u}</p>)}
      <p className="rt-muted">Mifflin-St Jeor ile hesaplanır; rehberdir, kararı sen verirsin. Klinik değerlendirme gerekiyorsa diyetisyen uygulamasında yap.</p>
    </div>
  );
}

/** Plan'ın başında: bilgiler → şablondan başlat → haftalık tartı. Hepsi bitince gizlenir. */
function BeslenmeBaslangic({ h, haftaBas, onBilgiler }: { h: Hedef; haftaBas: string; onBilgiler: () => void }) {
  const il = (h.h as { il: IliskiRow }).il;
  const ayar = useCanli(async () => (await db.iliski_ayar.get(il.id)) ?? null, [il.id], undefined as IliskiAyarRow | null | undefined);
  const plan = useCanli(async () => {
    const p = (await db.program.toArray()).find((x) => x.uzak?.rol === 'koc' && x.uzak.iliski_id === il.id && x.uzak.plan && x.uzak.durum !== 'ret' && x.uzak.durum !== 'ayrildi');
    const adimlar = p ? await db.program_adim.where('program_id').equals(p.id).toArray() : [];
    return { kart: adimlar.length, tarti: adimlar.some((a) => a.bloklar.some((bl) => bl.tur === 'sayi' && bl.anahtar === `${OLC_ONEK}kilo`)) };
  }, [il.id], null as { kart: number; tarti: boolean } | null);
  const kendi = useHaftaSablonlari('beslenme');
  const hazir = useHazirSablonlar('beslenme');
  useEffect(() => { hazirSablonlariYenile().catch(() => {}); }, []);
  const [acik, setAcik] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  if (ayar === undefined || !plan) return null;
  const b = ayar?.bilgiler ?? {};
  const { hesap } = beslenmeHesap(b);
  const adim1 = !!hesap, adim2 = plan.kart > (plan.tarti ? 1 : 0), adim3 = plan.tarti;
  if (adim1 && adim2 && adim3) return null;
  const adKcal = (ad: string) => { const m = /(\d[\d.]*)\s*kcal/i.exec(ad); return m ? Number(m[1].replace('.', '')) : null; };
  // Kendi şablonları + hazır şablonlar, hedef kaloriye yakınlığa göre.
  type Sec = { id: string; ad: string; kcal: number | null; hazir: boolean; onayli?: boolean; kartlar: () => Promise<HaftaKarti[]> };
  const sablonlar: Sec[] = [
    ...kendi.map((p) => ({ id: p.id, ad: p.ad, kcal: adKcal(p.ad), hazir: false, kartlar: () => sablonKartlari(p.id) })),
    ...hazir.map((x) => ({ id: x.kod, ad: x.ad, kcal: x.kcal ?? adKcal(x.ad), hazir: true, onayli: x.onayli, kartlar: async () => hazirKartlar(x) })),
  ];
  const sirali = [...sablonlar].sort((a, x) => {
    const hk = hesap?.hedefKcal ?? 0;
    return (a.kcal === null ? 1e9 : Math.abs(a.kcal - hk)) - (x.kcal === null ? 1e9 : Math.abs(x.kcal - hk));
  });
  const uygula = async (p: Sec, hafta: number) => {
    setHata(null);
    try { const n = await haftaUygula(h.h, await p.kartlar(), haftaBas, hafta); setBilgi(`"${p.ad}" ${hafta} haftaya uygulandı: ${n} kart.`); setAcik(false); }
    catch (e) { setHata((e as Error).message); }
  };
  const tartiEkle = async () => {
    setHata(null);
    const kilo = HAZIR_OLCULER.find((x) => x.id === 'kilo')!, bel = HAZIR_OLCULER.find((x) => x.id === 'bel')!;
    try {
      await kocKartEkle(h.h, bugun(), { ad: 'Haftalık tartı', bloklar: [{ tur: 'metin', metin: 'Sabah aç karnına, tuvaletten sonra.' }, olcuBlok(kilo), olcuBlok(bel)] }, { gun: null, gunler: [1] });
      setBilgi('Her pazartesi "Haftalık tartı" kartı eklendi.');
    } catch (e) { setHata((e as Error).message); }
  };
  return (
    <div className="rt-arac rt-baslangic">
      <h4>Başlangıç</h4>
      <div className={`rt-adim${adim1 ? ' tamam' : ''}`}>
        <span className="no">{adim1 ? '✓' : '1'}</span>
        <span className="tx"><b>Bilgiler ve hesap</b>{hesap ? <small>{hesap.hedefKcal.toLocaleString('tr-TR')} kcal/gün · {hesap.hedef === 'ver' ? 'kilo verme' : hesap.hedef === 'al' ? 'kilo alma' : 'koruma'}</small> : <small>boy, kilo, aktivite, hedef</small>}</span>
        {!adim1 && <button type="button" className="rt-btn primary" onClick={onBilgiler}>Doldur</button>}
      </div>
      <div className={`rt-adim${adim2 ? ' tamam' : ''}`}>
        <span className="no">{adim2 ? '✓' : '2'}</span>
        <span className="tx"><b>Şablondan başlat</b><small>{sablonlar.length ? 'hedef kaloriye en yakın şablon üstte' : 'henüz beslenme şablonu yok — bir haftayı kurup "Haftayı şablon kaydet" de'}</small></span>
        {!adim2 && sablonlar.length > 0 && <button type="button" className="rt-btn" onClick={() => setAcik(!acik)}>{acik ? 'Kapat' : 'Seç'}</button>}
      </div>
      {acik && (
        <div className="rt-sablon-sec">
          {sirali.map((p, i) => {
            const k = p.kcal, fark = k && hesap ? k - hesap.hedefKcal : null;
            return (
              <div key={p.id} className="rt-sablon-oge">
                <span className="tx"><b>{p.ad}</b>{p.hazir && <small className="hazir">{p.onayli ? 'hazır · ✓ uzman onaylı' : 'hazır · örnek'}</small>}{fark !== null && <small>{fark === 0 ? 'hedefle aynı' : `hedeften ${fark > 0 ? '+' : ''}${fark} kcal${Math.abs(fark) > 50 ? ` · porsiyonları ~%${Math.round(Math.abs(fark) / k! * 100)} ${fark > 0 ? 'azalt' : 'artır'}` : ''}`}</small>}{i === 0 && k && hesap && <small className="oner"> · önerilen</small>}</span>
                <button type="button" className="rt-btn" onClick={() => uygula(p, 1)}>1 hafta</button>
                <button type="button" className="rt-btn" onClick={() => uygula(p, 4)}>4 hafta</button>
              </div>
            );
          })}
          <p className="rt-muted">Şablon adında kalori yazarsan (ör. &quot;1.800 kcal — 1. hafta&quot;) hedefe göre sıralanır.</p>
        </div>
      )}
      <div className={`rt-adim${adim3 ? ' tamam' : ''}`}>
        <span className="no">{adim3 ? '✓' : '3'}</span>
        <span className="tx"><b>Haftalık tartı</b><small>her pazartesi kilo ve bel — Gelişim&apos;de beklenen çizgiyle karşılaştırılır</small></span>
        {!adim3 && <button type="button" className="rt-btn" onClick={tartiEkle}>Ekle</button>}
      </div>
      {bilgi && <p className="rt-tamam">{bilgi}</p>}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
    </div>
  );
}

/** Gelişim: kilo serisi ↔ beklenen çizgi; plana uygun mu. */
function KiloTakip({ h }: { h: Hedef }) {
  const il = (h.h as { il: IliskiRow }).il;
  const ayar = useCanli(async () => (await db.iliski_ayar.get(il.id)) ?? null, [il.id], undefined as IliskiAyarRow | null | undefined);
  const t0 = bugun();
  const gunler = Array.from({ length: 84 }, (_, i) => tarihEkle(t0, i - 83));
  const veri = useCanli(() => danisanGunleri(h.h, gunler), [h.id, t0], {} as Record<string, KocKarti[]>);
  const b = ayar?.bilgiler ?? {};
  const { hesap } = beslenmeHesap(b);
  const noktalar = gunler.flatMap((t) => (veri[t] ?? []).map((k) => ({ t, v: Number((k.degerler as Record<string, unknown> | null)?.[`${OLC_ONEK}kilo`]) })))
    .filter((p) => Number.isFinite(p.v) && p.v > 0);
  if (!hesap) return <div className="rt-arac"><h4>Kilo takibi</h4><p className="rt-muted">Bilgiler sekmesinde boy, kilo, aktivite ve hedefi gir; beklenen çizgi buradan izlenir.</p></div>;
  const son = noktalar[noktalar.length - 1];
  // İlk 2 hafta su kaybı ve dalgalanma olağandır; değerlendirme sonrasına bırakılır.
  const gecenGun = b.baslangic_tarihi && son ? Math.round((new Date(son.t).getTime() - new Date(b.baslangic_tarihi).getTime()) / 86400000) : 0;
  const erken = !!son && gecenGun < 14;
  const durum = son && !erken ? kiloDurumu(b, son) : null;
  const bas = Number(String(b.baslangic_kilo).replace(',', '.'));
  // Grafik: başlangıç tarihinden (ya da 12 hafta önceden) bugüne; beklenen çizgi + ölçümler
  const ilk = b.baslangic_tarihi && b.baslangic_tarihi > gunler[0] ? b.baslangic_tarihi : gunler[0];
  const xs = (t: string) => (new Date(t).getTime() - new Date(ilk).getTime()) / (new Date(t0).getTime() - new Date(ilk).getTime() || 1);
  const bekl = [ilk, t0].map((t) => ({ t, v: beklenenKilo(b, t) ?? bas }));
  const tum = [...noktalar.map((p) => p.v), ...bekl.map((p) => p.v), bas];
  const mn = Math.min(...tum) - 0.5, mx = Math.max(...tum) + 0.5;
  const W = 280, H = 90, px = (t: string) => 4 + xs(t) * (W - 8), py = (v: number) => H - 6 - ((v - mn) / (mx - mn)) * (H - 12);
  const tr = (n: number) => n.toLocaleString('tr-TR');
  return (
    <div className="rt-arac rt-kilo-takip">
      <h4>Kilo takibi</h4>
      <div className="rt-kilo-ozet">
        <span><small>Başlangıç</small><b>{tr(bas)} kg</b></span>
        <span><small>Son</small><b>{son ? `${tr(son.v)} kg` : '—'}</b></span>
        <span><small>Hedef</small><b>{b.hedef_kilo ? `${b.hedef_kilo} kg` : b.hedef === 'koru' ? 'koru' : '—'}</b></span>
        <span><small>Kalori</small><b>{tr(hesap.hedefKcal)}</b></span>
      </div>
      {b.baslangic_tarihi ? (
        <svg className="rt-kilo-grafik" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kilo: beklenen çizgi ve ölçümler">
          <line x1={px(bekl[0].t)} y1={py(bekl[0].v)} x2={px(bekl[1].t)} y2={py(bekl[1].v)} className="bekl" />
          {noktalar.length > 1 && <polyline points={noktalar.filter((p) => p.t >= ilk).map((p) => `${px(p.t)},${py(p.v)}`).join(' ')} className="gercek" />}
          {noktalar.filter((p) => p.t >= ilk).map((p) => <circle key={p.t} cx={px(p.t)} cy={py(p.v)} r="3" className="nokta" />)}
        </svg>
      ) : <p className="rt-muted">Başlangıç tarihi Bilgiler kaydedilince yazılır.</p>}
      <p className="rt-muted rt-kilo-acik">— — beklenen · ● ölçüm</p>
      {!son && <p className="rt-muted">Henüz kilo ölçümü yok. Plan&apos;daki &quot;Haftalık tartı&quot; kartı doldurulunca burada görünür.</p>}
      {erken && <div className="rt-kilo-durum"><b>İlk iki hafta</b> · su kaybı ve dalgalanma olağan; plana uygunluk {tarihEtiket(tarihEkle(b.baslangic_tarihi!, 14))} sonrası değerlendirilir.</div>}
      {durum && (
        <div className={`rt-kilo-durum ${durum.tur}`}>
          <b>{durum.tur === 'uygun' ? '✓ Plana uygun' : durum.tur === 'yavas' ? '⏳ Yavaş' : durum.tur === 'hizli' ? '⚡ Hızlı' : '⚠ Ters yönde'}</b> · {durum.metin}
          <br /><span>{durum.oneri}</span>
        </div>
      )}
    </div>
  );
}


// ———————————————— Hazır şablonlar (4 ekim) ————————————————

function HazirSablonlar({ alan }: { alan: string }) {
  const liste = useHazirSablonlar(alan);
  const benim = useCanli(() => db.program.filter((p) => !!p.sablon && p.kimden === 'Ritos hazır şablon').toArray(), [], [] as ProgramRow[]);
  const [mesaj, setMesaj] = useState<string | null>(null);
  useEffect(() => { hazirSablonlariYenile().catch(() => {}); }, []);
  if (!liste.length) return null;
  const alindi = (s: HazirSablon) => benim.some((p) => p.ad === s.ad.replace(/\s*\(örnek\)\s*$/i, '') && p.sablon_disiplin === s.alan);
  return (
    <div className="rt-arac">
      <h4>Hazır şablonlar</h4>
      {liste.sort((a, b) => (a.kcal ?? 0) - (b.kcal ?? 0) || a.ad.localeCompare(b.ad, 'tr')).map((s) => (
        <div key={s.kod} className="rt-hazir">
          <span className="tx">
            <b>{s.ad}</b>
            {s.aciklama && <small>{s.aciklama}</small>}
            <small>{s.kartlar.length} kart · {s.onayli ? <span className="onay">✓ uzman onaylı</span> : <span className="ornek">örnek · uzman onayı bekliyor</span>}</small>
          </span>
          {alindi(s) ? <span className="rt-tamam">✓ Alındı</span>
            : <button type="button" className="rt-btn" onClick={async () => { await hazirSablonuAl(s); setMesaj(`"${s.ad}" şablonlarına eklendi.`); }}>Şablonlarıma al</button>}
        </div>
      ))}
      {mesaj && <p className="rt-tamam">{mesaj}</p>}
      <p className="rt-muted">Hazır şablonlar Ritos sunucusundan gelir; alınca kopyası senin olur, istediğin gibi düzenlersin.</p>
    </div>
  );
}

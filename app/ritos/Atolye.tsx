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
import { db, type AileRow, type IliskiAyarRow, type IliskiRow, type KutuphaneKartRow, type ProgramRow } from '@/lib/db';
import { bugun, degerBloklari, iyelik, tarihEkle, tarihEtiket, tarihParse } from '@/lib/paket';
import { aileAktifMi, aileGorevIliski, davetler, davetSil, haftaNotuGonder, iliskiBilgiYaz, type DavetSatir } from '@/lib/danismanlik';
import { danisanGunleri, gonderimAyarla, kocKartEkle, planDurumu, type KocKarti } from '@/lib/danisanAjanda';
import { SURE_ANAHTAR } from './KartEditor';
import { disiplinAdi, useDanismanlik } from '@/lib/danismanlik';
import { useSeciliDanisan } from '@/lib/seciliDanisan';
import type { PlanHedef } from '@/lib/danisanAjanda';
import { DanisanAjandasi, HaftaSablonlari } from './DanisanAjanda';
import { DavetModal, SonlandirModal } from './Danismanlik';
import { SinavTool } from './Sinav';
import { AyTakvimi, haftaBasi, haftaEtiket } from './AjandaPane';
import { AlanEkleModal, DISIPLIN_IKON, danismanlikBaslik } from './DanismanlikEkrani';
import Kutuphane from './Kutuphane';
import { Modal } from './ortak';
import { IKON_SECENEKLERI, VARSAYILAN_IKON, ikonOner } from '@/lib/programIkon';
import { programGuncelle, programOlustur } from '@/lib/program';

type Alt = 'planlar' | 'kutuphane';
// Oturum boyunca korunan durum (sekme değişince bileşen kapanır; modül değişkeni kalır).
// seciciAcik (4 ekim): telefonda Atölye'ye ilk girişte önce plan seçimi açılır.
type Dosya = 'plan' | 'gelisim' | 'bilgi';   // telefonda kişi dosyasının sekmesi
type Sag = 'gelisim' | 'bilgi' | 'kut';       // geniş ekranda sağ bölme
type KutBolum = 'kart' | 'sablon' | 'paket';
const durum: { alt: Alt; tarih: string | null; hafta: boolean; seciciAcik: boolean; dosya: Dosya; sag: Sag; kut: KutBolum } = { alt: 'planlar', tarih: null, hafta: true, seciciAcik: true, dosya: 'plan', sag: 'gelisim', kut: 'kart' };
// Başka ekrandan "Atölye'de planla" (hedef önceden seçili): seçici atlanır. Atölye henüz açık değilken de yakalanır.
if (typeof window !== 'undefined') window.addEventListener('ritos-atolyeye-git', () => { durum.alt = 'planlar'; durum.seciciAcik = false; durum.dosya = 'plan'; });

const SON_ANAH = 'ritos-atolye-son';
function sonlariOku(): string[] { try { return JSON.parse(localStorage.getItem(SON_ANAH) ?? '[]'); } catch { return []; } }
function sonaEkle(id: string) { try { localStorage.setItem(SON_ANAH, JSON.stringify([id, ...sonlariOku().filter((x) => x !== id)].slice(0, 5))); } catch { /* yok say */ } }

interface Hedef { id: string; grup: string; grupIc: string; ic: string; ad: string; alt?: string; h: PlanHedef }
/** 4 ekim — henüz görev verilmemiş aile üyesi: seçilince görev ilişkisi sessizce kurulur. */
interface Aday { id: string; uye: string; ad: string }

function useAdaylar(hedefler: Hedef[]): Aday[] {
  const dn = useDanismanlik();
  const aileler = useCanli(() => db.aile.toArray(), [], [] as AileRow[]);
  const aile = aileler.find(aileAktifMi);
  if (!aile) return [];
  const var_ = new Set(hedefler.filter((x) => x.h.tur === 'danisan' && x.h.il.disiplin === 'aile').map((x) => (x.h as { il: IliskiRow }).il.danisan));
  return aile.uyeler.filter((u) => u.uye !== dn.uid && u.durum === 'aktif' && !var_.has(u.uye)).map((u) => ({ id: `aile:${u.uye}`, uye: u.uye, ad: u.ad }));
}

/** Hedefler; ilk okuma bitmeden null (seçim ekranı yanlışlıkla açılmasın diye). */
function useHedeflerHazir(): Hedef[] | null {
  const dn = useDanismanlik();
  const iliskiler = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.durum === 'aktif' && i.koc === dn.uid), [dn.uid], null as IliskiRow[] | null);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], null as ProgramRow[] | null);
  if (!iliskiler || !programlar) return null;
  const liste: Hedef[] = [];
  for (const i of iliskiler.filter((x) => x.disiplin !== 'aile').sort((a, b) => a.disiplin.localeCompare(b.disiplin) || a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: danismanlikBaslik(i.disiplin), grupIc: DISIPLIN_IKON[i.disiplin] ?? '🤝', ic: DISIPLIN_IKON[i.disiplin] ?? '🤝', ad: i.danisan_ad, alt: disiplinAdi(i.disiplin), h: { tur: 'danisan', il: i } });
  }
  for (const i of iliskiler.filter((x) => x.disiplin === 'aile').sort((a, b) => a.danisan_ad.localeCompare(b.danisan_ad, 'tr'))) {
    liste.push({ id: i.id, grup: 'Ailem', grupIc: '👪', ic: '👪', ad: i.danisan_ad, alt: 'verdiğin görevler', h: { tur: 'danisan', il: i } });
  }
  for (const p of programlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))) {
    liste.push({ id: `p:${p.id}`, grup: 'Kişisel programlarım', grupIc: '🌱', ic: p.ikon ?? VARSAYILAN_IKON, ad: p.ad, alt: 'kişisel program', h: { tur: 'program', programId: p.id } });
  }
  return liste;
}

export default function Atolye({ genis }: { genis: boolean }) {
  const [alt, setAltS] = useState<Alt>(durum.alt);
  const setAlt = (a: Alt) => { durum.alt = a; setAltS(a); };
  // Başka yerden "Atölye'de planla" gelince Planlar açılır (hedef önceden seçilmiştir).
  useEffect(() => {
    const f = () => setAlt('planlar');
    window.addEventListener('ritos-atolyeye-git', f);
    return () => window.removeEventListener('ritos-atolyeye-git', f);
  }, []);
  return (
    <div className={`rt-atolye${genis ? ' genis' : ''}`}>
      <div className="rt-atolye-ust">
        <div className="rt-gorunum rt-atolye-alt" role="tablist" aria-label="Atölye">
          <button type="button" role="tab" aria-selected={alt === 'planlar'} className={alt === 'planlar' ? 'on' : ''} onClick={() => setAlt('planlar')}>🗂 Planlar</button>
          <button type="button" role="tab" aria-selected={alt === 'kutuphane'} className={alt === 'kutuphane' ? 'on' : ''} onClick={() => setAlt('kutuphane')}>📚 Kütüphane</button>
        </div>
      </div>
      {alt === 'planlar' ? <Planlar genis={genis} /> : <KutuphaneBolumu genis={genis} />}
    </div>
  );
}

function Planlar({ genis }: { genis: boolean }) {
  const dn = useDanismanlik();
  const hedeflerHazir = useHedeflerHazir();
  const hazir = hedeflerHazir !== null;
  const hedefler = hedeflerHazir ?? [];
  const [secili, setSecili] = useSeciliDanisan();
  const [tarih, setTarihS] = useState(durum.tarih ?? bugun());
  const [hafta, setHaftaS] = useState(durum.hafta);
  const [dosya, setDosyaS] = useState<Dosya>(durum.dosya);
  const [sag, setSagS] = useState<Sag>(durum.sag);
  const [ayAcik, setAyAcik] = useState(false);
  const setTarih = (t: string) => { durum.tarih = t; setTarihS(t); };
  const setHafta = (h: boolean) => { durum.hafta = h; setHaftaS(h); };
  const setDosya = (d: Dosya) => { durum.dosya = d; setDosyaS(d); };
  const setSag = (d: Sag) => { durum.sag = d; setSagS(d); };
  const adaylar = useAdaylar(hedefler);
  const [kuruluyor, setKuruluyor] = useState<string | null>(null);
  const [progForm, setProgForm] = useState<null | { id?: string }>(null);
  const [yeniBekle, setYeniBekle] = useState<string | null>(null); // yeni program listeye düşene kadar seçim ekranı açılmasın
  const [kurHata, setKurHata] = useState<string | null>(null);
  const [davet, setDavet] = useState<string | null>(null);      // hangi alana davet
  const [alanEkle, setAlanEkle] = useState(false);
  const [kutEkle, setKutEkle] = useState(false);
  // Danışmanlık alanları, bekleyen davetler ve sonlananlar (4 ekim — Home'daki Danışmanlık ekranından taşındı).
  const alanlar = dn.profil?.koc ? dn.profil.disiplinler : [];
  const [davetYenile, setDavetYenile] = useState(0);
  const [bekleyen, setBekleyen] = useState<DavetSatir[]>([]);
  useEffect(() => {
    if (!alanlar.length) return;
    davetler().then((l) => setBekleyen(l.filter((x) => !x.kullanildi && new Date(x.son).getTime() > Date.now()))).catch(() => setBekleyen([]));
  }, [davetYenile, alanlar.length]);
  const sonlananlar = useCanli(async () => (await db.iliski.toArray()).filter((i) => i.koc === dn.uid && i.durum !== 'aktif' && i.disiplin !== 'aile'), [dn.uid], [] as IliskiRow[]);
  const h = hedefler.find((x) => x.id === secili) ?? null;

  const [seciciAcik, setSeciciAcikS] = useState(durum.seciciAcik);
  const setSeciciAcik = (v: boolean) => { durum.seciciAcik = v; setSeciciAcikS(v); };
  const sec = (id: string) => { setSecili(id); sonaEkle(id); setSeciciAcik(false); };

  // Geniş ekranda liste hep görünür: seçim yoksa ilk hedef seçilir. Telefonda seçim ekranı açılır.
  useEffect(() => {
    if (h) { if (yeniBekle) setYeniBekle(null); return; }
    if (kuruluyor || yeniBekle || !hazir) return;
    if (genis) { if (hedefler.length) setSecili(hedefler[0].id); } else setSeciciAcik(true);
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
      {progForm && <ProgramFormu id={progForm.id} onKapat={() => setProgForm(null)} onOlustu={(id) => { setProgForm(null); setYeniBekle(`p:${id}`); sec(`p:${id}`); }} />}
      {davet && <DavetModal sabitDisiplin={davet} onKapat={() => { setDavet(null); setDavetYenile((n) => n + 1); }} />}
      {alanEkle && <AlanEkleModal onKapat={() => setAlanEkle(false)} onEklendi={() => setAlanEkle(false)} />}
      {kutEkle && h && <KutuphanedenEkle h={h} tarih={tarih < bugun() ? bugun() : tarih} onKapat={() => setKutEkle(false)} />}
      {ayAcik && <AyTakvimi secili={tarih} onSec={(t) => { setTarih(t); setAyAcik(false); }} onKapat={() => setAyAcik(false)} />}
    </>
  );

  const secici = (
    <HedefSecici hedefler={hedefler} adaylar={adaylar} seciliId={h?.id ?? null} kompakt={genis}
      kuruluyor={kuruluyor} onSec={(x) => sec(x.id)} onAday={adaySec} onYeniProgram={() => setProgForm({})}
      alanlar={alanlar} bekleyen={bekleyen} sonlananlar={sonlananlar}
      onDavet={setDavet} onDavetIptal={async (kod) => { await davetSil(kod); setDavetYenile((n) => n + 1); }} onAlanEkle={() => setAlanEkle(true)} />
  );

  // Telefon: seçim açıkken yalnız seçici (ajanda görünmez); seçilince tek satıra iner.
  if (!hazir) return <div className="rt-atolye-plan" />;
  if (!genis && (seciciAcik || !h) && !kuruluyor && !yeniBekle) {
    return (
      <div className="rt-atolye-plan">
        {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
        {h && <button type="button" className="rt-linkbtn" onClick={() => setSeciciAcik(false)}>‹ {h.ad} planına dön</button>}
        {secici}
        {modallar}
      </div>
    );
  }

  const t0 = bugun();
  const adim = hafta ? 7 : 1;
  const bugunGorunur = hafta ? haftaBasi(tarih) === haftaBasi(t0) : tarih === t0;
  const aileMi = h?.grup === 'Ailem';
  const dosyaSek: [Dosya, string][] = [['plan', '📅 Plan'], ['gelisim', '📈 Gelişim'], ...(aileMi ? [] : [['bilgi', '🗂 Bilgiler'] as [Dosya, string]])];
  const etkinDosya: Dosya = aileMi && dosya === 'bilgi' ? 'plan' : dosya;
  const sagSek: [Sag, string][] = [['gelisim', '📈 Gelişim'], ...(aileMi ? [] : [['bilgi', '🗂 Bilgiler'] as [Sag, string]]), ['kut', '📚 Kütüphane']];
  const etkinSag: Sag = aileMi && sag === 'bilgi' ? 'gelisim' : sag;

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
      <div className="rt-hafta-is"><button type="button" className="rt-chip rt-kut-ekle" onClick={() => setKutEkle(true)}>📚 Kütüphaneden ekle</button></div>
      <DanisanAjandasi
        key={h.id}
        h={h.h}
        baslik={h.h.tur === 'program'
          ? <>Yalnız bu programın kartları. Burada kurduğun kartlar Ajandam&apos;a da düşer.</>
          : aileMi
            ? <>Ona verdiğin görevler ve durumları. İşaretleyince burada görürsün.</>
            : <>Yalnız senin atadığın kartlar görünür.</>}
        tarih={tarih} hafta={hafta} haftaBas={haftaBasi(tarih)} onGun={(t) => { setTarih(t); setHafta(false); }} />
      <GonderimKutusu h={h} />
    </>
  );

  return (
    <div className="rt-atolye-plan">
      {genis && <aside className="rt-atolye-sol" aria-label="Plan seçimi">{secici}</aside>}
      <section className="rt-atolye-orta">
        {kuruluyor && <p className="rt-muted">Hazırlanıyor…</p>}
        {kurHata && <p className="rt-hata">⚠ {kurHata}</p>}
        {!h && !kuruluyor && !kurHata && <p className="rt-muted">Soldan bir plan seç ya da yenisini oluştur.</p>}
        {h && !kuruluyor && (genis ? (
          <>
            <div className="rt-hedef-bas"><b>{h.ic} {h.ad}</b>{h.alt && <span className="rt-muted"> · {h.alt}</span>}</div>
            {plan}
          </>
        ) : (
          <>
            <button type="button" className="rt-hedef-satir" onClick={() => setSeciciAcik(true)} aria-label="Başka plan seç">
              <span className="ic">{h.ic}</span>
              <span className="tx"><b>{h.ad}</b><small>{h.grup}</small></span>
              <span className="degis">Değiştir ▾</span>
            </button>
            <div className="rt-dosya-seg" role="tablist" aria-label="Dosya">
              {dosyaSek.map(([k, ad]) => <button key={k} type="button" role="tab" aria-selected={etkinDosya === k} className={etkinDosya === k ? 'on' : ''} onClick={() => setDosya(k)}>{ad}</button>)}
            </div>
            {etkinDosya === 'plan' ? plan
              : etkinDosya === 'gelisim' ? <AtolyeAraclari h={h} haftaBas={haftaBasi(tarih)} />
              : <Bilgiler h={h} onProgramDuzenle={(id) => setProgForm({ id })} />}
          </>
        ))}
      </section>
      {genis && h && !kuruluyor && (
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
      <div className="rt-arac">
        <h4>{danismanlikBaslik(il.disiplin)}</h4>
        {alanlar.map(([k, ad, ipucu]) => (
          <label key={k} className="rt-bilgi-sat">
            <span>{ad}</span>
            <input className="rt-inp" value={b[k] ?? ''} placeholder={ipucu ?? ''} onChange={(e) => { setB({ ...b, [k]: e.target.value }); setDurumMetni(null); }} />
          </label>
        ))}
      </div>
      <div className="rt-arac">
        <h4>Koç notları</h4>
        <textarea className="rt-inp" rows={4} value={not} placeholder="Gözlemlerin, dikkat edilecekler…" onChange={(e) => { setNot(e.target.value); setDurumMetni(null); }} />
      </div>
      <div className="rt-satir" style={{ justifyContent: 'flex-end' }}>
        {durumMetni && <span className="rt-tamam">{durumMetni}</span>}
        <button type="button" className="rt-btn primary" disabled={!degisti} onClick={async () => {
          const temiz = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
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
        <button type="button" className="rt-linkbtn" onClick={onDuzenle}>✎ Ad, simge ve amacı düzenle</button>
      </div>
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

// ———————————————— Kütüphaneden ekle (telefon da) ————————————————

function KutuphanedenEkle({ h, tarih, onKapat }: { h: Hedef; tarih: string; onKapat: () => void }) {
  const kartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  const [gun, setGun] = useState(tarih);
  const [ara, setAra] = useState('');
  const [eklenen, setEklenen] = useState<string[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  const q = kucuk(ara.trim());
  const liste = kartlar.filter((k) => !q || kucuk(k.ad).includes(q)).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return (
    <Modal baslik="📚 Kütüphaneden ekle" onKapat={onKapat}>
      <label className="rt-alan">Hangi gün<input className="rt-inp" type="date" min={bugun()} value={gun} onChange={(e) => setGun(e.target.value)} /></label>
      {kartlar.length > 6 && <input className="rt-inp" type="search" placeholder="Kartlarda ara…" value={ara} onChange={(e) => setAra(e.target.value)} />}
      {kartlar.length === 0 && <p className="rt-muted">Kütüphanen boş. Atölye › 📚 Kütüphane&apos;den kart ekleyebilir ya da Ajandam&apos;daki bir kartı &quot;Kütüphaneye kaydet&quot; ile saklayabilirsin.</p>}
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

// ———————————————— Atölye › Kütüphane: Kartlar · Hafta şablonları · Sınav paketi (4 ekim) ————————————————

function KutuphaneBolumu({ genis }: { genis: boolean }) {
  const dn = useDanismanlik();
  const alanlar = dn.profil?.koc ? dn.profil.disiplinler : [];
  const sinav = alanlar.includes('sinav');
  const [bolum, setBolumS] = useState<KutBolum>(durum.kut);
  const setBolum = (b: KutBolum) => { durum.kut = b; setBolumS(b); };
  const sablonlar = useCanli(() => db.program.filter((p) => !!p.sablon).toArray(), [], [] as ProgramRow[]);
  const gruplar = Array.from(new Set(sablonlar.map((p) => p.sablon_disiplin ?? 'diger')));
  const etkin: KutBolum = bolum === 'paket' && !sinav ? 'kart' : bolum;
  const grupAdi = (g: string) => (g === 'kisisel' ? '🌱 Kişisel programlar' : g === 'diger' ? 'Diğer' : `${DISIPLIN_IKON[g] ?? '🤝'} ${danismanlikBaslik(g)}`);
  return (
    <div className="rt-atolye-kut">
      <div className="rt-gorunum rt-kut-bolum" role="tablist" aria-label="Kütüphane bölümü">
        <button type="button" role="tab" aria-selected={etkin === 'kart'} className={etkin === 'kart' ? 'on' : ''} onClick={() => setBolum('kart')}>Kartlar</button>
        <button type="button" role="tab" aria-selected={etkin === 'sablon'} className={etkin === 'sablon' ? 'on' : ''} onClick={() => setBolum('sablon')}>Hafta şablonları</button>
        {sinav && <button type="button" role="tab" aria-selected={etkin === 'paket'} className={etkin === 'paket' ? 'on' : ''} onClick={() => setBolum('paket')}>Sınav paketi</button>}
      </div>
      {etkin === 'kart' && <Kutuphane />}
      {etkin === 'sablon' && (
        <div className="rt-sablon-bolum">
          {gruplar.length === 0 && <p className="rt-muted">Henüz şablon yok. Bir planın haftasını kurunca Plan&apos;daki &quot;💾 Haftayı şablon kaydet&quot; ile sakla; sonra &quot;📋 Şablon uygula&quot; ile başka haftalara ya da kişilere uygula.</p>}
          {gruplar.sort((a, b) => grupAdi(a).localeCompare(grupAdi(b), 'tr')).map((g) => (
            <div key={g} className="rt-arac"><h4>{grupAdi(g)}</h4><HaftaSablonlari disiplin={g} tam /></div>
          ))}
        </div>
      )}
      {etkin === 'paket' && <div className={genis ? 'rt-paket genis' : 'rt-paket'}><SinavTool /></div>}
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

function HedefSecici({ hedefler, adaylar, seciliId, kompakt, kuruluyor, onSec, onAday, onYeniProgram, alanlar, bekleyen, sonlananlar, onDavet, onDavetIptal, onAlanEkle }: {
  hedefler: Hedef[]; adaylar: Aday[]; seciliId: string | null; kompakt: boolean; kuruluyor: string | null;
  onSec: (h: Hedef) => void; onAday: (a: Aday) => void; onYeniProgram: () => void;
  alanlar: string[]; bekleyen: DavetSatir[]; sonlananlar: IliskiRow[];
  onDavet: (disiplin: string) => void; onDavetIptal: (kod: string) => void; onAlanEkle: () => void;
}) {
  const [ara, setAra] = useState('');
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  const [sonAcik, setSonAcik] = useState<Record<string, boolean>>({});
  const [sonlar, setSonlar] = useState<string[]>([]);
  useEffect(() => { setSonlar(sonlariOku()); }, []);
  type Oge = { id: string; ad: string; ic: string; grup: string; hedef?: Hedef; aday?: Aday };
  const ogeler: Oge[] = [
    ...hedefler.map((x) => ({ id: x.id, ad: x.ad, ic: x.ic, grup: x.grup, hedef: x })),
    ...adaylar.map((a) => ({ id: a.id, ad: a.ad, ic: '👪', grup: 'Ailem', aday: a })),
  ];
  // Gruplar: önce danışmanlık alanları (boş olsa da — davet buradan), sonra Ailem, sonra Kişisel programlarım.
  type Grup = { ad: string; ic: string; alan?: string };
  const alanGruplari: Grup[] = Array.from(new Set([...alanlar, ...hedefler.filter((x) => x.h.tur === 'danisan' && x.grup !== 'Ailem').map((x) => (x.h as { il: IliskiRow }).il.disiplin)]))
    .map((d) => ({ ad: danismanlikBaslik(d), ic: DISIPLIN_IKON[d] ?? '🤝', alan: d }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const gruplar: Grup[] = [
    ...alanGruplari,
    ...(ogeler.some((o) => o.grup === 'Ailem') ? [{ ad: 'Ailem', ic: '👪' }] : []),
    { ad: 'Kişisel programlarım', ic: '🌱' },
  ];
  const toplam = ogeler.length;
  const q = kucuk(ara.trim());
  const gorunen = q ? ogeler.filter((o) => kucuk(o.ad).includes(q)) : ogeler;
  const tikla = (o: Oge) => (o.hedef ? onSec(o.hedef) : o.aday && onAday(o.aday));
  const son = !q && !kompakt && toplam > 6 ? sonlar.map((id) => ogeler.find((o) => o.id === id)).filter((o): o is Oge => !!o).slice(0, 4) : [];
  const satir = (o: Oge) => (
    <button key={o.id} type="button" className={`rt-hedef-sat${o.id === seciliId || o.id === kuruluyor ? ' on' : ''}`} disabled={!!kuruluyor} onClick={() => tikla(o)}>
      <span className="ic">{o.ic}</span><span className="ad">{o.ad}</span>
      {!kompakt && <span className="chev">›</span>}
    </button>
  );
  return (
    <div className={`rt-hedef-secici${kompakt ? ' kompakt' : ''}`}>
      {!kompakt && <p className="rt-secici-baslik">Hangi planı açalım?</p>}
      {toplam > 8 && <input className="rt-inp rt-secici-ara" type="search" placeholder={kompakt ? 'Ara…' : `Ara (${toplam} kişi / program)`} value={ara} onChange={(e) => setAra(e.target.value)} />}
      {son.length > 1 && (
        <div className="rt-secici-son">
          <span className="rt-muted">Son seçilenler</span>
          <div className="rt-hedef-cipler">{son.map((o) => <button key={o.id} type="button" className={`rt-chip${o.id === seciliId ? ' on' : ''}`} onClick={() => tikla(o)}>{o.ic} {o.ad}</button>)}</div>
        </div>
      )}
      {gruplar.map((g) => {
        const tum = ogeler.filter((o) => o.grup === g.ad);
        const grupOgeleri = gorunen.filter((o) => o.grup === g.ad);
        if (q && !grupOgeleri.length) return null;
        const varsayilan = tum.length <= 6 || tum.some((o) => o.id === seciliId);
        const ac = q ? true : acik[g.ad] ?? varsayilan;
        const davetler_ = g.alan ? bekleyen.filter((x) => x.disiplin === g.alan) : [];
        const sonlanan = g.alan ? sonlananlar.filter((x) => x.disiplin === g.alan) : [];
        return (
          <div key={g.ad} className="rt-secici-grup">
            <button type="button" className="rt-grup-ad" aria-expanded={ac} onClick={() => setAcik({ ...acik, [g.ad]: !ac })}>
              <span>{g.ic} {g.ad}</span><span className="say">{tum.length} {ac ? '▾' : '▸'}</span>
            </button>
            {ac && grupOgeleri.map(satir)}
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
                    <button type="button" className="rt-hedef-sat soluk" onClick={() => setSonAcik({ ...sonAcik, [g.ad]: !sonAcik[g.ad] })}>
                      <span className="ic">{sonAcik[g.ad] ? '▾' : '▸'}</span><span className="ad">Sonlananlar ({sonlanan.length})</span>
                    </button>
                    {sonAcik[g.ad] && sonlanan.map((x) => (
                      <div key={x.id} className="rt-hedef-sat soluk"><span className="ic" /><span className="ad">{x.danisan_ad}</span><span className="ek">sonlandı</span></div>
                    ))}
                  </>
                )}
              </>
            )}
            {ac && !q && g.ad === 'Kişisel programlarım' && (
              <button type="button" className="rt-hedef-sat yeni" onClick={onYeniProgram}><span className="ic">＋</span><span className="ad">Yeni kişisel program</span></button>
            )}
          </div>
        );
      })}
      {q && gorunen.length === 0 && <p className="rt-muted">“{ara}” bulunamadı.</p>}
      {!q && <button type="button" className="rt-linkbtn rt-yeni-program" onClick={onAlanEkle}>＋ Danışmanlık alanı aç</button>}
    </div>
  );
}

// ———————————————— Kişisel program: oluştur / düzenle (4 ekim) ————————————————

function ProgramFormu({ id, onKapat, onOlustu }: { id?: string; onKapat: () => void; onOlustu: (id: string) => void }) {
  const p = useCanli(async () => (id ? (await db.program.get(id)) ?? null : null), [id], null as ProgramRow | null);
  const [ad, setAd] = useState('');
  const [amac, setAmac] = useState('');
  const [ikon, setIkon] = useState<string | null>(null); // null = ada göre öneri
  const [hazir, setHazir] = useState(!id);
  useEffect(() => { if (p && !hazir) { setAd(p.ad); setAmac(p.amac); setIkon(p.ikon ?? null); setHazir(true); } }, [p, hazir]);
  const oneri = ikonOner(ad);
  const secili = ikon ?? oneri ?? VARSAYILAN_IKON;
  const kaydet = async () => {
    if (!ad.trim()) return;
    if (id) { await programGuncelle(id, { ad: ad.trim(), amac: amac.trim(), ikon: secili }); onKapat(); return; }
    const yeni = await programOlustur(ad.trim(), amac.trim());
    await programGuncelle(yeni, { ikon: secili, kimden: 'Kendim' });
    onOlustu(yeni);
  };
  return (
    <Modal baslik={id ? 'Programı düzenle' : 'Yeni kişisel program'} onKapat={onKapat}>
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

'use client';

// Koçun danışan Ajanda'sı (28 eylül). AjandaPane'in tarih/görünüm başlığını paylaşır;
// yalnız içerik (kartların kaynağı ve eylemler) farklıdır. Danışanın kendi kartları görünmez.

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { hedefGrubu, danisanGunleri, planDurumu, planGonder, haftaKartlari, haftaSablonKaydet, haftaUygula, kocKartEkle, kocKartGuncelle, kocKartSil, kocKartTasi, kocSeriBitir, sablonKartlari, type KocKarti, type KocKartTaslak, type KocTekrar, type PlanHedef } from '@/lib/danisanAjanda';
import { KartEditor } from './KartEditor';
import type { AjandaKartRow } from '@/lib/db';
import { disiplinAdi } from '@/lib/danismanlik';
import { OLC_ONEK, olcuBlok, olcuBloklari, olculer } from '@/lib/olcum';
import { GUN_KISA, bugun, tarihEkle, tarihParse, type Blok } from '@/lib/paket';
import { db, type ProgramRow } from '@/lib/db';
import { GorevFormu, useSinavOzeti } from './Sinav';
import type { GorevTaslak } from '@/lib/sinavGorev';
import type { IliskiRow, OlcuTanimRow } from '@/lib/db';
import { BlokGoster, Kap, Modal, OnayKutusu, degerMetni } from './ortak';

const olcumKarti = (b: Blok[]) => olcuBloklari(b).length > 0;

const hedefKey = (h: PlanHedef) => (h.tur === 'danisan' ? h.il.id : h.programId);

/** Plan odaklı Ajanda: danışanın (koç) ya da kişisel bir programın kartları. */
export function DanisanAjandasi({ h, baslik, tarih, hafta, haftaBas, onGun }: { h: PlanHedef; baslik: React.ReactNode; tarih: string; hafta: boolean; haftaBas: string; onGun: (t: string) => void }) {
  const gunler = hafta ? Array.from({ length: 7 }, (_, i) => tarihEkle(haftaBas, i)) : [tarih];
  const veri = useCanli(() => danisanGunleri(h, gunler), [hedefKey(h), gunler[0], gunler.length], {} as Record<string, KocKarti[]>);
  const [ekle, setEkle] = useState<string | null>(null);
  const [detay, setDetay] = useState<KocKarti | null>(null);
  const [surukle, setSurukle] = useState<KocKarti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [haftaIs, setHaftaIs] = useState<null | 'uygula' | 'kaydet'>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const t0 = bugun();
  // 3 ekim — taslak modu: gönderilmemiş değişiklikler ve Gönder.
  const pd = useCanli(() => planDurumu(h), [hedefKey(h)], null as Awaited<ReturnType<typeof planDurumu>>);
  const taslakModu = pd?.gonderim === 'gonder';
  async function gecenHafta() {
    setHata(null); setBilgi(null);
    try {
      const kaynak = await haftaKartlari(h, tarihEkle(haftaBas, -7));
      if (!kaynak.length) { setHata('Geçen haftada kart yok.'); return; }
      const n = await haftaUygula(h, kaynak, haftaBas);
      setBilgi(`Geçen haftadan ${n} kart kopyalandı${n < kaynak.length ? ' (geçmiş günler atlandı)' : ''}.`);
    } catch (e) { setHata((e as Error).message); }
  }

  // Haftalık görünümde kartı başka güne sürükle (fare + dokunmatik): bırakılan yerin günü alınır.
  useEffect(() => {
    if (!surukle) return;
    async function onUp(e: PointerEvent) {
      const k = surukle!;
      setSurukle(null);
      const hedef = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-tarih]')?.dataset.tarih;
      if (hedef && hedef !== k.tarih) { try { await kocKartTasi(k, hedef); } catch (x) { setHata((x as Error).message); } }
    }
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointerup', onUp);
  }, [surukle]);

  const gunKutusu = (t: string) => {
    const liste = veri[t] ?? [];
    const yapilan = liste.filter((k) => k.yapildi).length;
    const d = tarihParse(t);
    return (
      <div key={t} data-tarih={t} className={`rt-hafta-gun${t === t0 ? ' bugun' : ''}${t < t0 ? ' gecmis' : ''}${surukle && t >= t0 ? ' hedef' : ''}`}>
        <div className="rt-hafta-hd">
          <button type="button" className="rt-hafta-ad" onClick={() => onGun(t)}><b>{d.toLocaleDateString('tr-TR', { weekday: 'short' })}</b> {d.getDate()}</button>
          {liste.length > 0 && <span className={`rt-rozet${yapilan === liste.length ? ' tam' : ''}`}>{yapilan}/{liste.length}</span>}
          {t >= t0 && <button type="button" className="rt-ikon" onClick={() => setEkle(t)} aria-label={`${d.getDate()} için kart ekle`}>＋</button>}
        </div>
        <div className="rt-liste">
          {liste.map((k) => <KocKartSatiri key={k.adim.id} k={k} onAc={() => setDetay(k)} onSurukle={k.tekGun && !k.yapildi && t >= t0 ? () => setSurukle(k) : undefined} suruklenen={surukle?.adim.id === k.adim.id} />)}
          {liste.length === 0 && <p className="rt-muted rt-hafta-bos">—</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="rt-danisan-ajanda">
      <p className="rt-muted rt-danisan-not">{baslik}</p>
      {hafta && (
        <div className="rt-hafta-is">
          <button type="button" className="rt-chip" onClick={gecenHafta}>⧉ Geçen haftayı kopyala</button>
          <button type="button" className="rt-chip" onClick={() => setHaftaIs('uygula')}>📋 Şablon uygula</button>
          <button type="button" className="rt-chip" onClick={() => setHaftaIs('kaydet')}>💾 Haftayı şablon kaydet</button>
        </div>
      )}
      {taslakModu && pd && pd.bekleyen > 0 && h.tur === 'danisan' && (
        <div className="rt-taslak-cubuk">
          <span>✏️ <b>{pd.bekleyen}</b> değişiklik taslakta — {h.il.danisan_ad} henüz görmüyor.</span>
          <button type="button" className="rt-btn primary" onClick={async () => { setHata(null); try { await planGonder(h); setBilgi(`Gönderildi — ${h.il.danisan_ad}, Ajanda'sında görecek.`); } catch (e) { setHata((e as Error).message); } }}>Gönder</button>
        </div>
      )}
      {bilgi && <p className="rt-tamam" onClick={() => setBilgi(null)}>{bilgi}</p>}
      {hata && <p className="rt-hata" onClick={() => setHata(null)}>⚠ {hata}</p>}
      {hafta ? (
        <div className={`rt-hafta${surukle ? ' suruklu' : ''}`}>{gunler.map(gunKutusu)}</div>
      ) : (
        <Kap baslik="Gün" eylemler={tarih >= t0 ? <button type="button" className="rt-ikon" onClick={() => setEkle(tarih)} aria-label="Kart ekle">＋</button> : undefined}>
          {(veri[tarih] ?? []).length === 0 && <p className="rt-muted">Bu gün için atanmış kart yok.</p>}
          <div className="rt-liste">{(veri[tarih] ?? []).map((k) => <KocKartSatiri key={k.adim.id} k={k} onAc={() => setDetay(k)} />)}</div>
        </Kap>
      )}
      {ekle && <KocKartFormu h={h} tarih={ekle} onKapat={() => setEkle(null)} />}
      {haftaIs === 'uygula' && <SablonUygulaModal h={h} haftaBas={haftaBas} onKapat={() => setHaftaIs(null)} onTamam={(m) => { setHaftaIs(null); setBilgi(m); }} />}
      {haftaIs === 'kaydet' && <SablonKaydetModal h={h} haftaBas={haftaBas} onKapat={() => setHaftaIs(null)} onTamam={(m) => { setHaftaIs(null); setBilgi(m); }} />}
      {detay && <KocKartDetay h={h} k={detay} onKapat={() => setDetay(null)} />}
    </div>
  );
}

function KocKartSatiri({ k, onAc, onSurukle, suruklenen }: { k: KocKarti; onAc: () => void; onSurukle?: () => void; suruklenen?: boolean }) {
  const gecmis = k.tarih < bugun();
  const deger = k.degerler && degerMetni(k.degerler, k.adim.bloklar);
  return (
    <div className={`rt-kart bagli${k.yapildi ? ' yapildi' : ''}${suruklenen ? ' rt-suruklenen-kart' : ''}`}>
      <div className="rt-kart-ust">
        <span className={`rt-durum${k.yapildi ? ' on' : gecmis ? ' kacti' : ''}`} title={k.yapildi ? 'Yapıldı' : gecmis ? 'Yapılmadı' : 'Bekliyor'}>{k.yapildi ? '✓' : gecmis ? '–' : ''}</span>
        <button type="button" className="rt-kart-ad" onClick={onAc}>
          <span className="t">{olcumKarti(k.adim.bloklar) ? '📏 ' : ''}{k.adim.ad}</span>
          {deger && <span className="m">✓ {deger}</span>}
          {k.yorum && <span className="m rt-yorum-m">💬 {k.yorum}</span>}
          {k.taslak && <span className="m rt-taslak-etiket">taslak</span>}
          {!k.tekGun && <span className="m">🔁 {k.program.uzak?.plan || k.program.plan ? 'tekrar' : k.program.ad}</span>}
        </button>
        {onSurukle && <span className="rt-tutamac" aria-label="Başka güne sürükle" onPointerDown={(e) => { e.preventDefault(); onSurukle(); }}>⋮⋮</span>}
      </div>
    </div>
  );
}

function KocKartDetay({ h, k, onKapat }: { h: PlanHedef; k: KocKarti; onKapat: () => void }) {
  const gecmis = k.tarih < bugun();
  const [duzenle, setDuzenle] = useState(false);
  const [yeniTarih, setYeniTarih] = useState(k.tarih);
  const [sil, setSil] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  if (duzenle) return <KocKartFormu h={h} tarih={k.tarih} k={k} onKapat={onKapat} />;
  const calis = async (f: () => Promise<void>) => { try { await f(); onKapat(); } catch (e) { setHata((e as Error).message); } };
  return (
    <Modal baslik={k.adim.ad} onKapat={onKapat}>
      <BlokGoster bloklar={k.adim.bloklar.filter((b) => !(b.tur === 'sayi' && b.anahtar.startsWith(OLC_ONEK)))} />
      {olcumKarti(k.adim.bloklar) && <p className="rt-muted">📏 Sorulan: {olcuBloklari(k.adim.bloklar).map((b) => b.etiket).join(', ')}</p>}
      <p className="rt-metin">
        {tarihParse(k.tarih).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
        <b>{k.yapildi ? 'Yapıldı' : gecmis ? 'Yapılmadı' : 'Bekliyor'}</b>
        {k.degerler && <> · {degerMetni(k.degerler, k.adim.bloklar)}</>}
      </p>
      {k.yorum && <p className="rt-yorum"><span className="rt-yorum-metin">💬 {k.yorum}</span></p>}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      {!k.tekGun && <p className="rt-muted">Bu kart birden çok güne yayılıyor{k.program.uzak?.plan || k.program.plan ? '' : ` (${k.program.ad})`}.</p>}
      {!k.tekGun && !sil && <div className="rt-satir"><button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Seriyi bugünden bitir</button></div>}
      {!k.tekGun && sil && <OnayKutusu metin="Seri bugünden itibaren kalksın mı? Yapılmış günler kalır." evet="Bitir" onVazgec={() => setSil(false)} onEvet={() => calis(() => kocSeriBitir(k))} />}
      {k.tekGun && k.yapildi && !gecmis && <p className="rt-muted">Yapılmış kart taşınmaz ve kaldırılmaz; içeriğini düzenleyebilirsin.</p>}
      {k.tekGun && k.yapildi && !gecmis && <div className="rt-satir"><button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button></div>}
      {k.tekGun && !k.yapildi && !gecmis && !sil && (
        <>
          <div className="rt-satir">
            <input className="rt-inp" type="date" min={bugun()} value={yeniTarih} onChange={(e) => setYeniTarih(e.target.value)} />
            <button type="button" className="rt-btn" disabled={!yeniTarih || yeniTarih === k.tarih} onClick={() => calis(() => kocKartTasi(k, yeniTarih))}>Taşı</button>
          </div>
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Kaldır</button>
          </div>
        </>
      )}
      {sil && k.tekGun && <OnayKutusu metin={h.tur === 'danisan' ? "Kart danışanın Ajanda'sından kaldırılsın mı?" : 'Kart kaldırılsın mı?'} evet="Kaldır" onVazgec={() => setSil(false)} onEvet={() => calis(() => kocKartSil(k))} />}
    </Modal>
  );
}

// Disipline göre kart paleti — hepsi tek kartın hazır başlangıçları (28 eylül).
//  Beslenme: Öğün, Ölçüm, Kart · Sınav: Sınav görevi, Kart, Ölçüm · Genel: Kart, Ölçüm. Her biri tekrarlanabilir.
type KartTur = 'ogun' | 'kart' | 'olcum' | 'sinav';
const TEKRAR_SURE: [string, string][] = [['7', '1 hafta'], ['14', '2 hafta'], ['28', '4 hafta'], ['', 'Süresiz']];

export function KocKartFormu({ h, tarih, k, onKapat }: { h: PlanHedef; tarih: string; k?: KocKarti; onKapat: () => void }) {
  // Kişisel programda kişinin kendi tek kart editörü (video, süre kaydı, zamanlayıcı…) kullanılır.
  // Aile içi görevler de (3 ekim) aynı tek kart editörüyle — öğün/ölçüm paleti koçluğa özgü.
  if (h.tur === 'program' || h.il.disiplin === 'aile') return <ProgramKartFormu h={h} tarih={tarih} k={k} onKapat={onKapat} />;
  return <DanisanKartFormu il={h.il} h={h} tarih={tarih} k={k} onKapat={onKapat} />;
}

function ProgramKartFormu({ h, tarih, k, onKapat }: { h: PlanHedef; tarih: string; k?: KocKarti; onKapat: () => void }) {
  const sahte = k ? ({
    id: k.adim.id, tip: k.adim.tip, ad: k.adim.ad, bloklar: k.adim.bloklar, baslangic: k.tarih, bitis: k.tarih, gunler: null, saatler: k.adim.saatler,
  } as unknown as AjandaKartRow) : undefined;
  return (
    <KartEditor
      tarih={tarih}
      kart={sahte}
      tekrarYok={!!k}
      onKapat={onKapat}
      onPlan={async (kart, tekrar) => {
        if (k) await kocKartGuncelle(k, { ad: kart.ad, bloklar: kart.bloklar, saatler: kart.saatler });
        else await kocKartEkle(h, tarih, kart, tekrar);
      }}
    />
  );
}

function DanisanKartFormu({ il, h, tarih, k, onKapat }: { il: IliskiRow; h: PlanHedef; tarih: string; k?: KocKarti; onKapat: () => void }) {
  const sinavKurulu = useSinavOzeti().kurulu;
  const palet: [KartTur, string][] = il.disiplin === 'beslenme'
    ? [['ogun', '🍽 Öğün'], ['olcum', '📏 Ölçüm'], ['kart', '☑ Kart']]
    : il.disiplin === 'sinav'
      ? [...(sinavKurulu ? [['sinav', '📚 Sınav görevi'] as [KartTur, string]] : []), ['kart', '☑ Kart'], ['olcum', '📏 Ölçüm']]
      : [['kart', '☑ Kart'], ['olcum', '📏 Ölçüm']];
  const b0 = k?.adim.bloklar ?? [];
  const olc0 = olcuBloklari(b0);
  const [tur, setTur] = useState<KartTur>(k ? (olc0.length ? 'olcum' : k.adim.ek ? 'sinav' : il.disiplin === 'beslenme' ? 'ogun' : 'kart') : palet[0][0]);
  const [ad, setAd] = useState(k?.adim.ad ?? '');
  const [aciklama, setAciklama] = useState(b0.filter((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin').map((b) => b.metin).join('\n\n'));
  const tanimlar = useCanli(olculer, [], [] as OlcuTanimRow[]);
  const [secili, setSecili] = useState<string[]>(olc0.length ? olc0.map((b) => b.anahtar.slice(OLC_ONEK.length)) : ['kilo', 'bel']);
  const [gorev, setGorev] = useState<GorevTaslak | null>(null);
  const [tekrarAcik, setTekrarAcik] = useState(false);
  const [gunler, setGunler] = useState<number[]>([]);
  const [sure, setSure] = useState('7');
  const [hata, setHata] = useState<string | null>(null);
  const varsayilanAd = tur === 'olcum' ? 'Haftalık ölçüm' : tur === 'ogun' ? 'Günün menüsü' : '';
  const sinavDuzenle = !!k && tur === 'sinav'; // sınav görevinin içeriği görev formundan gelir; düzenlemede yalnız ad

  async function kaydet() {
    let kart: KocKartTaslak;
    if (tur === 'sinav' && !k) {
      if (!gorev) return;
      kart = { tip: gorev.tip, ad: gorev.ad, bloklar: gorev.bloklar, ek: gorev.ek };
    } else if (sinavDuzenle) {
      kart = { tip: k!.adim.tip, ad: ad.trim() || k!.adim.ad, bloklar: k!.adim.bloklar, ek: k!.adim.ek ?? null };
    } else {
      const bloklar: Blok[] = [];
      if (aciklama.trim()) bloklar.push({ tur: 'metin', metin: aciklama.trim() });
      if (tur === 'olcum') for (const id of secili) { const t = tanimlar.find((x) => x.id === id); if (t) bloklar.push(olcuBlok(t)); }
      kart = { ad: ad.trim() || varsayilanAd, bloklar };
    }
    if (!kart.ad) { setHata('Kart adı yaz.'); return; }
    const tekrar: KocTekrar | null = tekrarAcik ? { gun: sure ? Number(sure) : null, gunler: gunler.length && gunler.length < 7 ? gunler : null } : null;
    try {
      if (k) await kocKartGuncelle(k, { ad: kart.ad, bloklar: kart.bloklar }); else await kocKartEkle(h, tarih, kart, tekrar);
      onKapat();
    } catch (e) { setHata((e as Error).message); }
  }

  return (
    <Modal baslik={`${k ? 'Kartı düzenle' : 'Kart ekle'} · ${tarihParse(tarih).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}`} onKapat={onKapat}>
      {!k && (
        <div className="rt-chips">
          {palet.map(([v, e]) => <button key={v} type="button" className={`rt-chip${tur === v ? ' on' : ''}`} onClick={() => setTur(v)}>{e}</button>)}
        </div>
      )}
      {tur === 'sinav' && !k ? <GorevFormu onChange={setGorev} /> : (
        <>
          <input className="rt-inp rt-ek-ad" placeholder={varsayilanAd || 'Kart adı'} value={ad} onChange={(e) => setAd(e.target.value)} />
          {!sinavDuzenle && <textarea className="rt-inp" rows={tur === 'ogun' ? 6 : 2} placeholder={tur === 'olcum' ? 'Not (isteğe bağlı) — örn. sabah aç karnına' : tur === 'ogun' ? 'Kahvaltı: …\nÖğle: …\nAkşam: …\nAra: …' : 'Açıklama'} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />}
        </>
      )}
      {tur === 'olcum' && (
        <div className="rt-chips">
          {tanimlar.map((t) => {
            const on = secili.includes(t.id);
            return <button key={t.id} type="button" className={`rt-chip${on ? ' on' : ''}`} onClick={() => setSecili(on ? secili.filter((x) => x !== t.id) : [...secili, t.id])}>{t.ad}{t.birim ? ` (${t.birim})` : ''}</button>;
          })}
        </div>
      )}
      {!k && (tekrarAcik ? (
        <div className="rt-ek">
          <div className="rt-ek-hd"><span>🔁 Tekrar</span><button type="button" className="rt-x" onClick={() => setTekrarAcik(false)} aria-label="Tekrarı kaldır">×</button></div>
          <div className="rt-chips">
            <button type="button" className={`rt-chip${!gunler.length ? ' on' : ''}`} onClick={() => setGunler([])}>Her gün</button>
            {GUN_KISA.map(([g, e]) => <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>)}
          </div>
          <div className="rt-chips">
            <span className="rt-muted">Ne kadar:</span>
            {TEKRAR_SURE.map(([v, e]) => <button key={e} type="button" className={`rt-chip${sure === v ? ' on' : ''}`} onClick={() => setSure(v)}>{e}</button>)}
          </div>
        </div>
      ) : <div className="rt-chips rt-ek-cipler"><button type="button" className="rt-chip rt-ek-cip" onClick={() => setTekrarAcik(true)}>🔁 Tekrar</button></div>)}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <button type="button" className="rt-btn primary" disabled={(tur === 'olcum' && !secili.length) || (tur === 'sinav' && !k && !gorev)} onClick={kaydet}>{k ? 'Kaydet' : 'Ekle'}</button>
    </Modal>
  );
}

// ———————————————— hafta şablonları ————————————————

export function useHaftaSablonlari(disiplin: string) {
  return useCanli(() => db.program.filter((p) => !!p.sablon && (!p.sablon_disiplin || p.sablon_disiplin === disiplin)).toArray(), [disiplin], [] as ProgramRow[]);
}

function SablonUygulaModal({ h, haftaBas, onKapat, onTamam }: { h: PlanHedef; haftaBas: string; onKapat: () => void; onTamam: (m: string) => void }) {
  const sablonlar = useHaftaSablonlari(hedefGrubu(h));
  const [secili, setSecili] = useState<string | null>(null);
  const [hafta, setHafta] = useState(1);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Şablon uygula" onKapat={onKapat}>
      {sablonlar.length === 0 && <p className="rt-muted">Henüz şablonun yok. Bir haftayı kurduktan sonra &quot;Haftayı şablon kaydet&quot; ile sakla.</p>}
      <div className="rt-dan-liste">
        {sablonlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((p) => (
          <button key={p.id} type="button" className={`rt-prog${secili === p.id ? ' secili' : ''}`} onClick={() => setSecili(p.id)}><span className="t">{p.ad}</span></button>
        ))}
      </div>
      {secili && (
        <div className="rt-chips">
          <span className="rt-muted">Bu haftadan itibaren:</span>
          {[1, 2, 4].map((n) => <button key={n} type="button" className={`rt-chip${hafta === n ? ' on' : ''}`} onClick={() => setHafta(n)}>{n} hafta</button>)}
        </div>
      )}
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <button type="button" className="rt-btn primary" disabled={!secili} onClick={async () => {
        try {
          const kaynak = await sablonKartlari(secili!);
          const n = await haftaUygula(h, kaynak, haftaBas, hafta);
          onTamam(`${n} kart eklendi${n < kaynak.length * hafta ? ' (geçmiş günler atlandı)' : ''}.`);
        } catch (e) { setHata((e as Error).message); }
      }}>Uygula</button>
    </Modal>
  );
}

function SablonKaydetModal({ h, haftaBas, onKapat, onTamam }: { h: PlanHedef; haftaBas: string; onKapat: () => void; onTamam: (m: string) => void }) {
  const [ad, setAd] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Haftayı şablon kaydet" onKapat={onKapat}>
      <p className="rt-muted">Bu haftanın kartları gün gün şablon olur; başka danışanlara ya da ileriki haftalara uygularsın.</p>
      <input className="rt-inp" placeholder="Şablon adı (örn. 1500 kcal · 1. hafta)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => {
        try { const n = await haftaSablonKaydet(h, haftaBas, ad); onTamam(`"${ad.trim()}" şablonu ${n} kartla kaydedildi.`); } catch (e) { setHata((e as Error).message); }
      }}>Kaydet</button>
    </Modal>
  );
}

/** Danışmanlık ekranındaki şablon listesi: gör, adını değiştir, sil. */
export function HaftaSablonlari({ disiplin, tam }: { disiplin: string; tam?: boolean }) {
  const hepsi = useHaftaSablonlari(disiplin);
  // tam (4 ekim, Kütüphane): yalnız bu gruba kaydedilmişler; grubu olmayanlar 'diger'.
  const sablonlar = tam ? hepsi.filter((p) => (p.sablon_disiplin ?? 'diger') === disiplin) : hepsi;
  const [acik, setAcik] = useState<ProgramRow | null>(null);
  return (
    <>
      {sablonlar.length === 0 && !tam && <p className="rt-muted">Danışanın haftasını kurunca Ajanda&apos;daki &quot;💾 Haftayı şablon kaydet&quot; ile sakla; sonra &quot;📋 Şablon uygula&quot; ile başka haftalara ya da danışanlara uygula.</p>}
      <div className="rt-dan-liste">
        {sablonlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((p) => (
          <button key={p.id} type="button" className="rt-prog" onClick={() => setAcik(p)}><span className="t">{p.ad}</span><span className="m">şablon</span></button>
        ))}
      </div>
      {acik && <SablonDetay p={acik} onKapat={() => setAcik(null)} />}
    </>
  );
}

function SablonDetay({ p, onKapat }: { p: ProgramRow; onKapat: () => void }) {
  const kartlar = useCanli(() => sablonKartlari(p.id), [p.id], [] as Awaited<ReturnType<typeof sablonKartlari>>);
  const [ad, setAd] = useState(p.ad);
  const [sil, setSil] = useState(false);
  return (
    <Modal baslik="Şablon" onKapat={onKapat}>
      <div className="rt-satir">
        <input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} />
        <button type="button" className="rt-btn" disabled={!ad.trim() || ad === p.ad} onClick={async () => { await db.program.update(p.id, { ad: ad.trim(), guncellendi: Date.now() }); onKapat(); }}>Kaydet</button>
      </div>
      <div className="rt-sablon-gunler">
        {GUN_KISA.map(([, e], i) => {
          const g = kartlar.filter((x) => x.gun === i);
          return (
            <div key={e} className="rt-sablon-gun">
              <b>{e}</b>
              <span>{g.length ? g.map((x) => x.kart.ad).join(' · ') : '—'}</span>
            </div>
          );
        })}
      </div>
      {sil
        ? <OnayKutusu metin="Şablon silinsin mi? Uygulanmış kartlar etkilenmez." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await db.program_adim.where('program_id').equals(p.id).delete(); await db.program.delete(p.id); onKapat(); }} />
        : <button type="button" className="rt-linkbtn" onClick={() => setSil(true)}>Şablonu sil</button>}
    </Modal>
  );
}

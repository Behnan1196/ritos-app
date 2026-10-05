'use client';

// ————————————————————————————————————————————————————————————————
// Kütüphane (5 ekim yenilemesi) — malzeme deposu: topla, sakla, tekrar kullan.
//  • Koleksiyonlar tek seviye ("hangi konunun malzemesi?"); içinde kartlar konu etiketiyle süzülür.
//  • Koleksiyona alan etiketi verilir, kartları devralır; bir rutin koleksiyonu "malzeme" olarak bağlar.
//  • Arama + tür + alan süzgeci önde. Hafta şablonları da burada.
//  • Rutinler Rutinlerim'de, notlar Home'da — burada değil.
// Motor: lib/kutuphane.ts. Eski alt klasörler ilk açılışta konu etiketine dönüşür (kutuphaneGoc).
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db, type AjandaKartRow, type KlasorRow, type KutuphaneKartRow, type ProgramRow, type YasamAlaniRow } from '@/lib/db';
import {
  ajandayaAl, koleksiyonGuncelle, koleksiyonlar, koleksiyonOlustur, koleksiyonSil, kutKartEkle, kutKartGuncelle, kutKartKonular, kutKartSil, kutKartTasi,
  kutKullanimlari, kutuphaneGoc, type KutKullanim,
} from '@/lib/kutuphane';
import { alanlar as yAlanlar, alanlariGaranti, ALAN_IKONLARI } from '@/lib/yasamAlani';
import { GUN_KISA, bugun, tarihParse } from '@/lib/paket';
import { BlokGoster, Modal, OnayKutusu } from './ortak';
import { KartEditor } from './KartEditor';
import { HaftaSablonlari } from './DanisanAjanda';

const kisaTarih = (t: string) => tarihParse(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const kartIkon = (k: KutuphaneKartRow) => (k.bloklar.some((b) => b.tur === 'video') ? '🎬' : k.bloklar.some((b) => b.tur === 'sayi') ? '📏' : '📄');
const kucuk = (x: string) => x.toLocaleLowerCase('tr');
const KOLEKSIYON_IKON = ['📁', '🎸', '📐', '🧘', '🍳', '🤝', '🏃', '📖', '🎨', '🌿', '💼', '🎵', '🧠', '🏡', '✈️', '🐾'];
type Tur = 'hepsi' | 'kart' | 'sablon';

export default function Kutuphane() {
  useEffect(() => { kutuphaneGoc().catch(() => {}); alanlariGaranti().catch(() => {}); }, []);
  const kols = useCanli(koleksiyonlar, [], [] as KlasorRow[]);
  const kartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  const rutinler = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon && !!p.malzeme).toArray(), [], [] as ProgramRow[]);
  const alanlar = useCanli(yAlanlar, [], [] as YasamAlaniRow[]).filter((a) => !a.gizli);
  const [kol, setKol] = useState<string | null>(null);           // açık koleksiyon (null = liste; '-' = koleksiyonsuz)
  const [ara, setAra] = useState('');
  const [tur, setTur] = useState<Tur>('hepsi');
  const [alan, setAlan] = useState<string | null>(null);
  const [yeniKol, setYeniKol] = useState(false);
  const [yeniKart, setYeniKart] = useState(false);
  const [kartAc, setKartAc] = useState<KutuphaneKartRow | null>(null);

  const kolAd = (id: string | null) => (id ? kols.find((k) => k.id === id) : undefined);
  const kartAlanlari = (k: KutuphaneKartRow) => kolAd(k.klasor_id)?.alanlar ?? [];
  const q = kucuk(ara.trim());
  const suzuluyor = !!q || !!alan;
  const eslesen = kartlar.filter((k) => (!q || kucuk(k.ad).includes(q) || (k.konular ?? []).some((x) => kucuk(x).includes(q)) || kucuk(kolAd(k.klasor_id)?.ad ?? '').includes(q))
    && (!alan || kartAlanlari(k).includes(alan))).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  if (kol) {
    return (
      <div className="side-content rt-kut" style={{ height: '100%', overflowY: 'auto' }}>
        <Koleksiyon kolIdler={new Set(kols.map((c) => c.id))} kartlar={kartlar} kol={kol === '-' ? null : kolAd(kol) ?? null} alanlar={alanlar}
          rutinler={rutinler.filter((r) => r.malzeme === kol)} onGeri={() => setKol(null)} onKart={setKartAc} />
        {kartAc && <KutKartDetay k={kartAc} kols={kols} onKapat={() => setKartAc(null)} />}
      </div>
    );
  }

  const bos = !kols.length && !kartlar.length;
  return (
    <div className="side-content rt-kut" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="rt-kut-bas">
        <h4>📚 Kütüphane</h4>
        <button type="button" className="rt-btn" onClick={() => setYeniKol(true)}>＋ Koleksiyon</button>
        <button type="button" className="rt-btn primary" onClick={() => setYeniKart(true)}>＋ Kart</button>
      </div>
      {bos && (
        <p className="rt-muted rt-kut-giris">
          Beğendiğin videoları, anlatımları, egzersizleri kart olarak topla; koleksiyonlarda sakla (örn. Gitar, LGS Matematik), içinde konu etiketiyle ayır.
          Bir kartı rutinine ya da istediğin güne ekle. Ajandam&apos;daki bir kartı da detayından &quot;Kütüphaneye kaydet&quot; ile buraya alabilirsin.
        </p>
      )}
      {!bos && <input className="rt-inp" type="search" placeholder="Kütüphanede ara (kart, konu, koleksiyon)" value={ara} onChange={(e) => setAra(e.target.value)} />}
      {!bos && (
        <div className="rt-kut-suz">
          {([['hepsi', 'Hepsi'], ['kart', 'Kartlar'], ['sablon', 'Hafta şablonları']] as [Tur, string][]).map(([k, a]) => (
            <button key={k} type="button" className={`rt-chip${tur === k ? ' on' : ''}`} onClick={() => setTur(k)}>{a}</button>
          ))}
          {tur !== 'sablon' && alanlar.length > 0 && <span className="ayrac" />}
          {tur !== 'sablon' && alanlar.map((a) => (
            <button key={a.id} type="button" className={`rt-chip${alan === a.id ? ' on' : ''}`} aria-pressed={alan === a.id} title={a.ad} onClick={() => setAlan(alan === a.id ? null : a.id)}>{a.ikon}</button>
          ))}
        </div>
      )}

      {tur !== 'sablon' && suzuluyor && (
        <div className="rt-arac">
          <h4>{eslesen.length} kart{alan ? ` · ${alanlar.find((a) => a.id === alan)?.ad}` : ''}</h4>
          {eslesen.map((k) => <KartSatiri key={k.id} k={k} kol={kolAd(k.klasor_id)?.ad} onAc={() => setKartAc(k)} />)}
          {!eslesen.length && <p className="rt-muted">Eşleşen kart yok.{alan ? ' Alan süzgeci koleksiyonun alanlarına bakar; koleksiyona alan vermeyi dene.' : ''}</p>}
        </div>
      )}

      {tur !== 'sablon' && !suzuluyor && !bos && (
        <>
          <div className="rt-kut-bolum"><span>Koleksiyonlar</span></div>
          <div className="rt-kut-koller">
            {kols.map((c) => {
              const n = kartlar.filter((k) => k.klasor_id === c.id).length;
              const bagli = rutinler.filter((r) => r.malzeme === c.id);
              return (
                <button key={c.id} type="button" className="rt-kut-kol" onClick={() => setKol(c.id)}>
                  <span className="ic">{c.ikon ?? '📁'}</span>
                  <span className="tx"><b>{c.ad}</b><small>{(c.alanlar ?? []).map((a) => alanlar.find((x) => x.id === a)?.ikon ?? '').join(' ')}{bagli.length ? ` · 🔗 ${bagli.map((r) => r.ad).join(', ')}` : ''}</small></span>
                  <span className="say">{n}</span><span className="chev">›</span>
                </button>
              );
            })}
            {kartlar.some((k) => !k.klasor_id || !kolAd(k.klasor_id)) && (
              <button type="button" className="rt-kut-kol bos" onClick={() => setKol('-')}>
                <span className="ic">🗂</span><span className="tx"><b>Koleksiyonsuz kartlar</b><small>Gelenler&apos;den ve Ajandam&apos;dan kaydedilenler</small></span>
                <span className="say">{kartlar.filter((k) => !k.klasor_id || !kolAd(k.klasor_id)).length}</span><span className="chev">›</span>
              </button>
            )}
          </div>
        </>
      )}

      {tur !== 'kart' && !suzuluyor && (
        <>
          <div className="rt-kut-bolum"><span>Hafta şablonları</span></div>
          <HaftaSablonlari disiplin="kisisel" tam />
          <p className="rt-muted">Bir rutinin haftasını kurunca Plan&apos;daki &quot;💾 Haftayı şablon kaydet&quot; ile buraya gelir; &quot;📋 Şablon uygula&quot; ile başka haftalara uygularsın.</p>
        </>
      )}

      {yeniKol && <KoleksiyonFormu alanlar={alanlar} onKapat={() => setYeniKol(false)} onKaydet={async (v) => { const id = await koleksiyonOlustur(v.ad, v.ikon, v.alanlar); setKol(id); }} />}
      {yeniKart && <KartEditor tarih={bugun()} tarihsiz baslik="Kütüphaneye kart" onKapat={() => setYeniKart(false)} onPlan={async (t) => { await kutKartEkle(null, t); }} />}
      {kartAc && <KutKartDetay k={kartAc} kols={kols} onKapat={() => setKartAc(null)} />}
    </div>
  );
}

function KartSatiri({ k, kol, onAc }: { k: KutuphaneKartRow; kol?: string; onAc: () => void }) {
  const u = useCanli(kutKullanimlari, [], {} as Record<string, KutKullanim>)[k.id];
  return (
    <button type="button" className="rt-kut-kart" onClick={onAc}>
      <span className="ic">{kartIkon(k)}</span>
      <span className="tx"><b>{k.ad}</b>
        <small>{(k.konular ?? []).map((x) => <span key={x} className="rt-konu">{x}</span>)}{kol ? `${kol}` : ''}{u && (u.yapildi > 0 || u.siradaki) ? ` · ${u.yapildi ? `${u.yapildi}×` : ''}${u.siradaki ? ` 📅 ${u.siradaki === bugun() ? 'bugün' : kisaTarih(u.siradaki)}` : ''}` : ''}</small>
      </span>
      <span className="chev">›</span>
    </button>
  );
}

function Koleksiyon({ kol, kolIdler, kartlar, alanlar, rutinler, onGeri, onKart }: {
  kol: KlasorRow | null; kolIdler: Set<string>; kartlar: KutuphaneKartRow[]; alanlar: YasamAlaniRow[]; rutinler: ProgramRow[]; onGeri: () => void; onKart: (k: KutuphaneKartRow) => void;
}) {
  const [konu, setKonu] = useState<string | null>(null);
  const [duzen, setDuzen] = useState(false);
  const [sil, setSil] = useState(false);
  const [yeniKart, setYeniKart] = useState(false);
  const tum = kol ? kartlar.filter((k) => k.klasor_id === kol.id) : kartlar.filter((k) => !k.klasor_id || !kolIdler.has(k.klasor_id));
  const liste = tum.filter((k) => !konu || (konu === '∅' ? !(k.konular ?? []).length : (k.konular ?? []).includes(konu)))
    .sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'));
  const konular = Array.from(new Set(tum.flatMap((k) => k.konular ?? []))).sort((a, b) => a.localeCompare(b, 'tr'));
  const konusuz = tum.filter((k) => !(k.konular ?? []).length).length;
  return (
    <div className="rt-kol">
      <div className="rt-geri-bar"><button type="button" className="rt-geri-dugme" onClick={onGeri}>‹ Kütüphane</button></div>
      <div className="rt-tek">
        <span className="ic">{kol?.ikon ?? '🗂'}</span>
        <span className="tx"><b>{kol?.ad ?? 'Koleksiyonsuz kartlar'}</b>
          <small>{kol ? `${(kol.alanlar ?? []).map((a) => { const x = alanlar.find((y) => y.id === a); return x ? `${x.ikon} ${x.ad}` : ''; }).filter(Boolean).join(' · ') || 'alan yok'} · ${tum.length} kart` : `${tum.length} kart`}{rutinler.length ? ` · 🔗 ${rutinler.map((r) => r.ad).join(', ')}` : ''}</small>
        </span>
        {kol && <button type="button" className="rt-ikon" aria-label="Koleksiyonu düzenle" onClick={() => setDuzen(true)}>⋯</button>}
      </div>
      {(konular.length > 0) && (
        <div className="rt-kut-suz">
          <button type="button" className={`rt-chip${!konu ? ' on' : ''}`} onClick={() => setKonu(null)}>Tümü <small>{tum.length}</small></button>
          {konular.map((k) => <button key={k} type="button" className={`rt-chip${konu === k ? ' on' : ''}`} onClick={() => setKonu(konu === k ? null : k)}>{k} <small>{tum.filter((x) => (x.konular ?? []).includes(k)).length}</small></button>)}
          {konusuz > 0 && <button type="button" className={`rt-chip${konu === '∅' ? ' on' : ''}`} onClick={() => setKonu(konu === '∅' ? null : '∅')}>konusuz <small>{konusuz}</small></button>}
        </div>
      )}
      <div className="rt-arac">
        {liste.map((k) => <KartSatiri key={k.id} k={k} onAc={() => onKart(k)} />)}
        {!liste.length && <p className="rt-muted">Henüz kart yok.</p>}
        {kol && <button type="button" className="rt-hedef-sat yeni" onClick={() => setYeniKart(true)}><span className="ic">＋</span><span className="ad">Kart ekle{konu && konu !== '∅' ? ` · ${konu}` : ''}</span></button>}
      </div>
      <p className="rt-muted">Konu, kartın etiketi: bir kart birden çok konuda görünebilir. Kartı açıp &quot;Konular&quot;dan eklersin.</p>
      {yeniKart && kol && <KartEditor tarih={bugun()} tarihsiz baslik={`${kol.ikon ?? '📁'} ${kol.ad} › kart`} onKapat={() => setYeniKart(false)} onPlan={async (t) => { await kutKartEkle(kol.id, t, konu && konu !== '∅' ? [konu] : []); }} />}
      {duzen && kol && !sil && (
        <KoleksiyonFormu ilk={kol} alanlar={alanlar} onKapat={() => setDuzen(false)} onSil={() => setSil(true)}
          onKaydet={async (v) => { await koleksiyonGuncelle(kol.id, v); }} />
      )}
      {sil && kol && (
        <Modal baslik={`${kol.ikon ?? '📁'} ${kol.ad}`} onKapat={() => { setSil(false); setDuzen(false); }}>
          <OnayKutusu metin="Koleksiyon silinsin mi? Kartları silinmez, koleksiyonsuz kalır; bağlı rutinin malzeme bağı kalkar." evet="Sil"
            onVazgec={() => { setSil(false); setDuzen(false); }} onEvet={async () => { await koleksiyonSil(kol.id); onGeri(); }} />
        </Modal>
      )}
    </div>
  );
}

function KoleksiyonFormu({ ilk, alanlar, onKapat, onKaydet, onSil }: {
  ilk?: KlasorRow; alanlar: YasamAlaniRow[]; onKapat: () => void; onKaydet: (v: { ad: string; ikon: string; alanlar: string[] }) => Promise<void>; onSil?: () => void;
}) {
  const [ad, setAd] = useState(ilk?.ad ?? '');
  const [ikon, setIkon] = useState(ilk?.ikon ?? '📁');
  const [etiket, setEtiket] = useState<string[]>(ilk?.alanlar ?? []);
  const ikonlar = Array.from(new Set([...KOLEKSIYON_IKON, ...ALAN_IKONLARI]));
  return (
    <Modal baslik={ilk ? 'Koleksiyon' : '＋ Koleksiyon'} onKapat={onKapat}>
      <div className="rt-prog-ad">
        <span className="rt-prog-ikon" aria-hidden="true">{ikon}</span>
        <input className="rt-inp" placeholder="Ad (ör. Gitar, LGS Matematik, Kahvaltı tarifleri)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus={!ilk} />
      </div>
      <div className="rt-ikon-izgara" role="radiogroup" aria-label="Simge">
        {ikonlar.map((x) => <button key={x} type="button" role="radio" aria-checked={ikon === x} className={ikon === x ? 'on' : ''} onClick={() => setIkon(x)}>{x}</button>)}
      </div>
      <span className="rt-alan-lbl">Alanlar (kartlar devralır)</span>
      <div className="rt-alan-sec">
        {alanlar.map((a) => { const sec = etiket.includes(a.id); return <button key={a.id} type="button" aria-pressed={sec} className={`rt-chip${sec ? ' on' : ''}`} onClick={() => setEtiket(sec ? etiket.filter((x) => x !== a.id) : [...etiket, a.id])}>{a.ikon} {a.ad}</button>; })}
      </div>
      <div className="rt-satir" style={{ justifyContent: 'space-between' }}>
        {onSil ? <button type="button" className="rt-btn tehlike" onClick={onSil}>Sil</button> : <span />}
        <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => { await onKaydet({ ad, ikon, alanlar: etiket }); onKapat(); }}>{ilk ? 'Kaydet' : 'Oluştur'}</button>
      </div>
    </Modal>
  );
}

function KutKartDetay({ k, kols, onKapat }: { k: KutuphaneKartRow; kols: KlasorRow[]; onKapat: () => void }) {
  const kart = useCanli(async () => (await db.kutuphane_kart.get(k.id)) ?? null, [k.id], k as KutuphaneKartRow | null) ?? k;
  const [duzenle, setDuzenle] = useState(false);
  const [al, setAl] = useState(false);
  const [sil, setSil] = useState(false);
  const [tasi, setTasi] = useState(false);
  const [konuYeni, setKonuYeni] = useState('');
  const kullanim = useCanli(kutKullanimlari, [], {} as Record<string, KutKullanim>)[k.id];
  if (duzenle) {
    const sahte = { id: kart.id, tip: kart.tip, ad: kart.ad, bloklar: kart.bloklar, baslangic: bugun(), bitis: bugun(), gunler: null, saatler: [] } as unknown as AjandaKartRow;
    return <KartEditor tarih={bugun()} kart={sahte} tarihsiz baslik="Kartı düzenle" onKapat={onKapat} onPlan={async (t) => { await kutKartGuncelle(kart.id, t); }} />;
  }
  if (al) return <AjandayaAlModal k={kart} onKapat={onKapat} />;
  if (tasi) return <KlasorSecModal baslik="Koleksiyona taşı" onKapat={onKapat} onSec={async (kl) => { await kutKartTasi(kart.id, kl); }} />;
  const konular = kart.konular ?? [];
  const ekle = async () => { if (!konuYeni.trim()) return; await kutKartKonular(kart.id, [...konular, konuYeni]); setKonuYeni(''); };
  const kol = kols.find((c) => c.id === kart.klasor_id);
  return (
    <Modal baslik={kart.ad} onKapat={onKapat}>
      <BlokGoster bloklar={kart.bloklar} />
      {kullanim && <p className="rt-muted">{kullanim.yapildi ? `${kullanim.yapildi} kez uygulandı${kullanim.son ? ` · son: ${kisaTarih(kullanim.son)}` : ''}` : 'Henüz uygulanmadı'}{kullanim.siradaki ? ` · Ajanda'da: ${kullanim.siradaki === bugun() ? 'bugün' : kisaTarih(kullanim.siradaki)}` : ''}</p>}
      <div className="rt-kut-konular">
        <span className="rt-alan-lbl">{kol ? `${kol.ikon ?? '📁'} ${kol.ad} · konular` : 'Konular'}</span>
        <div className="rt-alan-sec">
          {konular.map((x) => <button key={x} type="button" className="rt-chip on" aria-label={`${x} konusunu kaldır`} onClick={() => kutKartKonular(kart.id, konular.filter((y) => y !== x))}>{x} ×</button>)}
          <input className="rt-inp rt-konu-inp" placeholder="＋ konu" value={konuYeni} onInput={(e) => e.stopPropagation() /* konu hemen kaydedilir: pencere "kaydedilmemiş" saymasın */} onChange={(e) => setKonuYeni(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ekle(); }} onBlur={ekle} />
        </div>
      </div>
      {!sil && (
        <div className="rt-satir">
          <button type="button" className="rt-btn primary" onClick={() => setAl(true)}>📅 Ajandaya al</button>
          <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>
          <button type="button" className="rt-btn" onClick={() => setTasi(true)}>Koleksiyona taşı</button>
          <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>
        </div>
      )}
      {sil && <OnayKutusu metin="Kart kütüphaneden silinsin mi? Ajanda'ya alınmış kopyaları kalır." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await kutKartSil(kart.id); onKapat(); }} />}
    </Modal>
  );
}

const GUN_SAYI: [number | null, string][] = [[1, 'Yalnız o gün'], [2, '2 gün'], [3, '3 gün'], [7, '1 hafta'], [null, 'Süresiz']];

function AjandayaAlModal({ k, onKapat }: { k: KutuphaneKartRow; onKapat: () => void }) {
  const [tarih, setTarih] = useState(bugun());
  const [saat, setSaat] = useState('');
  const [gun, setGun] = useState<number | null>(1);
  const [ozel, setOzel] = useState('');
  const [gunler, setGunler] = useState<number[]>([]);
  const [tamam, setTamam] = useState(false);
  const sayi = ozel ? Number(ozel) : gun;
  if (tamam) return (
    <Modal baslik="Ajandaya alındı" onKapat={onKapat}>
      <p className="rt-tamam">&quot;{k.ad}&quot; Ajanda&apos;na eklendi.</p>
      <button type="button" className="rt-btn" onClick={onKapat}>Tamam</button>
    </Modal>
  );
  return (
    <Modal baslik={`📅 ${k.ad}`} onKapat={onKapat}>
      <div className="rt-satir">
        <label className="rt-alan"><span>Başlangıç</span><input className="rt-inp" type="date" min={bugun()} value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
        <label className="rt-alan"><span>Saat (isteğe bağlı)</span><input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      </div>
      <div className="rt-chips">
        {GUN_SAYI.map(([v, e]) => <button key={e} type="button" className={`rt-chip${!ozel && gun === v ? ' on' : ''}`} onClick={() => { setGun(v); setOzel(''); }}>{e}</button>)}
        <input className="rt-inp rt-kisa" inputMode="numeric" placeholder="gün" value={ozel} onChange={(e) => setOzel(e.target.value.replace(/\D/g, ''))} />
      </div>
      {sayi !== 1 && (
        <div className="rt-chips">
          <button type="button" className={`rt-chip${!gunler.length ? ' on' : ''}`} onClick={() => setGunler([])}>Her gün</button>
          {GUN_KISA.map(([g, e]) => <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>)}
        </div>
      )}
      <button type="button" className="rt-btn primary" disabled={!tarih} onClick={async () => { await ajandayaAl(k, { tarih, saat, gun: sayi, gunler: sayi === 1 ? null : gunler }); setTamam(true); }}>Ajandaya ekle</button>
    </Modal>
  );
}


/** Ajanda kartının detayında "Kütüphaneye kaydet" ve kart taşıma — koleksiyon seçimi. */
export function KlasorSecModal({ baslik, onKapat, onSec }: { baslik: string; onKapat: () => void; onSec: (klasorId: string | null) => Promise<void> }) {
  const kols = useCanli(koleksiyonlar, [], [] as KlasorRow[]);
  const [tamam, setTamam] = useState<string | null>(null);
  const [yeni, setYeni] = useState('');
  if (tamam) return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <p className="rt-tamam">Kütüphanede &quot;{tamam}&quot; içine kaydedildi.</p>
      <button type="button" className="rt-btn" onClick={onKapat}>Tamam</button>
    </Modal>
  );
  return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <p className="rt-muted">Hangi koleksiyona?</p>
      <div className="rt-kut-secler">
        {kols.map((c) => <button key={c.id} type="button" className="rt-kut-sec" onClick={async () => { await onSec(c.id); setTamam(c.ad); }}>{c.ikon ?? '📁'} {c.ad}</button>)}
        <button type="button" className="rt-kut-sec" onClick={async () => { await onSec(null); setTamam('Koleksiyonsuz'); }}>🗂 Koleksiyonsuz</button>
      </div>
      <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
        <input className="rt-inp" placeholder="Yeni koleksiyon adı" value={yeni} onChange={(e) => setYeni(e.target.value)} />
        <button type="button" className="rt-btn" disabled={!yeni.trim()} onClick={async () => { const id = await koleksiyonOlustur(yeni); await onSec(id); setTamam(yeni.trim()); }}>＋ Oluştur</button>
      </div>
    </Modal>
  );
}

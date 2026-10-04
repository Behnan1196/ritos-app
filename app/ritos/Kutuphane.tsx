'use client';

// Kütüphane (30 eylül) — klasör ağacı + tarihsiz kartlar. Taşıma kes/yapıştır ile.
// Motor: lib/kutuphane.ts.

import React, { useEffect, useState } from 'react';
import { useCanli } from '@/lib/canli';
import { db, type AjandaKartRow, type KlasorRow, type KutuphaneKartRow, type ProgramRow } from '@/lib/db';
import {
  ajandayaAl, klasorAdDegistir, klasorOlustur, klasorSilIcerikUste, klasorTasi, kutKartEkle, kutKartGuncelle, kutKartSil, kutKartTasi,
  kutKullanimlari, type KutKullanim,
} from '@/lib/kutuphane';
import { EN_FAZLA_SEVIYE, seviye } from '@/lib/alan';
import { GUN_KISA, bugun, tarihParse } from '@/lib/paket';
import { BlokGoster, Modal, OnayKutusu } from './ortak';
import { KartEditor } from './KartEditor';
import { ProgramEkrani } from './KisiselGelisim';
import { programiSil } from '@/lib/danismanlik';

type Kesilen = { tur: 'kart' | 'klasor' | 'program'; id: string; ad: string } | null;
const ACIK_ANAH = 'ritos-kut-acik';

const kisaTarih = (t: string) => tarihParse(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const kartIkon = (k: KutuphaneKartRow) => (k.bloklar.some((b) => b.tur === 'video') ? '🎬' : k.bloklar.some((b) => b.tur === 'sayi') ? '📏' : '📄');

export default function Kutuphane() {
  const klasorler = useCanli(() => db.klasor.toArray(), [], [] as KlasorRow[]);
  const kartlar = useCanli(() => db.kutuphane_kart.toArray(), [], [] as KutuphaneKartRow[]);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], [] as ProgramRow[]);
  const kullanim = useCanli(kutKullanimlari, [], {} as Record<string, KutKullanim>);
  const [acik, setAcik] = useState<Set<string>>(new Set());
  useEffect(() => { try { setAcik(new Set(JSON.parse(localStorage.getItem(ACIK_ANAH) ?? '[]'))); } catch { /* yok say */ } }, []);
  const ac = (id: string) => setAcik((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(ACIK_ANAH, JSON.stringify(Array.from(n))); } catch { /* yok say */ }
    return n;
  });
  const [kesilen, setKesilen] = useState<Kesilen>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yeniKlasor, setYeniKlasor] = useState<{ ust: string | null } | null>(null);
  const [yeniKart, setYeniKart] = useState<{ klasor: string | null } | null>(null);
  const [kartAc, setKartAc] = useState<KutuphaneKartRow | null>(null);
  const [klasorMenu, setKlasorMenu] = useState<KlasorRow | null>(null);
  const [program, setProgram] = useState<string | null>(null);
  const [programMenu, setProgramMenu] = useState<ProgramRow | null>(null);

  async function yapistir(hedef: string | null) {
    if (!kesilen) return;
    setHata(null);
    try {
      if (kesilen.tur === 'kart') await kutKartTasi(kesilen.id, hedef);
      else if (kesilen.tur === 'klasor') await klasorTasi(kesilen.id, hedef);
      else await db.program.update(kesilen.id, { klasor_id: hedef, guncellendi: Date.now() });
      if (hedef) setAcik((s) => new Set(s).add(hedef));
      setKesilen(null);
    } catch (e) { setHata((e as Error).message); }
  }

  if (program) return <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}><ProgramEkrani programId={program} onGeri={() => setProgram(null)} /></div>;

  const icerik = (ust: string | null, derin: number): React.ReactNode => {
    const altlar = klasorler.filter((k) => k.ust_id === ust).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || a.ad.localeCompare(b.ad, 'tr'));
    const ks = kartlar.filter((k) => k.klasor_id === ust).sort((a, b) => a.sira - b.sira);
    const ps = programlar.filter((p) => (p.klasor_id ?? null) === ust);
    return (
      <>
        {altlar.map((k) => {
          const a = acik.has(k.id);
          const say = kartlar.filter((x) => x.klasor_id === k.id).length + klasorler.filter((x) => x.ust_id === k.id).length;
          return (
            <div key={k.id} className="rt-kut-dugum">
              <div className={`rt-kut-satir klasor${kesilen?.id === k.id ? ' kesik' : ''}`} style={{ paddingLeft: 6 + derin * 16 }}>
                <button type="button" className="ad" onClick={() => ac(k.id)}>
                  <span className="ok">{a ? '▾' : '▸'}</span><span className="iko">📁</span><span className="nm">{k.ad}</span>{say > 0 && <span className="say">{say}</span>}
                </button>
                {kesilen && kesilen.id !== k.id && <button type="button" className="rt-kut-yap" onClick={() => yapistir(k.id)}>📋 Buraya</button>}
                <button type="button" className="rt-ikon" onClick={() => setKlasorMenu(k)} aria-label={`${k.ad} klasörü seçenekleri`}>⋯</button>
              </div>
              {a && icerik(k.id, derin + 1)}
            </div>
          );
        })}
        {ps.map((p) => (
          <div key={p.id} className={`rt-kut-satir${kesilen?.id === p.id ? ' kesik' : ''}`} style={{ paddingLeft: 6 + derin * 16 + 18 }}>
            <button type="button" className="ad" onClick={() => setProgram(p.id)}><span className="iko">{p.ikon ?? '🌱'}</span><span className="nm">{p.ad}</span><span className="rt-muted"> program</span></button>
            <button type="button" className="rt-ikon" onClick={() => setProgramMenu(p)} aria-label={`${p.ad} programı seçenekleri`}>⋯</button>
          </div>
        ))}
        {ks.map((k) => {
          const u = kullanim[k.id];
          return (
            <div key={k.id} className={`rt-kut-satir${kesilen?.id === k.id ? ' kesik' : ''}`} style={{ paddingLeft: 6 + derin * 16 + 18 }}>
              <button type="button" className="ad" onClick={() => setKartAc(k)}>
                <span className="iko">{kartIkon(k)}</span><span className="nm">{k.ad}</span>
                {u && (u.yapildi > 0 || u.siradaki) && <span className="rt-kut-meta">{u.yapildi ? `${u.yapildi}×` : ''}{u.siradaki ? ` 📅 ${u.siradaki === bugun() ? 'bugün' : kisaTarih(u.siradaki)}` : ''}</span>}
              </button>
            </div>
          );
        })}
        {derin > 0 && !altlar.length && !ks.length && !ps.length && <p className="rt-muted rt-kut-bos" style={{ paddingLeft: 6 + derin * 16 + 18 }}>Boş</p>}
      </>
    );
  };

  const bos = !klasorler.length && !kartlar.length && !programlar.length;
  return (
    <div className="side-content rt-kut" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="rt-kut-bas">
        <h4>📚 Kütüphane</h4>
        <button type="button" className="rt-btn" onClick={() => setYeniKlasor({ ust: null })}>＋ Klasör</button>
        <button type="button" className="rt-btn primary" onClick={() => setYeniKart({ klasor: null })}>＋ Kart</button>
      </div>
      {kesilen && (
        <div className="rt-kut-kes">
          <span>✂️ <b>{kesilen.ad}</b> taşınıyor — hedef klasörde &quot;📋 Buraya&quot;ya bas.</span>
          <button type="button" className="rt-btn" onClick={() => yapistir(null)}>En üste</button>
          <button type="button" className="rt-btn" onClick={() => setKesilen(null)}>Vazgeç</button>
        </div>
      )}
      {hata && <p className="rt-hata" onClick={() => setHata(null)}>⚠ {hata}</p>}
      {bos && (
        <p className="rt-muted rt-kut-giris">
          Beğendiğin videoları, anlatımları, egzersizleri kart olarak topla; klasörlerde tasnif et (örn. Müzik › Gitar, TYT › Matematik).
          Bir kartı istediğin gün &quot;Ajandaya al&quot; ile uygula. Ajanda&apos;daki bir kartı da detayından &quot;Kütüphaneye kaydet&quot; ile buraya alabilirsin.
        </p>
      )}
      <div className="rt-kut-agac">{icerik(null, 0)}</div>

      {yeniKlasor && <KlasorAdModal baslik="Yeni klasör" onKapat={() => setYeniKlasor(null)} onKaydet={async (ad) => { const id = await klasorOlustur(ad, yeniKlasor.ust); if (yeniKlasor.ust) setAcik((s) => new Set(s).add(yeniKlasor.ust!)); return id; }} />}
      {yeniKart && (
        <KartEditor tarih={bugun()} tarihsiz baslik="Kütüphaneye kart" onKapat={() => setYeniKart(null)}
          onPlan={async (t) => { await kutKartEkle(yeniKart.klasor, t); if (yeniKart.klasor) setAcik((s) => new Set(s).add(yeniKart.klasor!)); }} />
      )}
      {kartAc && <KutKartDetay k={kartAc} onKapat={() => setKartAc(null)} onKes={() => { setKesilen({ tur: 'kart', id: kartAc.id, ad: kartAc.ad }); setKartAc(null); }} />}
      {programMenu && (
        <ProgramMenu
          p={programMenu}
          onKapat={() => setProgramMenu(null)}
          onAc={() => { setProgram(programMenu.id); setProgramMenu(null); }}
          onKes={() => { setKesilen({ tur: 'program', id: programMenu.id, ad: programMenu.ad }); setProgramMenu(null); }}
        />
      )}
      {klasorMenu && (
        <KlasorMenu
          k={klasorMenu}
          altKlasorOlur={seviye(klasorMenu, klasorler) < EN_FAZLA_SEVIYE}
          onKapat={() => setKlasorMenu(null)}
          onKartEkle={() => { setYeniKart({ klasor: klasorMenu.id }); setKlasorMenu(null); }}
          onAltKlasor={() => { setYeniKlasor({ ust: klasorMenu.id }); setKlasorMenu(null); }}
          onKes={() => { setKesilen({ tur: 'klasor', id: klasorMenu.id, ad: klasorMenu.ad }); setKlasorMenu(null); }}
        />
      )}
    </div>
  );
}

function ProgramMenu({ p, onKapat, onAc, onKes }: { p: ProgramRow; onKapat: () => void; onAc: () => void; onKes: () => void }) {
  const [sil, setSil] = useState(false);
  return (
    <Modal baslik={`${p.ikon ?? '🌱'} ${p.ad}`} onKapat={onKapat}>
      <div className="rt-kut-menu">
        <button type="button" className="rt-btn primary" onClick={onAc}>Aç</button>
        <button type="button" className="rt-btn" onClick={onKes}>✂️ Kes (taşı)</button>
        {!sil && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
      </div>
      {sil && <OnayKutusu metin="Program silinsin mi? Ajanda'daki yarından sonraki kartları kalkar; geçmiş kayıtlar kalır." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await programiSil(p.id); onKapat(); }} />}
    </Modal>
  );
}

function KlasorAdModal({ baslik, ilk = '', onKapat, onKaydet }: { baslik: string; ilk?: string; onKapat: () => void; onKaydet: (ad: string) => Promise<unknown> }) {
  const [ad, setAd] = useState(ilk);
  const [hata, setHata] = useState<string | null>(null);
  const kaydet = async () => { try { await onKaydet(ad); onKapat(); } catch (e) { setHata((e as Error).message); } };
  return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <input className="rt-inp" placeholder="Klasör adı (örn. Gitar)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && ad.trim()) kaydet(); }} />
      {hata && <p className="rt-hata">⚠ {hata}</p>}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={kaydet}>Kaydet</button>
    </Modal>
  );
}

function KlasorMenu({ k, altKlasorOlur, onKapat, onKartEkle, onAltKlasor, onKes }: { k: KlasorRow; altKlasorOlur: boolean; onKapat: () => void; onKartEkle: () => void; onAltKlasor: () => void; onKes: () => void }) {
  const [adDegis, setAdDegis] = useState(false);
  const [sil, setSil] = useState(false);
  if (adDegis) return <KlasorAdModal baslik="Klasörün adı" ilk={k.ad} onKapat={onKapat} onKaydet={(ad) => klasorAdDegistir(k.id, ad)} />;
  return (
    <Modal baslik={`📁 ${k.ad}`} onKapat={onKapat}>
      <div className="rt-kut-menu">
        <button type="button" className="rt-btn primary" onClick={onKartEkle}>＋ Kart ekle</button>
        {altKlasorOlur && <button type="button" className="rt-btn" onClick={onAltKlasor}>＋ Alt klasör</button>}
        <button type="button" className="rt-btn" onClick={() => setAdDegis(true)}>✎ Adını değiştir</button>
        <button type="button" className="rt-btn" onClick={onKes}>✂️ Kes (taşı)</button>
        {!sil && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
      </div>
      {sil && <OnayKutusu metin="Klasör silinsin mi? İçindekiler bir üst klasöre çıkar, hiçbiri silinmez." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await klasorSilIcerikUste(k.id); onKapat(); }} />}
    </Modal>
  );
}

function KutKartDetay({ k, onKapat, onKes }: { k: KutuphaneKartRow; onKapat: () => void; onKes: () => void }) {
  const [duzenle, setDuzenle] = useState(false);
  const [al, setAl] = useState(false);
  const [sil, setSil] = useState(false);
  const kullanim = useCanli(kutKullanimlari, [], {} as Record<string, KutKullanim>)[k.id];
  if (duzenle) {
    const sahte = { id: k.id, tip: k.tip, ad: k.ad, bloklar: k.bloklar, baslangic: bugun(), bitis: bugun(), gunler: null, saatler: [] } as unknown as AjandaKartRow;
    return <KartEditor tarih={bugun()} kart={sahte} tarihsiz baslik="Kartı düzenle" onKapat={onKapat} onPlan={async (t) => { await kutKartGuncelle(k.id, t); }} />;
  }
  if (al) return <AjandayaAlModal k={k} onKapat={onKapat} />;
  return (
    <Modal baslik={k.ad} onKapat={onKapat}>
      <BlokGoster bloklar={k.bloklar} />
      {kullanim && <p className="rt-muted">{kullanim.yapildi ? `${kullanim.yapildi} kez uygulandı${kullanim.son ? ` · son: ${kisaTarih(kullanim.son)}` : ''}` : 'Henüz uygulanmadı'}{kullanim.siradaki ? ` · Ajanda'da: ${kullanim.siradaki === bugun() ? 'bugün' : kisaTarih(kullanim.siradaki)}` : ''}</p>}
      {!sil && (
        <div className="rt-satir">
          <button type="button" className="rt-btn primary" onClick={() => setAl(true)}>📅 Ajandaya al</button>
          <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>
          <button type="button" className="rt-btn" onClick={onKes}>✂️ Kes</button>
          <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>
        </div>
      )}
      {sil && <OnayKutusu metin="Kart kütüphaneden silinsin mi? Ajanda'ya alınmış kopyaları kalır." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await kutKartSil(k.id); onKapat(); }} />}
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

/** Ajanda kartının detayında: "Kütüphaneye kaydet" — klasör seçimi. */
export function KlasorSecModal({ baslik, onKapat, onSec }: { baslik: string; onKapat: () => void; onSec: (klasorId: string | null) => Promise<void> }) {
  const klasorler = useCanli(() => db.klasor.toArray(), [], [] as KlasorRow[]);
  const [tamam, setTamam] = useState<string | null>(null);
  const satir = (ust: string | null, derin: number): React.ReactNode =>
    klasorler.filter((k) => k.ust_id === ust).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((k) => (
      <React.Fragment key={k.id}>
        <button type="button" className="rt-kut-sec" style={{ paddingLeft: 8 + derin * 16 }} onClick={async () => { await onSec(k.id); setTamam(k.ad); }}>📁 {k.ad}</button>
        {satir(k.id, derin + 1)}
      </React.Fragment>
    ));
  if (tamam) return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <p className="rt-tamam">Kütüphanede &quot;{tamam}&quot; klasörüne kaydedildi.</p>
      <button type="button" className="rt-btn" onClick={onKapat}>Tamam</button>
    </Modal>
  );
  return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <p className="rt-muted">Hangi klasöre?</p>
      <div className="rt-kut-secler">
        <button type="button" className="rt-kut-sec" onClick={async () => { await onSec(null); setTamam('En üst'); }}>📚 En üst (klasörsüz)</button>
        {satir(null, 0)}
      </div>
    </Modal>
  );
}

'use client';

// ————————————————————————————————————————————————————————————————
// Çevrem (7 ekim — v1). Ailem ve arkadaş grupları: bugün evde (ortak işler), ricalar, ortak
// listeler, son olanlar. Danışmanlık burada değil (Home widget'ına taşınacak). Bkz. mockup
// "Ritos Çevrem" ve lib/cevrem.ts.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useMemo, useState } from 'react';
import {
  GRUP_SINIR, GRUP_TUR, aktifUyeler, benYoneticiyim, davetBak, davetKodu, grupAyril, grupGuncelle, grupIkonu, grupKatil, grupKur,
  isEkle, isGuncelle, isGunu, isKaydi, isSil, isUstlen, isYapildi, isaretlileriTemizle, listeEkle, listeGuncelle, listeSil,
  maddeEkle, maddeIsaretle, maddeSil, ricaDurum, ricaGonder, useCevrem, uyeAdi,
  type CevremDurum, type Grup, type GrupTur, type IsGirdi, type Liste, type OrtakIs, type Rica,
} from '@/lib/cevrem';
import { GUN_KISA, bugun, tarihEkle, tarihEtiket } from '@/lib/paket';
import { Modal, OnayKutusu } from './ortak';
import { Avatar, HesapGerekli } from './Hesap';
import { danismanlikDavetiAc } from './Danismanlik';

const SECILI = 'ritos-cevrem-grup';
const LISTE_IKON = ['🛒', '📝', '🧳', '🔧', '🎁', '🍳', '🏥', '📚'];

function hataMetni(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission/i.test(m)) return 'Bu işlem için yetkin yok.';
  return m;
}

function tekrarMetni(i: OrtakIs) {
  if (i.bitis === i.tarih) return '';
  if (!i.gunler || i.gunler.length === 0 || i.gunler.length === 7) return 'her gün';
  return GUN_KISA.filter(([g]) => i.gunler!.includes(g)).map(([, a]) => a).join(' ');
}

const sureMetni = (iso: string) => {
  const dk = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk`;
  const sa = Math.round(dk / 60);
  return sa < 24 ? `${sa} sa` : `${Math.round(sa / 24)} g`;
};

// ———————————————— ana ————————————————

type Ekran = { t: 'ana' } | { t: 'liste'; id: string } | { t: 'ayar' };
type Sayfa = null | 'ekle' | 'is' | 'rica' | 'liste' | 'davet' | 'katil' | 'kur' | { is: OrtakIs };

export default function Cevrem() {
  const d = useCevrem();
  const [seciliId, setSeciliId] = useState<string | null>(() => { try { return localStorage.getItem(SECILI); } catch { return null; } });
  const [ekran, setEkran] = useState<Ekran>({ t: 'ana' });
  const [sayfa, setSayfa] = useState<Sayfa>(null);
  const [katilKod, setKatilKod] = useState<string>('');

  // Davet bağlantısı: ?katil=KOD
  useEffect(() => {
    try {
      const u = new URL(location.href);
      const k = u.searchParams.get('katil');
      if (k) { setKatilKod(k); setSayfa('katil'); u.searchParams.delete('katil'); history.replaceState(null, '', u.pathname + u.search); }
    } catch { /* yoksay */ }
  }, []);

  const grup = d.gruplar.find((g) => g.id === seciliId) ?? d.gruplar[0] ?? null;
  const sec = (id: string) => { setSeciliId(id); setEkran({ t: 'ana' }); try { localStorage.setItem(SECILI, id); } catch { /* yoksay */ } };

  if (!d.hazir) return <div className="rt-cv"><p className="rt-muted">Yükleniyor…</p></div>;
  if (!d.uid) return <div className="rt-cv"><HesapGerekli ikon="🏠" baslik="Evdekilerle işleri paylaş" metin="Market listesi, evin işleri, birinden küçük bir rica. Çevrem, ailen ve arkadaşlarınla canlı paylaşım için hesap ister." /></div>;
  const ortakSayfalar = (
    <>
      {sayfa === 'kur' && <GrupKurModal onKapat={() => setSayfa(null)} onKuruldu={(id) => { sec(id); setSayfa('davet'); }} />}
      {sayfa === 'katil' && <KatilModal kod0={katilKod} onKapat={() => setSayfa(null)} onKatildi={(id) => { sec(id); setSayfa(null); }} />}
    </>
  );
  if (!grup) return (
    <div className="rt-cv">
      {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
      <BosEkran onKur={() => setSayfa('kur')} onKatil={() => setSayfa('katil')} />
      {ortakSayfalar}
    </div>
  );

  const liste = ekran.t === 'liste' ? d.listeler.find((l) => l.id === ekran.id) : null;
  return (
    <div className="rt-cv">
      {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
      {ekran.t === 'liste' && liste ? <ListeEkrani d={d} liste={liste} onGeri={() => setEkran({ t: 'ana' })} />
        : ekran.t === 'ayar' ? <GrupAyarlari d={d} grup={grup} onGeri={() => setEkran({ t: 'ana' })} onDavet={() => setSayfa('davet')} />
        : (
          <>
            <GrupBasligi d={d} grup={grup} onSec={sec} onKur={() => setSayfa('kur')} onKatil={() => setSayfa('katil')} onDavet={() => setSayfa('davet')} onAyar={() => setEkran({ t: 'ayar' })} />
            <GelenRicalar d={d} grup={grup} />
            <BugunEvde d={d} grup={grup} onAc={(i) => setSayfa({ is: i })} onEkle={() => setSayfa('is')} />
            <Listeler d={d} grup={grup} onAc={(id) => setEkran({ t: 'liste', id })} onYeni={() => setSayfa('liste')} />
            <GonderilenRicalar d={d} grup={grup} />
            <SonOlanlar d={d} grup={grup} />
            <button type="button" className="rt-cv-fab" aria-label="Ekle" onClick={() => setSayfa('ekle')}>＋</button>
          </>
        )}
      {sayfa === 'ekle' && <EkleSayfasi grup={grup} onKapat={() => setSayfa(null)} onSec={(s) => setSayfa(s)} />}
      {sayfa === 'is' && <IsFormu d={d} grup={grup} onKapat={() => setSayfa(null)} />}
      {sayfa && typeof sayfa === 'object' && <IsFormu d={d} grup={grup} is={sayfa.is} onKapat={() => setSayfa(null)} />}
      {sayfa === 'rica' && <RicaFormu d={d} grup={grup} onKapat={() => setSayfa(null)} />}
      {sayfa === 'liste' && <ListeFormu grup={grup} onKapat={() => setSayfa(null)} onOldu={(id) => { setSayfa(null); setEkran({ t: 'liste', id }); }} />}
      {sayfa === 'davet' && <DavetModal grup={grup} d={d} onKapat={() => setSayfa(null)} />}
      {ortakSayfalar}
    </div>
  );
}

// ———————————————— boş durum ————————————————

function BosEkran({ onKur, onKatil }: { onKur: () => void; onKatil: () => void }) {
  return (
    <div className="rt-cv-bos">
      <div className="resim" aria-hidden>🏠</div>
      <h3>Evdekilerle işleri paylaş</h3>
      <p className="rt-muted">Market listesi, evin işleri, birinden küçük bir rica. Herkes kendi telefonundan görür, anında güncellenir.</p>
      <button type="button" className="rt-cv-secenek" onClick={onKur}><span className="ik">🏠</span><span><b>Grup kur</b><small>Ailen ya da arkadaşların için. Bir ad ver, sonra davet kodunu paylaş. En fazla {GRUP_SINIR} kişi.</small></span></button>
      <button type="button" className="rt-cv-secenek" onClick={onKatil}><span className="ik">✉️</span><span><b>Davet kodum var</b><small>Biri seni davet ettiyse 6 harfli kodu gir.</small></span></button>
    </div>
  );
}

// ———————————————— grup başlığı ————————————————

function GrupBasligi({ d, grup, onSec, onKur, onKatil, onDavet, onAyar }: { d: CevremDurum; grup: Grup; onSec: (id: string) => void; onKur: () => void; onKatil: () => void; onDavet: () => void; onAyar: () => void }) {
  const [acik, setAcik] = useState(false);
  const uyeler = aktifUyeler(d, grup.id);
  return (
    <div className="rt-cv-bas">
      <div className="rt-cv-grup-kok">
        <button type="button" className="rt-cv-grup" onClick={() => setAcik(!acik)} aria-expanded={acik}>
          <span>{grupIkonu(grup)}</span><b>{grup.ad}</b><small>{uyeler.length} kişi</small><span className="ok" aria-hidden>▾</span>
        </button>
        {acik && (
          <div className="rt-kmenu rt-cv-grup-menu" role="menu">
            {d.gruplar.map((g) => (
              <button key={g.id} type="button" role="menuitem" className={g.id === grup.id ? 'on' : ''} onClick={() => { setAcik(false); onSec(g.id); }}>{grupIkonu(g)} {g.ad}</button>
            ))}
            <button type="button" role="menuitem" onClick={() => { setAcik(false); onAyar(); }}>⚙️ Grup ayarları</button>
            <button type="button" role="menuitem" onClick={() => { setAcik(false); onKur(); }}>＋ Yeni grup</button>
            <button type="button" role="menuitem" onClick={() => { setAcik(false); onKatil(); }}>✉️ Davet kodum var</button>
          </div>
        )}
      </div>
      <div className="rt-cv-uyeler">
        {uyeler.slice(0, 5).map((u) => <span key={u.uye_id} title={u.uye_id === d.uid ? 'Ben' : u.ad}><Avatar ad={u.ad} resim={u.avatar} boyut={28} /></span>)}
        {uyeler.length > 5 && <span className="rt-cv-fazla">+{uyeler.length - 5}</span>}
        {uyeler.length < GRUP_SINIR && <button type="button" className="rt-cv-davet" onClick={onDavet} aria-label="Davet et">＋</button>}
      </div>
    </div>
  );
}

// ———————————————— ricalar ————————————————

function GelenRicalar({ d, grup }: { d: CevremDurum; grup: Grup }) {
  const gelen = d.ricalar.filter((r) => r.grup_id === grup.id && r.istenen === d.uid && r.durum === 'bekliyor');
  const [hata, setHata] = useState<string | null>(null);
  if (!gelen.length) return null;
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Senden istenenler</h2>
      <div className="rt-cv-kutu">
        {gelen.map((r) => (
          <div key={r.id} className="rt-cv-sat rica">
            <span className="rt-cv-av"><Avatar ad={uyeAdi(d, r.isteyen)} boyut={26} /></span>
            <div className="ic"><b>{r.ad}</b><span>{uyeAdi(d, r.isteyen)} istiyor · {tarihEtiket(r.tarih)}{r.saat ? ` · ${r.saat}` : ''}</span>{r.aciklama && <span className="ac">{r.aciklama}</span>}</div>
            <div className="rt-cv-dugmeler">
              <button type="button" className="rt-btn" onClick={() => ricaDurum(r.id, 'ret').catch((e) => setHata(hataMetni(e)))}>Geri çevir</button>
              <button type="button" className="rt-btn primary" onClick={() => ricaDurum(r.id, 'kabul').catch((e) => setHata(hataMetni(e)))}>Kabul</button>
            </div>
          </div>
        ))}
      </div>
      {hata && <p className="rt-hata">{hata}</p>}
      <p className="rt-muted rt-cv-not">Kabul edince iş ajandana düşer.</p>
    </section>
  );
}

const RICA_DURUM: Record<string, string> = { bekliyor: 'Bekliyor', kabul: 'Kabul etti', ret: 'Geri çevirdi', yapildi: 'Yaptı ✓' };

function GonderilenRicalar({ d, grup }: { d: CevremDurum; grup: Grup }) {
  const sinir = tarihEkle(bugun(), -7);
  const benim = d.ricalar.filter((r) => r.grup_id === grup.id && r.isteyen === d.uid && (r.durum === 'bekliyor' || r.durum === 'kabul' || r.guncellendi.slice(0, 10) >= sinir));
  if (!benim.length) return null;
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">İstediklerim</h2>
      <div className="rt-cv-kutu">
        {benim.map((r) => (
          <div key={r.id} className="rt-cv-sat">
            <span className="rt-cv-av"><Avatar ad={uyeAdi(d, r.istenen)} boyut={26} /></span>
            <div className="ic"><b className={r.durum === 'yapildi' ? 'bitti' : ''}>{r.ad}</b><span>{uyeAdi(d, r.istenen)} · {tarihEtiket(r.tarih)}</span></div>
            <span className={`rt-cv-durum ${r.durum}`}>{RICA_DURUM[r.durum]}</span>
            {(r.durum === 'bekliyor' || r.durum === 'ret') && <button type="button" className="rt-cv-x" aria-label="Geri al" onClick={() => void ricaDurum(r.id, 'iptal').catch(() => {})}>×</button>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ———————————————— bugün evde ————————————————

function BugunEvde({ d, grup, onAc, onEkle }: { d: CevremDurum; grup: Grup; onAc: (i: OrtakIs) => void; onEkle: () => void }) {
  const t = bugun();
  const [hata, setHata] = useState<string | null>(null);
  const isler = d.isler.filter((i) => i.grup_id === grup.id);
  const bugunku = isler.filter((i) => isGunu(i, t));
  const yaklasan = isler.filter((i) => i.tarih > t && i.bitis === i.tarih).sort((a, b) => a.tarih.localeCompare(b.tarih)).slice(0, 5);
  const sirala = (a: OrtakIs, b: OrtakIs) => Number(!!isKaydi(d, a.id, t)) - Number(!!isKaydi(d, b.id, t)) || (a.saat ?? '99').localeCompare(b.saat ?? '99');
  const satir = (i: OrtakIs, tarih: string) => {
    const k = isKaydi(d, i.id, tarih);
    const tekrar = tekrarMetni(i);
    const alt = k ? `${uyeAdi(d, k.yapan)} yaptı` : i.ustlenen ? `${uyeAdi(d, i.ustlenen)} üstlendi` : 'Boşta';
    return (
      <div key={i.id + tarih} className="rt-cv-sat">
        <button type="button" className={`rt-chk${k ? ' on' : ''}`} aria-label="Yapıldı" onClick={() => isYapildi(i, tarih, !k).catch((e) => setHata(hataMetni(e)))}>{k ? '✓' : ''}</button>
        <button type="button" className="ic" onClick={() => onAc(i)}>
          <b className={k ? 'bitti' : ''}>{i.ad}</b>
          <span>{alt}{tekrar ? ` · ${tekrar}` : ''}{tarih !== t ? ` · ${tarihEtiket(tarih)}` : ''}</span>
        </button>
        {!k && !i.ustlenen ? <button type="button" className="rt-cv-al" onClick={() => isUstlen(i.id, d.uid).catch((e) => setHata(hataMetni(e)))}>Ben alırım</button>
          : i.saat ? <span className="rt-cv-saat">{i.saat}</span> : null}
      </div>
    );
  };
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Bugün {grup.tur === 'aile' ? 'evde' : 'grupta'}</h2>
      {bugunku.length ? <div className="rt-cv-kutu">{bugunku.sort(sirala).map((i) => satir(i, t))}</div>
        : <button type="button" className="rt-cv-bos-sat" onClick={onEkle}>Bugün için ortak iş yok · ＋ Ekle</button>}
      {yaklasan.length > 0 && (
        <>
          <h3 className="rt-cv-alt-h">Yaklaşan</h3>
          <div className="rt-cv-kutu">{yaklasan.map((i) => satir(i, i.tarih))}</div>
        </>
      )}
      {hata && <p className="rt-hata">{hata}</p>}
    </section>
  );
}

// ———————————————— listeler ————————————————

function Listeler({ d, grup, onAc, onYeni }: { d: CevremDurum; grup: Grup; onAc: (id: string) => void; onYeni: () => void }) {
  const ls = d.listeler.filter((l) => l.grup_id === grup.id);
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Ortak listeler</h2>
      <div className="rt-cv-listeler">
        {ls.map((l) => {
          const m = d.maddeler.filter((x) => x.liste_id === l.id);
          const acik = m.filter((x) => !x.isaretli).length;
          const yuzde = m.length ? Math.round(((m.length - acik) / m.length) * 100) : 0;
          return (
            <button key={l.id} type="button" className="rt-cv-lk" onClick={() => onAc(l.id)}>
              <span className="ust">{l.ikon ?? '📝'} {l.ad}</span>
              <span className="ilerleme"><i style={{ width: `${yuzde}%` }} /></span>
              <small>{m.length ? `${acik} kaldı · ${m.length - acik} tamam` : 'Boş'}</small>
            </button>
          );
        })}
        <button type="button" className="rt-cv-lk yeni" onClick={onYeni}>＋ Yeni liste</button>
      </div>
    </section>
  );
}

function ListeEkrani({ d, liste, onGeri }: { d: CevremDurum; liste: Liste; onGeri: () => void }) {
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [duzenle, setDuzenle] = useState(false);
  const [sil, setSil] = useState(false);
  const m = d.maddeler.filter((x) => x.liste_id === liste.id);
  const acik = m.filter((x) => !x.isaretli);
  const alinan = m.filter((x) => x.isaretli).sort((a, b) => (b.isaret_zaman ?? '').localeCompare(a.isaret_zaman ?? ''));
  const ekle = () => {
    const v = metin.trim();
    if (!v) return;
    setMetin('');
    maddeEkle(liste, v).catch((e) => setHata(hataMetni(e)));
  };
  const sat = (x: typeof m[number]) => (
    <div key={x.id} className="rt-cv-sat">
      <button type="button" className={`rt-chk${x.isaretli ? ' on' : ''}`} aria-label="İşaretle" onClick={() => maddeIsaretle(x, !x.isaretli).catch((e) => setHata(hataMetni(e)))}>{x.isaretli ? '✓' : ''}</button>
      <div className="ic"><b className={x.isaretli ? 'bitti' : ''}>{x.metin}</b><span>{x.isaretli ? `${uyeAdi(d, x.isaret_kim)} aldı` : `${uyeAdi(d, x.ekleyen)} ekledi`}</span></div>
      <button type="button" className="rt-cv-x" aria-label="Sil" onClick={() => maddeSil(x).catch((e) => setHata(hataMetni(e)))}>×</button>
    </div>
  );
  return (
    <div className="rt-cv-liste">
      <div className="rt-geri-bar">
        <button type="button" className="rt-geri-dugme" onClick={onGeri}>‹ Geri</button>
        <span className="rt-hw-tam-ad">{liste.ikon ?? '📝'} {liste.ad}</span>
        <button type="button" className="rt-linkbtn rt-cv-sag" onClick={() => setDuzenle(true)}>Düzenle</button>
      </div>
      <div className="rt-cv-giris">
        <input id="cv-madde" className="rt-inp" placeholder="Ekle: ör. 2 kg portakal" value={metin} onChange={(e) => setMetin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ekle(); }} />
        <button type="button" className="rt-btn primary" disabled={!metin.trim()} onClick={ekle}>Ekle</button>
      </div>
      {hata && <p className="rt-hata">{hata}</p>}
      {acik.length > 0 && <><h3 className="rt-cv-alt-h">Kalan · {acik.length}</h3><div className="rt-cv-kutu">{acik.map(sat)}</div></>}
      {!m.length && <p className="rt-muted">Liste boş. Yukarıdan ekle; evdekiler anında görür.</p>}
      {alinan.length > 0 && (
        <>
          <div className="rt-cv-alt-h rt-cv-satir-bas"><span>Tamam · {alinan.length}</span><button type="button" className="rt-linkbtn" onClick={() => isaretlileriTemizle(liste.id).catch((e) => setHata(hataMetni(e)))}>Temizle</button></div>
          <div className="rt-cv-kutu">{alinan.map(sat)}</div>
        </>
      )}
      {duzenle && <ListeFormu grup={{ id: liste.grup_id } as Grup} liste={liste} onKapat={() => setDuzenle(false)} onOldu={() => setDuzenle(false)} onSil={() => { setDuzenle(false); setSil(true); }} />}
      {sil && <OnayKutusu metin={`"${liste.ad}" listesi herkesten silinsin mi?`} evet="Sil" onVazgec={() => setSil(false)} onEvet={() => { void listeSil(liste.id).catch(() => {}); onGeri(); }} />}
    </div>
  );
}

// ———————————————— son olanlar ————————————————

function SonOlanlar({ d, grup }: { d: CevremDurum; grup: Grup }) {
  const olaylar = useMemo(() => {
    const o: { z: string; kim: string | null; metin: React.ReactNode }[] = [];
    const listeAd = new Map(d.listeler.map((l) => [l.id, l.ad]));
    for (const m of d.maddeler) if (m.grup_id === grup.id) {
      o.push({ z: m.olusturuldu, kim: m.ekleyen, metin: <>{listeAd.get(m.liste_id)} listesine &quot;{m.metin}&quot; ekledi</> });
      if (m.isaretli && m.isaret_zaman) o.push({ z: m.isaret_zaman, kim: m.isaret_kim, metin: <>&quot;{m.metin}&quot; aldı</> });
    }
    const isAd = new Map(d.isler.map((i) => [i.id, i.ad]));
    for (const i of d.isler) if (i.grup_id === grup.id) {
      o.push({ z: i.olusturuldu, kim: i.olusturan, metin: <>&quot;{i.ad}&quot; işini ekledi</> });
      if (i.ustlenen && i.ustlenme_zaman) o.push({ z: i.ustlenme_zaman, kim: i.ustlenen, metin: <>&quot;{i.ad}&quot; işini üstlendi</> });
    }
    for (const k of d.kayitlar) if (k.grup_id === grup.id && isAd.has(k.is_id)) o.push({ z: k.zaman, kim: k.yapan, metin: <>&quot;{isAd.get(k.is_id)}&quot; yaptı</> });
    for (const r of d.ricalar) if (r.grup_id === grup.id && r.durum !== 'bekliyor') o.push({ z: r.guncellendi, kim: r.istenen, metin: <>&quot;{r.ad}&quot; ricasını {r.durum === 'ret' ? 'geri çevirdi' : r.durum === 'yapildi' ? 'yaptı' : 'kabul etti'}</> });
    return o.sort((a, b) => b.z.localeCompare(a.z)).slice(0, 6);
  }, [d, grup.id]);
  if (!olaylar.length) return null;
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Son olanlar</h2>
      <div className="rt-cv-akis">
        {olaylar.map((x, n) => (
          <div key={n} className="rt-cv-ak">
            <Avatar ad={uyeAdi(d, x.kim) || '?'} boyut={22} />
            <p><b>{uyeAdi(d, x.kim)}</b> {x.metin}</p>
            <time>{sureMetni(x.z)}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

// ———————————————— ekle sayfası + formlar ————————————————

function EkleSayfasi({ grup, onKapat, onSec }: { grup: Grup; onKapat: () => void; onSec: (s: 'is' | 'rica' | 'liste') => void }) {
  return (
    <Modal baslik={`${grupIkonu(grup)} ${grup.ad} · ekle`} onKapat={onKapat}>
      <div className="rt-cv-secenekler">
        <button type="button" className="rt-cv-secenek" onClick={() => onSec('is')}><span className="ik">🧹</span><span><b>Ortak iş</b><small>Herkes görür; isteyen &quot;Ben alırım&quot; der.</small></span></button>
        <button type="button" className="rt-cv-secenek" onClick={() => onSec('rica')}><span className="ik">🙋</span><span><b>Birinden iste</b><small>Tek bir kişiye iş gönder; kabul ederse onun ajandasına düşer.</small></span></button>
        <button type="button" className="rt-cv-secenek" onClick={() => onSec('liste')}><span className="ik">📝</span><span><b>Liste</b><small>Market, yapılacaklar, hazırlık listesi.</small></span></button>
      </div>
    </Modal>
  );
}

type Zaman = 'bugun' | 'yarin' | 'tarih' | 'hergun' | 'gunler';

function IsFormu({ d, grup, is, onKapat }: { d: CevremDurum; grup: Grup; is?: OrtakIs; onKapat: () => void }) {
  const t = bugun();
  const [ad, setAd] = useState(is?.ad ?? '');
  const [aciklama, setAciklama] = useState(is?.aciklama ?? '');
  const ilkZaman: Zaman = !is ? 'bugun' : is.bitis === is.tarih ? (is.tarih === t ? 'bugun' : is.tarih === tarihEkle(t, 1) ? 'yarin' : 'tarih') : is.gunler && is.gunler.length && is.gunler.length < 7 ? 'gunler' : 'hergun';
  const [zaman, setZaman] = useState<Zaman>(ilkZaman);
  const [tarih, setTarih] = useState(is?.tarih ?? t);
  const [gunler, setGunler] = useState<number[]>(is?.gunler ?? []);
  const [saat, setSaat] = useState(is?.saat ?? '');
  const [kim, setKim] = useState<string | null>(is ? is.ustlenen : null);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sil, setSil] = useState(false);
  const uyeler = aktifUyeler(d, grup.id);
  const gecerli = ad.trim() && (zaman !== 'gunler' || gunler.length > 0);

  async function kaydet() {
    setBekle(true); setHata(null);
    const bas = zaman === 'bugun' ? t : zaman === 'yarin' ? tarihEkle(t, 1) : zaman === 'tarih' ? tarih : (is && is.bitis !== is.tarih ? is.tarih : t);
    const g: IsGirdi = {
      ad: ad.trim(), aciklama: aciklama.trim() || null, tarih: bas,
      bitis: zaman === 'hergun' || zaman === 'gunler' ? null : bas,
      gunler: zaman === 'gunler' ? gunler : null, saat: saat || null, ustlenen: kim,
    };
    try {
      if (is) { await isGuncelle(is.id, g); if (kim !== is.ustlenen) await isUstlen(is.id, kim); }
      else await isEkle(grup.id, g);
      onKapat();
    } catch (e) { setHata(hataMetni(e)); setBekle(false); }
  }

  return (
    <Modal baslik={is ? 'Ortak iş' : 'Yeni ortak iş'} onKapat={onKapat}>
      <label className="rt-alan">Ne yapılacak<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Bulaşık makinesini boşalt" autoFocus={!is} /></label>
      <label className="rt-alan">Not (isteğe bağlı)<input className="rt-inp" value={aciklama} onChange={(e) => setAciklama(e.target.value)} /></label>
      <div className="rt-alan">Ne zaman
        <div className="rt-cv-cipler">
          {([['bugun', 'Bugün'], ['yarin', 'Yarın'], ['tarih', 'Tarih seç'], ['hergun', 'Her gün'], ['gunler', 'Belirli günler']] as [Zaman, string][]).map(([k, e]) => (
            <button key={k} type="button" className={`rt-chip${zaman === k ? ' on' : ''}`} onClick={() => setZaman(k)}>{e}</button>
          ))}
        </div>
        {zaman === 'tarih' && <input className="rt-inp" type="date" value={tarih} min={t} onChange={(e) => setTarih(e.target.value)} />}
        {zaman === 'gunler' && (
          <div className="rt-cv-cipler">
            {GUN_KISA.map(([g, a]) => <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{a}</button>)}
          </div>
        )}
      </div>
      <label className="rt-alan">Saat (isteğe bağlı)<input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      <div className="rt-alan">Kim yapacak
        <div className="rt-cv-cipler">
          <button type="button" className={`rt-chip${kim === null ? ' on' : ''}`} onClick={() => setKim(null)}>Boşta bırak</button>
          {uyeler.map((u) => <button key={u.uye_id} type="button" className={`rt-chip${kim === u.uye_id ? ' on' : ''}`} onClick={() => setKim(u.uye_id)}>{u.uye_id === d.uid ? 'Ben' : u.ad}</button>)}
        </div>
        <small className="rt-muted">Üstlenenin ajandasına düşer. Boşta bırakırsan isteyen &quot;Ben alırım&quot; der.</small>
      </div>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        {is && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!gecerli || bekle} onClick={kaydet}>{is ? 'Kaydet' : 'Ekle'}</button>
      </div>
      {sil && is && <OnayKutusu metin="Bu ortak iş herkesten silinsin mi?" evet="Sil" onVazgec={() => setSil(false)} onEvet={() => { void isSil(is.id).catch(() => {}); onKapat(); }} />}
    </Modal>
  );
}

function RicaFormu({ d, grup, onKapat }: { d: CevremDurum; grup: Grup; onKapat: () => void }) {
  const t = bugun();
  const digerleri = aktifUyeler(d, grup.id).filter((u) => u.uye_id !== d.uid);
  const [kime, setKime] = useState<string | null>(digerleri[0]?.uye_id ?? null);
  const [ad, setAd] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [zaman, setZaman] = useState<'bugun' | 'yarin' | 'tarih'>('bugun');
  const [tarih, setTarih] = useState(t);
  const [saat, setSaat] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  if (!digerleri.length) return (
    <Modal baslik="Birinden iste" onKapat={onKapat}>
      <p className="rt-metin">Grupta henüz senden başka kimse yok. Önce birini davet et.</p>
      <div className="rt-satir"><button type="button" className="rt-btn" onClick={onKapat}>Tamam</button></div>
    </Modal>
  );
  const kimAd = digerleri.find((u) => u.uye_id === kime)?.ad ?? '';
  return (
    <Modal baslik="Birinden iste" onKapat={onKapat}>
      <div className="rt-alan">Kimden
        <div className="rt-cv-cipler">{digerleri.map((u) => <button key={u.uye_id} type="button" className={`rt-chip${kime === u.uye_id ? ' on' : ''}`} onClick={() => setKime(u.uye_id)}>{u.ad}</button>)}</div>
      </div>
      <label className="rt-alan">Ne<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Hafta sonu arabayı yıkat" autoFocus /></label>
      <label className="rt-alan">Not (isteğe bağlı)<input className="rt-inp" value={aciklama} onChange={(e) => setAciklama(e.target.value)} /></label>
      <div className="rt-alan">Ne zaman
        <div className="rt-cv-cipler">
          {([['bugun', 'Bugün'], ['yarin', 'Yarın'], ['tarih', 'Tarih seç']] as const).map(([k, e]) => <button key={k} type="button" className={`rt-chip${zaman === k ? ' on' : ''}`} onClick={() => setZaman(k)}>{e}</button>)}
        </div>
        {zaman === 'tarih' && <input className="rt-inp" type="date" value={tarih} min={t} onChange={(e) => setTarih(e.target.value)} />}
      </div>
      <label className="rt-alan">Saat (isteğe bağlı)<input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      <p className="rt-uyari">{kimAd} isteği görür; kabul ederse iş onun ajandasına düşer. Geri çevirirse burada görürsün.</p>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!kime || !ad.trim() || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          try {
            await ricaGonder(grup.id, { istenen: kime!, ad: ad.trim(), aciklama: aciklama.trim() || null, tarih: zaman === 'bugun' ? t : zaman === 'yarin' ? tarihEkle(t, 1) : tarih, saat: saat || null });
            onKapat();
          } catch (e) { setHata(hataMetni(e)); setBekle(false); }
        }}>Gönder</button>
      </div>
    </Modal>
  );
}

function ListeFormu({ grup, liste, onKapat, onOldu, onSil }: { grup: Grup; liste?: Liste; onKapat: () => void; onOldu: (id: string) => void; onSil?: () => void }) {
  const [ad, setAd] = useState(liste?.ad ?? '');
  const [ikon, setIkon] = useState(liste?.ikon ?? '🛒');
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik={liste ? 'Listeyi düzenle' : 'Yeni liste'} onKapat={onKapat}>
      <label className="rt-alan">Liste adı<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Market" autoFocus /></label>
      <div className="rt-alan">Simge<div className="rt-cv-cipler">{LISTE_IKON.map((i) => <button key={i} type="button" className={`rt-chip${ikon === i ? ' on' : ''}`} onClick={() => setIkon(i)}>{i}</button>)}</div></div>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        {liste && onSil && <button type="button" className="rt-btn tehlike" onClick={onSil}>Sil</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => {
          try {
            if (liste) { await listeGuncelle(liste.id, { ad: ad.trim(), ikon }); onOldu(liste.id); }
            else onOldu(await listeEkle(grup.id, ad, ikon));
          } catch (e) { setHata(hataMetni(e)); }
        }}>{liste ? 'Kaydet' : 'Oluştur'}</button>
      </div>
    </Modal>
  );
}

// ———————————————— grup kur / katıl / davet / ayarlar ————————————————

function GrupKurModal({ onKapat, onKuruldu }: { onKapat: () => void; onKuruldu: (id: string) => void }) {
  const [tur, setTur] = useState<GrupTur>('aile');
  const [ad, setAd] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Grup kur" onKapat={onKapat}>
      <div className="rt-cv-cipler">
        {(Object.keys(GRUP_TUR) as GrupTur[]).map((k) => <button key={k} type="button" className={`rt-chip${tur === k ? ' on' : ''}`} onClick={() => setTur(k)}>{GRUP_TUR[k].ikon} {GRUP_TUR[k].ad}</button>)}
      </div>
      <label className="rt-alan">Grubun adı<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder={GRUP_TUR[tur].ornek} autoFocus /></label>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim() || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          try { onKuruldu(await grupKur(ad, tur)); } catch (e) { setHata(hataMetni(e)); setBekle(false); }
        }}>Kur</button>
      </div>
    </Modal>
  );
}

function KatilModal({ kod0, onKapat, onKatildi }: { kod0: string; onKapat: () => void; onKatildi: (id: string) => void }) {
  const [kod, setKod] = useState(kod0);
  const [bilgi, setBilgi] = useState<Awaited<ReturnType<typeof davetBak>> | 'yok' | null>(null);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const temiz = kod.replace(/\s/g, '').toUpperCase();
  const danismanlik = temiz.length > 8; // koç davet kodu (14 harf) — danışmanlık penceresi açılır
  useEffect(() => {
    setBilgi(null);
    if (temiz.length !== 6) return;
    let iptal = false;
    davetBak(temiz).then((b) => { if (!iptal) setBilgi(b ?? 'yok'); }).catch((e) => { if (!iptal) setHata(hataMetni(e)); });
    return () => { iptal = true; };
  }, [temiz]);
  return (
    <Modal baslik="Gruba katıl" onKapat={onKapat}>
      <label className="rt-alan">Davet kodu<input className="rt-inp rt-cv-kod-inp" value={kod} maxLength={20} onChange={(e) => setKod(e.target.value)} placeholder="ör. K7M2PX" autoFocus /></label>
      {danismanlik && <p className="rt-muted">Bu bir danışmanlık daveti kodu; koçunun davetini açar.</p>}
      {bilgi === 'yok' && <p className="rt-hata">Bu kod geçersiz ya da süresi dolmuş.</p>}
      {bilgi && bilgi !== 'yok' && <p className="rt-metin">{GRUP_TUR[bilgi.tur]?.ikon} <b>{bilgi.ad}</b> · {bilgi.uye_sayisi} kişi</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        {danismanlik
          ? <button type="button" className="rt-btn primary" onClick={() => { danismanlikDavetiAc(temiz); onKapat(); }}>Daveti aç</button>
          : <button type="button" className="rt-btn primary" disabled={!bilgi || bilgi === 'yok' || bekle} onClick={async () => {
              setBekle(true); setHata(null);
              try { onKatildi(await grupKatil(temiz)); } catch (e) { setHata(hataMetni(e)); setBekle(false); }
            }}>Katıl</button>}
      </div>
    </Modal>
  );
}

function DavetModal({ grup, d, onKapat }: { grup: Grup; d: CevremDurum; onKapat: () => void }) {
  const [kod, setKod] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kopya, setKopya] = useState<string | null>(null);
  useEffect(() => { davetKodu(grup.id).then(setKod).catch((e) => setHata(hataMetni(e))); }, [grup.id]);
  const baglanti = kod ? `${location.origin}/?katil=${kod}` : '';
  const ben = d.uyeler.find((u) => u.uye_id === d.uid)?.ad ?? '';
  const mesaj = kod ? `${ben} seni Ritos'ta "${grup.ad}" grubuna davet ediyor. Katılmak için: ${baglanti} (kod: ${kod})` : '';
  const kopyala = async (metin: string, ne: string) => { try { await navigator.clipboard.writeText(metin); setKopya(ne); } catch { setKopya(null); } };
  return (
    <Modal baslik={`${grupIkonu(grup)} ${grup.ad} · davet`} onKapat={onKapat}>
      <p className="rt-metin">Bu kodu evdekilerle paylaş. Ritos'ta hesap açıp <b>Çevrem › Davet kodum var</b> ile katılırlar. Kod 7 gün geçerli.</p>
      {hata && <p className="rt-hata">{hata}</p>}
      {kod ? <div className="rt-cv-kod" aria-label="Davet kodu">{kod}</div> : !hata && <p className="rt-muted">Kod hazırlanıyor…</p>}
      {kod && (
        <div className="rt-satir">
          <button type="button" className="rt-btn" onClick={() => kopyala(kod, 'kod')}>{kopya === 'kod' ? 'Kopyalandı' : 'Kodu kopyala'}</button>
          <button type="button" className="rt-btn primary" onClick={() => kopyala(mesaj, 'mesaj')}>{kopya === 'mesaj' ? 'Kopyalandı' : 'Davet mesajını kopyala'}</button>
        </div>
      )}
      <div className="rt-satir"><button type="button" className="rt-btn" onClick={onKapat}>Kapat</button></div>
    </Modal>
  );
}

function GrupAyarlari({ d, grup, onGeri, onDavet }: { d: CevremDurum; grup: Grup; onGeri: () => void; onDavet: () => void }) {
  const yonetici = benYoneticiyim(d, grup.id);
  const [ad, setAd] = useState(grup.ad);
  const [hata, setHata] = useState<string | null>(null);
  const [onay, setOnay] = useState<null | { kisi: string | null; ad: string }>(null);
  const uyeler = aktifUyeler(d, grup.id);
  return (
    <div className="rt-cv-ayar">
      <div className="rt-geri-bar"><button type="button" className="rt-geri-dugme" onClick={onGeri}>‹ Geri</button><span className="rt-hw-tam-ad">{grupIkonu(grup)} Grup ayarları</span></div>
      <section className="rt-cv-bolum">
        <h2 className="rt-cv-h">Ad</h2>
        <div className="rt-cv-giris">
          <input id="cv-grup-ad" className="rt-inp" value={ad} disabled={!yonetici} onChange={(e) => setAd(e.target.value)} />
          {yonetici && <button type="button" className="rt-btn primary" disabled={!ad.trim() || ad.trim() === grup.ad} onClick={() => grupGuncelle(grup.id, { ad: ad.trim() }).catch((e) => setHata(hataMetni(e)))}>Kaydet</button>}
        </div>
        {!yonetici && <p className="rt-muted">Adı yalnız yönetici değiştirebilir.</p>}
      </section>
      <section className="rt-cv-bolum">
        <h2 className="rt-cv-h">Üyeler · {uyeler.length}/{GRUP_SINIR}</h2>
        <div className="rt-cv-kutu">
          {uyeler.map((u) => (
            <div key={u.uye_id} className="rt-cv-sat">
              <Avatar ad={u.ad} resim={u.avatar} boyut={28} />
              <div className="ic"><b>{u.uye_id === d.uid ? `${u.ad} (sen)` : u.ad}</b><span>{u.rol === 'yonetici' ? 'Yönetici' : 'Üye'}</span></div>
              {yonetici && u.uye_id !== d.uid && <button type="button" className="rt-linkbtn" onClick={() => setOnay({ kisi: u.uye_id, ad: u.ad })}>Çıkar</button>}
            </div>
          ))}
        </div>
        {uyeler.length < GRUP_SINIR && <div className="rt-satir"><button type="button" className="rt-btn" onClick={onDavet}>＋ Davet et</button></div>}
      </section>
      <section className="rt-cv-bolum">
        <div className="rt-satir"><button type="button" className="rt-btn tehlike" onClick={() => setOnay({ kisi: null, ad: '' })}>Gruptan ayrıl</button></div>
        <p className="rt-muted">Ayrılırsan grubun listelerini ve işlerini artık görmezsin. Üstlendiğin işler boşa düşer. Son kişi ayrılınca grup silinir.</p>
      </section>
      {hata && <p className="rt-hata">{hata}</p>}
      {onay && (
        <OnayKutusu metin={onay.kisi ? `${onay.ad} gruptan çıkarılsın mı?` : `"${grup.ad}" grubundan ayrılmak istiyor musun?`} evet={onay.kisi ? 'Çıkar' : 'Ayrıl'}
          onVazgec={() => setOnay(null)}
          onEvet={() => { const k = onay.kisi; setOnay(null); grupAyril(grup.id, k).then(() => { if (!k) onGeri(); }).catch((e) => setHata(hataMetni(e))); }} />
      )}
    </div>
  );
}

// ———————————————— Home widget'ı: ortak listeler (tam ekran) ————————————————

export function CevremListeleriWidget() {
  const d = useCevrem();
  const [acik, setAcik] = useState<string | null>(null);
  const [yeni, setYeni] = useState<Grup | null>(null);
  const liste = acik ? d.listeler.find((l) => l.id === acik) : null;
  if (liste) return <ListeEkrani d={d} liste={liste} onGeri={() => setAcik(null)} />;
  return (
    <div className="rt-cv">
      {d.gruplar.map((g) => (
        <div key={g.id}>
          {d.gruplar.length > 1 && <h3 className="rt-cv-alt-h">{grupIkonu(g)} {g.ad}</h3>}
          <Listeler d={d} grup={g} onAc={setAcik} onYeni={() => setYeni(g)} />
        </div>
      ))}
      {yeni && <ListeFormu grup={yeni} onKapat={() => setYeni(null)} onOldu={(id) => { setYeni(null); setAcik(id); }} />}
    </div>
  );
}

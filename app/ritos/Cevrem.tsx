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
  bugunYaptiMi, bulusmaEkle, bulusmaGuncelle, bulusmaYanitla, haftaBasi, haftaSayisi, katiliyorMu, rutinEkle, rutinGuncelle, rutinKatilimcilari,
  rutinSil, rutinYapildi, rutineKatil, seri, yanitSayilari, yanitim,
  type BirlikteRutin, type Bulusma, type CevremDurum, type Grup, type GrupTur, type IsGirdi, type Liste, type OrtakIs, type Rica, type Yanit,
} from '@/lib/cevrem';
import { GUN_KISA, bugun, tarihEkle, tarihEtiket, tarihParse } from '@/lib/paket';
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
type Sayfa = null | 'ekle' | 'is' | 'rica' | 'liste' | 'davet' | 'katil' | 'kur' | 'rutin' | 'bulusma' | { is: OrtakIs } | { rutin: BirlikteRutin } | { bulusma: Bulusma };

export default function Cevrem() {
  const d = useCevrem();
  // 8 ekim: önce "Gruplarım" listesi; gruba dokununca grubun sayfası (WhatsApp gibi).
  const [seciliId, setSeciliId] = useState<string | null>(null);
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

  const grup = d.gruplar.find((g) => g.id === seciliId) ?? null;
  const sec = (id: string) => { setSeciliId(id); setEkran({ t: 'ana' }); try { localStorage.setItem(SECILI, id); } catch { /* yoksay */ } };

  if (!d.hazir) return <div className="rt-cv"><p className="rt-muted">Yükleniyor…</p></div>;
  if (!d.uid) return <div className="rt-cv"><HesapGerekli ikon="👥" baslik="Ailen ve arkadaşlarınla" metin="Ortak listeler, evin işleri, buluşmalar, birlikte rutinler. Seni gruplara tanıtmak için e-postan yeter." /></div>;
  const ortakSayfalar = (
    <>
      {sayfa === 'kur' && <GrupKurModal onKapat={() => setSayfa(null)} onKuruldu={(id) => { sec(id); setSayfa('davet'); }} />}
      {sayfa === 'katil' && <KatilModal kod0={katilKod} onKapat={() => setSayfa(null)} onKatildi={(id) => { sec(id); setSayfa(null); }} />}
    </>
  );
  if (!d.gruplar.length) return (
    <div className="rt-cv">
      {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
      <BosEkran onKur={() => setSayfa('kur')} onKatil={() => setSayfa('katil')} />
      {ortakSayfalar}
    </div>
  );
  if (!grup) return (
    <div className="rt-cv">
      {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
      <GruplarListesi d={d} onSec={sec} onKur={() => setSayfa('kur')} onKatil={() => setSayfa('katil')} />
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
            <GrupUst d={d} grup={grup} onGeri={() => setSeciliId(null)} onDavet={() => setSayfa('davet')} onAyar={() => setEkran({ t: 'ayar' })} />
            <GelenRicalar d={d} grup={grup} />
            {grup.tur === 'arkadas' ? (
              <>
                <Bulusmalar d={d} grup={grup} bosGoster onAc={(b) => setSayfa({ bulusma: b })} onYeni={() => setSayfa('bulusma')} />
                <BirlikteRutinler d={d} grup={grup} bosGoster onAc={(r) => setSayfa({ rutin: r })} onYeni={() => setSayfa('rutin')} />
                {d.isler.some((i) => i.grup_id === grup.id) && <BugunEvde d={d} grup={grup} onAc={(i) => setSayfa({ is: i })} onEkle={() => setSayfa('is')} />}
                <Listeler d={d} grup={grup} onAc={(id) => setEkran({ t: 'liste', id })} onYeni={() => setSayfa('liste')} />
              </>
            ) : (
              <>
                <BugunEvde d={d} grup={grup} onAc={(i) => setSayfa({ is: i })} onEkle={() => setSayfa('is')} />
                <Bulusmalar d={d} grup={grup} onAc={(b) => setSayfa({ bulusma: b })} onYeni={() => setSayfa('bulusma')} />
                <BirlikteRutinler d={d} grup={grup} onAc={(r) => setSayfa({ rutin: r })} onYeni={() => setSayfa('rutin')} />
                <Listeler d={d} grup={grup} onAc={(id) => setEkran({ t: 'liste', id })} onYeni={() => setSayfa('liste')} />
              </>
            )}
            <GonderilenRicalar d={d} grup={grup} />
            <button type="button" className="rt-cv-fab" aria-label="Ekle" onClick={() => setSayfa('ekle')}>＋</button>
          </>
        )}
      {sayfa === 'ekle' && <EkleSayfasi grup={grup} onKapat={() => setSayfa(null)} onSec={(s) => setSayfa(s)} />}
      {sayfa === 'is' && <IsFormu d={d} grup={grup} onKapat={() => setSayfa(null)} />}
      {sayfa && typeof sayfa === 'object' && 'is' in sayfa && <IsFormu d={d} grup={grup} is={sayfa.is} onKapat={() => setSayfa(null)} />}
      {sayfa === 'rutin' && <RutinFormu grup={grup} onKapat={() => setSayfa(null)} />}
      {sayfa && typeof sayfa === 'object' && 'rutin' in sayfa && <RutinDetay d={d} grup={grup} rutin={sayfa.rutin} onKapat={() => setSayfa(null)} />}
      {sayfa === 'bulusma' && <BulusmaFormu grup={grup} onKapat={() => setSayfa(null)} />}
      {sayfa && typeof sayfa === 'object' && 'bulusma' in sayfa && <BulusmaDetay d={d} grup={grup} bulusma={sayfa.bulusma} onKapat={() => setSayfa(null)} />}
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

// ———————————————— Gruplarım (liste) + grup sayfasının başı (8 ekim) ————————————————

const KISA_GUN = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function grupOzeti(d: CevremDurum, g: Grup) {
  const t = bugun();
  const ricalar = d.ricalar.filter((r) => r.grup_id === g.id && r.istenen === d.uid && r.durum === 'bekliyor').length;
  const bulusmalar = d.bulusmalar.filter((b) => b.grup_id === g.id && !b.iptal && b.tarih >= t).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat ?? '').localeCompare(b.saat ?? ''));
  const yanitsiz = bulusmalar.filter((b) => !yanitim(d, b.id)).length;
  const listeler = d.listeler.filter((l) => l.grup_id === g.id && !l.silindi);
  const rutinler = d.rutinler.filter((r) => r.grup_id === g.id && !r.silindi);
  const isler = d.isler.filter((i) => i.grup_id === g.id && !i.silindi && isGunu(i, t) && !isKaydi(d, i.id, t)).length;
  return { bekleyen: ricalar + yanitsiz, bulusmalar, listeler, rutinler, isler };
}

function GruplarListesi({ d, onSec, onKur, onKatil }: { d: CevremDurum; onSec: (id: string) => void; onKur: () => void; onKatil: () => void }) {
  return (
    <>
      <h2 className="rt-cv-h rt-cv-gruplar-h">Gruplarım</h2>
      <div className="rt-cv-gruplar">
        {d.gruplar.map((g) => {
          const o = grupOzeti(d, g);
          const uyeler = aktifUyeler(d, g.id);
          const b = o.bulusmalar[0];
          const parcalar: { k: string; metin: string }[] = [
            ...o.listeler.slice(0, 3).map((l) => ({ k: `l${l.id}`, metin: `${l.ikon ?? '📝'} ${l.ad} · ${d.maddeler.filter((m) => m.liste_id === l.id && !m.isaretli && !m.silindi).length}` })),
            ...(o.listeler.length > 3 ? [{ k: 'lf', metin: `+${o.listeler.length - 3} liste` }] : []),
            ...(b ? [{ k: 'b', metin: `📅 ${b.tarih === bugun() ? 'Bugün' : b.tarih === tarihEkle(bugun(), 1) ? 'Yarın' : KISA_GUN[tarihParse(b.tarih).getDay()]}${b.saat ? ` ${b.saat}` : ''} · ${b.ad}` }] : []),
            ...o.rutinler.slice(0, 2).map((r) => ({ k: `r${r.id}`, metin: `${r.ikon ?? '🤝'} ${r.ad}` })),
            ...(o.isler ? [{ k: 'i', metin: `🧹 Bugün ${o.isler} iş` }] : []),
          ];
          return (
            <button key={g.id} type="button" className="rt-cv-gk" onClick={() => onSec(g.id)}>
              <span className="ust">
                <span className="ik" aria-hidden>{grupIkonu(g)}</span>
                <span className="ad"><b>{g.ad}</b><small>{GRUP_TUR[g.tur]?.ad ?? ''} · {uyeler.length} kişi</small></span>
                {o.bekleyen > 0 && <i className="rozet" aria-label={`${o.bekleyen} şey seni bekliyor`}>{o.bekleyen}</i>}
                <span className="chev" aria-hidden>›</span>
              </span>
              <span className="ozet">
                {parcalar.length ? parcalar.map((x) => <span key={x.k}>{x.metin}</span>) : <span className="bos">Henüz bir şey yok — gir ve ekle</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="rt-cv-gruplar-alt">
        <button type="button" className="rt-btn" onClick={onKur}>＋ Grup kur</button>
        <button type="button" className="rt-btn" onClick={onKatil}>✉️ Davet kodum var</button>
      </div>
    </>
  );
}

function GrupUst({ d, grup, onGeri, onDavet, onAyar }: { d: CevremDurum; grup: Grup; onGeri: () => void; onDavet: () => void; onAyar: () => void }) {
  const uyeler = aktifUyeler(d, grup.id);
  return (
    <div className="rt-cv-ust">
      <div className="rt-geri-bar">
        <button type="button" className="rt-geri-dugme" onClick={onGeri}>‹ Gruplarım</button>
        <button type="button" className="rt-cv-ayar-d" aria-label="Grup ayarları" onClick={onAyar}>⚙️</button>
      </div>
      <div className="rt-cv-ust-ic">
        <span className="ik" aria-hidden>{grupIkonu(grup)}</span>
        <b>{grup.ad}</b>
        <div className="rt-cv-uyeler">
          {uyeler.slice(0, 5).map((u) => <span key={u.uye_id} title={u.uye_id === d.uid ? 'Ben' : u.ad}><Avatar ad={u.ad} resim={u.avatar} boyut={26} /></span>)}
          {uyeler.length > 5 && <span className="rt-cv-fazla">+{uyeler.length - 5}</span>}
          {uyeler.length < GRUP_SINIR && <button type="button" className="rt-cv-davet" onClick={onDavet} aria-label="Davet et">＋</button>}
        </div>
      </div>
    </div>
  );
}

// ———————————————— grup başlığı (eski, kullanılmıyor) ————————————————

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
    const rutinAd = new Map(d.rutinler.map((r) => [r.id, r.ad]));
    for (const r of d.rutinler) if (r.grup_id === grup.id) o.push({ z: r.olusturuldu, kim: r.olusturan, metin: <>&quot;{r.ad}&quot; birlikte rutinini başlattı</> });
    for (const k of d.katilimlar) if (k.grup_id === grup.id && k.durum === 'aktif' && rutinAd.has(k.rutin_id) && !d.rutinler.some((r) => r.id === k.rutin_id && r.olusturan === k.uye_id)) o.push({ z: k.katildi, kim: k.uye_id, metin: <>&quot;{rutinAd.get(k.rutin_id)}&quot; rutinine katıldı</> });
    for (const k of d.bkayitlar) if (k.grup_id === grup.id && rutinAd.has(k.rutin_id)) o.push({ z: k.zaman, kim: k.uye_id, metin: <>&quot;{rutinAd.get(k.rutin_id)}&quot; yaptı</> });
    const bAd = new Map(d.bulusmalar.map((b) => [b.id, b.ad]));
    for (const b of d.bulusmalar) if (b.grup_id === grup.id) o.push({ z: b.olusturuldu, kim: b.olusturan, metin: <>&quot;{b.ad}&quot; buluşmasını önerdi</> });
    for (const y of d.yanitlar) if (y.grup_id === grup.id && bAd.has(y.bulusma_id) && !d.bulusmalar.some((b) => b.id === y.bulusma_id && b.olusturan === y.uye_id)) o.push({ z: y.zaman, kim: y.uye_id, metin: <>&quot;{bAd.get(y.bulusma_id)}&quot; için {y.yanit === 'geliyorum' ? 'geliyorum' : y.yanit === 'belki' ? 'belki' : 'gelemem'} dedi</> });
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

// ———————————————— birlikte rutin ————————————————

const RUTIN_IKON = ['🚶', '🏃', '🧘', '🚴', '🏊', '📖', '💧', '🥗', '😴', '✍️'];
const HAFTA_GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function HaftaNoktalari({ d, r, kim }: { d: CevremDurum; r: BirlikteRutin; kim: string }) {
  const hb = haftaBasi(bugun());
  const t = bugun();
  return (
    <span className="rt-cv-hafta" aria-label="Bu hafta">
      {HAFTA_GUN.map((g, n) => {
        const tarih = tarihEkle(hb, n);
        const yapti = d.bkayitlar.some((k) => k.rutin_id === r.id && k.uye_id === kim && k.tarih === tarih);
        return <i key={g} className={`${yapti ? 'on' : ''}${tarih === t ? ' bugun' : ''}${tarih > t ? ' ileri' : ''}`} title={g} />;
      })}
    </span>
  );
}

function BirlikteRutinler({ d, grup, bosGoster, onAc, onYeni }: { d: CevremDurum; grup: Grup; bosGoster?: boolean; onAc: (r: BirlikteRutin) => void; onYeni: () => void }) {
  const [hata, setHata] = useState<string | null>(null);
  const t = bugun();
  const rs = d.rutinler.filter((r) => r.grup_id === grup.id);
  if (!rs.length && !bosGoster) return null;
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Birlikte rutinler</h2>
      {rs.length ? (
        <div className="rt-cv-kutu">
          {rs.map((r) => {
            const ben = katiliyorMu(d, r.id);
            const kat = rutinKatilimcilari(d, r);
            const benSayi = haftaSayisi(d, r.id, d.uid);
            const yapti = bugunYaptiMi(d, r.id);
            const digerleri = kat.filter((k) => k.uye_id !== d.uid).map((k) => {
              const n = haftaSayisi(d, r.id, k.uye_id);
              return `${uyeAdi(d, k.uye_id)} ${Math.min(n, r.hedef)}/${r.hedef}${n >= r.hedef ? ' ✓' : ''}`;
            });
            return (
              <div key={r.id} className="rt-cv-sat">
                {ben
                  ? <button type="button" className={`rt-chk${yapti ? ' on' : ''}`} aria-label="Bugün yaptım" onClick={() => rutinYapildi(r, t, !yapti).catch((e) => setHata(hataMetni(e)))}>{yapti ? '✓' : ''}</button>
                  : <span className="rt-cv-rutin-ik" aria-hidden>{r.ikon ?? '🤝'}</span>}
                <button type="button" className="ic" onClick={() => onAc(r)}>
                  <b>{ben && r.ikon ? `${r.ikon} ` : ''}{r.ad}</b>
                  <span>Haftada {r.hedef}{ben ? ` · ben ${Math.min(benSayi, r.hedef)}/${r.hedef}${benSayi >= r.hedef ? ' ✓' : ''}` : ''}{digerleri.length ? ` · ${digerleri.join(' · ')}` : ''}</span>
                  {ben && <HaftaNoktalari d={d} r={r} kim={d.uid!} />}
                </button>
                {!ben && <button type="button" className="rt-cv-al" onClick={() => rutineKatil(r.grup_id, r.id, true).catch((e) => setHata(hataMetni(e)))}>Ben de varım</button>}
              </div>
            );
          })}
        </div>
      ) : <button type="button" className="rt-cv-bos-sat" onClick={onYeni}>&quot;Haftada 3 yürüyüş&quot; gibi ortak bir hedef koy · ＋ Başlat</button>}
      {hata && <p className="rt-hata">{hata}</p>}
    </section>
  );
}

function RutinFormu({ grup, rutin, onKapat }: { grup: Grup; rutin?: BirlikteRutin; onKapat: () => void }) {
  const [ad, setAd] = useState(rutin?.ad ?? '');
  const [ikon, setIkon] = useState<string | null>(rutin?.ikon ?? '🚶');
  const [hedef, setHedef] = useState(rutin?.hedef ?? 3);
  const [aciklama, setAciklama] = useState(rutin?.aciklama ?? '');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik={rutin ? 'Birlikte rutini düzenle' : 'Birlikte rutin'} onKapat={onKapat}>
      <label className="rt-alan">Ne yapacağız<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. 30 dk yürüyüş" autoFocus={!rutin} /></label>
      <div className="rt-alan">Simge<div className="rt-cv-cipler">{RUTIN_IKON.map((i) => <button key={i} type="button" className={`rt-chip${ikon === i ? ' on' : ''}`} onClick={() => setIkon(i)}>{i}</button>)}</div></div>
      <div className="rt-alan">Haftada kaç kez
        <div className="rt-cv-cipler">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} type="button" className={`rt-chip${hedef === n ? ' on' : ''}`} onClick={() => setHedef(n)}>{n}</button>)}</div>
        <small className="rt-muted">Herkes kendi gününde yapar. Hedefi tutunca haftanın kalanında kart ajandandan kalkar.</small>
      </div>
      <label className="rt-alan">Not (isteğe bağlı)<input className="rt-inp" value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="ör. Akşam yemeğinden sonra" /></label>
      {!rutin && <p className="rt-uyari">Sen katılmış olarak başlar; gruptakiler &quot;Ben de varım&quot; diyerek katılır.</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim() || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          const g = { ad: ad.trim(), ikon, hedef, aciklama: aciklama.trim() || null };
          try { if (rutin) await rutinGuncelle(rutin.id, g); else await rutinEkle(grup.id, g); onKapat(); }
          catch (e) { setHata(hataMetni(e)); setBekle(false); }
        }}>{rutin ? 'Kaydet' : 'Başlat'}</button>
      </div>
    </Modal>
  );
}

function RutinDetay({ d, grup, rutin, onKapat }: { d: CevremDurum; grup: Grup; rutin: BirlikteRutin; onKapat: () => void }) {
  const r = d.rutinler.find((x) => x.id === rutin.id) ?? rutin;
  const [duzenle, setDuzenle] = useState(false);
  const [sil, setSil] = useState(false);
  const [ayril, setAyril] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const ben = katiliyorMu(d, r.id);
  const kat = rutinKatilimcilari(d, r);
  const katilmayan = aktifUyeler(d, grup.id).filter((u) => !kat.some((k) => k.uye_id === u.uye_id));
  const yonetir = r.olusturan === d.uid || benYoneticiyim(d, grup.id);
  if (duzenle) return <RutinFormu grup={grup} rutin={r} onKapat={() => setDuzenle(false)} />;
  return (
    <Modal baslik={`${r.ikon ?? '🤝'} ${r.ad}`} onKapat={onKapat}>
      <p className="rt-muted">Haftada {r.hedef} kez · {uyeAdi(d, r.olusturan) || 'Biri'} başlattı{r.aciklama ? ` · ${r.aciklama}` : ''}</p>
      <div className="rt-cv-kutu">
        {kat.length ? kat.map((k) => {
          const n = haftaSayisi(d, r.id, k.uye_id);
          const sr = seri(d, r, k.uye_id);
          return (
            <div key={k.uye_id} className="rt-cv-sat">
              <Avatar ad={uyeAdi(d, k.uye_id)} boyut={26} />
              <div className="ic">
                <b>{uyeAdi(d, k.uye_id)}</b>
                <span>Bu hafta {Math.min(n, r.hedef)}/{r.hedef}{n >= r.hedef ? ' ✓' : ''}{sr > 1 ? ` · 🔥 ${sr} hafta üst üste` : ''}</span>
                <HaftaNoktalari d={d} r={r} kim={k.uye_id} />
              </div>
            </div>
          );
        }) : <p className="rt-muted rt-cv-not">Henüz katılan yok.</p>}
      </div>
      {katilmayan.length > 0 && <p className="rt-muted">Katılmayan: {katilmayan.map((u) => (u.uye_id === d.uid ? 'sen' : u.ad)).join(', ')}</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        {yonetir && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
        {yonetir && <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>}
        <span style={{ flex: 1 }} />
        {ben
          ? <button type="button" className="rt-btn" onClick={() => setAyril(true)}>Ayrıl</button>
          : <button type="button" className="rt-btn primary" onClick={() => rutineKatil(r.grup_id, r.id, true).catch((e) => setHata(hataMetni(e)))}>Ben de varım</button>}
      </div>
      {ayril && <OnayKutusu metin="Bu rutinden ayrılırsan kart ajandandan kalkar. Yaptıkların grupta görünmeye devam eder." evet="Ayrıl" onVazgec={() => setAyril(false)} onEvet={() => { setAyril(false); rutineKatil(r.grup_id, r.id, false).catch((e) => setHata(hataMetni(e))); }} />}
      {sil && <OnayKutusu metin={`"${r.ad}" herkes için silinsin mi?`} evet="Sil" onVazgec={() => setSil(false)} onEvet={() => { void rutinSil(r.id).catch(() => {}); onKapat(); }} />}
    </Modal>
  );
}

// ———————————————— buluşma ————————————————

const YANIT: [Yanit, string][] = [['geliyorum', 'Geliyorum'], ['belki', 'Belki'], ['gelemem', 'Gelemem']];

function TarihKutusu({ tarih }: { tarih: string }) {
  const d = tarihParse(tarih);
  const ay = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][d.getMonth()];
  return <span className="rt-cv-tarih" aria-hidden><b>{d.getDate()}</b><small>{ay}</small></span>;
}

function YanitDugmeleri({ d, b, onHata }: { d: CevremDurum; b: Bulusma; onHata: (m: string) => void }) {
  const y = yanitim(d, b.id);
  return (
    <div className="rt-cv-yanit">
      {YANIT.map(([k, e]) => <button key={k} type="button" className={`${k}${y === k ? ' on' : ''}`} onClick={() => bulusmaYanitla(b, k).catch((er) => onHata(hataMetni(er)))}>{e}</button>)}
    </div>
  );
}

function Bulusmalar({ d, grup, bosGoster, onAc, onYeni }: { d: CevremDurum; grup: Grup; bosGoster?: boolean; onAc: (b: Bulusma) => void; onYeni: () => void }) {
  const [hata, setHata] = useState<string | null>(null);
  const t = bugun();
  const bs = d.bulusmalar.filter((b) => b.grup_id === grup.id && !b.iptal && b.tarih >= t).sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.saat ?? '').localeCompare(b.saat ?? ''));
  if (!bs.length && !bosGoster) return null;
  return (
    <section className="rt-cv-bolum">
      <h2 className="rt-cv-h">Buluşmalar</h2>
      {bs.length ? (
        <div className="rt-cv-kutu">
          {bs.map((b) => {
            const s = yanitSayilari(d, b);
            const ozet = [s.geliyorum.length ? `${s.geliyorum.length} geliyor` : '', s.belki.length ? `${s.belki.length} belki` : '', s.gelemem.length ? `${s.gelemem.length} gelemiyor` : ''].filter(Boolean).join(' · ');
            return (
              <div key={b.id} className="rt-cv-sat rt-cv-bl">
                <TarihKutusu tarih={b.tarih} />
                <button type="button" className="ic" onClick={() => onAc(b)}>
                  <b>{b.ad}</b>
                  <span>{tarihEtiket(b.tarih).split(', ')[1]}{b.saat ? ` ${b.saat}` : ''}{b.yer ? ` · 📍 ${b.yer}` : ''}</span>
                  {ozet && <span>{ozet}</span>}
                </button>
                <YanitDugmeleri d={d} b={b} onHata={setHata} />
              </div>
            );
          })}
        </div>
      ) : <button type="button" className="rt-cv-bos-sat" onClick={onYeni}>Yaklaşan buluşma yok · ＋ Öner</button>}
      {hata && <p className="rt-hata">{hata}</p>}
    </section>
  );
}

function BulusmaFormu({ grup, bulusma, onKapat }: { grup: Grup; bulusma?: Bulusma; onKapat: () => void }) {
  const t = bugun();
  const [ad, setAd] = useState(bulusma?.ad ?? '');
  const [tarih, setTarih] = useState(bulusma?.tarih ?? tarihEkle(t, 1));
  const [saat, setSaat] = useState(bulusma?.saat ?? '');
  const [yer, setYer] = useState(bulusma?.yer ?? '');
  const [aciklama, setAciklama] = useState(bulusma?.aciklama ?? '');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik={bulusma ? 'Buluşmayı düzenle' : 'Buluşma öner'} onKapat={onKapat}>
      <label className="rt-alan">Ne<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Pazar kahvaltısı" autoFocus={!bulusma} /></label>
      <div className="rt-satir rt-cv-iki">
        <label className="rt-alan">Gün<input className="rt-inp" type="date" value={tarih} min={t} onChange={(e) => setTarih(e.target.value)} /></label>
        <label className="rt-alan">Saat<input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      </div>
      <label className="rt-alan">Yer (isteğe bağlı)<input className="rt-inp" value={yer} onChange={(e) => setYer(e.target.value)} placeholder="ör. Moda sahili" /></label>
      <label className="rt-alan">Not (isteğe bağlı)<input className="rt-inp" value={aciklama} onChange={(e) => setAciklama(e.target.value)} /></label>
      {!bulusma && <p className="rt-uyari">Gruptakilere bildirim gider. &quot;Geliyorum&quot; diyenlerin ajandasına düşer; sen geliyorum olarak başlarsın.</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim() || !tarih || bekle} onClick={async () => {
          setBekle(true); setHata(null);
          const g = { ad: ad.trim(), tarih, saat: saat || null, yer: yer.trim() || null, aciklama: aciklama.trim() || null };
          try { if (bulusma) await bulusmaGuncelle(bulusma.id, g); else await bulusmaEkle(grup.id, g); onKapat(); }
          catch (e) { setHata(hataMetni(e)); setBekle(false); }
        }}>{bulusma ? 'Kaydet' : 'Öner'}</button>
      </div>
    </Modal>
  );
}

function BulusmaDetay({ d, grup, bulusma, onKapat }: { d: CevremDurum; grup: Grup; bulusma: Bulusma; onKapat: () => void }) {
  const b = d.bulusmalar.find((x) => x.id === bulusma.id) ?? bulusma;
  const [duzenle, setDuzenle] = useState(false);
  const [iptal, setIptal] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const s = yanitSayilari(d, b);
  const yanitlayan = new Set(d.yanitlar.filter((y) => y.bulusma_id === b.id).map((y) => y.uye_id));
  const bekleyen = aktifUyeler(d, grup.id).filter((u) => !yanitlayan.has(u.uye_id));
  const yonetir = b.olusturan === d.uid || benYoneticiyim(d, grup.id);
  if (duzenle) return <BulusmaFormu grup={grup} bulusma={b} onKapat={() => setDuzenle(false)} />;
  const grupSatir = (baslik: string, kisiler: string[]) => kisiler.length ? <p className="rt-metin"><b>{baslik}:</b> {kisiler.join(', ')}</p> : null;
  return (
    <Modal baslik={`📅 ${b.ad}`} onKapat={onKapat}>
      <p className="rt-metin">{tarihEtiket(b.tarih)}{b.saat ? ` · ${b.saat}` : ''}{b.yer ? <><br />📍 {b.yer}</> : null}</p>
      {b.aciklama && <p className="rt-muted">{b.aciklama}</p>}
      <p className="rt-muted">{uyeAdi(d, b.olusturan) || 'Biri'} önerdi.</p>
      {b.iptal && <p className="rt-hata">İptal edildi.</p>}
      {!b.iptal && <YanitDugmeleri d={d} b={b} onHata={setHata} />}
      {grupSatir('Geliyor', s.geliyorum.map((y) => uyeAdi(d, y.uye_id)))}
      {grupSatir('Belki', s.belki.map((y) => uyeAdi(d, y.uye_id)))}
      {grupSatir('Gelemiyor', s.gelemem.map((y) => uyeAdi(d, y.uye_id)))}
      {grupSatir('Yanıt vermedi', bekleyen.map((u) => (u.uye_id === d.uid ? 'Ben' : u.ad)))}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir">
        {yonetir && !b.iptal && <button type="button" className="rt-btn tehlike" onClick={() => setIptal(true)}>İptal et</button>}
        {yonetir && !b.iptal && <button type="button" className="rt-btn" onClick={() => setDuzenle(true)}>Düzenle</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="rt-btn" onClick={onKapat}>Kapat</button>
      </div>
      {iptal && <OnayKutusu metin="Buluşma iptal edilsin mi? Gelenlerin ajandasından kalkar." evet="İptal et" onVazgec={() => setIptal(false)} onEvet={() => { setIptal(false); bulusmaGuncelle(b.id, { iptal: true }).then(onKapat).catch((e) => setHata(hataMetni(e))); }} />}
    </Modal>
  );
}

// ———————————————— ekle sayfası + formlar ————————————————

function EkleSayfasi({ grup, onKapat, onSec }: { grup: Grup; onKapat: () => void; onSec: (s: 'is' | 'rica' | 'liste' | 'rutin' | 'bulusma') => void }) {
  const secenekler = {
    is: <button key="is" type="button" className="rt-cv-secenek" onClick={() => onSec('is')}><span className="ik">🧹</span><span><b>Ortak iş</b><small>Herkes görür; isteyen &quot;Ben alırım&quot; der.</small></span></button>,
    rica: <button key="rica" type="button" className="rt-cv-secenek" onClick={() => onSec('rica')}><span className="ik">🙋</span><span><b>Birinden iste</b><small>Tek bir kişiye iş gönder; kabul ederse onun ajandasına düşer.</small></span></button>,
    liste: <button key="liste" type="button" className="rt-cv-secenek" onClick={() => onSec('liste')}><span className="ik">📝</span><span><b>Liste</b><small>Market, yapılacaklar, hazırlık listesi.</small></span></button>,
    bulusma: <button key="bulusma" type="button" className="rt-cv-secenek" onClick={() => onSec('bulusma')}><span className="ik">📅</span><span><b>Buluşma</b><small>Gün, saat, yer öner; herkes geliyorum / belki / gelemem der.</small></span></button>,
    rutin: <button key="rutin" type="button" className="rt-cv-secenek" onClick={() => onSec('rutin')}><span className="ik">🤝</span><span><b>Birlikte rutin</b><small>&quot;Haftada 3 yürüyüş&quot; gibi ortak hedef; isteyen katılır, kim kaç kez yaptı görünür.</small></span></button>,
  };
  const sira: (keyof typeof secenekler)[] = grup.tur === 'arkadas' ? ['bulusma', 'rutin', 'liste', 'is', 'rica'] : ['is', 'rica', 'liste', 'bulusma', 'rutin'];
  return (
    <Modal baslik={`${grupIkonu(grup)} ${grup.ad} · ekle`} onKapat={onKapat}>
      <div className="rt-cv-secenekler">{sira.map((k) => secenekler[k])}</div>
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
      <p className="rt-metin">Bu kodu evdekilerle paylaş. Ritos'ta hesap açıp <b>Gruplar › Davet kodum var</b> ile katılırlar. Kod 7 gün geçerli.</p>
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

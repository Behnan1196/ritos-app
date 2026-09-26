'use client';

// Sınav hazırlığı paketi — katalog ve kaynaklar (P1–P6). Bkz. lib/sinav.ts.

import React, { useEffect, useMemo, useState } from 'react';
import { db, type KatalogDuzenRow, type KatalogRow, type KaynakRow, type KaynakTur, type KonuDurum, type KonuDurumRow, type PaketKurulumRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import {
  KAYNAK_TUR, PAKET, SINAVLAR, birlestir, farkGoruldu, iceAktar, kaynakKaydet, kaynakSil, katalogYenile, konuSayisi,
  kurulum, ogeAdlandir, ogeEkle, ogeGizle, ogeSifirla, ogeSil, ogeTasi, ornekKaynaklariEkle, paketKaldir, paketKur,
  sinavAdi, sinavVerisi, tabloCoz, type Ders, type Oge, type SinavVeri, type Unite,
} from '@/lib/sinav';
import { Chips, Kap, Modal, OnayKutusu } from './ortak';
import { teslimAl } from '@/lib/ajanda';
import { PAKET_SURUM, TAM_IZIN, bugun, tarihEtiket, type Blok, type SinavEk, type SinavGorevTur } from '@/lib/paket';
import {
  DURUM_ETIKET, GOREV_TUR, ZAYIF_ESIK, denemeTurAdi, dogrulukOrani, gorevUret, konuDurumYaz, konuDurumu, netHesapla,
  sinavAnalizi, soruSayisi, yanlisBolen, zayifMi, type DenemeSonuc, type GorevTaslak, type KonuIstatistik, type SinavAnalizi,
} from '@/lib/sinavGorev';

const YUKLENIYOR = Symbol('yukleniyor');

function useKurulum() {
  const k = useCanli(async () => (await kurulum()) ?? null, [], YUKLENIYOR as PaketKurulumRow | null | typeof YUKLENIYOR);
  return k;
}
function useKatalog() {
  return useCanli(() => db.katalog.where('paket').equals(PAKET).toArray(), [], [] as KatalogRow[]);
}
function useDuzenler() {
  return useCanli(() => db.katalog_duzen.toArray(), [], [] as KatalogDuzenRow[]);
}

/** Kurulu sınavların birleşik ağaçları. */
function useAgaclar(k: PaketKurulumRow | null | typeof YUKLENIYOR) {
  const katalog = useKatalog();
  const duzenler = useDuzenler();
  return useMemo(() => {
    const m = new Map<string, Ders[]>();
    if (!k || k === YUKLENIYOR) return m;
    for (const kod of k.secim) m.set(kod, birlestir(sinavVerisi(katalog, kod), duzenler.filter((d) => d.sinav === kod)));
    return m;
  }, [k, katalog, duzenler]);
}

// ———————————————— Home: kısa özet ————————————————

export function useSinavOzeti(): { kurulu: boolean; ozet: string } {
  const k = useKurulum();
  const agaclar = useAgaclar(k);
  if (!k || k === YUKLENIYOR) return { kurulu: false, ozet: '' };
  const konu = Array.from(agaclar.values()).reduce((t, d) => t + konuSayisi(d), 0);
  return { kurulu: true, ozet: `${k.secim.map((s) => sinavAdi(s, k)).join(' · ')} — ${konu} konu` };
}

// ———————————————— Ayarlar > Paketler (P1) ————————————————

export function PaketlerKap() {
  const k = useKurulum();
  const [modal, setModal] = useState(false);
  const [kaldir, setKaldir] = useState(false);
  if (k === YUKLENIYOR) return null;
  return (
    <Kap baslik="Paketler">
      <p className="rt-muted">Paketler bir alana özel katalog, kart türleri ve araçlar ekler. Kişisel kullanım için de, koçluk için de.</p>
      <div className="rt-paket">
        <div className="rt-paket-bas"><b>📚 Sınav hazırlığı</b>{k && <span className="rt-aktif">kurulu</span>}</div>
        <p className="rt-muted">TYT, AYT ve LGS ders–konu katalogu, kaynak listesi. Görev kartları ve deneme takibi sırada.</p>
        {k && <p className="rt-metin">{k.secim.map((s) => sinavAdi(s, k)).join(' · ')}</p>}
        {kaldir ? (
          <OnayKutusu metin="Paket kaldırılır. Katalog düzenlemelerin ve kaynakların saklanır; yeniden kurarsan geri gelir." evet="Kaldır"
            onVazgec={() => setKaldir(false)} onEvet={async () => { await paketKaldir(); setKaldir(false); }} />
        ) : (
          <div className="rt-satir">
            <button type="button" className={`rt-btn${k ? '' : ' primary'}`} onClick={() => setModal(true)}>{k ? 'Sınavları değiştir' : 'Ekle'}</button>
            {k && <button type="button" className="rt-btn tehlike" onClick={() => setKaldir(true)}>Kaldır</button>}
          </div>
        )}
      </div>
      <div className="rt-paket pasif">
        <div className="rt-paket-bas"><b>🥗 Beslenme</b><span className="rt-rozet">yakında</span></div>
      </div>
      {modal && <KurulumModal k={k} onKapat={() => setModal(false)} />}
    </Kap>
  );
}

function KurulumModal({ k, onKapat }: { k: PaketKurulumRow | null; onKapat: () => void }) {
  const [secim, setSecim] = useState<string[]>(k?.secim ?? []);
  const [ozelAd, setOzelAd] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const tumu = [...SINAVLAR.map((s) => ({ kod: s.kod, ad: s.ad, aciklama: s.aciklama })), ...(k?.ozel ?? []).map((o) => ({ kod: o.kod, ad: o.ad, aciklama: 'Kendi listen' }))];
  const degistir = (kod: string) => setSecim((s) => (s.includes(kod) ? s.filter((x) => x !== kod) : [...s, kod]));
  return (
    <Modal baslik="📚 Sınav hazırlığı" onKapat={onKapat}>
      <p className="rt-metin">Hangi sınava hazırlanıyorsun (ya da hazırlatıyorsun)?</p>
      <div className="rt-secenekler">
        {tumu.map((s) => (
          <label key={s.kod} className="rt-onay">
            <input type="checkbox" checked={secim.includes(s.kod)} onChange={() => degistir(s.kod)} />
            <span><b>{s.ad}</b> <span className="rt-muted">{s.aciklama}</span></span>
          </label>
        ))}
      </div>
      <p className="rt-muted" style={{ marginTop: 12 }}>Hazır katalog yerine kendi ders–konu listenle çalışmak istersen bir ad ver; boş bir liste açılır, dersleri kendin ekler ya da Excel&apos;den yapıştırırsın.</p>
      <input className="rt-inp" placeholder="Kendi listem (isteğe bağlı), ör. Kurum TYT programı" value={ozelAd} onChange={(e) => setOzelAd(e.target.value)} />
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir" style={{ marginTop: 12 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={calisiyor || (!secim.length && !ozelAd.trim())}
          onClick={async () => {
            setCalisiyor(true); setHata(null);
            try { await paketKur(secim, ozelAd); onKapat(); } catch (e) { setHata(e instanceof Error ? e.message : 'Katalog indirilemedi.'); setCalisiyor(false); }
          }}>{calisiyor ? 'Kuruluyor…' : k ? 'Kaydet' : 'Kur'}</button>
      </div>
    </Modal>
  );
}

// ———————————————— Tool: katalog + kaynaklar (P2–P6) ————————————————

export function SinavTool() {
  const k = useKurulum();
  const katalog = useKatalog();
  const agaclar = useAgaclar(k);
  const [sekme, setSekme] = useState<string>('');
  const [gorev, setGorev] = useState(false);
  useEffect(() => { katalogYenile().catch(() => {}); }, []);

  if (k === YUKLENIYOR) return null;
  if (!k) return (
    <div className="side-content">
      <p className="rt-metin">Sınav hazırlığı paketi kurulu değil. Ayarlar &gt; Paketler&apos;den ekleyebilirsin.</p>
      <PaketlerKap />
    </div>
  );
  const aktif = sekme && (sekme === 'kaynak' || sekme === 'deneme' || k.secim.includes(sekme)) ? sekme : k.secim[0] ?? 'kaynak';
  const sekmeler: [string, string][] = [...k.secim.map((s) => [s, sinavAdi(s, k)] as [string, string]), ['deneme', 'Denemeler'], ['kaynak', 'Kaynaklar']];

  return (
    <div className="side-content rt-sinav" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="rt-satir" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}><Chips secenekler={sekmeler} deger={aktif} onSec={setSekme} /></div>
        <button type="button" className="rt-btn primary" onClick={() => setGorev(true)}>＋ Görev</button>
      </div>
      {gorev && <GorevEkleModal ilk={k.secim.includes(aktif) ? { sinav: aktif } : undefined} onKapat={() => setGorev(false)} />}
      <div style={{ marginTop: 10 }}>
        {aktif === 'kaynak'
          ? <Kaynaklar k={k} agaclar={agaclar} />
          : aktif === 'deneme' ? <Denemeler k={k} />
          : <KatalogGorunum key={aktif} kod={aktif} k={k} satir={katalog.find((x) => x.kod === aktif)} dersler={agaclar.get(aktif) ?? []} />}
      </div>
    </div>
  );
}

type OgeSecim = { o: Oge; kardesler: Oge[]; ust?: Ders | Unite };

function KatalogGorunum({ kod, k, satir, dersler }: { kod: string; k: PaketKurulumRow; satir?: KatalogRow; dersler: Ders[] }) {
  const [ara, setAra] = useState('');
  const [acik, setAcik] = useState<Set<string>>(new Set());
  const [gizliler, setGizliler] = useState(false);
  const [yapi, setYapi] = useState(false);
  const [secim, setSecim] = useState<OgeSecim | null>(null);
  const [modal, setModal] = useState<null | 'yapistir' | 'ders'>(null);
  const analiz = useCanli(() => sinavAnalizi(), [], null as SinavAnalizi | null);
  const durumSatir = useCanli(() => db.konu_durum.toArray(), [], [] as KonuDurumRow[]);
  const elle = useMemo(() => new Map(durumSatir.map((x) => [x.id, x.durum])), [durumSatir]);
  const durum = (id: string) => konuDurumu(elle.get(id), analiz?.konular.get(id));
  const tamamSay = (d: Ders) => d.uniteler.reduce((t, u) => t + u.konular.filter((x) => !x.gizli && durum(x.id) === 'tamam').length, 0);
  const veri = satir?.veri as SinavVeri | undefined;
  const ozel = kod.startsWith('ozel-');
  const fark = satir?.fark && (k.gorulen[kod] ?? 0) < satir.surum ? satir.fark : null;
  const gor = (o: Oge) => gizliler || !o.gizli;
  const ac = (id: string) => setAcik((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });

  const q = ara.trim().toLocaleLowerCase('tr');
  const bulunan = q ? dersler.flatMap((d) => d.uniteler.flatMap((u) => u.konular
    .filter((x) => gor(x) && x.ad.toLocaleLowerCase('tr').includes(q))
    .map((x) => ({ d, u, x })))) : [];

  return (
    <div>
      {!ozel && satir && !satir.onayli && <p className="rt-uyari">Taslak — bu katalog henüz uzman kontrolünden geçmedi. Hata görürsen düzeltip kendi kopyanda kullanabilirsin.</p>}
      {!ozel && !satir && <p className="rt-muted">Katalog indiriliyor…</p>}
      {fark && (
        <div className="rt-onay-kutu" style={{ marginTop: 8 }}>
          <span><b>Katalog güncellendi</b> (sürüm {fark.eski} → {fark.yeni}). Senin düzenlemelerin korundu.</span>
          {fark.eklenen.length > 0 && <span>Eklenen: {fark.eklenen.join(', ')}</span>}
          {fark.adiDegisen.length > 0 && <span>Adı değişen: {fark.adiDegisen.join(', ')}</span>}
          {fark.cikan.length > 0 && <span>Çıkarılan: {fark.cikan.join(', ')}</span>}
          <div className="rt-satir"><button type="button" className="rt-btn" onClick={() => farkGoruldu(kod, fark.yeni)}>Tamam</button></div>
        </div>
      )}

      <div className="rt-satir" style={{ margin: '10px 0', flexWrap: 'nowrap' }}>
        <input className="rt-inp" placeholder="Konu ara" value={ara} onChange={(e) => setAra(e.target.value)} />
      </div>
      <div className="rt-satir" style={{ marginBottom: 8 }}>
        <span className="rt-muted" style={{ alignSelf: 'center' }}>{dersler.filter(gor).length} ders · {konuSayisi(dersler)} konu</span>
        <span style={{ flex: 1 }} />
        {veri?.testler?.length ? <button type="button" className="rt-linkbtn" onClick={() => setYapi((v) => !v)}>Sınav yapısı</button> : null}
        <button type="button" className="rt-linkbtn" onClick={() => setGizliler((v) => !v)}>{gizliler ? 'Gizlileri sakla' : 'Gizlileri göster'}</button>
      </div>
      {yapi && veri && <SinavYapisi veri={veri} />}

      {q ? (
        bulunan.length === 0 ? <p className="rt-muted">Eşleşen konu yok.</p> : (
          <div className="rt-konular">
            {bulunan.map(({ d, u, x }) => (
              <button key={x.id} type="button" className="rt-konu" onClick={() => setSecim({ o: x, kardesler: u.konular, ust: u })}>
                <span><DurumNokta d={durum(x.id)} />{x.ad}<OgeIsaret o={x} /></span><span className="rt-muted">{d.ad} › {u.ad}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {dersler.length === 0 && <p className="rt-muted">Bu liste boş. Ders ekle ya da Excel&apos;den Ders | Ünite | Konu sütunlarını yapıştır.</p>}
          {dersler.filter(gor).map((d) => (
            <div key={d.id} className={`rt-klasor${d.gizli ? ' rt-gizli' : ''}`}>
              <div className="rt-klasor-bas">
                <button type="button" className="rt-klasor-ad" onClick={() => ac(d.id)}>
                  {acik.has(d.id) ? '▾' : '▸'} {d.ad}<OgeIsaret o={d} /> <span className="rt-muted">· {tamamSay(d) ? `${tamamSay(d)}/` : ''}{konuSayisi([d])}</span>
                </button>
                <button type="button" className="rt-ikon" aria-label="Ders seçenekleri" onClick={() => setSecim({ o: d, kardesler: dersler })}>⋯</button>
              </div>
              {acik.has(d.id) && (
                <div className="rt-klasor-ic">
                  {d.uniteler.filter(gor).map((u) => (
                    <div key={u.id} className={u.gizli ? 'rt-gizli' : ''}>
                      <button type="button" className="rt-unite" onClick={() => setSecim({ o: u, kardesler: d.uniteler, ust: d })}>
                        {u.ad}<OgeIsaret o={u} />{u.test && <span className="rt-rozet">{u.test}</span>}
                      </button>
                      <div className="rt-konular">
                        {u.konular.filter(gor).map((x) => (
                          <button key={x.id} type="button" className={`rt-konu${x.gizli ? ' rt-gizli' : ''}`} onClick={() => setSecim({ o: x, kardesler: u.konular, ust: u })}>
                            <span><DurumNokta d={durum(x.id)} />{x.ad}<OgeIsaret o={x} /></span>
                            <KonuOzet s={analiz?.konular.get(x.id)} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {d.uniteler.length === 0 && <p className="rt-muted">Ünite yok — ⋯ ile ekle.</p>}
                </div>
              )}
            </div>
          ))}
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn" onClick={() => setModal('ders')}>＋ Ders</button>
            <button type="button" className="rt-btn" onClick={() => setModal('yapistir')}>Excel&apos;den yapıştır</button>
          </div>
        </>
      )}

      {veri?.belgeler?.length ? (
        <details className="rt-belgeler"><summary>Katalogun kaynakları ve notlar</summary>
          <ul className="rt-maddeler">{veri.belgeler.map((b) => <li key={b.url}><a className="rt-link" href={b.url} target="_blank" rel="noreferrer">{b.baslik}</a></li>)}</ul>
          {veri.notlar?.length ? <ul className="rt-maddeler">{veri.notlar.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
        </details>
      ) : null}

      {secim && <OgeModal kod={kod} s={secim} onKapat={() => setSecim(null)} konu={secim.o.tur === 'konu' ? { durum: durum(secim.o.id), elle: elle.get(secim.o.id), ist: analiz?.konular.get(secim.o.id), dersId: dersler.find((d) => d.uniteler.some((u) => u.id === secim.o.ust_id))?.id } : undefined} />}
      {modal === 'ders' && <AdModal baslik="Yeni ders" onKapat={() => setModal(null)} onKaydet={(ad) => ogeEkle(kod, 'ders', null, ad, (dersler.length + 1) * 10 + 1000)} />}
      {modal === 'yapistir' && <YapistirModal kod={kod} dersler={dersler} onKapat={() => setModal(null)} />}
    </div>
  );
}

function DurumNokta({ d }: { d: KonuDurum }) {
  return <i className={`rt-durum ${d}`} title={DURUM_ETIKET[d]} aria-label={DURUM_ETIKET[d]} />;
}

function KonuOzet({ s }: { s?: KonuIstatistik }) {
  if (!s || !soruSayisi(s)) return null;
  const o = dogrulukOrani(s)!;
  return <span className={`rt-muted${zayifMi(s) ? ' rt-azalis' : ''}`}>%{Math.round(o * 100)} doğru · {soruSayisi(s)} soru</span>;
}

function konuIstatistikMetni(s?: KonuIstatistik): string {
  if (!s) return 'Bu konuda henüz yapılmış görev yok.';
  const p = [
    s.calisma && `${s.calisma} çalışma`, s.tekrar && `${s.tekrar} tekrar`, s.dakika && `${s.dakika} dk`,
    soruSayisi(s) && `${soruSayisi(s)} soru (%${Math.round((dogrulukOrani(s) ?? 0) * 100)} doğru)`,
    s.son && `son: ${tarihEtiket(s.son)}`,
  ].filter(Boolean);
  return p.join(' · ') + (zayifMi(s) ? ' — zayıf konu' : '');
}

function OgeIsaret({ o }: { o: Oge }) {
  if (o.katalogdaYok) return <span className="rt-rozet" title="Katalogun yeni sürümünde yok">katalogda yok</span>;
  if (o.ek) return <span className="rt-rozet tam">eklendi</span>;
  if (o.degisti) return <span className="rt-rozet">değiştirildi</span>;
  if (o.gizli) return <span className="rt-rozet">gizli</span>;
  return null;
}

function SinavYapisi({ veri }: { veri: SinavVeri }) {
  return (
    <div className="rt-yapi">
      {veri.testler.map((t) => (
        <div key={t.test}>
          <b>{t.test}</b> <span className="rt-muted">· {t.soru} soru</span>
          {t.dersler?.length ? <div className="rt-muted">{t.dersler.map((d) => `${d.ders} ${d.soru}`).join(' · ')}</div> : null}
        </div>
      ))}
    </div>
  );
}

function AdModal({ baslik, ilk = '', onKapat, onKaydet }: { baslik: string; ilk?: string; onKapat: () => void; onKaydet: (ad: string) => Promise<unknown> }) {
  const [ad, setAd] = useState(ilk);
  return (
    <Modal baslik={baslik} onKapat={onKapat}>
      <input className="rt-inp" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad" />
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => { await onKaydet(ad); onKapat(); }}>Kaydet</button>
      </div>
    </Modal>
  );
}

const TUR_AD: Record<Oge['tur'], string> = { ders: 'Ders', unite: 'Ünite', konu: 'Konu' };

interface KonuBilgi { durum: KonuDurum; elle?: KonuDurum; ist?: KonuIstatistik; dersId?: string }

function OgeModal({ kod, s, onKapat, konu }: { kod: string; s: OgeSecim; onKapat: () => void; konu?: KonuBilgi }) {
  const { o, kardesler } = s;
  const [gorev, setGorev] = useState<SinavGorevTur | null>(null);
  const [ad, setAd] = useState(o.ad);
  const [yeniAlt, setYeniAlt] = useState('');
  const [sil, setSil] = useState(false);
  if (gorev) return <GorevEkleModal ilk={{ tur: gorev, sinav: kod, dersId: konu?.dersId, konuIds: [o.id] }} onKapat={onKapat} />;
  const i = kardesler.findIndex((x) => x.id === o.id);
  const altTur = o.tur === 'ders' ? 'unite' : o.tur === 'unite' ? 'konu' : null;
  const altSayisi = o.tur === 'ders' ? (o as Ders).uniteler.length : o.tur === 'unite' ? (o as Unite).konular.length : 0;
  return (
    <Modal baslik={TUR_AD[o.tur]} onKapat={onKapat}>
      {konu && (
        <div className="rt-konu-bilgi">
          <Chips<KonuDurum> secenekler={Object.entries(DURUM_ETIKET) as [KonuDurum, string][]} deger={konu.durum} onSec={(d) => konuDurumYaz(o.id, d)} />
          {konu.elle && <button type="button" className="rt-linkbtn" onClick={() => konuDurumYaz(o.id, null)}>Durumu kartlardan hesapla</button>}
          <p className="rt-muted">{konuIstatistikMetni(konu.ist)}</p>
          <div className="rt-satir">
            <button type="button" className="rt-btn" onClick={() => setGorev('calisma')}>＋ Çalışma</button>
            <button type="button" className="rt-btn" onClick={() => setGorev('soru')}>＋ Soru çöz</button>
            <button type="button" className="rt-btn" onClick={() => setGorev('tekrar')}>＋ Tekrar</button>
          </div>
        </div>
      )}
      {o.katalogdaYok && <p className="rt-uyari">Bu öğe katalogun yeni sürümünde yok. Geçmiş kayıtların bozulmasın diye senin listende duruyor.</p>}
      <label className="rt-alan">Ad
        <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
          <input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} />
          <button type="button" className="rt-btn primary" disabled={!ad.trim() || ad === o.ad} onClick={async () => { await ogeAdlandir(o, kod, ad); onKapat(); }}>Kaydet</button>
        </div>
      </label>
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" disabled={i <= 0} onClick={() => ogeTasi(o, kardesler, kod, -1)}>↑ Yukarı</button>
        <button type="button" className="rt-btn" disabled={i < 0 || i >= kardesler.length - 1} onClick={() => ogeTasi(o, kardesler, kod, 1)}>↓ Aşağı</button>
        {!o.ek && <button type="button" className="rt-btn" onClick={async () => { await ogeGizle(o, kod, !o.gizli); onKapat(); }}>{o.gizli ? 'Göster' : 'Gizle'}</button>}
        {!o.ek && (o.degisti || o.gizli) && <button type="button" className="rt-btn" onClick={async () => { await ogeSifirla(o); onKapat(); }}>Katalogdaki haline döndür</button>}
        {o.ek && !sil && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
      </div>
      {!o.ek && <p className="rt-muted">Katalog öğeleri silinmez, gizlenir: gizli öğe seçimlerde çıkmaz, geçmiş kayıtlarda adıyla görünür.</p>}
      {sil && <OnayKutusu metin={altSayisi ? `${TUR_AD[o.tur]} ve içindeki eklenen öğeler silinir.` : `${TUR_AD[o.tur]} silinir.`} evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await ogeSil(o); onKapat(); }} />}
      {altTur && (
        <label className="rt-alan" style={{ marginTop: 12 }}>{altTur === 'unite' ? 'Ünite ekle' : 'Konu ekle'}
          <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
            <input className="rt-inp" value={yeniAlt} onChange={(e) => setYeniAlt(e.target.value)} placeholder={altTur === 'unite' ? 'Ünite adı' : 'Konu adı'} />
            <button type="button" className="rt-btn" disabled={!yeniAlt.trim()} onClick={async () => { await ogeEkle(kod, altTur, o.id, yeniAlt, (altSayisi + 1) * 10 + 1000); setYeniAlt(''); onKapat(); }}>Ekle</button>
          </div>
        </label>
      )}
    </Modal>
  );
}

function YapistirModal({ kod, dersler, onKapat }: { kod: string; dersler: Ders[]; onKapat: () => void }) {
  const [metin, setMetin] = useState('');
  const [sonuc, setSonuc] = useState<string | null>(null);
  const c = useMemo(() => tabloCoz(metin), [metin]);
  const dersSayisi = new Set(c.satirlar.map((s) => s.ders)).size;
  return (
    <Modal baslik="Excel'den yapıştır" onKapat={onKapat}>
      <p className="rt-muted">Excel&apos;de <b>Ders | Ünite | Konu</b> (ya da <b>Ders | Konu</b>) sütunlarını seçip kopyala, buraya yapıştır. Aynı adlı ders ve üniteler birleşir, var olan konular tekrar eklenmez.</p>
      <textarea className="rt-inp" rows={8} value={metin} onChange={(e) => { setMetin(e.target.value); setSonuc(null); }} placeholder={'Matematik\tSayılar\tTemel kavramlar\nMatematik\tSayılar\tBölünebilme'} />
      {c.satirlar.length > 0 && (
        <div className="rt-yapi">
          <span className="rt-muted">{dersSayisi} ders · {c.satirlar.length} konu okundu{c.hatali ? ` · ${c.hatali} satır okunamadı` : ''}</span>
          {c.satirlar.slice(0, 5).map((s, i) => <div key={i} className="rt-muted">{s.ders} › {s.unite || 'Genel'} › {s.konu}</div>)}
          {c.satirlar.length > 5 && <div className="rt-muted">…</div>}
        </div>
      )}
      {sonuc && <p className="rt-tamam">{sonuc}</p>}
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>{sonuc ? 'Kapat' : 'Vazgeç'}</button>
        {!sonuc && <button type="button" className="rt-btn primary" disabled={!c.satirlar.length} onClick={async () => {
          const r = await iceAktar(kod, dersler, c.satirlar);
          setSonuc(`${r.ders} ders, ${r.unite} ünite, ${r.konu} konu eklendi.`);
        }}>Ekle</button>}
      </div>
    </Modal>
  );
}

// ———————————————— kaynaklar (P6) ————————————————

const TUR_IKON: Record<KaynakTur, string> = { kitap: '📘', soru_bankasi: '📝', deneme: '🧪', video: '▶', dokuman: '📄' };

function Kaynaklar({ k, agaclar }: { k: PaketKurulumRow; agaclar: Map<string, Ders[]> }) {
  const kaynaklar = useCanli(() => db.kaynak.toArray(), [], [] as KaynakRow[]);
  const [filtre, setFiltre] = useState('hepsi');
  const [duzen, setDuzen] = useState<KaynakRow | 'yeni' | null>(null);
  const [ekleniyor, setEkleniyor] = useState(false);
  const dersAdi = useMemo(() => {
    const m = new Map<string, { ad: string; sinav: string }>();
    agaclar.forEach((ds, kod) => ds.forEach((d) => m.set(d.id, { ad: `${sinavAdi(kod, k)} ${d.ad}`, sinav: kod })));
    return m;
  }, [agaclar, k]);
  const liste = kaynaklar
    .filter((x) => filtre === 'hepsi' || x.dersler.some((d) => dersAdi.get(d)?.sinav === filtre))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  return (
    <div>
      <p className="rt-muted">Kullandığın kitaplar, soru bankaları, videolar. Görev kartlarında kaynağı buradan seçeceksin.</p>
      {k.secim.length > 1 && <Chips secenekler={[['hepsi', 'Hepsi'], ...k.secim.map((s) => [s, sinavAdi(s, k)] as [string, string])]} deger={filtre} onSec={setFiltre} />}
      <div className="rt-konular" style={{ marginTop: 8 }}>
        {liste.map((x) => (
          <div key={x.id} className="rt-kaynak">
            <button type="button" className="rt-konu" onClick={() => setDuzen(x)}>
              <span>{TUR_IKON[x.tur]} {x.ad}</span>
              <span className="rt-muted">{x.dersler.map((d) => dersAdi.get(d)?.ad).filter(Boolean).join(', ') || 'Ders seçilmedi'}</span>
            </button>
            {x.url && <a className="rt-link" href={x.url} target="_blank" rel="noreferrer">Aç ↗</a>}
          </div>
        ))}
      </div>
      {kaynaklar.length === 0 && <p className="rt-muted">Henüz kaynak yok.</p>}
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn primary" onClick={() => setDuzen('yeni')}>＋ Kaynak</button>
        {kaynaklar.length === 0 && <button type="button" className="rt-btn" disabled={ekleniyor} onClick={async () => { setEkleniyor(true); await ornekKaynaklariEkle(); setEkleniyor(false); }}>Örnek listeyi ekle</button>}
      </div>
      {duzen && <KaynakModal k={k} agaclar={agaclar} kaynak={duzen === 'yeni' ? null : duzen} onKapat={() => setDuzen(null)} />}
    </div>
  );
}

function KaynakModal({ k, agaclar, kaynak, onKapat }: { k: PaketKurulumRow; agaclar: Map<string, Ders[]>; kaynak: KaynakRow | null; onKapat: () => void }) {
  const [ad, setAd] = useState(kaynak?.ad ?? '');
  const [tur, setTur] = useState<KaynakTur>(kaynak?.tur ?? 'kitap');
  const [dersler, setDersler] = useState<string[]>(kaynak?.dersler ?? []);
  const [url, setUrl] = useState(kaynak?.url ?? '');
  const [not, setNot] = useState(kaynak?.not ?? '');
  const [sil, setSil] = useState(false);
  const degistir = (id: string) => setDersler((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Modal baslik={kaynak ? 'Kaynak' : 'Yeni kaynak'} onKapat={onKapat}>
      <label className="rt-alan">Ad<input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. 345 TYT Matematik Soru Bankası" /></label>
      <div style={{ margin: '10px 0' }}><Chips secenekler={KAYNAK_TUR} deger={tur} onSec={setTur} /></div>
      <label className="rt-alan">Bağlantı (isteğe bağlı)<input className="rt-inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, PDF…" /></label>
      <div className="rt-alan" style={{ marginTop: 10 }}>Dersler
        {k.secim.map((kod) => (
          <div key={kod} className="rt-ders-sec">
            <b>{sinavAdi(kod, k)}</b>
            <div className="rt-chips">
              {(agaclar.get(kod) ?? []).filter((d) => !d.gizli).map((d) => (
                <button key={d.id} type="button" className={`rt-chip${dersler.includes(d.id) ? ' on' : ''}`} onClick={() => degistir(d.id)}>{d.ad}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label className="rt-alan" style={{ marginTop: 10 }}>Not<input className="rt-inp" value={not} onChange={(e) => setNot(e.target.value)} /></label>
      {sil && <OnayKutusu metin="Kaynak silinir." evet="Sil" onVazgec={() => setSil(false)} onEvet={async () => { await kaynakSil(kaynak!.id); onKapat(); }} />}
      <div className="rt-satir" style={{ marginTop: 12 }}>
        {kaynak && !sil && <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => { await kaynakKaydet({ id: kaynak?.id, ad, tur, dersler, url, not }); onKapat(); }}>Kaydet</button>
      </div>
    </Modal>
  );
}

// ———————————————— görev kartları (P7) ————————————————

export interface GorevBaslangic {
  tur?: SinavGorevTur; sinav?: string; dersId?: string; konuIds?: string[];
  kaynakId?: string; sure?: number | null; hedef?: number | null; denemeTur?: string; denemeDersIds?: string[] | null;
}

/** Var olan kartın / adımın ekinden formu doldur (düzenleme). */
export function gorevBaslangic(ek: SinavEk, bloklar: Blok[]): GorevBaslangic {
  const z = bloklar.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  return {
    tur: ek.tur, sinav: ek.sinav ?? undefined, dersId: ek.ders?.id, konuIds: ek.konular.map((x) => x.id),
    kaynakId: ek.kaynak?.id, sure: z?.dakika ?? null, hedef: ek.hedef_soru ?? null,
    denemeTur: ek.deneme?.tur, denemeDersIds: ek.deneme ? ek.deneme.dersler.map((x) => x.id) : null,
  };
}

/** Kontrollü form: her değişiklikte taslağı (ya da eksikse null) bildirir. Ajanda, program adımı ve araç aynı formu kullanır. */
export function GorevFormu({ ilk, onChange }: { ilk?: GorevBaslangic; onChange: (t: GorevTaslak | null) => void }) {
  const k = useKurulum();
  const agaclar = useAgaclar(k);
  const kaynaklar = useCanli(() => db.kaynak.toArray(), [], [] as KaynakRow[]);
  const analiz = useCanli(() => sinavAnalizi(), [], null as SinavAnalizi | null);
  const [tur, setTur] = useState<SinavGorevTur>(ilk?.tur ?? 'calisma');
  const [sinav, setSinav] = useState<string>(ilk?.sinav ?? '');
  const [dersId, setDersId] = useState<string>(ilk?.dersId ?? '');
  const [konuIds, setKonuIds] = useState<string[]>(ilk?.konuIds ?? []);
  const [konuAra, setKonuAra] = useState('');
  const [kaynakId, setKaynakId] = useState(ilk?.kaynakId ?? '');
  const [sure, setSure] = useState(ilk?.sure ? String(ilk.sure) : '');
  const [hedef, setHedef] = useState(ilk?.hedef ? String(ilk.hedef) : '');
  const [denemeTur, setDenemeTur] = useState(ilk?.denemeTur ?? 'genel');
  const [denemeDersler, setDenemeDersler] = useState<string[] | null>(ilk?.denemeDersIds ?? null);
  const [not, setNot] = useState('');

  const secim = k && k !== YUKLENIYOR ? k.secim : [];
  const aktifSinav = secim.includes(sinav) ? sinav : secim[0] ?? '';
  const dersler = (agaclar.get(aktifSinav) ?? []).filter((d) => !d.gizli);
  const ders = dersler.find((d) => d.id === dersId) ?? null;
  const dersKaynaklari = kaynaklar.filter((x) => !ders || !x.dersler.length || x.dersler.includes(ders.id)).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const kaynak = kaynaklar.find((x) => x.id === kaynakId) ?? null;
  const tumKonular = ders ? ders.uniteler.filter((u) => !u.gizli).flatMap((u) => u.konular.filter((x) => !x.gizli).map((x) => ({ ...x, unite: u.ad }))) : [];
  const seciliDenemeDersleri = denemeDersler ?? (denemeTur === 'genel' ? dersler.map((d) => d.id) : []);
  const sinavAd = k && k !== YUKLENIYOR ? sinavAdi(aktifSinav, k) : '';

  const taslak = useMemo(() => gorevUret({
    tur, sinav: aktifSinav || null, sinavAd, ders: ders ? { id: ders.id, ad: ders.ad } : null,
    konular: tumKonular.filter((x) => konuIds.includes(x.id)).map((x) => ({ id: x.id, ad: x.ad })),
    kaynak: kaynak ? { id: kaynak.id, ad: kaynak.ad, url: kaynak.url } : null,
    sure_dk: Number(sure) || null, hedef_soru: Number(hedef) || null,
    deneme_tur: denemeTur, deneme_dersler: dersler.filter((d) => seciliDenemeDersleri.includes(d.id)).map((d) => ({ id: d.id, ad: d.ad })),
    not,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tur, aktifSinav, sinavAd, ders?.id, konuIds.join(), kaynak?.id, sure, hedef, denemeTur, seciliDenemeDersleri.join(), not, agaclar]);
  useEffect(() => { onChange(taslak); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taslak]);

  if (k === YUKLENIYOR) return null;
  if (!k) return <p className="rt-muted">Sınav hazırlığı paketi kurulu değil (Ayarlar &gt; Paketler).</p>;
  const q = konuAra.trim().toLocaleLowerCase('tr');
  const konuDegistir = (id: string) => setKonuIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="rt-gorev-form">
      <Chips secenekler={GOREV_TUR} deger={tur} onSec={(t) => { setTur(t); setDenemeDersler(null); }} />
      {tur !== 'seans' && secim.length > 1 && (
        <Chips secenekler={secim.map((s) => [s, sinavAdi(s, k)] as [string, string])} deger={aktifSinav} onSec={(s) => { setSinav(s); setDersId(''); setKonuIds([]); setDenemeDersler(null); }} />
      )}

      {(tur === 'calisma' || tur === 'soru' || tur === 'tekrar') && (
        <>
          <label className="rt-alan">Ders
            <select value={ders?.id ?? ''} onChange={(e) => { setDersId(e.target.value); setKonuIds([]); setKaynakId(''); }}>
              <option value="">— seç —</option>
              {dersler.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
            </select>
          </label>
          {ders && (
            <div className="rt-alan">Konular {konuIds.length > 0 && <span>({konuIds.length} seçili)</span>}
              {tumKonular.length > 12 && <input className="rt-inp" placeholder="Konu ara" value={konuAra} onChange={(e) => setKonuAra(e.target.value)} />}
              <div className="rt-konu-sec">
                {tumKonular.filter((x) => !q || x.ad.toLocaleLowerCase('tr').includes(q) || konuIds.includes(x.id)).map((x) => (
                  <label key={x.id} className="rt-onay">
                    <input type="checkbox" checked={konuIds.includes(x.id)} onChange={() => konuDegistir(x.id)} />
                    <span>{x.ad}{zayifMi(analiz?.konular.get(x.id)) && <span className="rt-rozet zayif">zayıf</span>} <span className="rt-muted">{x.unite}</span></span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="rt-alan">Kaynak (isteğe bağlı)
            <select value={kaynakId} onChange={(e) => setKaynakId(e.target.value)}>
              <option value="">—</option>
              {dersKaynaklari.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
            </select>
          </label>
          {tur === 'soru'
            ? <label className="rt-alan">Hedef soru sayısı<input className="rt-inp" inputMode="numeric" value={hedef} onChange={(e) => setHedef(e.target.value.replace(/\D/g, ''))} /></label>
            : <label className="rt-alan">Süre (dakika) — girilirse zamanlayıcıyla çalışılır<input className="rt-inp" inputMode="numeric" value={sure} onChange={(e) => setSure(e.target.value.replace(/\D/g, ''))} /></label>}
        </>
      )}

      {tur === 'deneme' && (
        <>
          <Chips secenekler={[['genel', `${sinavAd} denemesi`], ['tarama', 'Tarama'], ['kurum', 'Kurum denemesi']]} deger={denemeTur} onSec={(t) => { setDenemeTur(t); setDenemeDersler(null); }} />
          <div className="rt-alan">Dersler {denemeTur !== 'genel' && <span>— denemede olan dersleri seç</span>}
            <div className="rt-chips">
              {dersler.map((d) => (
                <button key={d.id} type="button" className={`rt-chip${seciliDenemeDersleri.includes(d.id) ? ' on' : ''}`}
                  onClick={() => setDenemeDersler(seciliDenemeDersleri.includes(d.id) ? seciliDenemeDersleri.filter((x) => x !== d.id) : [...seciliDenemeDersleri, d.id])}>{d.ad}</button>
              ))}
            </div>
          </div>
          <label className="rt-alan">Deneme seti (isteğe bağlı)
            <select value={kaynakId} onChange={(e) => setKaynakId(e.target.value)}>
              <option value="">—</option>
              {kaynaklar.filter((x) => x.tur === 'deneme').map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
            </select>
          </label>
          <p className="rt-muted">Net = doğru − yanlış / {yanlisBolen(aktifSinav)}. Sonuçları deneme günü karttan girersin.</p>
        </>
      )}

      {tur !== 'deneme' && <label className="rt-alan">Not (isteğe bağlı)<input className="rt-inp" value={not} onChange={(e) => setNot(e.target.value)} /></label>}
      {taslak && <p className="rt-muted">Kart: <b>{taslak.ad}</b></p>}
    </div>
  );
}

/** Araçtan (ya da konu penceresinden) doğrudan Ajanda'ya görev ekle. */
export function GorevEkleModal({ ilk, onKapat }: { ilk?: GorevBaslangic; onKapat: () => void }) {
  const [taslak, setTaslak] = useState<GorevTaslak | null>(null);
  const [tarih, setTarih] = useState(bugun());
  const [saat, setSaat] = useState('');
  return (
    <Modal baslik="Sınav görevi" onKapat={onKapat}>
      <GorevFormu ilk={ilk} onChange={setTaslak} />
      <div className="rt-satir" style={{ flexWrap: 'nowrap', marginTop: 8 }}>
        <label className="rt-alan">Gün<input className="rt-inp" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
        <label className="rt-alan">Saat<input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      </div>
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!taslak || !tarih} onClick={async () => { await gorevTeslim(taslak!, tarih, saat); onKapat(); }}>Ajanda&apos;ya ekle</button>
      </div>
    </Modal>
  );
}

export async function gorevTeslim(t: GorevTaslak, tarih: string, saat: string, bitis: string | null = tarih, gunler: number[] | null = null) {
  await teslimAl([{
    surum: PAKET_SURUM, id: crypto.randomUUID(), tip: t.tip, ad: t.ad, bloklar: t.bloklar,
    zamanlama: { baslangic: tarih, bitis, gunler, saatler: saat ? [saat] : [] },
    kaynak: { modul: 'ajanda', ref: null, etiket: null }, sahip: 'ben', izinler: TAM_IZIN, geri_bildirim: 'yok', ek: t.ek,
  }]);
}

/** Deneme sonucu girişi: ders başına doğru / yanlış, net anında hesaplanır. */
export function DenemeGir({ ek, ilk, onKaydet }: { ek: SinavEk; ilk: Record<string, unknown> | null; onKaydet: (d: Record<string, unknown>) => void }) {
  const dn = ek.deneme!;
  const [d, setD] = useState<Record<string, string>>(() => Object.fromEntries(dn.dersler.flatMap((x) => [`${x.id}.d`, `${x.id}.y`]).map((a) => [a, ilk?.[a] !== undefined ? String(ilk[a]) : ''])));
  const n = (a: string) => Number(d[a]) || 0;
  const toplam = dn.dersler.reduce((t, x) => t + netHesapla(n(`${x.id}.d`), n(`${x.id}.y`), dn.yanlis_bolen), 0);
  return (
    <div className="rt-deger">
      <table className="rt-deneme-tablo">
        <thead><tr><th>Ders</th><th>D</th><th>Y</th><th>Net</th></tr></thead>
        <tbody>
          {dn.dersler.map((x) => (
            <tr key={x.id}>
              <td>{x.ad}</td>
              {(['d', 'y'] as const).map((s) => (
                <td key={s}><input className="rt-inp" inputMode="numeric" value={d[`${x.id}.${s}`]} onChange={(e) => setD({ ...d, [`${x.id}.${s}`]: e.target.value.replace(/\D/g, '') })} /></td>
              ))}
              <td className="net">{netHesapla(n(`${x.id}.d`), n(`${x.id}.y`), dn.yanlis_bolen)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>Toplam</td><td>{dn.dersler.reduce((t, x) => t + n(`${x.id}.d`), 0)}</td><td>{dn.dersler.reduce((t, x) => t + n(`${x.id}.y`), 0)}</td><td className="net">{Math.round(toplam * 100) / 100}</td></tr></tfoot>
      </table>
      <button type="button" className="rt-btn primary" onClick={() => onKaydet(Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '').map(([a, v]) => [a, Number(v)])))}>Kaydet</button>
    </div>
  );
}

// ———————————————— denemeler (P9) ————————————————

function Denemeler({ k }: { k: PaketKurulumRow }) {
  const analiz = useCanli(() => sinavAnalizi(), [], null as SinavAnalizi | null);
  const [sinav, setSinav] = useState(k.secim[0] ?? '');
  const [ekle, setEkle] = useState(false);
  if (!analiz) return null;
  const liste = analiz.denemeler.filter((x) => x.sinav === sinav);
  const turler = Array.from(new Set(liste.map((x) => x.tur)));
  return (
    <div>
      {k.secim.length > 1 && <Chips secenekler={k.secim.map((s) => [s, sinavAdi(s, k)] as [string, string])} deger={sinav} onSec={setSinav} />}
      {liste.length === 0 && <p className="rt-muted" style={{ marginTop: 8 }}>Henüz sonucu girilmiş deneme yok. Bir Deneme görevi ekle; deneme günü karttan doğru/yanlışları gir.</p>}
      {turler.map((tur) => <DenemeSerisi key={tur} baslik={denemeTurAdi(tur, sinavAdi(sinav, k))} liste={liste.filter((x) => x.tur === tur)} />)}
      <ZayifKonular analiz={analiz} k={k} />
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={() => setEkle(true)}>＋ Deneme görevi</button>
      </div>
      {ekle && <GorevEkleModal ilk={{ tur: 'deneme', sinav }} onKapat={() => setEkle(false)} />}
    </div>
  );
}

export function DenemeSerisi({ baslik, liste }: { baslik: string; liste: DenemeSonuc[] }) {
  const son = liste[liste.length - 1];
  const onceki = liste.length > 1 ? liste[liste.length - 2] : null;
  const fark = onceki ? Math.round((son.net - onceki.net) * 100) / 100 : null;
  const dersler = son.dersler;
  return (
    <div className="rt-kap" style={{ marginTop: 10 }}>
      <div className="rt-kap-hd"><div className="rt-kap-bas">{baslik}</div><div className="rt-kap-ey"><span className="rt-muted">{liste.length} deneme</span></div></div>
      <div className="rt-kap-ic">
        <div className="rt-net-bas">
          <span className="rt-net-sayi">{son.net}</span>
          <span className="rt-muted">son net · {tarihEtiket(son.tarih)}{fark !== null && <> · <b className={fark >= 0 ? 'rt-artis' : 'rt-azalis'}>{fark >= 0 ? '▲' : '▼'} {Math.abs(fark)}</b> öncekine göre</>}</span>
        </div>
        {liste.length > 1 && <NetGrafigi liste={liste} />}
        <table className="rt-deneme-tablo ozet">
          <thead><tr><th>Ders</th><th>D</th><th>Y</th><th>Net</th>{onceki && <th>Fark</th>}</tr></thead>
          <tbody>
            {dersler.map((x) => {
              const o = onceki?.dersler.find((y) => y.id === x.id);
              const f = o ? Math.round((x.net - o.net) * 100) / 100 : null;
              return (
                <tr key={x.id}><td>{x.ad}</td><td>{x.d}</td><td>{x.y}</td><td className="net">{x.net}</td>
                  {onceki && <td className={f === null ? '' : f >= 0 ? 'rt-artis' : 'rt-azalis'}>{f === null ? '—' : `${f >= 0 ? '+' : ''}${f}`}</td>}</tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Toplam net — tek seri çizgi. Noktanın üstünde durunca tarih ve net görünür. */
function NetGrafigi({ liste }: { liste: DenemeSonuc[] }) {
  const G = 320, Y = 120, P = { l: 30, r: 10, t: 10, b: 20 };
  const netler = liste.map((x) => x.net);
  const enAz = Math.min(0, ...netler), enCok = Math.max(...netler, 1);
  const x = (i: number) => P.l + (liste.length === 1 ? 0 : (i * (G - P.l - P.r)) / (liste.length - 1));
  const y = (v: number) => P.t + (1 - (v - enAz) / (enCok - enAz)) * (Y - P.t - P.b);
  const cizgiler = [enAz, (enAz + enCok) / 2, enCok].map((v) => Math.round(v));
  return (
    <svg className="rt-net-grafik" viewBox={`0 0 ${G} ${Y}`} role="img" aria-label="Deneme netleri">
      {Array.from(new Set(cizgiler)).map((v) => (
        <g key={v}><line x1={P.l} x2={G - P.r} y1={y(v)} y2={y(v)} className="izgara" /><text x={P.l - 4} y={y(v) + 3} textAnchor="end">{v}</text></g>
      ))}
      <polyline points={liste.map((d, i) => `${x(i)},${y(d.net)}`).join(' ')} className="cizgi" />
      {liste.map((d, i) => (
        <g key={d.kartId + d.tarih}>
          <circle cx={x(i)} cy={y(d.net)} r={12} className="hedef"><title>{`${tarihEtiket(d.tarih)} — net ${d.net}`}</title></circle>
          <circle cx={x(i)} cy={y(d.net)} r={4} className="nokta" />
        </g>
      ))}
      <text x={P.l} y={Y - 4}>{tarihEtiket(liste[0].tarih).split(',')[0]}</text>
      <text x={G - P.r} y={Y - 4} textAnchor="end">{tarihEtiket(liste[liste.length - 1].tarih).split(',')[0]}</text>
    </svg>
  );
}

function ZayifKonular({ analiz, k }: { analiz: SinavAnalizi; k: PaketKurulumRow }) {
  const agaclar = useAgaclar(k);
  const [ekle, setEkle] = useState<GorevBaslangic | null>(null);
  const zayif: { sinav: string; ders: Ders; konu: Oge; oran: number; soru: number }[] = [];
  agaclar.forEach((ds, sinav) => ds.forEach((d) => d.uniteler.forEach((u) => u.konular.forEach((x) => {
    const s = analiz.konular.get(x.id);
    if (s && zayifMi(s)) zayif.push({ sinav, ders: d, konu: x, oran: dogrulukOrani(s)!, soru: soruSayisi(s) });
  }))));
  zayif.sort((a, b) => a.oran - b.oran);
  return (
    <div className="rt-kap" style={{ marginTop: 10 }}>
      <div className="rt-kap-hd"><div className="rt-kap-bas">Zayıf konular</div></div>
      <div className="rt-kap-ic">
        {zayif.length === 0
          ? <p className="rt-muted">En az {ZAYIF_ESIK.enAzSoru} soru çözülüp doğruluğu %{ZAYIF_ESIK.oran * 100}&apos;ın altında kalan konu yok.</p>
          : zayif.slice(0, 15).map((z) => (
            <div key={z.konu.id} className="rt-kaynak">
              <div className="rt-konu" style={{ cursor: 'default' }}><span>{z.konu.ad}</span><span className="rt-muted">{sinavAdi(z.sinav, k)} {z.ders.ad} · %{Math.round(z.oran * 100)} doğru · {z.soru} soru</span></div>
              <button type="button" className="rt-btn" onClick={() => setEkle({ tur: 'soru', sinav: z.sinav, dersId: z.ders.id, konuIds: [z.konu.id] })}>＋ Soru</button>
            </div>
          ))}
      </div>
      {ekle && <GorevEkleModal ilk={ekle} onKapat={() => setEkle(null)} />}
    </div>
  );
}

'use client';

// Sohbet (C1–C4) ve aile grubu (F1–F4) — 27 eylül. Motor: lib/danismanlik.ts.
// Yalnız koç–danışan ve aile arasında; paylaşımın tek yeri burası.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db, type AileRow, type AjandaKartRow, type IliskiRow, type KlasorRow, type MesajRow, type ProgramRow, type KonusmaOkunduRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { bugun, tarihEtiket } from '@/lib/paket';
import { kartPaketi, paketiAl, programPaketi, type PaylasimPaketi } from '@/lib/paylasim';
import { yol } from '@/lib/alan';
import {
  aileAktifMi, aileAyril, aileDavet, aileKur, aileYanit, benimAileRolum, disiplinAdi, konusmaAile, konusmaIliski,
  okunduIsaretle, sohbetGonder, useDanismanlik,
} from '@/lib/danismanlik';
import { Chips, Kap, Modal, OnayKutusu } from './ortak';
import { BekleyenDavetler } from './Paylasim';

// ———————————————— konuşmalar ————————————————

export interface Konusma { id: string; ad: string; alt: string; aktif: boolean }

function useKonusmalar(): Konusma[] {
  const d = useDanismanlik();
  const iliskiler = useCanli(() => db.iliski.toArray(), [], [] as IliskiRow[]);
  const aileler = useCanli(() => db.aile.toArray(), [], [] as AileRow[]);
  return useMemo(() => {
    const k: Konusma[] = [];
    for (const a of aileler.filter(aileAktifMi)) {
      const digerleri = a.uyeler.filter((u) => u.uye !== d.uid && u.durum === 'aktif').map((u) => u.ad);
      k.push({ id: konusmaAile(a.id), ad: `👪 ${a.ad}`, alt: digerleri.length ? digerleri.join(', ') : 'henüz yalnızsın', aktif: true });
    }
    for (const il of iliskiler) {
      const benKoc = il.koc === d.uid;
      k.push({ id: konusmaIliski(il.id), ad: `🤝 ${benKoc ? il.danisan_ad : il.koc_ad}`, alt: `${benKoc ? 'Danışanın' : 'Koçun'} · ${disiplinAdi(il.disiplin)}`, aktif: il.durum === 'aktif' });
    }
    return k;
  }, [iliskiler, aileler, d.uid]);
}

/** Okunmamış mesaj sayıları (konuşma başına) + bekleyen davet sayısı — Home ve sekme için. */
export function useSohbetOzeti(): { okunmamis: Record<string, number>; toplam: number; davet: number } {
  const d = useDanismanlik();
  const mesajlar = useCanli(() => db.mesaj.toArray(), [], [] as MesajRow[]);
  const okundu = useCanli(() => db.konusma_okundu.toArray(), [], [] as KonusmaOkunduRow[]);
  const aileDavetleri = useCanli(() => db.aile.toArray(), [], [] as AileRow[]).filter((a) => benimAileRolum(a)?.durum === 'davet').length;
  const kocDavetleri = useCanli(() => db.gelen.filter((g) => !g.alindi && (g.paket as { tur?: string }).tur === 'davet').count(), [], 0);
  const son = new Map(okundu.map((o) => [o.id, o.zaman]));
  const okunmamis: Record<string, number> = {};
  for (const m of mesajlar) if (m.gonderen !== d.uid && m.zaman > (son.get(m.konusma) ?? 0)) okunmamis[m.konusma] = (okunmamis[m.konusma] ?? 0) + 1;
  return { okunmamis, toplam: Object.values(okunmamis).reduce((t, n) => t + n, 0), davet: aileDavetleri + kocDavetleri };
}

export function SohbetEkrani() {
  const konusmalar = useKonusmalar();
  const ozet = useSohbetOzeti();
  const mesajlar = useCanli(() => db.mesaj.orderBy('zaman').reverse().toArray(), [], [] as MesajRow[]);
  const [acik, setAcik] = useState<string | null>(null);
  const k = konusmalar.find((x) => x.id === acik);
  if (k) return <KonusmaEkrani k={k} onGeri={() => setAcik(null)} />;
  const sonMesaj = (id: string) => mesajlar.find((m) => m.konusma === id);
  const aktifler = konusmalar.filter((x) => x.aktif).sort((a, b) => (sonMesaj(b.id)?.zaman ?? 0) - (sonMesaj(a.id)?.zaman ?? 0));
  const arsiv = konusmalar.filter((x) => !x.aktif);
  return (
    <div>
      <h4>💬 Sohbet</h4>
      <BekleyenDavetler />
      <AileDavetleri />
      {aktifler.length === 0 && (
        <p className="rt-muted">Koçunla, danışanlarınla ve ailenle burada yazışır, kart ve program paylaşırsın. Aile grubunu Ayarlar › Aile&apos;den kurabilirsin.</p>
      )}
      {aktifler.map((x) => {
        const s = sonMesaj(x.id);
        const n = ozet.okunmamis[x.id] ?? 0;
        return (
          <button key={x.id} type="button" className="rt-gelen" onClick={() => setAcik(x.id)}>
            <span className="tx">
              <span className="t">{x.ad}</span>
              <span className="s">{s ? `${s.tur === 'paylasim' ? '🗂 ' : ''}${s.metin || (s.paket as PaylasimPaketi | null)?.ad || ''}` : x.alt}</span>
            </span>
            {n > 0 && <span className="rt-okunmamis">{n}</span>}
          </button>
        );
      })}
      {arsiv.length > 0 && (
        <details className="rt-belgeler"><summary>Sonlanmış danışmanlıklar</summary>
          {arsiv.map((x) => <button key={x.id} type="button" className="rt-gelen alindi" onClick={() => setAcik(x.id)}><span className="tx"><span className="t">{x.ad}</span><span className="s">{x.alt}</span></span></button>)}
        </details>
      )}
    </div>
  );
}

function saat(ms: number) {
  const d = new Date(ms);
  const t = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const g = new Date(ms).toISOString().slice(0, 10);
  return g === bugun() ? t : `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${t}`;
}

function KonusmaEkrani({ k, onGeri }: { k: Konusma; onGeri: () => void }) {
  const d = useDanismanlik();
  const mesajlar = useCanli(() => db.mesaj.where('konusma').equals(k.id).sortBy('zaman'), [k.id], [] as MesajRow[]);
  const [metin, setMetin] = useState('');
  const [paylas, setPaylas] = useState(false);
  const [al, setAl] = useState<MesajRow | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const son = useRef<HTMLDivElement>(null);
  useEffect(() => { okunduIsaretle(k.id); son.current?.scrollIntoView({ block: 'end' }); }, [k.id, mesajlar.length]);
  const aile = k.id.startsWith('a:');
  const bekleyen = mesajlar.some((m) => m.gonderen === d.uid && m.durum === 'bekliyor' && Date.now() - m.zaman > 20_000);
  const gonder = async () => {
    if (!metin.trim()) return;
    setHata(null);
    try { await sohbetGonder(k.id, { metin: metin.trim() }); setMetin(''); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="rt-konusma">
      <div className="rt-konusma-bas">
        <button type="button" className="rt-geri" onClick={onGeri}>‹</button>
        <div><b>{k.ad}</b><div className="rt-muted">{k.alt}</div></div>
      </div>
      <div className="rt-mesajlar">
        {mesajlar.length === 0 && <p className="rt-muted">Henüz mesaj yok. Mesajlar uçtan uca şifreli; Ritos okuyamaz.</p>}
        {mesajlar.map((m) => {
          const ben = m.gonderen === d.uid;
          const p = m.paket as PaylasimPaketi | null;
          return (
            <div key={m.id} className={`rt-mesaj${ben ? ' ben' : ''}`}>
              {!ben && aile && <span className="rt-mesaj-kim">{m.gonderen_ad}</span>}
              {m.tur === 'paylasim' && p ? (
                <div className="rt-paylasim">
                  <span>{p.tur === 'program' ? '🌱 Program' : '🗂 Kart'}: <b>{p.ad}</b></span>
                  {p.tur === 'program' && p.program && <span className="rt-muted">{p.program.adimlar.length} adım</span>}
                  {!ben && (m.alindi ? <span className="rt-tamam">Alındı</span> : <button type="button" className="rt-btn primary" onClick={() => setAl(m)}>Al</button>)}
                </div>
              ) : <span className="rt-mesaj-metin">{m.metin}</span>}
              <span className="rt-mesaj-saat">{saat(m.zaman)}{ben && m.durum === 'bekliyor' ? ' · gönderiliyor' : ''}</span>
            </div>
          );
        })}
        <div ref={son} className="rt-mesaj-son" />
      </div>
      {k.aktif ? (
        <div className="rt-yaz">
          <button type="button" className="rt-ikon" aria-label="Kart ya da program paylaş" onClick={() => setPaylas(true)}>＋</button>
          <input className="rt-inp" placeholder="Mesaj" value={metin} onChange={(e) => setMetin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') gonder(); }} />
          <button type="button" className="rt-btn primary" disabled={!metin.trim()} onClick={gonder}>Gönder</button>
        </div>
      ) : <p className="rt-muted">Bu danışmanlık sonlandı; konuşma yalnız okunur.</p>}
      {bekleyen && <p className="rt-muted">{aile ? 'Bazı mesajların bekliyor: grubun şifre anahtarı yöneticinin cihazında hazırlanır; yönetici uygulamayı açınca gider.' : 'Bazı mesajların bekliyor; karşı taraf uygulamayı ilk kez açınca gider.'}</p>}
      {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      {paylas && <PaylasSec onKapat={() => setPaylas(false)} onSec={async (paket) => { await sohbetGonder(k.id, { paket }); setPaylas(false); }} />}
      {al && <AlModal m={al} onKapat={() => setAl(null)} />}
    </div>
  );
}

// ———————————————— paylaşım (C3) ————————————————

/** Konuşmadaki ＋: kendi kartlarımdan ya da programlarımdan birini seç. Koçun kartları paylaşılamaz. */
function PaylasSec({ onKapat, onSec }: { onKapat: () => void; onSec: (p: PaylasimPaketi) => Promise<void> }) {
  const [tur, setTur] = useState<'kart' | 'program'>('kart');
  const kartlar = useCanli(async () => {
    const hepsi = (await db.ajanda_kart.toArray()).filter((x) => x.geri_bildirim === 'yok' && x.sahip === 'ben');
    const tek = new Map<string, AjandaKartRow>();
    for (const x of hepsi.sort((a, b) => b.guncellendi - a.guncellendi)) if (!tek.has(x.ad)) tek.set(x.ad, x);
    return Array.from(tek.values());
  }, [], [] as AjandaKartRow[]);
  const programlar = useCanli(() => db.program.filter((p) => !p.uzak && !p.sablon).toArray(), [], [] as ProgramRow[]);
  return (
    <Modal baslik="Paylaş" onKapat={onKapat}>
      <Chips<'kart' | 'program'> secenekler={[['kart', 'Kart'], ['program', 'Program']]} deger={tur} onSec={setTur} />
      <p className="rt-muted">Yalnız tanım gider; işaretlerin ve girdiğin değerler gitmez.</p>
      <div className="rt-konular">
        {tur === 'kart' && (kartlar.length ? kartlar.map((x) => (
          <button key={x.id} type="button" className="rt-konu" onClick={() => onSec(kartPaketi(x))}><span>{x.ad}</span><span className="rt-muted">{x.bitis === x.baslangic ? tarihEtiket(x.baslangic) : 'tekrarlı'}</span></button>
        )) : <p className="rt-muted">Ajanda&apos;nda paylaşılabilir kart yok.</p>)}
        {tur === 'program' && (programlar.length ? programlar.map((p) => (
          <button key={p.id} type="button" className="rt-konu" onClick={async () => { const pk = await programPaketi(p.id); if (pk) await onSec(pk); }}><span>{p.ad}</span>{p.kimden && <span className="rt-muted">{p.kimden}</span>}</button>
        )) : <p className="rt-muted">Programın yok.</p>)}
      </div>
    </Modal>
  );
}

/** Kart ya da program ekranındaki "Paylaş": hangi konuşmaya? */
export function PaylasDugmesi({ paketUret }: { paketUret: () => Promise<PaylasimPaketi | null> | PaylasimPaketi }) {
  const [acik, setAcik] = useState(false);
  const konusmalar = useKonusmalar().filter((k) => k.aktif);
  const [mesaj, setMesaj] = useState<string | null>(null);
  if (!konusmalar.length) return null;
  return (
    <>
      <button type="button" className="rt-btn" onClick={() => { setMesaj(null); setAcik(true); }}>Paylaş</button>
      {acik && (
        <Modal baslik="Kime gönderilsin?" onKapat={() => setAcik(false)}>
          {mesaj ? <p className="rt-tamam">{mesaj}</p> : (
            <>
              <p className="rt-muted">Yalnız tanım gider; işaretlerin ve girdiğin değerler gitmez.</p>
              {konusmalar.map((k) => (
                <button key={k.id} type="button" className="rt-gelen" onClick={async () => { const p = await paketUret(); if (!p) return; await sohbetGonder(k.id, { paket: p }); setMesaj(`${k.ad.replace(/^\S+ /, '')} sohbetine gönderildi.`); }}>
                  <span className="tx"><span className="t">{k.ad}</span><span className="s">{k.alt}</span></span>
                </button>
              ))}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function AlModal({ m, onKapat }: { m: MesajRow; onKapat: () => void }) {
  const p = m.paket as PaylasimPaketi;
  const klasorler = useCanli(() => db.klasor.toArray(), [], [] as KlasorRow[]);
  const [tarih, setTarih] = useState(bugun());
  const [klasor, setKlasor] = useState('');
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const secenekler = klasorler.map((k) => ({ id: k.id, ad: yol(k.id, klasorler) })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return (
    <Modal baslik={p.ad} onKapat={onKapat}>
      <p className="rt-muted">{m.gonderen_ad} paylaştı · {p.tur === 'program' ? 'Program' : 'Kart'}</p>
      {p.tur === 'program' && p.program && (
        <>
          {p.program.amac && <p className="rt-metin"><b>Amaç:</b> {p.program.amac}</p>}
          <ul className="rt-maddeler">{p.program.adimlar.map((a, i) => <li key={i}>{a.ad}</li>)}</ul>
        </>
      )}
      {sonuc ? <p className="rt-tamam">{sonuc}</p> : (
        <>
          {p.tur === 'kart'
            ? <label className="rt-alan">Başlangıç günü<input className="rt-inp" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
            : secenekler.length > 0 && (
              <label className="rt-alan">Nereye
                <select value={klasor} onChange={(e) => setKlasor(e.target.value)}>
                  <option value="">Alansız</option>
                  {secenekler.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
                </select>
              </label>
            )}
          {hata && <p className="rt-hata">{hata}</p>}
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
            <button type="button" className="rt-btn primary" onClick={async () => {
              try { setSonuc(await paketiAl(p, m.gonderen_ad, { baslangic: tarih, klasor: klasor || null })); await db.mesaj.update(m.id, { alindi: Date.now() }); }
              catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
            }}>{p.tur === 'program' ? "Kişisel Gelişim'e al" : "Ajanda'ya al"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ———————————————— aile grubu (F1–F4) ————————————————

function AileDavetleri() {
  const aileler = useCanli(() => db.aile.toArray(), [], [] as AileRow[]).filter((a) => benimAileRolum(a)?.durum === 'davet');
  const [hata, setHata] = useState<string | null>(null);
  if (!aileler.length) return null;
  return (
    <div className="rt-davetler">
      {aileler.map((a) => {
        const kurucu = a.uyeler.find((u) => u.rol === 'yonetici')?.ad;
        return (
          <div key={a.id} className="rt-davet">
            <span>👪 {kurucu ? <><b>{kurucu}</b> seni </> : 'Seni '}<b>{a.ad}</b> aile grubuna çağırıyor</span>
            <span className="rt-satir" style={{ flexWrap: 'nowrap' }}>
              <button type="button" className="rt-btn" onClick={() => aileYanit(a.id, false).catch((e) => setHata(String(e.message ?? e)))}>Reddet</button>
              <button type="button" className="rt-btn primary" onClick={() => aileYanit(a.id, true).catch((e) => setHata(String(e.message ?? e)))}>Katıl</button>
            </span>
          </div>
        );
      })}
      {hata && <p className="rt-hata">{hata}</p>}
    </div>
  );
}

/** Ayarlar › Aile: kur, davet et (e-postayla, en fazla 3 kişi), çıkar, ayrıl. */
export function AileAyarlari() {
  const d = useDanismanlik();
  const aileler = useCanli(() => db.aile.toArray(), [], [] as AileRow[]);
  const aile = aileler.find(aileAktifMi);
  const [ad, setAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [cikar, setCikar] = useState<string | null>(null);
  if (!d.etkin) return null;
  const calistir = async (f: () => Promise<unknown>, tamam?: string) => {
    setHata(null); setMesaj(null);
    try { await f(); if (tamam) setMesaj(tamam); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
  };
  const ben = aile ? benimAileRolum(aile) : undefined;
  const aktifSay = aile ? aile.uyeler.filter((u) => u.durum !== 'ayrildi').length : 0;
  return (
    <Kap baslik="Aile">
      {!aile ? (
        <>
          <p className="rt-muted">Ailenle (en fazla 3 kişi) yazışır, birbirinize kart ve program gönderirsiniz. Kimse kimsenin Ajanda&apos;sını ya da programlarını görmez.</p>
          <div className="rt-satir" style={{ flexWrap: 'nowrap' }}>
            <input className="rt-inp" placeholder="Grup adı, ör. Öztürkmen ailesi" value={ad} onChange={(e) => setAd(e.target.value)} />
            <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={() => calistir(() => aileKur(ad.trim()), 'Grup kuruldu. Şimdi ailenden birini davet et.')}>Kur</button>
          </div>
        </>
      ) : (
        <>
          <p className="rt-metin"><b>👪 {aile.ad}</b></p>
          {aile.uyeler.filter((u) => u.durum !== 'ayrildi').map((u) => (
            <div key={u.uye} className="rt-kaynak">
              <div className="rt-konu" style={{ cursor: 'default' }}><span>{u.ad}{u.uye === d.uid ? ' (sen)' : ''}</span><span className="rt-muted">{u.rol === 'yonetici' ? 'yönetici' : u.durum === 'davet' ? 'davet bekliyor' : 'üye'}</span></div>
              {ben?.rol === 'yonetici' && u.uye !== d.uid && <button type="button" className="rt-btn" onClick={() => setCikar(u.uye)}>Çıkar</button>}
            </div>
          ))}
          {cikar && <OnayKutusu metin="Bu kişi gruptan çıkarılır; yeni mesajları göremez." evet="Çıkar" onVazgec={() => setCikar(null)} onEvet={() => { const u = cikar; setCikar(null); calistir(() => aileAyril(aile.id, u)); }} />}
          {ben?.rol === 'yonetici' && aktifSay < 3 && (
            <div className="rt-satir" style={{ flexWrap: 'nowrap', marginTop: 8 }}>
              <input className="rt-inp" type="email" placeholder="Davet için e-posta" value={eposta} onChange={(e) => setEposta(e.target.value)} />
              <button type="button" className="rt-btn primary" disabled={!/\S+@\S+\.\S+/.test(eposta)} onClick={() => calistir(async () => { const n = await aileDavet(aile.id, eposta.trim()); setEposta(''); setMesaj(`${n} davet edildi; Sohbet'inde görecek.`); })}>Davet et</button>
            </div>
          )}
          <div className="rt-satir" style={{ marginTop: 8 }}>
            <button type="button" className="rt-btn tehlike" onClick={() => calistir(() => aileAyril(aile.id))}>{ben?.rol === 'yonetici' ? 'Grubu dağıt' : 'Gruptan ayrıl'}</button>
          </div>
        </>
      )}
      {mesaj && <p className="rt-tamam">{mesaj}</p>}
      {hata && <p className="rt-hata">{hata}</p>}
    </Kap>
  );
}

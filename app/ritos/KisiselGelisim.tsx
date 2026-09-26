'use client';

import React, { useState } from 'react';
import { db, type AlanDegerlendirmeRow, type KlasorRow, type ProgramAdimRow, type ProgramRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { GUN_KISA, TIP_ETIKET, bugun, tarihEkle, type Blok, type TemelTip } from '@/lib/paket';
import { adimEkle, adimGuncelle, adimSil, aktifMi, baslat, durdur, ilerleme, programGuncelle, programOlustur, type ProgramIlerleme } from '@/lib/program';
import { DEGER_ETIKET, EN_FAZLA_SEVIYE, HAZIR_SETLER, alanEkle, alanMi, degerlendir, hazirSetKur, klasorEkle, klasorGuncelle, klasorSil, programTasi, seviye, sonDegerlendirmeler, yol } from '@/lib/alan';
import { Chips, Kap, Modal, OnayKutusu, degerMetni } from './ortak';
import { PaylasDugmesi } from './Paylasim';
import { programPaketi } from '@/lib/paylasim';

// Kişisel Gelişim: yaşam alanları → (klasörler) → Bireysel Programlar.
// Alanlar kullanıcının; kriterler ve öz değerlendirme alanda (26 eylül).
export default function KisiselGelisim() {
  const programlar = useCanli(() => db.program.toArray(), [], [] as ProgramRow[]);
  const klasorler = useCanli(() => db.klasor.toArray(), [], [] as KlasorRow[]);
  const degerler = useCanli(() => sonDegerlendirmeler(), [], {} as Record<string, AlanDegerlendirmeRow>);
  const [secili, setSecili] = useState<string | null>(null);
  const [basaDon, setBasaDon] = useState(false);
  const [modal, setModal] = useState<null | { tur: 'program'; yer: string | null } | { tur: 'alan' } | { tur: 'klasor'; k: KlasorRow } | { tur: 'yeniKlasor'; ust: KlasorRow }>(null);

  const p = programlar.find((x) => x.id === secili);
  if (p) return <ProgramDetay p={p} klasorler={klasorler} onGeri={() => setSecili(null)} />;

  const alanlar = klasorler.filter(alanMi).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0) || a.ad.localeCompare(b.ad, 'tr'));
  const alansiz = programlar.filter((x) => !x.klasor_id || !klasorler.some((k) => k.id === x.klasor_id));
  const ag: Agac = { programlar, klasorler, onProgram: setSecili, onKlasor: (k) => setModal({ tur: 'klasor', k }) };
  const programlarIn = (id: string) => icindekiProgramlar(ag, id);
  const altKlasorler = (id: string) => icindekiKlasorler(ag, id);

  return (
    <div>
      <Kap baslik="🌱 Kişisel Gelişim" eylemler={<>
        <button type="button" className="rt-btn" onClick={() => setModal({ tur: 'alan' })}>＋ Alan</button>
        <button type="button" className="rt-ikon" onClick={() => setModal({ tur: 'program', yer: null })} aria-label="Yeni program">＋</button>
      </>}>
        {alanlar.length === 0 ? (
          <div className="rt-bos-alan">
            <p className="rt-metin">Programlarını <b>yaşam alanlarına</b> göre düzenleyebilirsin. Her alanı kendi kriterlerinle değerlendirirsin; alanların birlikte görünümü dengeni gösterir.</p>
            <p className="rt-muted">Hazır bir setle başla ya da kendi alanlarını ekle:</p>
            <div className="rt-satir">
              {HAZIR_SETLER.map((s) => <button key={s.ad} type="button" className="rt-btn" title={s.aciklama} onClick={() => hazirSetKur(s)}>{s.ad}</button>)}
              <button type="button" className="rt-btn" onClick={() => setModal({ tur: 'alan' })}>Kendi alanım</button>
            </div>
          </div>
        ) : (
          <>
            <p className="rt-muted">Bir alanın ⋯ düğmesiyle kendini değerlendirebilir, klasör ekleyebilir ya da alanı silebilirsin.</p>
            {!basaDon
              ? <button type="button" className="rt-linkbtn" onClick={() => setBasaDon(true)}>Alanları kaldırıp baştan başla</button>
              : (
                <div className="rt-onay-kutu">
                  <span>Tüm yaşam alanları, klasörler ve alan değerlendirmeleri silinir. Programların silinmez, Alansız&apos;a taşınır.</span>
                  <div className="rt-satir">
                    <button type="button" className="rt-btn" onClick={() => setBasaDon(false)}>Vazgeç</button>
                    <button type="button" className="rt-btn tehlike" onClick={async () => { for (const a of alanlar) await klasorSil(a.id); setBasaDon(false); }}>Hepsini kaldır</button>
                  </div>
                </div>
              )}
          </>
        )}
      </Kap>

      {alanlar.map((a) => (
        <Kap key={a.id}
          baslik={<button type="button" className="rt-alan-bas" onClick={() => setModal({ tur: 'klasor', k: a })}>
            {a.ad} {degerler[a.id] ? <Pil deger={degerler[a.id].deger} /> : <span className="rt-muted">· değerlendirilmedi</span>}
          </button>}
          eylemler={<>
            <button type="button" className="rt-ikon" onClick={() => setModal({ tur: 'klasor', k: a })} aria-label={`${a.ad} alanı seçenekleri`}>⋯</button>
            <button type="button" className="rt-ikon" onClick={() => setModal({ tur: 'program', yer: a.id })} aria-label={`${a.ad} alanına program ekle`}>＋</button>
          </>}>
          {altKlasorler(a.id).map((k) => <KlasorDugumu key={k.id} k={k} ag={ag} />)}
          {programlarIn(a.id).map((x) => <ProgramSatiri key={x.id} x={x} ag={ag} />)}
          {!altKlasorler(a.id).length && !programlarIn(a.id).length && <p className="rt-muted">Henüz program yok.</p>}
        </Kap>
      ))}

      {alansiz.length > 0 && (
        <Kap baslik={<span className="rt-muted">Alansız</span>}>
          {alansiz.map((x) => <ProgramSatiri key={x.id} x={x} ag={ag} />)}
        </Kap>
      )}

      {modal?.tur === 'program' && <YeniProgram yer={modal.yer} klasorler={klasorler} onKapat={() => setModal(null)} onOlustu={(id) => { setModal(null); setSecili(id); }} />}
      {modal?.tur === 'alan' && <AlanFormu onKapat={() => setModal(null)} />}
      {modal?.tur === 'klasor' && <KlasorDetay k={modal.k} klasorler={klasorler} deger={degerler[modal.k.id]} onKapat={() => setModal(null)} onAltKlasor={() => setModal({ tur: 'yeniKlasor', ust: modal.k })} />}
      {modal?.tur === 'yeniKlasor' && <KlasorFormu ust={modal.ust} onKapat={() => setModal(null)} />}
    </div>
  );
}

interface Agac { programlar: ProgramRow[]; klasorler: KlasorRow[]; onProgram: (id: string) => void; onKlasor: (k: KlasorRow) => void }
const icindekiProgramlar = (ag: Agac, id: string) => ag.programlar.filter((x) => x.klasor_id === id).sort((a, b) => Number(aktifMi(b)) - Number(aktifMi(a)) || a.ad.localeCompare(b.ad, 'tr'));
const icindekiKlasorler = (ag: Agac, id: string) => ag.klasorler.filter((k) => k.ust_id === id).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0));

function ProgramSatiri({ x, ag }: { x: ProgramRow; ag: Agac }) {
  return (
    <button type="button" className="rt-prog" onClick={() => ag.onProgram(x.id)}>
      <span className="t">{x.ad}</span>
      <span className="m">{aktifMi(x) ? <span className="rt-aktif">aktif</span> : 'aktif değil'}</span>
    </button>
  );
}

function KlasorDugumu({ k, ag }: { k: KlasorRow; ag: Agac }) {
  const [acik, setAcik] = useState(true);
  const altlar = icindekiKlasorler(ag, k.id);
  const progs = icindekiProgramlar(ag, k.id);
  return (
    <div className="rt-klasor">
      <div className="rt-klasor-bas">
        <button type="button" className="rt-klasor-ad" onClick={() => setAcik(!acik)}>{acik ? '▾' : '▸'} 📁 {k.ad} <span className="rt-muted">{altlar.length + progs.length}</span></button>
        <button type="button" className="rt-ikon" aria-label="Klasör seçenekleri" onClick={() => ag.onKlasor(k)}>⋯</button>
      </div>
      {acik && (
        <div className="rt-klasor-ic">
          {altlar.map((a) => <KlasorDugumu key={a.id} k={a} ag={ag} />)}
          {progs.map((x) => <ProgramSatiri key={x.id} x={x} ag={ag} />)}
          {!altlar.length && !progs.length && <p className="rt-muted">Boş klasör.</p>}
        </div>
      )}
    </div>
  );
}

function Pil({ deger }: { deger: number }) {
  return <span className="rt-pil" aria-label={`Değerlendirme ${deger}/4`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= deger ? 'on' : ''} />)}</span>;
}

/** Programın yeri: alanlar ve klasörler, tam yoluyla. */
function YerSecici({ deger, klasorler, onSec }: { deger: string | null; klasorler: KlasorRow[]; onSec: (id: string | null) => void }) {
  const secenekler = klasorler.map((k) => ({ id: k.id, ad: yol(k.id, klasorler) })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  return (
    <label className="rt-alan">
      <span>Yeri</span>
      <select value={deger ?? ''} onChange={(e) => onSec(e.target.value || null)}>
        <option value="">Alansız</option>
        {secenekler.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
      </select>
    </label>
  );
}

function YeniProgram({ yer, klasorler, onKapat, onOlustu }: { yer: string | null; klasorler: KlasorRow[]; onKapat: () => void; onOlustu: (id: string) => void }) {
  const [ad, setAd] = useState('');
  const [amac, setAmac] = useState('');
  const [klasor, setKlasor] = useState<string | null>(yer);
  return (
    <Modal baslik="Yeni Bireysel Program" onKapat={onKapat}>
      <input className="rt-inp" placeholder="Ad (örn. Sabah Rutinim)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      <textarea className="rt-inp" placeholder="Amaç (isteğe bağlı)" rows={3} value={amac} onChange={(e) => setAmac(e.target.value)} />
      {klasorler.length > 0 && <YerSecici deger={klasor} klasorler={klasorler} onSec={setKlasor} />}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => {
        const id = await programOlustur(ad.trim(), amac.trim());
        if (klasor) await programTasi(id, klasor);
        onOlustu(id);
      }}>Oluştur</button>
    </Modal>
  );
}

function AlanFormu({ onKapat }: { onKapat: () => void }) {
  const [ad, setAd] = useState('');
  const [kriterler, setKriterler] = useState('');
  return (
    <Modal baslik="Yaşam alanı ekle" onKapat={onKapat}>
      <input className="rt-inp" placeholder="Ad (örn. İlişkiler, Beden, Anlam)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      <textarea className="rt-inp" rows={3} placeholder="Kendini neye göre değerlendireceksin? (her satır bir kriter, isteğe bağlı)" value={kriterler} onChange={(e) => setKriterler(e.target.value)} />
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => {
        await alanEkle(ad.trim(), kriterler.split('\n').map((s) => s.trim()).filter(Boolean));
        onKapat();
      }}>Ekle</button>
    </Modal>
  );
}

function KlasorFormu({ ust, onKapat }: { ust: KlasorRow; onKapat: () => void }) {
  const [ad, setAd] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik={`${ust.ad} içine klasör`} onKapat={onKapat}>
      <input className="rt-inp" placeholder="Klasör adı (örn. Akdeniz tipi beslenme)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      {hata && <p className="rt-hata">{hata}</p>}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => {
        try { await klasorEkle(ad.trim(), ust.id); onKapat(); } catch (e) { setHata((e as Error).message); }
      }}>Ekle</button>
    </Modal>
  );
}

/** Alan ya da klasör detayı: ad, (alansa) kriterler ve öz değerlendirme, alt klasör, silme. */
function KlasorDetay({ k, klasorler, deger, onKapat, onAltKlasor }: { k: KlasorRow; klasorler: KlasorRow[]; deger?: AlanDegerlendirmeRow; onKapat: () => void; onAltKlasor: () => void }) {
  const alan = alanMi(k);
  const [ad, setAd] = useState(k.ad);
  const [kriterler, setKriterler] = useState((k.kriterler ?? []).join('\n'));
  const altEklenebilir = seviye(k, klasorler) < EN_FAZLA_SEVIYE;
  const [silSor, setSilSor] = useState(false);
  const kaydet = async () => {
    const patch: Partial<KlasorRow> = {};
    if (ad.trim() && ad.trim() !== k.ad) patch.ad = ad.trim();
    if (alan) {
      const yeni = kriterler.split('\n').map((s) => s.trim()).filter(Boolean);
      if (yeni.join('\n') !== (k.kriterler ?? []).join('\n')) patch.kriterler = yeni;
    }
    if (Object.keys(patch).length) await klasorGuncelle(k.id, patch);
  };
  return (
    <Modal baslik={alan ? 'Yaşam alanı' : 'Klasör'} onKapat={async () => { await kaydet(); onKapat(); }}>
      <input className="rt-inp" value={ad} onChange={(e) => setAd(e.target.value)} onBlur={kaydet} />
      {alan && (
        <>
          <label className="rt-alan"><span>Kriterler (her satır bir kriter)</span>
            <textarea className="rt-inp" rows={3} value={kriterler} onChange={(e) => setKriterler(e.target.value)} onBlur={kaydet} />
          </label>
          <span className="rt-muted">Kriterlere bakarak bu alanda kendini bugün nasıl görüyorsun?</span>
          <div className="rt-chips">
            {DEGER_ETIKET.map((e, v) => (
              <button key={v} type="button" className={`rt-chip${deger?.deger === v ? ' on' : ''}`} onClick={() => degerlendir(k.id, v)}>{e}</button>
            ))}
          </div>
          {deger && <span className="rt-muted">Son değerlendirme: {new Date(deger.zaman).toLocaleDateString('tr-TR')}</span>}
        </>
      )}
      {!silSor ? (
        <div className="rt-satir">
          {altEklenebilir && <button type="button" className="rt-btn" onClick={async () => { await kaydet(); onAltKlasor(); }}>＋ Klasör</button>}
          <button type="button" className="rt-btn tehlike" onClick={() => setSilSor(true)}>{alan ? 'Alanı sil' : 'Klasörü sil'}</button>
        </div>
      ) : (
        <OnayKutusu metin={alan ? `"${k.ad}" alanı silinsin mi? İçindeki programlar Alansız'a taşınır, silinmez.` : `"${k.ad}" klasörü silinsin mi? İçindekiler bir üste taşınır.`}
          evet="Sil" onVazgec={() => setSilSor(false)} onEvet={async () => { await klasorSil(k.id); onKapat(); }} />
      )}
    </Modal>
  );
}

function ProgramDetay({ p, klasorler, onGeri }: { p: ProgramRow; klasorler: KlasorRow[]; onGeri: () => void }) {

  const il = useCanli(() => ilerleme(p.id), [p.id], null as ProgramIlerleme | null);
  const [adimAcik, setAdimAcik] = useState(false);
  const [duzenle, setDuzenle] = useState<ProgramAdimRow | null>(null);
  const [durdurSor, setDurdurSor] = useState(false);
  const aktif = aktifMi(p);
  const yansir = aktif && p.calisma_bitis !== bugun();

  return (
    <div>
      <button type="button" className="rt-geri" onClick={onGeri}>‹ Kişisel Gelişim</button>
      <Kap
        baslik={<>{p.ad} {aktif ? <span className="rt-aktif">aktif</span> : <span className="rt-muted"> · aktif değil</span>}</>}
        eylemler={<>
          {!!il?.adimlar.length && <PaylasDugmesi paketUret={() => programPaketi(p.id)} />}
          {aktif && p.calisma_bitis === bugun()
          ? <span className="rt-muted">bugün son gün</span>
          : aktif
          ? <button type="button" className="rt-btn" onClick={() => setDurdurSor(true)}>Durdur</button>
          : <button type="button" className="rt-btn primary" disabled={!il?.adimlar.length} onClick={() => baslat(p.id)}>Başlat</button>}
        </>}
      >
        {durdurSor && <OnayKutusu metin="Program durdurulsun mu? Geçmiş kayıtlar korunur; bugün son gün olur." evet="Durdur" onVazgec={() => setDurdurSor(false)} onEvet={async () => { await durdur(p.id); setDurdurSor(false); }} />}
        {aktif && il?.gunN != null && <p className="rt-gun">Gün {il.gunN}{il.gunM ? `/${il.gunM}` : ' · süregelen'}</p>}

        <Alan etiket="Amaç" deger={p.amac} onKaydet={(v) => programGuncelle(p.id, { amac: v })} />
        <Alan etiket="Dikkat edilecekler" deger={p.dikkat} onKaydet={(v) => programGuncelle(p.id, { dikkat: v })} />
        <Alan etiket="Kriterler (her satır bir kriter)" deger={p.kriterler.join('\n')} onKaydet={(v) => programGuncelle(p.id, { kriterler: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        <Alan etiket="Hedef (isteğe bağlı)" deger={p.hedef} onKaydet={(v) => programGuncelle(p.id, { hedef: v })} />

        {klasorler.length > 0 && <YerSecici deger={p.klasor_id} klasorler={klasorler} onSec={(id) => programTasi(p.id, id)} />}
      </Kap>

      <Kap baslik="Görev planı" eylemler={<button type="button" className="rt-ikon" onClick={() => setAdimAcik(true)} aria-label="Adım ekle">＋</button>}>
        {!il?.adimlar.length && <p className="rt-muted">Görev planı yok. İstersen ＋ ile Ajanda&apos;ya düşecek adımlar ekle.</p>}
        {il?.adimlar.map(({ adim, planli, yapildi, sonDegerler }) => (
          <div key={adim.id} className="rt-adim">
            <div className="t">{adim.ad} <span className="rt-muted">· {TIP_ETIKET[adim.tip]}</span></div>
            <div className="m">
              {adim.basla_gun > 0 ? `${adim.basla_gun + 1}. günden` : 'ilk günden'} · {adim.sure_gun ? `${adim.sure_gun} gün` : 'süregelen'}
              {adim.gunler?.length ? ` · ${GUN_KISA.filter(([g]) => adim.gunler!.includes(g)).map(([, e]) => e).join(' ')}` : ''}
            </div>
            {p.calisma_baslangic && adim.tip !== 'oku' && (
              <div className="rt-ilerle">
                <span className="bar"><i style={{ width: planli ? `${(yapildi / planli) * 100}%` : 0 }} /></span>
                {yapildi}/{planli} gün
                {sonDegerler && <span className="rt-muted"> · son: {degerMetni(sonDegerler)}</span>}
              </div>
            )}
            <span className="rt-mini">
              <button type="button" onClick={() => setDuzenle(adim)}>düzenle</button>
              {!aktif && <button type="button" onClick={() => adimSil(adim.id)}>kaldır</button>}
            </span>
          </div>
        ))}
      </Kap>

      {adimAcik && <AdimForm programId={p.id} yansir={yansir} onKapat={() => setAdimAcik(false)} />}
      {duzenle && <AdimForm programId={p.id} adim={duzenle} yansir={yansir} onKapat={() => setDuzenle(null)} />}
    </div>
  );
}

function Alan({ etiket, deger, onKaydet }: { etiket: string; deger: string; onKaydet: (v: string) => void }) {
  const [v, setV] = useState(deger);
  return (
    <label className="rt-alan">
      <span>{etiket}</span>
      <textarea className="rt-inp" rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== deger && onKaydet(v)} />
    </label>
  );
}

function AdimForm({ programId, adim, yansir, onKapat }: { programId: string; adim?: ProgramAdimRow; yansir: boolean; onKapat: () => void }) {
  const metin0 = adim?.bloklar.find((b): b is Extract<Blok, { tur: 'metin' }> => b.tur === 'metin')?.metin ?? '';
  const sayi0 = adim?.bloklar.find((b): b is Extract<Blok, { tur: 'sayi' }> => b.tur === 'sayi');
  const zaman0 = adim?.bloklar.find((b): b is Extract<Blok, { tur: 'zamanlayici' }> => b.tur === 'zamanlayici');
  const [tip, setTip] = useState<TemelTip>(adim?.tip ?? 'yap');
  const [ad, setAd] = useState(adim?.ad ?? '');
  const [metin, setMetin] = useState(metin0);
  const [etiket, setEtiket] = useState(sayi0?.etiket ?? '');
  const [birim, setBirim] = useState(sayi0?.birim ?? '');
  const [dakika, setDakika] = useState(zaman0 ? String(zaman0.dakika) : '');
  const [basla, setBasla] = useState(String((adim?.basla_gun ?? 0) + 1));
  const [sure, setSure] = useState(adim?.sure_gun ? String(adim.sure_gun) : '');
  const [gunler, setGunler] = useState<number[]>(adim?.gunler ?? []);
  const [saat, setSaat] = useState(adim?.saatler[0] ?? '');
  const [etkin, setEtkin] = useState<'bugun' | 'yarin'>('bugun');

  async function kaydet() {
    const bloklar: Blok[] = [];
    if (metin.trim()) bloklar.push({ tur: 'metin', metin: metin.trim() });
    if (tip === 'kaydet') bloklar.push({ tur: 'sayi', anahtar: 'deger', etiket: etiket.trim() || 'Değer', ...(birim.trim() ? { birim: birim.trim() } : {}) });
    if (tip === 'uygula' && Number(dakika) > 0) bloklar.push({ tur: 'zamanlayici', dakika: Number(dakika) });
    const veri = {
      tip,
      ad: ad.trim(),
      bloklar,
      basla_gun: Math.max(0, (Number(basla) || 1) - 1),
      sure_gun: sure ? Number(sure) : null,
      gunler: gunler.length ? gunler : null,
      saatler: saat ? [saat] : [],
    };
    if (adim) await adimGuncelle(adim.id, veri, etkin === 'bugun' ? bugun() : tarihEkle(bugun(), 1));
    else await adimEkle(programId, veri);
    onKapat();
  }

  return (
    <Modal baslik={adim ? 'Adımı düzenle' : 'Adım ekle'} onKapat={onKapat}>
      <Chips<TemelTip> secenekler={[['yap', 'Yap'], ['oku', 'Oku'], ['kaydet', 'Kaydet'], ['uygula', 'Uygula']]} deger={tip} onSec={setTip} />
      <input className="rt-inp" placeholder="Ad (örn. Sabah 10 dk yürüyüş)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      <textarea className="rt-inp" placeholder={tip === 'oku' ? 'Metin' : 'Açıklama (isteğe bağlı)'} rows={2} value={metin} onChange={(e) => setMetin(e.target.value)} />
      {tip === 'kaydet' && (
        <div className="rt-satir">
          <input className="rt-inp" placeholder="Ne kaydedilecek (örn. Uyku)" value={etiket} onChange={(e) => setEtiket(e.target.value)} />
          <input className="rt-inp" placeholder="Birim (örn. saat)" value={birim} onChange={(e) => setBirim(e.target.value)} />
        </div>
      )}
      {tip === 'uygula' && (
        <input className="rt-inp" inputMode="numeric" placeholder="Süre (dakika) — boş = serbest süre" value={dakika} onChange={(e) => setDakika(e.target.value.replace(/\D/g, ''))} />
      )}
      <div className="rt-satir">
        <label className="rt-alan"><span>Kaçıncı günden</span><input className="rt-inp" inputMode="numeric" value={basla} onChange={(e) => setBasla(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="rt-alan"><span>Süre (gün) — boş = süregelen</span><input className="rt-inp" inputMode="numeric" value={sure} onChange={(e) => setSure(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <div className="rt-chips">
        {GUN_KISA.map(([g, e]) => (
          <button key={g} type="button" className={`rt-chip${gunler.includes(g) ? ' on' : ''}`} onClick={() => setGunler(gunler.includes(g) ? gunler.filter((x) => x !== g) : [...gunler, g])}>{e}</button>
        ))}
      </div>
      <label className="rt-alan"><span>Saat (isteğe bağlı)</span><input className="rt-inp" type="time" value={saat} onChange={(e) => setSaat(e.target.value)} /></label>
      {adim && yansir && (
        <>
          <span className="rt-muted">Program çalışıyor — değişiklik Ajanda&apos;ya:</span>
          <Chips<'bugun' | 'yarin'> secenekler={[['bugun', 'Bugünden itibaren'], ['yarin', 'Yarından itibaren']]} deger={etkin} onSec={setEtkin} />
        </>
      )}
      {!adim && yansir && <span className="rt-muted">Program çalışıyor — yeni adım bugünden itibaren Ajanda&apos;ya düşer.</span>}
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={kaydet}>{adim ? 'Kaydet' : 'Ekle'}</button>
      <p className="rt-muted" style={{ marginTop: 8 }}>Başlat&apos;a bastığın gün programın 1. günüdür.</p>
    </Modal>
  );
}

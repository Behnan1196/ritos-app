'use client';

import React, { useState } from 'react';
import { db, type ProgramAdimRow, type ProgramRow } from '@/lib/db';
import { useCanli } from '@/lib/canli';
import { GUN_KISA, TIP_ETIKET, bugun, tarihEkle, type Blok, type TemelTip } from '@/lib/paket';
import { adimEkle, adimGuncelle, adimSil, aktifMi, baslat, durdur, ilerleme, programGuncelle, programOlustur, type ProgramIlerleme } from '@/lib/program';
import { Chips, Kap, Modal, degerMetni } from './ortak';
import { PaylasDugmesi } from './Paylasim';
import { programPaketi } from '@/lib/paylasim';

// K1–K9 (ilk dilim): program listesi, oluşturma, çekirdek, değerlendirme, görev planı,
// başlatma, ilerleme (geri bildirimden), durdurma.
export default function KisiselGelisim() {
  const programlar = useCanli(() => db.program.toArray(), [], [] as ProgramRow[]);
  const [secili, setSecili] = useState<string | null>(null);
  const [yeniAcik, setYeniAcik] = useState(false);

  const p = programlar.find((x) => x.id === secili);
  if (p) return <ProgramDetay p={p} onGeri={() => setSecili(null)} />;

  const sirali = [...programlar].sort((a, b) => Number(aktifMi(b)) - Number(aktifMi(a)) || a.ad.localeCompare(b.ad, 'tr'));
  return (
    <div>
      <Kap baslik="🌱 Kişisel Gelişim" eylemler={<button type="button" className="rt-ikon" onClick={() => setYeniAcik(true)} aria-label="Yeni program">＋</button>}>
        {sirali.length === 0 && <p className="rt-muted">Henüz program yok. ＋ ile ilk Bireysel Program&apos;ını oluştur.</p>}
        {sirali.map((x) => (
          <button key={x.id} type="button" className="rt-prog" onClick={() => setSecili(x.id)}>
            <span className="t">{x.ad}</span>
            <span className="m">
              {aktifMi(x) ? <span className="rt-aktif">aktif</span> : 'aktif değil'}
              {x.degerlendirme_acik && x.degerlendirme !== null && <> · <Pil deger={x.degerlendirme} /></>}
            </span>
          </button>
        ))}
      </Kap>
      {yeniAcik && <YeniProgram onKapat={() => setYeniAcik(false)} onOlustu={(id) => { setYeniAcik(false); setSecili(id); }} />}
    </div>
  );
}

function Pil({ deger }: { deger: number }) {
  return <span className="rt-pil" aria-label={`Değerlendirme ${deger}/4`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= deger ? 'on' : ''} />)}</span>;
}

function YeniProgram({ onKapat, onOlustu }: { onKapat: () => void; onOlustu: (id: string) => void }) {
  const [ad, setAd] = useState('');
  const [amac, setAmac] = useState('');
  return (
    <Modal baslik="Yeni Bireysel Program" onKapat={onKapat}>
      <input className="rt-inp" placeholder="Ad (örn. Sabah Rutinim)" value={ad} onChange={(e) => setAd(e.target.value)} autoFocus />
      <textarea className="rt-inp" placeholder="Amaç (isteğe bağlı)" rows={3} value={amac} onChange={(e) => setAmac(e.target.value)} />
      <button type="button" className="rt-btn primary" disabled={!ad.trim()} onClick={async () => onOlustu(await programOlustur(ad.trim(), amac.trim()))}>Oluştur</button>
    </Modal>
  );
}

function ProgramDetay({ p, onGeri }: { p: ProgramRow; onGeri: () => void }) {
  const il = useCanli(() => ilerleme(p.id), [p.id], null as ProgramIlerleme | null);
  const [adimAcik, setAdimAcik] = useState(false);
  const [duzenle, setDuzenle] = useState<ProgramAdimRow | null>(null);
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
          ? <button type="button" className="rt-btn" onClick={() => { if (confirm('Program durdurulsun mu? Geçmiş kayıtlar korunur.')) durdur(p.id); }}>Durdur</button>
          : <button type="button" className="rt-btn primary" disabled={!il?.adimlar.length} onClick={() => baslat(p.id)}>Başlat</button>}
        </>}
      >
        {aktif && il?.gunN != null && <p className="rt-gun">Gün {il.gunN}{il.gunM ? `/${il.gunM}` : ' · süregelen'}</p>}

        <Alan etiket="Amaç" deger={p.amac} onKaydet={(v) => programGuncelle(p.id, { amac: v })} />
        <Alan etiket="Dikkat edilecekler" deger={p.dikkat} onKaydet={(v) => programGuncelle(p.id, { dikkat: v })} />
        <Alan etiket="Kriterler (her satır bir kriter)" deger={p.kriterler.join('\n')} onKaydet={(v) => programGuncelle(p.id, { kriterler: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        <Alan etiket="Hedef (isteğe bağlı)" deger={p.hedef} onKaydet={(v) => programGuncelle(p.id, { hedef: v })} />

        <label className="rt-tog"><input type="checkbox" checked={p.degerlendirme_acik} onChange={(e) => programGuncelle(p.id, { degerlendirme_acik: e.target.checked })} /> Kendini değerlendir</label>
        {p.degerlendirme_acik && (
          <div className="rt-chips">
            {[0, 1, 2, 3, 4].map((v) => (
              <button key={v} type="button" className={`rt-chip${p.degerlendirme === v ? ' on' : ''}`} onClick={() => programGuncelle(p.id, { degerlendirme: v })}>{['Berbat', 'Zayıf', 'Orta', 'İyi', 'Çok iyi'][v]}</button>
            ))}
          </div>
        )}
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

'use client';

// ————————————————————————————————————————————————————————————————
// Danışmanlık — tek kapı (28 eylül, V1 sadelik).
//  • Home'da bir satır: her danışmanlık alanı bir widget ("Beslenme danışmanlığı · 3 danışan"),
//    sonunda ＋ ile yeni alan eklenir. Koçluk ayrıca açılmaz; ilk alan eklenince açılmış olur.
//  • Widget açılınca danışmanlık ekranı: geniş ekranda sağ bölmede (solda seçili danışanın
//    Ajanda'sı), telefonda tam ekran. Burada danışan yönetimi: seçim, davet, bekleyen davetler,
//    sonlananlar. Danışana ait diğer bölümler (Özet, Ölçümler) şimdilik yer tutucu.
// ————————————————————————————————————————————————————————————————

import React, { useEffect, useState } from 'react';
import { DISIPLINLER, disiplinAdi, kocOl, useDanismanlik } from '@/lib/danismanlik';
import { useSeciliDanisan } from '@/lib/seciliDanisan';
import { Kap, Modal } from './ortak';
import { DanisanSatiri, Davetler, DavetModal, SonlandirModal, useDanisanlar } from './Danismanlik';
import { HaftaSablonlari } from './DanisanAjanda';

export const DISIPLIN_IKON: Record<string, string> = { beslenme: '🥗', sinav: '📚', genel: '🧭' };
const ikon = (d: string) => DISIPLIN_IKON[d] ?? '🤝';
const BASLIK: Record<string, string> = { beslenme: 'Beslenme danışmanlığı', sinav: 'Sınav koçluğu', genel: 'Yaşam koçluğu' };
export const danismanlikBaslik = (d: string) => BASLIK[d] ?? disiplinAdi(d);

/** Home satırı: mevcut danışmanlık alanları yan yana + ekle. */
export function DanismanlikSatiri({ onAc }: { onAc: (disiplin: string) => void }) {
  const d = useDanismanlik();
  const danisanlar = useDanisanlar().filter((x) => x.durum === 'aktif');
  const [ekle, setEkle] = useState(false);
  if (!d.etkin) return null;
  const alanlar = d.profil?.koc ? d.profil.disiplinler : [];
  return (
    <>
      <div className="rt-dan-satir">
        {alanlar.map((k) => {
          const n = danisanlar.filter((x) => x.disiplin === k).length;
          return (
            <button key={k} type="button" className="rt-dan-widget" onClick={() => onAc(k)}>
              <span className="ic">{ikon(k)}</span>
              <span className="t">{danismanlikBaslik(k)}</span>
              <span className="s">{n ? `${n} danışan` : 'Danışan davet et'}</span>
            </button>
          );
        })}
        <button type="button" className={`rt-dan-widget ekle${alanlar.length ? '' : ' tek'}`} onClick={() => setEkle(true)} aria-label="Danışmanlık ekle">
          <span className="ic">＋</span>
          {!alanlar.length && <span className="t">Danışmanlık</span>}
          {!alanlar.length && <span className="s">Danışanlarla çalışıyorsan</span>}
        </button>
      </div>
      {ekle && <AlanEkleModal onKapat={() => setEkle(false)} onEklendi={(k) => { setEkle(false); onAc(k); }} />}
    </>
  );
}

function AlanEkleModal({ onKapat, onEklendi }: { onKapat: () => void; onEklendi: (k: string) => void }) {
  const d = useDanismanlik();
  const mevcut = d.profil?.koc ? d.profil.disiplinler : [];
  const secenekler = DISIPLINLER.filter(([k]) => !mevcut.includes(k));
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Danışmanlık ekle" onKapat={onKapat}>
      <p className="rt-metin">Hangi alanda danışmanlık veriyorsun?</p>
      {secenekler.length === 0 && <p className="rt-muted">Tüm alanlar ekli.</p>}
      <div className="rt-dan-secim">
        {secenekler.map(([k]) => (
          <button key={k} type="button" className="rt-dan-widget" onClick={async () => {
            try { await kocOl([...mevcut, k]); onEklendi(k); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
          }}>
            <span className="ic">{ikon(k)}</span><span className="t">{danismanlikBaslik(k)}</span>
          </button>
        ))}
      </div>
      {!d.profil?.koc && <p className="rt-muted">Danışanlarını davet eder, Ajanda&apos;larına kart atar, uygulamalarını görürsün. Danışan ücret ödemez.</p>}
      {hata && <p className="rt-hata">{hata}</p>}
    </Modal>
  );
}

type AltSekme = 'plan' | 'ozet' | 'olcum';

export function DanismanlikEkrani({ disiplin, dar, onKapat, onAjanda, onSinavPaketi }: {
  disiplin: string; dar: boolean; onKapat: () => void; onAjanda: () => void; onSinavPaketi?: () => void;
}) {
  const d = useDanismanlik();
  const hepsi = useDanisanlar().filter((x) => x.disiplin === disiplin);
  const aktifler = hepsi.filter((x) => x.durum === 'aktif');
  const sonlananlar = hepsi.filter((x) => x.durum !== 'aktif');
  const [secili, setSecili] = useSeciliDanisan();
  const [davet, setDavet] = useState(false);
  const [sonlananAcik, setSonlananAcik] = useState(false);
  const [sekme, setSekme] = useState<AltSekme>('plan');
  const [bitir, setBitir] = useState(false);
  const [kaldir, setKaldir] = useState(false);
  const il = hepsi.find((x) => x.id === secili) ?? null;

  // Geniş ekranda ilk açılışta ilk danışan seçilir; soldaki Ajanda hemen onu gösterir.
  useEffect(() => {
    if (!dar && !il && aktifler.length) setSecili(aktifler[0].id);
  }, [dar, il, aktifler.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rt-dan-ekran">
      {!dar && (
        <div className="rt-dan-bas">
          <button type="button" className="rt-geri" onClick={onKapat}>‹ Home</button>
          <b>{ikon(disiplin)} {danismanlikBaslik(disiplin)}</b>
        </div>
      )}

      <Kap baslik={`Danışanlar${aktifler.length ? ` · ${aktifler.length}` : ''}`} eylemler={<button type="button" className="rt-btn primary" onClick={() => setDavet(true)}>＋ Davet et</button>}>
        {aktifler.length === 0 && <p className="rt-muted">Henüz danışanın yok. E-postasıyla davet et; davet onun Sohbet&apos;ine düşer, kabul edince burada görünür.</p>}
        <div className="rt-dan-liste">
          {aktifler.map((x) => <DanisanSatiri key={x.id} il={x} secili={x.id === secili} onAc={() => setSecili(x.id === secili && dar ? '' : x.id)} />)}
        </div>
        <Davetler disiplin={disiplin} />
        {sonlananlar.length > 0 && (
          <>
            <button type="button" className="rt-linkbtn" onClick={() => setSonlananAcik(!sonlananAcik)}>{sonlananAcik ? '▾' : '▸'} Sonlananlar ({sonlananlar.length})</button>
            {sonlananAcik && <div className="rt-dan-liste">{sonlananlar.map((x) => <DanisanSatiri key={x.id} il={x} secili={x.id === secili} onAc={() => setSecili(x.id)} />)}</div>}
          </>
        )}
      </Kap>

      {il && (
        <div className="rt-dan-dosya">
          <div className="rt-dan-kart">
            <span className="av">{il.danisan_ad.slice(0, 1).toLocaleUpperCase('tr')}</span>
            <span className="tx">
              <b>{il.danisan_ad}</b>
              <span className="rt-muted">{il.durum === 'aktif' ? `${new Date(il.olusturuldu).toLocaleDateString('tr-TR')}'den beri` : 'sonlandı'}</span>
            </span>
            {dar && il.durum === 'aktif' && <button type="button" className="rt-btn primary" onClick={onAjanda}>📅 Ajandası</button>}
          </div>
          <div className="rt-alt-sekme">
            {([['plan', 'Plan'], ['ozet', 'Özet'], ['olcum', 'Ölçümler']] as [AltSekme, string][]).map(([k, ad]) => (
              <button key={k} type="button" className={sekme === k ? 'on' : ''} onClick={() => setSekme(k)}>{ad}</button>
            ))}
          </div>
          <div className="rt-alt-ic">
            {sekme === 'plan' && (
              <p className="rt-muted">{dar ? '📅 Ajandası düğmesiyle danışanın haftasını açarsın' : '← Soldaki Ajanda artık danışanın haftasını gösteriyor'}: gün gün kart eklersin (öğün, ölçüm), günü değiştirmek için kartı sürüklersin.</p>
            )}
            {sekme === 'ozet' && <p className="rt-yer-tutucu">Yakında: hedefler, son hafta uyumu, son ölçümler ve notların tek bakışta.</p>}
            {sekme === 'olcum' && <p className="rt-yer-tutucu">Yakında: danışanın gönderdiği ölçümler seri ve grafik olarak.</p>}
          </div>
          {il.durum === 'aktif' && <button type="button" className="rt-linkbtn" onClick={() => setBitir(true)}>Danışmanlığı sonlandır</button>}
        </div>
      )}

      <details className="rt-dan-alt">
        <summary>Şablonlar</summary>
        <HaftaSablonlari disiplin={disiplin} />
      </details>
      {disiplin === 'sinav' && onSinavPaketi && (
        <button type="button" className="rt-btn" onClick={onSinavPaketi}>📚 Sınav paketi (katalog, kaynaklar)</button>
      )}
      {aktifler.length === 0 && (
        kaldir ? (
          <div className="rt-satir">
            <span className="rt-muted">Bu alan Home&apos;dan kalksın mı?</span>
            <button type="button" className="rt-btn" onClick={() => setKaldir(false)}>Vazgeç</button>
            <button type="button" className="rt-btn tehlike" onClick={async () => { await kocOl((d.profil?.disiplinler ?? []).filter((x) => x !== disiplin)); onKapat(); }}>Kaldır</button>
          </div>
        ) : <button type="button" className="rt-linkbtn" onClick={() => setKaldir(true)}>Bu danışmanlık alanını kaldır</button>
      )}

      {davet && <DavetModal sabitDisiplin={disiplin} onKapat={() => setDavet(false)} />}
      {bitir && il && <SonlandirModal il={il} onKapat={() => setBitir(false)} />}
    </div>
  );
}

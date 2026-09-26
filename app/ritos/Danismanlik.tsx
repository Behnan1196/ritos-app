'use client';

// Danışmanlık arayüzü (D1–D10, P10). Motor: lib/danismanlik.ts.

import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { db, type GelenRow, type IliskiRow, type KlasorRow, type ProgramRow } from '@/lib/db';
import type { Izinler } from '@/lib/paket';
import { useCanli } from '@/lib/canli';
import { useOturum } from '@/lib/hesap';
import { bugun, gunFarki, tarihEkle, tarihEtiket } from '@/lib/paket';
import { adimEkle, aktifMi, ilerleme } from '@/lib/program';
import {
  DISIPLINLER, KOC_DENEME_GUN, danisanIzinKaydet, danisanIzinleri, ePostaDaveti, davetBak, davetOlustur, davetSil, davetYanit, davetler, disiplinAdi, kendimeAl, kocDenemeKalan,
  kocKapat, kocOl, kocProgramiAl, kocProgramiReddet, programAta, programGonder, programiSil, sablonKaydet, sonlandir,
  useDanismanlik, type DavetSatir, type KocPaketi,
} from '@/lib/danismanlik';
import { ZAYIF_ESIK, danisanAnalizi, dogrulukOrani, soruSayisi, zayifMi, type GorevTaslak, type SinavAnalizi } from '@/lib/sinavGorev';
import { Chips, Kap, Modal, OnayKutusu } from './ortak';
import { DenemeSerisi, GorevFormu } from './Sinav';

export function useIliskiler(): IliskiRow[] {
  return useCanli(() => db.iliski.toArray(), [], [] as IliskiRow[]);
}

/** Koç olarak açtığım (bana danışan) ilişkiler. */
export function useDanisanlar(): IliskiRow[] {
  const d = useDanismanlik();
  const hepsi = useIliskiler();
  return hepsi.filter((x) => x.koc === d.uid).sort((a, b) => Number(a.durum !== 'aktif') - Number(b.durum !== 'aktif') || a.danisan_ad.localeCompare(b.danisan_ad, 'tr'));
}

function iliskiEtiket(il: IliskiRow) { return `${il.danisan_ad} · ${disiplinAdi(il.disiplin)}`; }

// ———————————————— Ayarlar > Danışmanlık (D1, D10) ————————————————

export function DanismanlikAyarlari() {
  const o = useOturum();
  const d = useDanismanlik();
  const hepsi = useIliskiler();
  const [kocModal, setKocModal] = useState(false);
  const [kapat, setKapat] = useState(false);
  const [bitir, setBitir] = useState<IliskiRow | null>(null);
  if (!o.hazir) return null;
  const koclarim = hepsi.filter((x) => x.danisan === d.uid);
  const danisanlar = hepsi.filter((x) => x.koc === d.uid);
  const kalan = kocDenemeKalan(d.profil);

  return (
    <Kap baslik="Danışmanlık">
      {!d.etkin ? (
        <p className="rt-muted">Koçla çalışmak ya da koç olmak için hesapla giriş yapman gerekir; programlar ve işaretler iki taraf arasında şifreli gider.</p>
      ) : (
        <>
          {d.profil?.koc ? (
            <>
              <p className="rt-metin"><b>Koç olarak çalışıyorsun</b> · {d.profil.disiplinler.map(disiplinAdi).join(', ') || 'disiplin seçilmedi'}</p>
              {kalan !== null && <p className="rt-muted">Deneme süresi: {kalan} gün kaldı ({KOC_DENEME_GUN} gün). Ödeme adımı henüz yok.</p>}
              {kapat ? (
                <OnayKutusu metin="Koç araçları kapanır. Danışanlarının programları kesilmez; ilişkiler sürer." evet="Kapat" onVazgec={() => setKapat(false)} onEvet={async () => { await kocKapat(); setKapat(false); }} />
              ) : (
                <div className="rt-satir">
                  <button type="button" className="rt-btn" onClick={() => setKocModal(true)}>Disiplinler</button>
                  <button type="button" className="rt-btn tehlike" onClick={() => setKapat(true)}>Koçluğu kapat</button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="rt-muted">Danışanlarla çalışıyorsan koçluğu aç: davet bağlantısıyla danışan eklersin, program atarsın, uygulamalarını görürsün. {KOC_DENEME_GUN} gün ücretsiz.</p>
              <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={() => setKocModal(true)}>Koç olarak çalış</button></div>
            </>
          )}

          {koclarim.length > 0 && (
            <div className="rt-iliski-liste">
              <b>Koçlarım</b>
              {koclarim.map((il) => (
                <div key={il.id} className="rt-kaynak">
                  <div className="rt-konu" style={{ cursor: 'default' }}><span>{il.koc_ad}</span><span className="rt-muted">{disiplinAdi(il.disiplin)}{il.durum === 'sonlandi' ? ' · sonlandı' : ''}</span></div>
                  {il.durum === 'aktif' && <button type="button" className="rt-btn" onClick={() => setBitir(il)}>Sonlandır</button>}
                </div>
              ))}
            </div>
          )}
          {danisanlar.length > 0 && <p className="rt-muted">{danisanlar.filter((x) => x.durum === 'aktif').length} aktif danışan — Home &gt; Danışmanlık&apos;tan yönetirsin.</p>}
          {d.hata && <p className="rt-hata">⚠ {d.hata}</p>}
        </>
      )}
      {kocModal && <KocModal onKapat={() => setKocModal(false)} />}
      {bitir && <SonlandirModal il={bitir} onKapat={() => setBitir(null)} />}
    </Kap>
  );
}

function KocModal({ onKapat }: { onKapat: () => void }) {
  const d = useDanismanlik();
  const [secim, setSecim] = useState<string[]>(d.profil?.disiplinler.length ? d.profil.disiplinler : ['sinav']);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Koç olarak çalış" onKapat={onKapat}>
      <p className="rt-metin">Hangi alanlarda danışmanlık veriyorsun?</p>
      <div className="rt-chips">
        {DISIPLINLER.map(([k, ad]) => (
          <button key={k} type="button" className={`rt-chip${secim.includes(k) ? ' on' : ''}`} onClick={() => setSecim((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}>{ad}</button>
        ))}
      </div>
      {!d.profil?.koc && <p className="rt-muted" style={{ marginTop: 10 }}>{KOC_DENEME_GUN} günlük deneme başlar; tüm alan paketleri ve koç araçları açık, danışan sınırı yok. Bitmeden önce uyarılırsın.</p>}
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir" style={{ marginTop: 12 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!secim.length} onClick={async () => {
          try { await kocOl(secim); onKapat(); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
        }}>{d.profil?.koc ? 'Kaydet' : 'Başlat'}</button>
      </div>
    </Modal>
  );
}

function SonlandirModal({ il, onKapat }: { il: IliskiRow; onKapat: () => void }) {
  const d = useDanismanlik();
  const benKoc = il.koc === d.uid;
  const [hata, setHata] = useState<string | null>(null);
  return (
    <Modal baslik="Danışmanlığı sonlandır" onKapat={onKapat}>
      <p className="rt-metin">{benKoc ? `${il.danisan_ad} ile` : `${il.koc_ad} ile`} {disiplinAdi(il.disiplin)} danışmanlığı sonlanır.</p>
      <ul className="rt-maddeler">
        {benKoc
          ? <><li>{il.danisan_ad} artık işaretlerini göndermez; programlarına güncelleme gitmez.</li><li>Dosyası &quot;sonlandı&quot; olarak arşivde kalır.</li></>
          : <><li>Programların Ajanda&apos;dan yarından itibaren kalkar; geçmiş kayıtların kalır.</li><li>İstersen programı kendine alıp sürdürebilirsin.</li></>}
        <li>Karşı taraf bilgilendirilir.</li>
      </ul>
      {hata && <p className="rt-hata">{hata}</p>}
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn tehlike" onClick={async () => { try { await sonlandir(il.id); onKapat(); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); } }}>Sonlandır</button>
      </div>
    </Modal>
  );
}

// ———————————————— Home aracı: koç paneli ————————————————

export function useDanismanlikOzeti(): { goster: boolean; ozet: string } {
  const d = useDanismanlik();
  const danisanlar = useDanisanlar().filter((x) => x.durum === 'aktif');
  if (!d.etkin || !d.profil?.koc) return { goster: false, ozet: '' };
  const kalan = kocDenemeKalan(d.profil);
  const uyari = kalan !== null && kalan <= 7 ? (kalan === 0 ? ' · deneme bitti' : ` · deneme ${kalan} gün`) : '';
  return { goster: true, ozet: (danisanlar.length ? `${danisanlar.length} aktif danışan` : 'Danışan davet et') + uyari };
}

/** D1 — deneme bitişinden önce uygulama içi uyarı (son 7 gün). Ödeme adımı henüz yok. */
export function KocDenemeUyarisi() {
  const d = useDanismanlik();
  const kalan = kocDenemeKalan(d.profil);
  if (kalan === null || kalan > 7) return null;
  return (
    <p className="rt-uyari" style={{ marginBottom: 10 }}>
      {kalan === 0
        ? 'Koç deneme süren bitti. Ödeme adımı henüz hazır değil; araçlar şimdilik açık kalıyor.'
        : `Koç deneme süren ${kalan} gün sonra bitiyor. İptal etmezsen ücretlendirme başlayacak (ödeme adımı henüz hazır değil). Koçluğu kapatmak için Ayarlar › Danışmanlık.`}
    </p>
  );
}

export function DanismanlikTool() {
  const d = useDanismanlik();
  const danisanlar = useDanisanlar();
  const [secili, setSecili] = useState<string | null>(null);
  const [davet, setDavet] = useState(false);
  const [program, setProgram] = useState<string | null>(null);
  const il = danisanlar.find((x) => x.id === secili);

  if (!d.etkin || !d.profil?.koc) return (
    <div className="side-content"><DanismanlikAyarlari /></div>
  );
  if (program) return <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}><KocProgramGorunumu programId={program} onGeri={() => setProgram(null)} /></div>;
  if (il) return (
    <div className="side-content rt-danisan-zemin" style={{ height: '100%', overflowY: 'auto' }}>
      <button type="button" className="rt-geri" onClick={() => setSecili(null)}>‹ Danışanlar</button>
      <DanisanDosyasi il={il} onProgram={setProgram} />
    </div>
  );
  return (
    <div className="side-content" style={{ height: '100%', overflowY: 'auto' }}>
      <KocDenemeUyarisi />
      <Kap baslik="Danışanlar" eylemler={<button type="button" className="rt-btn primary" onClick={() => setDavet(true)}>＋ Davet et</button>}>
        {danisanlar.length === 0 && <p className="rt-muted">Henüz danışanın yok. Davet bağlantısı oluşturup danışanına gönder; açınca kabul eder ve bağlanırsınız.</p>}
        {danisanlar.map((x) => <DanisanSatiri key={x.id} il={x} onAc={() => setSecili(x.id)} />)}
      </Kap>
      <Davetler />
      <Sablonlar onProgram={setProgram} />
      {davet && <DavetModal onKapat={() => setDavet(false)} />}
    </div>
  );
}

/** "Kim geride" — danışanın aktif programlarında son 7 günde planlananın ne kadarı yapıldı. */
function DanisanSatiri({ il, onAc }: { il: IliskiRow; onAc: () => void }) {
  const uyum = useCanli(async () => {
    const ps = (await db.program.toArray()).filter((p) => p.uzak?.iliski_id === il.id && p.uzak.rol === 'koc' && p.calisma_baslangic);
    let planli = 0, yapildi = 0;
    for (const p of ps) for (const a of (await ilerleme(p.id)).adimlar) { if (a.adim.tip === 'oku') continue; planli += a.planli; yapildi += a.yapildi; }
    return { programSay: ps.length, oran: planli ? yapildi / planli : null };
  }, [il.id], { programSay: 0, oran: null as number | null });
  const renk = uyum.oran === null ? '' : uyum.oran >= 0.7 ? 'iyi' : uyum.oran >= 0.4 ? 'orta' : 'geride';
  return (
    <button type="button" className={`rt-gelen${il.durum !== 'aktif' ? ' alindi' : ''}`} onClick={onAc}>
      <span className="ic">{il.danisan_ad.slice(0, 1).toLocaleUpperCase('tr')}</span>
      <span className="tx">
        <span className="t">{il.danisan_ad}</span>
        <span className="s">{disiplinAdi(il.disiplin)}{il.durum !== 'aktif' ? ' · sonlandı' : ''} · {uyum.programSay ? `${uyum.programSay} program` : 'program yok'}</span>
      </span>
      {uyum.oran !== null && <span className={`rt-uyum ${renk}`}>%{Math.round(uyum.oran * 100)}</span>}
    </button>
  );
}

function DavetModal({ onKapat }: { onKapat: () => void }) {
  const d = useDanismanlik();
  const [disiplin, setDisiplin] = useState(d.profil?.disiplinler[0] ?? 'sinav');
  const [yol, setYol] = useState<'baglanti' | 'eposta'>('baglanti');
  const [eposta, setEposta] = useState('');
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [gonderildi, setGonderildi] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const secenekler = DISIPLINLER.filter(([k]) => !d.profil?.disiplinler.length || d.profil.disiplinler.includes(k));
  if (gonderildi) return (
    <Modal baslik="Danışan davet et" onKapat={onKapat}>
      <p className="rt-tamam">Davet {gonderildi} adlı kişinin Gelenler&apos;ine gönderildi. Kabul edince danışanların arasında görünür.</p>
      <div className="rt-satir"><button type="button" className="rt-btn" onClick={onKapat}>Kapat</button></div>
    </Modal>
  );
  return (
    <Modal baslik="Danışan davet et" onKapat={onKapat}>
      {!sonuc ? (
        <>
          <p className="rt-metin">Hangi alanda çalışacaksınız?</p>
          <Chips secenekler={secenekler} deger={disiplin} onSec={setDisiplin} />
          <div style={{ marginTop: 12 }}><Chips<'baglanti' | 'eposta'> secenekler={[['baglanti', 'Bağlantı / QR'], ['eposta', 'E-postayla']]} deger={yol} onSec={setYol} /></div>
          {yol === 'baglanti'
            ? <p className="rt-muted" style={{ marginTop: 10 }}>Bağlantı tek kullanımlık, 7 gün geçerli. Danışanın açınca hesabına giriş yapar (yoksa ücretsiz oluşturur) ve kabul eder. Yüz yüzeysen QR kodu okutabilir.</p>
            : (
              <>
                <p className="rt-muted" style={{ marginTop: 10 }}>Danışanın Ritos hesabı varsa davet Gelenler&apos;ine düşer.</p>
                <input className="rt-inp" type="email" placeholder="Danışanın e-postası" value={eposta} onChange={(e) => setEposta(e.target.value)} />
              </>
            )}
          {hata && <p className="rt-hata">{hata}</p>}
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
            <button type="button" className="rt-btn primary" disabled={calisiyor || (yol === 'eposta' && !eposta.includes('@'))} onClick={async () => {
              setCalisiyor(true); setHata(null);
              try {
                if (yol === 'baglanti') setSonuc((await davetOlustur(disiplin)).baglanti);
                else setGonderildi(await ePostaDaveti(eposta, disiplin));
              } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
              setCalisiyor(false);
            }}>{yol === 'baglanti' ? 'Bağlantı oluştur' : 'Daveti gönder'}</button>
          </div>
        </>
      ) : (
        <>
          <QrKod metin={sonuc} />
          <p className="rt-metin">QR kodu okut ya da bağlantıyı gönder:</p>
          <input className="rt-inp" readOnly value={sonuc} onFocus={(e) => e.target.select()} />
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn primary" onClick={async () => { try { await navigator.clipboard.writeText(sonuc); setKopyalandi(true); } catch { /* yoksay */ } }}>{kopyalandi ? 'Kopyalandı ✓' : 'Kopyala'}</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" className="rt-btn" onClick={() => navigator.share({ title: 'Ritos davet', text: `${d.profil?.ad ?? 'Koçun'} seni Ritos'ta danışanı olarak ekliyor:`, url: sonuc }).catch(() => {})}>Paylaş</button>
            )}
            <button type="button" className="rt-btn" onClick={onKapat}>Kapat</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function QrKod({ metin }: { metin: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(metin);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  }, [metin]);
  return <div className="rt-qr" aria-label="Davet QR kodu" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Davetler() {
  const [liste, setListe] = useState<DavetSatir[]>([]);
  const [yenile, setYenile] = useState(0);
  useEffect(() => { davetler().then(setListe).catch(() => setListe([])); }, [yenile]);
  const bekleyen = liste.filter((x) => !x.kullanildi && new Date(x.son).getTime() > Date.now());
  if (!bekleyen.length) return null;
  return (
    <Kap baslik={<span className="rt-muted">Bekleyen davetler</span>}>
      {bekleyen.map((x) => (
        <div key={x.kod} className="rt-kaynak">
          <div className="rt-konu" style={{ cursor: 'default' }}><span>{disiplinAdi(x.disiplin)}</span><span className="rt-muted">son gün {new Date(x.son).toLocaleDateString('tr-TR')}</span></div>
          <button type="button" className="rt-btn" onClick={async () => { await davetSil(x.kod); setYenile((n) => n + 1); }}>İptal</button>
        </div>
      ))}
    </Kap>
  );
}

// ———————————————— şablonlar (D4) ————————————————

function Sablonlar({ onProgram }: { onProgram: (id: string) => void }) {
  const sablonlar = useCanli(() => db.program.filter((p) => !!p.sablon).toArray(), [], [] as ProgramRow[]);
  return (
    <Kap baslik="Şablonlar">
      {sablonlar.length === 0 && <p className="rt-muted">Sık kullandığın programı bir kez hazırla: kendi programında ya da danışana atadığında &quot;Şablon olarak kaydet&quot;.</p>}
      {Array.from(new Set(sablonlar.map((p) => p.sablon_disiplin ?? ''))).sort().map((grup) => (
        <div key={grup || 'genel'} className="rt-klasor">
          <div className="rt-unite">📁 {grup ? disiplinAdi(grup) : 'Disiplinsiz'}</div>
          <div className="rt-klasor-ic">
            {sablonlar.filter((p) => (p.sablon_disiplin ?? '') === grup).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((p) => (
              <button key={p.id} type="button" className="rt-prog" onClick={() => onProgram(p.id)}>
                <span className="t">{p.ad}</span><span className="m">şablon</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Kap>
  );
}

// ———————————————— danışan dosyası (D3, D5, D7, P10) ————————————————

export function DanisanDosyasi({ il, onProgram }: { il: IliskiRow; onProgram: (id: string) => void }) {
  const programlar = useCanli(() => db.program.filter((p) => p.uzak?.iliski_id === il.id && p.uzak.rol === 'koc').toArray(), [il.id], [] as ProgramRow[]);
  const [ata, setAta] = useState(false);
  const [bitir, setBitir] = useState(false);
  const [sekme, setSekme] = useState<'program' | 'sinav'>('program');
  const aktif = il.durum === 'aktif';
  return (
    <div>
      <div className="rt-danisan-bas">
        <b>{il.danisan_ad}</b>
        <span className="rt-muted">{disiplinAdi(il.disiplin)} · {aktif ? `${new Date(il.olusturuldu).toLocaleDateString('tr-TR')}'den beri` : 'sonlandı'}</span>
      </div>
      {il.disiplin === 'sinav' && <Chips<'program' | 'sinav'> secenekler={[['program', 'Programlar'], ['sinav', 'Sınav ilerlemesi']]} deger={sekme} onSec={setSekme} />}
      {sekme === 'sinav' && il.disiplin === 'sinav' ? <DanisanSinav il={il} programlar={programlar} /> : (
        <Kap baslik="Programlar" eylemler={aktif ? <button type="button" className="rt-btn primary" onClick={() => setAta(true)}>＋ Program ata</button> : null}>
          {programlar.length === 0 && <p className="rt-muted">{aktif ? 'Şablondan ya da boş bir programla başla; gönderene kadar düzenleyebilirsin.' : 'Program yok.'}</p>}
          {programlar.sort((a, b) => (b.uzak!.baslangic).localeCompare(a.uzak!.baslangic)).map((p) => (
            <button key={p.id} type="button" className="rt-prog" onClick={() => onProgram(p.id)}>
              <span className="t">{p.ad}</span>
              <span className="m"><UzakDurum p={p} /> · {tarihEtiket(p.calisma_baslangic ?? p.uzak!.baslangic)}</span>
            </button>
          ))}
        </Kap>
      )}
      {aktif && sekme === 'program' && <DanisanIzinleri il={il} />}
      {aktif && <button type="button" className="rt-linkbtn" style={{ marginTop: 8 }} onClick={() => setBitir(true)}>Danışmanlığı sonlandır</button>}
      {ata && <ProgramAtaModal il={il} onKapat={() => setAta(false)} onOlustu={(id) => { setAta(false); onProgram(id); }} />}
      {bitir && <SonlandirModal il={il} onKapat={() => setBitir(false)} />}
    </div>
  );
}

/** D9 — bu danışanın kartlarında neye izin var (yeni atamaların varsayılanı). */
function DanisanIzinleri({ il }: { il: IliskiRow }) {
  const kayitli = useCanli(() => danisanIzinleri(il), [il.id], null as Izinler | null);
  const [iz, setIz] = useState<Izinler | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  useEffect(() => { if (kayitli && !iz) setIz(kayitli); }, [kayitli, iz]);
  if (!iz || !kayitli) return null;
  const degisti = JSON.stringify(iz) !== JSON.stringify(kayitli);
  return (
    <Kap baslik={<span className="rt-muted">Kart izinleri</span>}>
      <label className="rt-onay"><input type="checkbox" checked={iz.gun_degistir} onChange={(e) => setIz({ ...iz, gun_degistir: e.target.checked })} /><span>Kartların gününü değiştirebilir</span></label>
      <label className="rt-alan" style={{ marginTop: 8 }}>Girdiği değeri düzeltebilir
        <select value={iz.duzeltme_gun === null ? 'her' : String(iz.duzeltme_gun)} onChange={(e) => setIz({ ...iz, duzeltme_gun: e.target.value === 'her' ? null : Number(e.target.value) })}>
          <option value="her">Her zaman</option>
          <option value="0">Yalnız aynı gün</option>
          <option value="1">Ertesi güne kadar</option>
          <option value="3">3 gün içinde</option>
        </select>
      </label>
      <p className="rt-muted">Kartı silmek ve içeriğini değiştirmek danışana kapalıdır; gün içinde sıralayabilir.</p>
      {mesaj && <p className="rt-tamam">{mesaj}</p>}
      {degisti && (
        <div className="rt-satir">
          <button type="button" className="rt-btn" onClick={async () => { await danisanIzinKaydet(il, iz, false); setMesaj('Yeni atamalarda kullanılacak.'); }}>Yeni atamalar için kaydet</button>
          <button type="button" className="rt-btn primary" onClick={async () => { const n = await danisanIzinKaydet(il, iz, true); setMesaj(`Kaydedildi; ${n} programa bugünden itibaren uygulandı.`); }}>Mevcut programlara da uygula</button>
        </div>
      )}
    </Kap>
  );
}

export function UzakDurum({ p }: { p: ProgramRow }) {
  const u = p.uzak;
  if (!u) return null;
  if (u.durum === 'taslak') return <span className="rt-rozet">taslak</span>;
  if (u.durum === 'gonderildi') return <span className="rt-rozet">gönderildi · kabul bekleniyor</span>;
  if (u.durum === 'ret') return <span className="rt-rozet zayif">reddedildi</span>;
  if (u.durum === 'ayrildi') return <span className="rt-rozet">sonlandı</span>;
  return aktifMi(p) ? <span className="rt-aktif">uyguluyor</span> : <span className="rt-rozet">bitti</span>;
}

export function ProgramAtaModal({ il, sablonId, onKapat, onOlustu }: { il?: IliskiRow; sablonId?: string; onKapat: () => void; onOlustu: (id: string) => void }) {
  const danisanlar = useDanisanlar().filter((x) => x.durum === 'aktif');
  const kaynaklar = useCanli(() => db.program.filter((p) => !!p.sablon || (!p.uzak && !p.sablon)).toArray(), [], [] as ProgramRow[]);
  const [kimId, setKimId] = useState(il?.id ?? '');
  const [kaynak, setKaynak] = useState(sablonId ?? '');
  const [ad, setAd] = useState('');
  const [bas, setBas] = useState(tarihEkle(bugun(), 1));
  const kim = il ?? danisanlar.find((x) => x.id === kimId);
  const sablonlar = kaynaklar.filter((p) => p.sablon);
  const kendi = kaynaklar.filter((p) => !p.sablon);
  return (
    <Modal baslik="Program ata" onKapat={onKapat}>
      {!il && (
        <label className="rt-alan">Danışan
          <select value={kimId} onChange={(e) => setKimId(e.target.value)}>
            <option value="">— seç —</option>
            {danisanlar.map((x) => <option key={x.id} value={x.id}>{iliskiEtiket(x)}</option>)}
          </select>
        </label>
      )}
      <label className="rt-alan">Neyden başlasın
        <select value={kaynak} onChange={(e) => setKaynak(e.target.value)}>
          <option value="">Boş program</option>
          {sablonlar.length > 0 && <optgroup label="Şablonlar">{sablonlar.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</optgroup>}
          {kendi.length > 0 && <optgroup label="Kendi programlarım">{kendi.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</optgroup>}
        </select>
      </label>
      <input className="rt-inp" placeholder={kaynak ? 'Ad (boş = kaynağın adı)' : 'Program adı'} value={ad} onChange={(e) => setAd(e.target.value)} />
      <label className="rt-alan" style={{ marginTop: 8 }}>Başlangıç<input className="rt-inp" type="date" value={bas} min={bugun()} onChange={(e) => setBas(e.target.value)} /></label>
      <p className="rt-muted">Danışana özel bir kopya oluşur; göndermeden önce düzenleyebilirsin. Şablon sonradan değişse bu kopya değişmez.</p>
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!kim || (!kaynak && !ad.trim()) || !bas} onClick={async () => onOlustu(await programAta(kim!, kaynak || null, ad, bas))}>Oluştur</button>
      </div>
    </Modal>
  );
}

// ———————————————— program ekranındaki danışmanlık bölümü ————————————————

/** ProgramDetay'ın üstünde: koç/danışan/şablon durumuna göre bilgi ve eylemler. */
export function ProgramDanismanlik({ p, adimVar }: { p: ProgramRow; adimVar: boolean }) {
  const d = useDanismanlik();
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [ata, setAta] = useState(false);
  const [sil, setSil] = useState(false);
  const u = p.uzak;

  if (p.sablon) return (
    <div className="rt-uzak-bilgi">
      <span><b>Şablon</b> — başlatılmaz, danışana atanır.</span>
      <label className="rt-alan">Disiplin (şablon klasörü)
        <select value={p.sablon_disiplin ?? ''} onChange={(e) => db.program.update(p.id, { sablon_disiplin: e.target.value || null, guncellendi: Date.now() })}>
          <option value="">Disiplinsiz</option>
          {DISIPLINLER.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
        </select>
      </label>
      {d.profil?.koc && <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={() => setAta(true)}>Danışana ata</button></div>}
      {ata && <ProgramAtaModal sablonId={p.id} onKapat={() => setAta(false)} onOlustu={() => { setAta(false); setMesaj('Atandı — danışanın dosyasından düzenleyip gönder.'); }} />}
      {mesaj && <p className="rt-tamam">{mesaj}</p>}
    </div>
  );

  if (!u) return d.profil?.koc ? (
    <div className="rt-satir" style={{ marginBottom: 8 }}>
      <button type="button" className="rt-btn" onClick={async () => { await sablonKaydet(p.id, d.profil?.disiplinler[0] ?? null); setMesaj('Şablonlara kaydedildi.'); }}>Şablon olarak kaydet</button>
      {mesaj && <span className="rt-tamam">{mesaj}</span>}
    </div>
  ) : null;

  if (u.rol === 'danisan') return (
    <div className="rt-uzak-bilgi">
      <span>🤝 <b>{u.karsi_ad}</b> · {disiplinAdi(u.disiplin)} — {u.durum === 'ayrildi'
        ? 'danışmanlık sonlandı. Geçmiş kayıtların duruyor.'
        : 'bu program koçunun. Bu programdaki işaretlerin ve değerlerin yalnız koçuna gider; başka hiçbir verin gitmez.'}</span>
      {u.durum === 'ayrildi' && (sil
        ? <OnayKutusu metin="Program ve görev planı silinir; Ajanda'daki geçmiş işaretlerin kalır." evet="Sil" onVazgec={() => setSil(false)} onEvet={() => programiSil(p.id)} />
        : (
          <div className="rt-satir">
            <button type="button" className="rt-btn primary" onClick={() => kendimeAl(p.id)}>Kendime al</button>
            <button type="button" className="rt-btn tehlike" onClick={() => setSil(true)}>Sil</button>
          </div>
        ))}
    </div>
  );

  // Koç tarafı
  return (
    <div className="rt-uzak-bilgi koc">
      <span>→ <b>{u.karsi_ad}</b> · {disiplinAdi(u.disiplin)} · <UzakDurum p={p} /></span>
      {u.durum === 'taslak' && (
        <>
          <label className="rt-alan">Başlangıç<input className="rt-inp" type="date" value={u.baslangic} min={bugun()} onChange={(e) => db.program.update(p.id, { uzak: { ...u, baslangic: e.target.value }, guncellendi: Date.now() })} /></label>
          <div className="rt-satir">
            <button type="button" className="rt-btn primary" disabled={!adimVar} onClick={async () => { try { await programGonder(p.id); setMesaj(`Gönderildi — ${u.karsi_ad} Gelenler'inde görecek.`); } catch (e) { setMesaj(e instanceof Error ? e.message : String(e)); } }}>Gönder</button>
          </div>
        </>
      )}
      {(u.durum === 'gonderildi' || u.durum === 'kabul') && <span className="rt-muted">Değişikliklerin danışana kendiliğinden gider; geçmiş günler değişmez.</span>}
      {u.durum !== 'ayrildi' && u.durum !== 'ret' && (
        <label className="rt-onay">
          <input type="checkbox" checked={u.izinler.gun_degistir} onChange={async (e) => {
            await db.program.update(p.id, { uzak: { ...u, izinler: { ...u.izinler, gun_degistir: e.target.checked } }, guncellendi: Date.now() });
            if (u.durum !== 'taslak') await programGonder(p.id);
          }} />
          <span>Danışan kartların gününü değiştirebilir</span>
        </label>
      )}
      <div className="rt-satir"><button type="button" className="rt-btn" onClick={async () => { await sablonKaydet(p.id); setMesaj('Şablonlara kaydedildi.'); }}>Şablon olarak kaydet</button></div>
      {mesaj && <p className="rt-tamam">{mesaj}</p>}
    </div>
  );
}

// Koç panelinden açılan program (şablon ya da danışan programı) — Kişisel Gelişim'in program ekranı.
let ProgramEkrani: React.ComponentType<{ programId: string; onGeri: () => void }> | null = null;
export function programEkraniKaydet(c: React.ComponentType<{ programId: string; onGeri: () => void }>) { ProgramEkrani = c; }
function KocProgramGorunumu({ programId, onGeri }: { programId: string; onGeri: () => void }) {
  if (!ProgramEkrani) return null;
  const E = ProgramEkrani;
  return <E programId={programId} onGeri={onGeri} />;
}

// ———————————————— Kişisel Gelişim: kişi seçici (D3) ————————————————

export function KisiSecici({ secili, onSec }: { secili: string; onSec: (id: string) => void }) {
  const d = useDanismanlik();
  const danisanlar = useDanisanlar();
  if (!d.profil?.koc || danisanlar.length === 0) return null;
  return (
    <div className="rt-kisi-secici">
      <Chips secenekler={[['ben', 'Ben'], ...danisanlar.map((x) => [x.id, `${x.danisan_ad}${x.durum !== 'aktif' ? ' (sonlandı)' : ''}`] as [string, string])]} deger={secili} onSec={onSec} />
    </div>
  );
}

// ———————————————— danışan sınav ilerlemesi (P10) ————————————————

function DanisanSinav({ il, programlar }: { il: IliskiRow; programlar: ProgramRow[] }) {
  const idler = programlar.map((p) => p.id);
  const analiz = useCanli(() => danisanAnalizi(idler), [idler.join()], null as SinavAnalizi | null);
  const [ekle, setEkle] = useState<{ konuId: string; dersId: string | null; sinav: string | null } | null>(null);
  const konuAdlari = useCanli(async () => {
    const m = new Map<string, { ad: string; ders: string; dersId: string | null; sinav: string | null }>();
    for (const pid of idler) for (const a of await db.program_adim.where('program_id').equals(pid).toArray()) {
      if (a.ek?.paket !== 'sinav') continue;
      for (const k of a.ek.konular) m.set(k.id, { ad: k.ad, ders: a.ek.ders?.ad ?? '', dersId: a.ek.ders?.id ?? null, sinav: a.ek.sinav });
    }
    return m;
  }, [idler.join()], new Map());
  if (!analiz) return null;
  const konular = Array.from(analiz.konular.entries()).map(([id, s]) => ({ id, s, bilgi: konuAdlari.get(id) })).filter((x) => x.bilgi);
  const zayif = konular.filter((x) => zayifMi(x.s)).sort((a, b) => (dogrulukOrani(a.s) ?? 1) - (dogrulukOrani(b.s) ?? 1));
  const sinavlar = Array.from(new Set(analiz.denemeler.map((x) => x.sinav)));
  const aktifProgramlar = programlar.filter((p) => p.uzak?.durum !== 'ayrildi' && p.uzak?.durum !== 'ret');
  return (
    <div>
      {konular.length === 0 && analiz.denemeler.length === 0 && <p className="rt-muted" style={{ marginTop: 8 }}>{il.danisan_ad} henüz sınav görevlerinden birini işaretlemedi. Programına Soru çöz, Çalışma ya da Deneme adımı ekle; işaretledikçe burada görürsün.</p>}
      {sinavlar.map((s) => Array.from(new Set(analiz.denemeler.filter((x) => x.sinav === s).map((x) => x.tur))).map((tur) => (
        <DenemeSerisi key={`${s}-${tur}`} baslik={analiz.denemeler.find((x) => x.sinav === s && x.tur === tur)!.ad} liste={analiz.denemeler.filter((x) => x.sinav === s && x.tur === tur)} />
      )))}
      <Kap baslik="Zayıf konular">
        {zayif.length === 0 ? <p className="rt-muted">En az {ZAYIF_ESIK.enAzSoru} soru çözülüp doğruluğu %{ZAYIF_ESIK.oran * 100}&apos;ın altında kalan konu yok.</p> : zayif.map((x) => (
          <div key={x.id} className="rt-kaynak">
            <div className="rt-konu" style={{ cursor: 'default' }}><span>{x.bilgi!.ad}</span><span className="rt-muted">{x.bilgi!.ders} · %{Math.round((dogrulukOrani(x.s) ?? 0) * 100)} doğru · {soruSayisi(x.s)} soru</span></div>
            {aktifProgramlar.length > 0 && il.durum === 'aktif' && <button type="button" className="rt-btn" onClick={() => setEkle({ konuId: x.id, dersId: x.bilgi!.dersId, sinav: x.bilgi!.sinav })}>＋ Soru</button>}
          </div>
        ))}
      </Kap>
      <Kap baslik="Çalışılan konular">
        {konular.length === 0 ? <p className="rt-muted">Henüz yok.</p> : konular.sort((a, b) => (b.s.son ?? '').localeCompare(a.s.son ?? '')).slice(0, 30).map((x) => (
          <div key={x.id} className="rt-konu" style={{ cursor: 'default' }}>
            <span>{x.bilgi!.ad}</span>
            <span className="rt-muted">{x.bilgi!.ders}{soruSayisi(x.s) ? ` · %${Math.round((dogrulukOrani(x.s) ?? 0) * 100)} doğru · ${soruSayisi(x.s)} soru` : ''}{x.s.calisma ? ` · ${x.s.calisma} çalışma` : ''}{x.s.son ? ` · ${tarihEtiket(x.s.son).split(',')[0]}` : ''}</span>
          </div>
        ))}
      </Kap>
      {ekle && <ProgrameGorevModal programlar={aktifProgramlar} ilk={{ tur: 'soru', sinav: ekle.sinav ?? undefined, dersId: ekle.dersId ?? undefined, konuIds: [ekle.konuId] }} onKapat={() => setEkle(null)} />}
    </div>
  );
}

/** Koç: danışanın programına tek günlük görev adımı ekler (D8 — kendiliğinden gider). */
function ProgrameGorevModal({ programlar, ilk, onKapat }: { programlar: ProgramRow[]; ilk: Parameters<typeof GorevFormu>[0]['ilk']; onKapat: () => void }) {
  const [taslak, setTaslak] = useState<GorevTaslak | null>(null);
  const [pid, setPid] = useState(programlar[0]?.id ?? '');
  const [tarih, setTarih] = useState(tarihEkle(bugun(), 1));
  const p = programlar.find((x) => x.id === pid);
  const bas = p ? p.calisma_baslangic ?? p.uzak?.baslangic ?? bugun() : bugun();
  return (
    <Modal baslik="Danışana görev" onKapat={onKapat}>
      <GorevFormu ilk={ilk} onChange={setTaslak} />
      {programlar.length > 1 && (
        <label className="rt-alan" style={{ marginTop: 8 }}>Program
          <select value={pid} onChange={(e) => setPid(e.target.value)}>{programlar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}</select>
        </label>
      )}
      <label className="rt-alan" style={{ marginTop: 8 }}>Gün<input className="rt-inp" type="date" value={tarih} min={bas > bugun() ? bas : bugun()} onChange={(e) => setTarih(e.target.value)} /></label>
      <div className="rt-satir" style={{ marginTop: 10 }}>
        <button type="button" className="rt-btn" onClick={onKapat}>Vazgeç</button>
        <button type="button" className="rt-btn primary" disabled={!taslak || !p || tarih < bas} onClick={async () => {
          await adimEkle(p!.id, { tip: taslak!.tip, ad: taslak!.ad, bloklar: taslak!.bloklar, ek: taslak!.ek, basla_gun: gunFarki(bas, tarih), sure_gun: 1, gunler: null, saatler: [] });
          onKapat();
        }}>Programa ekle</button>
      </div>
    </Modal>
  );
}

// ———————————————— davet karşılama (D2) ————————————————

const DAVET = 'ritos-davet';

/** Uygulama davet bağlantısıyla açıldıysa: kodu sakla, adres çubuğundan temizle. */
export function davetYakala() {
  if (typeof window === 'undefined') return;
  const u = new URL(location.href);
  const kod = u.searchParams.get('davet');
  if (!kod) return;
  try { localStorage.setItem(DAVET, kod); } catch { /* yoksay */ }
  u.searchParams.delete('davet');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

export function DavetKarsilama({ onHesap }: { onHesap: () => void }) {
  const o = useOturum();
  const d = useDanismanlik();
  const [kod, setKod] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<{ koc_ad: string; disiplin: string; gecerli: boolean; kendi: boolean } | null | 'yok'>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => { davetYakala(); try { setKod(localStorage.getItem(DAVET)); } catch { /* yoksay */ } }, []);
  useEffect(() => {
    if (!kod || !d.etkin) return;
    davetBak(kod).then((b) => setBilgi(b ?? 'yok')).catch((e) => setHata(e instanceof Error ? e.message : String(e)));
  }, [kod, d.etkin]);
  if (!kod || !o.hazir) return null;
  const bitir = () => { try { localStorage.removeItem(DAVET); } catch { /* yoksay */ } setKod(null); };

  return (
    <Modal baslik="Danışmanlık daveti" onKapat={bitir}>
      {!d.etkin ? (
        <>
          <p className="rt-metin">Bir koç seni Ritos&apos;ta danışanı olarak eklemek istiyor. Devam etmek için giriş yap ya da ücretsiz hesap oluştur; danışan olmak ücretsizdir.</p>
          <div className="rt-satir"><button type="button" className="rt-btn primary" onClick={onHesap}>Giriş yap / Hesap oluştur</button></div>
        </>
      ) : sonuc ? (
        <>
          <p className="rt-tamam">{sonuc}</p>
          <div className="rt-satir"><button type="button" className="rt-btn" onClick={bitir}>Tamam</button></div>
        </>
      ) : bilgi === null ? <p className="rt-muted">Davet okunuyor…</p> : bilgi === 'yok' || !bilgi.gecerli || bilgi.kendi ? (
        <>
          <p className="rt-metin">{bilgi !== 'yok' && bilgi.kendi ? 'Bu senin oluşturduğun bir davet; danışanına göndermelisin.' : 'Bu davetin süresi dolmuş ya da daha önce kullanılmış. Koçundan yeni bir bağlantı iste.'}</p>
          <div className="rt-satir"><button type="button" className="rt-btn" onClick={bitir}>Kapat</button></div>
        </>
      ) : (
        <>
          <p className="rt-metin"><b>{bilgi.koc_ad}</b> ({disiplinAdi(bilgi.disiplin)}) seni danışanı olarak eklemek istiyor.</p>
          <ul className="rt-maddeler">
            <li>Koçun sana program gönderebilir; ilk program Gelenler&apos;e düşer, sen kabul edersin.</li>
            <li>Koçuna yalnız onun programlarındaki işaretlerin ve değerlerin gider. Kendi programların, yaşam alanların ve Ajanda&apos;nın geri kalanı gitmez.</li>
            <li>İstediğin zaman Ayarlar &gt; Danışmanlık&apos;tan sonlandırabilirsin.</li>
          </ul>
          {hata && <p className="rt-hata">{hata}</p>}
          <div className="rt-satir" style={{ marginTop: 10 }}>
            <button type="button" className="rt-btn" onClick={async () => { try { await davetYanit(kod, false); bitir(); } catch (e) { setHata(e instanceof Error ? e.message : String(e)); } }}>Reddet</button>
            <button type="button" className="rt-btn primary" onClick={async () => {
              try { await davetYanit(kod, true); setSonuc(`${bilgi.koc_ad} ile bağlandınız. Gönderdiği programlar Gelenler'ine düşecek.`); try { localStorage.removeItem(DAVET); } catch { /* yoksay */ } }
              catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
            }}>Kabul et</button>
          </div>
        </>
      )}
      {hata && bilgi === null && <p className="rt-hata">{hata}</p>}
    </Modal>
  );
}

// ———————————————— Gelenler: koçtan gelen program (D5/D6, açık soru 1) ————————————————

export function KocGelenDetay({ g, onKapat }: { g: GelenRow; onKapat: () => void }) {
  const pk = g.paket as KocPaketi;
  const s = pk.program;
  const klasorler = useCanli(() => db.klasor.toArray(), [], [] as KlasorRow[]);
  const alanlar = klasorler.filter((k) => k.tur === 'alan' || (k.tur === undefined && k.ust_id === null));
  const [yer, setYer] = useState<string>('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [ret, setRet] = useState(false);
  const bas = s.baslangic > bugun() ? s.baslangic : bugun();
  const il = useCanli(() => db.iliski.get(pk.iliski_id), [pk.iliski_id], undefined as IliskiRow | undefined);
  const acik = !il || il.durum === 'aktif';
  return (
    <Modal baslik={s.ad} onKapat={onKapat}>
      <p className="rt-muted">🤝 {pk.koc_ad} · {disiplinAdi(pk.disiplin)} · {tarihEtiket(bas)} başlar</p>
      {s.amac && <p className="rt-metin"><b>Amaç:</b> {s.amac}</p>}
      {s.dikkat && <p className="rt-metin"><b>Dikkat:</b> {s.dikkat}</p>}
      <ul className="rt-maddeler">{s.adimlar.slice().sort((a, b) => a.sira - b.sira).map((a) => <li key={a.id}>{a.ad} <span className="rt-muted">· {a.basla_gun ? `${a.basla_gun + 1}. günden` : 'ilk günden'} · {a.sure_gun ? `${a.sure_gun} gün` : 'süregelen'}</span></li>)}</ul>
      {mesaj ? <p className="rt-tamam">{mesaj}</p> : g.alindi ? <p className="rt-muted">Alındı.</p> : !acik ? <p className="rt-muted">Bu danışmanlık sonlanmış.</p> : (
        <>
          <p className="rt-muted">Kartlar Ajanda&apos;na koçunun kartı olarak düşer; işaretlerin ve değerlerin yalnız koçuna gider.</p>
          {alanlar.length > 0 && (
            <label className="rt-alan">Hangi yaşam alanına
              <select value={yer} onChange={(e) => setYer(e.target.value)}>
                <option value="">Alansız</option>
                {alanlar.map((a) => <option key={a.id} value={a.id}>{a.ad}</option>)}
              </select>
            </label>
          )}
          {ret ? (
            <OnayKutusu metin={`Program reddedilsin mi? ${pk.koc_ad} bilgilendirilir.`} evet="Reddet" onVazgec={() => setRet(false)} onEvet={async () => { await kocProgramiReddet(g.id); onKapat(); }} />
          ) : (
            <div className="rt-satir" style={{ marginTop: 10 }}>
              <button type="button" className="rt-btn" onClick={() => setRet(true)}>Reddet</button>
              <button type="button" className="rt-btn primary" onClick={async () => { await kocProgramiAl(g.id, yer || null); setMesaj("Kişisel Gelişim'e eklendi, kartlar Ajanda'nda."); }}>Kabul et</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export const kocGelenAdi = (g: GelenRow) => (g.paket as KocPaketi).program.ad;

// ———————————————— Gelenler: e-postayla gelen davet (D2) ————————————————

export interface DavetPaketi { tur: 'davet'; ad: string; davet: { kod: string; koc_ad: string; disiplin: string } }

export function DavetGelenDetay({ g, onKapat }: { g: GelenRow; onKapat: () => void }) {
  const d = useDanismanlik();
  const p = g.paket as DavetPaketi;
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const yanit = async (kabul: boolean) => {
    try {
      await davetYanit(p.davet.kod, kabul);
      await db.gelen.update(g.id, { alindi: Date.now() });
      if (kabul) setSonuc(`${p.davet.koc_ad} ile bağlandınız. Gönderdiği programlar Gelenler'ine düşecek.`); else onKapat();
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Modal baslik="Danışmanlık daveti" onKapat={onKapat}>
      <p className="rt-metin"><b>{p.davet.koc_ad}</b> ({disiplinAdi(p.davet.disiplin)}) seni danışanı olarak eklemek istiyor.</p>
      <ul className="rt-maddeler">
        <li>Koçuna yalnız onun programlarındaki işaretlerin ve değerlerin gider.</li>
        <li>İstediğin zaman Ayarlar › Danışmanlık&apos;tan sonlandırabilirsin.</li>
      </ul>
      {sonuc ? <p className="rt-tamam">{sonuc}</p> : g.alindi ? <p className="rt-muted">Yanıtlandı.</p> : !d.etkin ? <p className="rt-muted">Yanıtlamak için giriş yap.</p> : (
        <div className="rt-satir" style={{ marginTop: 10 }}>
          <button type="button" className="rt-btn" onClick={() => yanit(false)}>Reddet</button>
          <button type="button" className="rt-btn primary" onClick={() => yanit(true)}>Kabul et</button>
        </div>
      )}
      {hata && <p className="rt-hata">{hata}</p>}
    </Modal>
  );
}

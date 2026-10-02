'use client';

// Ayarlar → Bildirimler (2 ekim): bu cihazda aç/kapat, test, kaynaklar, kart adı tercihi.

import React, { useEffect, useState } from 'react';
import { bildirimAc, bildirimDurumu, bildirimKapat, kaynakAyarla, kaynaklar, kartAdiAyarla, kartAdiGoster, testBildirimi, type BildirimDurum, type KaynakDurum } from '@/lib/bildirim';
import { Kap } from './ortak';

const KAYNAK_AD: Record<string, string> = { ritos: 'Ritos (kart hatırlatmaları)' };

export function BildirimAyarlari() {
  const [durum, setDurum] = useState<BildirimDurum | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [liste, setListe] = useState<KaynakDurum[]>([]);
  const [adi, setAdi] = useState(true);
  const yenile = async () => { setDurum(await bildirimDurumu()); setListe(await kaynaklar()); };
  useEffect(() => { setAdi(kartAdiGoster()); void yenile(); }, []);

  return (
    <Kap baslik="🔔 Bildirimler">
      {durum === 'ana-ekran' && <p className="rt-muted">iPhone ve iPad&apos;de bildirim için Ritos&apos;u ana ekrana eklemelisin: Safari&apos;de Paylaş → Ana Ekrana Ekle, sonra oradan aç.</p>}
      {durum === 'desteklenmiyor' && <p className="rt-muted">Bu tarayıcı bildirimleri desteklemiyor.</p>}
      {durum === 'reddedildi' && <p className="rt-muted">Bildirim izni bu cihazda kapalı. Telefonun ayarlarından Ritos için bildirimlere izin ver.</p>}
      {(durum === 'kapali' || durum === 'acik') && (
        <div className="rt-satir">
          <span className="rt-metin" style={{ flex: 1 }}>{durum === 'acik' ? '✓ Bu cihazda açık' : 'Bu cihazda kapalı'}</span>
          {durum === 'kapali'
            ? <button type="button" className="rt-btn primary" disabled={mesgul} onClick={async () => { setMesgul(true); setMesaj(await bildirimAc()); await yenile(); setMesgul(false); }}>Bildirimleri aç</button>
            : <>
                <button type="button" className="rt-btn" disabled={mesgul} onClick={async () => { setMesaj((await testBildirimi()) ?? 'Test kuyruğa yazıldı; bir dakika içinde gelir.'); }}>Test gönder</button>
                <button type="button" className="rt-btn" disabled={mesgul} onClick={async () => { setMesgul(true); await bildirimKapat(); await yenile(); setMesgul(false); }}>Kapat</button>
              </>}
        </div>
      )}
      {mesaj && <p className="rt-muted">{mesaj}</p>}
      <label className="rt-satir rt-bil-sec">
        <input type="checkbox" checked={adi} onChange={(e) => { setAdi(e.target.checked); kartAdiAyarla(e.target.checked); }} />
        <span>Kart hatırlatmalarında kartın adını göster <span className="rt-muted">(kapalıysa yalnız &quot;Ajandanda bir kart var&quot;)</span></span>
      </label>
      {liste.length > 0 && (
        <>
          <p className="rt-muted" style={{ marginBottom: 0 }}>Kaynaklar — aynı Supabase&apos;i kullanan uygulamaların bildirimleri:</p>
          {liste.map((k) => (
            <label key={k.kaynak} className="rt-satir rt-bil-sec">
              <input type="checkbox" checked={k.acik} onChange={async (e) => { const v = e.target.checked; setListe(liste.map((x) => (x.kaynak === k.kaynak ? { ...x, acik: v } : x))); await kaynakAyarla(k.kaynak, v); }} />
              <span>{KAYNAK_AD[k.kaynak] ?? k.kaynak}</span>
            </label>
          ))}
        </>
      )}
    </Kap>
  );
}

// Supabase Edge Function — Ritos bildirim kuyruğu (2 ekim; 7 ekim v1: yeni proje, öneksiz tablolar).
// Deploy: Dashboard → Edge Functions → Deploy a new function → adı "ritos-bildirim", bu içeriği yapıştır.
//   "Verify JWT" KAPALI olmalı (cron JWT değil, x-ritos-cron başlığıyla gelir).
// Secrets (Dashboard → Edge Functions → Secrets):
//   RITOS_VAPID_PUBLIC_KEY · RITOS_VAPID_PRIVATE_KEY · RITOS_VAPID_SUBJECT  (ritos-bildirim-gizli.txt)
//   RITOS_CRON_GIZLI — Vault'taki ritos_cron_gizli ile aynı değer (bkz. supabase/v1/06-bildirim.sql)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.
// Dakikada bir 06-bildirim.sql'deki cron tarafından çağrılır.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// Sunucu anahtarı: otomatik SUPABASE_SERVICE_ROLE_KEY; yoksa secret olarak RITOS_SECRET_KEY (sb_secret_…) girilir.
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('RITOS_SECRET_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('RITOS_VAPID_SUBJECT')!,
  Deno.env.get('RITOS_VAPID_PUBLIC_KEY')!,
  Deno.env.get('RITOS_VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  const gizli = Deno.env.get('RITOS_CRON_GIZLI');
  if (!gizli || req.headers.get('x-ritos-cron') !== gizli) return new Response('yetkisiz', { status: 401 });
  const simdi = new Date().toISOString();
  // Zamanı gelmiş, gönderilmemiş bildirimler. Çok eskileri (1 saatten fazla gecikmiş) sessizce kapatılır.
  const { data: kuyruk, error } = await sb.from('bildirim')
    .select('id, alici, kaynak, baslik, metin, ac, gonder_zamani')
    .is('gonderildi', null).lte('gonder_zamani', simdi)
    .order('gonder_zamani').limit(500);
  if (error) return new Response(JSON.stringify({ hata: error.message }), { status: 500 });

  let gonderilen = 0, atlanan = 0;
  const kapali = new Map<string, Set<string>>();
  const abonelik = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const b of kuyruk ?? []) {
    const eski = Date.now() - new Date(b.gonder_zamani).getTime() > 3600_000;
    if (!kapali.has(b.alici)) {
      const { data } = await sb.from('bildirim_kaynak').select('kaynak').eq('uye', b.alici).eq('acik', false);
      kapali.set(b.alici, new Set((data ?? []).map((x) => x.kaynak)));
    }
    if (!eski && !kapali.get(b.alici)!.has(b.kaynak)) {
      if (!abonelik.has(b.alici)) {
        const { data } = await sb.from('push_abone').select('endpoint, p256dh, auth').eq('uye', b.alici);
        abonelik.set(b.alici, data ?? []);
      }
      const yuk = JSON.stringify({ title: b.baslik, body: b.metin ?? '', url: b.ac ?? '/', tag: b.id, kaynak: b.kaynak });
      for (const s of abonelik.get(b.alici)!) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, yuk);
          gonderilen++;
        } catch (e) {
          const st = (e as { statusCode?: number }).statusCode;
          if (st === 404 || st === 410) await sb.from('push_abone').delete().eq('endpoint', s.endpoint);
        }
      }
    } else atlanan++;
    await sb.from('bildirim').update({ gonderildi: simdi }).eq('id', b.id);
  }
  // Temizlik: 7 günden eski gönderilmiş kayıtlar.
  await sb.from('bildirim').delete().lt('gonderildi', new Date(Date.now() - 7 * 86400_000).toISOString());
  return new Response(JSON.stringify({ kuyruk: kuyruk?.length ?? 0, gonderilen, atlanan }), { headers: { 'Content-Type': 'application/json' } });
});

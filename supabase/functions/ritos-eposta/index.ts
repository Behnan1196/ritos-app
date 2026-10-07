// Supabase Edge Function — grup davet e-postası (8 ekim).
// Deploy: Dashboard → Edge Functions → Deploy a new function → adı "ritos-eposta", bu içeriği yapıştır.
//   "Verify JWT" KAPALI olmalı (09-kisi-davet.sql'deki tetikleyici x-ritos-cron başlığıyla çağırır).
// Secrets (Dashboard → Edge Functions → Secrets):
//   RITOS_SMTP_KULLANICI — Gmail adresi (Supabase SMTP'ye girdiğin)
//   RITOS_SMTP_SIFRE     — aynı Gmail uygulama şifresi (16 harf)
//   RITOS_SITE           — (isteğe bağlı) https://ritos-app.vercel.app
//   RITOS_CRON_GIZLI     — zaten var (ritos-bildirim ile ortak)
// Gmail'in 465 (SSL) portu kullanılır; Supabase 25 ve 587'yi kapatıyor.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('RITOS_SECRET_KEY')!);
const kullanici = Deno.env.get('RITOS_SMTP_KULLANICI')!;
const posta = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: kullanici, pass: Deno.env.get('RITOS_SMTP_SIFRE')! } });
const site = (Deno.env.get('RITOS_SITE') ?? 'https://ritos-app.vercel.app').replace(/\/$/, '');
const kacis = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  const gizli = Deno.env.get('RITOS_CRON_GIZLI');
  if (!gizli || req.headers.get('x-ritos-cron') !== gizli) return new Response('yetkisiz', { status: 401 });
  const { davet } = await req.json().catch(() => ({ davet: null }));
  if (!davet) return new Response('davet yok', { status: 400 });
  const { data: d, error } = await sb.from('grup_kisi_davet')
    .select('id, grup_id, davet_eden, alici_eposta, alici_ad, durum, eposta_gonderildi').eq('id', davet).maybeSingle();
  if (error || !d) return new Response('bulunamadı', { status: 404 });
  if (!d.alici_eposta || d.durum !== 'bekliyor' || d.eposta_gonderildi) return new Response('atlandı');
  const [{ data: g }, { data: p }] = await Promise.all([
    sb.from('grup').select('ad').eq('id', d.grup_id).maybeSingle(),
    sb.from('profil').select('gorunen_ad, eposta').eq('id', d.davet_eden).maybeSingle(),
  ]);
  const kim = p?.gorunen_ad || p?.eposta?.split('@')[0] || 'Bir tanıdığın';
  const grup = g?.ad ?? 'bir grup';
  const merhaba = d.alici_ad ? `Merhaba ${d.alici_ad},` : 'Merhaba,';
  const metin = `${merhaba}\n\n${kim} seni Ritos'ta "${grup}" grubuna çağırıyor.\n\nKatılmak için ${site} adresine gir ve bu e-posta adresinle (${d.alici_eposta}) devam et. Davet seni Gruplar'da bekliyor olacak.\n\nRitos`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#2c2a24;max-width:480px">
<p>${kacis(merhaba)}</p>
<p><b>${kacis(kim)}</b> seni Ritos'ta <b>"${kacis(grup)}"</b> grubuna çağırıyor.</p>
<p><a href="${site}" style="display:inline-block;background:#5f8a4e;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Ritos'u aç</a></p>
<p style="color:#6f6652;font-size:14px">Bu e-posta adresinle (${kacis(d.alici_eposta)}) devam et; davet Gruplar'da seni bekliyor olacak.</p>
</div>`;
  try {
    await posta.sendMail({ from: `Ritos <${kullanici}>`, to: d.alici_eposta, subject: `${kim} seni "${grup}" grubuna çağırıyor`, text: metin, html });
  } catch (e) {
    return new Response(JSON.stringify({ hata: String(e) }), { status: 502 });
  }
  await sb.from('grup_kisi_davet').update({ eposta_gonderildi: new Date().toISOString() }).eq('id', d.id);
  return new Response('gönderildi');
});

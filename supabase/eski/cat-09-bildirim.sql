-- =====================================================================
-- RITOS — cat-09: BİLDİRİM KUYRUĞU + CİHAZ ABONELİKLERİ (2 ekim)
-- ÖNCE: 'ritos-bildirim' Edge Function'ı deploy et ve RITOS_VAPID_* secret'larını gir
--       (bkz. supabase/functions/ritos-bildirim/index.ts başındaki not).
-- Sonra bunu SQL Editor'de çalıştır.
--
-- Kuyruk: aynı Supabase'i kullanan her uygulama (ve Ritos'un kendi kart hatırlatmaları)
-- kullanıcıya bildirim göndermek için cat_bildirim'e bir satır yazar. Ritos'un dakikalık
-- görevi zamanı gelenleri kullanıcının tüm cihazlarına Web Push ile iletir.
--   insert into cat_bildirim (kaynak, baslik, metin, ac, gonder_zamani)
--   values ('beslenme', 'Akşam öğünü', 'Bugünkü planına bak', '/', now() + interval '2 hours');
-- (alici varsayılan olarak giriş yapmış kullanıcıdır.)
-- =====================================================================

-- Cihaz abonelikleri (Web Push)
create table if not exists cat_push_abone (
  endpoint   text primary key,
  uye        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  cihaz      text,
  olusturuldu timestamptz not null default now()
);
alter table cat_push_abone enable row level security;
drop policy if exists cat_push_abone_kendi on cat_push_abone;
create policy cat_push_abone_kendi on cat_push_abone for all
  using (uye = auth.uid()) with check (uye = auth.uid());
create index if not exists cat_push_abone_uye on cat_push_abone (uye);

-- Bildirim kuyruğu
create table if not exists cat_bildirim (
  id            uuid primary key default gen_random_uuid(),
  alici         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kaynak        text not null,                 -- 'ritos' (kart hatırlatmaları), 'beslenme', …
  anahtar       text,                          -- isteğe bağlı: aynı anahtarla yeniden yazınca günceller (upsert)
  baslik        text not null,
  metin         text,
  ac            text,                          -- dokununca açılacak adres (Ritos içi '/…' ya da https://…)
  gonder_zamani timestamptz not null default now(),
  gonderildi    timestamptz,
  olusturuldu   timestamptz not null default now(),
  unique (alici, anahtar)
);
alter table cat_bildirim enable row level security;
drop policy if exists cat_bildirim_kendi on cat_bildirim;
create policy cat_bildirim_kendi on cat_bildirim for all
  using (alici = auth.uid()) with check (alici = auth.uid());
create index if not exists cat_bildirim_bekleyen on cat_bildirim (gonder_zamani) where gonderildi is null;

-- Kaynak bazında aç/kapat (satır yoksa açık sayılır)
create table if not exists cat_bildirim_kaynak (
  uye    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kaynak text not null,
  acik   boolean not null default true,
  primary key (uye, kaynak)
);
alter table cat_bildirim_kaynak enable row level security;
drop policy if exists cat_bildirim_kaynak_kendi on cat_bildirim_kaynak;
create policy cat_bildirim_kaynak_kendi on cat_bildirim_kaynak for all
  using (uye = auth.uid()) with check (uye = auth.uid());

-- Dakikada bir Edge Function'ı tetikle (Rite'taki rite-send-reminders ile aynı kalıp, ayrı ad)
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('ritos-bildirim'); exception when others then null; end $$;
select cron.schedule('ritos-bildirim', '* * * * *', $$
  select net.http_post(
    url := 'https://qbfxtrtphilbsxxumfao.supabase.co/functions/v1/ritos-bildirim',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZnh0cnRwaGlsYnN4eHVtZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDczMTYsImV4cCI6MjA5ODM4MzMxNn0.tdmuCzM7uoimgGikeKphDP85dsiW1KVtHPMSvlFeGog'
    ),
    body := '{}'::jsonb
  );
$$);

-- Kontrol:
--   select * from cron.job where jobname = 'ritos-bildirim';
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select * from cat_bildirim order by olusturuldu desc limit 10;

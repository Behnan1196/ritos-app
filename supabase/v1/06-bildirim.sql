-- =====================================================================
-- RITOS v1 — 06: BİLDİRİMLER (Web Push kuyruğu, 7 ekim 2026)
-- Uygulama zamanı gelecek bildirimleri 'bildirim' tablosuna yazar; 'ritos-bildirim' Edge Function'ı
-- dakikada bir (pg_cron) kuyruğu okuyup Web Push gönderir. Çevrem'de rica gelince ve e-postayla
-- danışmanlık daveti gelince de bildirim düşer (tetikler aşağıda).
--
-- ÖNCE (bir kez) Vault'a iki sır koy — SQL Editor'de:
--   select vault.create_secret('https://<proje-ref>.supabase.co', 'ritos_proje_url');
--   select vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'ritos_cron_gizli');
-- Sonra cron gizlisini oku ve Edge Function secret'ı RITOS_CRON_GIZLI olarak aynı değeri gir:
--   select decrypted_secret from vault.decrypted_secrets where name = 'ritos_cron_gizli';
-- 01-temel.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

create table if not exists public.push_abone (
  endpoint    text primary key,
  uye         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  cihaz       text,
  olusturuldu timestamptz not null default now()
);
alter table public.push_abone enable row level security;
drop policy if exists push_abone_kendi on public.push_abone;
create policy push_abone_kendi on public.push_abone for all using (uye = auth.uid()) with check (uye = auth.uid());
create index if not exists push_abone_uye on public.push_abone (uye);

create table if not exists public.bildirim (
  id            uuid primary key default gen_random_uuid(),
  alici         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kaynak        text not null,                 -- 'ritos' (kart hatırlatmaları), 'cevrem', 'danismanlik', …
  anahtar       text,                          -- aynı anahtarla yeniden yazınca günceller (upsert)
  baslik        text not null,
  metin         text,
  ac            text,                          -- dokununca açılacak adres
  gonder_zamani timestamptz not null default now(),
  gonderildi    timestamptz,
  olusturuldu   timestamptz not null default now(),
  unique (alici, anahtar)
);
alter table public.bildirim enable row level security;
drop policy if exists bildirim_kendi on public.bildirim;
create policy bildirim_kendi on public.bildirim for all using (alici = auth.uid()) with check (alici = auth.uid());
create index if not exists bildirim_bekleyen on public.bildirim (gonder_zamani) where gonderildi is null;

create table if not exists public.bildirim_kaynak (
  uye    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kaynak text not null,
  acik   boolean not null default true,
  primary key (uye, kaynak)
);
alter table public.bildirim_kaynak enable row level security;
drop policy if exists bildirim_kaynak_kendi on public.bildirim_kaynak;
create policy bildirim_kaynak_kendi on public.bildirim_kaynak for all using (uye = auth.uid()) with check (uye = auth.uid());

-- ——— olay bildirimleri (sunucuda, tetikleyiciyle) ———————————————————————
create or replace function public.rica_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
declare ad text;
begin
  select gorunen_ad into ad from public.profil where id = new.isteyen;
  insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
  values (new.istenen, 'cevrem', 'rica:' || new.id, coalesce(nullif(ad, ''), 'Biri') || ' senden rica ediyor', new.ad, '/')
  on conflict (alici, anahtar) do nothing;
  return new;
end $$;
drop trigger if exists rica_bildir_tetik on public.rica;
create trigger rica_bildir_tetik after insert on public.rica for each row execute function public.rica_bildir();

create or replace function public.dan_davet_bildir() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare kim uuid;
begin
  if new.alici_eposta is null then return new; end if;
  select id into kim from auth.users where public.eposta_anahtar(email) = public.eposta_anahtar(new.alici_eposta) limit 1;
  if kim is null or kim = new.koc then return new; end if;
  insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
  values (kim, 'danismanlik', 'davet:' || new.kod, 'Danışmanlık daveti', new.koc_ad || ' seni danışanı olarak eklemek istiyor', '/')
  on conflict (alici, anahtar) do nothing;
  return new;
end $$;
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'dan_davet') then
    execute 'drop trigger if exists dan_davet_bildir_tetik on public.dan_davet';
    execute 'create trigger dan_davet_bildir_tetik after insert on public.dan_davet for each row execute function public.dan_davet_bildir()';
  end if;
end $$;

-- ——— dakikalık gönderim (pg_cron → Edge Function) ———————————————————————
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('ritos-bildirim'); exception when others then null; end $$;
select cron.schedule('ritos-bildirim', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ritos_proje_url') || '/functions/v1/ritos-bildirim',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ritos-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'ritos_cron_gizli')
    ),
    body := '{}'::jsonb
  );
$cron$);

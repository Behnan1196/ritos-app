-- =====================================================================
-- RITOS v1 — 09: KİŞİYE GRUP DAVETİ + E-POSTA LİSTEM (8 ekim 2026)
-- Kod paylaşmadan davet:
--   • Tanıdığa (benimle bir grupta olan biri): davet doğrudan onun Gruplar ekranına düşer (+ bildirim).
--   • E-postayla: davet o e-postaya bağlı bekler; kişi Ritos'a o e-postayla girince görür.
--     Ayrıca 'ritos-eposta' Edge Function'ı ona bir davet e-postası yollar (Gmail SMTP).
--   Gizlilik: gönderene e-postanın Ritos'ta kayıtlı olup olmadığı hiçbir durumda söylenmez.
-- 'rehber': kişinin kendi e-posta listesi (yalnız kendisi görür); e-postayla davet edince kendiliğinden eklenir.
-- 03-cevrem.sql ve 06-bildirim.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

-- ——— kişiye davet ——————————————————————————————————————————————————————
create table if not exists public.grup_kisi_davet (
  id                uuid primary key default gen_random_uuid(),
  grup_id           uuid not null references public.grup(id) on delete cascade,
  davet_eden        uuid not null references auth.users(id) on delete cascade,
  alici             uuid references auth.users(id) on delete cascade,
  alici_eposta      text,
  alici_ad          text,
  durum             text not null default 'bekliyor' check (durum in ('bekliyor', 'kabul', 'ret', 'iptal')),
  eposta_gonderildi timestamptz,
  olusturuldu       timestamptz not null default now(),
  guncellendi       timestamptz not null default now(),
  check (alici is not null or alici_eposta is not null)
);
create index if not exists grup_kisi_davet_grup on public.grup_kisi_davet (grup_id) where durum = 'bekliyor';
create index if not exists grup_kisi_davet_alici on public.grup_kisi_davet (alici) where durum = 'bekliyor';
create index if not exists grup_kisi_davet_eposta on public.grup_kisi_davet (lower(alici_eposta)) where durum = 'bekliyor';

alter table public.grup_kisi_davet enable row level security;
drop policy if exists grup_kisi_davet_oku on public.grup_kisi_davet;
create policy grup_kisi_davet_oku on public.grup_kisi_davet for select using (
  public.grup_uyesi_mi(grup_id) or alici = auth.uid()
  or (alici_eposta is not null and lower(alici_eposta) = lower(coalesce(auth.jwt() ->> 'email', '')))
);
-- yazma yalnız aşağıdaki işlevlerle

-- ——— e-posta listem ————————————————————————————————————————————————————
create table if not exists public.rehber (
  sahip       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eposta      text not null,
  ad          text,
  olusturuldu timestamptz not null default now(),
  primary key (sahip, eposta)
);
alter table public.rehber enable row level security;
drop policy if exists rehber_kendi on public.rehber;
create policy rehber_kendi on public.rehber for all using (sahip = auth.uid()) with check (sahip = auth.uid());

-- ——— işlevler ————————————————————————————————————————————————————————
create or replace function public.grup_kisi_davet_gonder(p_grup uuid, p_alici uuid default null, p_eposta text default null, p_ad text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare e text := nullif(lower(trim(coalesce(p_eposta, ''))), ''); n int; kim uuid;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  if not public.grup_uyesi_mi(p_grup) then raise exception 'bu grubun üyesi değilsin'; end if;
  if (p_alici is null) = (e is null) then raise exception 'bir kişi ya da e-posta seç'; end if;
  select count(*) into n from public.grup_uye where grup_id = p_grup and durum = 'aktif';
  if n >= 12 then raise exception 'Grup dolu (en fazla 12 kişi)'; end if;

  if p_alici is not null then
    if not public.ayni_grupta_mi(p_alici) then raise exception 'bu kişiyi tanımıyoruz'; end if;
    if exists (select 1 from public.grup_uye where grup_id = p_grup and uye_id = p_alici and durum = 'aktif') then raise exception 'zaten bu grupta'; end if;
    if exists (select 1 from public.grup_kisi_davet where grup_id = p_grup and alici = p_alici and durum = 'bekliyor') then return; end if;
    insert into public.grup_kisi_davet (grup_id, davet_eden, alici, alici_ad) values (p_grup, auth.uid(), p_alici, nullif(trim(p_ad), ''));
    return;
  end if;

  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-posta adresi doğru görünmüyor'; end if;
  insert into public.rehber (sahip, eposta, ad) values (auth.uid(), e, nullif(trim(p_ad), ''))
  on conflict (sahip, eposta) do update set ad = coalesce(excluded.ad, public.rehber.ad);
  -- Kendi e-postam ya da zaten üye olan biri: sessizce geç (kim olduğu söylenmez).
  select id into kim from auth.users where lower(email) = e;
  if kim = auth.uid() then raise exception 'bu senin e-postan'; end if;
  if kim is not null and exists (select 1 from public.grup_uye where grup_id = p_grup and uye_id = kim and durum = 'aktif') then return; end if;
  if exists (select 1 from public.grup_kisi_davet where grup_id = p_grup and lower(alici_eposta) = e and durum = 'bekliyor') then return; end if;
  select count(*) into n from public.grup_kisi_davet where davet_eden = auth.uid() and alici_eposta is not null and olusturuldu > now() - interval '1 day';
  if n >= 20 then raise exception 'Bugün yeterince e-posta daveti gönderdin; yarın yeniden dene'; end if;
  insert into public.grup_kisi_davet (grup_id, davet_eden, alici_eposta, alici_ad) values (p_grup, auth.uid(), e, nullif(trim(p_ad), ''));
end $$;
revoke all on function public.grup_kisi_davet_gonder(uuid, uuid, text, text) from public, anon;
grant execute on function public.grup_kisi_davet_gonder(uuid, uuid, text, text) to authenticated;

-- Bana gelmiş (uid'ime ya da e-postama), açık davetler — grubun adıyla.
create or replace function public.bana_gelen_grup_davetleri()
returns table (id uuid, grup_id uuid, grup_ad text, grup_tur text, grup_ikon text, davet_eden_ad text, uye_sayisi int, olusturuldu timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select d.id, g.id, g.ad, g.tur, g.ikon, coalesce(nullif(p.gorunen_ad, ''), split_part(p.eposta, '@', 1), 'Biri'),
         (select count(*)::int from public.grup_uye u where u.grup_id = g.id and u.durum = 'aktif'), d.olusturuldu
    from public.grup_kisi_davet d
    join public.grup g on g.id = d.grup_id
    left join public.profil p on p.id = d.davet_eden
    join auth.users me on me.id = auth.uid()
   where d.durum = 'bekliyor' and d.olusturuldu > now() - interval '30 days'
     and (d.alici = auth.uid() or (d.alici_eposta is not null and lower(d.alici_eposta) = lower(me.email)))
     and not exists (select 1 from public.grup_uye u where u.grup_id = d.grup_id and u.uye_id = auth.uid() and u.durum = 'aktif')
   order by d.olusturuldu desc;
$$;
revoke all on function public.bana_gelen_grup_davetleri() from public, anon;
grant execute on function public.bana_gelen_grup_davetleri() to authenticated;

create or replace function public.grup_kisi_davet_yanit(p_id uuid, p_kabul boolean) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare d public.grup_kisi_davet%rowtype; e text; n int;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  select lower(email) into e from auth.users where id = auth.uid();
  select * into d from public.grup_kisi_davet where id = p_id for update;
  if not found or d.durum <> 'bekliyor' then raise exception 'Bu davet artık geçerli değil'; end if;
  if not (coalesce(d.alici = auth.uid(), false) or coalesce(lower(d.alici_eposta) = e, false)) then raise exception 'Bu davet sana değil'; end if;
  if p_kabul then
    select count(*) into n from public.grup_uye where grup_id = d.grup_id and durum = 'aktif';
    if n >= 12 then raise exception 'Grup dolu (en fazla 12 kişi)'; end if;
    insert into public.grup_uye (grup_id, uye_id, rol, durum) values (d.grup_id, auth.uid(), 'uye', 'aktif')
    on conflict (grup_id, uye_id) do update set durum = 'aktif', katildi = now();
  end if;
  -- Aynı gruba bana gelen diğer davetler de kapansın.
  update public.grup_kisi_davet set durum = case when p_kabul then 'kabul' else 'ret' end, guncellendi = now()
   where grup_id = d.grup_id and durum = 'bekliyor' and (alici = auth.uid() or lower(alici_eposta) = e);
  return d.grup_id;
end $$;
revoke all on function public.grup_kisi_davet_yanit(uuid, boolean) from public, anon;
grant execute on function public.grup_kisi_davet_yanit(uuid, boolean) to authenticated;

create or replace function public.grup_kisi_davet_iptal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.grup_kisi_davet set durum = 'iptal', guncellendi = now()
   where id = p_id and durum = 'bekliyor' and (davet_eden = auth.uid() or public.grup_yoneticisi_mi(grup_id));
end $$;
revoke all on function public.grup_kisi_davet_iptal(uuid) from public, anon;
grant execute on function public.grup_kisi_davet_iptal(uuid) to authenticated;

-- ——— bildirim + e-posta (tetikleyiciyle) ————————————————————————————————
create or replace function public.grup_kisi_davet_bildir() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare kim uuid := new.alici; ad text; gad text; url text; gizli text;
begin
  if kim is null then select id into kim from auth.users where lower(email) = lower(new.alici_eposta); end if;
  select coalesce(nullif(gorunen_ad, ''), 'Biri') into ad from public.profil where id = new.davet_eden;
  select g.ad into gad from public.grup g where g.id = new.grup_id;
  if kim is not null and kim <> new.davet_eden then
    begin
      insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
      values (kim, 'cevrem', 'gdavet:' || new.id, coalesce(ad, 'Biri') || ' seni bir gruba çağırıyor', '"' || gad || '"', '/')
      on conflict (alici, anahtar) do nothing;
    exception when undefined_table then null;
    end;
  end if;
  -- E-postayla davette davet e-postasını Edge Function yollar (06'daki Vault sırları varsa).
  if new.alici_eposta is not null then
    begin
      select decrypted_secret into url from vault.decrypted_secrets where name = 'ritos_proje_url';
      select decrypted_secret into gizli from vault.decrypted_secrets where name = 'ritos_cron_gizli';
      if url is not null and gizli is not null then
        perform net.http_post(
          url := url || '/functions/v1/ritos-eposta',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-ritos-cron', gizli),
          body := jsonb_build_object('davet', new.id)
        );
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
drop trigger if exists grup_kisi_davet_bildir_tetik on public.grup_kisi_davet;
create trigger grup_kisi_davet_bildir_tetik after insert on public.grup_kisi_davet for each row execute function public.grup_kisi_davet_bildir();

-- ——— canlılık ——————————————————————————————————————————————————————————
do $$ begin
  begin
    alter publication supabase_realtime add table public.grup_kisi_davet;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;

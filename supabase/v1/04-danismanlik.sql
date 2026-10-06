-- =====================================================================
-- RITOS v1 — 04: DANIŞMANLIK (köprü, 7 ekim 2026)
-- Eski cat-04'ün şifresiz hali. Danışmanlık motoru (lib/danismanlik.ts) aynen çalışır; mesajlar
-- artık düz JSON (veri jsonb metni), anahtar tabloları yok. İleride program/geri bildirim
-- doğrudan tablolara taşınacak (şema v1 › Danışmanlık).
-- 01-temel.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

-- ——— koç–danışan ilişkisi ——————————————————————————————————————————————
create table if not exists public.iliski (
  id           uuid primary key default gen_random_uuid(),
  koc          uuid not null references auth.users(id) on delete cascade,
  danisan      uuid not null references auth.users(id) on delete cascade,
  disiplin     text not null,
  koc_ad       text not null,
  danisan_ad   text not null,
  durum        text not null default 'aktif' check (durum in ('aktif', 'sonlandi')),
  olusturuldu  timestamptz not null default now(),
  sonlandi     timestamptz,
  sonlandiran  uuid
);
create index if not exists iliski_koc_idx on public.iliski (koc);
create index if not exists iliski_danisan_idx on public.iliski (danisan);
alter table public.iliski enable row level security;
drop policy if exists iliski_taraflar on public.iliski;
create policy iliski_taraflar on public.iliski for select using (auth.uid() = koc or auth.uid() = danisan);

-- Koç ile danışanı birbirinin profilini (ad, avatar) görebilir.
drop policy if exists profil_iliski_oku on public.profil;
create policy profil_iliski_oku on public.profil for select using (
  exists (select 1 from public.iliski i where (i.koc = auth.uid() and i.danisan = profil.id) or (i.danisan = auth.uid() and i.koc = profil.id))
);

-- ——— davet (kodla) ————————————————————————————————————————————————————
create table if not exists public.dan_davet (
  kod          text primary key,
  koc          uuid not null references auth.users(id) on delete cascade,
  koc_ad       text not null,
  disiplin     text not null,
  alici        uuid references auth.users(id) on delete cascade,
  son          timestamptz not null default now() + interval '7 days',
  kullanildi   boolean not null default false,
  olusturuldu  timestamptz not null default now()
);
alter table public.dan_davet enable row level security;
drop policy if exists dan_davet_koc on public.dan_davet;
create policy dan_davet_koc on public.dan_davet for all using (auth.uid() = koc) with check (auth.uid() = koc);

create or replace function public.dan_davet_bak(p_kod text)
returns table (koc_ad text, disiplin text, gecerli boolean, kendi boolean)
language sql stable security definer set search_path = public as $$
  select d.koc_ad, d.disiplin, (not d.kullanildi and d.son > now()), d.koc = auth.uid()
    from public.dan_davet d where auth.uid() is not null and d.kod = p_kod;
$$;
revoke all on function public.dan_davet_bak(text) from public, anon;
grant execute on function public.dan_davet_bak(text) to authenticated;

create or replace function public.dan_davet_yanit(p_kod text, p_kabul boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.dan_davet%rowtype; v_ad text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  select * into d from public.dan_davet where kod = p_kod for update;
  if not found then raise exception 'davet bulunamadı'; end if;
  if d.koc = auth.uid() then raise exception 'kendi davetin'; end if;
  if d.kullanildi or d.son <= now() then raise exception 'davetin süresi dolmuş ya da kullanılmış'; end if;
  update public.dan_davet set kullanildi = true where kod = p_kod;
  if not p_kabul then return null; end if;
  select id into v_id from public.iliski where koc = d.koc and danisan = auth.uid() and disiplin = d.disiplin and durum = 'aktif';
  if v_id is not null then return v_id; end if;
  select gorunen_ad into v_ad from public.profil where id = auth.uid();
  insert into public.iliski (koc, danisan, disiplin, koc_ad, danisan_ad)
  values (d.koc, auth.uid(), d.disiplin, d.koc_ad, coalesce(nullif(v_ad, ''), 'Danışan')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.dan_davet_yanit(text, boolean) from public, anon;
grant execute on function public.dan_davet_yanit(text, boolean) to authenticated;

create or replace function public.iliski_sonlandir(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.iliski set durum = 'sonlandi', sonlandi = now(), sonlandiran = auth.uid()
   where id = p_id and durum = 'aktif' and auth.uid() in (koc, danisan);
$$;
revoke all on function public.iliski_sonlandir(uuid) from public, anon;
grant execute on function public.iliski_sonlandir(uuid) to authenticated;

-- ——— mesajlar (program, geri bildirim, sohbet, haftalık not) ————————————
create table if not exists public.mesaj (
  sira         bigint generated always as identity primary key,
  iliski       uuid not null references public.iliski(id) on delete cascade,
  gonderen     uuid not null references auth.users(id) on delete cascade,
  alici        uuid not null references auth.users(id) on delete cascade,
  veri         text not null,                 -- düz JSON
  olusturuldu  timestamptz not null default now()
);
create index if not exists mesaj_alici_idx on public.mesaj (alici, sira);
alter table public.mesaj enable row level security;
drop policy if exists mesaj_alici_okur on public.mesaj;
drop policy if exists mesaj_alici_siler on public.mesaj;
drop policy if exists mesaj_gonderen_yazar on public.mesaj;
create policy mesaj_alici_okur on public.mesaj for select using (auth.uid() = alici);
create policy mesaj_alici_siler on public.mesaj for delete using (auth.uid() = alici);
create policy mesaj_gonderen_yazar on public.mesaj for insert with check (
  auth.uid() = gonderen and exists (
    select 1 from public.iliski i where i.id = iliski and i.durum = 'aktif'
      and ((i.koc = auth.uid() and i.danisan = alici) or (i.danisan = auth.uid() and i.koc = alici))
  )
);

-- profil: koç kendi koç alanlarını yazabilir (01'deki profil_kendi_yaz zaten kapsıyor).

do $$
declare t text;
begin
  foreach t in array array['iliski', 'mesaj'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

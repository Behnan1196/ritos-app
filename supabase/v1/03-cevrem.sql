-- =====================================================================
-- RITOS v1 — 03: ÇEVREM (7 ekim 2026)
-- Ailem ve arkadaş grupları: üyelik, davet kodu, ortak listeler, ortak işler, ricalar.
-- Şifre yok; yetki RLS ile: bir grubun satırlarını yalnız o grubun aktif üyeleri görür/yazar.
-- Canlılık: tablolar supabase_realtime yayınında (RLS Realtime'da da geçerli).
-- 01-temel.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

-- ——— gruplar ve üyelik ——————————————————————————————————————————————
create table if not exists public.grup (
  id           uuid primary key default gen_random_uuid(),
  ad           text not null,
  tur          text not null default 'aile' check (tur in ('aile', 'arkadas')),
  ikon         text,
  kurucu       uuid not null references auth.users(id) on delete cascade,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);

create table if not exists public.grup_uye (
  grup_id      uuid not null references public.grup(id) on delete cascade,
  uye_id       uuid not null references auth.users(id) on delete cascade,
  rol          text not null default 'uye' check (rol in ('yonetici', 'uye')),
  durum        text not null default 'aktif' check (durum in ('aktif', 'ayrildi')),
  katildi      timestamptz not null default now(),
  primary key (grup_id, uye_id)
);
create index if not exists grup_uye_uye_idx on public.grup_uye (uye_id);

create or replace function public.grup_uyesi_mi(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grup_uye where grup_id = g and uye_id = auth.uid() and durum = 'aktif')
$$;

create or replace function public.grup_yoneticisi_mi(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.grup_uye where grup_id = g and uye_id = auth.uid() and durum = 'aktif' and rol = 'yonetici')
$$;

-- Aynı grupta olduğum kişinin profilini (ad, avatar) görebilirim.
create or replace function public.ayni_grupta_mi(kisi uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.grup_uye a join public.grup_uye b on a.grup_id = b.grup_id
     where a.uye_id = auth.uid() and a.durum = 'aktif' and b.uye_id = kisi and b.durum = 'aktif'
  )
$$;
drop policy if exists profil_grup_oku on public.profil;
create policy profil_grup_oku on public.profil for select using (public.ayni_grupta_mi(id));

alter table public.grup enable row level security;
drop policy if exists grup_oku on public.grup;
drop policy if exists grup_yaz on public.grup;
create policy grup_oku on public.grup for select using (public.grup_uyesi_mi(id));
create policy grup_yaz on public.grup for update using (public.grup_yoneticisi_mi(id)) with check (public.grup_yoneticisi_mi(id));
-- grup ekleme/silme yalnız aşağıdaki işlevlerle

alter table public.grup_uye enable row level security;
drop policy if exists grup_uye_oku on public.grup_uye;
create policy grup_uye_oku on public.grup_uye for select using (public.grup_uyesi_mi(grup_id) or uye_id = auth.uid());
-- üyelik değişiklikleri yalnız işlevlerle

-- ——— davet kodu ——————————————————————————————————————————————————————
create table if not exists public.grup_davet (
  kod          text primary key,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  olusturan    uuid not null references auth.users(id) on delete cascade,
  son          timestamptz not null default now() + interval '7 days'
);
alter table public.grup_davet enable row level security;
drop policy if exists grup_davet_oku on public.grup_davet;
create policy grup_davet_oku on public.grup_davet for select using (public.grup_uyesi_mi(grup_id));

-- ——— işlevler ————————————————————————————————————————————————————————
create or replace function public.grup_kur(p_ad text, p_tur text default 'aile') returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  insert into public.grup (ad, tur, kurucu) values (trim(p_ad), coalesce(p_tur, 'aile'), auth.uid()) returning id into g;
  insert into public.grup_uye (grup_id, uye_id, rol) values (g, auth.uid(), 'yonetici');
  return g;
end $$;

-- 6 harfli, karıştırılmayan harflerden kod (0/O, 1/I yok).
create or replace function public.grup_davet_olustur(p_grup uuid) returns text
language plpgsql security definer set search_path = public as $$
declare k text; harf text := 'ABCDEFGHJKLMNPRSTUVYZ23456789';
begin
  if not public.grup_uyesi_mi(p_grup) then raise exception 'bu grubun üyesi değilsin'; end if;
  delete from public.grup_davet where grup_id = p_grup and son < now();
  select kod into k from public.grup_davet where grup_id = p_grup and son > now() + interval '1 day' order by son desc limit 1;
  if k is not null then return k; end if;
  loop
    k := '';
    for i in 1..6 loop k := k || substr(harf, 1 + floor(random() * length(harf))::int, 1); end loop;
    exit when not exists (select 1 from public.grup_davet where kod = k);
  end loop;
  insert into public.grup_davet (kod, grup_id, olusturan) values (k, p_grup, auth.uid());
  return k;
end $$;

-- Koda bakış (katılmadan önce grubun adını göstermek için).
create or replace function public.grup_davet_bak(p_kod text) returns table (grup_id uuid, ad text, tur text, uye_sayisi int)
language sql stable security definer set search_path = public as $$
  select g.id, g.ad, g.tur, (select count(*)::int from public.grup_uye u where u.grup_id = g.id and u.durum = 'aktif')
    from public.grup_davet d join public.grup g on g.id = d.grup_id
   where d.kod = upper(trim(p_kod)) and d.son > now()
$$;

create or replace function public.grup_katil(p_kod text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid; n int;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  select grup_id into g from public.grup_davet where kod = upper(trim(p_kod)) and son > now();
  if g is null then raise exception 'Kod geçersiz ya da süresi dolmuş'; end if;
  select count(*) into n from public.grup_uye where grup_id = g and durum = 'aktif';
  if n >= 12 then raise exception 'Grup dolu (en fazla 12 kişi)'; end if;
  insert into public.grup_uye (grup_id, uye_id, rol, durum) values (g, auth.uid(), 'uye', 'aktif')
  on conflict (grup_id, uye_id) do update set durum = 'aktif', katildi = now();
  return g;
end $$;

-- Ayrıl (kişi null) ya da yönetici olarak birini çıkar. Son yönetici ayrılırsa en eski üye yönetici olur;
-- kimse kalmazsa grup silinir.
create or replace function public.grup_ayril(p_grup uuid, p_kisi uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare k uuid := coalesce(p_kisi, auth.uid()); yeni uuid;
begin
  if k <> auth.uid() and not public.grup_yoneticisi_mi(p_grup) then raise exception 'yalnız yönetici çıkarabilir'; end if;
  update public.grup_uye set durum = 'ayrildi', rol = 'uye' where grup_id = p_grup and uye_id = k;
  update public.ortak_is set ustlenen = null, guncellendi = now() where grup_id = p_grup and ustlenen = k;
  if not exists (select 1 from public.grup_uye where grup_id = p_grup and durum = 'aktif') then
    delete from public.grup where id = p_grup; return;
  end if;
  if not exists (select 1 from public.grup_uye where grup_id = p_grup and durum = 'aktif' and rol = 'yonetici') then
    select uye_id into yeni from public.grup_uye where grup_id = p_grup and durum = 'aktif' order by katildi limit 1;
    update public.grup_uye set rol = 'yonetici' where grup_id = p_grup and uye_id = yeni;
  end if;
end $$;

-- ——— ortak listeler ——————————————————————————————————————————————————
create table if not exists public.liste (
  id           uuid primary key default gen_random_uuid(),
  grup_id      uuid not null references public.grup(id) on delete cascade,
  ad           text not null,
  ikon         text,
  olusturan    uuid references auth.users(id) on delete set null,
  silindi      boolean not null default false,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create table if not exists public.liste_madde (
  id           uuid primary key default gen_random_uuid(),
  liste_id     uuid not null references public.liste(id) on delete cascade,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  metin        text not null,
  ekleyen      uuid references auth.users(id) on delete set null,
  isaretli     boolean not null default false,
  isaret_kim   uuid references auth.users(id) on delete set null,
  isaret_zaman timestamptz,
  silindi      boolean not null default false,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create index if not exists liste_grup_idx on public.liste (grup_id);
create index if not exists liste_madde_liste_idx on public.liste_madde (liste_id);

-- ——— ortak işler ——————————————————————————————————————————————————————
-- Tek seferlik (bitis = tarih) ya da tekrar eden (gunler: JS getDay 0=Paz…6=Cmt, null = her gün; bitis null = süregelen).
create table if not exists public.ortak_is (
  id             uuid primary key default gen_random_uuid(),
  grup_id        uuid not null references public.grup(id) on delete cascade,
  ad             text not null,
  aciklama       text,
  tarih          date not null,
  bitis          date,
  gunler         int[],
  saat           text,
  ustlenen       uuid references auth.users(id) on delete set null,
  ustlenme_zaman timestamptz,
  olusturan      uuid references auth.users(id) on delete set null,
  silindi        boolean not null default false,
  olusturuldu    timestamptz not null default now(),
  guncellendi    timestamptz not null default now()
);
create index if not exists ortak_is_grup_idx on public.ortak_is (grup_id);
create table if not exists public.ortak_is_kayit (
  is_id        uuid not null references public.ortak_is(id) on delete cascade,
  tarih        date not null,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  yapildi      boolean not null default true,
  yapan        uuid references auth.users(id) on delete set null,
  zaman        timestamptz not null default now(),
  primary key (is_id, tarih)
);

-- ——— ricalar ——————————————————————————————————————————————————————————
create table if not exists public.rica (
  id           uuid primary key default gen_random_uuid(),
  grup_id      uuid not null references public.grup(id) on delete cascade,
  isteyen      uuid not null references auth.users(id) on delete cascade,
  istenen      uuid not null references auth.users(id) on delete cascade,
  ad           text not null,
  aciklama     text,
  tarih        date not null,
  saat         text,
  durum        text not null default 'bekliyor' check (durum in ('bekliyor', 'kabul', 'ret', 'yapildi', 'iptal')),
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create index if not exists rica_grup_idx on public.rica (grup_id);

-- ——— RLS: grubun aktif üyeleri ———————————————————————————————————————
do $$
declare t text;
begin
  foreach t in array array['liste', 'liste_madde', 'ortak_is', 'ortak_is_kayit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_grup', t);
    execute format('create policy %I on public.%I for all using (public.grup_uyesi_mi(grup_id)) with check (public.grup_uyesi_mi(grup_id))', t || '_grup', t);
  end loop;
end $$;

alter table public.rica enable row level security;
drop policy if exists rica_oku on public.rica;
drop policy if exists rica_ekle on public.rica;
drop policy if exists rica_guncelle on public.rica;
create policy rica_oku on public.rica for select using (public.grup_uyesi_mi(grup_id));
create policy rica_ekle on public.rica for insert with check (isteyen = auth.uid() and public.grup_uyesi_mi(grup_id));
create policy rica_guncelle on public.rica for update using ((isteyen = auth.uid() or istenen = auth.uid()) and public.grup_uyesi_mi(grup_id));

-- ——— Realtime ————————————————————————————————————————————————————————
do $$
declare t text;
begin
  foreach t in array array['grup', 'grup_uye', 'liste', 'liste_madde', 'ortak_is', 'ortak_is_kayit', 'rica'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

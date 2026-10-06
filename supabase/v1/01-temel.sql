-- =====================================================================
-- RITOS v1 — 01: TEMEL (7 ekim 2026)
-- Yeni, yalnız Ritos'a ait Supabase projesinde (eski adı ritos-mobile) SQL Editor'de BİR KEZ çalıştır.
-- Şifreleme yok: yetkiyi RLS belirler. Tablolar öneksiz. Web ve mobil aynı şemayı kullanır.
-- Bu dosya: profil, kişisel eşitleme (kayit), paket kataloğu, hesap silme.
-- =====================================================================

-- ——— profil ———————————————————————————————————————————————————————————
-- Yeni kullanıcı açılınca kendiliğinden kurulur (ad: Google'daki ad ya da e-postanın başı).
-- Şimdilik yalnız sahibi okur; gruplar/danışmanlık gelince "aynı grupta olan okur" kuralı eklenecek.
create table if not exists public.profil (
  id               uuid primary key references auth.users(id) on delete cascade,
  gorunen_ad       text not null default '',
  eposta           text not null default '',
  avatar_url       text,
  koc              boolean not null default false,   -- profesyonel mod açık mı
  koc_disiplinler  text[] not null default '{}',
  koc_baslangic    date,
  olusturuldu      timestamptz not null default now(),
  guncellendi      timestamptz not null default now()
);
create index if not exists profil_eposta_idx on public.profil (lower(eposta));
alter table public.profil enable row level security;
drop policy if exists profil_kendi_oku on public.profil;
drop policy if exists profil_kendi_yaz on public.profil;
create policy profil_kendi_oku on public.profil for select using (auth.uid() = id);
create policy profil_kendi_yaz on public.profil for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.yeni_kullanici() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profil (id, gorunen_ad, eposta, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'gorunen_ad', ''), nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists yeni_kullanici_tetik on auth.users;
create trigger yeni_kullanici_tetik after insert on auth.users
  for each row execute function public.yeni_kullanici();

-- ——— kişisel eşitleme ——————————————————————————————————————————————————
-- Eski cat_kayit'in şifresiz hali: veri düz JSON. Yalnız sahibi okur/yazar.
-- sira her yazımda artar: cihaz "son gördüğüm sıradan sonrasını ver" diye çeker.
create sequence if not exists public.kayit_sira;
create table if not exists public.kayit (
  sahip        uuid not null references auth.users(id) on delete cascade,
  tablo        text not null,
  kayit_id     text not null,
  veri         jsonb,                          -- silindiyse null
  silindi      boolean not null default false,
  guncellendi  bigint not null,                -- cihazdaki değişiklik zamanı (ms) — son yazan kazanır
  sira         bigint not null default nextval('public.kayit_sira'),
  primary key (sahip, tablo, kayit_id)
);
create index if not exists kayit_sira_idx on public.kayit (sahip, sira);
alter table public.kayit enable row level security;
drop policy if exists kayit_kendi on public.kayit;
create policy kayit_kendi on public.kayit for all using (auth.uid() = sahip) with check (auth.uid() = sahip);

create or replace function public.kayit_sira_ver() returns trigger
language plpgsql as $$
begin
  new.sira := nextval('public.kayit_sira');
  return new;
end $$;
drop trigger if exists kayit_sira_tetik on public.kayit;
create trigger kayit_sira_tetik before insert or update on public.kayit
  for each row execute function public.kayit_sira_ver();

-- ——— paket kataloğu ——————————————————————————————————————————————————
-- Kişisel veri değil: herkes (hesapsız da) okur. Yazma politikası yok: yalnız SQL Editor yazar.
create table if not exists public.paket (
  paket        text not null,
  kod          text not null,
  surum        int  not null default 1,
  onayli       boolean not null default false,
  onaylayan    text,
  veri         jsonb not null,
  guncellendi  timestamptz not null default now(),
  primary key (paket, kod)
);
alter table public.paket enable row level security;
drop policy if exists paket_oku on public.paket;
create policy paket_oku on public.paket for select to anon, authenticated using (true);

-- ——— hesap silme ————————————————————————————————————————————————————
-- Bu proje yalnız Ritos'un: kullanıcı auth.users'tan gerçekten silinir, her şey cascade.
create or replace function public.hesabimi_sil() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.hesabimi_sil() from public, anon;
grant execute on function public.hesabimi_sil() to authenticated;

-- ——— Realtime ————————————————————————————————————————————————————————
do $$ begin
  alter publication supabase_realtime add table public.kayit;
exception when duplicate_object then null; when undefined_object then null;
end $$;

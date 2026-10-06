-- =====================================================================
-- RITOS v1 — 08: BİRLİKTE RUTİN + BULUŞMA (7 ekim 2026)
-- Her grupta (aile ya da arkadaş):
--   • Birlikte rutin: "haftada N kez" ortak hedef. İsteyen katılır; herkes kendi gününde yapar,
--     grup kim kaç kez yaptı görür. Katılanın ajandasında kart olarak durur.
--   • Buluşma: tarih/saat/yer; herkes geliyorum / belki / gelemem der. "Geliyorum" diyenin ajandasına düşer.
-- 03-cevrem.sql ve 06-bildirim.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

-- ——— birlikte rutin ———————————————————————————————————————————————————
create table if not exists public.birlikte_rutin (
  id           uuid primary key default gen_random_uuid(),
  grup_id      uuid not null references public.grup(id) on delete cascade,
  ad           text not null,
  ikon         text,
  aciklama     text,
  hedef        int not null default 3 check (hedef between 1 and 7),   -- haftada kaç kez
  olusturan    uuid references auth.users(id) on delete set null,
  silindi      boolean not null default false,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create index if not exists birlikte_rutin_grup_idx on public.birlikte_rutin (grup_id);

create table if not exists public.birlikte_katilim (
  rutin_id     uuid not null references public.birlikte_rutin(id) on delete cascade,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  uye_id       uuid not null references auth.users(id) on delete cascade,
  durum        text not null default 'aktif' check (durum in ('aktif', 'ayrildi')),
  katildi      timestamptz not null default now(),
  primary key (rutin_id, uye_id)
);

create table if not exists public.birlikte_kayit (
  rutin_id     uuid not null references public.birlikte_rutin(id) on delete cascade,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  uye_id       uuid not null references auth.users(id) on delete cascade,
  tarih        date not null,
  zaman        timestamptz not null default now(),
  primary key (rutin_id, uye_id, tarih)
);
create index if not exists birlikte_kayit_grup_idx on public.birlikte_kayit (grup_id, tarih);

-- ——— buluşma ——————————————————————————————————————————————————————————
create table if not exists public.bulusma (
  id           uuid primary key default gen_random_uuid(),
  grup_id      uuid not null references public.grup(id) on delete cascade,
  ad           text not null,
  aciklama     text,
  tarih        date not null,
  saat         text,
  yer          text,
  olusturan    uuid references auth.users(id) on delete set null,
  iptal        boolean not null default false,
  olusturuldu  timestamptz not null default now(),
  guncellendi  timestamptz not null default now()
);
create index if not exists bulusma_grup_idx on public.bulusma (grup_id, tarih);

create table if not exists public.bulusma_yanit (
  bulusma_id   uuid not null references public.bulusma(id) on delete cascade,
  grup_id      uuid not null references public.grup(id) on delete cascade,
  uye_id       uuid not null references auth.users(id) on delete cascade,
  yanit        text not null check (yanit in ('geliyorum', 'belki', 'gelemem')),
  zaman        timestamptz not null default now(),
  primary key (bulusma_id, uye_id)
);

-- ——— RLS ——————————————————————————————————————————————————————————————
-- Tanımlar (rutin, buluşma): grubun her üyesi okur ve yazar (ortak_is gibi).
-- Kişisel satırlar (katılım, kayıt, yanıt): grup okur, yalnız kişi kendi satırını yazar.
alter table public.birlikte_rutin enable row level security;
alter table public.bulusma enable row level security;
drop policy if exists birlikte_rutin_grup on public.birlikte_rutin;
drop policy if exists bulusma_grup on public.bulusma;
create policy birlikte_rutin_grup on public.birlikte_rutin for all using (public.grup_uyesi_mi(grup_id)) with check (public.grup_uyesi_mi(grup_id));
create policy bulusma_grup on public.bulusma for all using (public.grup_uyesi_mi(grup_id)) with check (public.grup_uyesi_mi(grup_id));

do $$
declare t text;
begin
  foreach t in array array['birlikte_katilim', 'birlikte_kayit', 'bulusma_yanit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_oku', t);
    execute format('drop policy if exists %I on public.%I', t || '_yaz', t);
    execute format('create policy %I on public.%I for select using (public.grup_uyesi_mi(grup_id))', t || '_oku', t);
    execute format('create policy %I on public.%I for all using (uye_id = auth.uid() and public.grup_uyesi_mi(grup_id)) with check (uye_id = auth.uid() and public.grup_uyesi_mi(grup_id))', t || '_yaz', t);
  end loop;
end $$;

-- ——— bildirim: yeni buluşma ve yeni birlikte rutin gruptaki diğerlerine ————————
create or replace function public.bulusma_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
declare ad text;
begin
  select gorunen_ad into ad from public.profil where id = new.olusturan;
  insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
  select u.uye_id, 'cevrem', 'bulusma:' || new.id, coalesce(nullif(ad, ''), 'Biri') || ' bir buluşma önerdi',
         new.ad || ' · ' || to_char(new.tarih, 'DD.MM') || coalesce(' ' || new.saat, '') || coalesce(' · ' || new.yer, ''), '/'
    from public.grup_uye u
   where u.grup_id = new.grup_id and u.durum = 'aktif' and u.uye_id is distinct from new.olusturan
  on conflict (alici, anahtar) do nothing;
  return new;
end $$;
drop trigger if exists bulusma_bildir_tetik on public.bulusma;
create trigger bulusma_bildir_tetik after insert on public.bulusma for each row execute function public.bulusma_bildir();

create or replace function public.birlikte_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
declare ad text;
begin
  select gorunen_ad into ad from public.profil where id = new.olusturan;
  insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
  select u.uye_id, 'cevrem', 'birlikte:' || new.id, coalesce(nullif(ad, ''), 'Biri') || ' birlikte rutin başlattı',
         new.ad || ' · haftada ' || new.hedef, '/'
    from public.grup_uye u
   where u.grup_id = new.grup_id and u.durum = 'aktif' and u.uye_id is distinct from new.olusturan
  on conflict (alici, anahtar) do nothing;
  return new;
end $$;
drop trigger if exists birlikte_bildir_tetik on public.birlikte_rutin;
create trigger birlikte_bildir_tetik after insert on public.birlikte_rutin for each row execute function public.birlikte_bildir();

-- ——— Realtime ————————————————————————————————————————————————————————
do $$
declare t text;
begin
  foreach t in array array['birlikte_rutin', 'birlikte_katilim', 'birlikte_kayit', 'bulusma', 'bulusma_yanit'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

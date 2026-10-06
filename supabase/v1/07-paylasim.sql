-- =====================================================================
-- RITOS v1 — 07: PAYLAŞ (7 ekim 2026)
-- Kartın ya da programın TANIMINI Çevrem'deki birine gönder (işaretler, değerler gitmez).
-- Alıcı Gelenler'de görür, "Al" deyince kendi ajandasına / programlarına bağımsız kopya olarak ekler.
-- Yalnız aynı grupta olduğun kişilere gönderebilirsin. Koç–danışan arası paylaşım danışmanlık mesajıyla gider.
-- 03-cevrem.sql ve 06-bildirim.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

create table if not exists public.paylasim (
  id           uuid primary key default gen_random_uuid(),
  gonderen     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gonderen_ad  text not null,
  alici        uuid not null references auth.users(id) on delete cascade,
  paket        jsonb not null,
  alindi       timestamptz,
  olusturuldu  timestamptz not null default now()
);
create index if not exists paylasim_alici_idx on public.paylasim (alici, olusturuldu);
alter table public.paylasim enable row level security;
drop policy if exists paylasim_oku on public.paylasim;
drop policy if exists paylasim_gonder on public.paylasim;
drop policy if exists paylasim_al on public.paylasim;
drop policy if exists paylasim_sil on public.paylasim;
create policy paylasim_oku on public.paylasim for select using (alici = auth.uid() or gonderen = auth.uid());
create policy paylasim_gonder on public.paylasim for insert with check (gonderen = auth.uid() and alici <> auth.uid() and public.ayni_grupta_mi(alici));
create policy paylasim_al on public.paylasim for update using (alici = auth.uid()) with check (alici = auth.uid());
create policy paylasim_sil on public.paylasim for delete using (alici = auth.uid() or gonderen = auth.uid());

-- Gönderen adı istemciden değil profilden gelir.
create or replace function public.paylasim_ad_koy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(gorunen_ad, ''), 'Biri') into new.gonderen_ad from public.profil where id = new.gonderen;
  return new;
end $$;
drop trigger if exists paylasim_ad_tetik on public.paylasim;
create trigger paylasim_ad_tetik before insert on public.paylasim for each row execute function public.paylasim_ad_koy();

create or replace function public.paylasim_bildir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.bildirim (alici, kaynak, anahtar, baslik, metin, ac)
  values (new.alici, 'cevrem', 'paylasim:' || new.id, new.gonderen_ad || ' sana bir ' || case when new.paket->>'tur' = 'program' then 'program' else 'kart' end || ' gönderdi',
          new.paket->>'ad', '/')
  on conflict (alici, anahtar) do nothing;
  return new;
end $$;
drop trigger if exists paylasim_bildir_tetik on public.paylasim;
create trigger paylasim_bildir_tetik after insert on public.paylasim for each row execute function public.paylasim_bildir();

do $$ begin
  alter publication supabase_realtime add table public.paylasim;
exception when duplicate_object then null; when undefined_object then null;
end $$;

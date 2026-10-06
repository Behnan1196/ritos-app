-- ————————————————————————————————————————————————————————————————
-- Ritos — hesap + paylaşım (cat_ öneki). 25 eylül.
-- Supabase → SQL Editor'de BİR KEZ çalıştır. Rite'ın dog_ tablolarına dokunmaz.
--
-- İlke (V2): sunucu yalnızca kimliği ve paylaşılan şeyin zarfını taşır. Kişisel içerik
-- cihazda kalır. cat_gelen'deki paket, alıcının cihazı indirene kadar durur; cihaz
-- indirince siler (P6).
-- ————————————————————————————————————————————————————————————————

-- Görünen ad + e-posta (alıcı bulmak için). Başkası bu tabloyu okuyamaz;
-- e-postayla arama yalnızca cat_kisi_bul üzerinden, tek sonuç döner.
create table if not exists public.cat_profil (
  id uuid primary key references auth.users(id) on delete cascade,
  gorunen_ad text not null,
  eposta text not null,
  olusturuldu timestamptz not null default now()
);
create unique index if not exists cat_profil_eposta_idx on public.cat_profil (lower(eposta));
alter table public.cat_profil enable row level security;
drop policy if exists cat_profil_okur on public.cat_profil;
drop policy if exists cat_profil_ekler on public.cat_profil;
drop policy if exists cat_profil_gunceller on public.cat_profil;
create policy cat_profil_okur on public.cat_profil for select using (auth.uid() = id);
create policy cat_profil_ekler on public.cat_profil for insert with check (auth.uid() = id);
create policy cat_profil_gunceller on public.cat_profil for update using (auth.uid() = id);

-- Engelleme (P10). Engellenenin gönderimleri sessizce düşer.
create table if not exists public.cat_engel (
  engelleyen uuid not null references auth.users(id) on delete cascade,
  engellenen uuid not null references auth.users(id) on delete cascade,
  gorunen_ad text,
  olusturuldu timestamptz not null default now(),
  primary key (engelleyen, engellenen)
);
alter table public.cat_engel enable row level security;
drop policy if exists cat_engel_kendi on public.cat_engel;
create policy cat_engel_kendi on public.cat_engel for all using (auth.uid() = engelleyen) with check (auth.uid() = engelleyen);

-- Gelen kutusu: teslim edilmeyi bekleyen paylaşım paketleri.
create table if not exists public.cat_gelen (
  id uuid primary key default gen_random_uuid(),
  alici_id uuid not null references auth.users(id) on delete cascade,
  gonderen_id uuid not null references auth.users(id) on delete cascade,
  gonderen_ad text not null,
  kaynak text not null default 'dogrudan' check (kaynak in ('dogrudan', 'sohbet')),
  paket jsonb not null,
  olusturuldu timestamptz not null default now()
);
create index if not exists cat_gelen_alici_idx on public.cat_gelen (alici_id);
alter table public.cat_gelen enable row level security;
drop policy if exists cat_gelen_alici_okur on public.cat_gelen;
drop policy if exists cat_gelen_alici_siler on public.cat_gelen;
create policy cat_gelen_alici_okur on public.cat_gelen for select using (auth.uid() = alici_id);
create policy cat_gelen_alici_siler on public.cat_gelen for delete using (auth.uid() = alici_id);
-- Doğrudan insert yok: gönderim yalnızca cat_gonder ile (engel kontrolü + gönderen adı sunucuda).

-- E-postayla kişi bul: yalnızca id + görünen ad; oturum şart.
create or replace function public.cat_kisi_bul(p_eposta text)
returns table (id uuid, gorunen_ad text)
language sql security definer set search_path = public as $$
  select p.id, p.gorunen_ad from public.cat_profil p
  where auth.uid() is not null and lower(p.eposta) = lower(trim(p_eposta))
  limit 1;
$$;
revoke all on function public.cat_kisi_bul(text) from public;
grant execute on function public.cat_kisi_bul(text) to authenticated;

-- Gönder: engellenmişse sessizce hiçbir şey yapmaz (gönderen bunu öğrenmez).
create or replace function public.cat_gonder(p_alici uuid, p_kaynak text, p_paket jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ad text;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  select gorunen_ad into v_ad from public.cat_profil where id = auth.uid();
  if v_ad is null then raise exception 'profil yok'; end if;
  if exists (select 1 from public.cat_engel where engelleyen = p_alici and engellenen = auth.uid()) then return; end if;
  insert into public.cat_gelen (alici_id, gonderen_id, gonderen_ad, kaynak, paket)
  values (p_alici, auth.uid(), v_ad, coalesce(p_kaynak, 'dogrudan'), p_paket);
end $$;
revoke all on function public.cat_gonder(uuid, text, jsonb) from public;
grant execute on function public.cat_gonder(uuid, text, jsonb) to authenticated;

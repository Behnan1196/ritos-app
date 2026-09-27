-- ————————————————————————————————————————————————————————————————
-- Ritos — Sohbet için aile grubu (F1–F4, 27 eylül 2026). cat-05'ten SONRA, BİR KEZ çalıştır.
--
-- Koç–danışan sohbeti mevcut cat_mesaj kanalından gider (yeni tablo gerekmez).
-- Aile grubu: üyelik sunucuda; mesajlar grup anahtarıyla şifreli. Grup anahtarını yönetici
-- üretir ve her üyeye, ikisinin anahtar çiftinden türetilen anahtarla sarılı olarak bırakır.
-- Üye ayrılınca/çıkarılınca anahtar yenilenir (surum artar). Sunucu içerik görmez.
-- ————————————————————————————————————————————————————————————————

create table if not exists public.cat_aile (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  kurucu uuid not null references auth.users(id) on delete cascade,
  anahtar_surum int not null default 1,
  olusturuldu timestamptz not null default now()
);

create table if not exists public.cat_aile_uye (
  aile uuid not null references public.cat_aile(id) on delete cascade,
  uye uuid not null references auth.users(id) on delete cascade,
  ad text not null,
  rol text not null default 'uye' check (rol in ('yonetici', 'uye')),
  durum text not null default 'davet' check (durum in ('davet', 'aktif', 'ayrildi')),
  guncellendi timestamptz not null default now(),
  primary key (aile, uye)
);
-- Bir kişi tek bir ailede aktif olur.
create unique index if not exists cat_aile_uye_tek_aile on public.cat_aile_uye (uye) where durum = 'aktif';

create or replace function public.cat_aile_uyesi_mi(p_aile uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = auth.uid() and durum = 'aktif');
$$;

alter table public.cat_aile enable row level security;
drop policy if exists cat_aile_oku on public.cat_aile;
create policy cat_aile_oku on public.cat_aile for select using (
  public.cat_aile_uyesi_mi(id) or exists (select 1 from public.cat_aile_uye u where u.aile = id and u.uye = auth.uid())
);

alter table public.cat_aile_uye enable row level security;
drop policy if exists cat_aile_uye_oku on public.cat_aile_uye;
create policy cat_aile_uye_oku on public.cat_aile_uye for select using (uye = auth.uid() or public.cat_aile_uyesi_mi(aile));

-- Grup anahtarı, üye başına sarılı. saran = sarmayı yapan (yönetici); üye onun açık anahtarıyla açar.
create table if not exists public.cat_aile_anahtar (
  aile uuid not null references public.cat_aile(id) on delete cascade,
  uye uuid not null references auth.users(id) on delete cascade,
  surum int not null,
  saran uuid not null references auth.users(id) on delete cascade,
  sarili text not null,
  primary key (aile, uye, surum)
);
alter table public.cat_aile_anahtar enable row level security;
drop policy if exists cat_aile_anahtar_oku on public.cat_aile_anahtar;
drop policy if exists cat_aile_anahtar_yaz on public.cat_aile_anahtar;
create policy cat_aile_anahtar_oku on public.cat_aile_anahtar for select using (uye = auth.uid());
create policy cat_aile_anahtar_yaz on public.cat_aile_anahtar for insert with check (
  saran = auth.uid() and exists (select 1 from public.cat_aile_uye y where y.aile = cat_aile_anahtar.aile and y.uye = auth.uid() and y.rol = 'yonetici' and y.durum = 'aktif')
);

create table if not exists public.cat_aile_mesaj (
  sira bigint generated always as identity primary key,
  aile uuid not null references public.cat_aile(id) on delete cascade,
  gonderen uuid not null references auth.users(id) on delete cascade,
  anahtar_surum int not null,
  veri text not null,
  olusturuldu timestamptz not null default now()
);
create index if not exists cat_aile_mesaj_aile_idx on public.cat_aile_mesaj (aile, sira);
alter table public.cat_aile_mesaj enable row level security;
drop policy if exists cat_aile_mesaj_oku on public.cat_aile_mesaj;
drop policy if exists cat_aile_mesaj_yaz on public.cat_aile_mesaj;
create policy cat_aile_mesaj_oku on public.cat_aile_mesaj for select using (public.cat_aile_uyesi_mi(aile));
create policy cat_aile_mesaj_yaz on public.cat_aile_mesaj for insert with check (gonderen = auth.uid() and public.cat_aile_uyesi_mi(aile));

-- Aile üyeleri birbirinin açık anahtarını okuyabilsin (grup anahtarını sarmak / açmak için).
drop policy if exists cat_acik_anahtar_oku on public.cat_acik_anahtar;
create policy cat_acik_anahtar_oku on public.cat_acik_anahtar for select using (
  auth.uid() = id
  or exists (select 1 from public.cat_iliski i
             where (i.koc = auth.uid() and i.danisan = cat_acik_anahtar.id) or (i.danisan = auth.uid() and i.koc = cat_acik_anahtar.id))
  or exists (select 1 from public.cat_aile_uye a join public.cat_aile_uye b on a.aile = b.aile
             where a.uye = auth.uid() and b.uye = cat_acik_anahtar.id and a.durum in ('aktif', 'davet') and b.durum in ('aktif', 'davet'))
);

-- F1 — grup kur (kurucu yönetici olur). Zaten bir ailedeyse hata.
create or replace function public.cat_aile_kur(p_ad text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ad text;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  if exists (select 1 from public.cat_aile_uye where uye = auth.uid() and durum = 'aktif') then raise exception 'zaten bir aile grubundasın'; end if;
  select gorunen_ad into v_ad from public.cat_profil where id = auth.uid();
  insert into public.cat_aile (ad, kurucu) values (trim(p_ad), auth.uid()) returning id into v_id;
  insert into public.cat_aile_uye (aile, uye, ad, rol, durum) values (v_id, auth.uid(), coalesce(v_ad, 'Ben'), 'yonetici', 'aktif');
  return v_id;
end $$;

-- F1 — e-postayla davet (yalnız yönetici; üye sınırı 3, davetliler dahil).
create or replace function public.cat_aile_davet(p_aile uuid, p_eposta text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uye uuid; v_ad text; v_say int;
begin
  if not exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = auth.uid() and rol = 'yonetici' and durum = 'aktif') then raise exception 'yalnız yönetici davet eder'; end if;
  select id, gorunen_ad into v_uye, v_ad from public.cat_profil where lower(eposta) = lower(trim(p_eposta));
  if v_uye is null then raise exception 'Bu e-postayla Ritos kullanan biri bulunamadı'; end if;
  if v_uye = auth.uid() then raise exception 'kendini davet edemezsin'; end if;
  select count(*) into v_say from public.cat_aile_uye where aile = p_aile and durum in ('aktif', 'davet');
  if v_say >= 3 then raise exception 'Aile grubu en fazla 3 kişi'; end if;
  insert into public.cat_aile_uye (aile, uye, ad, rol, durum) values (p_aile, v_uye, v_ad, 'uye', 'davet')
  on conflict (aile, uye) do update set durum = 'davet', guncellendi = now();
  return v_ad;
end $$;

-- F2 — daveti yanıtla.
create or replace function public.cat_aile_yanit(p_aile uuid, p_kabul boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kabul and exists (select 1 from public.cat_aile_uye where uye = auth.uid() and durum = 'aktif') then raise exception 'zaten bir aile grubundasın'; end if;
  update public.cat_aile_uye set durum = case when p_kabul then 'aktif' else 'ayrildi' end, guncellendi = now()
  where aile = p_aile and uye = auth.uid() and durum = 'davet';
end $$;

-- F4 — ayrıl (kendin) ya da çıkar (yönetici). Anahtar sürümü artar; yönetici cihazı yeni anahtarı dağıtır.
create or replace function public.cat_aile_ayril(p_aile uuid, p_uye uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_uye <> auth.uid() and not exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = auth.uid() and rol = 'yonetici' and durum = 'aktif') then
    raise exception 'yalnız yönetici çıkarır';
  end if;
  update public.cat_aile_uye set durum = 'ayrildi', guncellendi = now() where aile = p_aile and uye = p_uye;
  update public.cat_aile set anahtar_surum = anahtar_surum + 1 where id = p_aile;
  -- Yönetici ayrılırsa grup dağılır.
  if exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = p_uye and rol = 'yonetici') then
    update public.cat_aile_uye set durum = 'ayrildi', guncellendi = now() where aile = p_aile;
  end if;
end $$;

revoke all on function public.cat_aile_kur(text) from public;
revoke all on function public.cat_aile_davet(uuid, text) from public;
revoke all on function public.cat_aile_yanit(uuid, boolean) from public;
revoke all on function public.cat_aile_ayril(uuid, uuid) from public;
grant execute on function public.cat_aile_kur(text) to authenticated;
grant execute on function public.cat_aile_davet(uuid, text) to authenticated;
grant execute on function public.cat_aile_yanit(uuid, boolean) to authenticated;
grant execute on function public.cat_aile_ayril(uuid, uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.cat_aile_mesaj; exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.cat_aile_uye; exception when duplicate_object then null; when undefined_object then null; end $$;

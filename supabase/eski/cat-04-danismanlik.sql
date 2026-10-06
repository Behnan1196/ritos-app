-- ————————————————————————————————————————————————————————————————
-- Ritos — danışmanlık (D1–D10, 26 eylül 2026). cat-01, cat-02'den SONRA, BİR KEZ çalıştır.
-- Rite'ın dog_ tablolarına dokunmaz.
--
-- Sunucu yalnızca şunu bilir: kim kimin koçu, hangi disiplinde, ilişki açık mı; iki taraf
-- arasında şifreli mesaj gidip geliyor. Mesajın içeriğini (program, işaretler, değerler)
-- göremez: her ilişkinin anahtarı iki tarafın cihazında, anahtar çiftlerinden türetilir.
-- ————————————————————————————————————————————————————————————————

-- D1 — koç profili. Deneme 60 gün; ödeme akışı sonra (koc_baslangic ondan sayılır).
alter table public.cat_profil add column if not exists koc boolean not null default false;
alter table public.cat_profil add column if not exists koc_disiplinler text[] not null default '{}';
alter table public.cat_profil add column if not exists koc_baslangic timestamptz;

-- İlişki: koç ↔ danışan, disiplin başına. Doğrudan yazma yok; davet ve sonlandırma fonksiyonlarla.
create table if not exists public.cat_iliski (
  id uuid primary key default gen_random_uuid(),
  koc uuid not null references auth.users(id) on delete cascade,
  danisan uuid not null references auth.users(id) on delete cascade,
  disiplin text not null,
  koc_ad text not null,
  danisan_ad text not null,
  durum text not null default 'aktif' check (durum in ('aktif', 'sonlandi')),
  olusturuldu timestamptz not null default now(),
  sonlandi timestamptz,
  sonlandiran uuid
);
create index if not exists cat_iliski_koc_idx on public.cat_iliski (koc);
create index if not exists cat_iliski_danisan_idx on public.cat_iliski (danisan);
alter table public.cat_iliski enable row level security;
drop policy if exists cat_iliski_taraflar on public.cat_iliski;
create policy cat_iliski_taraflar on public.cat_iliski for select using (auth.uid() = koc or auth.uid() = danisan);

-- Anahtar çifti (D2): açık anahtar ilişki tarafları okuyabilsin diye ayrı tabloda;
-- özel anahtar hesabın veri anahtarıyla şifreli, kendi cat_anahtar satırında.
alter table public.cat_anahtar add column if not exists cift_sifreli text;
create table if not exists public.cat_acik_anahtar (
  id uuid primary key references auth.users(id) on delete cascade,
  acik text not null,
  olusturuldu timestamptz not null default now()
);
alter table public.cat_acik_anahtar enable row level security;
drop policy if exists cat_acik_anahtar_oku on public.cat_acik_anahtar;
create policy cat_acik_anahtar_oku on public.cat_acik_anahtar for select using (
  auth.uid() = id or exists (
    select 1 from public.cat_iliski i
    where (i.koc = auth.uid() and i.danisan = cat_acik_anahtar.id) or (i.danisan = auth.uid() and i.koc = cat_acik_anahtar.id)
  )
);

-- İlk kez: çifti yaz. Zaten varsa (başka cihaz önce yazdıysa) var olanı döndür — iki cihaz aynı anda üretse de tek çift kalır.
create or replace function public.cat_anahtar_cifti_koy(p_acik text, p_ozel text)
returns table (acik text, ozel text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  insert into public.cat_acik_anahtar (id, acik) values (auth.uid(), p_acik) on conflict (id) do nothing;
  update public.cat_anahtar set cift_sifreli = p_ozel where id = auth.uid() and cift_sifreli is null;
  return query select a.acik, k.cift_sifreli from public.cat_acik_anahtar a join public.cat_anahtar k on k.id = a.id where a.id = auth.uid();
end $$;
revoke all on function public.cat_anahtar_cifti_koy(text, text) from public;
grant execute on function public.cat_anahtar_cifti_koy(text, text) to authenticated;

-- D2 — davet bağlantısı: tek kullanımlık, 7 gün.
create table if not exists public.cat_davet (
  kod text primary key,
  koc uuid not null references auth.users(id) on delete cascade,
  koc_ad text not null,
  disiplin text not null,
  son timestamptz not null default now() + interval '7 days',
  kullanildi boolean not null default false,
  olusturuldu timestamptz not null default now()
);
alter table public.cat_davet enable row level security;
drop policy if exists cat_davet_koc on public.cat_davet;
create policy cat_davet_koc on public.cat_davet for all using (auth.uid() = koc) with check (auth.uid() = koc);

create or replace function public.cat_davet_bak(p_kod text)
returns table (koc_ad text, disiplin text, gecerli boolean, kendi boolean)
language sql security definer set search_path = public as $$
  select d.koc_ad, d.disiplin, (not d.kullanildi and d.son > now()), d.koc = auth.uid()
  from public.cat_davet d where auth.uid() is not null and d.kod = p_kod;
$$;
revoke all on function public.cat_davet_bak(text) from public;
grant execute on function public.cat_davet_bak(text) to authenticated;

create or replace function public.cat_davet_yanit(p_kod text, p_kabul boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.cat_davet%rowtype; v_ad text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  select * into d from public.cat_davet where kod = p_kod for update;
  if not found then raise exception 'davet bulunamadı'; end if;
  if d.koc = auth.uid() then raise exception 'kendi davetin'; end if;
  if d.kullanildi or d.son <= now() then raise exception 'davetin süresi dolmuş ya da kullanılmış'; end if;
  update public.cat_davet set kullanildi = true where kod = p_kod;
  if not p_kabul then return null; end if;
  select id into v_id from public.cat_iliski where koc = d.koc and danisan = auth.uid() and disiplin = d.disiplin and durum = 'aktif';
  if v_id is not null then return v_id; end if;
  select gorunen_ad into v_ad from public.cat_profil where id = auth.uid();
  insert into public.cat_iliski (koc, danisan, disiplin, koc_ad, danisan_ad)
  values (d.koc, auth.uid(), d.disiplin, d.koc_ad, coalesce(v_ad, 'Danışan')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.cat_davet_yanit(text, boolean) from public;
grant execute on function public.cat_davet_yanit(text, boolean) to authenticated;

-- D10 — iki taraf da sonlandırabilir.
create or replace function public.cat_iliski_sonlandir(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.cat_iliski set durum = 'sonlandi', sonlandi = now(), sonlandiran = auth.uid()
  where id = p_id and durum = 'aktif' and auth.uid() in (koc, danisan);
$$;
revoke all on function public.cat_iliski_sonlandir(uuid) from public;
grant execute on function public.cat_iliski_sonlandir(uuid) to authenticated;

-- Şifreli mesajlar (program, güncelleme, durdurma, kabul, geri bildirim). Yalnız açık ilişkide yazılır.
create table if not exists public.cat_mesaj (
  sira bigint generated always as identity primary key,
  iliski uuid not null references public.cat_iliski(id) on delete cascade,
  gonderen uuid not null references auth.users(id) on delete cascade,
  alici uuid not null references auth.users(id) on delete cascade,
  veri text not null,
  olusturuldu timestamptz not null default now()
);
create index if not exists cat_mesaj_alici_idx on public.cat_mesaj (alici, sira);
alter table public.cat_mesaj enable row level security;
drop policy if exists cat_mesaj_alici_okur on public.cat_mesaj;
drop policy if exists cat_mesaj_alici_siler on public.cat_mesaj;
drop policy if exists cat_mesaj_gonderen_yazar on public.cat_mesaj;
create policy cat_mesaj_alici_okur on public.cat_mesaj for select using (auth.uid() = alici);
create policy cat_mesaj_alici_siler on public.cat_mesaj for delete using (auth.uid() = alici);
create policy cat_mesaj_gonderen_yazar on public.cat_mesaj for insert with check (
  auth.uid() = gonderen and exists (
    select 1 from public.cat_iliski i where i.id = iliski and i.durum = 'aktif'
      and ((i.koc = auth.uid() and i.danisan = alici) or (i.danisan = auth.uid() and i.koc = alici))
  )
);

do $$ begin
  alter publication supabase_realtime add table public.cat_mesaj;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cat_iliski;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- ————————————————————————————————————————————————————————————————
-- Ritos — uçtan uca şifreli senkron (V4, 26 eylül). cat-01'den SONRA, BİR KEZ çalıştır.
-- Rite'ın dog_ tablolarına dokunmaz.
--
-- Sunucu yalnızca şunu bilir: hangi hesabın, hangi tablodan, hangi kimlikte bir satırı var,
-- ne zaman değişti, silindi mi. Satırın İÇERİĞİ (veri) cihazda şifrelenmiş gelir; anahtar
-- sunucuya hiç gelmez.
-- ————————————————————————————————————————————————————————————————

-- Sarılı veri anahtarı: şifreyle ve kurtarma kelimeleriyle ayrı ayrı sarılmış. Sunucu açamaz.
create table if not exists public.cat_anahtar (
  id uuid primary key references auth.users(id) on delete cascade,
  tuz text not null,
  sarili_sifre text not null,
  kurtarma_tuz text not null,
  sarili_kurtarma text not null,
  kurtarma_sifreli text not null,           -- kelimelerin kendisi, veri anahtarıyla şifreli (yeniden gösterebilmek için)
  guncellendi timestamptz not null default now()
);
alter table public.cat_anahtar enable row level security;
drop policy if exists cat_anahtar_kendi on public.cat_anahtar;
create policy cat_anahtar_kendi on public.cat_anahtar for all using (auth.uid() = id) with check (auth.uid() = id);

-- Şifreli satırlar. sira her yazımda artar: cihaz "son gördüğüm sıradan sonrasını ver" diye çeker.
create sequence if not exists public.cat_kayit_sira;
create table if not exists public.cat_kayit (
  sahip uuid not null references auth.users(id) on delete cascade,
  tablo text not null,
  kayit_id text not null,
  veri text,                                  -- şifreli (iv.ciphertext); silindiyse null
  silindi boolean not null default false,
  guncellendi bigint not null,                -- cihazdaki değişiklik zamanı (ms) — son yazan kazanır
  sira bigint not null default nextval('public.cat_kayit_sira'),
  primary key (sahip, tablo, kayit_id)
);
create index if not exists cat_kayit_sira_idx on public.cat_kayit (sahip, sira);
alter table public.cat_kayit enable row level security;
drop policy if exists cat_kayit_kendi on public.cat_kayit;
create policy cat_kayit_kendi on public.cat_kayit for all using (auth.uid() = sahip) with check (auth.uid() = sahip);

create or replace function public.cat_kayit_sira_ver() returns trigger
language plpgsql as $$
begin
  new.sira := nextval('public.cat_kayit_sira');
  return new;
end $$;
drop trigger if exists cat_kayit_sira_tetik on public.cat_kayit;
create trigger cat_kayit_sira_tetik before insert or update on public.cat_kayit
  for each row execute function public.cat_kayit_sira_ver();

-- Anlık bildirim: başka cihaz yazınca bu cihaz hemen çekebilsin (RLS burada da geçerli).
do $$ begin
  alter publication supabase_realtime add table public.cat_kayit;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Ritos — alan paketleri kataloğu (26 eylül 2026).
-- Katalog kişisel veri değildir: herkes (hesapsız da) okur, şifrelenmez.
-- Yazma politikası YOK: yalnız Supabase SQL editörü (postgres rolü) yazar.
-- Uygulama her sınavın son sürümünü indirir; kullanıcının düzenlemeleri ayrı tutulur (cat_kayit, şifreli).

create table if not exists public.cat_paket (
  paket       text        not null,              -- 'sinav', ileride 'beslenme'…
  kod         text        not null,              -- 'tyt', 'ayt', 'lgs', 'ornek-kaynaklar'
  surum       int         not null default 1,    -- her yayında 1 artır
  onayli      boolean     not null default false,-- uzman kontrolünden geçti mi
  onaylayan   text,                              -- kontrol eden uzman (ad / kurum)
  veri        jsonb       not null,
  guncellendi timestamptz not null default now(),
  primary key (paket, kod)
);

alter table public.cat_paket enable row level security;

drop policy if exists cat_paket_oku on public.cat_paket;
create policy cat_paket_oku on public.cat_paket for select to anon, authenticated using (true);

-- Yeni sürüm yayınlamak (örnek):
--   update public.cat_paket
--      set veri = '<yeni json>'::jsonb, surum = surum + 1, guncellendi = now()
--    where paket = 'sinav' and kod = 'tyt';
-- Uzman onayı:
--   update public.cat_paket set onayli = true, onaylayan = 'Ad Soyad' where paket = 'sinav';

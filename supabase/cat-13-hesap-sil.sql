-- Ritos — hesap silme ve test kullanıcısı silme (5 ekim 2026, düzeltme).
-- ÖNEMLİ: Bu Supabase projesi başka uygulamalarla (Rite, …) paylaşılıyor; auth.users ortak.
-- Bu yüzden Ritos kullanıcıyı auth.users'tan SİLMEZ — yalnız Ritos'un cat_ tablolarındaki
-- satırlarını siler. Aynı e-postayla kullanılan diğer uygulamalar etkilenmez.
-- Hangi tablolar? public şemasında adı cat_ ile başlayan ve auth.users'a bağlı (yabancı anahtar)
-- her sütun — yeni bir cat_ tablosu eklenince de kendiliğinden kapsanır.

-- İlk sürümde dönüş tipleri farklıydı (void); yeniden kurmadan önce eskileri kaldır.
drop function if exists public.cat_hesabimi_sil();
drop function if exists public.cat_test_kullanici_sil(text);

create or replace function public.cat_kullanici_verisini_sil(p_uid uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  n int := 0;
  k int;
begin
  for r in
    select c.conrelid::regclass as tablo, a.attname as kolon
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and ns.nspname = 'public'
       and t.relname like 'cat\_%'
  loop
    execute format('delete from %s where %I = $1', r.tablo, r.kolon) using p_uid;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

revoke all on function public.cat_kullanici_verisini_sil(uuid) from public, anon, authenticated;

-- 1) Uygulama içinden "Hesabımı sil": yalnız kendi Ritos verisini siler.
create or replace function public.cat_hesabimi_sil()
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum yok';
  end if;
  return public.cat_kullanici_verisini_sil(auth.uid());
end;
$$;

revoke all on function public.cat_hesabimi_sil() from public, anon;
grant execute on function public.cat_hesabimi_sil() to authenticated;

-- 2) Test için (yalnız SQL editöründen): e-postayla bir kullanıcının Ritos verisini sil.
create or replace function public.cat_test_kullanici_sil(p_eposta text)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  u uuid;
begin
  select id into u from auth.users where lower(email) = lower(p_eposta);
  if u is null then
    raise exception 'Kullanıcı yok: %', p_eposta;
  end if;
  return public.cat_kullanici_verisini_sil(u);
end;
$$;

revoke all on function public.cat_test_kullanici_sil(text) from public, anon, authenticated;

-- Kullanım (SQL editörü):
--   select public.cat_test_kullanici_sil('test1@ornek.com');   -- silinen satır sayısı
-- Auth kullanıcısını da tamamen kaldırmak (yalnız başka uygulamada kullanılmıyorsa):
--   Dashboard › Authentication › Users.

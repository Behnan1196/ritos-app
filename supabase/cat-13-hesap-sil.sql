-- Ritos — hesap silme ve test kullanıcısı silme (5 ekim 2026).
-- cat_ tablolarının hepsi auth.users'a "on delete cascade" ile bağlı: kullanıcı silinince
-- sunucudaki bütün satırları (şifreli kayıtlar, anahtarlar, ilişkiler, aile üyelikleri, davetler,
-- mesajlar, dış kartlar, bildirimler) kendiliğinden gider. Kurduğu aile grubu da dağılır.

-- 1) Uygulama içinden "Hesabımı sil": yalnız kendi hesabını siler.
create or replace function public.cat_hesabimi_sil()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum yok';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.cat_hesabimi_sil() from public, anon;
grant execute on function public.cat_hesabimi_sil() to authenticated;

-- 2) Test için (yalnız SQL editöründen): e-postayla kullanıcı sil.
create or replace function public.cat_test_kullanici_sil(p_eposta text)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare n int;
begin
  delete from auth.users where lower(email) = lower(p_eposta);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.cat_test_kullanici_sil(text) from public, anon, authenticated;

-- Kullanım (SQL editörü):
--   select public.cat_test_kullanici_sil('test1@ornek.com');

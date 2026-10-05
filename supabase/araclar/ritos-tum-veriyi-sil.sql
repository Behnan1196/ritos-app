-- ⚠️ ARAÇ — kurulumun parçası DEĞİL. Bütün kullanıcıların Ritos (cat_) verisini siler.
-- Silinmez: cat_paket (sınav paketleri, hazır şablonlar), auth.users, diğer uygulamaların tabloları.
-- Önce: tüm cihazlarda Ritos'tan çık + site verisini temizle (eski anahtarla geri yüklemesin).
-- Sonra: tekrar giriş → anahtar yok → Ritos temiz başlar.

-- 1) Önce bak: hangi tabloda kaç satır var
select format('%I', c.relname) as tablo, c.reltuples::bigint as yaklasik_satir
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname like 'cat\_%' and c.relname <> 'cat_paket'
order by 1;

-- 2) Sil (tek TRUNCATE; cascade YOK → cat_ dışı bir tablo bağlıysa durur, hiçbir şey silinmez)
do $$
declare liste text;
begin
  select string_agg(format('public.%I', c.relname), ', ')
    into liste
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname like 'cat\_%' and c.relname <> 'cat_paket';
  raise notice 'Boşaltılıyor: %', liste;
  execute 'truncate table ' || liste || ' restart identity';
end $$;

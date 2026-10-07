-- =====================================================================
-- RITOS v1 — 05: E-POSTAYLA DANIŞMANLIK DAVETİ (7 ekim 2026)
-- Koç danışanın e-postasını yazar; davet o e-postaya bağlı bekler. Danışan Ritos'a bu e-postayla
-- girdiğinde (hesabı varsa hemen, yoksa kayıt olunca) davet penceresi açılır.
-- Gizlilik: koça kişinin kayıtlı olup olmadığı söylenmez; e-postayla kullanıcı aranmaz.
-- 04-danismanlik.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

alter table public.dan_davet add column if not exists alici_eposta text;
-- E-posta eşleme anahtarı: küçük harf; Gmail'de noktalar ve +ek önemsiz (a.b+x@gmail.com = ab@gmail.com).
create or replace function public.eposta_anahtar(e text) returns text
language sql immutable as $$
  select case
    when e is null then null
    when split_part(lower(trim(e)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else lower(trim(e))
  end
$$;

create index if not exists dan_davet_eposta_idx on public.dan_davet (lower(alici_eposta)) where alici_eposta is not null;

-- Bana (oturumdaki e-postama) gelmiş, açık davetler.
create or replace function public.bana_gelen_dan_davetler()
returns table (kod text, koc_ad text, disiplin text)
language sql stable security definer set search_path = public, auth as $$
  select d.kod, d.koc_ad, d.disiplin
    from public.dan_davet d
    join auth.users u on u.id = auth.uid()
   where d.alici_eposta is not null and public.eposta_anahtar(d.alici_eposta) = public.eposta_anahtar(u.email)
     and not d.kullanildi and d.son > now() and d.koc <> auth.uid()
   order by d.olusturuldu;
$$;
revoke all on function public.bana_gelen_dan_davetler() from public, anon;
grant execute on function public.bana_gelen_dan_davetler() to authenticated;

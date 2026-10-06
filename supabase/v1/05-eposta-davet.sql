-- =====================================================================
-- RITOS v1 — 05: E-POSTAYLA DANIŞMANLIK DAVETİ (7 ekim 2026)
-- Koç danışanın e-postasını yazar; davet o e-postaya bağlı bekler. Danışan Ritos'a bu e-postayla
-- girdiğinde (hesabı varsa hemen, yoksa kayıt olunca) davet penceresi açılır.
-- Gizlilik: koça kişinin kayıtlı olup olmadığı söylenmez; e-postayla kullanıcı aranmaz.
-- 04-danismanlik.sql'den sonra BİR KEZ çalıştır (yeniden çalıştırılabilir).
-- =====================================================================

alter table public.dan_davet add column if not exists alici_eposta text;
create index if not exists dan_davet_eposta_idx on public.dan_davet (lower(alici_eposta)) where alici_eposta is not null;

-- Bana (oturumdaki e-postama) gelmiş, açık davetler.
create or replace function public.bana_gelen_dan_davetler()
returns table (kod text, koc_ad text, disiplin text)
language sql stable security definer set search_path = public, auth as $$
  select d.kod, d.koc_ad, d.disiplin
    from public.dan_davet d
    join auth.users u on u.id = auth.uid()
   where d.alici_eposta is not null and lower(d.alici_eposta) = lower(u.email)
     and not d.kullanildi and d.son > now() and d.koc <> auth.uid()
   order by d.olusturuldu;
$$;
revoke all on function public.bana_gelen_dan_davetler() from public, anon;
grant execute on function public.bana_gelen_dan_davetler() to authenticated;

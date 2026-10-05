-- =====================================================================
-- RITOS — cat-14: GRUPLAR (5 ekim). cat-06 / cat-11'den SONRA, bir kez çalıştır (tekrar çalıştırmak zararsız).
-- Aile grubu genelleşir: bir kişi birden çok grupta olabilir; grubun türü var (aile / arkadas / ekip);
-- grup başına en fazla 12 kişi (davetliler dahil). Herkes gruptakilere görev verebilir (cat-11 aynen).
-- Tablo adları değişmez (cat_aile*); "aile" artık "grup" demek.
-- =====================================================================

alter table public.cat_aile add column if not exists tur text not null default 'aile';
do $$ begin
  alter table public.cat_aile add constraint cat_aile_tur_kontrol check (tur in ('aile', 'arkadas', 'ekip'));
exception when duplicate_object then null; end $$;

-- Tek grup kuralı kalkar.
drop index if exists public.cat_aile_uye_tek_aile;

-- Grup kur: ad + tür. (Eski tek parametreli sürüm kaldırılır.)
drop function if exists public.cat_aile_kur(text);
create or replace function public.cat_aile_kur(p_ad text, p_tur text default 'aile') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ad text;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  if p_tur not in ('aile', 'arkadas', 'ekip') then raise exception 'geçersiz grup türü'; end if;
  if length(trim(coalesce(p_ad, ''))) = 0 then raise exception 'grup adı gerekli'; end if;
  select gorunen_ad into v_ad from public.cat_profil where id = auth.uid();
  insert into public.cat_aile (ad, kurucu, tur) values (trim(p_ad), auth.uid(), p_tur) returning id into v_id;
  insert into public.cat_aile_uye (aile, uye, ad, rol, durum) values (v_id, auth.uid(), coalesce(v_ad, 'Ben'), 'yonetici', 'aktif');
  return v_id;
end $$;
revoke all on function public.cat_aile_kur(text, text) from public;
grant execute on function public.cat_aile_kur(text, text) to authenticated;

-- Davet: yalnız yönetici; en fazla 12 kişi (davetliler dahil).
create or replace function public.cat_aile_davet(p_aile uuid, p_eposta text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uye uuid; v_ad text; v_say int;
begin
  if not exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = auth.uid() and rol = 'yonetici' and durum = 'aktif') then raise exception 'yalnız yönetici davet eder'; end if;
  select id, gorunen_ad into v_uye, v_ad from public.cat_profil where lower(eposta) = lower(trim(p_eposta));
  if v_uye is null then raise exception 'Bu e-postayla Ritos kullanan biri bulunamadı'; end if;
  if v_uye = auth.uid() then raise exception 'kendini davet edemezsin'; end if;
  if exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = v_uye and durum = 'aktif') then raise exception 'zaten grupta'; end if;
  select count(*) into v_say from public.cat_aile_uye where aile = p_aile and durum in ('aktif', 'davet');
  if v_say >= 12 then raise exception 'Grup en fazla 12 kişi'; end if;
  insert into public.cat_aile_uye (aile, uye, ad, rol, durum) values (p_aile, v_uye, v_ad, 'uye', 'davet')
  on conflict (aile, uye) do update set durum = 'davet', rol = 'uye', guncellendi = now();
  return v_ad;
end $$;

-- Daveti yanıtla (artık başka grupta olmak engel değil).
create or replace function public.cat_aile_yanit(p_aile uuid, p_kabul boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cat_aile_uye set durum = case when p_kabul then 'aktif' else 'ayrildi' end, guncellendi = now()
  where aile = p_aile and uye = auth.uid() and durum = 'davet';
end $$;

-- Ayrıl / çıkar / dağıt. Görev ilişkileri yalnız artık HİÇBİR ortak grubu kalmayan çiftlerde biter.
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
  update public.cat_iliski i set durum = 'sonlandi', sonlandi = now(), sonlandiran = auth.uid()
  where i.disiplin = 'aile' and i.durum = 'aktif'
    and exists (select 1 from public.cat_aile_uye u where u.aile = p_aile and u.uye in (i.koc, i.danisan))
    and not exists (
      select 1 from public.cat_aile_uye a join public.cat_aile_uye b on a.aile = b.aile
      where a.uye = i.koc and b.uye = i.danisan and a.durum = 'aktif' and b.durum = 'aktif'
    );
end $$;
revoke all on function public.cat_aile_ayril(uuid, uuid) from public;
grant execute on function public.cat_aile_ayril(uuid, uuid) to authenticated;

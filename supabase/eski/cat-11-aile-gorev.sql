-- =====================================================================
-- RITOS — cat-11: AİLE İÇİNDE GÖREV VERME (3 ekim)
-- Aile grubundaki herkes birbirine görev verebilir. Altyapı danışmanlıkla aynı: "veren → alan"
-- çifti için disiplini 'aile' olan bir ilişki (cat_iliski) davetsiz kurulur — ikisi de aynı
-- aile grubunda aktif üyeyse. Gruptan ayrılınca (ya da grup dağılınca) bu ilişkiler biter.
-- =====================================================================

create or replace function public.cat_aile_gorev_iliski(p_uye uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ben text; v_o text;
begin
  if auth.uid() is null then raise exception 'oturum yok'; end if;
  if p_uye = auth.uid() then raise exception 'kendine görev için ajandanı kullan'; end if;
  if not exists (
    select 1 from public.cat_aile_uye a join public.cat_aile_uye b on a.aile = b.aile
    where a.uye = auth.uid() and b.uye = p_uye and a.durum = 'aktif' and b.durum = 'aktif'
  ) then raise exception 'aynı aile grubunda değilsiniz'; end if;
  select id into v_id from public.cat_iliski where koc = auth.uid() and danisan = p_uye and disiplin = 'aile' and durum = 'aktif';
  if v_id is not null then return v_id; end if;
  select coalesce(p.gorunen_ad, u.ad) into v_ben from public.cat_aile_uye u left join public.cat_profil p on p.id = u.uye where u.uye = auth.uid() limit 1;
  select coalesce(p.gorunen_ad, u.ad) into v_o   from public.cat_aile_uye u left join public.cat_profil p on p.id = u.uye where u.uye = p_uye limit 1;
  insert into public.cat_iliski (koc, danisan, disiplin, koc_ad, danisan_ad)
  values (auth.uid(), p_uye, 'aile', coalesce(v_ben, 'Aile'), coalesce(v_o, 'Aile')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.cat_aile_gorev_iliski(uuid) from public;
grant execute on function public.cat_aile_gorev_iliski(uuid) to authenticated;

-- Ayrılma / çıkarma / dağılma: aile görev ilişkileri de biter (önceki sürümün üzerine yazar).
create or replace function public.cat_aile_ayril(p_aile uuid, p_uye uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_dagildi boolean := false;
begin
  if p_uye <> auth.uid() and not exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = auth.uid() and rol = 'yonetici' and durum = 'aktif') then
    raise exception 'yalnız yönetici çıkarır';
  end if;
  update public.cat_aile_uye set durum = 'ayrildi', guncellendi = now() where aile = p_aile and uye = p_uye;
  update public.cat_aile set anahtar_surum = anahtar_surum + 1 where id = p_aile;
  if exists (select 1 from public.cat_aile_uye where aile = p_aile and uye = p_uye and rol = 'yonetici') then
    update public.cat_aile_uye set durum = 'ayrildi', guncellendi = now() where aile = p_aile;
    v_dagildi := true;
  end if;
  update public.cat_iliski i set durum = 'sonlandi', sonlandi = now(), sonlandiran = auth.uid()
  where i.disiplin = 'aile' and i.durum = 'aktif'
    and (v_dagildi and exists (select 1 from public.cat_aile_uye u where u.aile = p_aile and u.uye in (i.koc, i.danisan))
         or i.koc = p_uye or i.danisan = p_uye);
end $$;
revoke all on function public.cat_aile_ayril(uuid, uuid) from public;
grant execute on function public.cat_aile_ayril(uuid, uuid) to authenticated;

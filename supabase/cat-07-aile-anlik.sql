-- Aile grubu: grup anahtarı üyeye bırakılınca üyenin cihazı hemen haberdar olsun (27 eylül). cat-06 sonrası, bir kez.
do $$ begin alter publication supabase_realtime add table public.cat_aile_anahtar; exception when duplicate_object then null; when undefined_object then null; end $$;

-- Yönetici kendi sardığı anahtar satırlarını görebilsin (hangi üyeye bıraktığını bilmek için).
-- İçerik zaten şifreli; yalnızca yönetici ile o üyenin anahtarıyla açılır.
drop policy if exists cat_aile_anahtar_saran_oku on public.cat_aile_anahtar;
create policy cat_aile_anahtar_saran_oku on public.cat_aile_anahtar for select using (saran = auth.uid());

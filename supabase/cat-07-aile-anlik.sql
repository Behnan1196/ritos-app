-- Aile grubu: grup anahtarı üyeye bırakılınca üyenin cihazı hemen haberdar olsun (27 eylül). cat-06 sonrası, bir kez.
do $$ begin alter publication supabase_realtime add table public.cat_aile_anahtar; exception when duplicate_object then null; when undefined_object then null; end $$;

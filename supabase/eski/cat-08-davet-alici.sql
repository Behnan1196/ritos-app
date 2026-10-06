-- Ritos — bekleyen davette kimin davet edildiği görünsün (28 eylül). cat-04'ten SONRA, BİR KEZ.
-- Yalnız koç kendi davetlerini okur (mevcut RLS); danışan tarafında değişiklik yok.
alter table public.cat_davet add column if not exists alici text;
notify pgrst, 'reload schema';

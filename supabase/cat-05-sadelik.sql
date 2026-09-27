-- ————————————————————————————————————————————————————————————————
-- Ritos — V1 sadelik (27 eylül 2026). cat-04'ten SONRA, BİR KEZ çalıştır.
--  • Kurtarma kelimeleri kayıtta gösterilmiyor; kaydedildiği an burada tutulur (hatırlatma için).
--  • Kelimesiz şifre sıfırlamada danışmanlık anahtar çifti yeniden üretilir: kullanıcı kendi
--    açık anahtar satırını silebilmeli.
-- ————————————————————————————————————————————————————————————————

alter table public.cat_profil add column if not exists kurtarma_kaydedildi timestamptz;

drop policy if exists cat_acik_anahtar_kendi_sil on public.cat_acik_anahtar;
create policy cat_acik_anahtar_kendi_sil on public.cat_acik_anahtar for delete using (auth.uid() = id);

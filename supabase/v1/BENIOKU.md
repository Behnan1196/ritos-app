# Ritos v1 şeması (yeni, yalnız Ritos'a ait Supabase projesi)

Sırayla, her biri bir kez (yeniden çalıştırılabilir) SQL Editor'de:

1. `01-temel.sql` — profil (kayıtta kendiliğinden), kişisel eşitleme `kayit`, `paket` kataloğu, `hesabimi_sil()`
2. `02-paket-veri.sql` — sınav kataloğu + hazır hafta şablonları
3. `03-cevrem.sql` — Çevrem: grup, grup_uye, grup_davet (6 harfli kod), liste, liste_madde, ortak_is, ortak_is_kayit, rica + RLS + Realtime
4. `04-danismanlik.sql` — danışmanlık köprüsü: iliski, dan_davet, mesaj (düz JSON) + Realtime
5. `05-eposta-davet.sql` — e-postayla danışmanlık daveti (dan_davet.alici_eposta, bana_gelen_dan_davetler)
6. `06-bildirim.sql` — Web Push kuyruğu (push_abone, bildirim, bildirim_kaynak), rica/davet bildirimleri, dakikalık cron. Önce Vault'a iki sır (dosyanın başındaki açıklama). Edge Function: `functions/ritos-bildirim` (Verify JWT kapalı; secrets: RITOS_VAPID_*, RITOS_CRON_GIZLI).
7. `07-paylasim.sql` — Paylaş: kart/program tanımını Çevrem'deki birine gönder (paylasim) + bildirim

Şifre yok; yetkiyi RLS belirler. Eski `cat-*.sql` dosyaları `supabase/eski/` altında; eski ortak projeye aittir, burada kullanılmaz.

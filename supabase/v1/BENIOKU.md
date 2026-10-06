# Ritos v1 şeması (yeni, yalnız Ritos'a ait Supabase projesi)

Sırayla, her biri bir kez (yeniden çalıştırılabilir) SQL Editor'de:

1. `01-temel.sql` — profil (kayıtta kendiliğinden), kişisel eşitleme `kayit`, `paket` kataloğu, `hesabimi_sil()`
2. `02-paket-veri.sql` — sınav kataloğu + hazır hafta şablonları
3. `03-cevrem.sql` — Çevrem: grup, grup_uye, grup_davet (6 harfli kod), liste, liste_madde, ortak_is, ortak_is_kayit, rica + RLS + Realtime
4. `04-danismanlik.sql` — danışmanlık köprüsü: iliski, dan_davet, mesaj (düz JSON) + Realtime

Şifre yok; yetkiyi RLS belirler. Eski `cat-*.sql` dosyaları eski ortak projeye aittir, burada kullanılmaz.

-- =====================================================================
-- RITOS — TEST VERİSİ: bildirim kuyruğu + dış uygulama kartları (2 ekim)
-- SQL Editor'de çalıştır (cat-09 ve cat-10 kurulu olmalı). Tekrar çalıştırılabilir.
-- Alıcı: e-posta ile bulunur — kendi hesabın.
-- =====================================================================
do $$
declare
  u uuid := (select id from auth.users where email = 'behnan.ozturkmen@gmail.com');
  bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if u is null then raise exception 'Kullanıcı bulunamadı'; end if;

  -- ———— Bildirimler ————
  delete from cat_bildirim where alici = u and kaynak in ('test-beslenme', 'test-kapali');
  insert into cat_bildirim (alici, kaynak, baslik, metin, gonder_zamani) values
    (u, 'test-beslenme', '🍽 Test: hemen',        'Bir dakika içinde gelmeli', now()),
    (u, 'test-beslenme', '🍽 Test: 3 dk sonra',   'Zamanlanmış bildirim',      now() + interval '3 minutes'),
    (u, 'test-beslenme', '🍽 Test: eski',         'GELMEMELİ — 2 saat gecikmiş, atlanır', now() - interval '2 hours'),
    (u, 'test-kapali',   '🚫 Test: kapalı kaynak','GELMEMELİ — kaynak kapalı', now());
  insert into cat_bildirim_kaynak (uye, kaynak, acik) values (u, 'test-kapali', false)
    on conflict (uye, kaynak) do update set acik = false;

  -- ———— Dış uygulama kartları (Ajanda) ————
  delete from cat_dis_kart where alici = u and kaynak = 'Beslenme (test)';
  insert into cat_dis_kart (alici, kaynak, dis_id, ad, aciklama, video, tarih, saat, hatirlat_dk, sure, olcu_ad, olcu_birim) values
    (u, 'Beslenme (test)', 'kahvalti-1', 'Kahvaltı: yulaf + yumurta', E'- 40 g yulaf\n- 2 yumurta\n- 1 avuç ceviz', null, bugun, '08:30', 10, false, null, null),
    (u, 'Beslenme (test)', 'tarti-1',    'Sabah tartısı',             'Aç karnına, tuvaletten sonra', null, bugun, null, null, false, 'Kilo', 'kg'),
    (u, 'Beslenme (test)', 'yuruyus-1',  'Akşam yürüyüşü',            'Tempolu, sohbet edebileceğin hızda', null, bugun, '19:00', 15, true, null, null),
    (u, 'Beslenme (test)', 'aksam-2',    'Yarın akşam: sebze yemeği', null, null, bugun + 1, '19:30', 30, false, null, null),
    (u, 'Beslenme (test)', 'iptal-1',    'Bu kart iptal edilecek',    'Durumu iptal yapınca Ritos kaldırmalı', null, bugun, null, null, false, null, null);
end $$;

-- Sonucu izle (Ritos'ta işaretledikten sonra):
--   select ad, tarih, yapildi, yapildi_zaman, degerler from cat_dis_kart where kaynak = 'Beslenme (test)' order by tarih, saat;
-- İptal denemesi:
--   update cat_dis_kart set durum = 'iptal' where kaynak = 'Beslenme (test)' and dis_id = 'iptal-1';
-- Bildirimleri izle:
--   select baslik, gonder_zamani, gonderildi from cat_bildirim where kaynak like 'test-%' order by gonder_zamani;
-- Temizlik:
--   delete from cat_dis_kart where kaynak = 'Beslenme (test)'; delete from cat_bildirim where kaynak like 'test-%';
--   delete from cat_bildirim_kaynak where kaynak = 'test-kapali';

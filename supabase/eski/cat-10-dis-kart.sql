-- =====================================================================
-- RITOS — cat-10: DIŞ UYGULAMADAN AJANDA KARTI (2 ekim)
-- Aynı Supabase'i kullanan bir uygulama, kullanıcıya düşen bir görevi Ritos ajandasına kart
-- olarak koyar — koçun danışanına kart göndermesiyle aynı mantık. Ritos satırı karta çevirir;
-- kullanıcı işaretleyince / değer girince sonucu aynı satıra geri yazar (yapildi, degerler).
-- Bir satır = bir günün kartı (tekrar eden görev için uygulama her gün için ayrı satır yazar).
--
--   insert into cat_dis_kart (kaynak, dis_id, ad, aciklama, tarih, saat, hatirlat_dk)
--   values ('beslenme', 'ogun-2026-10-03-aksam', 'Akşam öğünü', 'Izgara + salata', '2026-10-03', '19:30', 15);
--
-- İptal: durum = 'iptal' yap (Ritos kartı kaldırır, yapılmışsa dokunmaz).
-- Not: içerik bu tabloda düz metindir (Ritos kartları ise şifreli); bu, dış uygulamanın kendi verisidir.
-- =====================================================================
create table if not exists cat_dis_kart (
  id            uuid primary key default gen_random_uuid(),
  alici         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kaynak        text not null,                 -- uygulamanın adı ('beslenme', …) — kartta görünür
  dis_id        text,                          -- uygulamanın kendi kimliği (aynı dis_id ile yeniden yazınca günceller)
  ad            text not null,
  aciklama      text,
  video         text,                          -- YouTube / Instagram bağlantısı
  tarih         date not null,
  saat          text,                          -- 'HH:MM' (isteğe bağlı)
  hatirlat_dk   int,                           -- saatten kaç dk önce bildirim (0 = vaktinde, null = yok)
  sure          boolean not null default false,-- işaretlerken süre sorulsun / sayaç
  olcu_ad       text,                          -- işaretlerken sorulacak değer (örn. 'Kilo')
  olcu_birim    text,                          -- örn. 'kg'
  durum         text not null default 'aktif' check (durum in ('aktif', 'iptal')),
  -- Ritos'un geri yazdığı sonuç:
  yapildi       boolean not null default false,
  yapildi_zaman timestamptz,
  degerler      jsonb,
  sonuc_zamani  timestamptz,
  guncellendi   timestamptz not null default now(),
  unique (alici, kaynak, dis_id)
);
alter table cat_dis_kart enable row level security;
drop policy if exists cat_dis_kart_kendi on cat_dis_kart;
create policy cat_dis_kart_kendi on cat_dis_kart for all
  using (alici = auth.uid()) with check (alici = auth.uid());
create index if not exists cat_dis_kart_guncel on cat_dis_kart (alici, guncellendi);

-- Uygulama bir alanı değiştirince guncellendi kendiliğinden ilerlesin (Ritos bundan çeker).
-- Ritos'un yalnız sonucu yazdığı güncellemeler guncellendi'yi değiştirmez (döngü olmasın).
create or replace function cat_dis_kart_guncel() returns trigger language plpgsql as $$
begin
  if (new.ad, new.aciklama, new.video, new.tarih, new.saat, new.hatirlat_dk, new.sure, new.olcu_ad, new.olcu_birim, new.durum)
     is distinct from (old.ad, old.aciklama, old.video, old.tarih, old.saat, old.hatirlat_dk, old.sure, old.olcu_ad, old.olcu_birim, old.durum) then
    new.guncellendi := now();
  end if;
  return new;
end $$;
drop trigger if exists cat_dis_kart_guncel on cat_dis_kart;
create trigger cat_dis_kart_guncel before update on cat_dis_kart for each row execute function cat_dis_kart_guncel();

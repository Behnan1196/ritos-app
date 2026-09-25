'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { db, type CustomWidget, type HomeWidgetRow } from './db';

const SEED_KEY = 'home_widget_tohumlandi';

function toWidget({ guncellendi: _g, ...w }: HomeWidgetRow): CustomWidget {
  return w;
}

function ayni(a: CustomWidget, b: CustomWidget) {
  return a.type === b.type && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

// "Senin alanın" düzenini yerel DB'den okur, her değişikliği geri yazar.
// Arayüz, sıradan bir useState gibi davranır — bileşenlerin DB'den haberi yok.
//
// Tohum (seed) yalnızca İLK açılışta yazılır; kullanıcı her şeyi silerse
// boş kalır (varsayılanlar geri gelmez).
export function useHomeWidgets(seed: CustomWidget[]): {
  widgets: CustomWidget[];
  setWidgets: Dispatch<SetStateAction<CustomWidget[]>>;
  loaded: boolean;
} {
  const [widgets, setWidgets] = useState<CustomWidget[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Oku (bir kez).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tohumlandi = await db.ayar.get(SEED_KEY);
        if (!tohumlandi) {
          const now = Date.now();
          await db.transaction('rw', db.home_widget, db.ayar, async () => {
            await db.home_widget.bulkPut(seed.map((w) => ({ ...w, guncellendi: now })));
            await db.ayar.put({ anahtar: SEED_KEY, deger: true });
          });
        }
        const rows = await db.home_widget.toArray();
        if (!cancelled) setWidgets(rows.map(toWidget));
      } catch (err) {
        // Gizli pencere / engellenmiş depolama: bellekte çalışmaya devam et.
        console.warn('[ritos-db] Home düzeni okunamadı, bellekte devam ediliyor', err);
        if (!cancelled) setWidgets(seed);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yaz — yalnızca değişen/silinen satırlar (tam liste değil).
  useEffect(() => {
    if (!loaded) return;
    db.transaction('rw', db.home_widget, async () => {
      const mevcut = await db.home_widget.toArray();
      const byId = new Map(mevcut.map((r) => [r.id, r]));
      const kalanIds = new Set(widgets.map((w) => w.id));
      const silinecek = mevcut.filter((r) => !kalanIds.has(r.id)).map((r) => r.id);
      const now = Date.now();
      const degisen = widgets
        .filter((w) => {
          const r = byId.get(w.id);
          return !r || !ayni(r, w);
        })
        .map((w) => ({ ...w, guncellendi: now }));
      if (silinecek.length) await db.home_widget.bulkDelete(silinecek);
      if (degisen.length) await db.home_widget.bulkPut(degisen);
    }).catch((err) => console.warn('[ritos-db] Home düzeni yazılamadı', err));
  }, [widgets, loaded]);

  return { widgets, setWidgets, loaded };
}

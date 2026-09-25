'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

// Yerel DB'ye canlı bağlı sorgu: tablo değişince bileşen kendiliğinden yenilenir.
// (dexie-react-hooks yerine ~10 satır — ek bağımlılık yok.)
export function useCanli<T>(sorgu: () => Promise<T>, deps: unknown[], ilk: T): T {
  const [deger, setDeger] = useState<T>(ilk);
  useEffect(() => {
    const abonelik = liveQuery(sorgu).subscribe({
      next: setDeger,
      error: (e) => console.warn('[ritos-db] canlı sorgu hatası', e),
    });
    return () => abonelik.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return deger;
}

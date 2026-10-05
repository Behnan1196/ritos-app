'use client';

import { useEffect } from 'react';

// Yalnız üretim derlemesinde: geliştirmede önbellek eski kodu gösterip kafa karıştırır.
export default function SwKayit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // updateViaCache 'none': sw.js her açılışta HTTP önbelleğine bakılmadan kontrol edilir (yeni sürüm hemen gelsin).
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}

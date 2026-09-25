'use client';

import { useEffect } from 'react';

// Yalnız üretim derlemesinde: geliştirmede önbellek eski kodu gösterip kafa karıştırır.
export default function SwKayit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

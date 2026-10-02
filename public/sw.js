// Ritos service worker — uygulama kabuğunu önbellekler ki çevrimdışı da açılsın.
// Veri zaten cihazda (IndexedDB); Supabase gibi dış istekler önbelleğe alınmaz.
const SURUM = 'ritos-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(['/', '/manifest.webmanifest', '/ikon/192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SURUM).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Sayfa: önce ağ (yeni sürüm gelsin), yoksa önbellek.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const k = r.clone(); caches.open(SURUM).then((c) => c.put('/', k)); return r; })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Derlenmiş dosyalar adlarında hash taşır, değişmez: önce önbellek.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((h) => h || fetch(req).then((r) => { const k = r.clone(); caches.open(SURUM).then((c) => c.put(req, k)); return r; })),
    );
    return;
  }

  // Diğerleri (ikonlar, manifest): önbellekten ver, arkada tazele.
  e.respondWith(
    caches.match(req).then((h) => {
      const ag = fetch(req).then((r) => { if (r.ok) { const k = r.clone(); caches.open(SURUM).then((c) => c.put(req, k)); } return r; }).catch(() => h);
      return h || ag;
    }),
  );
});


// Bildirim (2 ekim) — cat_bildirim kuyruğundan Edge Function'ın gönderdiği Web Push.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Ritos', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ritos', {
    body: d.body || '',
    icon: '/ikon/192.png',
    badge: '/ikon/192.png',
    tag: d.tag,
    data: { url: d.url || '/' },
  }));
});

// Dokununca: açık Ritos penceresi varsa ona geç (ve adrese git), yoksa yeni pencere aç.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  const hedef = new URL(url, self.location.origin);
  e.waitUntil((async () => {
    if (hedef.origin !== self.location.origin) return self.clients.openWindow(hedef.href);
    const ps = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of ps) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        c.postMessage({ ritos: 'bildirim-ac', url: hedef.pathname + hedef.search + hedef.hash });
        return;
      }
    }
    return self.clients.openWindow(hedef.href);
  })());
});

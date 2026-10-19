const CACHE_ADI = 'kamera-cevirmeni-v6';
const ONBELLEK_DOSYALARI = [
  './',
  './index.html',
  './app.js?v=6',
  './style.css?v=6',
  './manifest.json?v=6',
  './icons/icon-192.png?v=6',
  './icons/icon-512.png?v=6'
  // NOT: CDN betikleri (tesseract.min.js vb.) cross-origin CORS başlıkları
  // garanti olmadığı için burada önbelleğe alınmıyor.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ADI).then((cache) =>
      Promise.allSettled(ONBELLEK_DOSYALARI.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((anahtarlar) =>
      Promise.all(
        anahtarlar
          .filter((a) => a !== CACHE_ADI)
          .map((a) => caches.delete(a))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Sadece aynı origin'deki kaynakları önbelleğe al
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((cevap) => {
        if (cevap && cevap.status === 200) {
          const kopya = cevap.clone();
          caches.open(CACHE_ADI).then((cache) => cache.put(event.request, kopya));
        }
        return cevap;
      })
      .catch(() => caches.match(event.request))
  );
});
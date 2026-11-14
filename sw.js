// Offline support. Network-first (so new deploys show up), cache fallback (so it works with no internet).
const CACHE = 'astroself-v19';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/i18n.js',
  'js/store.js',
  'js/checkin.js',
  'js/rules.js',
  'js/demo.js',
  'js/ui.js',
  'js/body.js',
  'js/panel.js',
  'js/charts.js',
  'js/i4.js',
  'js/spaceweather.js',
  'js/emergency.js',
  'js/outlook.js',
  'js/routine.js',
  'js/report.js',
  'data/i18n.json',
  'data/references.json',
  'data/content.json',
  'data/sources.json',
  'data/i4_blood.json',
  'data/swpc_snapshot.json',
  'data/emergency.json',
  'vendor/three.module.min.js',
  'vendor/OrbitControls.js',
  'vendor/GLTFLoader.js',
  'vendor/BufferGeometryUtils.js',
  'vendor/meshopt_decoder.module.js',
  'vendor/chart.umd.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Add one by one so a single missing file does not break the whole install.
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    Promise.race([fetch(req, { cache: 'no-cache' }), timeout(3000)]) // always revalidate, so files of one deploy stay in step
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});

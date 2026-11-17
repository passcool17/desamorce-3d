/* Service worker manuel — Désamorce! 3D.
   Une seule VERSION, lue dans l'URL d'enregistrement (sw.js?v=VERSION), sert au nom du cache,
   aux URL précachées (?v=VERSION) et à l'importmap de index.html.
   - HTML, CSS et JS de l'application : réseau d'abord (cache: 'no-store'), le cache sert seulement hors ligne.
     Un ancien SW ne peut donc jamais mélanger un nouveau main.js avec un vieux module (bogue vu sur dossier-baass-3d).
   - vendor/ (noms versionnés : three-0.187.0/, detect-gpu-5.0.70, qrcode-generator-2.0.4) et bancs detect-gpu :
     cache d'abord, ils ne changent jamais sous le même nom.
   - skipWaiting + clients.claim ; les anciens caches sont supprimés à l'activation. */
const VERSION = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'desamorce-3d-v' + VERSION;
const V = '?v=' + VERSION;
const PRECACHE = [
  './', './index.html', './manuel.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
  './style.css' + V, './manual.css' + V, './logic.js' + V,
  './js/main.js' + V, './js/audio.js' + V, './js/faces.js' + V, './js/fx.js' + V, './js/bomb-model.js' + V, './js/manual.js' + V,
  './vendor/three-0.187.0/three.module.min.js',
  './vendor/three-0.187.0/addons/geometries/RoundedBoxGeometry.js',
  './vendor/three-0.187.0/addons/environments/RoomEnvironment.js',
  './vendor/three-0.187.0/addons/utils/BufferGeometryUtils.js',
  './vendor/detect-gpu-5.0.70.esm.js', './vendor/qrcode-generator-2.0.4.mjs'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});
async function dropOld() { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('desamorce-3d-') && k !== CACHE).map(k => caches.delete(k))); }
self.addEventListener('activate', e => { e.waitUntil((async () => { await self.clients.claim(); await dropOld(); })()); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isDoc = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isVendor = url.pathname.includes('/vendor/') || url.pathname.includes('/detect-gpu-benchmarks/');
  const isCode = /\.(m?js|css|webmanifest)$/i.test(url.pathname);
  if ((isDoc || isCode) && !isVendor) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
        return fresh;
      } catch {
        const hit = await caches.match(req, { ignoreSearch: false }) || (isDoc ? await caches.match(url.pathname.endsWith('manuel.html') ? './manuel.html' : './index.html') : undefined);
        return hit || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh && fresh.ok) { const c = await caches.open(CACHE); c.put(req, fresh.clone()); }
    return fresh;
  })());
});

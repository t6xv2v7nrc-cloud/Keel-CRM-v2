// Keel's service worker: makes Keel open fast, especially from the home screen on a weak signal.
//
// - The app's code and styles (/assets/, named after their contents so they never change) are kept
//   on the device and used from there: opening Keel no longer downloads them every time.
// - The page itself always comes from the network, so a new version shows straight away. If the
//   network is slow (3 seconds) or gone, the copy kept from last time is used instead.
// - Client data is never kept here: Supabase, /api and anything on another site go straight to the
//   network, untouched.

const CACHE = 'keel-shell-v1';
const PAGE = '/index.html';
const SLOW_MS = 3000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

/** Keep only the code and styles the newest page uses (the map and screenshot reader are fetched again when opened). */
async function prune(cache, html) {
  const used = new Set([...html.matchAll(/\/assets\/[^"'\s)]+/g)].map((m) => m[0]));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !used.has(path)) await cache.delete(req);
  }
}

async function page(request) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(request).then(async (res) => {
    if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
      await cache.put(PAGE, res.clone());
      prune(cache, await res.clone().text()).catch(() => {});
    }
    return res;
  });
  fresh.catch(() => {}); // offline: handled below; this only stops a stray error once the kept copy was used
  const slow = new Promise((resolve) => setTimeout(resolve, SLOW_MS, null));
  try {
    const first = await Promise.race([fresh, slow]);
    if (first) return first;
    return (await cache.match(PAGE)) ?? (await fresh);
  } catch {
    return (await cache.match(PAGE)) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(request);
  if (kept) return kept;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
});

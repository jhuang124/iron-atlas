/* Paths are resolved against the registration scope, including a GitHub Pages subpath. */
const VERSION = 'iron-atlas-v1';
const SCOPE = new URL(self.registration.scope);
const CACHE_SUFFIX = `:${SCOPE.pathname}`;
const CACHE_NAME = `${VERSION}${CACHE_SUFFIX}`;
const INDEX_URL = new URL('index.html', SCOPE).href;
const ROOT_URL = SCOPE.href;

function appUrl(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
}

function cacheable(response) {
  return response.ok && response.type !== 'opaque' && response.type !== 'opaqueredirect'
    && (!response.url || appUrl(new URL(response.url)));
}

function bundledUrls(html) {
  const urls = new Set([
    new URL('favicon.svg', SCOPE).href,
    new URL('manifest.webmanifest', SCOPE).href,
  ]);
  // Vite's entry script, stylesheet, and modulepreload links carry the hashed bundle names.
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      const url = new URL(match[1], INDEX_URL);
      if (appUrl(url) && /\.(?:js|css|woff2?|ttf|svg)(?:$|\?)/i.test(url.href)) urls.add(url.href);
    } catch { /* ignore an unrelated malformed link */ }
  }
  return [...urls];
}

async function storeAsset(cache, url) {
  const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
  if (!cacheable(response)) throw new Error(`Could not cache ${url}`);
  await cache.put(url, response.clone());
  // Fonts and images referenced by bundled CSS must also work on the first offline visit.
  if (new URL(url).pathname.endsWith('.css')) {
    const css = await response.text();
    const resources = new Set();
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
      try {
        const resource = new URL(match[1], url);
        if (appUrl(resource) && /\.(?:woff2?|ttf|svg|png|webp|jpe?g|gif)(?:$|\?)/i.test(resource.href)) {
          resources.add(resource.href);
        }
      } catch { /* data URLs and malformed references are not offline requests */ }
    }
    await Promise.all([...resources].map((resource) => storeAsset(cache, resource)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch(INDEX_URL, { cache: 'reload', credentials: 'same-origin' });
    if (!cacheable(response)) throw new Error('Could not cache the Iron Atlas app shell');
    const html = await response.clone().text();
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(bundledUrls(html).map((url) => storeAsset(cache, url)));
    await cache.put(INDEX_URL, response.clone());
    await cache.put(ROOT_URL, response);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      name.startsWith('iron-atlas-') && name.endsWith(CACHE_SUFFIX) && name !== CACHE_NAME
    ).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (cacheable(response) && response.headers.get('content-type')?.includes('text/html')) {
      // Cache the matching assets before replacing the offline shell with a newer deployment.
      const html = await response.clone().text();
      try {
        await Promise.all(bundledUrls(html).map((url) => storeAsset(cache, url)));
        await cache.put(INDEX_URL, response.clone());
        await cache.put(ROOT_URL, response.clone());
      } catch { /* retain the previous complete offline shell if a new asset is unavailable */ }
    }
    return response;
  } catch {
    return await cache.match(INDEX_URL) ?? await cache.match(ROOT_URL) ?? new Response(
      'Iron Atlas is unavailable offline. Open it online once to save the app on this device.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !appUrl(new URL(request.url))) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  // Only app resources are cached. Other GET requests retain normal browser behavior.
  if (['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)) {
    event.respondWith(asset(request));
  }
});

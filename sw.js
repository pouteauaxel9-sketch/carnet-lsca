/**
 * sw.js — Service Worker du Carnet Formation
 *
 * Stratégie de cache :
 * - Précache : tous les assets statiques (HTML/CSS/JS) à l'installation
 * - Runtime :
 *     - assets statiques  → cache-first (offline-first)
 *     - feeds.json GitHub → network-first avec fallback cache (frais si dispo, sinon dernière copie)
 *     - chrome-extension://, data:, etc. → bypass
 *
 * Versioning : à chaque déploiement, bump CACHE_VERSION pour invalider le cache.
 */

const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE  = 'cfb-static-' + CACHE_VERSION;
const RUNTIME_CACHE = 'cfb-runtime-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './auth-local.js',
  './evaluation-seance.js',
  './observation-match.js',
  './roster.js',
  './post-match.js',
  './feeds-form.js',
  './excel-export.js',
  './team-view.js',
  './transverse-view.js',
  './attendance.js',
  './pdf-report.js',
  './supabase-config.js',
  './supabase-service.js',
  './manifest.json',
  // CDN
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

/* ── install ──────────────────────────────────────────────── */

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // addAll ignore les requêtes opaques en erreur. On les fait une par une pour tolérer un asset manquant.
      return Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('SW: skip ' + url + ' (' + err.message + ')'))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── activate ─────────────────────────────────────────────── */

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k.startsWith('cfb-') && k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── fetch ────────────────────────────────────────────────── */

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // bypass des schémas non-http
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // bypass chrome-extension, devtools etc.
  if (url.hostname === 'localhost' && url.port && url.port !== '8000' && url.port !== '8080') return;

  // feeds GitHub : network-first (on veut toujours essayer du frais)
  if (url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(networkFirst(req));
    return;
  }

  // API Supabase ou dofa : network-only (pas de cache, données dynamiques)
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('fff.fr')) {
    event.respondWith(fetch(req).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Assets statiques : cache-first
  event.respondWith(cacheFirst(req));
});

/* ── stratégies ──────────────────────────────────────────── */

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok && fresh.type !== 'opaque') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ feeds: {}, offline: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/* ── messages (pour skip-waiting depuis l'app) ───────────── */

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

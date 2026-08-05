/**
 * sw.js — Service Worker du Carnet Formation
 *
 * Stratégie de cache :
 *  - HTML / CSS / JS : STALE-WHILE-REVALIDATE
 *      → l'app démarre vite (cache) MAIS on fetch en parallèle
 *      → la prochaine visite verra la version fraîche
 *      → plus jamais de "j'ai push mais je vois l'ancienne version"
 *  - feeds.json GitHub : network-first
 *  - APIs externes : network-only
 *
 * Versioning : bump CACHE_VERSION à chaque changement du SW lui-même.
 */

const CACHE_VERSION = 'v3.6.0-dashboard-standings-only';
const STATIC_CACHE  = 'cfb-static-'  + CACHE_VERSION;
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
  './injury.js',
  './profiling.js',
  './directeur-view.js',
  './career.js',
  './weekly-focus.js',
  './season-plan.js',
  './advanced-stats.js',
  './ux-polish.js',
  './live-training.js',
  './sessions-history.js',
  './season-transition.js',
  './pdf-report.js',
  './pdf-logos.js',
  './pwa.js',
  './manifest.json',
  // CDN
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

/* ── install ──────────────────────────────────────────────── */

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      Promise.all(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('SW: skip ' + url + ' (' + err.message + ')')
          )
        )
      )
    ).then(() => self.skipWaiting())
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

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname === 'localhost' && url.port && url.port !== '8000' && url.port !== '8080') return;

  // feeds.json GitHub : network-first
  if (url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(networkFirst(req));
    return;
  }

  // APIs externes : network-only
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('fff.fr')) {
    event.respondWith(fetch(req).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Tout le reste (HTML / CSS / JS / images) : stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});

/* ── stratégies ──────────────────────────────────────────── */

// STALE-WHILE-REVALIDATE : renvoie le cache immédiatement,
// et met à jour le cache en tâche de fond pour la prochaine fois.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);

  const networkPromise = fetch(req).then(res => {
    if (res.ok && res.type !== 'opaque') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);

  // Si on a du cache : servir tout de suite, revalider en parallèle
  if (cached) {
    networkPromise.then(() => {});
    return cached;
  }
  // Pas de cache : attendre le réseau
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('Offline', { status: 503 });
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

/* ── messages ────────────────────────────────────────────── */

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

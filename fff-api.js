/**
 * fff-api.js — Récupération temps réel des classements FFF (District Mayenne, Ligue PdL)
 *
 * Utilise l'API interne non-documentée du site mayenne.fff.fr :
 *   https://api-dofa.fff.fr/api/compets/{id}/phases/{phase}/poules/{poule}/classement_journees
 *
 * Depuis l'URL FFF publique on extrait les 3 IDs (id, phase, poule) puis on
 * appelle directement l'API JSON (sans scraping HTML). Les classements sont
 * mis en cache 1h par équipe pour éviter de spammer la FFF.
 *
 * Expose : window.FffApiModule.{
 *   parseUrl(url),       // → { competId, phaseId, pouleId } ou null
 *   fetchStandings(url), // → promise [{rank, team, played, pts, diff, ...}]
 *   fetchStandingsForTeams(teams), // Promise.all pour plusieurs équipes
 *   clearCache(),
 * }
 */
(function () {
  'use strict';

  const CACHE_KEY = 'cfb6_fff_cache_v2';     // { [url]: { fetchedAt, data } } — bump pour invalider cache "Équipe inconnue"
  const CACHE_TTL_MS = 60 * 60 * 1000;        // 1 h

  /* ── Cache localStorage (dédoublonne les requêtes) ─────────────── */

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (_) {}
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (_) {} }

  function getCached(url) {
    const c = loadCache();
    const entry = c[url];
    if (!entry) return null;
    if (Date.now() - (entry.fetchedAt || 0) > CACHE_TTL_MS) return null;
    return entry.data;
  }
  function setCached(url, data) {
    const c = loadCache();
    c[url] = { fetchedAt: Date.now(), data };
    saveCache(c);
  }

  /* ── Parsing de l'URL FFF publique ─────────────────────────────── */

  // Extrait id/phase/poule depuis une URL comme :
  //   https://mayenne.fff.fr/competitions?tab=ranking&id=450413&phase=1&poule=3&type=ch
  // Fonctionne aussi avec les variantes trailing-slash, ordre params différent, etc.
  function parseUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const id    = parseInt(u.searchParams.get('id'), 10);
      const phase = parseInt(u.searchParams.get('phase'), 10);
      const poule = parseInt(u.searchParams.get('poule'), 10);
      if (!id || !phase || !poule) return null;
      return { competId: id, phaseId: phase, pouleId: poule };
    } catch {
      return null;
    }
  }

  /* ── Appel API DOFA ─────────────────────────────────────────────── */

  function buildApiUrl(competId, phaseId, pouleId) {
    return `https://api-dofa.fff.fr/api/compets/${competId}/phases/${phaseId}/poules/${pouleId}/classement_journees`;
  }

  // Transforme un item de la réponse API en objet simple affichable
  // La structure réelle : item.equipe.{short_name, short_name_ligue, short_name_federation, cl_no, ...}
  function normalize(item) {
    const equipe = item?.equipe || {};
    const label = equipe.short_name_ligue || equipe.short_name || equipe.short_name_federation
               || equipe.name || 'Équipe ' + (equipe.cl_no || '?');
    const code  = equipe.cl_no || equipe.code || '';
    return {
      rank:      item.rank ?? '-',
      team:      label,
      teamCode:  code,
      played:    item.total_games_count ?? '-',
      pts:       item.point_count ?? '-',
      won:       item.won_games_count ?? 0,
      draw:      item.draw_games_count ?? 0,
      lost:      item.lost_games_count ?? 0,
      goalsFor:  item.goals_for_count ?? 0,
      goalsAgst: item.goals_against_count ?? 0,
      diff:      item.goals_diff ?? 0,
      forfeits:  item.forfeits_games_count ?? 0,
    };
  }

  // On passe par notre propre Netlify Function (/.netlify/functions/fff-proxy)
  // qui fait l'appel côté serveur et renvoie le JSON avec les bons headers CORS.
  // En fallback, quelques proxys publics (utiles en local avant déploiement).
  function buildNetlifyProxyUrl({ competId, phaseId, pouleId }) {
    return `/.netlify/functions/fff-proxy?compet=${competId}&phase=${phaseId}&poule=${pouleId}`;
  }
  const PUBLIC_CORS_FALLBACKS = [
    url => 'https://corsproxy.io/?' + encodeURIComponent(url),
    url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  ];

  async function fetchFff(parsed, apiUrl) {
    // 1) Essai via la Netlify Function (le chemin propre, prod)
    try {
      const proxyUrl = buildNetlifyProxyUrl(parsed);
      console.log('[FFF] Appel Netlify Function :', proxyUrl);
      const resp = await fetch(proxyUrl, { method: 'GET', cache: 'no-store' });
      if (resp.ok) {
        const json = await resp.json();
        console.log('[FFF] ✓ Netlify OK, ' + (json?.['hydra:member']?.length || 0) + ' équipes');
        return json;
      }
      console.warn('[FFF] Netlify Function HTTP ' + resp.status + ' → fallback proxys publics');
    } catch (e) {
      console.warn('[FFF] Netlify Function erreur, fallback :', e.message);
    }
    // 2) Fallback : proxys publics (dev local sans Netlify)
    let lastErr = null;
    for (let i = 0; i < PUBLIC_CORS_FALLBACKS.length; i++) {
      const proxyUrl = PUBLIC_CORS_FALLBACKS[i](apiUrl);
      try {
        console.log('[FFF] Fallback proxy #' + (i + 1) + ':', proxyUrl);
        const resp = await fetch(proxyUrl, { method: 'GET', cache: 'no-store' });
        if (!resp.ok) { lastErr = new Error('Proxy #' + (i + 1) + ' HTTP ' + resp.status); continue; }
        return await resp.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Impossible de joindre l\'API FFF');
  }

  async function fetchStandings(url, { force = false } = {}) {
    const parsed = parseUrl(url);
    if (!parsed) throw new Error('URL FFF invalide : ' + url);

    // Cache hit
    if (!force) {
      const cached = getCached(url);
      if (cached) return cached;
    }

    const apiUrl = buildApiUrl(parsed.competId, parsed.phaseId, parsed.pouleId);
    const json = await fetchFff(parsed, apiUrl);
    const items = Array.isArray(json?.['hydra:member']) ? json['hydra:member']
                : Array.isArray(json) ? json
                : [];
    const standings = items.map(normalize).sort((a, b) => (a.rank || 99) - (b.rank || 99));

    const result = {
      fetchedAt: new Date().toISOString(),
      pouleName: items[0]?.poule?.name || '',
      categoryLabel: items[0]?.equipe?.category_label || '',
      standings,
    };
    setCached(url, result);
    return result;
  }

  // Lance plusieurs fetches en parallèle, retourne un map { teamKey → data | error }
  async function fetchStandingsForTeams(teams) {
    const results = {};
    await Promise.all(teams.map(async t => {
      if (!t.fffUrl) { results[t.key] = { error: 'Pas d\'URL FFF' }; return; }
      try {
        results[t.key] = await fetchStandings(t.fffUrl);
      } catch (e) {
        results[t.key] = { error: e.message || String(e) };
      }
    }));
    return results;
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  window.FffApiModule = {
    parseUrl, fetchStandings, fetchStandingsForTeams, clearCache,
    buildApiUrl, normalize, // exposés pour debug
  };
})();

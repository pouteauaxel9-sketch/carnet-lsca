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

  const CACHE_KEY = 'cfb6_fff_cache_v3';     // v3 : inclut maintenant matches dans le résultat (ancien v2 sans matches)
  const CACHE_TTL_MS = 60 * 60 * 1000;        // 1 h

  // Nettoyage one-shot des anciennes versions de cache
  try { localStorage.removeItem('cfb6_fff_cache_v1'); } catch (_) {}
  try { localStorage.removeItem('cfb6_fff_cache_v2'); } catch (_) {}

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

  // Source principale : data/standings.json (produit par GitHub Actions toutes les 2h).
  // Servi par Netlify sous le même domaine, donc pas de CORS, pas de rate limit.
  // Fallback : Netlify Function (si classement très récent manque dans le JSON).
  const STANDINGS_JSON_URL = './data/standings.json';
  let standingsCache = null;
  let standingsCachePromise = null;

  async function loadStandingsJson() {
    if (standingsCache) return standingsCache;
    if (standingsCachePromise) return standingsCachePromise;
    standingsCachePromise = fetch(STANDINGS_JSON_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(json => { standingsCache = json; return json; })
      .catch(e => { console.warn('[FFF] data/standings.json indisponible :', e.message); return null; });
    return standingsCachePromise;
  }

  // Fallback via Netlify Function (si JSON pas à jour)
  function buildNetlifyProxyUrl({ competId, phaseId, pouleId }) {
    return `/.netlify/functions/fff-proxy?compet=${competId}&phase=${phaseId}&poule=${pouleId}`;
  }

  async function fetchViaFallback(parsed) {
    try {
      const proxyUrl = buildNetlifyProxyUrl(parsed);
      console.log('[FFF] Fallback Netlify Function :', proxyUrl);
      const resp = await fetch(proxyUrl, { method: 'GET', cache: 'no-store' });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('APPLICATION MOMENTAN')) throw new Error('FFF en maintenance');
        return JSON.parse(text);
      }
      throw new Error('Netlify Function HTTP ' + resp.status);
    } catch (e) {
      console.warn('[FFF] Fallback KO :', e.message);
      throw e;
    }
  }

  async function fetchStandings(url, { force = false } = {}) {
    const parsed = parseUrl(url);
    if (!parsed) throw new Error('URL FFF invalide : ' + url);

    // Cache hit en mémoire + localStorage
    if (!force) {
      const cached = getCached(url);
      if (cached) return cached;
    }

    // 1) PRIORITÉ : lecture du JSON pré-scrapé par GitHub Actions (rafraîchi hebdo)
    try {
      const data = await loadStandingsJson();
      if (data?.teams) {
        // Comparaison par identifiants (compet/phase/poule) plutôt que par URL exacte,
        // pour tolérer les variations de params (ordre, type=ch présent/absent, etc.)
        const want = `${parsed.competId}/${parsed.phaseId}/${parsed.pouleId}`;
        const foundKey = Object.keys(data.teams).find(k => {
          const entryParsed = parseUrl(data.teams[k].url);
          if (!entryParsed) return false;
          return `${entryParsed.competId}/${entryParsed.phaseId}/${entryParsed.pouleId}` === want;
        });
        if (foundKey) {
          const entry = data.teams[foundKey];
          if (Array.isArray(entry.standings) && entry.standings.length) {
            const result = {
              fetchedAt:     data.scrapedAt || new Date().toISOString(),
              pouleName:     entry.pouleName || '',
              categoryLabel: entry.categoryLabel || '',
              standings:     entry.standings,
              matches:       Array.isArray(entry.matches) ? entry.matches : [],
              source:        'github-actions',
            };
            setCached(url, result);
            console.log('[FFF] ✓ Chargé depuis data/standings.json (scrape du ' + (data.scrapedAt || '?') + ', ' + entry.standings.length + ' équipes, ' + result.matches.length + ' matchs)');
            return result;
          }
          console.warn('[FFF] Entrée "' + foundKey + '" trouvée mais standings vide dans data/standings.json');
        } else {
          console.log('[FFF] IDs ' + want + ' absents de data/standings.json. URLs présentes :',
            Object.values(data.teams).map(t => t.url));
        }
      }
    } catch (e) {
      console.warn('[FFF] Lecture JSON échouée, fallback Netlify :', e.message);
    }

    // 2) FALLBACK : Netlify Function (si pas encore dans le JSON ou JSON vide)
    const apiUrl = buildApiUrl(parsed.competId, parsed.phaseId, parsed.pouleId);
    const json = await fetchViaFallback(parsed);

    // Détection d'une page HTML "maintenance" renvoyée par la FFF (503 masqué)
    if (typeof json === 'string' && json.includes('APPLICATION MOMENTAN')) {
      throw new Error('FFF en maintenance — classement sera dans le prochain scrape auto');
    }
    if (!json || (!Array.isArray(json) && !Array.isArray(json?.['hydra:member']))) {
      throw new Error('Réponse FFF inattendue (API probablement bloquée côté serveur)');
    }
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

  /* ── Multi-phases : lecture directe depuis data/standings.json ─── */

  // Retourne la liste des phases d'une équipe telle qu'elle apparaît dans
  // le JSON scrapé. [{label, standings, matches, pouleName, categoryLabel}, ...]
  async function listPhasesForTeam(teamKey) {
    const data = await loadStandingsJson();
    const entry = data?.teams?.[teamKey];
    if (!entry) return [];
    if (entry.phases && typeof entry.phases === 'object') {
      return Object.keys(entry.phases).map(label => ({
        label,
        ...entry.phases[label],
      }));
    }
    if (entry.standings) {
      return [{
        label: 'Phase 1', url: entry.url,
        standings: entry.standings, matches: entry.matches || [],
        pouleName: entry.pouleName || '', categoryLabel: entry.categoryLabel || '',
      }];
    }
    return [];
  }

  function getDefaultPhaseLabel(teamEntry) {
    if (!teamEntry) return null;
    if (teamEntry.defaultPhase && teamEntry.phases?.[teamEntry.defaultPhase]) {
      return teamEntry.defaultPhase;
    }
    if (teamEntry.phases) {
      const labels = Object.keys(teamEntry.phases);
      return labels[labels.length - 1] || null;
    }
    return null;
  }

  async function getPhaseData(teamKey, phaseLabel) {
    const data = await loadStandingsJson();
    const entry = data?.teams?.[teamKey];
    if (!entry) return null;
    const label = phaseLabel || getDefaultPhaseLabel(entry);
    if (entry.phases?.[label]) {
      return { label, ...entry.phases[label] };
    }
    if (entry.standings) {
      return {
        label: label || 'Phase 1', url: entry.url,
        standings: entry.standings, matches: entry.matches || [],
        pouleName: entry.pouleName || '', categoryLabel: entry.categoryLabel || '',
      };
    }
    return null;
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  window.FffApiModule = {
    parseUrl, fetchStandings, fetchStandingsForTeams, clearCache,
    buildApiUrl, normalize,
    listPhasesForTeam, getPhaseData, getDefaultPhaseLabel,
    loadStandingsJson,
  };
})();

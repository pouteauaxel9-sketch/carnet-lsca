#!/usr/bin/env node
/**
 * scrape-fff-standings.js
 *
 * Lit data/fff-urls.json et scrape les classements FFF via l'API DOFA
 * en passant par ScraperAPI (proxies résidentiels) pour contourner le
 * blocage anti-bot IP cloud que subissent Netlify Functions, GitHub
 * Actions runners, Cloudflare Workers, etc.
 *
 * Écrit le résultat dans data/standings.json.
 *
 * Variable d'environnement requise :
 *   SCRAPERAPI_KEY = clé API ScraperAPI (gratuit : 1000 req/mois)
 *
 * Appelé par GitHub Actions (.github/workflows/scrape-fff.yml) chaque lundi matin.
 * En local : `SCRAPERAPI_KEY=xxx node scripts/scrape-fff-standings.js`
 *
 * Node 20+ requis (fetch global).
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT        = path.resolve(__dirname, '..');
const URLS_FILE   = path.join(ROOT, 'data', 'fff-urls.json');
const OUTPUT_FILE = path.join(ROOT, 'data', 'standings.json');

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || '';

if (!SCRAPERAPI_KEY) {
  console.error('✗ Variable SCRAPERAPI_KEY manquante.');
  console.error('   GitHub Actions : ajoute-la en secret (Settings → Secrets → Actions).');
  console.error('   En local : SCRAPERAPI_KEY=xxx node scripts/scrape-fff-standings.js');
  process.exit(1);
}

/* ── Parsing URL FFF ──────────────────────────────── */

function parseUrl(url) {
  try {
    const u = new URL(url);
    const id    = parseInt(u.searchParams.get('id'), 10);
    const phase = parseInt(u.searchParams.get('phase'), 10);
    const poule = parseInt(u.searchParams.get('poule'), 10);
    if (!id || !phase || !poule) return null;
    return { competId: id, phaseId: phase, pouleId: poule };
  } catch { return null; }
}

function buildApiUrl({ competId, phaseId, pouleId }) {
  return `https://api-dofa.fff.fr/api/compets/${competId}/phases/${phaseId}/poules/${pouleId}/classement_journees`;
}

// Endpoints matchs à essayer (le 1er qui répond un JSON array = gagné)
// Découvert via DevTools de mayenne.fff.fr : poule_journees retourne les matchs par journée.
function buildMatchesApiUrls({ competId, phaseId, pouleId }) {
  const base = `https://api-dofa.fff.fr/api/compets/${competId}/phases/${phaseId}/poules/${pouleId}`;
  return [
    `${base}/poule_journees`,         // ← trouvé via DevTools réel
    `${base}/matchs`,
    `${base}/rencontres`,
    `${base}/journees/matchs`,
    `${base}/calendrier`,
  ];
}

function buildScraperApiUrl(targetUrl) {
  const u = new URL('https://api.scraperapi.com/');
  u.searchParams.set('api_key', SCRAPERAPI_KEY);
  u.searchParams.set('url',     targetUrl);
  u.searchParams.set('country_code', 'fr');  // IP résidentielle française
  u.searchParams.set('render',  'false');     // pas besoin d'exécuter JS, l'API renvoie du JSON brut
  return u.toString();
}

function normalizeRow(item) {
  const equipe = item?.equipe || {};
  const label  = equipe.short_name_ligue || equipe.short_name || equipe.short_name_federation
              || equipe.name || ('Équipe ' + (equipe.club?.cl_no || '?'));
  return {
    rank:      item.rank ?? '-',
    team:      label,
    teamCode:  equipe.club?.cl_no || equipe.code || '',
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

/* ── Fetch avec ScraperAPI ────────────────────────── */

async function fetchViaScraper(apiUrl) {
  const scraperUrl = buildScraperApiUrl(apiUrl);
  const resp = await fetch(scraperUrl, { headers: { 'Accept': 'application/json, text/plain, */*' } });
  if (!resp.ok) throw new Error('ScraperAPI HTTP ' + resp.status);
  const text = await resp.text();
  if (text.includes('APPLICATION MOMENTAN')) {
    throw new Error('FFF maintenance');
  }
  try { return JSON.parse(text); }
  catch { throw new Error('non-JSON: ' + text.slice(0, 150).replace(/\s+/g, ' ')); }
}

async function fetchStanding(parsed) {
  return fetchViaScraper(buildApiUrl(parsed));
}

// Aplatit : si l'endpoint renvoie des journées contenant des matchs, extrait les matchs
function flattenMatches(items) {
  const out = [];
  items.forEach(it => {
    if (Array.isArray(it?.matchs))       it.matchs.forEach(m => out.push(m));
    else if (Array.isArray(it?.matches)) it.matches.forEach(m => out.push(m));
    else if (Array.isArray(it?.rencontres)) it.rencontres.forEach(m => out.push(m));
    else if (it?.home || it?.away || it?.equipe_home || it?.date_rencontre) out.push(it);
  });
  return out;
}

// Essaie plusieurs endpoints matchs jusqu'à en trouver un qui marche
async function fetchMatches(parsed) {
  const urls = buildMatchesApiUrls(parsed);
  let lastErr = null;
  for (const url of urls) {
    try {
      const json = await fetchViaScraper(url);
      const items = Array.isArray(json?.['hydra:member']) ? json['hydra:member']
                  : Array.isArray(json) ? json
                  : [];
      if (items.length > 0) {
        const flat = flattenMatches(items);
        console.log(`  ✓ endpoint matchs trouvé : ${url.split('/').pop()} (${flat.length} matchs après flatten)`);
        if (flat.length > 0) return flat;
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Aucun endpoint matchs ne répond');
}

function normalizeMatch(m) {
  const home = m?.home || m?.equipe_home || m?.equipe1 || m?.domicile || {};
  const away = m?.away || m?.equipe_away || m?.equipe2 || m?.exterieur || {};
  const homeLabel = home?.club?.short_name_ligue || home?.short_name_ligue || home?.short_name || home?.name || '?';
  const awayLabel = away?.club?.short_name_ligue || away?.short_name_ligue || away?.short_name || away?.name || '?';
  return {
    date:        m?.date || m?.date_rencontre || m?.start_at || null,
    journeeNo:   m?.journee_no || m?.journee || m?.cj_no || null,
    homeTeam:    homeLabel,
    awayTeam:    awayLabel,
    homeCode:    home?.club?.cl_no || home?.cl_no || null,
    awayCode:    away?.club?.cl_no || away?.cl_no || null,
    homeScore:   (m?.home_score ?? m?.score_home ?? m?.homeGoals ?? m?.but_home) ?? null,
    awayScore:   (m?.away_score ?? m?.score_away ?? m?.awayGoals ?? m?.but_away) ?? null,
    status:      m?.status || m?.etat || null,
    terrain:     m?.terrain?.name || m?.terrain_label || null,
  };
}

/* ── Main ─────────────────────────────────────────── */

async function main() {
  if (!fs.existsSync(URLS_FILE)) {
    console.error('✗ Fichier config manquant :', URLS_FILE);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(URLS_FILE, 'utf-8'));
  const teams  = config.teams || {};
  const keys   = Object.keys(teams);

  console.log(`🏆 Scraping ${keys.length} équipe(s) pour la saison ${config.season || '?'} via ScraperAPI\n`);

  const result = {
    scrapedAt: new Date().toISOString(),
    season:    config.season || '',
    teams:     {},
  };

  let ok = 0, fail = 0;
  for (const key of keys) {
    const team = teams[key];
    console.log(`→ ${key} (${team.label || ''})`);
    const parsed = parseUrl(team.url);
    if (!parsed) {
      console.error(`  ✗ URL invalide : ${team.url}`);
      result.teams[key] = { label: team.label || key, url: team.url, error: 'URL invalide' };
      fail++;
      continue;
    }
    try {
      // Classement
      const json = await fetchStanding(parsed);
      const rows = Array.isArray(json?.['hydra:member']) ? json['hydra:member']
                 : Array.isArray(json) ? json
                 : [];
      const standings  = rows.map(normalizeRow).sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const firstPoule = rows[0]?.poule;

      // Matchs (best effort, pas bloquant)
      let matches = [];
      try {
        const rawMatches = await fetchMatches(parsed);
        matches = rawMatches.map(normalizeMatch)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        console.log(`  ✓ ${matches.length} matchs récupérés`);
      } catch (e) {
        console.warn(`  (pas de matchs : ${e.message})`);
      }

      result.teams[key] = {
        label:         team.label || key,
        url:           team.url,
        pouleName:     firstPoule?.name || '',
        categoryLabel: rows[0]?.equipe?.category_label || '',
        standings,
        matches,
      };
      console.log(`  ✓ ${standings.length} équipes au classement (poule : ${firstPoule?.name || '?'})`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Échec : ${e.message}`);
      result.teams[key] = { label: team.label || key, url: team.url, error: e.message };
      fail++;
    }
    // Petit délai entre équipes pour rester courtois
    await new Promise(r => setTimeout(r, 500));
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ Terminé : ${ok} OK · ${fail} échec(s)`);
  console.log(`📄 Fichier écrit : ${OUTPUT_FILE}`);

  if (ok === 0 && fail > 0) {
    console.error('✗ Aucune équipe scrapée avec succès, échec du run');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});

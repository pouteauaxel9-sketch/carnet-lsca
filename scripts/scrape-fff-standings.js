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

async function fetchStanding(parsed) {
  const apiUrl    = buildApiUrl(parsed);
  const scraperUrl = buildScraperApiUrl(apiUrl);
  const resp = await fetch(scraperUrl, { headers: { 'Accept': 'application/json, text/plain, */*' } });
  if (!resp.ok) throw new Error('ScraperAPI HTTP ' + resp.status);
  const text = await resp.text();
  if (text.includes('APPLICATION MOMENTAN')) {
    throw new Error('FFF a renvoyé sa page maintenance — réessayer plus tard');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Réponse non-JSON : ' + text.slice(0, 150).replace(/\s+/g, ' '));
  }
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
      const json = await fetchStanding(parsed);
      const rows = Array.isArray(json?.['hydra:member']) ? json['hydra:member']
                 : Array.isArray(json) ? json
                 : [];
      const standings  = rows.map(normalizeRow).sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const firstPoule = rows[0]?.poule;
      result.teams[key] = {
        label:         team.label || key,
        url:           team.url,
        pouleName:     firstPoule?.name || '',
        categoryLabel: rows[0]?.equipe?.category_label || '',
        standings,
      };
      console.log(`  ✓ ${standings.length} équipes récupérées (poule : ${firstPoule?.name || '?'})`);
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

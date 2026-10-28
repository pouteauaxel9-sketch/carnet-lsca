#!/usr/bin/env node
/**
 * scrape-fff-standings.js
 *
 * Lit data/fff-urls.json et scrape les classements FFF via l'API DOFA.
 * Écrit le résultat dans data/standings.json.
 *
 * Appelé par GitHub Actions (.github/workflows/scrape-fff.yml) toutes les 2h.
 * Peut aussi tourner en local : `node scripts/scrape-fff-standings.js`
 *
 * Node 18+ requis (fetch global).
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT        = path.resolve(__dirname, '..');
const URLS_FILE   = path.join(ROOT, 'data', 'fff-urls.json');
const OUTPUT_FILE = path.join(ROOT, 'data', 'standings.json');

const BROWSER_HEADERS = {
  'Accept':         'application/json, text/plain, */*',
  'Accept-Language':'fr-FR,fr;q=0.9,en;q=0.8',
  'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Referer':        'https://mayenne.fff.fr/',
  'Origin':         'https://mayenne.fff.fr',
};

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

/* ── Fetch avec retry ─────────────────────────────── */

async function fetchWithRetry(url, { maxRetries = 3, delayMs = 2000 } = {}) {
  let lastErr = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url, { headers: BROWSER_HEADERS });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      if (text.includes('APPLICATION MOMENTAN')) throw new Error('FFF en maintenance');
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Réponse non-JSON (HTML ' + text.slice(0, 60).replace(/\s+/g, ' ') + '…)');
      }
    } catch (e) {
      lastErr = e;
      console.warn(`  Tentative ${i + 1}/${maxRetries} échouée : ${e.message}`);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
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

  console.log(`🏆 Scraping ${keys.length} équipe(s) pour la saison ${config.season || '?'}\n`);

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
      const apiUrl = buildApiUrl(parsed);
      const json   = await fetchWithRetry(apiUrl);
      const rows   = Array.isArray(json?.['hydra:member']) ? json['hydra:member']
                   : Array.isArray(json) ? json
                   : [];
      const standings  = rows.map(normalizeRow).sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const firstPoule = rows[0]?.poule;
      result.teams[key] = {
        label:        team.label || key,
        url:          team.url,
        pouleName:    firstPoule?.name || '',
        categoryLabel:rows[0]?.equipe?.category_label || '',
        standings,
      };
      console.log(`  ✓ ${standings.length} équipes récupérées (poule : ${firstPoule?.name || '?'})`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Échec final : ${e.message}`);
      result.teams[key] = { label: team.label || key, url: team.url, error: e.message };
      fail++;
    }
    // Petit délai entre équipes pour ne pas déclencher le rate-limiting FFF
    await new Promise(r => setTimeout(r, 500));
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ Terminé : ${ok} OK · ${fail} échec(s)`);
  console.log(`📄 Fichier écrit : ${OUTPUT_FILE}`);

  // Exit 0 même si certaines équipes ont échoué (on garde les succès)
  // mais exit 1 si TOUTES ont échoué (pour alerter côté CI)
  if (ok === 0 && fail > 0) {
    console.error('✗ Aucune équipe scrapée avec succès, échec du run');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Erreur fatale :', e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * scrape-fff-standings.js
 *
 * Lit data/fff-urls.json et scrape les classements FFF via l'API DOFA
 * en utilisant Puppeteer (vrai Chrome headless) pour contourner le
 * blocage anti-bot (403) subi par les simples requêtes HTTP depuis les
 * IPs cloud (Netlify Lambda, GitHub Actions runners, etc.).
 *
 * Écrit le résultat dans data/standings.json.
 *
 * Appelé par GitHub Actions (.github/workflows/scrape-fff.yml) toutes les 2h.
 * Peut aussi tourner en local : `npm i puppeteer && node scripts/scrape-fff-standings.js`
 *
 * Node 20+ requis. Puppeteer télécharge sa propre version de Chromium.
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT        = path.resolve(__dirname, '..');
const URLS_FILE   = path.join(ROOT, 'data', 'fff-urls.json');
const OUTPUT_FILE = path.join(ROOT, 'data', 'standings.json');

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

/* ── Scraping via Puppeteer ───────────────────────── */

async function launchBrowser() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.error('✗ Puppeteer non installé. Dans GitHub Actions, assure-toi que la step "npm install puppeteer" est exécutée avant.');
    console.error('   En local : npm i puppeteer');
    throw e;
  }
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return browser;
}

async function fetchStanding(page, parsed) {
  const apiUrl = buildApiUrl(parsed);
  // Navigation directe vers l'API URL : Puppeteer suit les redirections et stocke
  // les cookies Cloudflare automatiquement. Le body de la page = la réponse JSON.
  // Cette approche évite le problème CORS d'un fetch() cross-subdomain fff.fr → api-dofa.fff.fr.
  const resp = await page.goto(apiUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });

  const status = resp?.status() || 0;
  const text   = await page.evaluate(() => document.body?.innerText || document.documentElement.textContent || '');

  if (text.includes('APPLICATION MOMENTAN')) {
    throw new Error('FFF a renvoyé sa page maintenance (anti-bot ou vraie panne)');
  }
  if (status >= 400) {
    throw new Error('HTTP ' + status + ' (début réponse: ' + text.slice(0, 100).replace(/\s+/g, ' ') + ')');
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Réponse non-JSON (début: ' + text.slice(0, 100).replace(/\s+/g, ' ') + ')');
  }
}

// Au tout premier lancement, on visite la page publique pour que Cloudflare pose
// ses cookies anti-bot (passé en argument "warmup" une seule fois).
async function warmup(page) {
  try {
    await page.goto('https://mayenne.fff.fr/competitions/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await new Promise(r => setTimeout(r, 2500)); // laisse Cloudflare challenge se résoudre
  } catch (e) {
    console.warn('  (warmup échoué, on tente quand même : ' + e.message + ')');
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

  console.log(`🏆 Scraping ${keys.length} équipe(s) pour la saison ${config.season || '?'} (via Puppeteer)\n`);

  const browser = await launchBrowser();
  const page    = await browser.newPage();
  // User-agent navigateur réel + headers typiques
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept':          'application/json, text/plain, */*',
  });

  // Chauffe Cloudflare une seule fois (cookies anti-bot)
  console.log('🔥 Warmup Cloudflare...');
  await warmup(page);

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
      const json = await fetchStanding(page, parsed);
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
    // Délai entre équipes pour ne pas déclencher le rate-limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  await browser.close();

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

/**
 * Scraper FFF — District Mayenne
 * Récupère classements, matchs à venir et résultats pour chaque équipe configurée.
 * Lancé automatiquement chaque lundi via GitHub Actions.
 *
 * Pour tester manuellement :
 *   node scrape-fff.js           → mode normal
 *   FFF_DEBUG=1 node scrape-fff.js → sauvegarde screenshots + HTML pour debug
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ─── Configuration des sources ────────────────────────────────────────────────
// Doit correspondre à TEAM_SOURCE_CONFIG dans app.js
const SOURCES = [
  {
    key: 'u13a',
    category: 'u13',
    label: 'U13 A',
    officialName: 'GJ LSCA LOUVERNE',
    urls: {
      ranking: 'https://mayenne.fff.fr/competitions?tab=ranking&id=437629&phase=2&poule=2&type=ch',
      agenda:  'https://mayenne.fff.fr/competitions?tab=agenda&id=437629&phase=2&poule=2&type=ch',
      results: 'https://mayenne.fff.fr/competitions?tab=resultat&id=437629&phase=2&poule=2&type=ch'
    }
  },
  {
    key: 'u12',
    category: 'u13',
    label: 'U12',
    officialName: 'GJ LSCA LOUVERNE 21',
    urls: {
      ranking: 'https://mayenne.fff.fr/competitions?tab=ranking&id=437631&phase=2&poule=1&type=ch',
      agenda:  'https://mayenne.fff.fr/competitions?tab=agenda&id=437631&phase=2&poule=1&type=ch',
      results: 'https://mayenne.fff.fr/competitions?tab=resultat&id=437631&phase=2&poule=1&type=ch'
    }
  }
  // Ajouter U13 B / U13 C ici quand leurs sources seront disponibles
];

const DEBUG      = process.env.FFF_DEBUG === '1';
const OUTPUT     = path.join(__dirname, '..', 'data', 'feeds.json');
const DEBUG_DIR  = path.join(__dirname, 'debug');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}

function parseScore(str) {
  if (!str) return null;
  const m = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? `${m[1]} - ${m[2]}` : null;
}

function isTeamName(str) {
  return str && str.length > 2 && isNaN(parseInt(str)) && !/^\d{2}\//.test(str);
}

async function loadPage(page, url, label) {
  console.log(`    → ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  // Attente supplémentaire pour le rendu dynamique
  await new Promise(r => setTimeout(r, 2500));

  if (DEBUG) {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, `${label}.png`), fullPage: true });
    fs.writeFileSync(path.join(DEBUG_DIR, `${label}.html`), await page.content());
    console.log(`    [debug] screenshot + HTML sauvegardés`);
  }
}

// ─── Extraction classement ────────────────────────────────────────────────────

async function extractStandings(page, url, label) {
  await loadPage(page, url, label);

  return page.evaluate(() => {
    // Cherche la table la plus pertinente (la plus grande avec du contenu textuel)
    const tables = Array.from(document.querySelectorAll('table'));
    const ranked = tables
      .map(t => ({ el: t, rows: t.querySelectorAll('tr').length }))
      .filter(({ rows }) => rows > 3)
      .sort((a, b) => b.rows - a.rows);

    if (!ranked.length) return [];

    const table = ranked[0].el;
    const rows = Array.from(table.querySelectorAll('tr')).slice(1); // skip header

    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      if (cells.length < 3) return null;

      // Heuristique colonnes : rang | équipe | joués | ... | points
      const rank   = cells[0] || '-';
      const team   = cells[1] || cells[2] || '-';
      // Points = dernière colonne numérique
      const nums   = cells.map(c => parseInt(c)).filter(n => !isNaN(n));
      const points = nums.length ? nums[nums.length - 1] : '-';
      const played = nums.length > 1 ? nums[0] : '-';

      if (!team || team.length < 2) return null;
      return { rank, team, points, played };
    }).filter(Boolean);
  });
}

// ─── Extraction matchs (agenda + résultats) ───────────────────────────────────

async function extractMatches(page, url, label, isUpcoming) {
  await loadPage(page, url, label);

  return page.evaluate((isUpcoming) => {
    const results = [];

    // Stratégie 1 : lignes de tableau
    const tableRows = Array.from(document.querySelectorAll('table tr'));
    for (const row of tableRows) {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      if (cells.length < 3) continue;

      const text = cells.join(' ');
      const dateMatch = text.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
      if (!dateMatch) continue;

      const date       = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      const scoreMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
      const score      = scoreMatch ? `${scoreMatch[1]} - ${scoreMatch[2]}` : '-';

      const teams = cells.filter(c =>
        c.length > 2 && isNaN(parseInt(c)) && !/^\d{2}\//.test(c) && !c.match(/^\d+[-–]\d+$/)
      );

      if (teams.length < 1) continue;
      results.push({
        date,
        home:  teams[0] || '-',
        away:  teams[1] || '-',
        score: isUpcoming ? '-' : score,
        raw:   cells
      });
    }

    // Stratégie 2 : blocs divs (si aucune table trouvée)
    if (!results.length) {
      const blocks = Array.from(document.querySelectorAll(
        '.match, .rencontre, .fixture, .agenda-item, .result-item, [class*="match"], [class*="rencontre"]'
      ));
      for (const block of blocks) {
        const text = block.textContent.trim();
        const dateMatch = text.match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
        if (!dateMatch) continue;

        const date       = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
        const scoreMatch = text.match(/(\d+)\s*[-–]\s*(\d+)/);
        const score      = scoreMatch ? `${scoreMatch[1]} - ${scoreMatch[2]}` : '-';

        const spans = Array.from(block.querySelectorAll('span, strong, div'))
          .map(el => el.textContent.trim())
          .filter(t => t.length > 2 && isNaN(parseInt(t)) && !/^\d{2}\//.test(t));

        results.push({
          date,
          home:  spans[0] || '-',
          away:  spans[1] || '-',
          score: isUpcoming ? '-' : score,
          raw:   [text]
        });
      }
    }

    return results.slice(0, 10);
  }, isUpcoming);
}

// ─── Normalisation vers le format attendu par l'app ───────────────────────────

function normalizeMatch(raw, source, isUpcoming) {
  const isHome = raw.home?.toUpperCase().includes(source.officialName.split(' ')[0].toUpperCase());
  return {
    date:        raw.date,
    team:        source.label,
    opponent:    isHome ? raw.away : raw.home,
    score:       raw.score,
    competition: 'Championnat District Mayenne'
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Démarrage du scraper FFF...\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const feeds = {};

  for (const source of SOURCES) {
    console.log(`\n📊 ${source.label} (${source.category.toUpperCase()})`);

    if (!feeds[source.category]) {
      feeds[source.category] = { standings: [], upcoming: [], past: [] };
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' });

    // Classement
    try {
      console.log('  Classement...');
      const standings = await extractStandings(page, source.urls.ranking, `${source.key}_ranking`);
      if (standings.length) {
        console.log(`  ✅ ${standings.length} équipes trouvées`);
        for (const row of standings) {
          const idx = feeds[source.category].standings.findIndex(e => e.team === row.team);
          if (idx >= 0) feeds[source.category].standings[idx] = row;
          else feeds[source.category].standings.push(row);
        }
      } else {
        console.log('  ⚠️  Aucun classement trouvé');
        if (!DEBUG) console.log('     → Lance FFF_DEBUG=1 node scrape-fff.js pour diagnostiquer');
      }
    } catch (e) {
      console.error(`  ❌ Erreur classement: ${e.message}`);
    }

    // Matchs à venir
    try {
      console.log('  Matchs à venir...');
      const rawUpcoming = await extractMatches(page, source.urls.agenda, `${source.key}_agenda`, true);
      if (rawUpcoming.length) {
        console.log(`  ✅ ${rawUpcoming.length} matchs trouvés`);
        for (const m of rawUpcoming) {
          const norm = normalizeMatch(m, source, true);
          if (!feeds[source.category].upcoming.some(e => e.date === norm.date && e.opponent === norm.opponent)) {
            feeds[source.category].upcoming.push(norm);
          }
        }
      } else {
        console.log('  ⚠️  Aucun match à venir trouvé');
      }
    } catch (e) {
      console.error(`  ❌ Erreur agenda: ${e.message}`);
    }

    // Résultats
    try {
      console.log('  Résultats...');
      const rawPast = await extractMatches(page, source.urls.results, `${source.key}_results`, false);
      if (rawPast.length) {
        console.log(`  ✅ ${rawPast.length} résultats trouvés`);
        for (const m of rawPast) {
          const norm = normalizeMatch(m, source, false);
          if (!feeds[source.category].past.some(e => e.date === norm.date && e.opponent === norm.opponent)) {
            feeds[source.category].past.push(norm);
          }
        }
      } else {
        console.log('  ⚠️  Aucun résultat trouvé');
      }
    } catch (e) {
      console.error(`  ❌ Erreur résultats: ${e.message}`);
    }

    await page.close();
  }

  await browser.close();

  // Tri des dates
  for (const cat of Object.values(feeds)) {
    const toDate = str => {
      const [d, m, y] = str.split('/').map(Number);
      return new Date(y, m - 1, d);
    };
    cat.upcoming.sort((a, b) => toDate(a.date) - toDate(b.date));
    cat.past.sort((a, b) => toDate(b.date) - toDate(a.date));
  }

  // Sauvegarde
  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const output = { lastUpdated: new Date().toISOString(), feeds };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  const stats = Object.entries(feeds).map(([cat, d]) =>
    `${cat.toUpperCase()}: ${d.standings.length} classement, ${d.upcoming.length} à venir, ${d.past.length} résultats`
  ).join(' | ');

  console.log(`\n✅ Sauvegardé → data/feeds.json`);
  console.log(`   ${stats}`);
  console.log(`   Mis à jour le ${new Date().toLocaleString('fr-FR')}\n`);
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err.message);
  process.exit(1);
});

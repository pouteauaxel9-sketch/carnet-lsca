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
    competitionLabel: 'Championnat U13 — Poule 2',
    competitionLevel: 'district',
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
    competitionLabel: 'Championnat U12 — Poule 1',
    competitionLevel: 'district',
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
    const tables = Array.from(document.querySelectorAll('table'));
    const ranked = tables
      .map(t => ({ el: t, rows: t.querySelectorAll('tr').length }))
      .filter(({ rows }) => rows > 3)
      .sort((a, b) => b.rows - a.rows);

    if (!ranked.length) return [];

    const table = ranked[0].el;

    // Lire l'en-tête pour identifier les colonnes
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll('th, td')).map(th => th.textContent.trim().toLowerCase())
      : [];

    // Correspondance label → index de colonne
    function findCol(...keys) {
      for (const k of keys) {
        const i = headers.findIndex(h => h === k || h.includes(k));
        if (i >= 0) return i;
      }
      return -1;
    }

    const col = {
      rank: findCol('pl', 'pos', '#', 'rang'),
      team: findCol('équipe', 'equipe', 'club'),
      pts:  findCol('pts', 'points'),
      jo:   findCol('jo', 'mj', 'j'),
      won:  findCol('g', 'v', 'gagnés'),
      draw: findCol('n', 'nul'),
      lost: findCol('p', 'perd'),
      bp:   findCol('bp', 'but+'),
      bc:   findCol('bc', 'but-'),
      dif:  findCol('dif', 'diff', '+/-'),
    };

    // Fallback : structure FFF standard Pl|Equipe|Pts|Jo|G|N|P|F|BP|BC|Pé|Dif
    if (col.pts === -1) {
      Object.assign(col, { rank:0, team:1, pts:2, jo:3, won:4, draw:5, lost:6, bp:8, bc:9, dif:11 });
    }

    const dataRows = Array.from(table.querySelectorAll('tbody tr'))
      .filter(r => r.querySelectorAll('td').length > 3);

    // Fallback si pas de tbody
    const rows = dataRows.length
      ? dataRows
      : Array.from(table.querySelectorAll('tr')).slice(1);

    return rows.map((row, i) => {
      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      if (cells.length < 3) return null;

      const get = idx => (idx >= 0 && idx < cells.length) ? cells[idx] : '-';

      const rank = get(col.rank) || String(i + 1);
      const team = get(col.team);
      if (!team || team.length < 2) return null;

      return {
        rank,
        team,
        points:       get(col.pts),
        played:       get(col.jo),
        won:          get(col.won),
        draw:         get(col.draw),
        lost:         get(col.lost),
        goalsFor:     get(col.bp),
        goalsAgainst: get(col.bc),
        diff:         get(col.dif)
      };
    }).filter(Boolean);
  });
}

// ─── Extraction matchs (agenda + résultats) ───────────────────────────────────

async function extractMatches(page, url, label, isUpcoming) {
  await loadPage(page, url, label);

  return page.evaluate((isUpcoming) => {
    const MONTHS = {
      janvier:1, février:2, fevrier:2, mars:3, avril:4, mai:5, juin:6,
      juillet:7, août:8, aout:8, septembre:9, octobre:10, novembre:11, décembre:12, decembre:12
    };

    function parseFFFDate(text) {
      // "samedi 09 mai 2026 - 13H30" ou "samedi 09 mai 2026"
      const m = text.toLowerCase().match(/(\d{1,2})\s+([a-zéûô]+)\s+(\d{4})/);
      if (!m) return null;
      const month = MONTHS[m[2]];
      if (!month) return null;
      return `${m[1].padStart(2,'0')}/${String(month).padStart(2,'0')}/${m[3]}`;
    }

    function parseFFFTime(text) {
      const m = text.match(/(\d{2})[Hh](\d{2})/);
      return m ? `${m[1]}h${m[2]}` : null;
    }

    function parseScoreFromImages(scoreEl) {
      if (!scoreEl) return '-';
      const imgs = Array.from(scoreEl.querySelectorAll('img.number'));
      if (imgs.length >= 2) {
        // src ressemble à "/wp-content/.../scores/origin/4.png"
        const getNum = img => {
          const src = img.getAttribute('src') || '';
          const m = src.match(/\/(\d+)\.png/);
          return m ? m[1] : null;
        };
        const g1 = getNum(imgs[0]);
        const g2 = getNum(imgs[1]);
        if (g1 !== null && g2 !== null) return `${g1} - ${g2}`;
      }
      // Fallback texte
      const txt = scoreEl.textContent.replace(/\s+/g, ' ').trim();
      const m = txt.match(/(\d+)\s*[-–]\s*(\d+)/);
      return m ? `${m[1]} - ${m[2]}` : '-';
    }

    const blocks = Array.from(document.querySelectorAll('.confrontation'));
    const results = [];

    for (const block of blocks) {
      const dateEl = block.querySelector('.date');
      if (!dateEl) continue;

      const dateRaw = dateEl.textContent.replace(/\s+/g, ' ').trim();
      const date = parseFFFDate(dateRaw);
      if (!date) continue;

      const time = parseFFFTime(dateRaw);
      const home = block.querySelector('.equipe1 .name')?.textContent.trim() || '-';
      const away = block.querySelector('.equipe2 .name')?.textContent.trim() || '-';

      if (home === '-' && away === '-') continue;

      const scoreEl = block.querySelector('.score_match');
      const score = isUpcoming ? '-' : parseScoreFromImages(scoreEl);

      results.push({ date, time, home, away, score });
    }

    return results.slice(0, 10);
  }, isUpcoming);
}

// ─── Normalisation vers le format attendu par l'app ───────────────────────────

function normalizeMatch(raw, source, isUpcoming) {
  const nameKey = source.officialName.split(' ')[0].toUpperCase();
  const isHome  = (raw.home || '').toUpperCase().includes(nameKey);
  return {
    date:        raw.date,
    time:        raw.time || null,
    team:        source.label,
    home:        raw.home,
    away:        raw.away,
    isHome,
    opponent:    isHome ? raw.away : raw.home,
    score:       raw.score,
    competition: source.competitionLabel
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Démarrage du scraper FFF...\n');

  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOptions);

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
        // Remplace toutes les lignes de cette source avant d'ajouter les nouvelles
        feeds[source.category].standings = feeds[source.category].standings.filter(
          s => s.source !== source.key
        );
        for (const row of standings) {
          const teamUpper = (row.team || '').toUpperCase();
          feeds[source.category].standings.push({
            ...row,
            source: source.key,
            competition: source.competitionLabel,
            competitionLevel: source.competitionLevel,
            isOurTeam: teamUpper.includes('LSCA') || teamUpper.includes('LOUVERNE')
          });
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
          if (!norm.isHome && !(m.away || '').toUpperCase().includes('LSCA') && !(m.away || '').toUpperCase().includes('LOUVERNE')) continue;
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
          if (!norm.isHome && !(m.away || '').toUpperCase().includes('LSCA') && !(m.away || '').toUpperCase().includes('LOUVERNE')) continue;
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

/**
 * Scraper FFF — version API directe (api-dofa.fff.fr)
 *
 * Plus de Puppeteer : on attaque directement l'API JSON officielle FFF
 * (api-dofa.fff.fr). Elle expose tous les résultats de la phase et le
 * classement courant. Rapide, robuste, pas de rendu navigateur à attendre.
 *
 * Endpoints utilisés :
 *   GET /api/compets/{compet}/phases/{phase}/poules/{poule}/classement_journees
 *   GET /api/compets/{compet}/phases/{phase}/poules/{poule}/resultat
 *       ?ma_dat[after]=YYYY-MM-DD&ma_dat[before]=YYYY-MM-DD
 *   GET /api/compets/{compet}/phases/{phase}/poules/{poule}/matchs
 *       ?ma_dat[after]=YYYY-MM-DD&ma_dat[before]=YYYY-MM-DD
 *
 * Réponses au format Hydra (paginé via hydra:view.hydra:next).
 *
 * Nécessite Node 18+ pour `fetch` natif. GitHub Actions ubuntu-latest a Node 20.
 */

const fs   = require('fs');
const path = require('path');

const API_BASE = 'https://api-dofa.fff.fr';
const OUTPUT   = path.join(__dirname, '..', 'data', 'feeds.json');

// Plage temporelle à scraper pour les résultats.
// On part en septembre pour couvrir toute la phase, et on va jusqu'en juin.
const SEASON_START = process.env.FFF_SEASON_START || '2025-09-01';
const SEASON_END   = process.env.FFF_SEASON_END   || '2026-06-30';

// Configuration des sources : chaque équipe scrapée a son (compet, phase, poule)
const SOURCES = [
  {
    key: 'u13a', category: 'u13', label: 'U13 A',
    compet: 437629, phase: 2, poule: 2,
    competitionLabel: 'Championnat U13 — Poule 2',
    competitionLevel: 'district',
  },
  {
    key: 'u12',  category: 'u13', label: 'U12',
    compet: 437631, phase: 2, poule: 1,
    competitionLabel: 'Championnat U12 — Poule 1',
    competitionLevel: 'district',
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; carnet-lsca-scraper/2.0)',
  'Accept':     'application/ld+json, application/json;q=0.9',
};

/* ─── utils ───────────────────────────────────────────────────────────────── */

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function fetchAllPages(baseUrl) {
  const all = [];
  let url = baseUrl;
  let guard = 0;
  while (url && guard++ < 50) {
    const j = await fetchJson(url);
    if (Array.isArray(j['hydra:member'])) all.push(...j['hydra:member']);
    const next = j['hydra:view']?.['hydra:next'];
    url = next ? API_BASE + next : null;
  }
  return all;
}

function isOurTeam(name) {
  const u = (name || '').toUpperCase();
  return u.includes('LSCA') || u.includes('LOUVERNE');
}

function toDdMmYyyy(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMatch(m, source) {
  const home = (m.home?.short_name || m.home?.club?.club_name || '?').trim();
  const away = (m.away?.short_name || m.away?.club?.club_name || '?').trim();
  const isHome = isOurTeam(home);
  const opponent = isHome ? away : home;

  const date = toDdMmYyyy(m.date);
  let time = null;
  if (typeof m.time === 'string' && m.time.length >= 4) {
    time = m.time.slice(0, 5).replace(':', 'h');
  } else if (m.date && m.date.includes('T')) {
    const t = m.date.split('T')[1];
    if (t && t !== '00:00:00+00:00') time = t.slice(0, 5).replace(':', 'h');
  }

  const status = (m.status || '').toUpperCase();
  const hasScore = m.home_score != null && m.away_score != null
                   && status !== 'A'      // À venir
                   && status !== 'P'      // Programmé
                   && !m.seems_postponed;
  const score = hasScore ? `${m.home_score} - ${m.away_score}` : '-';

  return {
    date, time,
    team: source.label,
    home, away, isHome,
    opponent,
    score,
    competition: source.competitionLabel,
    status: m.status_label || m.status || '',
  };
}

function sortByDateAsc(a, b)  { return parseFr(a.date) - parseFr(b.date); }
function sortByDateDesc(a, b) { return parseFr(b.date) - parseFr(a.date); }
function parseFr(s) {
  if (!s) return 0;
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/* ─── pipeline par source ─────────────────────────────────────────────────── */

async function scrapeStandings(feedsCat, source) {
  console.log('  Classement...');
  try {
    const list = await fetchAllPages(
      `${API_BASE}/api/compets/${source.compet}/phases/${source.phase}/poules/${source.poule}/classement_journees`
    );
    list.sort((a, b) => (a.rank || 99) - (b.rank || 99));
    let added = 0;
    for (const row of list) {
      const teamName = (row.equipe?.short_name || row.equipe?.club_name || row.equipe?.club?.name || '?').trim();
      feedsCat.standings.push({
        rank: String(row.rank ?? '-'),
        team: teamName,
        points: String(row.point_count ?? '-'),
        played: String(row.total_games_count ?? '-'),
        won:    String(row.won_games_count  ?? '-'),
        draw:   String(row.draw_games_count ?? '-'),
        lost:   String(row.lost_games_count ?? '-'),
        goalsFor:     String(row.goals_for_count     ?? '-'),
        goalsAgainst: String(row.goals_against_count ?? '-'),
        diff:         String(row.goals_diff          ?? '-'),
        source:           source.key,
        competition:      source.competitionLabel,
        competitionLevel: source.competitionLevel,
        isOurTeam:        isOurTeam(teamName),
      });
      added++;
    }
    console.log(`  ✅ ${added} équipes`);
  } catch (e) {
    console.error('  ❌ Classement: ' + e.message);
  }
}

async function scrapeResults(feedsCat, source) {
  console.log('  Résultats...');
  try {
    const url = `${API_BASE}/api/compets/${source.compet}/phases/${source.phase}/poules/${source.poule}/resultat`
              + `?ma_dat[after]=${SEASON_START}&ma_dat[before]=${SEASON_END}`;
    const list = await fetchAllPages(url);
    let added = 0;
    for (const m of list) {
      if (!isOurTeam(m.home?.short_name) && !isOurTeam(m.away?.short_name)) continue;
      const norm = normalizeMatch(m, source);
      if (!feedsCat.past.some(e => e.date === norm.date && e.opponent === norm.opponent && e.team === norm.team)) {
        feedsCat.past.push(norm);
        added++;
      }
    }
    console.log(`  ✅ ${added} résultats`);
  } catch (e) {
    console.error('  ❌ Résultats: ' + e.message);
  }
}

async function scrapeUpcoming(feedsCat, source) {
  console.log('  Matchs à venir...');
  try {
    const after = todayIso();
    // L'endpoint /matchs renvoie tous les matchs (joués + à venir).
    // On filtre par date >= aujourd'hui pour ne garder que les futurs.
    const url = `${API_BASE}/api/compets/${source.compet}/phases/${source.phase}/poules/${source.poule}/matchs`
              + `?ma_dat[after]=${after}&ma_dat[before]=${SEASON_END}`;
    const list = await fetchAllPages(url);
    let added = 0;
    for (const m of list) {
      if (!isOurTeam(m.home?.short_name) && !isOurTeam(m.away?.short_name)) continue;
      // On ne garde que les matchs sans score / non joués
      const status = (m.status || '').toUpperCase();
      const played = m.home_score != null && m.away_score != null
                     && status !== 'A' && status !== 'P' && !m.seems_postponed;
      if (played) continue;
      const norm = normalizeMatch(m, source);
      if (!feedsCat.upcoming.some(e => e.date === norm.date && e.opponent === norm.opponent && e.team === norm.team)) {
        feedsCat.upcoming.push(norm);
        added++;
      }
    }
    console.log(`  ✅ ${added} matchs à venir`);
  } catch (e) {
    console.error('  ❌ Matchs à venir: ' + e.message);
  }
}

/* ─── main ────────────────────────────────────────────────────────────────── */

async function main() {
  console.log('\n🚀 Scraper FFF (API JSON) — Plage ' + SEASON_START + ' → ' + SEASON_END + '\n');

  const feeds = {};
  for (const source of SOURCES) {
    console.log(`📊 ${source.label} (${source.category.toUpperCase()})`);
    if (!feeds[source.category]) feeds[source.category] = { standings: [], upcoming: [], past: [] };
    await scrapeStandings(feeds[source.category], source);
    await scrapeResults  (feeds[source.category], source);
    await scrapeUpcoming (feeds[source.category], source);
    console.log('');
  }

  // Tri final
  for (const cat of Object.values(feeds)) {
    cat.upcoming.sort(sortByDateAsc);
    cat.past.sort(sortByDateDesc);
  }

  // Sauvegarde
  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    feeds,
  }, null, 2));

  console.log('✅ data/feeds.json sauvegardé');
  Object.entries(feeds).forEach(([cat, d]) => {
    console.log(`   ${cat.toUpperCase()}: ${d.standings.length} équipes · ${d.upcoming.length} à venir · ${d.past.length} résultats`);
  });
  console.log(`   ${new Date().toLocaleString('fr-FR')}\n`);
}

main().catch(err => {
  console.error('\n❌ Erreur fatale:', err.message);
  process.exit(1);
});

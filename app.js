const APP_KEY = 'cfb6_state';
const SAVE_DELAY = 500;
const MANUAL_FEEDS_KEY = 'cfb6_feeds';

// URL brute vers data/feeds.json dans ton dépôt GitHub public.
// Format : 'https://raw.githubusercontent.com/TON_USERNAME/TON_REPO/main/data/feeds.json'
// Laisser vide tant que le repo n'est pas créé.
const GITHUB_DATA_URL = 'https://raw.githubusercontent.com/pouteauaxel9-sketch/carnet-lsca/main/data/feeds.json';
const CAT_LABELS = { u13: 'U13', u11: 'U11', u9: 'U9' };
const SEASONS = ['2025-2026', '2024-2025', '2023-2024'];
const AC = [
  ['#E6F1FB','#0C447C'],
  ['#EAF3DE','#27500A'],
  ['#FAEEDA','#633806'],
  ['#FBEAF0','#72243E'],
  ['#E1F5EE','#085041'],
  ['#EEEDFE','#3C3489'],
  ['#FAECE7','#712B13'],
  ['#F1EFE8','#444441']
];
const PCOLS = {
  technique:'#185FA5',
  tactique:'#0F6E56',
  physique:'#854F0B',
  mental:'#993556',
  perso:'#5F5E5A'
};
const DLABELS = ['', 'Non acquis', 'En cours', 'Acquis', 'Maitrise'];
const LBG = ['', '#FAECE7', '#FAEEDA', '#EAF3DE', '#E6F1FB'];
const LBD = ['', '#D85A30', '#BA7517', '#639922', '#185FA5'];
const LTX = ['', '#712B13', '#633806', '#27500A', '#0C447C'];
const POSTES = ['Gardien','Defenseur','Milieu central','Ailier gauche','Ailier droit','Attaquant'];

const CLUB_DATA = {
  name:'Louverne Sports - GJ LSCA',
  season:'2025-2026',
  femalePlayers:0,
  categories:{
    u13:{ teams:['U13 A','U13 B','U13 C','U12'] },
    u11:{ teams:['U11 A','U11 B','U11 C'] },
    u9:{ teams:['U9 A','U9 B','U9 C','U9 D'] }
  },
  standings:[
    { team:'U13 A', category:'u13', rank:'Sync a brancher', points:'-', note:'District Mayenne' },
    { team:'U13 B', category:'u13', rank:'Sync a brancher', points:'-', note:'District Mayenne' },
    { team:'U13 C', category:'u13', rank:'Sync a brancher', points:'-', note:'District Mayenne' },
    { team:'U12', category:'u13', rank:'Sync a brancher', points:'-', note:'District Mayenne' }
  ],
  matches:{
    past:[
      { date:'A synchroniser', team:'Club', opponent:'Resultats District / Ligue', score:'-', competition:'Resultats precedents' }
    ],
    upcoming:[
      { date:'A synchroniser', team:'Club', opponent:'Rencontres District / Ligue', score:'-', competition:'Matchs a venir' }
    ]
  },
  infos:[
    'Bloc infos diverses pret pour annonces du club, changements et rappels.',
    'Le planning des entrainements sera ajoute ici quand tu me le transmettras.',
    'La synchronisation automatique District Mayenne / Ligue Pays de la Loire sera la prochaine etape.'
  ]
};

const TEAM_SOURCE_CONFIG = {
  u13a:{
    key:'u13a',
    category:'u13',
    teamLabel:'U13 A',
    officialName:'GJ LSCA LOUVERNE',
    identity:'GJ LSCA',
    sources:{
      ranking:'https://mayenne.fff.fr/competitions?tab=ranking&id=437629&phase=2&poule=2&type=ch',
      agenda:'https://mayenne.fff.fr/competitions?tab=agenda&id=437629&phase=2&poule=2&type=ch',
      results:'https://mayenne.fff.fr/competitions?doing_wp_cron=1777045696.9000658988952636718750&id=437629&poule=2&phase=2&type=ch&tab=resultat&beginWeek=06%2F04%2F2026&endweek=12%2F04%2F2026'
    }
  },
  u13b:{
    key:'u13b',
    category:'u13',
    teamLabel:'U13 B',
    officialName:'GJ LSCA LOUVERNE 2',
    identity:'GJ LSCA',
    pending:true
  },
  u13c:{
    key:'u13c',
    category:'u13',
    teamLabel:'U13 C',
    officialName:'GJ LSCA LOUVERNE 3',
    identity:'GJ LSCA',
    pending:true
  },
  u12:{
    key:'u12',
    category:'u13',
    teamLabel:'U12',
    officialName:'GJ LSCA LOUVERNE 21',
    identity:'GJ LSCA',
    sources:{
      ranking:'https://mayenne.fff.fr/competitions?tab=ranking&id=437631&phase=2&poule=1&type=ch',
      agenda:'https://mayenne.fff.fr/competitions?tab=agenda&id=437631&phase=2&poule=1&type=ch&beginWeek=2026-05-04&endWeek=2026-05-10&limitWeek=2026-04-20',
      results:'https://mayenne.fff.fr/competitions?tab=resultat&id=437631&phase=2&poule=1&type=ch&beginWeek=13%2F04%2F2026&endweek=19%2F04%2F2026'
    }
  }
};

const IDEAL_PROFILE = {
  'Attaquant': { technique:4, tactique:3, physique:3, mental:3 },
  'Milieu central': { technique:3, tactique:4, physique:3, mental:3 },
  'Defenseur': { technique:3, tactique:4, physique:4, mental:3 },
  'Ailier gauche': { technique:4, tactique:3, physique:4, mental:3 },
  'Ailier droit': { technique:4, tactique:3, physique:4, mental:3 },
  'Gardien': { technique:3, tactique:4, physique:3, mental:4 }
};

const PILLARS = {
  u13: [
    { key:'technique', label:'Technique', criteria:['Jonglerie pied fort','Jonglerie pied faible','Controle / 1re touche','Conduite de balle','Frappe','Dribble 1v1','Passe courte','Passe longue'] },
    { key:'tactique', label:'Tactique', criteria:['Replacement defensif','Pressing','Choix sous pression','Demarquage','Jeu sans ballon','Lecture du jeu','Jeu en equipe'] },
    { key:'physique', label:'Physique', criteria:['Vitesse / sprint','Endurance','Coordination','Agilite','Puissance','Equilibre'] },
    { key:'mental', label:'Mental', criteria:["Reaction a l'erreur",'Engagement','Communication','Confiance en soi','Respect des consignes','Leadership','Perseverance'] },
    { key:'perso', label:'Personnel', criteria:['Assiduite','Comportement','Investissement perso','Esprit d equipe'] }
  ],
  u11: [
    { key:'technique', label:'Technique', criteria:['Jonglerie pied fort','Jonglerie pied faible','Controle / 1re touche','Conduite de balle','Frappe','Dribble 1v1','Passe courte'] },
    { key:'tactique', label:'Tactique', criteria:['Replacement defensif','Pressing','Choix sous pression','Demarquage','Jeu sans ballon','Lecture du jeu','Jeu en equipe'] },
    { key:'physique', label:'Physique', criteria:['Vitesse / sprint','Coordination','Agilite','Puissance','Equilibre'] },
    { key:'mental', label:'Mental', criteria:["Reaction a l'erreur",'Engagement','Communication','Confiance en soi','Respect des consignes','Perseverance'] },
    { key:'perso', label:'Personnel', criteria:['Assiduite','Comportement','Investissement perso','Esprit d equipe'] }
  ],
  u9: [
    { key:'technique', label:'Technique', criteria:['Jonglerie pied fort','Jonglerie pied faible','Controle / 1re touche','Conduite de balle','Frappe','Dribble 1v1','Passe courte'] },
    { key:'tactique', label:'Tactique', criteria:['Replacement defensif','Choix sous pression','Demarquage','Jeu sans ballon','Jeu en equipe'] },
    { key:'physique', label:'Physique', criteria:['Vitesse / sprint','Coordination','Agilite','Equilibre'] },
    { key:'mental', label:'Mental', criteria:["Reaction a l'erreur",'Engagement','Communication','Confiance en soi','Perseverance'] },
    { key:'perso', label:'Personnel', criteria:['Assiduite','Comportement','Esprit d equipe'] }
  ]
};

const JDATA = {
  u13: { target:50, acq:30, players:[
    { name:'Baranger Sacha', seasons:{ '2025-2026':50 } },
    { name:'Baziller Paul', seasons:{} }, { name:'Bechu Perle', seasons:{} },
    { name:'Bodinier Noam', seasons:{ '2025-2026':50 } }, { name:'Boireau Mylan', seasons:{} },
    { name:'Borejko Antoni', seasons:{ '2025-2026':50 } }, { name:'Boulain Pierre', seasons:{} },
    { name:'Bouvet Lepecq Hugo', seasons:{ '2025-2026':12 } }, { name:'Brehin Florian', seasons:{ '2025-2026':28 } },
    { name:'Brevault Liam', seasons:{ '2025-2026':20 } }, { name:'Caruel Augustin', seasons:{} },
    { name:'Chemin Raphael', seasons:{ '2025-2026':50 } }, { name:'Chevalier Celian', seasons:{} },
    { name:'Chevalier Clement', seasons:{ '2025-2026':6 } }, { name:'Divay Timeo', seasons:{ '2025-2026':7 } },
    { name:'Durfort Faustin', seasons:{} }, { name:'Eldjouzi Mehdi', seasons:{ '2025-2026':50 } },
    { name:'Espanoche Gabin', seasons:{} }, { name:'Foucart Louis', seasons:{ '2025-2026':50 } },
    { name:'Foucher Soan', seasons:{} }, { name:'Fretas Novais Hugo', seasons:{} },
    { name:'Gelly Magri Leonie', seasons:{} }, { name:'Gendreau Dylan', seasons:{ '2025-2026':50 } },
    { name:'Gervais Matheo', seasons:{} }, { name:'Granja Tom', seasons:{} },
    { name:'Grude Evan', seasons:{ '2025-2026':5 } }, { name:'Guiard Edouard', seasons:{ '2025-2026':50 } },
    { name:'Hassani Jaden', seasons:{ '2025-2026':25 } }, { name:'Herve Gabin', seasons:{ '2025-2026':50 } },
    { name:'Latouche Matheo', seasons:{} }, { name:'Lavie Leo', seasons:{ '2025-2026':50 } },
    { name:'Le Bosquain Martin', seasons:{ '2025-2026':21 } }, { name:'Le Claire Junior', seasons:{} },
    { name:'Lecoq Tom', seasons:{ '2025-2026':50 } }, { name:'Leote Gehan Sacha', seasons:{} },
    { name:'Moussu Tom', seasons:{ '2025-2026':50 } }, { name:'Paumard Aydan', seasons:{} },
    { name:'Piloneta Courtois Dorian', seasons:{} }, { name:'Planchenault Antoine', seasons:{} },
    { name:'Reuze Gabin', seasons:{ '2025-2026':30 } }, { name:'Ribot Martin', seasons:{} },
    { name:'Rodrigues Novais Soan', seasons:{} }, { name:'Sevin Leon', seasons:{ '2025-2026':50 } },
    { name:'Trou Soulaim', seasons:{ '2025-2026':13 } }, { name:'Vallet Alois', seasons:{ '2025-2026':50 } },
    { name:'Vannier Julian', seasons:{ '2025-2026':50 } }, { name:'Verger Adam', seasons:{} }
  ] },
  u11: { target:20, acq:15, players:[] },
  u9: { target:15, acq:10, players:[] }
};

const WEIGHTS = { technique:0.35, tactique:0.25, physique:0.20, mental:0.15, perso:0.05 };

// Exposer les constantes pour les modules externes (chargés après app.js)
window.SEASONS    = SEASONS;
window.CAT_LABELS = CAT_LABELS;
window.PILLARS    = PILLARS;
window.JDATA      = JDATA;
window.CLUB_DATA  = CLUB_DATA;
window.POSTES     = POSTES;

let state = {
  view:'dashboard',  // 'dashboard' | 'categories' | 'player' | 'team' | 'analyses'
  cat:'u13',
  season:'2025-2026',
  selPlayer:null,
  selTeam:null,      // team courante (ex 'U13 A') quand view === 'team'
  selPillar:0,
  selSection:'profil',
  filt:'tous',
  filtPoste:'',
  filtPied:'',
  sortBy:'name',     // 'name' | 'score' | 'completion' | 'lastObs' | 'progression'
  sortDir:'asc',     // 'asc' | 'desc'
  search:'',
  comparePlayer:'',
  lastRefreshAt:null,
  feedsScrapedAt:null,
  remoteStatus:'idle',
  remoteSources:{},
  remoteClubData:null,
  data:{ u13:{}, u11:{}, u9:{} }
};

// Exposer state pour les modules externes (objet muté en place, référence stable)
window.appState = state;

let rchart = null;
let historyChart = null;
let autosaveTimer = null;
let toastTimer = null;
let activeModal = null;

const q = (selector, root = document) => root.querySelector(selector);
const qq = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const pillars = () => PILLARS[state.cat];
const jdata = () => JDATA[state.cat];
const players = () => jdata().players;
const supabaseApi = window.supabaseService || null;

function createInitialRemoteSources() {
  const sources = {};
  Object.values(TEAM_SOURCE_CONFIG).forEach(team => {
    sources[team.key] = {
      status: team.pending ? 'pending' : 'configured',
      lastSync:null,
      error:null,
      ranking:null,
      agenda:[],
      results:[]
    };
  });
  return sources;
}

function getSupabaseConfig() {
  return supabaseApi ? supabaseApi.getConfig() : { configured:false, clubCode:'', season:'', hasSyncFunction:false };
}

function getClubIdentity(cat = state.cat) {
  if (state.remoteClubData?.identities?.length) {
    const identity = state.remoteClubData.identities.find(item => Array.isArray(item.category_codes) && item.category_codes.includes(cat));
    if (identity?.label) return identity.label;
  }
  return ['u13'].includes(cat) ? 'GJ LSCA' : 'Louverne Sports';
}

function getClubDisplayName(cat = state.cat) {
  if (state.remoteClubData?.club?.display_name) {
    return getClubIdentity(cat) === 'GJ LSCA' ? state.remoteClubData.club.display_name : 'Louverne Sports';
  }
  return getClubIdentity(cat) === 'GJ LSCA' ? 'Louverne Sports - GJ LSCA' : 'Louverne Sports';
}

function getConfiguredTeamsForCategory(cat = state.cat) {
  if (state.remoteClubData?.teams?.length && state.remoteClubData?.categories?.length) {
    const category = state.remoteClubData.categories.find(item => item.code === cat);
    if (category) {
      return state.remoteClubData.teams
        .filter(team => team.category_id === category.id)
        .map(team => {
          const source = state.remoteClubData.teamSources?.find(item => item.team_id === team.id);
          return {
            key:team.code,
            category:cat,
            teamLabel:team.label,
            officialName:team.official_name,
            identity:getClubIdentity(cat),
            pending:!source || source.status === 'pending',
            sourceStatus:source?.status || 'pending'
          };
        });
    }
  }
  return Object.values(TEAM_SOURCE_CONFIG).filter(team => team.category === cat);
}

function h(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function avCol(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % AC.length;
  return AC[Math.abs(hash) % AC.length];
}

function ini(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
}

function showToast(message) {
  const el = q('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function saveAppState() {
  localStorage.setItem(APP_KEY, JSON.stringify(state.data));
}

function schedulePersist(message = 'Modifications enregistrees') {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveAppState();
    updateSaveHints(message, true);
  }, SAVE_DELAY);
}

function updateSaveHints(text, saved = false) {
  qq('.save-hint').forEach(el => {
    el.textContent = text;
    el.classList.toggle('saved', saved);
  });
}

function defaultProfile() {
  return {
    nom:'',
    prenom:'',
    licence:'',
    naissance:'',
    annees_club:'',
    poste1:'',
    poste2:'',
    pied:'',
    taille:'',
    poids:'',
    team:'',                  // équipe principale (ex. U13 A)
    contact_parent:'',
    objectifs:['','',''],
    history:[],               // mesures taille/poids datées : [{ date, taille, poids }]
    photo:null
  };
}

function ensureData(cat, pid, season) {
  if (!state.data[cat][pid]) state.data[cat][pid] = {};
  if (!state.data[cat][pid][season]) {
    state.data[cat][pid][season] = { ratings:{}, critComments:{}, comments:{ main:'', self:'' } };
  }
  if (!state.data[cat][pid].profil) state.data[cat][pid].profil = defaultProfile();
}

function getProf(pid) {
  ensureData(state.cat, pid, state.season);
  return state.data[state.cat][pid].profil;
}

function pAvg(cat, pid, pillarKey, season = state.season) {
  const playerData = state.data[cat]?.[pid];
  if (!playerData) return 0;
  const seasonData = playerData[season];
  if (!seasonData) return 0;
  const pillar = PILLARS[cat].find(item => item.key === pillarKey);
  if (!pillar) return 0;

  let total = 0;
  let count = 0;
  pillar.criteria.forEach((_, index) => {
    const value = seasonData.ratings?.[pillarKey]?.[index] || 0;
    if (value > 0) {
      total += value;
      count += 1;
    }
  });
  return count ? total / count : 0;
}

function getPillarPercent(cat, pid, pillarKey, season = state.season) {
  const avg = pAvg(cat, pid, pillarKey, season);
  return avg ? Math.round((avg / 4) * 100) : 0;
}

function pScore(cat, pid, season = state.season) {
  const playerData = state.data[cat]?.[pid];
  if (!playerData || !playerData[season]) return 0;

  let total = 0;
  let weightSum = 0;
  PILLARS[cat].forEach(pillar => {
    const avg = pAvg(cat, pid, pillar.key, season);
    if (avg > 0) {
      total += (avg / 4) * 100 * WEIGHTS[pillar.key];
      weightSum += WEIGHTS[pillar.key];
    }
  });
  return weightSum ? Math.round(total / weightSum) : 0;
}

function getLevel(score) {
  if (score >= 80) return 'Tres avance';
  if (score >= 60) return 'Bon niveau';
  if (score >= 40) return 'En progression';
  if (score > 0) return 'En difficulte';
  return 'Non evalue';
}

function getProfile(pid, season = state.season) {
  const values = {
    technique: pAvg(state.cat, pid, 'technique', season),
    tactique: pAvg(state.cat, pid, 'tactique', season),
    physique: pAvg(state.cat, pid, 'physique', season),
    mental: pAvg(state.cat, pid, 'mental', season)
  };
  const entries = Object.entries(values).filter(([, value]) => value > 0);
  if (!entries.length) return 'Profil en construction';

  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topValue] = entries[0];
  const secondValue = entries[1]?.[1] || 0;
  if (topValue - secondValue < 0.2) return 'Profil equilibre';

  const labels = {
    technique: 'Profil technique',
    tactique: 'Profil tactique',
    physique: 'Profil physique',
    mental: 'Profil mental'
  };
  return labels[topKey];
}

function getGapToIdeal(pid, season = state.season) {
  const prof = getProf(pid);
  const ideal = IDEAL_PROFILE[prof.poste1];
  if (!ideal) return null;

  const gaps = {};
  Object.keys(ideal).forEach(key => {
    const val = pAvg(state.cat, pid, key, season);
    gaps[key] = Math.max(0, +(ideal[key] - val).toFixed(1));
  });
  return gaps;
}

function getProgress(pid) {
  const playerData = state.data[state.cat]?.[pid];
  if (!playerData) return null;

  const withScore = SEASONS
    .map(season => ({ season, score:pScore(state.cat, pid, season) }))
    .filter(item => item.score > 0);

  if (withScore.length < 2) return null;

  const last = withScore[0];
  const prev = withScore[1];
  const diff = last.score - prev.score;

  return {
    diff,
    text: diff > 0 ? '+' + diff + '%' : diff < 0 ? diff + '%' : '0%',
    label: diff > 0 ? 'Progression positive' : diff < 0 ? 'Leger recul' : 'Stable'
  };
}

function getCompletion(pid, season = state.season) {
  const playerData = state.data[state.cat]?.[pid]?.[season];
  if (!playerData) return { rated:0, total:0, percent:0 };
  let rated = 0;
  let total = 0;
  PILLARS[state.cat].forEach(pillar => {
    total += pillar.criteria.length;
    pillar.criteria.forEach((_, index) => {
      if ((playerData.ratings?.[pillar.key]?.[index] || 0) > 0) rated += 1;
    });
  });
  return { rated, total, percent: total ? Math.round((rated / total) * 100) : 0 };
}

function strongestPillar(pid, season = state.season) {
  const scores = pillars()
    .map(pillar => ({
      key:pillar.key,
      label:pillar.label,
      score:getPillarPercent(state.cat, pid, pillar.key, season)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scores[0] || null;
}

function weakestPillar(pid, season = state.season) {
  const scores = pillars()
    .map(pillar => ({
      key:pillar.key,
      label:pillar.label,
      score:getPillarPercent(state.cat, pid, pillar.key, season)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => a.score - b.score);
  return scores[0] || null;
}

function getMainWeakness(pid, season = state.season) {
  return weakestPillar(pid, season);
}

function getInsights(pid, season = state.season) {
  const technique = pAvg(state.cat, pid, 'technique', season);
  const tactique = pAvg(state.cat, pid, 'tactique', season);
  const physique = pAvg(state.cat, pid, 'physique', season);
  const mental = pAvg(state.cat, pid, 'mental', season);
  const perso = pAvg(state.cat, pid, 'perso', season);
  const completion = getCompletion(pid, season);
  const insights = [];

  if (technique > 0 && technique < 2) insights.push({ tone:'alert', text:'Base technique fragile a consolider.' });
  if (tactique > 0 && tactique < 2) insights.push({ tone:'alert', text:'Compréhension du jeu a travailler.' });
  if (physique > 0 && physique < 2) insights.push({ tone:'warn', text:'Volume physique en retrait par rapport au reste du profil.' });
  if (mental >= 3.5) insights.push({ tone:'good', text:'Mental fort et reponse interessante a l effort.' });
  if (perso >= 3.5) insights.push({ tone:'good', text:'Comportement et implication tres positifs.' });
  if (technique >= 3 && tactique >= 3) insights.push({ tone:'good', text:'Joueur intelligent balle au pied.' });
  if (completion.percent > 0 && completion.percent < 35) insights.push({ tone:'neutral', text:'Dossier encore partiel, a confirmer sur d autres observations.' });

  if (!insights.length) insights.push({ tone:'neutral', text:'Pas d alerte forte pour le moment, continuer a observer sur la duree.' });
  return insights.slice(0, 4);
}

function getSeasonSeries(pid) {
  const playerData = state.data[state.cat]?.[pid];
  if (!playerData) return [];
  return SEASONS
    .map(season => ({ season, score:pScore(state.cat, pid, season) }))
    .filter(item => item.score > 0)
    .reverse();
}

function getPlayerTone(pid) {
  const strongest = strongestPillar(pid);
  return strongest ? PCOLS[strongest.key] : PCOLS.technique;
}

function getCategorySummary(cat) {
  const count = JDATA[cat].players.length;
  const teams = CLUB_DATA.categories[cat]?.teams || [];
  const evaluated = JDATA[cat].players.filter(player => pScore(cat, player.name) > 0).length;
  return { count, teamsCount:teams.length, evaluated };
}

async function loadGithubFeeds(opts = {}) {
  if (!GITHUB_DATA_URL) {
    if (opts.verbose) showToast('Aucune URL GitHub configurée');
    return { ok: false, reason: 'no-url' };
  }
  try {
    const res = await fetch(GITHUB_DATA_URL + '?t=' + Date.now()); // cache-bust
    if (!res.ok) {
      if (opts.verbose) showToast('Échec HTTP ' + res.status + ' lors de la sync GitHub');
      return { ok: false, reason: 'http-' + res.status };
    }
    const json = await res.json();
    if (!json.feeds || !Object.keys(json.feeds).length) {
      if (opts.verbose) showToast('Le scraper n\'a rien remonté (feeds.json vide)');
      state.feedsScrapedAt = json.lastUpdated || null;
      renderAll();
      return { ok: false, reason: 'empty' };
    }
    saveManualFeeds(json.feeds);
    // Date de génération du JSON (côté scraper) — distincte de notre "refresh"
    state.feedsScrapedAt = json.lastUpdated || null;
    state.lastRefreshAt = new Date().toISOString();

    // Compteur : combien de matchs ramenés
    let upCount = 0, pastCount = 0, stdCount = 0;
    Object.values(json.feeds).forEach(c => {
      upCount   += (c.upcoming || []).length;
      pastCount += (c.past     || []).length;
      stdCount  += (c.standings|| []).length;
    });
    renderAll();
    if (opts.verbose) {
      showToast(`Sync OK : ${stdCount} classements · ${upCount} matchs à venir · ${pastCount} résultats`);
    } else {
      showToast('Données FFF mises à jour');
    }
    return { ok: true, upcoming: upCount, past: pastCount, standings: stdCount };
  } catch (e) {
    console.warn('GitHub feeds:', e.message);
    if (opts.verbose) showToast('Erreur réseau : ' + (e.message || 'inconnue'));
    return { ok: false, reason: 'fetch-error', error: e.message };
  }
}

function loadManualFeeds() {
  try { return JSON.parse(localStorage.getItem(MANUAL_FEEDS_KEY) || 'null') || {}; }
  catch { return {}; }
}

function saveManualFeeds(data) {
  localStorage.setItem(MANUAL_FEEDS_KEY, JSON.stringify(data));
}

function getClubSummary() {
  const totalPlayers = Object.keys(JDATA).reduce((sum, cat) => sum + JDATA[cat].players.length, 0);
  const totalTeams = Object.values(CLUB_DATA.categories).reduce((sum, item) => sum + item.teams.length, 0);
  return {
    totalPlayers,
    femalePlayers:CLUB_DATA.femalePlayers,
    totalTeams,
    categories:Object.keys(CLUB_DATA.categories).length
  };
}

function getRefreshLabel() {
  if (state.remoteStatus === 'refreshing') return 'Actualisation en cours...';
  if (state.lastRefreshAt) return 'Maj ' + new Date(state.lastRefreshAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  return 'Jamais actualise';
}

// Overrides de score saisis manuellement par l'éducateur. Survivent aux runs
// suivants du scraper (qui réécrit cfb6_feeds mais pas cfb6_score_overrides).
const SCORE_OVERRIDES_KEY = 'cfb6_score_overrides';

function loadScoreOverrides() {
  try { return JSON.parse(localStorage.getItem(SCORE_OVERRIDES_KEY) || '{}') || {}; }
  catch { return {}; }
}
function saveScoreOverridesMap(map) {
  localStorage.setItem(SCORE_OVERRIDES_KEY, JSON.stringify(map));
}
function scoreOverrideKey(cat, date, team, opponent) {
  return [cat || '', date || '', team || '', opponent || ''].join('||');
}
function saveScoreOverride(cat, date, team, opponent, score) {
  const map = loadScoreOverrides();
  map[scoreOverrideKey(cat, date, team, opponent)] = score;
  saveScoreOverridesMap(map);
}
function applyScoreOverrides(cat, feeds) {
  const map = loadScoreOverrides();
  if (!Object.keys(map).length) return feeds;
  function apply(list) {
    return list.map(m => {
      const k = scoreOverrideKey(cat, m.date, m.team || '', m.opponent || '');
      const ov = map[k];
      return ov ? { ...m, score: ov, manualScore: true } : m;
    });
  }
  return {
    ...feeds,
    past: apply(feeds.past || []),
    upcoming: apply(feeds.upcoming || []),
  };
}

// Re-route les matchs "upcoming" dont la date est passée vers "past".
// Utile entre deux runs du scraper hebdomadaire : un match joué hier ne reste
// pas affiché en "à venir". Le score est laissé vide ("-") tant que le scraper
// n'a pas récupéré le résultat — l'éducateur peut le saisir manuellement.
function rebalanceUpcomingPast(feeds) {
  if (!feeds || !Array.isArray(feeds.upcoming) || !Array.isArray(feeds.past)) return feeds;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  function toMs(d) {
    if (!d) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
      const t = new Date(d).getTime();
      return isNaN(t) ? null : t;
    }
    const m = String(d).match(/(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/);
    if (!m) return null;
    const t = new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
    return isNaN(t) ? null : t;
  }

  function alreadyInPast(match) {
    return feeds.past.some(p =>
      (p.date || '') === (match.date || '') &&
      (p.opponent || '') === (match.opponent || '') &&
      (p.team || '') === (match.team || '')
    );
  }

  const stillUpcoming = [];
  const newlyPast = [];
  feeds.upcoming.forEach(m => {
    const ts = toMs(m.date);
    if (ts != null && ts < todayMs && !alreadyInPast(m)) {
      newlyPast.push({
        ...m,
        score: m.score || '-',
        autoMoved: true,    // marqueur pour éventuel affichage
      });
    } else {
      stillUpcoming.push(m);
    }
  });

  if (!newlyPast.length) return feeds;
  // On insère les nouveaux past en tête (plus récents) sans dupliquer
  return {
    ...feeds,
    upcoming: stillUpcoming,
    past: [...newlyPast, ...feeds.past],
  };
}

function buildDashboardFeeds(cat = state.cat) {
  if (state.remoteClubData) {
    const category = state.remoteClubData.categories?.find(item => item.code === cat);
    const teams = state.remoteClubData.teams?.filter(team => team.category_id === category?.id) || [];
    const standings = teams.map(team => {
      const standing = state.remoteClubData.standings?.find(item => item.team_id === team.id);
      return {
        team:team.label,
        rank:standing?.rank_text || 'A synchroniser',
        points:standing?.points ?? '-',
        played:standing?.played ?? '-',
        note:team.official_name || team.label
      };
    });

    const upcoming = (state.remoteClubData.fixtures || [])
      .filter(item => teams.some(team => team.id === item.team_id))
      .slice(0, 6)
      .map(item => ({
        date:item.match_date ? new Date(item.match_date).toLocaleDateString('fr-FR') : 'A definir',
        team:item.is_home ? item.home_team : item.away_team,
        opponent:item.is_home ? item.away_team : item.home_team,
        score:item.is_home ? 'Domicile' : 'Exterieur',
        competition:item.competition_label || 'Competition'
      }));

    const past = (state.remoteClubData.results || [])
      .filter(item => teams.some(team => team.id === item.team_id))
      .slice(0, 6)
      .map(item => ({
        date:item.match_date ? new Date(item.match_date).toLocaleDateString('fr-FR') : 'A definir',
        team:item.is_home ? item.home_team : item.away_team,
        opponent:item.is_home ? item.away_team : item.home_team,
        score:item.home_score != null && item.away_score != null ? item.home_score + ' - ' + item.away_score : '-',
        competition:item.competition_label || 'Competition'
      }));

    return applyScoreOverrides(cat, rebalanceUpcomingPast({ standings, upcoming, past }));
  }

  const manual = loadManualFeeds()[cat];
  if (manual && (manual.standings?.length || manual.upcoming?.length || manual.past?.length)) {
    return rebalanceUpcomingPast({
      standings: manual.standings || [],
      upcoming: manual.upcoming || [],
      past: manual.past || []
    });
  }

  const teams = getConfiguredTeamsForCategory(cat);
  const standings = [];
  const upcoming = [];
  const past = [];

  teams.forEach(team => {
    const remote = state.remoteSources[team.key] || {};
    const sourceStatus = remote.status || 'configured';

    standings.push({
      team:team.teamLabel,
      rank:remote.ranking?.rank || (team.pending ? 'Source manquante' : sourceStatus === 'synced' ? '-' : 'Pret a brancher'),
      points:remote.ranking?.points || '-',
      played:remote.ranking?.played || '-',
      note:team.officialName
    });

    if (remote.agenda?.length) {
      remote.agenda.forEach(match => upcoming.push(match));
    } else {
      upcoming.push({
        date:'A synchroniser',
        team:team.teamLabel,
        opponent:team.pending ? 'Source a renseigner' : 'Source configuree FFF',
        score:'-',
        competition:team.officialName
      });
    }

    if (remote.results?.length) {
      remote.results.forEach(match => past.push(match));
    } else {
      past.push({
        date:'A synchroniser',
        team:team.teamLabel,
        opponent:team.pending ? 'Source a renseigner' : 'Source configuree FFF',
        score:'-',
        competition:team.officialName
      });
    }
  });

  return applyScoreOverrides(cat, rebalanceUpcomingPast({ standings, upcoming, past }));
}

async function tryFetchTeamSource(team) {
  if (!team.sources) return { status:'pending', error:'Source non renseignee' };
  try {
    await Promise.all(Object.values(team.sources).map(url => fetch(url, { method:'GET', mode:'cors' })));
    return { status:'connected', error:null };
  } catch (error) {
    return { status:'configured', error:'Connexion directe bloquee pour le moment, structure prete pour integration.' };
  }
}

async function loadSupabaseDashboardData() {
  if (!supabaseApi || !supabaseApi.isConfigured()) return false;

  const config = getSupabaseConfig();
  const data = await supabaseApi.fetchDashboardData(config.clubCode || 'louverne-lsca', config.season || state.season);
  state.remoteClubData = data;
  state.lastRefreshAt = new Date().toISOString();

  if (Array.isArray(data.teamSources)) {
    data.teamSources.forEach(source => {
      const team = data.teams?.find(item => item.id === source.team_id);
      if (team?.code) {
        state.remoteSources[team.code] = {
          ...(state.remoteSources[team.code] || {}),
          status:source.status || 'configured',
          lastSync:source.last_sync_at || source.last_success_at || null,
          error:source.last_error || null
        };
      }
    });
  }

  return true;
}

async function refreshRemoteData() {
  state.remoteStatus = 'refreshing';
  renderAll();

  if (supabaseApi && supabaseApi.isConfigured()) {
    try {
      const syncResult = await supabaseApi.triggerSync();
      await loadSupabaseDashboardData();
      state.remoteStatus = 'idle';
      renderAll();
      showToast(syncResult.ok ? 'Supabase actualise' : 'Connexion Supabase mise a jour');
      return;
    } catch (error) {
      console.error(error);
      state.remoteStatus = 'idle';
      renderAll();
      showToast('Erreur de lecture Supabase');
      return;
    }
  }

  // En mode sans Supabase, on prend les feeds GitHub (alimentés par le scraper hebdo)
  // avec mode verbose pour diagnostic.
  const result = await loadGithubFeeds({ verbose: true });

  // Tentative complémentaire de connexion directe FFF (best effort, souvent bloqué CORS)
  const entries = Object.values(TEAM_SOURCE_CONFIG);
  for (const team of entries) {
    const r = await tryFetchTeamSource(team);
    state.remoteSources[team.key] = {
      ...(state.remoteSources[team.key] || {}),
      status:r.status,
      error:r.error,
      lastSync:new Date().toISOString()
    };
  }

  state.lastRefreshAt = new Date().toISOString();
  state.remoteStatus = 'idle';
  renderAll();
  if (!result?.ok) {
    // Toast déjà émis par loadGithubFeeds avec verbose:true
  }
}

function renderPrimaryNav() {
  const alertsCount = window.DirecteurModule?.countAlerts?.() || 0;
  const items = [
    { key:'dashboard',  label:'Accueil' },
    { key:'categories', label:'Catégories' },
    { key:'player',     label:'Joueurs' },
    { key:'team',       label:'Équipes' },
    { key:'analyses',   label:'Analyses' },
    { key:'direction',  label:'Direction' + (alertsCount > 0 ? ` (${alertsCount})` : '') },
  ];

  // 'team' et 'player' restent actifs même quand on a navigué dans un détail
  const activeKey = state.view === 'team' ? 'team' : state.view;

  q('#nav-cat-tabs').innerHTML = items.map(item => `
    <button class="nav-cat ${activeKey === item.key ? 'on' : ''}" type="button" data-action="set-view" data-view="${item.key}">
      ${h(item.label)}
    </button>
  `).join('');
}

function renderSeasonOptions() {
  q('#season-sel').innerHTML = SEASONS.map(season => `
    <option value="${h(season)}" ${state.season === season ? 'selected' : ''}>Saison ${h(season)}</option>
  `).join('');
  q('#sb-season-chip').textContent = 'Saison ' + state.season;
}

function renderFilters() {
  const items = [
    { key:'tous',       label:'Tous' },
    { key:'evalues',    label:'Évalués' },
    { key:'avec score', label:'Avec jonglerie' },
    { key:'non-evalues',label:'Non évalués' }
  ];

  const piedItems = [
    { key:'',          label:'Tous pieds' },
    { key:'droit',     label:'Droit' },
    { key:'gauche',    label:'Gauche' },
    { key:'ambidextre',label:'Ambi.' }
  ];

  const posteOptions = ['', ...POSTES].map(p =>
    `<option value="${h(p)}" ${state.filtPoste === p ? 'selected' : ''}>${p ? h(p) : 'Tous postes'}</option>`
  ).join('');

  const sortOptions = [
    { key:'name',       label:'Nom A→Z' },
    { key:'score',      label:'Score' },
    { key:'completion', label:'Dossier' },
    { key:'lastObs',    label:'Dernière obs' },
  ];

  const sortBtns = sortOptions.map(s => `
    <button class="ftag ${state.sortBy === s.key ? 'on' : ''}" type="button"
      data-action="toggle-sort" data-sort-key="${s.key}"
      title="Trier par ${h(s.label)}">
      ${h(s.label)} ${state.sortBy === s.key ? (state.sortDir === 'asc' ? '↑' : '↓') : ''}
    </button>`).join('');

  q('#sb-filters').innerHTML = `
    <div class="ftag-row">
      ${items.map(item => `
        <button class="ftag ${state.filt === item.key ? 'on' : ''}" type="button"
          data-action="set-filter" data-filter="${h(item.key)}">${h(item.label)}</button>
      `).join('')}
    </div>
    <div class="ftag-row">
      <select class="ftag-select" data-action="set-poste-filter-select" aria-label="Filtrer par poste">
        ${posteOptions}
      </select>
      ${piedItems.map(p => `
        <button class="ftag ftag-sm ${state.filtPied === p.key ? 'on' : ''}" type="button"
          data-action="set-pied-filter" data-pied="${h(p.key)}">${h(p.label)}</button>
      `).join('')}
    </div>
    <div class="ftag-row ftag-sort-row">
      <span class="ftag-label">Trier :</span>
      ${sortBtns}
      <button class="ftag ftag-reset" type="button" data-action="reset-filters" title="Réinitialiser les filtres">⟲</button>
    </div>
  `;
}

function filteredPlayers() {
  const query = state.search.trim().toLowerCase();
  let list = players().filter(player => {
    const pid = player.name;
    const score = pScore(state.cat, pid);
    const prof = state.data[state.cat]?.[pid]?.profil || {};
    const hasJuggle = player.seasons[state.season] != null;

    if (state.filt === 'avec score'  && !hasJuggle)  return false;
    if (state.filt === 'evalues'     && score === 0) return false;
    if (state.filt === 'non-evalues' && score > 0)   return false;
    if (state.filtPoste && prof.poste1 !== state.filtPoste && prof.poste2 !== state.filtPoste) return false;
    if (state.filtPied  && prof.pied  !== state.filtPied)  return false;
    if (query && !pid.toLowerCase().includes(query)) return false;
    return true;
  });

  const sortBy = state.sortBy || 'name';
  const dir = state.sortDir === 'desc' ? -1 : 1;

  list.sort((a, b) => {
    const pa = a.name, pb = b.name;
    let va, vb;
    if (sortBy === 'score')          { va = pScore(state.cat, pa); vb = pScore(state.cat, pb); }
    else if (sortBy === 'completion'){ va = getCompletion(pa).percent; vb = getCompletion(pb).percent; }
    else if (sortBy === 'lastObs')   { va = getLastObsDate(pa) || ''; vb = getLastObsDate(pb) || ''; }
    else                              { va = pa; vb = pb; }
    if (typeof va === 'string') return va.localeCompare(vb, 'fr', { sensitivity: 'base' }) * dir;
    return (va - vb) * dir;
  });

  return list;
}

function renderSidebar() {
  const sidebar = q('.sidebar');
  const search = q('#sb-search');

  if (state.view === 'dashboard') {
    sidebar.classList.add('hidden');
    search.value = '';
    return;
  }

  sidebar.classList.remove('hidden');
  renderFilters();
  renderList();
  search.value = state.search;
}

function renderList() {
  const list = filteredPlayers();
  const summary = getCategorySummary(state.cat);
  q('#sb-count').textContent = CAT_LABELS[state.cat] + ' - ' + list.length + ' / ' + summary.count + ' joueurs';

  q('#player-list').innerHTML = list.map(player => {
    const pid = player.name;
    const col = avCol(pid);
    const prof = state.data[state.cat][pid]?.profil;
    const score = pScore(state.cat, pid);
    const sub = score > 0
      ? getLevel(score) + ' - ' + score + '%'
      : player.seasons[state.season] != null
        ? 'Jonglerie ' + player.seasons[state.season]
        : 'Aucune saisie';

    return `
      <button class="pli ${state.selPlayer === pid && state.view === 'player' ? 'on' : ''}" type="button" data-action="select-player" data-player="${h(pid)}">
        <div class="pli-av" style="background:${col[0]};color:${col[1]}">
          ${prof?.photo ? `<img src="${prof.photo}" alt="${h(pid)}">` : `<span>${h(ini(pid))}</span>`}
        </div>
        <div class="pli-info">
          <div class="pli-name">${h(pid)}${(() => { const cs = window.InjuryModule?.currentStatus?.(pid, state.cat); if (!cs) return ''; const td = window.InjuryModule.TYPES.find(t => t.key === cs.type) || {}; return ` <span class="pli-inj" title="${h(td.label || '')}">${td.icon || '⚠'}</span>`; })()}</div>
          <div class="pli-sub">${h(sub)}</div>
        </div>
      </button>
    `;
  }).join('') || `
    <div class="empty-state" style="margin:12px;padding:2rem 1rem">
      <p>Aucun joueur ne correspond a la recherche ou au filtre actif.</p>
    </div>
  `;
}

function renderSyncBadge(supabaseConfig) {
  if (state.remoteStatus === 'refreshing') {
    return `<span class="sync-badge sync-refreshing">Actualisation...</span>`;
  }

  // Badge "Scraper FFF" : date du dernier scrape (issu de feeds.json côté GitHub)
  const scrapedAt = state.feedsScrapedAt;
  let scrapedBadge = '';
  if (scrapedAt) {
    const d = new Date(scrapedAt);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const cls = days <= 2 ? 'sync-ok' : days <= 7 ? 'sync-warn' : 'sync-local';
    const label = days === 0 ? 'Scrape aujourd\'hui'
                : days === 1 ? 'Scrape hier'
                : days <= 7 ? 'Scrape il y a ' + days + 'j'
                : 'Scrape ancien (' + dateStr + ')';
    scrapedBadge = `<span class="sync-badge ${cls}" title="Dernière mise à jour des feeds FFF par le scraper (cron hebdo lundi)">📡 ${h(label)}</span>`;
  } else {
    scrapedBadge = `<span class="sync-badge sync-warn" title="Le scraper FFF n'a jamais tourné ou les feeds ne sont pas accessibles">📡 Pas de scrape</span>`;
  }

  if (!supabaseConfig.configured) {
    return `${scrapedBadge}<span class="sync-badge sync-local">Données locales</span>`;
  }
  if (state.remoteClubData) {
    const label = state.lastRefreshAt
      ? 'Sync ' + new Date(state.lastRefreshAt).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
      : 'Supabase connecté';
    return `${scrapedBadge}<span class="sync-badge sync-ok">${h(label)}</span>`;
  }
  return `${scrapedBadge}<span class="sync-badge sync-warn">Sync en attente</span>`;
}

function renderDashEmptyState(message, hint) {
  return `
    <div class="dash-empty">
      <div class="dash-empty-msg">${h(message)}</div>
      ${hint ? `<div class="dash-empty-hint">${h(hint)}</div>` : ''}
    </div>`;
}

function renderMatchList(matches, isUpcoming) {
  const hasSyncPlaceholder = matches.length === 1 && matches[0].date === 'A synchroniser';
  if (!matches.length || hasSyncPlaceholder) {
    return renderDashEmptyState(
      isUpcoming ? 'Aucun match programmé' : 'Aucun résultat disponible',
      'Configure les sources FFF pour activer la synchronisation.'
    );
  }
  return `<div class="fixture-list">${matches.map(match => {
    let resultClass = '';
    let resultBadge = '';
    if (!isUpcoming && match.score && match.score !== '-') {
      const parts = match.score.split('-').map(s => parseInt(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const ourGoals  = match.isHome ? parts[0] : parts[1];
        const theirGoals = match.isHome ? parts[1] : parts[0];
        if (ourGoals > theirGoals)  { resultClass = 'fixture-win';  resultBadge = 'V'; }
        else if (ourGoals === theirGoals) { resultClass = 'fixture-draw'; resultBadge = 'N'; }
        else                         { resultClass = 'fixture-loss'; resultBadge = 'D'; }
      }
    }
    const homeLabel = h(match.home || match.team);
    const awayLabel = h(match.away || match.opponent);
    const ourSideClass = (name) => {
      if (!match.home) return '';
      return name === homeLabel && match.isHome ? 'fixture-team--ours' :
             name === awayLabel && !match.isHome ? 'fixture-team--ours' : '';
    };
    // Si match passé sans score, on remplace "vs" par un bouton "+ Score"
    const needsScore = !isUpcoming && (!match.score || match.score === '-' || match.score === '');
    const scoreCell = isUpcoming
      ? 'vs'
      : needsScore
        ? `<button class="fixture-score-btn" type="button"
              data-action="quick-score"
              data-cat="${state.cat}"
              data-date="${h(match.date)}"
              data-team="${h(match.team || '')}"
              data-opponent="${h(match.opponent || '')}"
              title="Saisir le score">+ Score</button>`
        : h(match.score);

    return `
    <div class="fixture-item ${resultClass}">
      <div class="fixture-meta">
        ${match.team ? `<span class="fixture-team-badge">${h(match.team)}</span>` : ''}
        <span class="fixture-date">${h(match.date)}${match.time ? ` · ${h(match.time)}` : ''}</span>
        ${match.isHome !== undefined
          ? `<span class="fixture-loc ${match.isHome ? 'fixture-loc--home' : 'fixture-loc--away'}">${match.isHome ? 'Dom' : 'Ext'}</span>`
          : ''}
        ${resultBadge ? `<span class="fixture-result-badge fixture-result-${resultClass.replace('fixture-','')}">${resultBadge}</span>` : ''}
        ${match.autoMoved ? `<span class="fixture-auto-moved" title="Match déplacé automatiquement de À venir vers Résultats car la date est passée. Le scraper FFF n'a pas encore récupéré le score.">⏱ en attente du score</span>` : ''}
      </div>
      <div class="fixture-teams">
        <span class="fixture-team ${ourSideClass(homeLabel)}">${homeLabel}</span>
        <span class="fixture-score">${scoreCell}</span>
        <span class="fixture-team ${ourSideClass(awayLabel)}">${awayLabel}</span>
      </div>
      <div class="fixture-comp">${h(match.competition || '')}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderMatchCard(title, kicker, matches, isUpcoming) {
  const modalType = isUpcoming ? 'upcoming' : 'past';
  return `
    <section class="dashboard-card">
      <div class="card-head">
        <div><div class="card-kicker">${h(kicker)}</div><h2>${h(title)}</h2></div>
        <button class="card-edit-btn" type="button" data-action="open-modal" data-modal-type="${modalType}" data-modal-cat="${state.cat}">Modifier</button>
      </div>
      ${renderMatchList(matches, isUpcoming)}
    </section>`;
}

function renderStandingsCard(standings) {
  if (!standings.length) {
    return `
    <section class="dashboard-card">
      <div class="card-head">
        <div><div class="card-kicker">Classement</div><h2>Classements</h2></div>
        <button class="card-edit-btn" type="button" data-action="open-modal" data-modal-type="standings" data-modal-cat="${state.cat}">Modifier</button>
      </div>
      <div class="standings-list">${renderDashEmptyState('Classement non disponible', 'Clique sur Modifier pour saisir les données FFF.')}</div>
    </section>`;
  }

  // Grouper par championnat (ordre d'apparition)
  const groupMap = new Map();
  for (const item of standings) {
    const key = item.competition || 'Classement';
    if (!groupMap.has(key)) groupMap.set(key, { level: item.competitionLevel || 'district', rows: [] });
    groupMap.get(key).rows.push(item);
  }

  const groupsHtml = Array.from(groupMap.entries()).map(([label, g]) => {
    const rowsHtml = g.rows.map(item => `
      <tr class="${item.isOurTeam ? 'standings-row--ours' : ''}">
        <td class="st-rank">${h(item.rank)}</td>
        <td class="st-team">${h(item.team)}</td>
        <td class="st-pts">${h(item.points)}</td>
        <td>${h(item.played)}</td>
        <td>${h(item.won ?? '-')}</td>
        <td>${h(item.draw ?? '-')}</td>
        <td>${h(item.lost ?? '-')}</td>
        <td class="st-dif">${h(item.diff ?? '-')}</td>
      </tr>`).join('');
    const levelLabel = g.level === 'ligue' ? 'Ligue' : g.level === 'national' ? 'National' : 'District';
    return `
      <details class="standings-group" open>
        <summary class="standings-comp-header" data-level="${h(g.level)}">
          <span class="standings-comp-badge">${levelLabel}</span>
          <span class="standings-comp-name">${h(label)}</span>
          <span class="standings-comp-chevron">▾</span>
        </summary>
        <div class="standings-table-wrap">
          <table class="standings-table">
            <thead><tr>
              <th>Pl</th><th class="st-team">Équipe</th>
              <th>Pts</th><th>Jo</th><th>G</th><th>N</th><th>P</th><th>Dif</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </details>`;
  }).join('');

  return `
    <section class="dashboard-card">
      <div class="card-head">
        <div><div class="card-kicker">Classement</div><h2>Classements</h2></div>
        <button class="card-edit-btn" type="button" data-action="open-modal" data-modal-type="standings" data-modal-cat="${state.cat}">Modifier</button>
      </div>
      <div class="standings-list">${groupsHtml}</div>
    </section>`;
}

function renderInfoCard(infos) {
  return `
    <section class="dashboard-card dash-card-info">
      <div class="card-head">
        <div><div class="card-kicker">Club</div><h2>Infos diverses</h2></div>
      </div>
      <div class="info-list">
        ${infos.length
          ? infos.map(info => `<div class="info-item">${h(info)}</div>`).join('')
          : renderDashEmptyState('Aucune info disponible')}
      </div>
    </section>`;
}

function renderCategoryAccessCard(categories) {
  return `
    <section class="dashboard-card">
      <div class="card-head">
        <div><div class="card-kicker">Catégories</div><h2>Accès effectifs</h2></div>
      </div>
      <div class="category-cards">
        ${categories.map(cat => {
          const info = getCategorySummary(cat);
          return `
            <button class="category-card" type="button" data-action="open-category" data-cat="${cat}">
              <div class="category-card-top">
                <strong>${h(CAT_LABELS[cat])}</strong>
                <span>${info.teamsCount} équipes</span>
              </div>
              <div class="category-card-body">
                <div>${info.count} joueurs</div>
                <div>${info.evaluated} évalués</div>
              </div>
            </button>`;
        }).join('')}
      </div>
    </section>`;
}

function renderDashboard() {
  const summary = getClubSummary();
  const categories = Object.keys(CLUB_DATA.categories);
  const feeds = buildDashboardFeeds(state.cat);
  const currentIdentity = getClubIdentity(state.cat);
  const supabaseConfig = getSupabaseConfig();
  const isU13 = state.cat === 'u13';
  const identityBg = isU13 ? 'rgba(15,110,86,0.1)' : 'rgba(24,95,165,0.1)';
  const identityFg = isU13 ? '#0f6e56' : '#185fa5';
  const identityBorder = isU13 ? 'rgba(15,110,86,0.25)' : 'rgba(24,95,165,0.25)';

  return `
    <section class="dashboard-shell">
      <div class="dashboard-hero">
        <div class="dash-hero-main">
          <div class="dash-identity-badge" style="background:${identityBg};color:${identityFg};border:1px solid ${identityBorder}">${h(currentIdentity)}</div>
          <h1>${h(getClubDisplayName(state.cat))}</h1>
          <p>Vue globale du club — résultats, rencontres et accès aux catégories.</p>
          ${renderSyncBadge(supabaseConfig)}
        </div>
        <div class="dashboard-stats">
          <div class="dash-stat"><span>Joueurs</span><strong>${summary.totalPlayers}</strong></div>
          <div class="dash-stat"><span>Joueuses</span><strong>${summary.femalePlayers}</strong></div>
          <div class="dash-stat"><span>Équipes</span><strong>${summary.totalTeams}</strong></div>
          <div class="dash-stat"><span>Catégories</span><strong>${summary.categories}</strong></div>
        </div>
      </div>

      <div class="dashboard-main-grid">
        ${renderInfoCard(CLUB_DATA.infos)}
        ${renderStandingsCard(feeds.standings)}
        ${renderMatchCard('Matchs à venir', 'Agenda', feeds.upcoming, true)}
        ${renderCategoryAccessCard(categories)}
        ${renderMatchCard('Résultats', 'Derniers matchs', feeds.past, false)}
      </div>
    </section>
  `;
}

function renderCategoryOverview() {
  const summary = getCategorySummary(state.cat);
  const teams = CLUB_DATA.categories[state.cat]?.teams || [];
  const identity = getClubIdentity(state.cat);
  const configuredTeams = getConfiguredTeamsForCategory(state.cat);
  return `
    <section class="category-shell">
      <div class="category-toolbar">
        <div class="view-switcher">
          ${Object.keys(CAT_LABELS).map(cat => `
            <button class="view-chip ${state.cat === cat ? 'on' : ''}" type="button" data-action="switch-category" data-cat="${cat}">
              ${h(CAT_LABELS[cat])}
            </button>
          `).join('')}
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" type="button" data-action="open-postmatch" data-cat="${state.cat}">
            + Saisie post-match
          </button>
          <button class="btn" type="button" data-action="open-roster-manage" data-cat="${state.cat}">
            Gérer l'effectif
          </button>
          <button class="btn" type="button" data-action="open-roster-create" data-cat="${state.cat}">
            + Joueur
          </button>
        </div>
      </div>

      <div class="category-hero">
        <div>
          <div class="card-kicker">Catégorie</div>
          <h1>${h(CAT_LABELS[state.cat])}</h1>
          <p>Vue d'ensemble de la catégorie, de ses équipes et accès direct aux fiches joueurs. Identité active : <strong>${h(identity)}</strong>.</p>
        </div>
        <div class="dashboard-stats">
          <div class="dash-stat"><span>Joueurs</span><strong>${summary.count}</strong></div>
          <div class="dash-stat"><span>Équipes</span><strong>${summary.teamsCount}</strong></div>
          <div class="dash-stat"><span>Évalués</span><strong>${summary.evaluated}</strong></div>
          <div class="dash-stat"><span>Saison</span><strong>${h(state.season)}</strong></div>
        </div>
      </div>

      ${renderCategoryPlayerTable()}

      <div class="dashboard-grid">
        <section class="dashboard-card">
          <div class="card-head"><div><div class="card-kicker">Équipes</div><h2>Organisation</h2></div></div>
          <div class="team-list">
            ${teams.map(team => `<div class="team-item">${h(team)}</div>`).join('')}
          </div>
        </section>

        <section class="dashboard-card">
          <div class="card-head"><div><div class="card-kicker">Sources FFF</div><h2>Statut synchro</h2></div></div>
          <div class="info-list">
            ${configuredTeams.length ? configuredTeams.map(team => {
              const remote = state.remoteSources[team.key] || {};
              return `<div class="info-item"><strong>${h(team.teamLabel)}</strong> — ${team.pending ? 'source à renseigner' : 'source configurée'}${remote.error ? ` — ${h(remote.error)}` : ''}</div>`;
            }).join('') : '<div class="info-item">Aucune source configurée pour cette catégorie.</div>'}
          </div>
        </section>
      </div>
    </section>
  `;
}

function getLastObsDate(pid, season = state.season) {
  const obs = state.data[state.cat]?.[pid]?.observations?.[season] || [];
  if (!obs.length) return null;
  const sorted = [...obs].sort((a, b) => new Date(b.date_match) - new Date(a.date_match));
  return sorted[0]?.date_match || null;
}

function renderCategoryPlayerTable() {
  const list = players();
  if (!list.length) {
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Effectif</div><h2>Tableau joueurs</h2></div></div>
      <div class="dash-empty">
        <div class="dash-empty-msg">Aucun joueur dans cette catégorie</div>
        <div class="dash-empty-hint">Utilise « + Joueur » pour démarrer.</div>
      </div>
    </section>`;
  }

  const sortBy = state.sortBy || 'name';
  const sortDir = state.sortDir || 'asc';

  const enriched = list.map(p => {
    const pid = p.name;
    const sc = pScore(state.cat, pid);
    const comp = getCompletion(pid);
    const last = getLastObsDate(pid);
    const prog = getProgress(pid);
    return {
      name: pid,
      prof: state.data[state.cat][pid]?.profil || {},
      score: sc,
      completion: comp.percent,
      lastObs: last,
      progression: prog ? prog.diff : null,
    };
  });

  enriched.sort((a, b) => {
    let va, vb;
    if (sortBy === 'name')           { va = a.name; vb = b.name; }
    else if (sortBy === 'score')     { va = a.score; vb = b.score; }
    else if (sortBy === 'completion'){ va = a.completion; vb = b.completion; }
    else if (sortBy === 'lastObs')   { va = a.lastObs || ''; vb = b.lastObs || ''; }
    else if (sortBy === 'progression'){ va = a.progression ?? -999; vb = b.progression ?? -999; }
    if (typeof va === 'string') {
      const cmp = va.localeCompare(vb, 'fr', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  function sortIcon(key) {
    if (state.sortBy !== key) return '<span class="sort-ico">↕</span>';
    return state.sortDir === 'asc' ? '<span class="sort-ico on">↑</span>' : '<span class="sort-ico on">↓</span>';
  }
  function thBtn(key, label) {
    return `<button type="button" class="th-sort" data-action="sort-cat-table" data-sort-key="${key}">${h(label)} ${sortIcon(key)}</button>`;
  }

  const rows = enriched.map(e => {
    const col = avCol(e.name);
    const scoreCol = e.score >= 60 ? 'var(--green)' : e.score >= 40 ? 'var(--amber)' : e.score > 0 ? 'var(--red)' : 'var(--text3)';
    const progTxt = e.progression == null ? '—' : (e.progression > 0 ? '+' + e.progression + '%' : e.progression + '%');
    const progCol = e.progression == null ? 'var(--text3)' : e.progression > 0 ? 'var(--green)' : e.progression < 0 ? 'var(--red)' : 'var(--text2)';
    const lastTxt = e.lastObs ? new Date(e.lastObs).toLocaleDateString('fr-FR') : '—';
    return `<tr class="cat-table-row" data-action="select-player" data-player="${h(e.name)}">
      <td>
        <div class="cat-table-name">
          <span class="cat-table-av" style="background:${col[0]};color:${col[1]}">${e.prof?.photo ? `<img src="${e.prof.photo}" alt="">` : h(ini(e.name))}</span>
          <span>${h(e.name)}</span>
          ${(() => { const cs = window.InjuryModule?.currentStatus?.(e.name, state.cat); if (!cs) return ''; const td = window.InjuryModule.TYPES.find(t => t.key === cs.type) || {}; return `<span class="cat-table-inj" title="${h(td.label || '')}${cs.zone ? ' · ' + h(cs.zone) : ''}">${td.icon || '⚠'}</span>`; })()}
        </div>
      </td>
      <td>${h(e.prof.poste1 || '—')}</td>
      <td><strong style="color:${scoreCol}">${e.score ? e.score + '%' : '—'}</strong></td>
      <td>${e.completion}%</td>
      <td>${h(lastTxt)}</td>
      <td style="color:${progCol}"><strong>${h(progTxt)}</strong></td>
    </tr>`;
  }).join('');

  return `<section class="dashboard-card cat-table-card">
    <div class="card-head">
      <div><div class="card-kicker">Effectif</div><h2>Tableau joueurs (${list.length})</h2></div>
    </div>
    <div class="cat-table-wrap">
      <table class="cat-table">
        <thead>
          <tr>
            <th>${thBtn('name', 'Joueur')}</th>
            <th>Poste</th>
            <th>${thBtn('score', 'Score')}</th>
            <th>${thBtn('completion', 'Dossier')}</th>
            <th>${thBtn('lastObs', 'Dernière obs')}</th>
            <th>${thBtn('progression', 'Progression')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function insightsMarkup(insights) {
  return `<div class="coach-insights">${insights.map(item => `<div class="insight-pill ${item.tone}">${h(item.text)}</div>`).join('')}</div>`;
}

function evolutionCard(pid) {
  const series = getSeasonSeries(pid);
  return `
    <div class="detail-card">
      <div class="card-kicker">Suivi saison</div>
      <h3>Evolution du score</h3>
      ${series.length ? `
        <div class="timeline-list">
          ${series.map(item => `<div class="timeline-row"><span>${h(item.season)}</span><strong>${item.score}%</strong></div>`).join('')}
        </div>
        <div class="history-chart-wrap"><canvas id="history-chart" height="120" aria-label="Evolution du score"></canvas></div>
      ` : `<p class="insight-text">Pas assez de saisons renseignees pour afficher une evolution.</p>`}
    </div>
  `;
}

function quickViewBody(pid) {
  const score = pScore(state.cat, pid);
  const level = getLevel(score);
  const profile = getProfile(pid);
  const weakest = getMainWeakness(pid);
  const strongest = strongestPillar(pid);
  const completion = getCompletion(pid);
  const progress = getProgress(pid);
  const insights = getInsights(pid);

  return `
    <div class="quick-grid">
      <div class="quick-card">
        <div class="card-kicker">Vue terrain</div>
        <h3>Lecture coach</h3>
        <div class="quick-statline">
          <div><span>Score global</span><strong>${score > 0 ? score + '%' : '-'}</strong></div>
          <div><span>Niveau</span><strong>${h(level)}</strong></div>
        </div>
        <div class="quick-summary">
          <div class="summary-line"><span>Profil</span><strong>${h(profile)}</strong></div>
          <div class="summary-line"><span>Priorite</span><strong>${weakest ? h(weakest.label) : 'A definir'}</strong></div>
          <div class="summary-line"><span>Progression</span><strong>${progress ? h(progress.text) : '-'}</strong></div>
          <div class="summary-line"><span>Dossier</span><strong>${completion.percent}%</strong></div>
        </div>
      </div>
      <div class="quick-card">
        <div class="card-kicker">Decisions</div>
        <h3>3 points a retenir</h3>
        ${insightsMarkup(insights.slice(0, 3))}
      </div>
      <div class="quick-card">
        <div class="card-kicker">Travail prioritaire</div>
        <h3>Axe principal</h3>
        <div class="priority-box">
          <strong>${weakest ? h(weakest.label) : 'Observation en cours'}</strong>
          <p>${weakest ? `Pilier le plus bas actuellement a ${weakest.score}%.` : 'Aucun axe clair tant que davantage de criteres ne sont pas notes.'}</p>
          <div class="priority-secondary">${strongest ? `Appui actuel: ${h(strongest.label)} (${strongest.score}%).` : 'Pas encore de point fort distinct.'}</div>
        </div>
      </div>
      ${evolutionCard(pid)}
    </div>
  `;
}

function profileBody(pid) {
  const prof = getProf(pid);
  const gap = getGapToIdeal(pid);
  const strongest = strongestPillar(pid);
  const weakest = getMainWeakness(pid);
  const completion = getCompletion(pid);
  const insights = getInsights(pid);
  const objectifs = Array.isArray(prof.objectifs) && prof.objectifs.length ? prof.objectifs : [''];

  const objRows = objectifs.map((item, index) => `
    <div class="obj-row">
      <input class="obj-input" type="text" placeholder="Objectif ${index + 1}..." value="${h(item || '')}" data-action="update-obj" data-index="${index}">
      <button class="obj-del" type="button" data-action="delete-obj" data-index="${index}" aria-label="Supprimer l'objectif ${index + 1}">x</button>
    </div>
  `).join('');

  return `
    <div class="detail-grid">
      <div class="detail-card span-2">
        <div class="card-kicker">Lecture coach</div>
        <h3>Insights automatiques</h3>
        ${insightsMarkup(insights)}
      </div>
      <div class="detail-card">
        <div class="card-kicker">Priorite</div>
        <h3>Axe principal</h3>
        <div class="priority-box">
          <strong>${weakest ? h(weakest.label) : 'A definir'}</strong>
          <p>${weakest ? `C est le pilier le plus faible a ${weakest.score}% sur cette saison.` : 'Aucun axe prioritaire ne ressort encore.'}</p>
        </div>
      </div>
      <div class="detail-card">
        <div class="card-kicker">Lecture rapide</div>
        <h3>Resume</h3>
        <div class="insight-text">
          ${strongest ? `Point fort actuel: <strong>${h(strongest.label)}</strong> (${strongest.score}%).` : 'Aucun pilier assez renseigne pour ressortir un point fort clair.'}
          ${weakest ? ` Axe principal: <strong>${h(weakest.label)}</strong> (${weakest.score}%).` : ''}
          ${completion.total ? ` Dossier rempli a ${completion.percent}%.` : ''}
        </div>
      </div>
      ${evolutionCard(pid)}
    </div>

    <div class="form-section-title">Identite</div>
    <div class="form-grid">
      <div class="field-group"><label class="field-label" for="pf-nom">Nom</label><input class="field-input" id="pf-nom" type="text" value="${h(prof.nom)}" data-field="nom"></div>
      <div class="field-group"><label class="field-label" for="pf-prenom">Prenom</label><input class="field-input" id="pf-prenom" type="text" value="${h(prof.prenom)}" data-field="prenom"></div>
      <div class="field-group"><label class="field-label" for="pf-birth">Date de naissance</label><input class="field-input" id="pf-birth" type="date" value="${h(prof.naissance)}" data-field="naissance"></div>
      <div class="field-group"><label class="field-label" for="pf-licence">Numero de licence</label><input class="field-input" id="pf-licence" type="text" value="${h(prof.licence)}" data-field="licence"></div>
      <div class="field-group"><label class="field-label" for="pf-years">Annees au club</label><input class="field-input" id="pf-years" type="number" min="0" max="20" value="${h(prof.annees_club)}" data-field="annees_club"></div>
      <div class="field-group"><label class="field-label" for="pf-parent">Contact parent</label><input class="field-input" id="pf-parent" type="tel" value="${h(prof.contact_parent)}" data-field="contact_parent"></div>
    </div>

    <div class="form-section-title">Profil sportif</div>
    <div class="form-grid">
      <div class="field-group">
        <label class="field-label" for="pf-team">Équipe principale</label>
        <select class="field-input" id="pf-team" data-field="team">
          <option value="">— Non assigné —</option>
          ${(CLUB_DATA.categories[state.cat]?.teams || []).map(t =>
            `<option value="${h(t)}" ${prof.team === t ? 'selected' : ''}>${h(t)}</option>`).join('')}
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="pf-poste1">Poste principal</label>
        <select class="field-input" id="pf-poste1" data-field="poste1">
          <option value="">Choisir</option>
          ${POSTES.map(poste => `<option value="${h(poste)}" ${prof.poste1 === poste ? 'selected' : ''}>${h(poste)}</option>`).join('')}
        </select>
      </div>
      <div class="field-group">
        <label class="field-label" for="pf-poste2">Poste secondaire</label>
        <select class="field-input" id="pf-poste2" data-field="poste2">
          <option value="">Optionnel</option>
          ${POSTES.map(poste => `<option value="${h(poste)}" ${prof.poste2 === poste ? 'selected' : ''}>${h(poste)}</option>`).join('')}
        </select>
      </div>
      <div class="field-group full">
        <div class="field-label">Pied fort</div>
        <div class="foot-row">
          ${[['droit', 'Droit'],['gauche', 'Gauche'],['ambidextre', 'Les deux']].map(([value, label]) => `
            <button class="foot-btn ${prof.pied === value ? 'on' : ''}" type="button" data-action="set-foot" data-value="${value}">
              <div class="foot-icon">Pied</div><div>${h(label)}</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="insight-grid">
      <div class="insight-card">
        <h4>Ecart au poste</h4>
        ${gap ? `
          <div class="gap-list">
            ${Object.entries(gap).map(([key, value]) => {
              const pct = Math.max(4, Math.round((1 - Math.min(value, 4) / 4) * 100));
              return `<div class="gap-row"><span>${h(key)}</span><div class="gap-bar"><div class="gap-bar-fill" style="width:${pct}%"></div></div><strong>${value.toFixed(1)}</strong></div>`;
            }).join('')}
          </div>
          <div class="gap-help">Plus la valeur est basse, plus le profil actuel se rapproche du poste principal choisi.</div>
        ` : `<div class="insight-text">Choisis un poste principal pour afficher un repere simple par rapport au profil type.</div>`}
      </div>
      <div class="insight-card">
        <h4>Objectif de construction</h4>
        <div class="insight-text">${weakest ? `Le travail prioritaire peut se concentrer sur <strong>${h(weakest.label)}</strong>.` : 'Axe principal en attente d observations suffisantes.'}</div>
      </div>
    </div>

    <div class="form-section-title">Morphologie</div>
    <div class="form-grid">
      <div class="field-group"><label class="field-label" for="pf-height">Taille (cm)</label><input class="field-input" id="pf-height" type="number" min="100" max="220" value="${h(prof.taille)}" data-field="taille"></div>
      <div class="field-group"><label class="field-label" for="pf-weight">Poids (kg)</label><input class="field-input" id="pf-weight" type="number" min="20" max="150" value="${h(prof.poids)}" data-field="poids"></div>
      <div class="field-group full">
        <button class="btn" type="button" data-action="snapshot-morpho">+ Enregistrer la mesure du jour</button>
      </div>
    </div>
    ${renderMorphoHistory(prof)}
    ${window.InjuryModule?.renderWidget(pid) || ''}
    ${window.AttendanceModule?.renderWidget(pid) || ''}

    <div class="form-section-title">Objectifs de saison</div>
    <div class="obj-list">${objRows}<button class="add-obj" type="button" data-action="add-obj">+ Ajouter un objectif</button></div>

    <div class="form-footer"><span class="save-hint">Autosauvegarde active</span><button class="btn btn-primary" type="button" data-action="save-player">Sauvegarder maintenant</button></div>
  `;
}

function juggleBody(pid) {
  const jd = jdata();
  const player = players().find(item => item.name === pid);
  const jScore = player?.seasons || {};
  const allSeasons = Object.keys(jScore).sort().reverse();

  if (!allSeasons.length) return `<div class="jg-absent">Aucun resultat de jonglerie enregistre pour ce joueur.</div>`;

  const { target, acq } = jd;
  const current = jScore[state.season];
  const currentBlock = current != null ? `
    <div class="jg-score-card">
      <div class="jg-season-label">Saison ${h(state.season)}</div>
      <div class="jg-big-score" style="color:${current >= target ? '#639922' : current >= acq ? '#BA7517' : '#D85A30'}">${current}</div>
      <div class="jg-of">/ ${target} jonglages</div>
      <div class="jg-bar-bg"><div class="jg-bar-fill" style="width:${Math.min(Math.round((current / target) * 100), 100)}%;background:${current >= target ? '#639922' : current >= acq ? '#BA7517' : '#D85A30'}"></div></div>
      <span class="jg-status" style="background:${LBG[current >= target ? 3 : current >= acq ? 2 : 1]};border:1px solid ${LBD[current >= target ? 3 : current >= acq ? 2 : 1]};color:${LTX[current >= target ? 3 : current >= acq ? 2 : 1]}">${current >= target ? 'Objectif atteint' : current >= acq ? 'En cours d acquisition' : 'En apprentissage'}</span>
    </div>
  ` : `<div class="jg-absent">Aucun passage sur le test de la saison ${h(state.season)}.</div>`;

  const historyRows = allSeasons.filter(item => item !== state.season && jScore[item] != null).map(item => {
    const value = jScore[item];
    const color = value >= target ? '#639922' : value >= acq ? '#BA7517' : '#D85A30';
    return `<div class="hist-row"><span class="hist-s">${h(item)}</span><div class="hist-bg"><div class="hist-fill" style="width:${Math.min(Math.round((value / target) * 100), 100)}%;background:${color}"></div></div><span class="hist-v" style="color:${color}">${value}</span></div>`;
  }).join('');

  return `<div class="jg-cards">${currentBlock}</div>${historyRows ? `<div class="jg-hist-card"><div class="jg-hist-title">Historique des saisons</div>${historyRows}</div>` : ''}`;
}

function renderMorphoHistory(prof) {
  const history = Array.isArray(prof.history) ? prof.history : [];
  if (!history.length) {
    return `<div class="morpho-history-card">
      <div class="card-kicker">Évolution morphologique</div>
      <p class="info-text">Aucune mesure datée pour le moment. Renseigne la taille/poids actuels puis clique sur « Enregistrer la mesure du jour » pour démarrer le suivi.</p>
    </div>`;
  }
  const sorted = [...history].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const maxT = Math.max(...sorted.map(m => Number(m.taille) || 0));
  const maxW = Math.max(...sorted.map(m => Number(m.poids)  || 0));
  const minT = Math.min(...sorted.filter(m => m.taille).map(m => Number(m.taille)), maxT);
  const minW = Math.min(...sorted.filter(m => m.poids).map(m => Number(m.poids)),  maxW);

  const rows = sorted.slice().reverse().map(m => {
    const dateStr = m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '—';
    return `<div class="morpho-row">
      <span class="morpho-date">${h(dateStr)}</span>
      <span class="morpho-val">${m.taille ? m.taille + ' cm' : '—'}</span>
      <span class="morpho-val">${m.poids ? m.poids + ' kg' : '—'}</span>
      ${m.imc ? `<span class="morpho-imc">IMC ${m.imc}</span>` : ''}
      <button class="att-del" type="button"
        data-action="remove-morpho" data-date="${h(m.date)}"
        aria-label="Supprimer la mesure">×</button>
    </div>`;
  }).join('');

  // Petite frise SVG taille/poids
  const w = 320, hh = 110, pad = 20;
  function points(field, min, max) {
    if (max <= min) return '';
    return sorted.map((m, i) => {
      const v = Number(m[field]);
      if (!v) return null;
      const x = pad + (sorted.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad) / (sorted.length - 1)));
      const y = hh - pad - ((v - min) / (max - min)) * (hh - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(' ');
  }
  const tPoints = maxT > minT ? points('taille', minT, maxT) : '';
  const wPoints = maxW > minW ? points('poids',  minW, maxW) : '';
  const svg = (tPoints || wPoints) ? `
    <svg viewBox="0 0 ${w} ${hh}" class="morpho-spark" xmlns="http://www.w3.org/2000/svg" aria-label="Évolution taille / poids">
      ${tPoints ? `<polyline fill="none" stroke="#185fa5" stroke-width="2" points="${tPoints}"/>` : ''}
      ${wPoints ? `<polyline fill="none" stroke="#854f0b" stroke-width="2" stroke-dasharray="4 3" points="${wPoints}"/>` : ''}
    </svg>
    <div class="morpho-legend">
      <span><span class="morpho-dot" style="background:#185fa5"></span>Taille</span>
      <span><span class="morpho-dot" style="background:#854f0b"></span>Poids</span>
    </div>` : '';

  return `<div class="morpho-history-card">
    <div class="card-kicker">Évolution morphologique</div>
    <h3>${history.length} mesure${history.length > 1 ? 's' : ''}</h3>
    ${svg}
    <div class="morpho-list">${rows}</div>
  </div>`;
}

function renderCategoryComparison(pid) {
  const transverse = window.TransverseModule;
  if (!transverse) return '';
  const avgs = transverse.catPillarAverages(state.cat, state.season);
  const pillarsArr = pillars();
  const rows = pillarsArr.map(p => {
    const playerAvg = pAvg(state.cat, pid, p.key, state.season);
    const catAvg = avgs[p.key];
    if (!playerAvg) return null;
    const pct = transverse.playerPercentile(state.cat, pid, p.key, state.season);
    const delta = catAvg != null ? +(playerAvg - catAvg).toFixed(2) : null;
    const deltaCls = delta == null ? '' : delta > 0.1 ? 'delta-up' : delta < -0.1 ? 'delta-down' : 'delta-flat';
    return `<div class="vsavg-row">
      <span class="vsavg-name">${h(p.label)}</span>
      <span class="vsavg-mine"><strong>${playerAvg.toFixed(2)}</strong> / 4</span>
      <span class="vsavg-avg">moy. catégorie ${catAvg != null ? catAvg.toFixed(2) : '—'}</span>
      <span class="vsavg-delta ${deltaCls}">${delta == null ? '—' : (delta > 0 ? '+' : '') + delta}</span>
      <span class="vsavg-pct">${pct != null ? pct + 'ᵉ percentile' : '—'}</span>
    </div>`;
  }).filter(Boolean).join('');

  if (!rows) return '';
  return `<div class="detail-card vsavg-card">
    <div class="card-kicker">Position dans la catégorie</div>
    <h3>${h(pid)} vs moyenne ${h(CAT_LABELS[state.cat])}</h3>
    <div class="vsavg-list">${rows}</div>
    <p class="info-text">Le percentile indique le pourcentage de joueurs de la catégorie avec une moyenne inférieure (sur le pilier).</p>
  </div>`;
}

function evaluationBody(pid) {
  const pillar = pillars()[state.selPillar];
  const seasonData = state.data[state.cat][pid][state.season];
  const pillarTabs = pillars().map((item, index) => {
    const pct = getPillarPercent(state.cat, pid, item.key);
    return `<button class="ptab ${state.selPillar === index ? 'on' : ''}" type="button" data-action="set-pillar" data-index="${index}" style="${state.selPillar === index ? 'background:' + PCOLS[item.key] : ''}">${h(item.label)}${pct > 0 ? ' - ' + pct + '%' : ''}</button>`;
  }).join('');

  const criteria = pillar.criteria.map((criterion, index) => {
    const val = seasonData.ratings?.[pillar.key]?.[index] || 0;
    const comment = seasonData.critComments?.[pillar.key]?.[index] || '';
    const dots = [1,2,3,4].map(dot => `<button class="dot ${val === dot ? 'on-' + dot : ''}" type="button" data-action="set-rating" data-pillar="${h(pillar.key)}" data-index="${index}" data-value="${dot}" aria-label="Note ${dot} pour ${h(criterion)}">${dot}</button>`).join('');
    return `<div class="crit-row"><div class="crit-top"><div class="crit-name">${h(criterion)}</div><div class="dots">${dots}</div></div>${val ? `<div class="crit-note">${h(DLABELS[val])}</div>` : ''}<textarea class="crit-comment" rows="2" placeholder="Commentaire sur ce critere..." data-action="set-crit-comment" data-pillar="${h(pillar.key)}" data-index="${index}">${h(comment)}</textarea></div>`;
  }).join('');

  const weakness = getMainWeakness(pid);

  return `
    <div class="detail-grid">
      <div class="detail-card span-2"><div class="card-kicker">Lecture coach</div><h3>Insights du moment</h3>${insightsMarkup(getInsights(pid))}</div>
      <div class="detail-card"><div class="card-kicker">Priorite</div><h3>Axe de travail</h3><div class="priority-box"><strong>${weakness ? h(weakness.label) : 'A definir'}</strong><p>${weakness ? `Pilier le plus bas a ${weakness.score}%.` : 'Aucun axe stable pour le moment.'}</p></div></div>
    </div>
    ${renderCategoryComparison(pid)}
    ${window.ProfilingModule?.renderTags(pid) || ''}
    <div class="pillar-nav">${pillarTabs}</div>
    <div class="legend-bar">
      <div class="litem"><div class="ldot" style="background:#FAECE7;border:1px solid #D85A30"></div>1 Non acquis</div>
      <div class="litem"><div class="ldot" style="background:#FAEEDA;border:1px solid #BA7517"></div>2 En cours</div>
      <div class="litem"><div class="ldot" style="background:#EAF3DE;border:1px solid #639922"></div>3 Acquis</div>
      <div class="litem"><div class="ldot" style="background:#E6F1FB;border:1px solid #185FA5"></div>4 Maitrise</div>
    </div>
    <div class="crit-list">${criteria}</div>
    <div class="eval-footer">
      <div class="footer-grid">
        <div class="fc-block"><label for="fc-coach">Commentaire entraineur</label><textarea id="fc-coach" placeholder="Points forts, axes de progression..." data-action="set-main-comment">${h(seasonData.comments?.main || '')}</textarea></div>
        <div class="fc-block"><label for="fc-self">Auto-evaluation joueur</label><textarea id="fc-self" placeholder="Ressenti du joueur..." data-action="set-self-comment">${h(seasonData.comments?.self || '')}</textarea></div>
      </div>
      <div class="save-row"><span class="save-hint">Saison ${h(state.season)}</span><button class="btn btn-primary" type="button" data-action="save-player">Sauvegarder maintenant</button></div>
    </div>
  `;
}

function renderPlayerView() {
  const pid = state.selPlayer;
  ensureData(state.cat, pid, state.season);

  // Migration douce : ancien selSection 'jonglerie' devient 'seance'
  if (state.selSection === 'jonglerie') state.selSection = 'seance';
  // Anciennes valeurs 'observation' restent valides (renommées en libellé seulement)

  const prof = getProf(pid);
  const score = pScore(state.cat, pid);
  const level = getLevel(score);
  const compareScore = state.comparePlayer ? pScore(state.cat, state.comparePlayer) : null;
  const progress = getProgress(pid);
  const completion = getCompletion(pid);
  const values = pillars().map(pillar => getPillarPercent(state.cat, pid, pillar.key));
  const compareValues = state.comparePlayer ? pillars().map(pillar => getPillarPercent(state.cat, state.comparePlayer, pillar.key)) : [];
  const hasRadar = values.some(value => value > 0) || compareValues.some(value => value > 0);
  const displayName = (prof.prenom && prof.nom) ? (prof.prenom + ' ' + prof.nom) : pid;
  const piedLabel = prof.pied === 'droit' ? 'Pied droit' : prof.pied === 'gauche' ? 'Pied gauche' : prof.pied === 'ambidextre' ? 'Ambidextre' : null;
  const strongest = strongestPillar(pid);
  const weakest = getMainWeakness(pid);
  const profileTone = getPlayerTone(pid);
  const compareOptions = players().filter(player => player.name !== pid).map(player => `<option value="${h(player.name)}" ${state.comparePlayer === player.name ? 'selected' : ''}>${h(player.name)}</option>`).join('');

  // 4 onglets (Jonglerie fusionnée dans Séances ; libellé Observations devient Matchs)
  const sectionTabs = [
    ['profil', 'Profil'],
    ['evaluation', 'Évaluation'],
    ['seance', 'Séances'],
    ['observation', 'Matchs']
  ].map(([key, label]) => `<button class="stab ${state.selSection === key ? 'on' : ''}" type="button" data-action="set-section" data-section="${key}">${label}${key === 'evaluation' && score > 0 ? ' (' + score + '%)' : ''}</button>`).join('');

  // Bandeau « lecture coach » permanent (toujours visible)
  const insights = getInsights(pid);
  const coachBanner = `
    <div class="coach-banner">
      <div class="coach-banner-stats">
        <div class="cb-stat"><span>Score</span><strong>${score > 0 ? score + '%' : '—'}</strong></div>
        <div class="cb-stat"><span>Niveau</span><strong>${h(level)}</strong></div>
        <div class="cb-stat"><span>Profil</span><strong>${h(getProfile(pid))}</strong></div>
        <div class="cb-stat"><span>Priorité</span><strong>${weakest ? h(weakest.label) : '—'}</strong></div>
        <div class="cb-stat"><span>Point fort</span><strong>${strongest ? h(strongest.label) : '—'}</strong></div>
        <div class="cb-stat"><span>Dossier</span><strong>${completion.percent}%</strong></div>
        <div class="cb-stat"><span>Progression</span><strong>${progress ? h(progress.text) : '—'}</strong></div>
      </div>
      <div class="coach-banner-insights">${insights.slice(0,2).map(i => `<span class="insight-pill ${i.tone}">${h(i.text)}</span>`).join('')}</div>
    </div>
  `;

  // Corps selon la section (jonglerie supprimée — onglet fusionné dans séances)
  let body = '';
  if (state.selSection === 'profil') body = profileBody(pid);
  else if (state.selSection === 'seance') body = window.SeanceModule?.renderBody(pid) ?? '<p>Module séances non chargé.</p>';
  else if (state.selSection === 'observation') body = window.ObsModule?.renderBody(pid) ?? '<p>Module observations non chargé.</p>';
  else body = evaluationBody(pid);

  return `
    <div class="profile-card" style="--player-accent:${profileTone}">
      <div class="profile-hero">
        <div class="hero-photo-wrap">
          <div class="hero-photo">${prof.photo ? `<img src="${prof.photo}" alt="${h(displayName)}">` : `<div class="hero-photo-hint">Ajouter une photo du joueur</div>`}</div>
          <label class="hero-photo-badge" for="photo-input" title="Changer la photo">+</label>
          <input id="photo-input" class="sr-only" type="file" accept="image/*">
        </div>
        <div class="hero-body">
          <div class="hero-topline">
            <div>
              <div class="hero-name">${h(displayName)}</div>
              <div class="hero-tags">
                <span class="hero-tag">${h(getProfile(pid))}</span>
                <span class="hero-tag">Niveau ${h(level)}</span>
                <span class="hero-tag">${h(CAT_LABELS[state.cat])}</span>
                <span class="hero-tag">Saison ${h(state.season)}</span>
                ${piedLabel ? `<span class="hero-tag">${h(piedLabel)}</span>` : ''}
              </div>
            </div>
            <div class="hero-actions">
              <button class="btn" type="button" data-action="back-to-category">Retour catégorie</button>
              <button class="btn" type="button" data-action="print-report">Bilan joueur</button>
            </div>
          </div>
          <div class="hero-postes"><span class="poste-main">${h(prof.poste1 || 'Poste non défini')}</span>${prof.poste2 ? `<span class="poste-sec">${h(prof.poste2)}</span>` : ''}</div>
        </div>
        ${hasRadar ? `<div class="hero-radar"><canvas id="rc" width="180" height="180" aria-label="Radar ${h(pid)}"></canvas></div>` : ''}
      </div>

      ${coachBanner}

      <div class="toolbar toolbar-top">
        <div class="section-tabs">${sectionTabs}</div>
        <div class="toolbar-right">
          <select class="compare-select" id="compare-select" aria-label="Comparer à un autre joueur"><option value="">Comparer à un autre joueur</option>${compareOptions}</select>
          <button class="btn" type="button" data-action="clear-player-photo">Supprimer la photo</button>
        </div>
      </div>
      ${state.comparePlayer ? `<div class="stats-row compare-on">
        <div class="stat-card compare-card"><div class="stat-val">${score || 0}%</div><div class="stat-label">${h(pid)}</div></div>
        <div class="stat-card compare-card"><div class="stat-val">${compareScore || 0}%</div><div class="stat-label">${h(state.comparePlayer)}</div></div>
      </div>` : ''}
      <div class="sec-body">${body}</div>
    </div>
  `;
}

function renderTeamListShell() {
  const teams = window.TeamModule?.listTeams(state.cat) || [];
  const catLabel = CAT_LABELS[state.cat] || state.cat.toUpperCase();
  return `
    <section class="team-shell">
      <div class="team-toolbar">
        <div class="view-switcher">
          ${Object.keys(CAT_LABELS).map(cat => `
            <button class="view-chip ${state.cat === cat ? 'on' : ''}" type="button" data-action="switch-category" data-cat="${cat}">
              ${h(CAT_LABELS[cat])}
            </button>
          `).join('')}
        </div>
        <div class="toolbar-right">
          <button class="btn btn-primary" type="button" data-action="open-postmatch" data-cat="${state.cat}">+ Saisie post-match</button>
        </div>
      </div>
      <div class="team-listing-hero">
        <div>
          <div class="card-kicker">Équipes • ${h(catLabel)}</div>
          <h1>${teams.length} équipe${teams.length > 1 ? 's' : ''}</h1>
          <p>Bilan saison ${h(state.season)} dérivé des observations match de chaque joueur.
          ${teams.length === 0 ? ' Aucune équipe configurée pour cette catégorie.' : ''}</p>
        </div>
      </div>
      ${window.TeamModule?.renderListBody(state.cat) || ''}
    </section>`;
}

function renderMain() {
  const el = q('#main-content');
  if (state.view === 'dashboard') el.innerHTML = renderDashboard();
  else if (state.view === 'categories') el.innerHTML = renderCategoryOverview();
  else if (state.view === 'player' && state.selPlayer) el.innerHTML = renderPlayerView();
  else if (state.view === 'team') {
    const teamModule = window.TeamModule;
    if (!teamModule) el.innerHTML = '<p>Module équipes non chargé.</p>';
    else if (state.selTeam) el.innerHTML = teamModule.renderTeamBody(state.cat, state.selTeam);
    else el.innerHTML = renderTeamListShell();
  }
  else if (state.view === 'analyses') {
    el.innerHTML = window.TransverseModule?.renderBody(state.cat) || '<p>Module analyses non chargé.</p>';
  }
  else if (state.view === 'direction') {
    el.innerHTML = window.DirecteurModule?.renderBody() || '<p>Module direction non chargé.</p>';
  }
  else el.innerHTML = renderCategoryOverview();

  if (state.view === 'player' && state.selPlayer) {
    const values = pillars().map(pillar => getPillarPercent(state.cat, state.selPlayer, pillar.key));
    const compareValues = state.comparePlayer ? pillars().map(pillar => getPillarPercent(state.cat, state.comparePlayer, pillar.key)) : [];
    const hasRadar = values.some(value => value > 0) || compareValues.some(value => value > 0);
    if (hasRadar) drawRadar(state.selPlayer, values, compareValues);
    drawHistoryChart(state.selPlayer);
    // Modules afterRender (graphes séances / observations)
    if (state.selSection !== 'seance') window.SeanceModule?.destroyCharts();
    if (state.selSection !== 'observation') window.ObsModule?.destroyCharts();
    window.SeanceModule?.afterRender(state.selPlayer);
    window.ObsModule?.afterRender(state.selPlayer);
  } else {
    if (rchart) { rchart.destroy(); rchart = null; }
    if (historyChart) { historyChart.destroy(); historyChart = null; }
    window.SeanceModule?.destroyCharts();
    window.ObsModule?.destroyCharts();
  }
}

function drawRadar(pid, values, compareValues = []) {
  const canvas = q('#rc');
  if (!canvas) return;
  if (rchart) { rchart.destroy(); rchart = null; }

  const datasets = [{
    label:pid,
    data:values,
    backgroundColor:'rgba(255,255,255,0.18)',
    borderColor:'rgba(255,255,255,0.9)',
    borderWidth:1.8,
    pointBackgroundColor:'#fff',
    pointBorderColor:'#0c447c',
    pointRadius:2.5
  }];

  if (state.comparePlayer && compareValues.some(value => value > 0)) {
    datasets.push({
      label:state.comparePlayer,
      data:compareValues,
      backgroundColor:'rgba(215,221,232,0.12)',
      borderColor:'rgba(221,228,239,0.75)',
      borderWidth:1.4,
      pointBackgroundColor:'#d9dee7',
      pointBorderColor:'#6c7381',
      pointRadius:2
    });
  }

  rchart = new Chart(canvas, {
    type:'radar',
    data:{ labels:pillars().map(item => item.label), datasets },
    options:{
      responsive:false,
      plugins:{ legend:{ display:datasets.length > 1, labels:{ color:'#fff', boxWidth:10 } } },
      scales:{
        r:{
          min:0,max:100,
          ticks:{ stepSize:25, backdropColor:'transparent', color:'rgba(255,255,255,0.55)', font:{ size:8 } },
          grid:{ color:'rgba(255,255,255,0.24)' },
          angleLines:{ color:'rgba(255,255,255,0.2)' },
          pointLabels:{ color:'rgba(255,255,255,0.88)', font:{ size:9, family:'Outfit' } }
        }
      }
    }
  });
}

function drawHistoryChart(pid) {
  const canvas = q('#history-chart');
  if (!canvas) {
    if (historyChart) { historyChart.destroy(); historyChart = null; }
    return;
  }

  const series = getSeasonSeries(pid);
  if (historyChart) { historyChart.destroy(); historyChart = null; }
  if (!series.length) return;

  historyChart = new Chart(canvas, {
    type:'line',
    data:{
      labels:series.map(item => item.season),
      datasets:[{
        label:'Score global',
        data:series.map(item => item.score),
        borderColor:getPlayerTone(pid),
        backgroundColor:'rgba(24,95,165,0.08)',
        fill:true,
        tension:0.32,
        pointRadius:3,
        pointHoverRadius:4
      }]
    },
    options:{
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ color:'#5e5b54' }, grid:{ display:false } },
        y:{ min:0, max:100, ticks:{ color:'#5e5b54', callback:value => value + '%' }, grid:{ color:'rgba(0,0,0,0.08)' } }
      }
    }
  });
}

const MODAL_TITLES = { standings:'Classements', upcoming:'Matchs à venir', past:'Résultats' };
const MODAL_HINTS = {
  standings:`[ { "team": "U13 A", "rank": "3e", "points": 24, "played": 14 }, ... ]`,
  upcoming:`[ { "date": "30/04/2026", "team": "U13 A", "opponent": "Laval FC", "competition": "Championnat" }, ... ]`,
  past:`[ { "date": "23/04/2026", "team": "U13 A", "opponent": "Laval FC", "score": "3 - 1", "competition": "Championnat" }, ... ]`
};
const MODAL_DEFAULTS = {
  standings:[
    { team:'U13 A', rank:'1er', points:28, played:14 },
    { team:'U13 B', rank:'5e', points:18, played:14 }
  ],
  upcoming:[
    { date:'30/04/2026', team:'U13 A', opponent:'Laval FC', competition:'Championnat District' }
  ],
  past:[
    { date:'23/04/2026', team:'U13 A', opponent:'Laval FC', score:'3 - 1', competition:'Championnat District' }
  ]
};

function renderModalOverlay() {
  if (!activeModal) return '';
  const { type, cat } = activeModal;
  const manual = loadManualFeeds();
  const current = manual[cat]?.[type];
  const value = JSON.stringify(current || MODAL_DEFAULTS[type], null, 2);
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-box">
        <div class="modal-head">
          <div>
            <div class="card-kicker">${h(CAT_LABELS[cat])}</div>
            <h3>${MODAL_TITLES[type]}</h3>
          </div>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="Fermer">×</button>
        </div>
        <p class="modal-hint">Format JSON — <code>${h(MODAL_HINTS[type])}</code></p>
        <textarea id="modal-input" class="modal-textarea" rows="12" spellcheck="false">${h(value)}</textarea>
        <div class="modal-footer">
          ${current ? `<button class="btn-ghost btn-danger" type="button" data-action="clear-modal" data-modal-type="${type}" data-modal-cat="${cat}">Effacer</button>` : ''}
          <span style="flex:1"></span>
          <button class="btn-ghost" type="button" data-action="close-modal">Annuler</button>
          <button class="btn-primary" type="button" data-action="save-modal" data-modal-type="${type}" data-modal-cat="${cat}">Enregistrer</button>
        </div>
      </div>
    </div>`;
}

function renderModal() {
  let el = q('#modal-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-root';
    document.body.appendChild(el);
  }
  el.innerHTML = renderModalOverlay();
}

function renderAll() {
  q('.main-layout').classList.toggle('dashboard-mode', state.view === 'dashboard');
  renderPrimaryNav();
  renderSeasonOptions();
  renderSidebar();
  renderMain();
  q('#sb-search').value = state.search;
  q('#refresh-btn').textContent = state.remoteStatus === 'refreshing' ? 'Actualisation...' : 'Actualiser';
  q('#refresh-btn').disabled = state.remoteStatus === 'refreshing';
  renderModal();
}

function updateProfileField(field, value) {
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer].profil[field] = value;
  schedulePersist();
}

function setFoot(value) {
  updateProfileField('pied', value);
  renderAll();
}

function updateObj(index, value) {
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer].profil.objectifs[index] = value;
  schedulePersist();
}

function addObj() {
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer].profil.objectifs.push('');
  schedulePersist();
  renderMain();
}

function deleteObj(index) {
  ensureData(state.cat, state.selPlayer, state.season);
  const objectifs = state.data[state.cat][state.selPlayer].profil.objectifs;
  objectifs.splice(index, 1);
  if (!objectifs.length) objectifs.push('');
  schedulePersist();
  renderMain();
}

function setRating(pillarKey, index, value) {
  ensureData(state.cat, state.selPlayer, state.season);
  const seasonData = state.data[state.cat][state.selPlayer][state.season];
  if (!seasonData.ratings[pillarKey]) seasonData.ratings[pillarKey] = [];
  seasonData.ratings[pillarKey][index] = seasonData.ratings[pillarKey][index] === value ? 0 : value;
  schedulePersist('Note mise a jour');
  renderAll();
}

function setCritComment(pillarKey, index, value) {
  ensureData(state.cat, state.selPlayer, state.season);
  const seasonData = state.data[state.cat][state.selPlayer][state.season];
  if (!seasonData.critComments[pillarKey]) seasonData.critComments[pillarKey] = [];
  seasonData.critComments[pillarKey][index] = value;
  schedulePersist();
}

function setMainComment(value) {
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer][state.season].comments.main = value;
  schedulePersist();
}

function setSelfComment(value) {
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer][state.season].comments.self = value;
  schedulePersist();
}

function savePlayerNow() {
  saveAppState();
  updateSaveHints('Sauvegarde effectuee', true);
  showToast('Sauvegarde effectuee');
}

function clearPlayerPhoto() {
  if (!state.selPlayer) return;
  ensureData(state.cat, state.selPlayer, state.season);
  state.data[state.cat][state.selPlayer].profil.photo = null;
  schedulePersist();
  renderAll();
}

function uploadPhoto(file) {
  if (!file || !state.selPlayer) return;
  const reader = new FileReader();
  reader.onload = event => {
    ensureData(state.cat, state.selPlayer, state.season);
    state.data[state.cat][state.selPlayer].profil.photo = event.target?.result || null;
    schedulePersist('Photo mise a jour');
    renderAll();
    showToast('Photo mise a jour');
  };
  reader.readAsDataURL(file);
}

function generateReport() {
  if (!state.selPlayer) return;
  const pid = state.selPlayer;
  const prof = getProf(pid);
  const score = pScore(state.cat, pid);
  const profile = getProfile(pid);
  const level = getLevel(score);
  const progress = getProgress(pid);
  const strongest = strongestPillar(pid);
  const weakest = getMainWeakness(pid);
  const gap = getGapToIdeal(pid);
  const seasonData = state.data[state.cat][pid][state.season];
  const objectiveList = (prof.objectifs || []).filter(Boolean);
  const insights = getInsights(pid);

  const content = `
    <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Bilan ${h(pid)}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#222;line-height:1.5}h1{margin:0 0 4px}h2{margin:24px 0 8px;border-bottom:1px solid #ccc;padding-bottom:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.box{margin:8px 0;padding:10px 12px;background:#f7f7f7;border-radius:8px}ul{margin-left:18px}</style>
    </head><body>
      <h1>${h((prof.prenom && prof.nom) ? prof.prenom + ' ' + prof.nom : pid)}</h1>
      <div>${h(CAT_LABELS[state.cat])} - Saison ${h(state.season)}</div>
      <h2>Vue d ensemble</h2>
      <div class="grid">
        <div class="box"><strong>Score global:</strong> ${score}%</div>
        <div class="box"><strong>Niveau:</strong> ${h(level)}</div>
        <div class="box"><strong>Profil:</strong> ${h(profile)}</div>
        <div class="box"><strong>Progression:</strong> ${progress ? h(progress.text) : '-'}</div>
        <div class="box"><strong>Point fort:</strong> ${strongest ? h(strongest.label + ' (' + strongest.score + '%)') : '-'}</div>
        <div class="box"><strong>Priorite:</strong> ${weakest ? h(weakest.label + ' (' + weakest.score + '%)') : '-'}</div>
      </div>
      <h2>Insights automatiques</h2>
      ${insights.length ? `<ul>${insights.map(item => `<li>${h(item.text)}</li>`).join('')}</ul>` : '<div class="box">Aucun insight disponible.</div>'}
      <h2>Informations joueur</h2>
      <div class="grid">
        <div class="box"><strong>Poste principal:</strong> ${h(prof.poste1 || '-')}</div>
        <div class="box"><strong>Poste secondaire:</strong> ${h(prof.poste2 || '-')}</div>
        <div class="box"><strong>Pied fort:</strong> ${h(prof.pied || '-')}</div>
        <div class="box"><strong>Taille / Poids:</strong> ${h(prof.taille || '-')} cm / ${h(prof.poids || '-')} kg</div>
      </div>
      <h2>Axes de lecture</h2>
      <div class="box"><strong>Commentaires entraineur:</strong><br>${h(seasonData.comments?.main || '-')}</div>
      <div class="box"><strong>Auto-evaluation joueur:</strong><br>${h(seasonData.comments?.self || '-')}</div>
      <h2>Objectifs</h2>
      ${objectiveList.length ? `<ul>${objectiveList.map(item => `<li>${h(item)}</li>`).join('')}</ul>` : '<div class="box">Aucun objectif renseigne.</div>'}
      <h2>Ecart au poste</h2>
      <div class="box">${gap ? Object.entries(gap).map(([key, value]) => `${h(key)} : ${value.toFixed(1)}`).join('<br>') : 'Poste principal non defini'}</div>
    </body></html>`;

  const reportWindow = window.open('', '_blank');
  if (!reportWindow) { showToast('Le navigateur a bloque l ouverture du bilan'); return; }
  reportWindow.document.open();
  reportWindow.document.write(content);
  reportWindow.document.close();
  setTimeout(() => reportWindow.print(), 300);
}

function exportData() {
  const payload = { exportedAt: new Date().toISOString(), app: 'carnet-formation-football', version: 2, data: state.data };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'carnet-foot-' + state.season + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export JSON termine');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const parsed = JSON.parse(event.target?.result || '{}');
      const nextData = parsed.data || parsed;
      ['u13','u11','u9'].forEach(cat => {
        if (!state.data[cat]) state.data[cat] = {};
        if (nextData[cat] && typeof nextData[cat] === 'object') Object.assign(state.data[cat], nextData[cat]);
      });
      saveAppState();
      renderAll();
      showToast('Import JSON reussi');
    } catch (error) {
      console.error(error);
      showToast('Import impossible');
    }
  };
  reader.readAsText(file);
}

function loadAll() {
  state.remoteSources = createInitialRemoteSources();
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state.data = { u13: parsed.u13 || {}, u11: parsed.u11 || {}, u9: parsed.u9 || {} };
    }
  } catch (error) {
    console.error(error);
  }

  ['u13','u11','u9'].forEach(cat => {
    JDATA[cat].players.forEach(player => ensureData(cat, player.name, state.season));
  });

  renderAll();
  loadGithubFeeds();
  if (supabaseApi && supabaseApi.isConfigured()) {
    state.remoteStatus = 'refreshing';
    renderAll();
    loadSupabaseDashboardData()
      .then(() => {
        state.remoteStatus = 'idle';
        renderAll();
        showToast('Supabase connecte');
      })
      .catch(error => {
        console.error(error);
        state.remoteStatus = 'idle';
        renderAll();
        showToast('Lecture Supabase impossible');
      });
  }
}

// Exposer les utilitaires pour les modules externes
window.appUtils = {
  h, q, qq, showToast, schedulePersist,
  renderMain, renderAll, saveAppState
};

// Listener dédié aux actions des modules (data-seance-action, data-obs-action, etc.)
document.addEventListener('click', event => {
  const mt = event.target.closest('[data-seance-action],[data-obs-action],[data-educator-action],[data-obs-dim],[data-roster-action],[data-postmatch-action],[data-feeds-action],[data-attendance-action],[data-injury-action]');
  if (!mt) return;
  // Les <select>, <input>, <textarea> gèrent leurs propres événements (change / input).
  // Sans ce skip, cliquer sur un select déclenche le handler avec value="" et ferme le menu.
  if (mt.tagName === 'SELECT' || mt.tagName === 'INPUT' || mt.tagName === 'TEXTAREA') return;
  if (mt.dataset.seanceAction     && window.SeanceModule?.handleAction(mt))     return;
  if (mt.dataset.obsAction        && window.ObsModule?.handleAction(mt))        return;
  if (mt.dataset.educatorAction   && window.EducatorModule?.handleAction(mt))   return;
  if (mt.dataset.rosterAction     && window.RosterModule?.handleAction(mt))     return;
  if (mt.dataset.postmatchAction  && window.PostMatchModule?.handleAction(mt))  return;
  if (mt.dataset.feedsAction      && window.FeedsFormModule?.handleAction(mt))  return;
  if (mt.dataset.attendanceAction && window.AttendanceModule?.handleAction(mt)) return;
  if (mt.dataset.injuryAction     && window.InjuryModule?.handleAction(mt))     return;
  if (mt.dataset.obsDim)            window.ObsModule?.handleDimClick(mt);
});

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  // Idem : on laisse passer click sur les selects/inputs/textarea pour qu'ils ouvrent leur menu.
  if (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  const action = target.dataset.action;

  if (action === 'set-view') {
    const next = target.dataset.view;
    if (next === 'player')      state.view = state.selPlayer ? 'player' : 'categories';
    else if (next === 'team')   { state.view = 'team'; state.selTeam = null; }
    else                         state.view = next;
    if (state.view !== 'player') state.selPlayer = null;
    if (state.view !== 'team')   state.selTeam = null;
    renderAll();
    return;
  }

  if (action === 'open-team') {
    state.view = 'team';
    state.selTeam = target.dataset.team || null;
    renderAll();
    return;
  }

  // Sélection joueur depuis le dashboard direction (change aussi de catégorie)
  if (action === 'select-player-cat') {
    const cat = target.dataset.cat;
    const pid = target.dataset.player;
    if (cat) state.cat = cat;
    state.selPlayer = pid;
    state.view = 'player';
    state.selSection = 'profil';
    state.selPillar = 0;
    renderAll();
    return;
  }

  if (action === 'quick-score') {
    const cat  = target.dataset.cat || state.cat;
    const date = target.dataset.date || '';
    const team = target.dataset.team || '';
    const opp  = target.dataset.opponent || '';
    const label = (team && opp) ? `${team} vs ${opp} (${date})` : `${date}`;
    const score = prompt(`Score final pour : ${label}\n\nFormat : "2-1" (équipe à domicile - équipe à l'extérieur)`, '');
    if (score == null) return;
    const trimmed = score.trim();
    if (!trimmed) return;
    const m = trimmed.match(/^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/);
    if (!m) { showToast('Format invalide. Ex : 2-1'); return; }
    const normalized = `${m[1]} - ${m[2]}`;
    saveScoreOverride(cat, date, team, opp, normalized);
    showToast('Score enregistré : ' + normalized);
    renderAll();
    return;
  }

  if (action === 'snapshot-morpho') {
    if (!state.selPlayer) return;
    const prof = getProf(state.selPlayer);
    const taille = Number(prof.taille) || null;
    const poids  = Number(prof.poids)  || null;
    if (!taille && !poids) { showToast('Renseigne d\'abord taille ou poids'); return; }
    if (!Array.isArray(prof.history)) prof.history = [];
    const today = new Date().toISOString().split('T')[0];
    const imc = (taille && poids) ? +(poids / Math.pow(taille / 100, 2)).toFixed(1) : null;
    // Remplace la mesure du jour si elle existe déjà
    const idx = prof.history.findIndex(m => m.date === today);
    const entry = { date: today, taille, poids, imc };
    if (idx >= 0) prof.history[idx] = entry; else prof.history.push(entry);
    schedulePersist('Mesure enregistrée');
    showToast('Mesure du jour enregistrée');
    renderMain();
    return;
  }
  if (action === 'remove-morpho') {
    if (!state.selPlayer) return;
    const prof = getProf(state.selPlayer);
    if (!Array.isArray(prof.history)) return;
    const d = target.dataset.date;
    const idx = prof.history.findIndex(m => m.date === d);
    if (idx >= 0) {
      prof.history.splice(idx, 1);
      schedulePersist('Mesure supprimée');
      showToast('Mesure supprimée');
      renderMain();
    }
    return;
  }
  if (action === 'back-teams') {
    state.selTeam = null;
    renderAll();
    return;
  }
  if (action === 'open-team-compo') {
    showToast('Composition d\'équipe : à venir');
    return;
  }

  if (action === 'open-category' || action === 'switch-category') {
    state.cat = target.dataset.cat;
    state.selPlayer = null;
    state.view = 'categories';
    state.comparePlayer = '';
    renderAll();
    return;
  }

  if (action === 'set-filter') {
    state.filt = target.dataset.filter;
    renderSidebar();
    return;
  }

  if (action === 'select-player') {
    state.selPlayer = target.dataset.player;
    state.view = 'player';
    state.selSection = 'profil';
    state.selPillar = 0;
    renderAll();
    return;
  }

  if (action === 'back-to-category') {
    state.view = 'categories';
    renderAll();
    return;
  }

  if (action === 'set-section') { state.selSection = target.dataset.section; renderMain(); return; }
  if (action === 'set-view-mode') { state.viewMode = target.dataset.viewMode; renderMain(); return; }
  if (action === 'set-pillar') { state.selPillar = Number(target.dataset.index); renderMain(); return; }
  if (action === 'set-foot') { setFoot(target.dataset.value); return; }
  if (action === 'add-obj') { addObj(); return; }
  if (action === 'delete-obj') { deleteObj(Number(target.dataset.index)); return; }
  if (action === 'set-rating') { setRating(target.dataset.pillar, Number(target.dataset.index), Number(target.dataset.value)); return; }
  if (action === 'save-player') { savePlayerNow(); return; }
  if (action === 'print-report') {
    if (window.PDFModule) window.PDFModule.generate(state.selPlayer);
    else generateReport();
    return;
  }
  if (action === 'clear-player-photo') { clearPlayerPhoto(); return; }

  if (action === 'open-modal') {
    const type = target.dataset.modalType;
    const cat = target.dataset.modalCat;
    // Délégation : le module FeedsForm gère son propre cycle (UI tabulaire)
    if (window.FeedsFormModule?.openModal && ['standings', 'upcoming', 'past'].includes(type)) {
      window.FeedsFormModule.openModal(type, cat);
      return;
    }
    activeModal = { type, cat };
    renderModal();
    return;
  }

  if (action === 'close-modal') {
    activeModal = null;
    renderModal();
    return;
  }

  // Menu actions secondaires (Importer JSON / Exporter JSON / Imprimer)
  if (action === 'trigger-import') {
    toggleMoreMenu(false);
    q('#import-file').click();
    return;
  }
  if (action === 'trigger-export-json') {
    toggleMoreMenu(false);
    exportData();
    return;
  }
  if (action === 'trigger-print') {
    toggleMoreMenu(false);
    window.print();
    return;
  }

  // Effectif
  if (action === 'open-roster-create') {
    window.RosterModule?.openCreate?.(target.dataset.cat || state.cat);
    return;
  }
  if (action === 'open-roster-manage') {
    window.RosterModule?.openManage?.(target.dataset.cat || state.cat);
    return;
  }

  // Saisie post-match
  if (action === 'open-postmatch') {
    window.PostMatchModule?.open?.(target.dataset.cat || state.cat);
    return;
  }

  // Tri tableau catégorie
  if (action === 'sort-cat-table') {
    const key = target.dataset.sortKey;
    if (state.sortBy === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortBy = key; state.sortDir = 'desc'; }
    renderMain();
    return;
  }

  // Filtres avancés sidebar
  if (action === 'set-poste-filter') { state.filtPoste = target.dataset.poste || ''; renderSidebar(); return; }
  if (action === 'set-pied-filter')  { state.filtPied  = target.dataset.pied  || ''; renderSidebar(); return; }
  if (action === 'toggle-sort')      {
    if (state.sortBy === target.dataset.sortKey) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortBy = target.dataset.sortKey; state.sortDir = 'desc'; }
    renderSidebar();
    return;
  }
  if (action === 'reset-filters') {
    state.filt = 'tous';
    state.filtPoste = '';
    state.filtPied = '';
    state.sortBy = 'name';
    state.sortDir = 'asc';
    state.search = '';
    q('#sb-search').value = '';
    renderSidebar();
    return;
  }

  if (action === 'save-modal') {
    const raw = q('#modal-input')?.value || '';
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not array');
      const all = loadManualFeeds();
      if (!all[activeModal.cat]) all[activeModal.cat] = {};
      all[activeModal.cat][activeModal.type] = parsed;
      saveManualFeeds(all);
      activeModal = null;
      renderAll();
      showToast('Données enregistrées');
    } catch {
      showToast('Format JSON invalide — vérifie la syntaxe');
    }
    return;
  }

  if (action === 'clear-modal') {
    const all = loadManualFeeds();
    if (all[target.dataset.modalCat]) {
      delete all[target.dataset.modalCat][target.dataset.modalType];
      if (!Object.keys(all[target.dataset.modalCat]).length) delete all[target.dataset.modalCat];
    }
    saveManualFeeds(all);
    activeModal = null;
    renderAll();
    showToast('Données effacées');
    return;
  }
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'sb-search') { state.search = target.value; renderList(); return; }
  if (target.dataset.field) {
    updateProfileField(target.dataset.field, target.value);
    if (['poste1', 'poste2', 'prenom', 'nom', 'taille', 'poids'].includes(target.dataset.field)) renderMain();
    renderList();
    return;
  }
  if (target.dataset.action === 'update-obj') { updateObj(Number(target.dataset.index), target.value); return; }
  if (target.dataset.action === 'set-crit-comment') { setCritComment(target.dataset.pillar, Number(target.dataset.index), target.value); return; }
  if (target.dataset.action === 'set-main-comment') { setMainComment(target.value); return; }
  if (target.dataset.action === 'set-self-comment') { setSelfComment(target.value); }
});

q('#season-sel').addEventListener('change', event => {
  state.season = event.target.value;
  if (state.selPlayer) ensureData(state.cat, state.selPlayer, state.season);
  renderAll();
});

q('#refresh-btn').addEventListener('click', () => { refreshRemoteData(); });

q('#export-xlsx-btn')?.addEventListener('click', () => {
  if (state.view === 'dashboard') window.ExcelExportModule?.exportAll?.(state.season);
  else window.ExcelExportModule?.exportCategory?.(state.cat, state.season);
});

function toggleMoreMenu(force) {
  const btn = q('#more-actions-btn');
  const menu = q('#more-menu');
  if (!btn || !menu) return;
  const next = force !== undefined ? force : menu.hidden;
  if (next) { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  else      { menu.hidden = true;  btn.setAttribute('aria-expanded', 'false'); }
}
q('#more-actions-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleMoreMenu(); });
document.addEventListener('click', e => {
  const menu = q('#more-menu');
  if (!menu || menu.hidden) return;
  if (!e.target.closest('#more-menu') && !e.target.closest('#more-actions-btn')) toggleMoreMenu(false);
});

q('#season-sel').addEventListener('change', event => {
  state.season = event.target.value;
  if (state.selPlayer) ensureData(state.cat, state.selPlayer, state.season);
  renderAll();
});

q('#refresh-btn').addEventListener('click', () => { refreshRemoteData(); });

q('#export-xlsx-btn')?.addEventListener('click', () => {
  if (state.view === 'dashboard') window.ExcelExportModule?.exportAll?.(state.season);
  else window.ExcelExportModule?.exportCategory?.(state.cat, state.season);
});

q('#search-clear').addEventListener('click', () => {
  state.search = '';
  q('#sb-search').value = '';
  renderList();
});

q('#import-file').addEventListener('change', event => {
  importData(event.target.files?.[0]);
  event.target.value = '';
});

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'compare-select') { state.comparePlayer = target.value; renderMain(); return; }
  if (target.id === 'photo-input') { uploadPhoto(target.files?.[0]); target.value = ''; return; }
  if (target.dataset?.action === 'set-poste-filter-select') {
    state.filtPoste = target.value || '';
    renderSidebar();
    return;
  }
});

loadAll();

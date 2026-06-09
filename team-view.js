/**
 * team-view.js — Vue Équipe : bilan saison, top performances, compo, comparaison.
 *
 * Une équipe est définie par (cat, teamLabel). Les joueurs d'une équipe sont
 * ceux dont `profil.team === teamLabel`. Les matchs d'une équipe sont dérivés
 * des observations match de ses joueurs, groupées par (date_match, adversaire,
 * domicile).
 *
 * Expose : window.TeamModule.{
 *   listTeams(cat)               -> ['U13 A', 'U13 B', …]
 *   teamPlayers(cat, team)       -> [playerName, …]
 *   teamMatches(cat, team, season) -> [{ key, date, adversaire, domicile,
 *                                        score, ourGoals, theirGoals,
 *                                        result: 'W'|'D'|'L', obs: [...] }]
 *   teamSummary(cat, team, season) -> { played, won, draw, lost, gf, ga,
 *                                       goalDiff, streak, points, leaders }
 *   renderListBody(cat)          -> HTML vue liste équipes
 *   renderTeamBody(cat, team)    -> HTML page équipe
 *   renderCompare(cat)           -> HTML comparaison de toutes les équipes
 *   handleAction(target)         -> bool
 * }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const state = () => window.appState;
  const utils = () => window.appUtils;
  const CAT_LABELS = () => window.CAT_LABELS || {};
  const club = () => window.CLUB_DATA;

  /* ── Equipes / joueurs ────────────────────────────────── */

  function listTeams(cat) {
    return (club()?.categories?.[cat]?.teams) || [];
  }

  function teamPlayers(cat, team) {
    if (!team) return [];
    const players = window.JDATA?.[cat]?.players || [];
    return players.filter(p => state()?.data?.[cat]?.[p.name]?.profil?.team === team).map(p => p.name);
  }

  function unassignedPlayers(cat) {
    const players = window.JDATA?.[cat]?.players || [];
    return players.filter(p => !state()?.data?.[cat]?.[p.name]?.profil?.team).map(p => p.name);
  }

  /* ── Matchs dérivés ───────────────────────────────────── */

  function matchKey(o) {
    return [o.date_match || '?', (o.adversaire || '').trim().toLowerCase(), o.domicile === false ? 'A' : 'H'].join('|');
  }

  function parseScore(score, domicile) {
    if (!score) return null;
    const m = String(score).match(/(\d+)\s*[-–:]\s*(\d+)/);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (isNaN(a) || isNaN(b)) return null;
    // Convention : "a-b" = "domicile-extérieur"
    const isHome = domicile !== false;
    const ourGoals   = isHome ? a : b;
    const theirGoals = isHome ? b : a;
    return { ourGoals, theirGoals };
  }

  function teamMatches(cat, team, season) {
    if (!team) return [];
    const playerNames = teamPlayers(cat, team);
    const map = new Map();
    playerNames.forEach(pid => {
      const obsList = state()?.data?.[cat]?.[pid]?.observations?.[season] || [];
      obsList.forEach(o => {
        // Filtre par team : si obs.team set et différent, on skip
        if (o.team && o.team !== team) return;
        const k = matchKey(o);
        if (!map.has(k)) map.set(k, { obs: [], dates: new Set() });
        const m = map.get(k);
        m.obs.push({ ...o, pid });
        if (o.date_match) m.dates.add(o.date_match);
      });
    });
    const matches = Array.from(map.entries()).map(([key, v]) => {
      const ref = v.obs[0];
      const sc = parseScore(ref.score_match, ref.domicile);
      let result = null;
      if (sc) {
        if (sc.ourGoals > sc.theirGoals) result = 'W';
        else if (sc.ourGoals < sc.theirGoals) result = 'L';
        else result = 'D';
      }
      return {
        key,
        date: ref.date_match || '',
        adversaire: ref.adversaire || '',
        domicile: ref.domicile !== false,
        competition: ref.competition || '',
        score: ref.score_match || '',
        ourGoals: sc?.ourGoals ?? null,
        theirGoals: sc?.theirGoals ?? null,
        result,
        obs: v.obs,
      };
    });
    matches.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return matches;
  }

  /* ── Synthèse ─────────────────────────────────────────── */

  // Charge les résultats FFF scrapés pour une équipe (cat + label)
  function fffMatchesForTeam(cat, teamLabel) {
    if (!teamLabel) return [];
    let feeds = {};
    try { feeds = JSON.parse(localStorage.getItem('cfb6_feeds') || '{}') || {}; } catch {}
    const f = feeds[cat];
    if (!f?.past) return [];
    return f.past.filter(m => {
      if (!m) return false;
      if (m.team && String(m.team) === teamLabel) return true;
      const lbl = teamLabel.toLowerCase();
      if (m.home && String(m.home).toLowerCase().includes(lbl)) return true;
      if (m.away && String(m.away).toLowerCase().includes(lbl)) return true;
      return false;
    });
  }

  // Renvoie true si c'est notre club (LSCA / LOUVERNE) qui joue à domicile dans ce match
  function isOurClubHome(m) {
    const home = String(m.home || '').toUpperCase();
    return home.includes('LSCA') || home.includes('LOUVERNE') || home.includes('LOUVERNÉ');
  }

  // Convertit un match FFF en stats { result, ourGoals, theirGoals }
  function fffResultFor(m) {
    if (!m?.score || m.score === '-') return null;
    const mt = String(m.score).match(/(\d+)\s*[-–:]\s*(\d+)/);
    if (!mt) return null;
    const a = parseInt(mt[1], 10);
    const b = parseInt(mt[2], 10);
    if (isNaN(a) || isNaN(b)) return null;
    const homeUs = isOurClubHome(m);
    const ourGoals   = homeUs ? a : b;
    const theirGoals = homeUs ? b : a;
    let result;
    if (ourGoals > theirGoals) result = 'W';
    else if (ourGoals < theirGoals) result = 'L';
    else result = 'D';
    return {
      key: 'fff|' + (m.date || '') + '|' + (m.team || ''),
      date: m.date || '',
      adversaire: homeUs ? (m.away || '?') : (m.home || '?'),
      domicile: homeUs,
      competition: m.competition || '',
      score: m.score,
      ourGoals, theirGoals, result,
      source: 'fff',
      obs: [],
    };
  }

  function teamSummary(cat, team, season) {
    // Source 1 : observations match saisies (avec stats individuelles buteurs/passeurs)
    const obsMatches = teamMatches(cat, team, season);
    // Source 2 : résultats FFF scrapés
    const fffMatchesRaw = fffMatchesForTeam(cat, team);
    const fffMatches = fffMatchesRaw.map(fffResultFor).filter(Boolean);

    // Fusion par clé date+adversaire pour éviter les doublons
    const byKey = new Map();
    obsMatches.forEach(m => {
      const k = (m.date || '') + '|' + (m.adversaire || '').toLowerCase();
      byKey.set(k, { ...m });
    });
    fffMatches.forEach(m => {
      const k = (m.date || '') + '|' + (m.adversaire || '').toLowerCase();
      if (byKey.has(k)) {
        // Compléter l'observation existante avec le score FFF si manquant
        const existing = byKey.get(k);
        if (!existing.result && m.result) {
          existing.result = m.result;
          existing.ourGoals = m.ourGoals;
          existing.theirGoals = m.theirGoals;
          existing.score = m.score;
          existing.source = 'merged';
        }
      } else {
        byKey.set(k, m);
      }
    });

    const matches = Array.from(byKey.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let won = 0, draw = 0, lost = 0, gf = 0, ga = 0;
    matches.forEach(m => {
      if (m.result === 'W') won++;
      else if (m.result === 'D') draw++;
      else if (m.result === 'L') lost++;
      if (m.ourGoals != null)  gf += m.ourGoals;
      if (m.theirGoals != null) ga += m.theirGoals;
    });

    // Série en cours (matchs en partant du plus récent ; arrêter au premier autre résultat)
    let streak = { kind: null, count: 0 };
    for (const m of matches) {
      if (!m.result) continue;
      if (!streak.kind) { streak.kind = m.result; streak.count = 1; }
      else if (streak.kind === m.result) streak.count++;
      else break;
    }

    // Leaders : top buteurs / passeurs / notes
    const perPlayer = new Map();
    matches.forEach(m => {
      m.obs.forEach(o => {
        if (!perPlayer.has(o.pid)) perPlayer.set(o.pid, { matches: 0, buts: 0, passes_d: 0, minutes: 0, notes: [] });
        const r = perPlayer.get(o.pid);
        r.matches++;
        r.buts     += Number(o.stats?.buts) || 0;
        r.passes_d += Number(o.stats?.passes_d) || 0;
        r.minutes  += Number(o.temps_jeu) || 0;
        if (o.note_match != null && o.note_match !== '') r.notes.push(Number(o.note_match));
      });
    });
    const leaders = Array.from(perPlayer.entries()).map(([pid, r]) => ({
      pid, ...r,
      noteAvg: r.notes.length ? +(r.notes.reduce((a, b) => a + b, 0) / r.notes.length).toFixed(2) : null,
      implications: r.buts + r.passes_d,
    }));

    const topButeurs   = leaders.filter(l => l.buts > 0).sort((a, b) => b.buts - a.buts).slice(0, 5);
    const topPasseurs  = leaders.filter(l => l.passes_d > 0).sort((a, b) => b.passes_d - a.passes_d).slice(0, 5);
    const topNotes     = leaders.filter(l => l.noteAvg != null).sort((a, b) => b.noteAvg - a.noteAvg).slice(0, 5);
    const topMinutes   = leaders.filter(l => l.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 10);

    return {
      matches,
      played: matches.filter(m => m.result).length,
      won, draw, lost,
      gf, ga,
      goalDiff: gf - ga,
      points: won * 3 + draw, // convention 3pts victoire
      streak,
      leaders, topButeurs, topPasseurs, topNotes, topMinutes,
      effectif: teamPlayers(cat, team).length,
    };
  }

  /* ── Rendu : liste des équipes ────────────────────────── */

  function renderListBody(cat) {
    const teams = listTeams(cat);
    const unassigned = unassignedPlayers(cat);

    const cards = teams.map(t => {
      const s = teamSummary(cat, t, state().season);
      const winPct = s.played ? Math.round((s.won / s.played) * 100) : 0;
      const streakLabel = s.streak.count
        ? (s.streak.kind === 'W' ? s.streak.count + ' V' : s.streak.kind === 'D' ? s.streak.count + ' N' : s.streak.count + ' D')
        : '—';
      const streakClass = s.streak.kind === 'W' ? 'streak-win' : s.streak.kind === 'D' ? 'streak-draw' : s.streak.kind === 'L' ? 'streak-loss' : '';
      return `
        <button class="team-card" type="button" data-action="open-team" data-team="${h(t)}">
          <div class="team-card-head">
            <strong>${h(t)}</strong>
            <span class="team-card-effectif">${s.effectif} joueur${s.effectif > 1 ? 's' : ''}</span>
          </div>
          <div class="team-card-stats">
            <div><span>Joués</span><strong>${s.played}</strong></div>
            <div><span>V/N/D</span><strong>${s.won}/${s.draw}/${s.lost}</strong></div>
            <div><span>BP – BC</span><strong>${s.gf} – ${s.ga}</strong></div>
            <div><span>Pts</span><strong>${s.points}</strong></div>
          </div>
          <div class="team-card-footer">
            <span class="team-winpct">${winPct}% victoires</span>
            <span class="team-streak ${streakClass}">${streakLabel}</span>
          </div>
        </button>`;
    }).join('');

    const unassignedBlock = unassigned.length ? `
      <section class="dashboard-card">
        <div class="card-head">
          <div><div class="card-kicker">À assigner</div><h2>Joueurs sans équipe (${unassigned.length})</h2></div>
        </div>
        <div class="unassigned-list">
          ${unassigned.slice(0, 30).map(pid =>
            `<button class="unassigned-chip" type="button" data-action="select-player" data-player="${h(pid)}">${h(pid)}</button>`
          ).join('')}
          ${unassigned.length > 30 ? `<span class="unassigned-more">+ ${unassigned.length - 30} autres</span>` : ''}
        </div>
        <p class="info-text">Ouvre la fiche d'un joueur et sélectionne son équipe principale dans « Profil sportif » pour qu'il apparaisse dans la vue Équipe.</p>
      </section>` : '';

    if (!teams.length) {
      return `<div class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Aucune équipe</div><h2>Pas d'équipes définies</h2></div></div>
        <p class="info-text">Aucune équipe n'est configurée pour la catégorie ${h(CAT_LABELS()[cat] || cat.toUpperCase())}.</p>
      </div>`;
    }

    return `
      <div class="team-list-grid">${cards}</div>
      ${unassignedBlock}
      ${renderCompareBlock(cat)}
    `;
  }

  /* ── Rendu : page équipe ──────────────────────────────── */

  function renderTeamBody(cat, team) {
    const s = teamSummary(cat, team, state().season);
    const players = teamPlayers(cat, team);
    const winPct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    const streakLabel = s.streak.count
      ? (s.streak.kind === 'W' ? s.streak.count + ' victoires d\'affilée' : s.streak.kind === 'D' ? s.streak.count + ' nuls' : s.streak.count + ' défaites d\'affilée')
      : 'Pas encore de série';
    const streakClass = s.streak.kind === 'W' ? 'streak-win' : s.streak.kind === 'D' ? 'streak-draw' : s.streak.kind === 'L' ? 'streak-loss' : '';

    return `
      <section class="team-shell">
        <div class="team-toolbar">
          <button class="btn" type="button" data-action="back-teams">← Retour aux équipes</button>
          <div class="toolbar-right">
            <button class="btn btn-primary" type="button" data-action="open-postmatch" data-cat="${cat}">+ Saisie post-match</button>
            <button class="btn" type="button" data-action="open-team-compo" data-team="${h(team)}">Composer l'équipe</button>
          </div>
        </div>

        <div class="team-hero">
          <div>
            <div class="card-kicker">Équipe</div>
            <h1>${h(team)}</h1>
            <p>Bilan saison ${h(state().season)} agrégé à partir des observations match des ${players.length} joueurs.</p>
          </div>
          <div class="team-hero-stats">
            <div class="dash-stat"><span>Matchs joués</span><strong>${s.played}</strong></div>
            <div class="dash-stat"><span>V — N — D</span><strong>${s.won} — ${s.draw} — ${s.lost}</strong></div>
            <div class="dash-stat"><span>Buts</span><strong>${s.gf} : ${s.ga}</strong></div>
            <div class="dash-stat"><span>Différence</span><strong>${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</strong></div>
            <div class="dash-stat"><span>% victoires</span><strong>${winPct}%</strong></div>
            <div class="dash-stat ${streakClass}"><span>Série en cours</span><strong>${h(streakLabel)}</strong></div>
          </div>
        </div>

        ${renderFFFSection(cat, team)}

        <div class="team-grid">
          ${renderLeadersCard('Top buteurs', s.topButeurs, 'buts')}
          ${renderLeadersCard('Top passeurs', s.topPasseurs, 'passes_d')}
          ${renderLeadersCard('Top notes', s.topNotes, 'noteAvg')}
          ${renderMinutesCard(s.topMinutes)}
          ${renderRecentMatchesCard(s.matches)}
          ${renderEffectifCard(players, cat)}
        </div>
      </section>`;
  }

  // Section FFF : classement + matchs à venir + résultats filtrés sur cette équipe
  function renderFFFSection(cat, teamLabel) {
    const utils = window.appUtils;
    if (!utils?.buildDashboardFeeds) return '';
    const feeds = utils.buildDashboardFeeds(cat);
    if (!feeds) return '';

    // Filtrer les matchs sur le label de l'équipe (présent dans m.team ou m.home/away)
    const matchesTeam = (m) => {
      if (!m) return false;
      const lbl = (teamLabel || '').toLowerCase();
      if (m.team && String(m.team).toLowerCase() === lbl) return true;
      if (m.home && String(m.home).toLowerCase().includes(lbl)) return true;
      if (m.away && String(m.away).toLowerCase().includes(lbl)) return true;
      return false;
    };

    const upcoming = (feeds.upcoming || []).filter(matchesTeam);
    const past = (feeds.past || []).filter(matchesTeam);
    // Le classement est partagé par toutes les équipes de la catégorie — on garde tel quel
    const standings = feeds.standings;

    // Si rien de pertinent, on cache la section
    if (!upcoming.length && !past.length && (!standings || !standings.length)) return '';

    return `
      <div class="team-fff-section">
        <h3 class="team-section-title">📡 Données FFF</h3>
        <div class="dashboard-main-grid">
          ${standings?.length ? utils.renderStandingsCard(standings) : ''}
          ${upcoming.length ? utils.renderMatchCard('Matchs à venir', `${teamLabel}`, upcoming.slice(0, 5), true) : ''}
          ${past.length ? utils.renderMatchCard('Résultats récents', `${teamLabel}`, past.slice(0, 8), false) : ''}
        </div>
      </div>
    `;
  }

  function renderLeadersCard(title, rows, key) {
    const body = rows.length
      ? `<table class="leader-table">
          <thead><tr><th></th><th>Joueur</th><th>${key === 'buts' ? 'Buts' : key === 'passes_d' ? 'Passes' : 'Note ⌀'}</th><th>M.</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `<tr>
              <td class="rank-cell">${i + 1}</td>
              <td><button class="player-link" type="button" data-action="select-player" data-player="${h(r.pid)}">${h(r.pid)}</button></td>
              <td><strong>${key === 'noteAvg' ? (r.noteAvg?.toFixed(1) ?? '—') : r[key]}</strong></td>
              <td>${r.matches}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : `<div class="dash-empty"><div class="dash-empty-msg">Pas encore de données</div></div>`;

    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Saison</div><h2>${h(title)}</h2></div></div>
      ${body}
    </section>`;
  }

  function renderMinutesCard(rows) {
    if (!rows.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Rotation</div><h2>Temps de jeu cumulé</h2></div></div>
        <div class="dash-empty"><div class="dash-empty-msg">Pas encore de minutes saisies</div>
        <div class="dash-empty-hint">Le temps de jeu se saisit dans les observations match.</div></div>
      </section>`;
    }
    const max = Math.max(...rows.map(r => r.minutes));
    return `<section class="dashboard-card span-2">
      <div class="card-head"><div><div class="card-kicker">Rotation / équité</div><h2>Temps de jeu cumulé</h2></div></div>
      <div class="minutes-list">
        ${rows.map(r => {
          const pct = max ? Math.round((r.minutes / max) * 100) : 0;
          return `<div class="minutes-row">
            <button class="minutes-name" type="button" data-action="select-player" data-player="${h(r.pid)}">${h(r.pid)}</button>
            <div class="minutes-bar-bg"><div class="minutes-bar-fill" style="width:${pct}%"></div></div>
            <span class="minutes-value">${r.minutes}′ <span class="minutes-meta">/ ${r.matches} m.</span></span>
          </div>`;
        }).join('')}
      </div>
      <p class="info-text">L'équité de la rotation : écart entre le joueur le plus utilisé et les autres.</p>
    </section>`;
  }

  function renderRecentMatchesCard(matches) {
    if (!matches.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Calendrier</div><h2>Derniers matchs</h2></div></div>
        <div class="dash-empty"><div class="dash-empty-msg">Aucun match observé</div></div>
      </section>`;
    }
    return `<section class="dashboard-card span-2">
      <div class="card-head"><div><div class="card-kicker">Calendrier</div><h2>Derniers matchs (${matches.length})</h2></div></div>
      <div class="team-matches-list">
        ${matches.slice(0, 10).map(m => {
          const dateStr = m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '—';
          const cls = m.result === 'W' ? 'fixture-win' : m.result === 'L' ? 'fixture-loss' : m.result === 'D' ? 'fixture-draw' : '';
          const badge = m.result === 'W' ? 'V' : m.result === 'L' ? 'D' : m.result === 'D' ? 'N' : '?';
          return `<div class="team-match-row ${cls}">
            <span class="tm-date">${h(dateStr)}</span>
            <span class="tm-loc">${m.domicile ? 'Dom.' : 'Ext.'}</span>
            <span class="tm-opp">vs ${h(m.adversaire || '—')}</span>
            <span class="tm-score">${h(m.score || '—')}</span>
            <span class="tm-badge">${badge}</span>
            <span class="tm-obs">${m.obs.length} obs.</span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }

function renderEffectifCard(players, cat) {
    if (!players.length) {
      return `<section class="dashboard-card team-card-section">
        <div class="card-head"><div><div class="card-kicker">Effectif</div><h2>Joueurs de l'equipe</h2></div></div>
        <div class="dash-empty"><div class="dash-empty-msg">Aucun joueur affecte a cette equipe.</div></div>
      </section>`;
    }
    return `
      <section class="dashboard-card team-card-section">
        <div class="card-head"><div><div class="card-kicker">Effectif</div><h2>${players.length} joueurs</h2></div></div>
        <ul class="team-effectif-list">
          ${players.map(pid => {
            const prof = state()?.data?.[cat]?.[pid]?.profil || {};
            const name = (prof.prenom && prof.nom) ? prof.prenom + ' ' + prof.nom : pid;
            const poste = prof.poste1 || '';
            return `<li>
              <button class="player-link" type="button" data-action="select-player" data-player="${h(pid)}">${h(name)}</button>
              ${poste ? `<span class="effectif-poste">${h(poste)}</span>` : ''}
            </li>`;
          }).join('')}
        </ul>
      </section>`;
  }

  /* ── Section FFF (classement + matchs filtres equipe) ─── */

  function renderFFFSection(cat, teamLabel) {
    const u = utils();
    if (!u?.buildDashboardFeeds) return '';
    const feeds = u.buildDashboardFeeds(cat);
    if (!feeds) return '';

    const matchesTeam = (m) => {
      if (!m) return false;
      const lbl = (teamLabel || '').toLowerCase();
      if (m.team && String(m.team).toLowerCase() === lbl) return true;
      if (m.home && String(m.home).toLowerCase().includes(lbl)) return true;
      if (m.away && String(m.away).toLowerCase().includes(lbl)) return true;
      return false;
    };

    const upcoming = (feeds.upcoming || []).filter(matchesTeam);
    const past = (feeds.past || []).filter(matchesTeam);
    const standings = feeds.standings;

    if (!upcoming.length && !past.length && (!standings || !standings.length)) return '';

    return `
      <div class="team-fff-section">
        <h3 class="team-section-title">FFF Donnees</h3>
        <div class="dashboard-main-grid">
          ${standings?.length ? u.renderStandingsCard(standings) : ''}
          ${upcoming.length ? u.renderMatchCard('Matchs a venir', teamLabel, upcoming.slice(0, 5), true) : ''}
          ${past.length ? u.renderMatchCard('Resultats recents', teamLabel, past.slice(0, 8), false) : ''}
        </div>
      </div>
    `;
  }

  /* ── Comparaison ────────────────────────────────────── */

  function renderCompareBlock(cat) {
    const teams = listTeams(cat);
    if (teams.length < 2) return '';

    const summaries = teams.map(t => ({ team: t, ...teamSummary(cat, t, state().season) }));
    const headers = ['Equipe', 'Effectif', 'Joues', 'V/N/D', 'BP-BC', 'Pts', '% V', 'Implic. totales'];
    return `
      <section class="dashboard-card cat-table-card">
        <div class="card-head">
          <div><div class="card-kicker">Comparaison</div><h2>Equipes de ${h(CAT_LABELS()[cat] || cat.toUpperCase())}</h2></div>
        </div>
        <div class="cat-table-wrap">
          <table class="cat-table compare-table">
            <thead><tr>${headers.map(hd => `<th>${h(hd)}</th>`).join('')}</tr></thead>
            <tbody>
              ${summaries.map(s => {
                const winPct = s.played ? Math.round((s.won / s.played) * 100) : 0;
                const implications = (s.gf || 0);
                return `<tr>
                  <td><strong>${h(s.team)}</strong></td>
                  <td>${s.effectif || 0}</td>
                  <td>${s.played}</td>
                  <td>${s.won}/${s.draw}/${s.lost}</td>
                  <td>${s.gf}-${s.ga}</td>
                  <td><strong>${s.points || 0}</strong></td>
                  <td>${winPct}%</td>
                  <td>${implications}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  window.TeamModule = {
    listTeams: listTeams,
    teamPlayers: teamPlayers,
    teamMatches: teamMatches,
    teamSummary: teamSummary,
    fffMatchesForTeam: fffMatchesForTeam,
    renderListBody: renderListBody,
    renderTeamBody: renderTeamBody,
    renderCompareBlock: renderCompareBlock,
  };
})();

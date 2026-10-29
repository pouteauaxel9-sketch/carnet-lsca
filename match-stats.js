/**
 * match-stats.js — Saisie des stats joueurs par match (post-match)
 *
 * Modal qui s'ouvre quand on clique sur un match passé dans "Calendrier FFF".
 * Permet de :
 *   - Cocher les joueurs qui ont participé (parmi l'effectif de l'équipe)
 *   - Saisir buts / passes / note pour chaque joueur coché
 *   - Ajouter des notes libres sur le match
 *
 * Stockage :
 *   state.data[cat][pid].matchStats[matchKey] = { buts, passes, note }
 *   state.data[cat]._matchNotes[matchKey] = "notes libres"
 *
 * matchKey = date|homeCode|awayCode (unique par match FFF)
 *
 * Expose : window.MatchStatsModule.{ openForMatch, close, handleAction,
 *          getStatsForPlayer, aggregatePlayerStats }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const utils = () => window.appUtils || {};
  const state = () => window.appState || {};

  /* ── Helpers ────────────────────────────────────────────── */

  function matchKey(m) {
    const d = (m.date || '').slice(0, 10);
    return `${d}|${m.homeCode || '?'}|${m.awayCode || '?'}`;
  }

  function listTeamPlayers(cat, teamLabel) {
    // Retourne la liste à plat (ordre : équipe courante → autres équipes → non assignés)
    return listTeamPlayersGrouped(cat, teamLabel).flatMap(g => g.players);
  }

  function listTeamPlayersGrouped(cat, teamLabel) {
    const data = state()?.data?.[cat] || {};
    const configTeams = (window.CLUB_DATA?.categories?.[cat]?.teams) || [];
    const byTeam = {};
    const unassigned = [];

    Object.keys(data).forEach(pid => {
      const prof = data[pid]?.profil;
      if (!prof || prof.left) return;
      const team = prof.team || '';
      if (!team) { unassigned.push(pid); return; }
      (byTeam[team] = byTeam[team] || []).push(pid);
    });

    const sortByName = arr => arr.sort((a, b) => {
      const pa = data[a]?.profil;
      const pb = data[b]?.profil;
      const na = ((pa?.prenom || '') + ' ' + (pa?.nom || a)).trim().toLowerCase();
      const nb = ((pb?.prenom || '') + ' ' + (pb?.nom || b)).trim().toLowerCase();
      return na.localeCompare(nb);
    });

    const groups = [];
    // 1) Équipe courante en premier
    if (byTeam[teamLabel]) {
      groups.push({ label: teamLabel, isCurrent: true, players: sortByName(byTeam[teamLabel]) });
      delete byTeam[teamLabel];
    }
    // 2) Autres équipes configurées de la cat, dans l'ordre CLUB_DATA
    configTeams.forEach(t => {
      if (t === teamLabel) return; // déjà ajoutée
      if (byTeam[t]?.length) {
        groups.push({ label: t, isCurrent: false, players: sortByName(byTeam[t]) });
        delete byTeam[t];
      }
    });
    // 3) Équipes "exotiques" (team pas dans CLUB_DATA)
    Object.keys(byTeam).forEach(t => {
      groups.push({ label: t, isCurrent: false, players: sortByName(byTeam[t]) });
    });
    // 4) Non assignés en dernier
    if (unassigned.length) {
      groups.push({ label: 'Sans équipe assignée', isCurrent: false, players: sortByName(unassigned) });
    }

    return groups;
  }

  function playerDisplayName(cat, pid) {
    const prof = state()?.data?.[cat]?.[pid]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }

  function ensurePlayer(cat, pid) {
    const s = state();
    if (!s.data[cat]) s.data[cat] = {};
    if (!s.data[cat][pid]) s.data[cat][pid] = {};
    if (!s.data[cat][pid].matchStats) s.data[cat][pid].matchStats = {};
    return s.data[cat][pid];
  }

  function getStatsForPlayer(cat, pid, mkey) {
    return state()?.data?.[cat]?.[pid]?.matchStats?.[mkey] || null;
  }

  // Agrège les stats de tous les matchs pour un joueur
  function aggregatePlayerStats(cat, pid) {
    const stats = state()?.data?.[cat]?.[pid]?.matchStats || {};
    let played = 0, buts = 0, passes = 0, notes = [];
    Object.values(stats).forEach(s => {
      if (s.played !== false) played++;
      buts   += (+s.buts || 0);
      passes += (+s.passes || 0);
      if (s.note != null && s.note !== '' && !isNaN(+s.note)) notes.push(+s.note);
    });
    const noteAvg = notes.length ? +(notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2) : null;
    return { played, buts, passes, noteAvg };
  }

  /* ── Modal ──────────────────────────────────────────────── */

  let modal = null;
  // modal = { cat, teamLabel, match, draft: { stats: { pid: {played, buts, passes, note} }, notes: '' } }

  function openForMatch(cat, teamLabel, match) {
    const mkey  = matchKey(match);
    const data  = state()?.data?.[cat] || {};
    const stats = {};
    listTeamPlayers(cat, teamLabel).forEach(pid => {
      const saved = data[pid]?.matchStats?.[mkey];
      stats[pid] = saved
        ? { played: saved.played !== false, buts: saved.buts || 0, passes: saved.passes || 0, minutes: saved.minutes || 0, note: saved.note ?? '' }
        : { played: false, buts: 0, passes: 0, minutes: 0, note: '' };
    });
    const savedNotes = state()?.data?.[cat]?._matchNotes?.[mkey] || '';
    modal = {
      cat, teamLabel, match,
      draft: { stats, notes: savedNotes },
    };
    render();
  }

  function close() {
    modal = null;
    render();
    utils().renderAll?.();
  }

  function render() {
    let el = document.querySelector('#match-stats-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'match-stats-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modal ? renderOverlay() : '';
  }

  function renderOverlay() {
    const m   = modal.match;
    const cat = modal.cat;
    const dt  = m.date ? new Date(m.date) : null;
    const dateStr = dt && !isNaN(dt) ? dt.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long' }) : '—';
    const CFG = window.TEAM_SOURCE_CONFIG || {};
    const myCode = Object.values(CFG).find(c => c.teamLabel === modal.teamLabel)?.key;
    // ourCode : on cherche LSCA LOUVERNE dans home ou away
    const isHome = /lsca|louverne/i.test(m.homeTeam);
    const myTeam = isHome ? m.homeTeam : m.awayTeam;
    const oppTeam = isHome ? m.awayTeam : m.homeTeam;
    const myScore = isHome ? m.homeScore : m.awayScore;
    const oppScore = isHome ? m.awayScore : m.homeScore;
    const result = (myScore != null && oppScore != null)
      ? (myScore > oppScore ? 'VICTOIRE' : myScore < oppScore ? 'DÉFAITE' : 'MATCH NUL')
      : '';
    const resultCls = (myScore != null && oppScore != null)
      ? (myScore > oppScore ? 'res-win' : myScore < oppScore ? 'res-loss' : 'res-draw')
      : '';

    const players = listTeamPlayers(cat, modal.teamLabel);
    const nbChecked = players.filter(p => modal.draft.stats[p]?.played).length;

    return `
      <div class="modal-overlay" data-ms-overlay>
        <div class="modal-box" style="max-width:760px;max-height:92vh;display:flex;flex-direction:column">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(dateStr)} · ${isHome ? '🏠 Domicile' : '✈ Extérieur'}</div>
              <h3>📊 ${h(myTeam)} ${myScore ?? '-'} - ${oppScore ?? '-'} ${h(oppTeam)}</h3>
              ${result ? `<div class="ms-result ${resultCls}">${result}</div>` : ''}
            </div>
            <button class="modal-close" type="button" data-ms-action="close">×</button>
          </div>

          <div class="ms-body" style="padding:16px 20px;overflow-y:auto;flex:1">
            <div class="ms-players-head">
              <h4 style="margin:0">👥 Joueurs ayant participé <span class="ms-count">${nbChecked}/${players.length}</span></h4>
              <div class="ms-players-actions">
                <button class="ps-btn" type="button" data-ms-action="all-played">Tout cocher</button>
                <button class="ps-btn" type="button" data-ms-action="none-played">Tout décocher</button>
              </div>
            </div>

            <div class="ms-players-grid">
              <div class="ms-grid-head">
                <span>JOUEUR</span>
                <span>MIN</span>
                <span>BUTS</span>
                <span>PASSES</span>
                <span>NOTE /10</span>
              </div>
              ${listTeamPlayersGrouped(cat, modal.teamLabel).map(g => `
                <div class="ms-group-head ${g.isCurrent ? 'ms-group-current' : ''}">
                  <span class="ms-group-label">${g.isCurrent ? '🏆 ' : ''}${h(g.label)} <span class="ms-group-count">(${g.players.length})</span></span>
                  <span class="ms-group-actions">
                    <button class="ps-btn" type="button" data-ms-action="group-all" data-group="${h(g.label)}">Tout cocher</button>
                    <button class="ps-btn" type="button" data-ms-action="group-none" data-group="${h(g.label)}">Tout décocher</button>
                  </span>
                </div>
                ${g.players.map(pid => renderPlayerRow(pid)).join('')}
              `).join('')}
            </div>

            <div class="ms-notes-block">
              <label class="field-label">📝 Notes libres sur le match</label>
              <textarea class="field-input" rows="3" placeholder="Belle maîtrise collective, défense solide, à retravailler : la relance..."
                        data-ms-action="set-notes">${h(modal.draft.notes)}</textarea>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" type="button" data-ms-action="close">Annuler</button>
            <span style="flex:1"></span>
            <button class="btn-primary" type="button" data-ms-action="save">💾 Enregistrer</button>
          </div>
        </div>
      </div>`;
  }

  function renderPlayerRow(pid) {
    const name = playerDisplayName(modal.cat, pid);
    const prof = state()?.data?.[modal.cat]?.[pid]?.profil || {};
    const photo = prof.photo || '';
    const initials = (prof.prenom || pid)[0]?.toUpperCase() + (prof.nom || '')[0]?.toUpperCase() || '?';
    const st   = modal.draft.stats[pid] || { played: false, buts: 0, passes: 0, minutes: 0, note: '' };
    const dis  = st.played ? '' : 'disabled';
    const cls  = st.played ? 'ms-row ms-row-on' : 'ms-row';
    const avatar = photo
      ? `<img class="ms-avatar" src="${h(photo)}" alt="">`
      : `<span class="ms-avatar ms-avatar-ini">${h(initials)}</span>`;
    return `
      <div class="${cls}" data-pid="${h(pid)}">
        <label class="ms-cell ms-cell-player">
          <input type="checkbox" ${st.played ? 'checked' : ''}
                 data-ms-action="toggle-played" data-pid="${h(pid)}">
          ${avatar}
          <span>${h(name)}</span>
        </label>
        <div class="ms-cell">
          <input type="number" min="0" max="120" value="${st.minutes || 0}"
                 placeholder="min" title="Minutes jouées"
                 data-ms-action="set" data-pid="${h(pid)}" data-field="minutes" ${dis}>
        </div>
        <div class="ms-cell">
          <button class="ms-dec" type="button" data-ms-action="dec" data-pid="${h(pid)}" data-field="buts" ${dis}>−</button>
          <input type="number" min="0" max="20" value="${st.buts || 0}"
                 data-ms-action="set" data-pid="${h(pid)}" data-field="buts" ${dis}>
          <button class="ms-inc" type="button" data-ms-action="inc" data-pid="${h(pid)}" data-field="buts" ${dis}>+</button>
        </div>
        <div class="ms-cell">
          <button class="ms-dec" type="button" data-ms-action="dec" data-pid="${h(pid)}" data-field="passes" ${dis}>−</button>
          <input type="number" min="0" max="20" value="${st.passes || 0}"
                 data-ms-action="set" data-pid="${h(pid)}" data-field="passes" ${dis}>
          <button class="ms-inc" type="button" data-ms-action="inc" data-pid="${h(pid)}" data-field="passes" ${dis}>+</button>
        </div>
        <div class="ms-cell">
          <input type="number" min="0" max="10" step="0.5" placeholder="—" value="${st.note}"
                 data-ms-action="set" data-pid="${h(pid)}" data-field="note" ${dis}>
        </div>
      </div>`;
  }

  /* ── Actions ────────────────────────────────────────────── */

  function updateCountDisplay() {
    const el = document.querySelector('.ms-count');
    if (!el) return;
    const players = listTeamPlayers(modal.cat, modal.teamLabel);
    const n = players.filter(p => modal.draft.stats[p]?.played).length;
    el.textContent = `${n}/${players.length}`;
  }

  function updatePlayerRowClass(pid) {
    const row = document.querySelector(`.ms-row[data-pid="${CSS.escape(pid)}"]`);
    if (!row) return;
    const on = modal.draft.stats[pid]?.played;
    row.classList.toggle('ms-row-on', !!on);
    row.querySelectorAll('button:not([data-ms-action="toggle-played"]), input[type="number"]').forEach(el => {
      el.disabled = !on;
    });
  }

  function handleAction(target) {
    const act = target.dataset.msAction;
    if (!act) return false;

    if (act === 'close') { close(); return true; }

    if (act === 'toggle-played') {
      const pid = target.dataset.pid;
      modal.draft.stats[pid] = modal.draft.stats[pid] || { played: false, buts: 0, passes: 0, note: '' };
      modal.draft.stats[pid].played = target.checked;
      updateCountDisplay();
      updatePlayerRowClass(pid);
      return true;
    }
    if (act === 'all-played' || act === 'none-played') {
      const val = act === 'all-played';
      listTeamPlayers(modal.cat, modal.teamLabel).forEach(pid => {
        modal.draft.stats[pid] = modal.draft.stats[pid] || { played: false, buts: 0, passes: 0, note: '' };
        modal.draft.stats[pid].played = val;
      });
      render();
      return true;
    }
    if (act === 'group-all' || act === 'group-none') {
      const val = act === 'group-all';
      const groupName = target.dataset.group;
      const grp = listTeamPlayersGrouped(modal.cat, modal.teamLabel).find(g => g.label === groupName);
      if (grp) {
        grp.players.forEach(pid => {
          modal.draft.stats[pid] = modal.draft.stats[pid] || { played: false, buts: 0, passes: 0, note: '' };
          modal.draft.stats[pid].played = val;
        });
        render();
      }
      return true;
    }
    if (act === 'inc' || act === 'dec') {
      const pid   = target.dataset.pid;
      const field = target.dataset.field;
      if (!pid || !field) return true;
      const st = modal.draft.stats[pid];
      if (!st || !st.played) return true;
      st[field] = Math.max(0, (+st[field] || 0) + (act === 'inc' ? 1 : -1));
      const input = document.querySelector(`.ms-row[data-pid="${CSS.escape(pid)}"] input[data-field="${field}"]`);
      if (input) input.value = st[field];
      return true;
    }
    if (act === 'set') {
      const pid   = target.dataset.pid;
      const field = target.dataset.field;
      if (!pid || !field) return true;
      const st = modal.draft.stats[pid];
      if (!st) return true;
      if (field === 'note') {
        const v = target.value;
        st.note = v === '' ? '' : Math.max(0, Math.min(10, +v || 0));
      } else {
        st[field] = Math.max(0, +target.value || 0);
      }
      return true;
    }
    if (act === 'set-notes') {
      modal.draft.notes = target.value;
      return true;
    }

    if (act === 'save') {
      doSave();
      return true;
    }
    return false;
  }

  function doSave() {
    if (!modal) return;
    const s = state();
    const cat = modal.cat;
    const mkey = matchKey(modal.match);
    if (!s.data[cat]) s.data[cat] = {};

    // Stats par joueur
    Object.keys(modal.draft.stats).forEach(pid => {
      const st = modal.draft.stats[pid];
      ensurePlayer(cat, pid);
      // On ne sauvegarde que les joueurs cochés (played=true), on nettoie les autres
      if (!st.played) {
        delete s.data[cat][pid].matchStats[mkey];
      } else {
        s.data[cat][pid].matchStats[mkey] = {
          played:  true,
          buts:    +st.buts    || 0,
          passes:  +st.passes  || 0,
          minutes: +st.minutes || 0,
          note:    st.note === '' ? null : +st.note,
          match: {
            date: modal.match.date,
            homeTeam: modal.match.homeTeam, awayTeam: modal.match.awayTeam,
            homeScore: modal.match.homeScore, awayScore: modal.match.awayScore,
          },
        };
      }
    });

    // Notes libres du match
    if (!s.data[cat]._matchNotes) s.data[cat]._matchNotes = {};
    if (modal.draft.notes && modal.draft.notes.trim()) {
      s.data[cat]._matchNotes[mkey] = modal.draft.notes.trim();
    } else {
      delete s.data[cat]._matchNotes[mkey];
    }

    utils().saveAppState?.();
    utils().showToast?.('✅ Stats du match enregistrées');
    close();
  }

  /* ── Hooks globaux ─────────────────────────────────────── */

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ms-action]');
    if (!t) return;
    if (handleAction(t)) e.preventDefault();
  });

  // Clic sur une ligne de match passé → ouvre le modal stats
  document.addEventListener('click', e => {
    const row = e.target.closest('[data-match-click="1"]');
    if (!row) return;
    try {
      const m = JSON.parse(row.dataset.matchJson || '{}');
      // Récupère la cat active et la team label depuis le contexte DOM / state
      const cat = state()?.cat;
      const teamLabel = state()?.selTeam
                     || document.querySelector('.team-hero h1')?.textContent?.trim()
                     || '';
      if (cat && teamLabel) openForMatch(cat, teamLabel, m);
    } catch (_) {}
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t?.dataset?.msAction === 'set' || t?.dataset?.msAction === 'set-notes') {
      handleAction(t);
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t?.dataset?.msAction === 'toggle-played') handleAction(t);
  });

  /* ── Exports ────────────────────────────────────────────── */

  window.MatchStatsModule = {
    openForMatch, close, handleAction,
    matchKey, getStatsForPlayer, aggregatePlayerStats,
  };
})();

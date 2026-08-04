/**
 * season-transition.js — Reprise de saison
 *
 * Workflow début de saison :
 *   - Pour chaque joueur de la saison précédente, décider : reste / monte
 *     de catégorie / quitte le club
 *   - Faire monter en U13 des joueurs qui étaient en U11
 *   - Filtrer les joueurs "partis" dans toutes les vues courantes
 *
 * Data model :
 *   prof.left = { season: '2026-2027', reason: 'club' | 'up' }
 *
 * Un joueur "left" reste dans state.data (historique préservé) mais est
 * masqué des vues courantes via un helper isPlayerActive(pid, cat, season).
 *
 * Expose : window.SeasonTransitionModule.{ open, close, isOpen, isPlayerActive,
 *          handleAction }
 */
(function () {
  'use strict';

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s == null ? '' : s); }
  function toast(m) { utils().showToast && utils().showToast(m); }

  const CAT_ORDER = ['u9', 'u11', 'u13', 'u15', 'u18'];

  let visible = false;
  // décisions en attente : { [pid]: 'stay' | 'up' | 'leave' }
  let pending = {};
  // depuis U11 : { [pid]: true } pour monter en cat courante
  let promoting = {};

  /* ── Helpers ─────────────────────────────────────────── */

  function isPlayerActive(pid, cat, season) {
    const prof = state().data?.[cat]?.[pid]?.profil;
    if (!prof) return true;
    if (!prof.left) return true;
    // Si le joueur est parti AVANT ou pendant cette saison, il est inactif
    return prof.left.season && prof.left.season > season;
  }

  function playerLabel(pid, cat) {
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil
              || state().data?.[cat]?.[pid]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }

  function nextCategory(cat) {
    const i = CAT_ORDER.indexOf(cat);
    return i >= 0 && i < CAT_ORDER.length - 1 ? CAT_ORDER[i + 1] : null;
  }

  function previousCategory(cat) {
    const i = CAT_ORDER.indexOf(cat);
    return i > 0 ? CAT_ORDER[i - 1] : null;
  }

  function currentPlayersOf(cat) {
    const data = state().data?.[cat] || {};
    return Object.keys(data).filter(pid => {
      const prof = data[pid].profil;
      return !prof?.left; // exclut ceux déjà marqués partis
    });
  }

  /* ── Open / Close ────────────────────────────────────── */

  function open() {
    visible = true;
    pending = {};
    promoting = {};
    renderOverlay();
    document.body.classList.add('season-transition-active');
  }

  function close() {
    visible = false;
    document.body.classList.remove('season-transition-active');
    const el = document.getElementById('season-transition-overlay');
    if (el) el.remove();
  }

  function isOpen() { return visible; }

  /* ── Rendu ───────────────────────────────────────────── */

  function renderOverlay() {
    let el = document.getElementById('season-transition-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'season-transition-overlay';
      el.className = 'stx-overlay';
      document.body.appendChild(el);
    }
    el.innerHTML = renderBody();
  }

  function renderBody() {
    const cat = state().cat;
    const season = state().season;
    const catLabel = (window.CAT_LABELS?.[cat] || cat).toUpperCase();
    const prevCat = previousCategory(cat);
    const players = currentPlayersOf(cat);
    const promoteCandidates = prevCat ? currentPlayersOf(prevCat) : [];

    const stayCount = players.filter(p => (pending[p] || 'stay') === 'stay').length;
    const upCount   = players.filter(p => pending[p] === 'up').length;
    const leaveCount = players.filter(p => pending[p] === 'leave').length;
    const promoCount = Object.keys(promoting).filter(k => promoting[k]).length;
    const finalTotal = stayCount + promoCount;

    return `
      <div class="stx-shell">
        <header class="stx-head">
          <button class="stx-close" type="button" data-stx-action="close" aria-label="Fermer">×</button>
          <div class="stx-title">
            <h2>🔄 Reprise de saison ${h(season)}</h2>
            <p>Catégorie <strong>${h(catLabel)}</strong> — décide qui reste, qui monte, qui quitte.</p>
          </div>
        </header>

        <div class="stx-summary">
          <div class="stx-stat stx-stat-ok"><div class="stx-stat-val">${stayCount + promoCount}</div><div class="stx-stat-lbl">Effectif final</div></div>
          <div class="stx-stat"><div class="stx-stat-val">${stayCount}</div><div class="stx-stat-lbl">Restent</div></div>
          <div class="stx-stat stx-stat-up"><div class="stx-stat-val">${upCount}</div><div class="stx-stat-lbl">Montent</div></div>
          <div class="stx-stat stx-stat-out"><div class="stx-stat-val">${leaveCount}</div><div class="stx-stat-lbl">Quittent</div></div>
          <div class="stx-stat stx-stat-in"><div class="stx-stat-val">+${promoCount}</div><div class="stx-stat-lbl">Nouveaux (montent)</div></div>
        </div>

        <section class="stx-section">
          <div class="stx-section-head">
            <h3>Effectif actuel ${h(catLabel)} <span class="stx-count">${players.length}</span></h3>
            <div class="stx-bulk">
              <button class="btn btn-ghost" type="button" data-stx-action="bulk-stay">Tout garder</button>
              <button class="btn btn-ghost" type="button" data-stx-action="reset">Réinitialiser</button>
            </div>
          </div>
          ${players.length === 0
            ? '<p class="stx-empty">Aucun joueur actif dans cette catégorie.</p>'
            : `<div class="stx-list">${players.map(pid => renderPlayerRow(pid, cat)).join('')}</div>`}
        </section>

        ${prevCat ? `
          <section class="stx-section">
            <div class="stx-section-head">
              <h3>Faire monter depuis ${h((window.CAT_LABELS?.[prevCat] || prevCat).toUpperCase())} <span class="stx-count">${promoteCandidates.length}</span></h3>
              <div class="stx-bulk">
                <button class="btn btn-ghost" type="button" data-stx-action="bulk-promote">Tout cocher</button>
              </div>
            </div>
            ${promoteCandidates.length === 0
              ? '<p class="stx-empty">Aucun joueur candidat.</p>'
              : `<div class="stx-list stx-list-promote">${promoteCandidates.map(pid => renderPromoteRow(pid, prevCat)).join('')}</div>`}
          </section>
        ` : ''}

        <footer class="stx-footer">
          <div class="stx-footer-summary">
            <strong>${finalTotal}</strong> joueur${finalTotal > 1 ? 's' : ''} dans l'effectif ${h(catLabel)} après reprise
          </div>
          <div class="stx-footer-actions">
            <button class="btn btn-ghost" type="button" data-stx-action="close">Annuler</button>
            <button class="btn btn-primary" type="button" data-stx-action="apply">Appliquer la reprise</button>
          </div>
        </footer>
      </div>
    `;
  }

  function renderPlayerRow(pid, cat) {
    const decision = pending[pid] || 'stay';
    return `
      <article class="stx-row stx-row-${decision}">
        <div class="stx-row-name">${h(playerLabel(pid, cat))}</div>
        <div class="stx-row-actions">
          <button class="stx-btn ${decision === 'stay' ? 'on stay' : ''}" type="button"
                  data-stx-action="decide" data-pid="${h(pid)}" data-decision="stay">✓ Reste</button>
          <button class="stx-btn ${decision === 'up' ? 'on up' : ''}" type="button"
                  data-stx-action="decide" data-pid="${h(pid)}" data-decision="up">⬆ Monte</button>
          <button class="stx-btn ${decision === 'leave' ? 'on leave' : ''}" type="button"
                  data-stx-action="decide" data-pid="${h(pid)}" data-decision="leave">✕ Quitte</button>
        </div>
      </article>`;
  }

  function renderPromoteRow(pid, fromCat) {
    const checked = !!promoting[pid];
    return `
      <label class="stx-promote-row ${checked ? 'on' : ''}">
        <input type="checkbox" ${checked ? 'checked' : ''}
               data-stx-action="toggle-promote" data-pid="${h(pid)}" data-from-cat="${h(fromCat)}">
        <span>${h(playerLabel(pid, fromCat))}</span>
        <span class="stx-promote-from">${h((window.CAT_LABELS?.[fromCat] || fromCat).toUpperCase())} → ${h((window.CAT_LABELS?.[state().cat] || state().cat).toUpperCase())}</span>
      </label>`;
  }

  /* ── Actions ─────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.stxAction;
    if (!action) return false;

    if (action === 'close') { close(); return true; }
    if (action === 'reset') { pending = {}; promoting = {}; renderOverlay(); return true; }
    if (action === 'bulk-stay') {
      currentPlayersOf(state().cat).forEach(pid => { pending[pid] = 'stay'; });
      renderOverlay(); return true;
    }
    if (action === 'bulk-promote') {
      const prevCat = previousCategory(state().cat);
      if (prevCat) currentPlayersOf(prevCat).forEach(pid => { promoting[pid] = true; });
      renderOverlay(); return true;
    }
    if (action === 'decide') {
      pending[el.dataset.pid] = el.dataset.decision;
      renderOverlay(); return true;
    }
    if (action === 'toggle-promote') {
      promoting[el.dataset.pid] = el.checked;
      renderOverlay(); return true;
    }
    if (action === 'apply') {
      applyTransition();
      return true;
    }
    return false;
  }

  function applyTransition() {
    const cat = state().cat;
    const season = state().season;
    const prevCat = previousCategory(cat);
    let stay = 0, up = 0, leave = 0, promoted = 0;

    // 1. Décisions sur l'effectif actuel
    Object.keys(pending).forEach(pid => {
      const decision = pending[pid];
      const prof = state().data?.[cat]?.[pid]?.profil;
      if (!prof) return;
      if (decision === 'stay') {
        delete prof.left; stay++;
      } else if (decision === 'up') {
        prof.left = { season, reason: 'up', toCategory: nextCategory(cat) || 'senior' };
        up++;
      } else if (decision === 'leave') {
        prof.left = { season, reason: 'club' };
        leave++;
      }
    });
    // Joueurs sans décision → considérés comme "reste"
    currentPlayersOf(cat).forEach(pid => { if (!pending[pid]) stay++; });

    // 2. Promotion depuis catégorie inférieure
    if (prevCat) {
      Object.keys(promoting).forEach(pid => {
        if (!promoting[pid]) return;
        const src = state().data[prevCat]?.[pid];
        if (!src) return;
        // Copier profil vers cat cible
        if (!state().data[cat]) state().data[cat] = {};
        if (state().data[cat][pid]) return; // déjà présent
        state().data[cat][pid] = {
          profil: { ...src.profil, left: null },
        };
        // Marquer comme parti dans l'ancienne cat
        src.profil.left = { season, reason: 'up', toCategory: cat };
        promoted++;
      });
    }

    utils().saveAppState && utils().saveAppState();
    utils().renderAll && utils().renderAll();

    close();
    toast(`Reprise appliquée : ${stay} restent, ${up} montent, ${leave} quittent, +${promoted} depuis ${prevCat || '—'}`);
  }

  window.SeasonTransitionModule = {
    open, close, isOpen, handleAction, isPlayerActive,
  };
})();

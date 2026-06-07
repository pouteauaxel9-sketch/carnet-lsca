/**
 * ux-polish.js — Raccourcis clavier, FAB Mode Terrain, micro-ergonomie
 *
 * Ajoute des comportements transversaux pour fluidifier l'usage :
 *   - Bouton flottant "Mode Terrain" (⚡) en bas à droite, toujours accessible
 *   - Échap ferme : modals, overlay live-training, modal career, menu "⋯"
 *   - Ctrl/Cmd + K → focus la recherche joueur
 *   - / → focus la recherche joueur (style GitHub)
 *   - Persistance du dernier joueur consulté (rétabli au refresh)
 *   - Mémorisation du dernier onglet vu
 *   - Animation tap feedback sur les boutons principaux
 *
 * Expose : window.UxPolishModule (purement effets de bord, pas d'API)
 */
(function () {
  'use strict';

  const STATE_KEY = 'cfb6_ux_state';

  function loadUxState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveUxState(patch) {
    const cur = loadUxState();
    const next = { ...cur, ...patch };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch {}
  }

  /* ── FAB Mode Terrain ──────────────────────────────── */

  function injectFAB() {
    if (document.getElementById('fab-live-training')) return;
    const fab = document.createElement('button');
    fab.id = 'fab-live-training';
    fab.className = 'fab fab-live';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Ouvrir le mode Terrain');
    fab.title = 'Mode Terrain (Shift+T)';
    fab.innerHTML = '⚡';
    fab.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      window.LiveTrainingModule?.open?.();
    });
    document.body.appendChild(fab);
  }

  /* ── Raccourcis clavier ────────────────────────────── */

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      // Ctrl/Cmd + K → focus recherche
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const search = document.getElementById('sb-search');
        if (search) { search.focus(); search.select?.(); }
        return;
      }

      // / dans un champ → ignore. Sinon focus recherche
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        const search = document.getElementById('sb-search');
        if (search) { search.focus(); search.select?.(); }
        return;
      }

      // Échap → ferme overlays et modals
      if (e.key === 'Escape') {
        // Live Training
        if (window.LiveTrainingModule?.isOpen?.()) {
          window.LiveTrainingModule.close();
          return;
        }
        // Career modal
        if (window.CareerModule?.isOpen?.()) {
          window.CareerModule.close?.();
          return;
        }
        // Educator modal
        const eduModal = document.querySelector('#educator-modal-overlay');
        if (eduModal) {
          window.EducatorModule?.handleAction({ dataset: { educatorAction: 'close-config' } });
          return;
        }
        // Modals génériques (.modal-overlay)
        const genericModal = document.querySelector('.modal-overlay');
        if (genericModal) {
          genericModal.remove();
          return;
        }
        // Menu more
        const moreMenu = document.getElementById('more-menu');
        if (moreMenu && !moreMenu.hidden) {
          moreMenu.hidden = true;
          document.getElementById('more-actions-btn')?.setAttribute('aria-expanded', 'false');
          return;
        }
      }
    });
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  /* ── Mémorisation dernier joueur / vue ─────────────── */

  function restoreLastContext() {
    const ux = loadUxState();
    const s = window.appState;
    if (!s) return;
    // Rétablir le dernier onglet si pas dashboard, et que la catégorie existe
    if (ux.lastView && ux.lastCat && s.data?.[ux.lastCat]) {
      s.cat = ux.lastCat;
      s.view = ux.lastView;
      // Restaurer le dernier joueur si la vue était 'player'
      if (ux.lastView === 'player' && ux.lastPlayer && s.data[ux.lastCat][ux.lastPlayer]) {
        s.selPlayer = ux.lastPlayer;
      }
      window.appUtils?.renderAll?.();
    }
  }

  function watchContextChanges() {
    // On observe via MutationObserver : à chaque re-render, capture l'état
    let last = '';
    setInterval(() => {
      const s = window.appState;
      if (!s) return;
      const sig = (s.view || '') + '|' + (s.cat || '') + '|' + (s.selPlayer || '');
      if (sig !== last) {
        last = sig;
        saveUxState({ lastView: s.view, lastCat: s.cat, lastPlayer: s.selPlayer || null });
      }
    }, 1500);
  }

  /* ── Tap feedback sur boutons principaux ───────────── */

  function setupTapFeedback() {
    document.addEventListener('pointerdown', e => {
      const btn = e.target.closest('button:not(:disabled), .btn, .nav-cat, .ptab, .live-btn, .weekly-rate, .weekly-card-crit, .plan-filter, .advstats-tab, .player-row');
      if (!btn) return;
      btn.classList.add('ux-tap');
      setTimeout(() => btn.classList.remove('ux-tap'), 250);
    });
  }

  /* ── Boot ──────────────────────────────────────────── */

  function init() {
    injectFAB();
    setupKeyboardShortcuts();
    setupTapFeedback();
    // Petit délai pour que app.js soit init
    setTimeout(() => {
      restoreLastContext();
      watchContextChanges();
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UxPolishModule = { injectFAB };
})();

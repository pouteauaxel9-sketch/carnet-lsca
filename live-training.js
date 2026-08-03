/**
 * live-training.js — Mode Terrain (saisie pendant l'entraînement)
 *
 * Vue plein écran mobile-first conçue pour le bord du terrain :
 *   - tuiles joueurs (grandes, taps faciles)
 *   - tap rapide = note positive / négative / observation
 *   - dictée vocale intégrée
 *   - tout est stocké dans la semaine en cours (via WeeklyFocusModule)
 *
 * Données : section 'flash' de la semaine
 *   week.flash = {
 *     [pid]: [
 *       { id, ts, kind: 'plus' | 'minus' | 'note', text?: string }
 *     ]
 *   }
 *
 * Le mode terrain expose un overlay activable depuis le menu "…" ou
 * directement via WeeklyFocusModule.
 *
 * Expose : window.LiveTrainingModule.{ open, close, isOpen, handleAction,
 *          summaryFor }
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cfb6_weekly_focus_v1'; // partagé avec weekly-focus

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? ''); }
  function toast(m) { utils().showToast?.(m); }

  let visible = false;
  let activePid = null;
  let activeMode = 'grid';  // 'grid' | 'note'

  /* ── helpers semaine ──────────────────────────────── */

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtIso(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
  function thisMondayIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return fmtIso(d);
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    catch (e) { console.warn(e); }
  }
  function ensureWeek(cat, iso) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) {
      store[cat][iso] = {
        label: weekLabel(iso), theme: '',
        items: [], ratings: {}, notes: {}, flash: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveStore(store);
    } else if (!store[cat][iso].flash) {
      store[cat][iso].flash = {};
    }
    return store[cat][iso];
  }
  function setWeek(cat, iso, mutator) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) store[cat][iso] = ensureWeek(cat, iso);
    const w = store[cat][iso];
    if (!w.flash) w.flash = {};
    mutator(w);
    w.updatedAt = new Date().toISOString();
    saveStore(store);
    return w;
  }
  function weekLabel(iso) {
    const m = new Date(iso + 'T00:00:00');
    const s = new Date(m); s.setDate(m.getDate() + 6);
    const fmt = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    return `Semaine du ${fmt(m)} au ${fmt(s)}`;
  }

  /* ── joueurs ──────────────────────────────────────── */

  function playerLabel(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }
  function playerShortLabel(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil;
    if (prof?.prenom) return prof.prenom;
    return pid.split(' ')[0] || pid;
  }
  function playerTeam(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil;
    return prof?.equipe || '';
  }
  function sortedPlayers(cat) {
    const obj = state().data?.[cat] || {};
    return Object.keys(obj).sort((a, b) =>
      playerLabel(a).localeCompare(playerLabel(b), 'fr', { sensitivity: 'base' }));
  }

  /* ── UI ────────────────────────────────────────────── */

  function open() {
    visible = true;
    activePid = null;
    activeMode = 'grid';
    ensureWeek(state().cat, thisMondayIso());
    renderOverlay();
    document.body.classList.add('live-training-active');
  }

  function close() {
    visible = false;
    activePid = null;
    document.body.classList.remove('live-training-active');
    const el = document.getElementById('live-training-overlay');
    if (el) el.remove();
    utils().renderAll?.();
  }

  function isOpen() { return visible; }

  function renderOverlay() {
    let el = document.getElementById('live-training-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'live-training-overlay';
      el.className = 'live-overlay';
      document.body.appendChild(el);
    }
    if (activeMode === 'note' && activePid) {
      el.innerHTML = renderNoteView();
    } else {
      el.innerHTML = renderGridView();
    }
  }

  function renderGridView() {
    const cat = state().cat;
    const iso = thisMondayIso();
    const week = ensureWeek(cat, iso);
    const players = sortedPlayers(cat);
    const teamFilter = state().selTeam || '';

    const visible = teamFilter
      ? players.filter(p => playerTeam(p) === teamFilter)
      : players;

    return `
      <div class="live-shell">
        <header class="live-head">
          <button class="live-close" type="button" data-live-action="close" aria-label="Fermer">×</button>
          <div class="live-title">
            <div class="live-cat">Mode Terrain — ${h((window.CAT_LABELS?.[cat] || cat).toUpperCase())}</div>
            <div class="live-week">${h(week.label)}${week.theme ? ' · ' + h(week.theme) : ''}</div>
          </div>
          <button class="live-team-filter" type="button" data-live-action="cycle-team"
                  title="Filtrer par équipe">
            ${teamFilter || 'Toutes'}
          </button>
        </header>

        <div class="live-legend">
          <span class="live-leg live-leg-plus">👍 Bon</span>
          <span class="live-leg live-leg-minus">👎 À travailler</span>
          <span class="live-leg live-leg-note">📝 Note</span>
        </div>

        <div class="live-grid">
          ${visible.map(pid => renderPlayerTile(pid, week)).join('')}
        </div>

        ${renderSummaryBar(week, visible)}
      </div>
    `;
  }

  function renderPlayerTile(pid, week) {
    const flash = (week.flash?.[pid]) || [];
    const plus = flash.filter(f => f.kind === 'plus').length;
    const minus = flash.filter(f => f.kind === 'minus').length;
    const notes = flash.filter(f => f.kind === 'note').length;
    const last = flash[flash.length - 1];
    return `
      <article class="live-tile" data-pid="${h(pid)}">
        <header class="live-tile-head">
          <span class="live-tile-name">${h(playerShortLabel(pid))}</span>
          ${last ? `<span class="live-tile-last" title="Dernière action">${last.kind === 'plus' ? '👍' : last.kind === 'minus' ? '👎' : '📝'}</span>` : ''}
        </header>
        <div class="live-tile-stats">
          ${plus > 0 ? `<span class="live-stat live-stat-plus">+${plus}</span>` : ''}
          ${minus > 0 ? `<span class="live-stat live-stat-minus">−${minus}</span>` : ''}
          ${notes > 0 ? `<span class="live-stat live-stat-note">${notes}📝</span>` : ''}
          ${(plus + minus + notes) === 0 ? '<span class="live-stat-empty">·</span>' : ''}
        </div>
        <div class="live-tile-actions">
          <button class="live-btn live-btn-plus" type="button"
                  data-live-action="add-plus" data-pid="${h(pid)}"
                  aria-label="Bon point pour ${h(playerLabel(pid))}">👍</button>
          <button class="live-btn live-btn-minus" type="button"
                  data-live-action="add-minus" data-pid="${h(pid)}"
                  aria-label="À travailler pour ${h(playerLabel(pid))}">👎</button>
          <button class="live-btn live-btn-note" type="button"
                  data-live-action="open-note" data-pid="${h(pid)}"
                  aria-label="Ajouter une note pour ${h(playerLabel(pid))}">📝</button>
        </div>
      </article>
    `;
  }

  function renderNoteView() {
    const cat = state().cat;
    const iso = thisMondayIso();
    const week = ensureWeek(cat, iso);
    const flash = (week.flash?.[activePid]) || [];

    return `
      <div class="live-shell live-note-shell">
        <header class="live-head">
          <button class="live-close" type="button" data-live-action="back-grid" aria-label="Retour">←</button>
          <div class="live-title">
            <div class="live-cat">${h(playerLabel(activePid))}</div>
            <div class="live-week">${h(week.label)}</div>
          </div>
        </header>

        <div class="live-note-form">
          <label class="live-note-label" for="live-note-input">Note rapide</label>
          <textarea id="live-note-input" class="live-note-input"
                    placeholder="Ex: belle conduite côté droit, frappe trop molle"
                    rows="4" data-voice></textarea>
          <div class="live-note-actions">
            <button class="btn btn-ghost" type="button" data-live-action="back-grid">Annuler</button>
            <button class="btn btn-primary" type="button" data-live-action="save-note" data-pid="${h(activePid)}">Enregistrer</button>
          </div>
        </div>

        ${flash.length === 0 ? '' : `
          <section class="live-history">
            <h4>Historique de la semaine (${flash.length})</h4>
            <ul class="live-history-list">
              ${flash.slice().reverse().map(f => `
                <li class="live-history-item live-h-${f.kind}">
                  <span class="live-h-icon">${f.kind === 'plus' ? '👍' : f.kind === 'minus' ? '👎' : '📝'}</span>
                  <span class="live-h-time">${formatTime(f.ts)}</span>
                  ${f.text ? `<span class="live-h-text">${h(f.text)}</span>` : ''}
                  <button class="live-h-rm" type="button" data-live-action="remove-flash"
                          data-pid="${h(activePid)}" data-flash-id="${h(f.id)}" aria-label="Supprimer">×</button>
                </li>
              `).join('')}
            </ul>
          </section>
        `}
      </div>
    `;
  }

  function renderSummaryBar(week, players) {
    const flash = week.flash || {};
    const totals = players.reduce((acc, pid) => {
      (flash[pid] || []).forEach(f => { acc[f.kind] = (acc[f.kind] || 0) + 1; });
      return acc;
    }, { plus: 0, minus: 0, note: 0 });
    return `
      <footer class="live-summary">
        <span class="live-sum live-sum-plus">👍 ${totals.plus}</span>
        <span class="live-sum live-sum-minus">👎 ${totals.minus}</span>
        <span class="live-sum live-sum-note">📝 ${totals.note}</span>
        <span class="live-sum-spacer"></span>
        <button class="btn btn-ghost" type="button" data-live-action="close">Terminer la séance</button>
      </footer>
    `;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  /* ── actions ────────────────────────────────────────── */

  function pushFlash(pid, kind, text) {
    const cat = state().cat;
    const iso = thisMondayIso();
    setWeek(cat, iso, w => {
      if (!w.flash) w.flash = {};
      if (!w.flash[pid]) w.flash[pid] = [];
      w.flash[pid].push({
        id: 'fl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        ts: new Date().toISOString(),
        kind,
        text: text || undefined,
      });
    });
  }

  function handleAction(el) {
    const action = el.dataset.liveAction;
    if (!action) return false;

    if (action === 'close') { close(); return true; }
    if (action === 'back-grid') { activeMode = 'grid'; activePid = null; renderOverlay(); return true; }

    if (action === 'add-plus') {
      pushFlash(el.dataset.pid, 'plus');
      renderOverlay();
      flashFeedback(el);
      return true;
    }
    if (action === 'add-minus') {
      pushFlash(el.dataset.pid, 'minus');
      renderOverlay();
      flashFeedback(el);
      return true;
    }
    if (action === 'open-note') {
      activePid = el.dataset.pid;
      activeMode = 'note';
      renderOverlay();
      // focus textarea
      setTimeout(() => document.getElementById('live-note-input')?.focus(), 50);
      return true;
    }
    if (action === 'save-note') {
      const ta = document.getElementById('live-note-input');
      const text = (ta?.value || '').trim();
      if (!text) { toast('Note vide'); return true; }
      pushFlash(el.dataset.pid, 'note', text);
      toast('Note enregistrée');
      activeMode = 'grid';
      activePid = null;
      renderOverlay();
      return true;
    }
    if (action === 'remove-flash') {
      const pid = el.dataset.pid;
      const id = el.dataset.flashId;
      const cat = state().cat;
      const iso = thisMondayIso();
      setWeek(cat, iso, w => {
        if (w.flash?.[pid]) w.flash[pid] = w.flash[pid].filter(f => f.id !== id);
      });
      renderOverlay();
      return true;
    }
    if (action === 'cycle-team') {
      const cat = state().cat;
      const teams = (window.CLUB_DATA?.categories?.[cat]?.teams || []).map(t => t.label);
      const cur = state().selTeam || '';
      const idx = teams.indexOf(cur);
      const next = idx === -1 ? teams[0] : teams[idx + 1];
      state().selTeam = next || null;
      renderOverlay();
      return true;
    }
    return false;
  }

  function flashFeedback(el) {
    el.classList.add('live-pulse');
    setTimeout(() => el.classList.remove('live-pulse'), 300);
  }

  /* ── synthèse pour la fiche joueur ─────────────────── */

  function summaryFor(pid, cat) {
    const iso = thisMondayIso();
    const week = ensureWeek(cat || state().cat, iso);
    const flash = (week.flash?.[pid]) || [];
    if (!flash.length) return null;
    const plus = flash.filter(f => f.kind === 'plus').length;
    const minus = flash.filter(f => f.kind === 'minus').length;
    const notes = flash.filter(f => f.kind === 'note');
    return { iso, label: week.label, total: flash.length, plus, minus, notes };
  }

  function renderPlayerWidget(pid, cat) {
    const s = summaryFor(pid, cat);
    if (!s) return '';
    return `
      <div class="player-live-card">
        <div class="player-live-head">
          <span class="player-live-title">⚡ Terrain — ${h(s.label)}</span>
          <span class="player-live-stats">
            ${s.plus > 0 ? `<span class="live-stat live-stat-plus">+${s.plus}</span>` : ''}
            ${s.minus > 0 ? `<span class="live-stat live-stat-minus">−${s.minus}</span>` : ''}
          </span>
        </div>
        ${s.notes.length ? `
          <ul class="player-live-notes">
            ${s.notes.slice(-3).reverse().map(n => `<li>"${h(n.text)}"</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  }

  /* ── ouverture rapide via raccourci ───────────────── */

  document.addEventListener('keydown', e => {
    // Shift+T pour ouvrir le mode terrain (utile sur tablette avec clavier)
    if (e.shiftKey && e.key === 'T' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!visible) open();
      else close();
    }
  });

  window.LiveTrainingModule = {
    open, close, isOpen, handleAction,
    summaryFor, renderPlayerWidget,
  };
})();

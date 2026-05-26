/**
 * roster.js — Gestion d'effectif via UI.
 *
 * Stocke un overlay localStorage par-dessus la liste JDATA[cat].players.
 * Permet : ajouter, renommer, supprimer un joueur depuis l'interface.
 *
 * Expose : window.RosterModule.{ applyOverlayToJDATA, openCreate, openManage,
 *           closeModal, handleAction, addPlayer, renamePlayer, removePlayer }
 */
(function () {
  'use strict';

  const ROSTER_KEY = 'cfb6_roster';

  /* ── helpers ───────────────────────────────────────────── */

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const utils = () => window.appUtils;
  const state = () => window.appState;
  function getJDATA() { return window.JDATA || {}; }

  /* ── overlay localStorage ──────────────────────────────── */

  function loadOverlay() {
    try { return JSON.parse(localStorage.getItem(ROSTER_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveOverlay(o) { localStorage.setItem(ROSTER_KEY, JSON.stringify(o)); }

  function applyOverlayToJDATA() {
    const overlay = loadOverlay();
    const jdata = getJDATA();
    Object.keys(jdata).forEach(cat => {
      if (overlay[cat] && Array.isArray(overlay[cat])) {
        jdata[cat].players = overlay[cat];
      }
    });
  }

  function persistCategoryList(cat) {
    const overlay = loadOverlay();
    overlay[cat] = getJDATA()[cat]?.players || [];
    saveOverlay(overlay);
  }

  /* ── CRUD ──────────────────────────────────────────────── */

  function _list(cat) { return getJDATA()[cat]?.players || []; }

  function addPlayer(cat, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, msg: 'Nom requis' };
    const list = _list(cat);
    if (list.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, msg: 'Joueur déjà présent' };
    }
    list.push({ name: trimmed, seasons: {} });
    list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    persistCategoryList(cat);
    return { ok: true, name: trimmed };
  }

  function renamePlayer(cat, oldName, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) return { ok: false, msg: 'Nom requis' };
    if (trimmed === oldName) return { ok: true, name: oldName };
    const list = _list(cat);
    const idx = list.findIndex(p => p.name === oldName);
    if (idx < 0) return { ok: false, msg: 'Joueur introuvable' };
    if (list.some((p, i) => i !== idx && p.name.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, msg: 'Nom déjà utilisé' };
    }
    list[idx] = { ...list[idx], name: trimmed };
    list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    persistCategoryList(cat);

    const s = state();
    if (s?.data?.[cat]?.[oldName]) {
      s.data[cat][trimmed] = s.data[cat][oldName];
      delete s.data[cat][oldName];
      utils()?.saveAppState();
    }
    if (s?.selPlayer === oldName) s.selPlayer = trimmed;
    return { ok: true, name: trimmed };
  }

  function removePlayer(cat, name) {
    const list = _list(cat);
    const idx = list.findIndex(p => p.name === name);
    if (idx < 0) return { ok: false };
    list.splice(idx, 1);
    persistCategoryList(cat);

    const s = state();
    if (s?.data?.[cat]?.[name]) {
      delete s.data[cat][name];
      utils()?.saveAppState();
    }
    if (s?.selPlayer === name) {
      s.selPlayer = null;
      if (s.view === 'player') s.view = 'categories';
    }
    return { ok: true };
  }

  /* ── modal état ─────────────────────────────────────────── */

  let modal = null;
  // modal = { kind: 'create'|'manage', cat, editing?: string }

  function renderModal() {
    let el = document.querySelector('#roster-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'roster-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modal ? renderOverlay() : '';
    // autofocus
    setTimeout(() => {
      const input = el.querySelector('#roster-input');
      if (input) input.focus();
    }, 30);
  }

  function renderOverlay() {
    if (!modal) return '';
    const { kind, cat } = modal;
    const CAT_LABELS = window.CAT_LABELS || {};
    const catLabel = CAT_LABELS[cat] || cat?.toUpperCase() || '';
    if (kind === 'create') return renderCreate(cat, catLabel);
    if (kind === 'manage') return renderManage(cat, catLabel);
    return '';
  }

  function renderCreate(cat, catLabel) {
    return `
      <div class="modal-overlay" data-roster-overlay>
        <div class="modal-box" style="max-width:440px">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(catLabel)}</div>
              <h3>Ajouter un joueur</h3>
            </div>
            <button class="modal-close" type="button" data-roster-action="close">×</button>
          </div>
          <p class="modal-hint" style="margin-bottom:10px">
            Saisis le nom et le prénom du joueur. Format conseillé : « Nom Prénom ».
          </p>
          <div class="field-group">
            <label class="field-label" for="roster-input">Nom complet</label>
            <input class="field-input" id="roster-input" type="text"
              placeholder="Ex. Durand Lucas"
              data-roster-action="submit-on-enter">
          </div>
          <div class="modal-footer">
            <span style="flex:1"></span>
            <button class="btn-ghost" type="button" data-roster-action="close">Annuler</button>
            <button class="btn-primary" type="button" data-roster-action="create-confirm">Ajouter</button>
          </div>
        </div>
      </div>`;
  }

  function renderManage(cat, catLabel) {
    const list = _list(cat);
    const editing = modal.editing;
    const rows = list.length
      ? list.map(p => editing === p.name
          ? `<div class="roster-row roster-row--edit">
              <input class="field-input" type="text" id="roster-input"
                value="${h(p.name)}" data-roster-action="submit-on-enter"
                data-roster-old="${h(p.name)}">
              <button class="btn btn-primary" type="button"
                data-roster-action="rename-confirm" data-old="${h(p.name)}">Valider</button>
              <button class="btn-ghost" type="button"
                data-roster-action="cancel-edit">Annuler</button>
            </div>`
          : `<div class="roster-row">
              <span class="roster-name">${h(p.name)}</span>
              <button class="btn-ghost" type="button"
                data-roster-action="edit" data-name="${h(p.name)}">Renommer</button>
              <button class="btn-ghost btn-danger" type="button"
                data-roster-action="remove" data-name="${h(p.name)}">Supprimer</button>
            </div>`
        ).join('')
      : `<div class="dash-empty"><div class="dash-empty-msg">Aucun joueur</div>
          <div class="dash-empty-hint">Utilise « + Ajouter un joueur » pour démarrer.</div></div>`;

    return `
      <div class="modal-overlay" data-roster-overlay>
        <div class="modal-box" style="max-width:560px;max-height:80vh;display:flex;flex-direction:column">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(catLabel)}</div>
              <h3>Gérer l'effectif (${list.length})</h3>
            </div>
            <button class="modal-close" type="button" data-roster-action="close">×</button>
          </div>
          <div class="roster-list">${rows}</div>
          <div class="modal-footer">
            <button class="btn-ghost" type="button" data-roster-action="open-create">+ Ajouter un joueur</button>
            <span style="flex:1"></span>
            <button class="btn-primary" type="button" data-roster-action="close">Fermer</button>
          </div>
        </div>
      </div>`;
  }

  /* ── actions ────────────────────────────────────────────── */

  function openCreate(cat) {
    modal = { kind: 'create', cat: cat || state()?.cat };
    renderModal();
  }
  function openManage(cat) {
    modal = { kind: 'manage', cat: cat || state()?.cat, editing: null };
    renderModal();
  }
  function closeModal() {
    modal = null;
    renderModal();
  }

  function handleAction(target) {
    const ra = target.dataset.rosterAction;
    if (!ra) return false;
    if (ra === 'close') { closeModal(); return true; }
    if (ra === 'open-create') {
      const cat = modal?.cat || state()?.cat;
      modal = { kind: 'create', cat };
      renderModal();
      return true;
    }
    if (ra === 'create-confirm') {
      const input = document.querySelector('#roster-input');
      const cat = modal?.cat || state()?.cat;
      const r = addPlayer(cat, input?.value);
      if (!r.ok) { utils()?.showToast(r.msg || 'Échec'); return true; }
      utils()?.showToast('Joueur ajouté : ' + r.name);
      modal = { kind: 'manage', cat, editing: null };
      renderModal();
      utils()?.renderAll();
      return true;
    }
    if (ra === 'edit') {
      modal.editing = target.dataset.name;
      renderModal();
      return true;
    }
    if (ra === 'cancel-edit') {
      modal.editing = null;
      renderModal();
      return true;
    }
    if (ra === 'rename-confirm') {
      const oldName = target.dataset.old;
      const input = document.querySelector('#roster-input');
      const r = renamePlayer(modal.cat, oldName, input?.value);
      if (!r.ok) { utils()?.showToast(r.msg || 'Échec'); return true; }
      utils()?.showToast('Joueur renommé');
      modal.editing = null;
      renderModal();
      utils()?.renderAll();
      return true;
    }
    if (ra === 'remove') {
      const name = target.dataset.name;
      if (!confirm('Supprimer définitivement « ' + name + ' » et ses données ?')) return true;
      const r = removePlayer(modal.cat, name);
      if (!r.ok) { utils()?.showToast('Échec'); return true; }
      utils()?.showToast('Joueur supprimé');
      renderModal();
      utils()?.renderAll();
      return true;
    }
    if (ra === 'submit-on-enter') return true; // handled via keydown
    return false;
  }

  /* ── événements globaux ─────────────────────────────────── */

  // Enter validation
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t?.id !== 'roster-input') return;
    e.preventDefault();
    if (modal?.editing) {
      const fake = { dataset: { rosterAction: 'rename-confirm', old: modal.editing } };
      handleAction(fake);
    } else if (modal?.kind === 'create') {
      handleAction({ dataset: { rosterAction: 'create-confirm' } });
    }
  });

  // Clic en dehors → ferme
  document.addEventListener('click', e => {
    if (e.target?.matches?.('[data-roster-overlay]')) closeModal();
  });

  // Escape ferme
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal) closeModal();
  });

  /* ── exports ────────────────────────────────────────────── */

  window.RosterModule = {
    applyOverlayToJDATA,
    openCreate,
    openManage,
    closeModal,
    handleAction,
    addPlayer,
    renamePlayer,
    removePlayer,
  };

  // Applique l'overlay dès le chargement et déclenche un re-render
  applyOverlayToJDATA();
  if (utils()?.renderAll) setTimeout(() => utils().renderAll(), 0);
})();

/**
 * injury.js — Suivi blessure / disponibilité par joueur.
 *
 * Modèle : state.data[cat][pid].injuries = [{ id, type, start, end, zone, note, severity, educator_name }]
 *   type     ∈ 'blessure' | 'maladie' | 'perso' | 'protocole'
 *   start    YYYY-MM-DD  (obligatoire)
 *   end      YYYY-MM-DD  (null = en cours)
 *   zone     texte libre (ex. "Cheville droite", "Ischio gauche")
 *   severity ∈ 'légère' | 'modérée' | 'sévère'  (optionnel)
 *   note     texte libre (description, recommandation médicale)
 *
 * Le joueur est considéré "indispo" si une période active (end null OU end >= today).
 *
 * Expose : window.InjuryModule.{
 *   list, add, update, remove, currentStatus, isAvailable, daysOff,
 *   renderWidget(pid), openModal(pid), closeModal, handleAction, countByStatus(cat)
 * }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const state = () => window.appState;
  const utils = () => window.appUtils;

  const TYPES = [
    { key: 'blessure',   label: 'Blessure',   icon: '🤕', color: '#d85a30', bg: '#faece7' },
    { key: 'maladie',    label: 'Maladie',    icon: '🤒', color: '#ba7517', bg: '#faeeda' },
    { key: 'perso',      label: 'Personnel',  icon: '📅', color: '#5e5b54', bg: '#f4efe7' },
    { key: 'protocole',  label: 'Protocole',  icon: '⚕',  color: '#185fa5', bg: '#e6f1fb' },
  ];
  const SEVERITIES = [
    { key: 'legere',  label: 'Légère',  color: '#27500a' },
    { key: 'moderee', label: 'Modérée', color: '#ba7517' },
    { key: 'severe',  label: 'Sévère',  color: '#712b13' },
  ];

  /* ── helpers data ─────────────────────────────────────── */

  function ensure(cat, pid) {
    const s = state();
    if (!s) return [];
    if (!s.data[cat][pid]) s.data[cat][pid] = {};
    if (!Array.isArray(s.data[cat][pid].injuries)) s.data[cat][pid].injuries = [];
    return s.data[cat][pid].injuries;
  }
  function list(pid, cat = state()?.cat) { return ensure(cat, pid); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function dateLte(a, b) { return (a || '') <= (b || ''); }

  function add(pid, entry) {
    const cat = state().cat;
    const arr = ensure(cat, pid);
    const e = {
      id: uid(),
      type: entry.type || 'blessure',
      start: entry.start || todayIso(),
      end: entry.end || null,
      zone: entry.zone || '',
      severity: entry.severity || '',
      note: entry.note || '',
      educator_name: window.EducatorModule?.getEducatorName?.() || '',
    };
    arr.push(e);
    arr.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    utils()?.schedulePersist?.('Indispo enregistrée');
    return e;
  }
  function update(pid, id, patch) {
    const arr = list(pid);
    const idx = arr.findIndex(e => e.id === id);
    if (idx < 0) return false;
    arr[idx] = { ...arr[idx], ...patch };
    utils()?.schedulePersist?.('Indispo mise à jour');
    return true;
  }
  function remove(pid, id) {
    const arr = list(pid);
    const idx = arr.findIndex(e => e.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    utils()?.schedulePersist?.('Indispo supprimée');
    return true;
  }

  /* ── statut courant ──────────────────────────────────── */

  function currentStatus(pid, cat = state()?.cat) {
    const today = todayIso();
    const arr = list(pid, cat);
    const active = arr.find(e =>
      dateLte(e.start, today) && (!e.end || today <= e.end)
    );
    return active || null;
  }
  function isAvailable(pid, cat = state()?.cat) { return !currentStatus(pid, cat); }
  function daysOff(e) {
    if (!e?.start) return null;
    const s = new Date(e.start).getTime();
    const eTs = e.end ? new Date(e.end).getTime() : Date.now();
    return Math.max(0, Math.round((eTs - s) / 86400000));
  }

  /* ── statistiques catégorie ──────────────────────────── */

  function countByStatus(cat) {
    const players = window.JDATA?.[cat]?.players || [];
    let available = 0, injured = 0, sick = 0, other = 0;
    players.forEach(p => {
      const cs = currentStatus(p.name, cat);
      if (!cs) available++;
      else if (cs.type === 'blessure') injured++;
      else if (cs.type === 'maladie') sick++;
      else other++;
    });
    return { available, injured, sick, other, total: players.length };
  }

  /* ── widget fiche joueur ─────────────────────────────── */

  function renderWidget(pid) {
    const cs = currentStatus(pid);
    const all = list(pid).slice(0, 6);
    const t = cs ? TYPES.find(x => x.key === cs.type) || TYPES[0] : null;
    const headBadge = cs
      ? `<span class="inj-status-pill" style="background:${t.bg};color:${t.color};border-color:${t.color}">
          ${t.icon} ${h(t.label)}${cs.zone ? ' · ' + h(cs.zone) : ''}
          ${cs.end ? ' (jusqu\'au ' + new Date(cs.end).toLocaleDateString('fr-FR') + ')' : ' (en cours)'}
        </span>`
      : '<span class="inj-status-pill inj-status-pill--ok">✓ Disponible</span>';

    const histo = all.length ? all.map(e => {
      const td = TYPES.find(x => x.key === e.type) || TYPES[0];
      const sd = SEVERITIES.find(x => x.key === e.severity);
      const dur = daysOff(e);
      const dateStr = e.start ? new Date(e.start).toLocaleDateString('fr-FR') : '?';
      const endStr = e.end ? new Date(e.end).toLocaleDateString('fr-FR') : 'en cours';
      return `<div class="inj-row">
        <span class="inj-icon" style="color:${td.color}">${td.icon}</span>
        <span class="inj-period">${h(dateStr)} → ${h(endStr)}</span>
        <span class="inj-type">${h(td.label)}${e.zone ? ' · ' + h(e.zone) : ''}</span>
        ${sd ? `<span class="inj-sev" style="color:${sd.color}">${h(sd.label)}</span>` : ''}
        <span class="inj-days">${dur != null ? dur + 'j' : ''}</span>
        <button class="att-del" type="button"
          data-injury-action="remove" data-id="${h(e.id)}" data-pid="${h(pid)}"
          aria-label="Supprimer">×</button>
      </div>`;
    }).join('') : `<div class="dash-empty"><div class="dash-empty-msg">Aucune indisponibilité</div></div>`;

    return `<div class="detail-card inj-card">
      <div class="card-head">
        <div><div class="card-kicker">Disponibilité</div><h3>Blessures / Indispos</h3></div>
        <button class="btn btn-primary" type="button" data-injury-action="open-modal" data-pid="${h(pid)}">+ Déclarer</button>
      </div>
      <div class="inj-status-current">${headBadge}</div>
      <div class="inj-recent">${histo}</div>
    </div>`;
  }

  /* ── modal saisie ────────────────────────────────────── */

  let modalState = null;

  function openModal(pid) {
    modalState = {
      pid,
      draft: {
        type: 'blessure',
        start: todayIso(),
        end: '',
        zone: '',
        severity: 'legere',
        note: '',
      },
    };
    renderModal();
  }
  function closeModal() { modalState = null; renderModal(); }

  function renderModal() {
    let el = document.querySelector('#injury-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'injury-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modalState ? renderOverlay() : '';
  }
  function renderOverlay() {
    const d = modalState.draft;
    const typeBtns = TYPES.map(t => `<button class="foot-btn ${d.type === t.key ? 'on' : ''}" type="button"
      data-injury-action="set-type" data-val="${h(t.key)}">${t.icon} ${h(t.label)}</button>`).join('');
    const sevBtns = SEVERITIES.map(s => `<button class="att-status-btn ${d.severity === s.key ? 'on' : ''}" type="button"
      data-injury-action="set-severity" data-val="${h(s.key)}"
      style="${d.severity === s.key ? `border-color:${s.color};color:${s.color}` : ''}">${h(s.label)}</button>`).join('');
    return `<div class="modal-overlay" data-injury-overlay>
      <div class="modal-box" style="max-width:520px">
        <div class="modal-head">
          <div><div class="card-kicker">${h(modalState.pid)}</div><h3>Déclarer une indispo</h3></div>
          <button class="modal-close" type="button" data-injury-action="close">×</button>
        </div>
        <div class="field-group" style="margin-bottom:10px">
          <label class="field-label">Type</label>
          <div class="foot-row" style="flex-wrap:wrap">${typeBtns}</div>
        </div>
        <div class="form-grid">
          <div class="field-group">
            <label class="field-label">Début</label>
            <input class="field-input" type="date" value="${h(d.start)}"
              data-injury-action="set-field" data-key="start">
          </div>
          <div class="field-group">
            <label class="field-label">Fin (vide = en cours)</label>
            <input class="field-input" type="date" value="${h(d.end)}"
              data-injury-action="set-field" data-key="end">
          </div>
          <div class="field-group">
            <label class="field-label">Zone</label>
            <input class="field-input" type="text" value="${h(d.zone)}"
              placeholder="Cheville, ischio, genou..." data-injury-action="set-field" data-key="zone">
          </div>
          <div class="field-group">
            <label class="field-label">Gravité (si blessure)</label>
            <div class="att-status-row" style="grid-template-columns:repeat(3,1fr)">${sevBtns}</div>
          </div>
        </div>
        <div class="field-group" style="margin-top:10px">
          <label class="field-label">Note (optionnelle)</label>
          <textarea class="field-input" rows="2" placeholder="Description, recommandation médicale..."
            data-injury-action="set-field" data-key="note">${h(d.note)}</textarea>
        </div>
        <div class="modal-footer">
          <span style="flex:1"></span>
          <button class="btn-ghost" type="button" data-injury-action="close">Annuler</button>
          <button class="btn-primary" type="button" data-injury-action="save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  /* ── handler ──────────────────────────────────────────── */

  function handleAction(target) {
    const a = target.dataset.injuryAction;
    if (!a) return false;
    if (a === 'open-modal') { openModal(target.dataset.pid); return true; }
    if (a === 'close')      { closeModal(); return true; }
    if (a === 'set-type')   { modalState.draft.type = target.dataset.val; renderModal(); return true; }
    if (a === 'set-severity'){ modalState.draft.severity = target.dataset.val; renderModal(); return true; }
    if (a === 'set-field')  { modalState.draft[target.dataset.key] = target.value || ''; return true; }
    if (a === 'save') {
      const e = add(modalState.pid, modalState.draft);
      utils()?.showToast?.('Indispo enregistrée');
      closeModal();
      utils()?.renderAll?.();
      return true;
    }
    if (a === 'remove') {
      if (!confirm('Supprimer cette indisponibilité ?')) return true;
      remove(target.dataset.pid, target.dataset.id);
      utils()?.showToast?.('Supprimée');
      utils()?.renderAll?.();
      return true;
    }
    return false;
  }

  /* ── events globaux ──────────────────────────────────── */

  document.addEventListener('input', e => {
    if (!modalState) return;
    if (e.target.dataset?.injuryAction === 'set-field') handleAction(e.target);
  });
  document.addEventListener('click', e => {
    if (!modalState) return;
    if (e.target?.matches?.('[data-injury-overlay]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (modalState && e.key === 'Escape') closeModal();
  });

  /* ── exports ─────────────────────────────────────────── */

  window.InjuryModule = {
    TYPES, SEVERITIES,
    list, add, update, remove,
    currentStatus, isAvailable, daysOff, countByStatus,
    renderWidget, openModal, closeModal, handleAction,
  };
})();

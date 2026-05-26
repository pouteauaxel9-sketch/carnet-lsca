/**
 * attendance.js — Présence / assiduité (entraînements + matchs).
 *
 * Stockage : state.data[cat][pid].attendance[season] = [{ id, date, type, status, note }]
 *   type   ∈ 'training' | 'match'
 *   status ∈ 'present' | 'late' | 'absent' | 'injured'
 *
 * Expose : window.AttendanceModule.{ list, add, remove, update, rate,
 *           renderWidget(pid), renderCategoryTable(cat), openModal(pid),
 *           closeModal, handleAction }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  const state = () => window.appState;
  const utils = () => window.appUtils;

  const STATUSES = [
    { key: 'present',  label: 'Présent',  color: '#27500a', bg: '#eaf3de', icon: '✓' },
    { key: 'late',     label: 'Retard',   color: '#633806', bg: '#faeeda', icon: '~' },
    { key: 'absent',   label: 'Absent',   color: '#712b13', bg: '#faece7', icon: '✗' },
    { key: 'injured',  label: 'Blessé',   color: '#5e5b54', bg: '#f4efe7', icon: '⚕' },
  ];
  const TYPES = [
    { key: 'training', label: 'Entraînement' },
    { key: 'match',    label: 'Match' },
  ];

  /* ── data ─────────────────────────────────────────────── */

  function ensure(cat, pid, season) {
    const s = state();
    if (!s) return null;
    if (!s.data[cat][pid]) s.data[cat][pid] = {};
    if (!s.data[cat][pid].attendance) s.data[cat][pid].attendance = {};
    if (!s.data[cat][pid].attendance[season]) s.data[cat][pid].attendance[season] = [];
    return s.data[cat][pid].attendance[season];
  }

  function list(pid, season = state()?.season, cat = state()?.cat) {
    return ensure(cat, pid, season) || [];
  }

  function add(pid, entry) {
    const cat = state().cat;
    const season = state().season;
    const arr = ensure(cat, pid, season);
    if (!arr) return null;
    const e = {
      id: uid(),
      date: entry.date || new Date().toISOString().split('T')[0],
      type: entry.type || 'training',
      status: entry.status || 'present',
      note: entry.note || '',
      educator_name: window.EducatorModule?.getEducatorName() || '',
    };
    arr.push(e);
    arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    utils()?.schedulePersist('Présence enregistrée');
    return e;
  }

  function update(pid, id, patch) {
    const arr = list(pid);
    const idx = arr.findIndex(e => e.id === id);
    if (idx < 0) return false;
    arr[idx] = { ...arr[idx], ...patch };
    utils()?.schedulePersist('Présence mise à jour');
    return true;
  }

  function remove(pid, id) {
    const arr = list(pid);
    const idx = arr.findIndex(e => e.id === id);
    if (idx < 0) return false;
    arr.splice(idx, 1);
    utils()?.schedulePersist('Présence supprimée');
    return true;
  }

  function rate(pid, opts = {}) {
    const arr = list(pid, opts.season, opts.cat);
    let scoped = arr;
    if (opts.type) scoped = scoped.filter(e => e.type === opts.type);
    if (!scoped.length) return null;
    const present = scoped.filter(e => e.status === 'present' || e.status === 'late').length;
    return Math.round((present / scoped.length) * 100);
  }

  /* ── widget fiche joueur ──────────────────────────────── */

  function renderWidget(pid) {
    const s = state();
    if (!s) return '';
    const all = list(pid);
    const trainingRate = rate(pid, { type: 'training' });
    const matchRate = rate(pid, { type: 'match' });
    const globalRate = rate(pid);

    const last5 = all.slice(0, 5);
    const last5Html = last5.length
      ? last5.map(e => {
          const sd = STATUSES.find(x => x.key === e.status) || STATUSES[0];
          const td = TYPES.find(x => x.key === e.type) || TYPES[0];
          const dateStr = e.date ? new Date(e.date).toLocaleDateString('fr-FR') : '—';
          return `<div class="att-row">
            <span class="att-date">${h(dateStr)}</span>
            <span class="att-type">${h(td.label)}</span>
            <span class="att-status" style="background:${sd.bg};color:${sd.color}">${sd.icon} ${h(sd.label)}</span>
            ${e.note ? `<span class="att-note">${h(e.note)}</span>` : ''}
            <button class="att-del" type="button"
              data-attendance-action="remove" data-id="${h(e.id)}" data-pid="${h(pid)}"
              aria-label="Supprimer la ligne">×</button>
          </div>`;
        }).join('')
      : `<div class="dash-empty"><div class="dash-empty-msg">Aucun pointage</div>
          <div class="dash-empty-hint">Utilise « Pointer » pour ajouter un entraînement ou un match.</div></div>`;

    return `<div class="detail-card att-card">
      <div class="card-head">
        <div><div class="card-kicker">Assiduité</div><h3>Présence ${all.length ? `(${all.length})` : ''}</h3></div>
        <button class="btn btn-primary" type="button" data-attendance-action="open-modal" data-pid="${h(pid)}">+ Pointer</button>
      </div>
      <div class="att-rates">
        <div class="att-rate-block">
          <span>Taux global</span>
          <strong style="color:${rateColor(globalRate)}">${globalRate != null ? globalRate + '%' : '—'}</strong>
        </div>
        <div class="att-rate-block">
          <span>Entraînements</span>
          <strong style="color:${rateColor(trainingRate)}">${trainingRate != null ? trainingRate + '%' : '—'}</strong>
        </div>
        <div class="att-rate-block">
          <span>Matchs</span>
          <strong style="color:${rateColor(matchRate)}">${matchRate != null ? matchRate + '%' : '—'}</strong>
        </div>
      </div>
      <div class="att-recent">${last5Html}</div>
    </div>`;
  }

  function rateColor(r) {
    if (r == null) return '#8d897f';
    if (r >= 85) return '#639922';
    if (r >= 65) return '#ba7517';
    return '#d85a30';
  }

  /* ── tableau catégorie ────────────────────────────────── */

  function renderCategoryTable(cat) {
    const players = window.JDATA?.[cat]?.players || [];
    if (!players.length) return '';
    const rows = players.map(p => {
      const t = rate(p.name, { type: 'training', cat });
      const m = rate(p.name, { type: 'match', cat });
      const all = list(p.name, state().season, cat);
      return {
        pid: p.name,
        training: t,
        match: m,
        count: all.length,
        last: all[0]?.date || '',
      };
    });
    rows.sort((a, b) => {
      const av = a.training ?? -1; const bv = b.training ?? -1;
      return bv - av;
    });
    return `<section class="dashboard-card span-2">
      <div class="card-head"><div><div class="card-kicker">Assiduité</div><h2>Taux de présence (saison)</h2></div></div>
      <div class="cat-table-wrap">
        <table class="cat-table">
          <thead><tr><th>Joueur</th><th>Entraînements</th><th>Matchs</th><th>Pointages</th><th>Dernière</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr class="cat-table-row" data-action="select-player" data-player="${h(r.pid)}">
              <td><strong>${h(r.pid)}</strong></td>
              <td><span style="color:${rateColor(r.training)};font-weight:700">${r.training != null ? r.training + '%' : '—'}</span></td>
              <td><span style="color:${rateColor(r.match)};font-weight:700">${r.match != null ? r.match + '%' : '—'}</span></td>
              <td>${r.count}</td>
              <td>${r.last ? new Date(r.last).toLocaleDateString('fr-FR') : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  /* ── modal ─────────────────────────────────────────────── */

  let modalState = null;
  // modalState = { pid, draft: { date, type, status, note } }

  function openModal(pid) {
    modalState = {
      pid,
      draft: {
        date: new Date().toISOString().split('T')[0],
        type: 'training',
        status: 'present',
        note: '',
      },
    };
    renderModal();
  }
  function closeModal() {
    modalState = null;
    renderModal();
  }

  function renderModal() {
    let el = document.querySelector('#attendance-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'attendance-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modalState ? renderOverlay() : '';
  }

  function renderOverlay() {
    const d = modalState.draft;
    const typeBtns = TYPES.map(t => `<button class="foot-btn ${d.type === t.key ? 'on' : ''}" type="button"
      data-attendance-action="set-type" data-val="${h(t.key)}">${h(t.label)}</button>`).join('');
    const statusBtns = STATUSES.map(s => `<button class="att-status-btn ${d.status === s.key ? 'on' : ''}" type="button"
      data-attendance-action="set-status" data-val="${h(s.key)}"
      style="${d.status === s.key ? `background:${s.bg};color:${s.color};border-color:${s.color}` : ''}">
      ${h(s.icon)} ${h(s.label)}
    </button>`).join('');

    return `
      <div class="modal-overlay" data-attendance-overlay>
        <div class="modal-box" style="max-width:480px">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(modalState.pid)}</div>
              <h3>Pointer une présence</h3>
            </div>
            <button class="modal-close" type="button" data-attendance-action="close">×</button>
          </div>
          <div class="field-group" style="margin-bottom:10px">
            <label class="field-label">Date</label>
            <input class="field-input" type="date" value="${h(d.date)}"
              data-attendance-action="set-field" data-key="date">
          </div>
          <div class="field-group" style="margin-bottom:10px">
            <label class="field-label">Type</label>
            <div class="foot-row">${typeBtns}</div>
          </div>
          <div class="field-group" style="margin-bottom:10px">
            <label class="field-label">Statut</label>
            <div class="att-status-row">${statusBtns}</div>
          </div>
          <div class="field-group" style="margin-bottom:10px">
            <label class="field-label">Note (optionnelle)</label>
            <input class="field-input" type="text" value="${h(d.note)}"
              placeholder="Ex. retard 10 min..."
              data-attendance-action="set-field" data-key="note">
          </div>
          <div class="modal-footer">
            <span style="flex:1"></span>
            <button class="btn-ghost" type="button" data-attendance-action="close">Annuler</button>
            <button class="btn-primary" type="button" data-attendance-action="save">Enregistrer</button>
          </div>
        </div>
      </div>`;
  }

  /* ── actions ──────────────────────────────────────────── */

  function handleAction(target) {
    const a = target.dataset.attendanceAction;
    if (!a) return false;
    if (a === 'open-modal') {
      openModal(target.dataset.pid);
      return true;
    }
    if (a === 'close')   { closeModal(); return true; }
    if (a === 'set-type') {
      modalState.draft.type = target.dataset.val;
      renderModal();
      return true;
    }
    if (a === 'set-status') {
      modalState.draft.status = target.dataset.val;
      renderModal();
      return true;
    }
    if (a === 'set-field') {
      modalState.draft[target.dataset.key] = target.value || '';
      return true;
    }
    if (a === 'save') {
      add(modalState.pid, modalState.draft);
      utils()?.showToast('Présence enregistrée');
      closeModal();
      utils()?.renderAll();
      return true;
    }
    if (a === 'remove') {
      if (!confirm('Supprimer ce pointage ?')) return true;
      remove(target.dataset.pid, target.dataset.id);
      utils()?.showToast('Pointage supprimé');
      utils()?.renderAll();
      return true;
    }
    return false;
  }

  /* ── events ──────────────────────────────────────────── */

  document.addEventListener('input', e => {
    if (!modalState) return;
    if (e.target.dataset?.attendanceAction === 'set-field') handleAction(e.target);
  });
  document.addEventListener('click', e => {
    if (!modalState) return;
    if (e.target?.matches?.('[data-attendance-overlay]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (modalState && e.key === 'Escape') closeModal();
  });

  /* ── exports ──────────────────────────────────────────── */

  window.AttendanceModule = {
    STATUSES, TYPES,
    list, add, update, remove, rate,
    renderWidget, renderCategoryTable,
    openModal, closeModal, handleAction,
  };
})();

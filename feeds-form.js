/**
 * feeds-form.js — Édition tabulaire des classements manuels.
 *
 * (Les modes 'upcoming' et 'past' ont été retirés en 2026-08 : le dashboard
 *  n'affiche plus que les classements.)
 *
 * Expose window.FeedsFormModule.{ openModal, closeModal, handleAction, getRowsByType }
 */
(function () {
  'use strict';

  const FEEDS_KEY = 'cfb6_feeds';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadFeeds() {
    try { return JSON.parse(localStorage.getItem(FEEDS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveFeeds(d) { localStorage.setItem(FEEDS_KEY, JSON.stringify(d)); }

  /* ── colonnes par type ────────────────────────────────── */

  const COLUMNS = {
    standings: [
      { key: 'team',          label: 'Équipe',     type: 'text',   placeholder: 'U13 A' },
      { key: 'rank',          label: 'Place',      type: 'text',   placeholder: '3e', width: 80 },
      { key: 'points',        label: 'Pts',        type: 'number', placeholder: '24', width: 70 },
      { key: 'played',        label: 'Jo.',        type: 'number', placeholder: '14', width: 70 },
      { key: 'won',           label: 'G',          type: 'number', placeholder: '8',  width: 60 },
      { key: 'draw',          label: 'N',          type: 'number', placeholder: '0',  width: 60 },
      { key: 'lost',          label: 'P',          type: 'number', placeholder: '6',  width: 60 },
      { key: 'diff',          label: 'Diff',       type: 'text',   placeholder: '+5', width: 80 },
      { key: 'competition',   label: 'Compétition', type: 'text',  placeholder: 'Championnat District U13' },
      { key: 'isOurTeam',     label: 'Nôtre',      type: 'check',  width: 70 },
    ],
  };

  const TYPE_TITLES = {
    standings: 'Classements',
  };

  /* ── état session ─────────────────────────────────────── */

  // session locale pour la modal active
  let session = null;
  // session = { type, cat, rows: [...] }

  function getRowsByType(type, cat) {
    const feeds = loadFeeds();
    const stored = feeds[cat]?.[type];
    if (Array.isArray(stored)) return stored.slice();
    return [];
  }

  function start(type, cat) {
    session = { type, cat, rows: getRowsByType(type, cat) };
  }

  function commit() {
    const feeds = loadFeeds();
    if (!feeds[session.cat]) feeds[session.cat] = {};
    feeds[session.cat][session.type] = session.rows.filter(r => isRowMeaningful(r));
    if (!feeds[session.cat][session.type].length) delete feeds[session.cat][session.type];
    if (!Object.keys(feeds[session.cat]).length) delete feeds[session.cat];
    saveFeeds(feeds);
  }

  function isRowMeaningful(row) {
    const cols = COLUMNS[session.type];
    return cols.some(c => {
      const v = row?.[c.key];
      if (c.type === 'check') return false;
      return v !== '' && v != null;
    });
  }

  /* ── rendu ────────────────────────────────────────────── */

  function renderModalRoot() {
    let el = document.querySelector('#feeds-form-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'feeds-form-modal-root';
      document.body.appendChild(el);
    }
    if (!session) { el.innerHTML = ''; return; }
    el.innerHTML = buildOverlay();
  }

  function openModal(type, cat) {
    start(type, cat);
    renderModalRoot();
  }

  function closeModal() {
    session = null;
    renderModalRoot();
  }

  function buildOverlay() {
    const type = session.type;
    const cat = session.cat;
    const CAT_LABELS = window.CAT_LABELS || {};
    const catLabel = CAT_LABELS[cat] || cat?.toUpperCase() || '';
    const title = TYPE_TITLES[type] || type;
    const cols = COLUMNS[type];

    const head = `<thead><tr>
      <th class="ff-rownum">#</th>
      ${cols.map(c => `<th${c.width ? ` style="width:${c.width}px"` : ''}>${h(c.label)}</th>`).join('')}
      <th class="ff-actions" style="width:60px"></th>
    </tr></thead>`;

    const rowsHtml = session.rows.length
      ? session.rows.map((r, i) => renderRow(i, r)).join('')
      : `<tr><td colspan="${cols.length + 2}" class="ff-empty">
          Aucune ligne. Clique sur « + Ajouter une ligne » pour commencer.
        </td></tr>`;

    return `
      <div class="modal-overlay" data-feeds-overlay>
        <div class="modal-box modal-box--xl">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(catLabel)}</div>
              <h3>${h(title)}</h3>
            </div>
            <button class="modal-close" type="button" data-feeds-action="close">×</button>
          </div>

          <p class="modal-hint">
            Saisis les données ligne par ligne. Coche « Nôtre » ou « Dom. » selon le contexte.
            Les lignes vides sont automatiquement ignorées à l'enregistrement.
          </p>

          <div class="ff-table-wrap">
            <table class="ff-table">
              ${head}
              <tbody id="ff-tbody">${rowsHtml}</tbody>
            </table>
          </div>

          <div class="modal-footer">
            <button class="btn-ghost" type="button" data-feeds-action="add-row">+ Ajouter une ligne</button>
            ${session.rows.length ? `<button class="btn-ghost btn-danger" type="button" data-feeds-action="clear-all">Tout effacer</button>` : ''}
            <span style="flex:1"></span>
            <button class="btn-ghost" type="button" data-feeds-action="close">Annuler</button>
            <button class="btn-primary" type="button" data-feeds-action="save">Enregistrer</button>
          </div>
        </div>
      </div>`;
  }

  function renderRow(idx, row) {
    const cols = COLUMNS[session.type];
    const cells = cols.map(c => {
      const v = row?.[c.key] ?? '';
      if (c.type === 'check') {
        const checked = v === true || v === 'true' ? 'checked' : '';
        return `<td style="text-align:center">
          <input type="checkbox" ${checked}
            data-feeds-action="set-cell" data-row="${idx}" data-key="${h(c.key)}">
        </td>`;
      }
      const inputType = c.type === 'number' ? 'number' : 'text';
      return `<td>
        <input class="ff-cell-input" type="${inputType}"
          value="${h(v)}"
          placeholder="${h(c.placeholder || '')}"
          data-feeds-action="set-cell" data-row="${idx}" data-key="${h(c.key)}">
      </td>`;
    }).join('');
    return `<tr>
      <td class="ff-rownum">${idx + 1}</td>
      ${cells}
      <td class="ff-actions">
        <button class="btn-ghost btn-danger" type="button"
          data-feeds-action="remove-row" data-row="${idx}" aria-label="Supprimer la ligne ${idx + 1}">×</button>
      </td>
    </tr>`;
  }

  function refreshTable() {
    const tbody = document.querySelector('#ff-tbody');
    if (!tbody) return;
    const cols = COLUMNS[session.type];
    tbody.innerHTML = session.rows.length
      ? session.rows.map((r, i) => renderRow(i, r)).join('')
      : `<tr><td colspan="${cols.length + 2}" class="ff-empty">
          Aucune ligne. Clique sur « + Ajouter une ligne » pour commencer.
        </td></tr>`;
  }

  /* ── actions ──────────────────────────────────────────── */

  function handleAction(target) {
    if (!session) return false;
    const a = target.dataset.feedsAction;
    if (!a) return false;
    if (a === 'close') { closeModal(); return true; }
    if (a === 'add-row') {
      const blank = {};
      COLUMNS[session.type].forEach(c => { blank[c.key] = c.type === 'check' ? false : ''; });
      session.rows.push(blank);
      refreshTable();
      return true;
    }
    if (a === 'remove-row') {
      session.rows.splice(parseInt(target.dataset.row), 1);
      refreshTable();
      return true;
    }
    if (a === 'clear-all') {
      if (!confirm('Effacer toutes les lignes ?')) return true;
      session.rows = [];
      refreshTable();
      return true;
    }
    if (a === 'set-cell') {
      const idx = parseInt(target.dataset.row);
      const key = target.dataset.key;
      const col = COLUMNS[session.type].find(c => c.key === key);
      if (!col) return true;
      if (col.type === 'check') {
        session.rows[idx][key] = target.checked;
      } else if (col.type === 'number') {
        session.rows[idx][key] = target.value === '' ? '' : Number(target.value);
      } else {
        session.rows[idx][key] = target.value;
      }
      return true;
    }
    if (a === 'save') {
      commit();
      closeModal();
      window.appUtils?.showToast('Données enregistrées');
      window.appUtils?.renderAll();
      return true;
    }
    return false;
  }

  /* ── events ───────────────────────────────────────────── */

  document.addEventListener('input', e => {
    if (!session) return;
    if (e.target.dataset?.feedsAction === 'set-cell') handleAction(e.target);
  });
  document.addEventListener('change', e => {
    if (!session) return;
    if (e.target.dataset?.feedsAction === 'set-cell' &&
        e.target.type === 'checkbox') handleAction(e.target);
  });
  document.addEventListener('click', e => {
    if (!session) return;
    if (e.target?.matches?.('[data-feeds-overlay]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (session && e.key === 'Escape') closeModal();
  });

  /* ── exports ──────────────────────────────────────────── */

  window.FeedsFormModule = {
    openModal,
    closeModal,
    handleAction,
    getRowsByType,
    isOpen: () => session !== null,
  };
})();

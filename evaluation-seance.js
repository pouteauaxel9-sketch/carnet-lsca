(function () {
  'use strict';

  /* ── Constantes ──────────────────────────────────────── */

  const ATELIERS = [
    { key: 'jonglerie_fort',    label: 'Jonglerie pied fort',   type: 'int',   unit: 'touches' },
    { key: 'jonglerie_faible',  label: 'Jonglerie pied faible', type: 'int',   unit: 'touches' },
    { key: 'slalom',            label: 'Slalom chrono',          type: 'float', unit: 's', chrono: true },
    { key: 'frappe_precision',  label: 'Frappe précision',       type: 'score', unit: '/5', max: 5 },
    { key: 'dribble_1v1',       label: 'Dribble 1v1',            type: 'score', unit: '/3', max: 3 },
    { key: 'passe_courte',      label: 'Passe courte',           type: 'score', unit: '/5', max: 5 },
    { key: 'sprint_20m',        label: 'Sprint 20m',             type: 'float', unit: 's', chrono: true }
  ];

  const PERF_REF = {
    u9:  { slalom: { excellent: 14, bien: 17 }, sprint_20m: { excellent: 4.2, bien: 4.8 } },
    u11: { slalom: { excellent: 12, bien: 15 }, sprint_20m: { excellent: 3.9, bien: 4.4 } },
    u13: { slalom: { excellent: 11, bien: 13 }, sprint_20m: { excellent: 3.6, bien: 4.0 } }
  };

  const SLOT_LABELS = ['Séance 1', 'Séance 2', 'Séance 3'];

  /* ── Helpers ─────────────────────────────────────────── */

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function app() { return window.appState; }
  function utils() { return window.appUtils; }

  function juggleTarget(cat) { return window.JDATA?.[cat]?.target ?? 50; }

  /* ── Calcul de score ─────────────────────────────────── */

  function scoreAtelier(key, value, cat) {
    if (value == null || value === '' || isNaN(parseFloat(value))) return null;
    const v = parseFloat(value);
    if (v < 0) return null;

    if (key === 'jonglerie_fort' || key === 'jonglerie_faible') {
      const target = juggleTarget(cat);
      return Math.min(100, Math.round((v / target) * 100));
    }
    if (key === 'frappe_precision') return Math.round((v / 5) * 100);
    if (key === 'dribble_1v1')      return Math.round((v / 3) * 100);
    if (key === 'passe_courte')     return Math.round((v / 5) * 100);

    if (key === 'slalom' || key === 'sprint_20m') {
      const ref = PERF_REF[cat]?.[key];
      if (!ref) return null;
      if (v <= ref.excellent) return 100;
      if (v <= ref.bien)      return 70;
      return 40;
    }
    return null;
  }

  function chronoStatus(key, value, cat) {
    if (value == null || value === '') return null;
    const ref = PERF_REF[cat]?.[key];
    if (!ref) return null;
    const v = parseFloat(value);
    if (isNaN(v)) return null;
    if (v <= ref.excellent) return 'excellent';
    if (v <= ref.bien)      return 'bien';
    return 'a-travailler';
  }

  function seanceScore(seance, cat) {
    if (!seance?.ateliers) return 0;
    const scores = ATELIERS
      .map(a => scoreAtelier(a.key, seance.ateliers[a.key], cat))
      .filter(s => s !== null);
    if (!scores.length) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /* ── Données ─────────────────────────────────────────── */

  function ensureSeances(cat, pid) {
    const state = app();
    if (!state) return;
    if (!state.data[cat][pid]) state.data[cat][pid] = {};
    if (!state.data[cat][pid].seances) state.data[cat][pid].seances = {};
  }

  function getSeances(cat, pid, season) {
    ensureSeances(cat, pid);
    const state = app();
    const arr = state.data[cat][pid].seances[season] || [];
    // Garantir 3 slots (null = vide)
    while (arr.length < 3) arr.push(null);
    state.data[cat][pid].seances[season] = arr;
    return arr;
  }

  /* ── État éphémère ───────────────────────────────────── */

  let editingSlot = null;
  let seanceCharts = {};

  /* ── Rendu HTML ──────────────────────────────────────── */

  function renderSlotEmpty(slotIndex) {
    return `<div class="seance-slot seance-slot--empty">
      <div class="seance-slot-label">${h(SLOT_LABELS[slotIndex])}</div>
      <div class="seance-slot-hint">Non effectuée</div>
      <button class="btn btn-primary" type="button"
        data-seance-action="edit-seance" data-slot="${slotIndex}">Saisir</button>
    </div>`;
  }

  function renderSlotFilled(slotIndex, seance, cat) {
    const score = seanceScore(seance, cat);
    const scoreColor = score >= 70 ? '#639922' : score >= 45 ? '#ba7517' : '#d85a30';
    const dateStr = seance.date
      ? new Date(seance.date).toLocaleDateString('fr-FR')
      : '—';
    const educatorNote = seance.educator_name
      ? `<span class="obs-educator">${h(seance.educator_name)}</span>` : '';

    const rows = ATELIERS.map(a => {
      const val = seance.ateliers?.[a.key];
      let display = '—';
      if (val != null && val !== '') {
        display = a.chrono ? val + ' s' : a.max ? val + ' ' + a.unit : val + ' touches';
      }
      const sc   = scoreAtelier(a.key, val, cat);
      const cs   = a.chrono ? chronoStatus(a.key, val, cat) : null;
      const statusMap = { excellent: 'Excellent', bien: 'Bien', 'a-travailler': 'À travailler' };
      const clsMap    = { excellent: 'perf-excellent', bien: 'perf-bien', 'a-travailler': 'perf-travailler' };
      const badge = cs
        ? `<span class="seance-atelier-status ${clsMap[cs]}">${statusMap[cs]}</span>`
        : sc !== null ? `<span class="seance-atelier-score">${sc}%</span>` : '';
      return `<div class="seance-atelier-row">
        <span class="seance-atelier-name">${h(a.label)}</span>
        <span class="seance-atelier-val ${cs ? clsMap[cs] : ''}">${h(String(display))}</span>
        ${badge}
      </div>`;
    }).join('');

    return `<div class="seance-slot seance-slot--filled">
      <div class="seance-slot-head">
        <div>
          <div class="seance-slot-label">${h(SLOT_LABELS[slotIndex])}</div>
          <div class="seance-slot-date">${h(dateStr)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${educatorNote}
          <div class="seance-slot-score" style="color:${scoreColor}">${score}%</div>
        </div>
        <button class="btn" type="button"
          data-seance-action="edit-seance" data-slot="${slotIndex}">Modifier</button>
      </div>
      <div class="seance-ateliers">${rows}</div>
    </div>`;
  }

  function renderSlotForm(slotIndex, existing, cat) {
    const ateliers = existing?.ateliers || {};
    const date = existing?.date || new Date().toISOString().split('T')[0];
    const target = juggleTarget(cat);

    const fields = ATELIERS.map(a => {
      const val = ateliers[a.key] ?? '';
      const ref = PERF_REF[cat]?.[a.key];
      const refHint = ref
        ? `Réf ${cat.toUpperCase()} — excellent < ${ref.excellent} s, bien < ${ref.bien} s`
        : '';
      let extra = '';
      if (a.key === 'jonglerie_fort')   extra = ` (objectif : ${target})`;
      if (a.key === 'jonglerie_faible') extra = ` (objectif : ${target})`;

      let inputEl;
      if (a.type === 'score') {
        const opts = Array.from({ length: a.max + 1 }, (_, i) =>
          `<option value="${i}" ${String(val) === String(i) ? 'selected' : ''}>${i} / ${a.max}</option>`
        ).join('');
        inputEl = `<select class="field-input" data-seance-field="${a.key}">
          <option value="">—</option>${opts}</select>`;
      } else if (a.type === 'int') {
        const maxAttr = a.key === 'jonglerie_fort' ? ` max="${target}"` : '';
        inputEl = `<input class="field-input" type="number" min="0" step="1"${maxAttr}
          value="${h(String(val))}" data-seance-field="${a.key}"
          placeholder="touches${extra}">`;
      } else {
        inputEl = `<input class="field-input" type="number" min="0" step="0.1"
          value="${h(String(val))}" data-seance-field="${a.key}"
          placeholder="secondes">`;
      }

      return `<div class="field-group">
        <label class="field-label">${h(a.label)}
          <span class="field-unit">${h(a.unit)}</span>
        </label>
        ${inputEl}
        ${refHint ? `<div class="field-hint">${h(refHint)}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="seance-slot seance-slot--form" id="seance-form-${slotIndex}">
      <div class="seance-form-head">
        <strong>${h(SLOT_LABELS[slotIndex])}</strong>
        <button class="modal-close" type="button" data-seance-action="cancel-seance">×</button>
      </div>
      <div class="field-group" style="margin-bottom:14px">
        <label class="field-label">Date de la séance</label>
        <input class="field-input" type="date" id="seance-date-${slotIndex}" value="${h(date)}">
      </div>
      <div class="form-grid">${fields}</div>
      <div class="seance-form-footer">
        ${existing ? `<button class="btn-ghost btn-danger" type="button"
          data-seance-action="delete-seance" data-slot="${slotIndex}">Supprimer</button>` : ''}
        <span style="flex:1"></span>
        <button class="btn-ghost" type="button" data-seance-action="cancel-seance">Annuler</button>
        <button class="btn-primary" type="button"
          data-seance-action="save-seance" data-slot="${slotIndex}">Enregistrer</button>
      </div>
    </div>`;
  }

  function renderBody(pid) {
    const state = app();
    if (!state) return '<p>Application non initialisée.</p>';
    const { cat, season } = state;
    ensureSeances(cat, pid);
    const seances = getSeances(cat, pid, season);

    const slots = seances.map((seance, i) => {
      if (editingSlot === i) return renderSlotForm(i, seance, cat);
      if (!seance) return renderSlotEmpty(i);
      return renderSlotFilled(i, seance, cat);
    }).join('');

    const hasData = seances.some(Boolean);
    const chartsHtml = hasData ? `
      <div class="seance-charts-row">
        <div class="detail-card">
          <div class="card-kicker">Progression saison</div>
          <h3>Évolution S1 / S2 / S3</h3>
          <div class="chart-wrap-220"><canvas id="seance-season-chart"
            aria-label="Radar séances saison"></canvas></div>
        </div>
        <div class="detail-card">
          <div class="card-kicker">Inter-saisons</div>
          <h3>Même séance, saisons comparées</h3>
          <div class="chart-wrap-220" id="seance-compare-wrap">
            <canvas id="seance-compare-chart"
              aria-label="Comparaison inter-saisons"></canvas></div>
        </div>
      </div>` : '';

    return `<div class="seance-module">
      <div class="seance-intro">
        <div class="card-kicker">Ateliers terrain</div>
        <h3>Séances d'évaluation — Saison ${h(season)}</h3>
        <p class="insight-text">3 séances max par saison (S1, S2, S3). Chaque séance comprend 7 ateliers mesurés et chronométrés.</p>
      </div>
      <div class="seance-slots">${slots}</div>
      ${chartsHtml}
    </div>`;
  }

  /* ── Graphiques ──────────────────────────────────────── */

  function destroyCharts() {
    Object.values(seanceCharts).forEach(c => { try { c.destroy(); } catch (_) {} });
    seanceCharts = {};
  }

  function drawSeasonRadar(seances, cat) {
    const canvas = document.querySelector('#seance-season-chart');
    if (!canvas || !window.Chart) return;
    if (seanceCharts.season) { seanceCharts.season.destroy(); delete seanceCharts.season; }

    const shortLabels = ATELIERS.map(a =>
      a.label
        .replace('Jonglerie pied fort',   'Jongl. ♠')
        .replace('Jonglerie pied faible', 'Jongl. ♣')
        .replace('Slalom chrono', 'Slalom')
        .replace('Frappe précision', 'Frappe')
        .replace('Dribble 1v1', 'Dribble')
        .replace('Passe courte', 'Passe')
        .replace('Sprint 20m', 'Sprint')
    );

    const colors = ['#185fa5', '#0f6e56', '#854f0b'];
    const datasets = seances
      .map((s, i) => {
        if (!s) return null;
        return {
          label: SLOT_LABELS[i],
          data: ATELIERS.map(a => scoreAtelier(a.key, s.ateliers?.[a.key], cat) ?? null),
          backgroundColor: colors[i] + '20',
          borderColor: colors[i],
          borderWidth: 2,
          pointRadius: 3
        };
      })
      .filter(Boolean);

    if (!datasets.length) return;

    seanceCharts.season = new window.Chart(canvas, {
      type: 'radar',
      data: { labels: shortLabels, datasets },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#5e5b54', font: { size: 11 } } } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, backdropColor: 'transparent', color: '#8d897f', font: { size: 8 } },
            grid: { color: 'rgba(0,0,0,0.08)' },
            angleLines: { color: 'rgba(0,0,0,0.08)' },
            pointLabels: { color: '#5e5b54', font: { size: 9 } }
          }
        }
      }
    });
  }

  function drawCompareBar(pid, cat, season, seances) {
    const wrap = document.querySelector('#seance-compare-wrap');
    const canvas = document.querySelector('#seance-compare-chart');
    if (!canvas || !window.Chart) return;
    if (seanceCharts.compare) { seanceCharts.compare.destroy(); delete seanceCharts.compare; }

    const state = app();
    if (!state) return;
    const seasons = window.SEASONS || ['2025-2026', '2024-2025', '2023-2024'];

    // Trouver le premier slot renseigné comme référence de comparaison
    const refSlot = seances.findIndex(Boolean);
    const points = seasons.map(s => {
      const arr = state.data[cat]?.[pid]?.seances?.[s];
      if (!arr) return null;
      const seance = arr[refSlot >= 0 ? refSlot : 0];
      if (!seance) return null;
      return { season: s, score: seanceScore(seance, cat) };
    }).filter(Boolean);

    if (points.length < 2) {
      if (wrap) wrap.innerHTML = `<div class="dash-empty" style="margin:auto">
        <div class="dash-empty-msg">Données insuffisantes</div>
        <div class="dash-empty-hint">Complétez une autre saison pour comparer.</div>
      </div>`;
      return;
    }

    const colors = ['#185fa5', '#0f6e56', '#854f0b'];
    seanceCharts.compare = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: points.map(p => p.season),
        datasets: [{
          label: refSlot >= 0 ? SLOT_LABELS[refSlot] : 'Séance',
          data: points.map(p => p.score),
          backgroundColor: points.map((_, i) => colors[i % colors.length] + '30'),
          borderColor: points.map((_, i) => colors[i % colors.length]),
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#5e5b54' }, grid: { display: false } },
          y: { min: 0, max: 100,
            ticks: { color: '#5e5b54', callback: v => v + '%' },
            grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function afterRender(pid) {
    const state = app();
    if (!state || state.selSection !== 'seance') return;
    const { cat, season } = state;
    const seances = getSeances(cat, pid, season);
    setTimeout(() => {
      drawSeasonRadar(seances, cat);
      drawCompareBar(pid, cat, season, seances);
    }, 50);
  }

  /* ── Gestion des actions ─────────────────────────────── */

  function saveSeanceSlot(pid, slotIndex) {
    const state = app();
    if (!state) return;
    const { cat, season } = state;

    const dateEl = document.querySelector(`#seance-date-${slotIndex}`);
    const ateliers = {};
    ATELIERS.forEach(a => {
      const el = document.querySelector(`[data-seance-field="${a.key}"]`);
      if (el && el.value !== '') {
        const v = parseFloat(el.value);
        if (!isNaN(v)) ateliers[a.key] = v;
      }
    });

    const educator = window.EducatorModule?.getEducator() || { id: 'local', name: '' };
    const seances = getSeances(cat, pid, season);

    seances[slotIndex] = {
      id: 'S' + (slotIndex + 1),
      date: dateEl?.value || new Date().toISOString().split('T')[0],
      season,
      educator_id: educator.id,
      educator_name: educator.name,
      ateliers
    };

    utils()?.schedulePersist('Séance enregistrée');
    utils()?.showToast('Séance ' + (slotIndex + 1) + ' enregistrée');
    editingSlot = null;
    utils()?.renderMain();
  }

  function handleAction(target) {
    const sa = target.dataset.seanceAction;
    if (!sa) return false;

    const state = app();
    if (!state?.selPlayer) return false;
    const pid = state.selPlayer;
    const slot = target.dataset.slot !== undefined ? parseInt(target.dataset.slot) : null;

    if (sa === 'edit-seance') {
      editingSlot = slot;
      utils()?.renderMain();
      return true;
    }
    if (sa === 'cancel-seance') {
      editingSlot = null;
      utils()?.renderMain();
      return true;
    }
    if (sa === 'save-seance') {
      saveSeanceSlot(pid, slot);
      return true;
    }
    if (sa === 'delete-seance') {
      const seances = getSeances(state.cat, pid, state.season);
      seances[slot] = null;
      utils()?.schedulePersist('Séance supprimée');
      utils()?.showToast('Séance supprimée');
      editingSlot = null;
      utils()?.renderMain();
      return true;
    }
    return false;
  }

  /* ── Export public ───────────────────────────────────── */

  window.SeanceModule = {
    ATELIERS,
    PERF_REF,
    SLOT_LABELS,
    scoreAtelier,
    seanceScore,
    getSeances,
    ensureSeances,
    renderBody,
    handleAction,
    afterRender,
    destroyCharts
  };
})();

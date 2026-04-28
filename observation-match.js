(function () {
  'use strict';

  /* ── Constantes ──────────────────────────────────────── */

  const DIMENSIONS = [
    { key: 'technique',     label: 'Technique',    question: 'A-t-il été efficace balle au pied ?' },
    { key: 'tactique',      label: 'Tactique',     question: 'A-t-il fait les bons choix sans ballon et avec ballon ?' },
    { key: 'physique',      label: 'Physique',     question: 'A-t-il été présent dans l\'effort sur toute la durée ?' },
    { key: 'mental',        label: 'Mental',       question: 'A-t-il réagi positivement aux erreurs et aux situations difficiles ?' },
    { key: 'comportement',  label: 'Comportement', question: 'A-t-il respecté les consignes, l\'arbitre et ses coéquipiers ?' }
  ];

  const DIM_OPTS = [
    { val: 3, symbol: '✓', label: 'Oui, clairement',    color: '#639922', bg: '#eaf3de' },
    { val: 2, symbol: '~', label: 'Moyen',               color: '#ba7517', bg: '#faeeda' },
    { val: 1, symbol: '✗', label: 'Non, insuffisant',    color: '#d85a30', bg: '#faece7' },
    { val: 0, symbol: '–', label: 'Non observé',         color: '#8d897f', bg: '#f4efe7' }
  ];

  /* ── Helpers ─────────────────────────────────────────── */

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function app()   { return window.appState; }
  function utils() { return window.appUtils; }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ── Données ─────────────────────────────────────────── */

  function ensureObs(cat, pid) {
    const state = app();
    if (!state) return;
    if (!state.data[cat][pid]) state.data[cat][pid] = {};
    if (!state.data[cat][pid].observations) state.data[cat][pid].observations = {};
  }

  function getObs(cat, pid, season) {
    ensureObs(cat, pid);
    const state = app();
    if (!state.data[cat][pid].observations[season]) {
      state.data[cat][pid].observations[season] = [];
    }
    return state.data[cat][pid].observations[season];
  }

  /* ── Calculs ─────────────────────────────────────────── */

  function dimAvg(observations, dimKey) {
    const relevant = observations.filter(o => (o.dimensions?.[dimKey] ?? 0) > 0);
    if (!relevant.length) return null;
    return relevant.reduce((sum, o) => sum + o.dimensions[dimKey], 0) / relevant.length;
  }

  function getTrend(observations) {
    if (observations.length < 4) return null;
    const sorted = [...observations].sort(
      (a, b) => new Date(b.date_match) - new Date(a.date_match)
    );
    const avgGroup = group => {
      const vals = DIMENSIONS.flatMap(d =>
        group.map(o => o.dimensions?.[d.key]).filter(v => v > 0)
      );
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const diff = avgGroup(sorted.slice(0, 3)) - avgGroup(sorted.slice(3, 6));
    if (diff > 0.15)  return { label: 'Progression', color: '#639922', icon: '↑' };
    if (diff < -0.15) return { label: 'Recul',        color: '#d85a30', icon: '↓' };
    return { label: 'Stable', color: '#ba7517', icon: '→' };
  }

  /* ── État éphémère ───────────────────────────────────── */

  let showForm     = false;
  let editingObsId = null;
  let formDom      = true;     // domicile toggle temp
  let obsChart     = null;

  /* ── Formulaire ──────────────────────────────────────── */

  function renderForm(existing) {
    const d = existing || {};
    const date = d.date_match || new Date().toISOString().split('T')[0];

    const dimRows = DIMENSIONS.map(dim => {
      const cur = d.dimensions?.[dim.key] ?? '';
      const btns = DIM_OPTS.map(opt => {
        const active = String(cur) === String(opt.val);
        const style  = active
          ? `background:${opt.bg};border-color:${opt.color};color:${opt.color}`
          : '';
        return `<button class="obs-dim-btn ${active ? 'on' : ''}" type="button"
          data-obs-dim="${dim.key}" data-obs-val="${opt.val}"
          style="${style}" title="${h(opt.label)}">${opt.symbol}</button>`;
      }).join('');
      return `<div class="obs-dim-row">
        <div class="obs-dim-info">
          <strong>${h(dim.label)}</strong>
          <span>${h(dim.question)}</span>
        </div>
        <div class="obs-dim-btns">${btns}</div>
      </div>`;
    }).join('');

    const domHtml = ['true','false'].map(v => {
      const label = v === 'true' ? 'Domicile' : 'Extérieur';
      const active = (v === 'true') === formDom;
      return `<button class="foot-btn ${active ? 'on' : ''}" type="button"
        data-obs-action="set-domicile" data-val="${v}">${h(label)}</button>`;
    }).join('');

    return `<div class="obs-form" id="obs-form">
      <div class="obs-form-head">
        <strong>${existing ? "Modifier l'observation" : 'Nouvelle observation'}</strong>
        <button class="modal-close" type="button" data-obs-action="cancel-obs">×</button>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label class="field-label">Date du match</label>
          <input class="field-input" type="date" id="obs-date" value="${h(date)}">
        </div>
        <div class="field-group">
          <label class="field-label">Adversaire</label>
          <input class="field-input" type="text" id="obs-adversaire"
            value="${h(d.adversaire || '')}" placeholder="Nom du club...">
        </div>
        <div class="field-group">
          <label class="field-label">Score</label>
          <input class="field-input" type="text" id="obs-score"
            value="${h(d.score_match || '')}" placeholder="3-1">
        </div>
        <div class="field-group">
          <label class="field-label">Temps de jeu (min)</label>
          <input class="field-input" type="number" id="obs-temps" min="0" max="120"
            value="${h(d.temps_jeu || '')}" placeholder="60">
        </div>
      </div>
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label">Lieu</label>
        <div class="foot-row">${domHtml}</div>
      </div>
      <div class="form-section-title">Dimensions de jeu</div>
      <div class="obs-dims">${dimRows}</div>
      <div class="field-group" style="margin-top:12px">
        <label class="field-label">Commentaire libre</label>
        <textarea class="field-input" id="obs-commentaire" rows="3"
          placeholder="Points forts, axes à travailler...">${h(d.commentaire || '')}</textarea>
      </div>
      <div class="obs-form-footer">
        ${existing ? `<button class="btn-ghost btn-danger" type="button"
          data-obs-action="delete-obs" data-obs-id="${h(d.id)}">Supprimer</button>` : ''}
        <span style="flex:1"></span>
        <button class="btn-ghost" type="button" data-obs-action="cancel-obs">Annuler</button>
        <button class="btn-primary" type="button" data-obs-action="save-obs"
          ${existing ? `data-obs-id="${h(d.id)}"` : ''}>Enregistrer</button>
      </div>
    </div>`;
  }

  /* ── Carte observation ───────────────────────────────── */

  function renderObsCard(obs) {
    const dateStr = obs.date_match
      ? new Date(obs.date_match).toLocaleDateString('fr-FR') : '—';
    const lieu = obs.domicile === false ? 'Ext.' : 'Dom.';

    const badges = DIMENSIONS.map(dim => {
      const v   = obs.dimensions?.[dim.key] ?? 0;
      const opt = DIM_OPTS.find(o => o.val === v) || DIM_OPTS[3];
      return `<span class="obs-dim-badge"
        style="background:${opt.bg};color:${opt.color};border-color:${opt.color}">
        ${opt.symbol} ${h(dim.label.slice(0, 5))}</span>`;
    }).join('');

    const educatorNote = obs.educator_name
      ? `<span class="obs-educator">${h(obs.educator_name)}</span>` : '';

    return `<div class="obs-card">
      <div class="obs-card-head">
        <div class="obs-card-meta">
          <strong>${h(obs.adversaire || 'Match')}</strong>
          <span>${dateStr} · ${lieu} · ${h(obs.score_match || '—')}
            ${obs.temps_jeu ? ` · ${obs.temps_jeu}'` : ''}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${educatorNote}
          <button class="card-edit-btn" type="button"
            data-obs-action="edit-obs" data-obs-id="${h(obs.id)}">Modifier</button>
        </div>
      </div>
      <div class="obs-dim-badges">${badges}</div>
      ${obs.commentaire
        ? `<div class="obs-commentaire">${h(obs.commentaire)}</div>` : ''}
    </div>`;
  }

  /* ── Rendu principal ─────────────────────────────────── */

  function renderBody(pid) {
    const state = app();
    if (!state) return '<p>Application non initialisée.</p>';
    const { cat, season } = state;
    ensureObs(cat, pid);
    const observations = getObs(cat, pid, season);
    const sorted = [...observations].sort(
      (a, b) => new Date(b.date_match) - new Date(a.date_match)
    );
    const trend = getTrend(observations);

    const dimSummary = DIMENSIONS.map(d => {
      const avg = dimAvg(observations, d.key);
      const pct = avg !== null ? Math.round((avg / 3) * 100) : null;
      const color = pct !== null
        ? (pct >= 70 ? '#639922' : pct >= 45 ? '#ba7517' : '#d85a30')
        : '#8d897f';
      return `<div class="obs-dim-summary-row">
        <span>${h(d.label)}</span>
        ${pct !== null
          ? `<div class="obs-dim-bar-bg">
               <div class="obs-dim-bar-fill" style="width:${pct}%;background:${color}"></div>
             </div>
             <span style="color:${color};font-weight:700;font-size:12px;min-width:32px">${pct}%</span>`
          : `<span style="color:var(--text3);font-size:11px">—</span>`}
      </div>`;
    }).join('');

    const statsHtml = observations.length ? `
      <div class="obs-stats-row">
        <div class="detail-card">
          <div class="card-kicker">Radar saison</div>
          <h3>Moyennes par dimension</h3>
          <div style="display:flex;justify-content:center">
            <canvas id="obs-radar-chart" width="220" height="220"
              aria-label="Radar dimensions"></canvas>
          </div>
        </div>
        <div class="detail-card">
          <div class="card-kicker">Saison ${h(season)}</div>
          <h3>Synthèse</h3>
          <div class="obs-dim-summary">${dimSummary}</div>
          <div class="obs-meta">
            <span>${observations.length} observation${observations.length > 1 ? 's' : ''}</span>
            ${trend ? `<span class="obs-trend" style="color:${trend.color}">
              ${trend.icon} ${h(trend.label)}</span>` : ''}
          </div>
        </div>
      </div>` : '';

    const formHtml = showForm
      ? renderForm(editingObsId
          ? observations.find(o => o.id === editingObsId)
          : null)
      : '';

    const listHtml = sorted.length
      ? sorted.map(o => renderObsCard(o)).join('')
      : `<div class="dash-empty">
           <div class="dash-empty-msg">Aucune observation cette saison</div>
           <div class="dash-empty-hint">Cliquez sur "+ Nouvelle observation" pour commencer.</div>
         </div>`;

    return `<div class="obs-module">
      <div class="obs-header">
        <div>
          <div class="card-kicker">Après match</div>
          <h3>Observations — Saison ${h(season)}</h3>
        </div>
        ${!showForm
          ? `<button class="btn btn-primary" type="button"
               data-obs-action="new-obs">+ Nouvelle observation</button>`
          : ''}
      </div>
      ${formHtml}
      ${statsHtml}
      <div class="obs-timeline">${listHtml}</div>
    </div>`;
  }

  /* ── Graphique radar ─────────────────────────────────── */

  function destroyCharts() {
    if (obsChart) { try { obsChart.destroy(); } catch (_) {} obsChart = null; }
  }

  function drawRadar(observations) {
    const canvas = document.querySelector('#obs-radar-chart');
    if (!canvas || !window.Chart) return;
    if (obsChart) { obsChart.destroy(); obsChart = null; }

    const avgs = DIMENSIONS.map(d => {
      const avg = dimAvg(observations, d.key);
      return avg !== null ? Math.round((avg / 3) * 100) : 0;
    });
    if (!avgs.some(v => v > 0)) return;

    obsChart = new window.Chart(canvas, {
      type: 'radar',
      data: {
        labels: DIMENSIONS.map(d => d.label),
        datasets: [{
          label: 'Moyennes saison',
          data: avgs,
          backgroundColor: 'rgba(24,95,165,0.12)',
          borderColor: '#185fa5',
          borderWidth: 2,
          pointBackgroundColor: '#185fa5',
          pointRadius: 3
        }]
      },
      options: {
        responsive: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, backdropColor: 'transparent', color: '#8d897f', font: { size: 8 } },
            grid: { color: 'rgba(0,0,0,0.08)' },
            angleLines: { color: 'rgba(0,0,0,0.08)' },
            pointLabels: { color: '#5e5b54', font: { size: 10 } }
          }
        }
      }
    });
  }

  function afterRender(pid) {
    const state = app();
    if (!state || state.selSection !== 'observation') return;
    const { cat, season } = state;
    const observations = getObs(cat, pid, season);
    if (observations.length) {
      setTimeout(() => drawRadar(observations), 50);
    }
  }

  /* ── Collecte des données du formulaire ──────────────── */

  function collectForm(existingId) {
    const state  = app();
    const educator = window.EducatorModule?.getEducator() || { id: 'local', name: '' };
    const dims   = {};
    DIMENSIONS.forEach(d => {
      const btn = document.querySelector(`.obs-dim-btn.on[data-obs-dim="${d.key}"]`);
      dims[d.key] = btn ? parseInt(btn.dataset.obsVal) : 0;
    });
    return {
      id:          existingId || uid(),
      date_match:  document.querySelector('#obs-date')?.value || new Date().toISOString().split('T')[0],
      adversaire:  document.querySelector('#obs-adversaire')?.value || '',
      domicile:    formDom,
      score_match: document.querySelector('#obs-score')?.value || '',
      temps_jeu:   parseInt(document.querySelector('#obs-temps')?.value) || null,
      dimensions:  dims,
      commentaire: document.querySelector('#obs-commentaire')?.value || '',
      educator_id: educator.id,
      educator_name: educator.name,
      season:      state?.season || ''
    };
  }

  /* ── Gestion des actions ─────────────────────────────── */

  function handleDimClick(target) {
    const dim = target.dataset.obsDim;
    const val = target.dataset.obsVal;
    if (!dim || val === undefined) return;
    const opt = DIM_OPTS.find(o => String(o.val) === val);
    document.querySelectorAll(`.obs-dim-btn[data-obs-dim="${dim}"]`).forEach(btn => {
      const isThis = btn.dataset.obsVal === val;
      btn.classList.toggle('on', isThis);
      if (isThis && opt) {
        btn.style.cssText = `background:${opt.bg};border-color:${opt.color};color:${opt.color}`;
      } else {
        btn.style.cssText = '';
      }
    });
  }

  function handleAction(target) {
    const oa = target.dataset.obsAction;
    if (!oa) return false;

    const state = app();
    if (!state?.selPlayer) return false;
    const pid = state.selPlayer;
    const { cat, season } = state;

    if (oa === 'new-obs') {
      showForm     = true;
      editingObsId = null;
      formDom      = true;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'cancel-obs') {
      showForm     = false;
      editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'edit-obs') {
      const obs = getObs(cat, pid, season);
      const ex  = obs.find(o => o.id === target.dataset.obsId);
      showForm     = true;
      editingObsId = target.dataset.obsId;
      formDom      = ex?.domicile !== false;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'set-domicile') {
      formDom = target.dataset.val === 'true';
      document.querySelectorAll('[data-obs-action="set-domicile"]').forEach(btn => {
        btn.classList.toggle('on', (btn.dataset.val === 'true') === formDom);
      });
      return true;
    }
    if (oa === 'save-obs') {
      const existingId = target.dataset.obsId || null;
      const data = collectForm(existingId);
      const obs  = getObs(cat, pid, season);
      if (existingId) {
        const idx = obs.findIndex(o => o.id === existingId);
        if (idx >= 0) obs[idx] = data; else obs.push(data);
      } else {
        obs.push(data);
      }
      utils()?.schedulePersist('Observation enregistrée');
      utils()?.showToast('Observation enregistrée');
      showForm     = false;
      editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'delete-obs') {
      const obs = getObs(cat, pid, season);
      const idx = obs.findIndex(o => o.id === target.dataset.obsId);
      if (idx >= 0) obs.splice(idx, 1);
      utils()?.schedulePersist('Observation supprimée');
      utils()?.showToast('Observation supprimée');
      showForm     = false;
      editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    return false;
  }

  /* ── Export public ───────────────────────────────────── */

  window.ObsModule = {
    DIMENSIONS,
    DIM_OPTS,
    dimAvg,
    getTrend,
    getObs,
    ensureObs,
    renderBody,
    handleAction,
    handleDimClick,
    afterRender,
    destroyCharts
  };
})();

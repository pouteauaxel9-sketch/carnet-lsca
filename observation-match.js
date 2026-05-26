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

  const POSTES = ['Gardien', 'Defenseur', 'Milieu central', 'Ailier gauche', 'Ailier droit', 'Attaquant'];

  const STAT_FIELDS = [
    { key: 'buts',            label: 'Buts',        short: 'G',  step: 1, max: 20, group: 'offensive' },
    { key: 'passes_d',        label: 'Passes déc.', short: 'A',  step: 1, max: 20, group: 'offensive' },
    { key: 'tirs_cadres',     label: 'Tirs cadrés', short: 'TC', step: 1, max: 30, group: 'offensive' },
    { key: 'tirs_non_cadres', label: 'Tirs hors',   short: 'T-', step: 1, max: 30, group: 'offensive' },
    { key: 'fautes_commises', label: 'Fautes com.', short: 'FC', step: 1, max: 20, group: 'discipline' },
    { key: 'fautes_subies',   label: 'Fautes sub.', short: 'FS', step: 1, max: 20, group: 'discipline' },
    { key: 'jaune',           label: 'Carton J',    short: 'CJ', step: 1, max: 2,  group: 'discipline' },
    { key: 'rouge',           label: 'Carton R',    short: 'CR', step: 1, max: 1,  group: 'discipline' },
  ];

  const TITULAR_THRESHOLD = 45;

  /* ── Helpers ─────────────────────────────────────────── */

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function app()   { return window.appState; }
  function utils() { return window.appUtils; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

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
    if (!state.data[cat][pid].observations[season]) state.data[cat][pid].observations[season] = [];
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
    const sorted = [...observations].sort((a, b) => new Date(b.date_match) - new Date(a.date_match));
    const avgGroup = group => {
      const vals = DIMENSIONS.flatMap(d => group.map(o => o.dimensions?.[d.key]).filter(v => v > 0));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const diff = avgGroup(sorted.slice(0, 3)) - avgGroup(sorted.slice(3, 6));
    if (diff > 0.15)  return { label: 'Progression', color: '#639922', icon: '↑' };
    if (diff < -0.15) return { label: 'Recul',        color: '#d85a30', icon: '↓' };
    return { label: 'Stable', color: '#ba7517', icon: '→' };
  }

  function _num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function seasonStats(observations) {
    if (!observations.length) return null;
    const totals = { matches: observations.length, minutes: 0, notes: [] };
    STAT_FIELDS.forEach(f => { totals[f.key] = 0; });
    observations.forEach(o => {
      STAT_FIELDS.forEach(f => { totals[f.key] += _num(o.stats?.[f.key]); });
      if (o.temps_jeu) totals.minutes += _num(o.temps_jeu);
      if (o.note_match != null && o.note_match !== '') totals.notes.push(_num(o.note_match));
    });
    totals.noteAvg = totals.notes.length
      ? +(totals.notes.reduce((a, b) => a + b, 0) / totals.notes.length).toFixed(2)
      : null;
    totals.tirs_total = totals.tirs_cadres + totals.tirs_non_cadres;
    totals.precision_tir = totals.tirs_total
      ? Math.round((totals.tirs_cadres / totals.tirs_total) * 100)
      : null;
    totals.buts_par_match = +(totals.buts / totals.matches).toFixed(2);
    totals.passes_par_match = +(totals.passes_d / totals.matches).toFixed(2);
    totals.implications = totals.buts + totals.passes_d;
    return totals;
  }

  function byOpponent(observations) {
    const map = new Map();
    observations.forEach(o => {
      const k = (o.adversaire || '—').trim() || '—';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(o);
    });
    return Array.from(map.entries()).map(([opp, list]) => ({
      opponent: opp, stats: seasonStats(list),
    })).sort((a, b) => b.stats.matches - a.stats.matches);
  }

  function homeAwayStats(observations) {
    const home = observations.filter(o => o.domicile !== false);
    const away = observations.filter(o => o.domicile === false);
    return { home: seasonStats(home), away: seasonStats(away) };
  }

  function titularStats(observations) {
    const tit = observations.filter(o => _num(o.temps_jeu) >= TITULAR_THRESHOLD);
    const sub = observations.filter(o => _num(o.temps_jeu) > 0 && _num(o.temps_jeu) < TITULAR_THRESHOLD);
    return { titular: seasonStats(tit), sub: seasonStats(sub) };
  }

  function noteColor(n) {
    if (n == null) return '#8d897f';
    if (n >= 7) return '#639922';
    if (n >= 5) return '#ba7517';
    return '#d85a30';
  }

  /* ── Fixtures FFF scrapées (pour pré-remplir le formulaire) ─ */

  function obsLoadFeeds() {
    try { return JSON.parse(localStorage.getItem('cfb6_feeds') || '{}') || {}; }
    catch { return {}; }
  }
  function obsFixtures(cat, team) {
    if (!cat) return [];
    const feeds = obsLoadFeeds()[cat] || {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const past = (feeds.past || []).map(f => ({ ...f, kind: 'past' }));
    const up   = (feeds.upcoming || []).map(f => {
      const ts = obsToDate(f.date);
      return { ...f, kind: (ts && ts < todayMs) ? 'past' : 'upcoming' };
    });
    const all = [...past, ...up];
    const filtered = team ? all.filter(f => !f.team || f.team === team) : all;
    filtered.sort((a, b) => obsToDate(b.date) - obsToDate(a.date));
    return filtered.slice(0, 30);
  }
  function obsToDate(d) {
    if (!d) return 0;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
    const m = d.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
    return 0;
  }
  function obsToIso(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const m = d.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }
  function obsFixtureLabel(f) {
    const dateStr = f.date || '?';
    const lieu = f.isHome === true ? 'Dom.' : f.isHome === false ? 'Ext.' : '';
    const opp = f.opponent || (f.away && f.home ? (f.team === f.home ? f.away : f.home) : '?');
    const sc  = f.score ? ` — ${f.score}` : '';
    const kind = f.kind === 'upcoming' ? '📅' : '✓';
    return `${kind} ${dateStr} ${lieu ? '(' + lieu + ')' : ''} vs ${opp}${sc}`;
  }

  /* ── État éphémère ───────────────────────────────────── */

  let showForm      = false;
  let editingObsId  = null;
  let formDom       = true;
  let obsChart      = null;
  let timelineChart = null;

  /* ── Formulaire ──────────────────────────────────────── */

  function renderForm(existing) {
    const d = existing || {};
    const date = d.date_match || new Date().toISOString().split('T')[0];
    const stats = d.stats || {};

    const dimRows = DIMENSIONS.map(dim => {
      const cur = d.dimensions?.[dim.key] ?? '';
      const btns = DIM_OPTS.map(opt => {
        const active = String(cur) === String(opt.val);
        const style  = active ? `background:${opt.bg};border-color:${opt.color};color:${opt.color}` : '';
        return `<button class="obs-dim-btn ${active ? 'on' : ''}" type="button"
          data-obs-dim="${dim.key}" data-obs-val="${opt.val}"
          style="${style}" title="${h(opt.label)}">${opt.symbol}</button>`;
      }).join('');
      return `<div class="obs-dim-row">
        <div class="obs-dim-info"><strong>${h(dim.label)}</strong><span>${h(dim.question)}</span></div>
        <div class="obs-dim-btns">${btns}</div>
      </div>`;
    }).join('');

    const domHtml = ['true','false'].map(v => {
      const label = v === 'true' ? 'Domicile' : 'Extérieur';
      const active = (v === 'true') === formDom;
      return `<button class="foot-btn ${active ? 'on' : ''}" type="button"
        data-obs-action="set-domicile" data-val="${v}">${h(label)}</button>`;
    }).join('');

    const posteOptions = ['', ...POSTES].map(p =>
      `<option value="${h(p)}" ${d.poste_joue === p ? 'selected' : ''}>${p || '— Position non précisée —'}</option>`
    ).join('');

    const off = STAT_FIELDS.filter(f => f.group === 'offensive');
    const dis = STAT_FIELDS.filter(f => f.group === 'discipline');
    const renderStatGroup = (fields) => fields.map(f => `
      <div class="field-group">
        <label class="field-label">${h(f.label)}</label>
        <input class="field-input" type="number" min="0" max="${f.max}" step="${f.step}"
          value="${h(stats[f.key] ?? '')}" data-obs-stat="${h(f.key)}" placeholder="0">
      </div>`).join('');

    // Fixtures FFF scrapées : pré-remplir depuis l'équipe du joueur (si dispo)
    const playerTeam = app()?.data?.[app()?.cat]?.[app()?.selPlayer]?.profil?.team;
    const fixtures = obsFixtures(app()?.cat, playerTeam);
    const fixtureBlock = !existing
      ? (fixtures.length
        ? `<div class="field-group obs-fixture-picker" style="margin-bottom:12px">
            <label class="field-label">Pré-remplir depuis un match scrapé (${fixtures.length})</label>
            <select class="field-input" data-obs-action="set-fixture">
              <option value="">— Choisir un match —</option>
              ${fixtures.map((f, i) => `<option value="${i}">${h(obsFixtureLabel(f))}</option>`).join('')}
            </select>
            <div class="field-hint">Auto-rempli depuis le scraper FFF. Modifiable ensuite.</div>
          </div>`
        : `<div class="field-group obs-fixture-picker" style="margin-bottom:12px">
            <label class="field-label">Pré-remplir depuis un match scrapé</label>
            <select class="field-input" disabled><option>— Aucun match disponible —</option></select>
            <div class="field-hint">Charge les feeds FFF ou assigne une équipe au joueur (profil) pour activer le pré-remplissage.</div>
          </div>`)
      : '';

    return `<div class="obs-form" id="obs-form">
      <div class="obs-form-head">
        <strong>${existing ? "Modifier l'observation" : 'Nouvelle observation'}</strong>
        <button class="modal-close" type="button" data-obs-action="cancel-obs">×</button>
      </div>
      ${fixtureBlock}
      <div class="form-grid">
        <div class="field-group"><label class="field-label">Date du match</label>
          <input class="field-input" type="date" id="obs-date" value="${h(date)}"></div>
        <div class="field-group"><label class="field-label">Adversaire</label>
          <input class="field-input" type="text" id="obs-adversaire" value="${h(d.adversaire || '')}" placeholder="Nom du club..."></div>
        <div class="field-group"><label class="field-label">Score</label>
          <input class="field-input" type="text" id="obs-score" value="${h(d.score_match || '')}" placeholder="3-1"></div>
        <div class="field-group"><label class="field-label">Compétition</label>
          <input class="field-input" type="text" id="obs-competition" value="${h(d.competition || '')}" placeholder="Championnat..."></div>
        <div class="field-group"><label class="field-label">Temps de jeu (min)</label>
          <input class="field-input" type="number" id="obs-temps" min="0" max="120" value="${h(d.temps_jeu || '')}" placeholder="60"></div>
        <div class="field-group"><label class="field-label">Note de match (0-10)</label>
          <input class="field-input" type="number" id="obs-note" min="0" max="10" step="0.5" value="${h(d.note_match ?? '')}" placeholder="—"></div>
        <div class="field-group"><label class="field-label">Position jouée</label>
          <select class="field-input" id="obs-poste-joue">${posteOptions}</select></div>
      </div>
      <div class="field-group" style="margin-bottom:12px">
        <label class="field-label">Lieu</label>
        <div class="foot-row">${domHtml}</div>
      </div>
      <div class="form-section-title">Dimensions de jeu</div>
      <div class="obs-dims">${dimRows}</div>
      <div class="form-section-title" style="margin-top:14px">Statistiques individuelles</div>
      <div class="stats-grid stats-grid--offensive">
        <div class="stats-grid-label">Offensif</div>
        ${renderStatGroup(off)}
      </div>
      <div class="stats-grid stats-grid--discipline" style="margin-top:8px">
        <div class="stats-grid-label">Discipline</div>
        ${renderStatGroup(dis)}
      </div>
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

  /* ── Card observation ────────────────────────────────── */

  function renderObsCard(obs) {
    const dateStr = obs.date_match ? new Date(obs.date_match).toLocaleDateString('fr-FR') : '—';
    const lieu = obs.domicile === false ? 'Ext.' : 'Dom.';

    const badges = DIMENSIONS.map(dim => {
      const v   = obs.dimensions?.[dim.key] ?? 0;
      const opt = DIM_OPTS.find(o => o.val === v) || DIM_OPTS[3];
      return `<span class="obs-dim-badge"
        style="background:${opt.bg};color:${opt.color};border-color:${opt.color}">
        ${opt.symbol} ${h(dim.label.slice(0, 5))}</span>`;
    }).join('');

    const educatorNote = obs.educator_name ? `<span class="obs-educator">${h(obs.educator_name)}</span>` : '';

    const noteHtml = obs.note_match != null && obs.note_match !== ''
      ? `<span class="obs-note-pill" style="background:${noteColor(obs.note_match)};color:#fff">${h(obs.note_match)}/10</span>`
      : '';
    const posteHtml = obs.poste_joue ? `<span class="obs-poste-chip">${h(obs.poste_joue)}</span>` : '';

    const statline = STAT_FIELDS.filter(f => _num(obs.stats?.[f.key]) > 0).map(f => {
      const v = _num(obs.stats[f.key]);
      const cls = f.key === 'jaune' ? 'stat-pill stat-pill--yellow'
              : f.key === 'rouge' ? 'stat-pill stat-pill--red'
              : f.group === 'discipline' ? 'stat-pill stat-pill--neutral'
              : 'stat-pill stat-pill--off';
      return `<span class="${cls}" title="${h(f.label)}">${h(f.short)} ${v}</span>`;
    }).join('');

    return `<div class="obs-card">
      <div class="obs-card-head">
        <div class="obs-card-meta">
          <strong>${h(obs.adversaire || 'Match')}</strong>
          <span>${dateStr} · ${lieu} · ${h(obs.score_match || '—')}
            ${obs.temps_jeu ? ` · ${obs.temps_jeu}'` : ''}
            ${obs.competition ? ` · ${h(obs.competition)}` : ''}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${noteHtml}${posteHtml}${educatorNote}
          <button class="card-edit-btn" type="button"
            data-obs-action="edit-obs" data-obs-id="${h(obs.id)}">Modifier</button>
        </div>
      </div>
      <div class="obs-dim-badges">${badges}</div>
      ${statline ? `<div class="obs-statline">${statline}</div>` : ''}
      ${obs.commentaire ? `<div class="obs-commentaire">${h(obs.commentaire)}</div>` : ''}
    </div>`;
  }

  /* ── Rendu principal ─────────────────────────────────── */

  function renderBody(pid) {
    const state = app();
    if (!state) return '<p>Application non initialisée.</p>';
    const { cat, season } = state;
    ensureObs(cat, pid);
    const observations = getObs(cat, pid, season);
    const sorted = [...observations].sort((a, b) => new Date(b.date_match) - new Date(a.date_match));
    const trend = getTrend(observations);
    const stats = seasonStats(observations);

    const dimSummary = DIMENSIONS.map(d => {
      const avg = dimAvg(observations, d.key);
      const pct = avg !== null ? Math.round((avg / 3) * 100) : null;
      const color = pct !== null ? (pct >= 70 ? '#639922' : pct >= 45 ? '#ba7517' : '#d85a30') : '#8d897f';
      return `<div class="obs-dim-summary-row">
        <span>${h(d.label)}</span>
        ${pct !== null
          ? `<div class="obs-dim-bar-bg"><div class="obs-dim-bar-fill" style="width:${pct}%;background:${color}"></div></div>
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
            <canvas id="obs-radar-chart" width="220" height="220" aria-label="Radar dimensions"></canvas>
          </div>
        </div>
        <div class="detail-card">
          <div class="card-kicker">Saison ${h(season)}</div>
          <h3>Synthèse</h3>
          <div class="obs-dim-summary">${dimSummary}</div>
          <div class="obs-meta">
            <span>${observations.length} observation${observations.length > 1 ? 's' : ''}</span>
            ${trend ? `<span class="obs-trend" style="color:${trend.color}">${trend.icon} ${h(trend.label)}</span>` : ''}
          </div>
        </div>
      </div>` : '';

    const formHtml = showForm
      ? renderForm(editingObsId ? observations.find(o => o.id === editingObsId) : null)
      : '';

    const listHtml = sorted.length
      ? sorted.map(o => renderObsCard(o)).join('')
      : `<div class="dash-empty">
           <div class="dash-empty-msg">Aucune observation cette saison</div>
           <div class="dash-empty-hint">Cliquez sur "+ Nouvelle observation" pour commencer.</div>
         </div>`;

    const seasonRecapHtml = observations.length ? renderSeasonRecap(stats) : '';
    const timelineHtml    = observations.length >= 2 ? renderTimelineWrap() : '';
    const breakdownsHtml  = observations.length >= 3 ? renderBreakdowns(observations) : '';

    return `<div class="obs-module">
      <div class="obs-header">
        <div>
          <div class="card-kicker">Après match</div>
          <h3>Observations — Saison ${h(season)}</h3>
        </div>
        ${!showForm
          ? `<button class="btn btn-primary" type="button" data-obs-action="new-obs">+ Nouvelle observation</button>`
          : ''}
      </div>
      ${formHtml}
      ${seasonRecapHtml}
      ${statsHtml}
      ${timelineHtml}
      ${breakdownsHtml}
      <div class="obs-timeline">${listHtml}</div>
    </div>`;
  }

  function renderSeasonRecap(stats) {
    if (!stats) return '';
    const note = stats.noteAvg;
    const block = (label, value, sub) => `
      <div class="recap-block">
        <span class="recap-label">${h(label)}</span>
        <strong class="recap-value">${h(value)}</strong>
        ${sub ? `<span class="recap-sub">${h(sub)}</span>` : ''}
      </div>`;
    return `<div class="detail-card season-recap">
      <div class="card-kicker">Récap saison</div>
      <h3>Statistiques cumulées sur ${stats.matches} match${stats.matches > 1 ? 's' : ''}</h3>
      <div class="recap-grid">
        ${block('Note moyenne', note != null ? note.toFixed(1) + '/10' : '—', null)}
        ${block('Minutes', stats.minutes ? stats.minutes + '′' : '—', null)}
        ${block('Buts', stats.buts, stats.matches ? '⌀ ' + stats.buts_par_match + '/match' : '')}
        ${block('Passes déc.', stats.passes_d, stats.matches ? '⌀ ' + stats.passes_par_match + '/match' : '')}
        ${block('Implications', stats.implications, '(buts + passes)')}
        ${block('Tirs', stats.tirs_total, stats.precision_tir != null ? stats.precision_tir + '% cadrés' : '')}
        ${block('Fautes (com./sub.)', stats.fautes_commises + '/' + stats.fautes_subies, null)}
        ${block('Cartons', (stats.jaune || 0) + ' J · ' + (stats.rouge || 0) + ' R', null)}
      </div>
    </div>`;
  }

  function renderTimelineWrap() {
    return `<div class="detail-card timeline-card">
      <div class="card-kicker">Timeline</div>
      <h3>Note et dimensions match par match</h3>
      <div class="timeline-chart-wrap">
        <canvas id="obs-timeline-chart" aria-label="Frise match par match"></canvas>
      </div>
    </div>`;
  }

  function renderBreakdowns(observations) {
    const byOpp = byOpponent(observations).slice(0, 6);
    const ha = homeAwayStats(observations);
    const ts = titularStats(observations);

    const oppRows = byOpp.map(b => {
      const s = b.stats;
      const note = s.noteAvg != null ? s.noteAvg.toFixed(1) : '—';
      return `<tr>
        <td>${h(b.opponent)}</td><td>${s.matches}</td>
        <td><span style="color:${noteColor(s.noteAvg)};font-weight:700">${note}</span></td>
        <td>${s.buts}</td><td>${s.passes_d}</td><td>${s.implications}</td>
      </tr>`;
    }).join('');

    const col = (label, s) => {
      if (!s || !s.matches) return `<div class="bd-col">
        <div class="bd-col-head">${h(label)}</div>
        <div class="bd-empty">Aucune donnée</div></div>`;
      return `<div class="bd-col">
        <div class="bd-col-head">${h(label)} <span class="bd-count">${s.matches} m.</span></div>
        <div class="bd-row"><span>Note ⌀</span><strong style="color:${noteColor(s.noteAvg)}">${s.noteAvg != null ? s.noteAvg.toFixed(1) : '—'}</strong></div>
        <div class="bd-row"><span>Buts</span><strong>${s.buts}</strong></div>
        <div class="bd-row"><span>Passes déc.</span><strong>${s.passes_d}</strong></div>
        <div class="bd-row"><span>Implic. /match</span><strong>${(s.implications / s.matches).toFixed(2)}</strong></div>
      </div>`;
    };

    return `<div class="obs-breakdowns">
      <div class="detail-card">
        <div class="card-kicker">Bilan croisé</div>
        <h3>Performance par adversaire (top ${byOpp.length})</h3>
        <div class="breakdown-table-wrap">
          <table class="breakdown-table">
            <thead><tr><th>Adversaire</th><th>M.</th><th>Note ⌀</th>
              <th>Buts</th><th>Passes</th><th>Implic.</th></tr></thead>
            <tbody>${oppRows}</tbody>
          </table>
        </div>
      </div>
      <div class="detail-card">
        <div class="card-kicker">Bilan croisé</div>
        <h3>Domicile vs Extérieur</h3>
        <div class="bd-grid">${col('Domicile', ha.home)}${col('Extérieur', ha.away)}</div>
      </div>
      <div class="detail-card">
        <div class="card-kicker">Bilan croisé</div>
        <h3>Titulaire (≥${TITULAR_THRESHOLD}′) vs Entrant</h3>
        <div class="bd-grid">${col('Titulaire', ts.titular)}${col('Entrant', ts.sub)}</div>
      </div>
    </div>`;
  }

  /* ── Charts ──────────────────────────────────────────── */

  function destroyCharts() {
    if (obsChart)      { try { obsChart.destroy();      } catch (_) {} obsChart = null; }
    if (timelineChart) { try { timelineChart.destroy(); } catch (_) {} timelineChart = null; }
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
          label: 'Moyennes saison', data: avgs,
          backgroundColor: 'rgba(24,95,165,0.12)', borderColor: '#185fa5',
          borderWidth: 2, pointBackgroundColor: '#185fa5', pointRadius: 3
        }]
      },
      options: {
        responsive: false, plugins: { legend: { display: false } },
        scales: { r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, backdropColor: 'transparent', color: '#8d897f', font: { size: 8 } },
          grid: { color: 'rgba(0,0,0,0.08)' }, angleLines: { color: 'rgba(0,0,0,0.08)' },
          pointLabels: { color: '#5e5b54', font: { size: 10 } }
        }}
      }
    });
  }

  function drawTimeline(observations) {
    const canvas = document.querySelector('#obs-timeline-chart');
    if (!canvas || !window.Chart) return;
    if (timelineChart) { timelineChart.destroy(); timelineChart = null; }
    const last = [...observations]
      .sort((a, b) => new Date(a.date_match) - new Date(b.date_match)).slice(-12);
    if (last.length < 2) return;
    const labels = last.map(o => {
      const d = o.date_match ? new Date(o.date_match) : null;
      const day = d ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—';
      const opp = (o.adversaire || '').slice(0, 10);
      const loc = o.domicile === false ? ' E' : ' D';
      return [day, (opp || '?') + loc];
    });
    const notes = last.map(o => (o.note_match != null && o.note_match !== '') ? Number(o.note_match) : null);
    const dimAvgPer = last.map(o => {
      const vals = DIMENSIONS.map(d => o.dimensions?.[d.key] || 0).filter(v => v > 0);
      if (!vals.length) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return +(avg / 3 * 10).toFixed(2);
    });
    timelineChart = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Note /10', data: notes, borderColor: '#185fa5',
            backgroundColor: 'rgba(24,95,165,0.10)', spanGaps: true, tension: 0.3,
            pointBackgroundColor: notes.map(n => n == null ? '#bbb' : (n >= 7 ? '#639922' : n >= 5 ? '#ba7517' : '#d85a30')),
            pointRadius: 4 },
          { label: 'Dimensions ⌀ /10', data: dimAvgPer, borderColor: '#0f6e56',
            backgroundColor: 'rgba(15,110,86,0.06)', spanGaps: true, borderDash: [4, 4],
            tension: 0.3, pointRadius: 3 },
        ]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#5e5b54', font: { size: 11 } } },
          tooltip: { callbacks: {
            afterTitle: items => {
              const o = last[items[0].dataIndex];
              if (!o) return '';
              const parts = [];
              if (o.score_match) parts.push('Score ' + o.score_match);
              if (o.poste_joue)  parts.push('Poste : ' + o.poste_joue);
              if (o.temps_jeu)   parts.push(o.temps_jeu + ' min');
              return parts.join('  ·  ');
            }
          }}
        },
        scales: {
          x: { ticks: { color: '#5e5b54', font: { size: 10 } }, grid: { display: false } },
          y: { min: 0, max: 10, ticks: { color: '#5e5b54', stepSize: 2 }, grid: { color: 'rgba(0,0,0,0.06)' } }
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
      setTimeout(() => { drawRadar(observations); drawTimeline(observations); }, 50);
    }
  }

  /* ── Collecte formulaire ─────────────────────────────── */

  function collectForm(existingId) {
    const state  = app();
    const educator = window.EducatorModule?.getEducator() || { id: 'local', name: '' };
    const dims = {};
    DIMENSIONS.forEach(d => {
      const btn = document.querySelector(`.obs-dim-btn.on[data-obs-dim="${d.key}"]`);
      dims[d.key] = btn ? parseInt(btn.dataset.obsVal) : 0;
    });
    const stats = {};
    STAT_FIELDS.forEach(f => {
      const el = document.querySelector(`[data-obs-stat="${f.key}"]`);
      const v = el && el.value !== '' ? parseInt(el.value) : null;
      if (v != null && !isNaN(v) && v >= 0) stats[f.key] = v;
    });
    const noteEl = document.querySelector('#obs-note');
    const noteV  = noteEl && noteEl.value !== '' ? parseFloat(noteEl.value) : null;
    return {
      id:          existingId || uid(),
      date_match:  document.querySelector('#obs-date')?.value || new Date().toISOString().split('T')[0],
      adversaire:  document.querySelector('#obs-adversaire')?.value || '',
      domicile:    formDom,
      score_match: document.querySelector('#obs-score')?.value || '',
      competition: document.querySelector('#obs-competition')?.value || '',
      temps_jeu:   parseInt(document.querySelector('#obs-temps')?.value) || null,
      note_match:  (noteV != null && !isNaN(noteV)) ? noteV : null,
      poste_joue:  document.querySelector('#obs-poste-joue')?.value || '',
      stats,
      dimensions:  dims,
      commentaire: document.querySelector('#obs-commentaire')?.value || '',
      educator_id: educator.id,
      educator_name: educator.name,
      season:      state?.season || ''
    };
  }

  /* ── Handlers ────────────────────────────────────────── */

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
      showForm = true; editingObsId = null; formDom = true;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'cancel-obs') {
      showForm = false; editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'edit-obs') {
      const obs = getObs(cat, pid, season);
      const ex  = obs.find(o => o.id === target.dataset.obsId);
      showForm = true; editingObsId = target.dataset.obsId; formDom = ex?.domicile !== false;
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
    if (oa === 'set-fixture') {
      const idx = parseInt(target.value, 10);
      if (isNaN(idx)) return true;
      const playerTeam = state.data?.[cat]?.[pid]?.profil?.team;
      const fixtures = obsFixtures(cat, playerTeam);
      const f = fixtures[idx];
      if (!f) { utils()?.showToast('Match introuvable'); return true; }
      const iso = obsToIso(f.date);
      const dateEl = document.querySelector('#obs-date');
      const advEl  = document.querySelector('#obs-adversaire');
      const scEl   = document.querySelector('#obs-score');
      const compEl = document.querySelector('#obs-competition');
      if (dateEl && iso) dateEl.value = iso;
      const opp = f.opponent || (f.team === f.home ? f.away : f.home);
      if (advEl && opp) advEl.value = opp;
      if (scEl && f.score) scEl.value = f.score;
      if (compEl && f.competition) compEl.value = f.competition;
      if (typeof f.isHome === 'boolean') {
        formDom = f.isHome;
        document.querySelectorAll('[data-obs-action="set-domicile"]').forEach(btn => {
          btn.classList.toggle('on', (btn.dataset.val === 'true') === formDom);
        });
      }
      // Remettre le select sur "— Choisir —" pour pouvoir re-sélectionner
      target.value = '';
      utils()?.showToast('Match pré-rempli : ' + (opp || 'champs mis à jour'));
      return true;
    }
    if (oa === 'save-obs') {
      const existingId = target.dataset.obsId || null;
      const data = collectForm(existingId);
      const obs  = getObs(cat, pid, season);
      if (existingId) {
        const idx = obs.findIndex(o => o.id === existingId);
        if (idx >= 0) obs[idx] = data; else obs.push(data);
      } else { obs.push(data); }
      utils()?.schedulePersist('Observation enregistree');
      utils()?.showToast('Observation enregistree');
      showForm = false; editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    if (oa === 'delete-obs') {
      const obs = getObs(cat, pid, season);
      const idx = obs.findIndex(o => o.id === target.dataset.obsId);
      if (idx >= 0) obs.splice(idx, 1);
      utils()?.schedulePersist('Observation supprimee');
      utils()?.showToast('Observation supprimee');
      showForm = false; editingObsId = null;
      utils()?.renderMain();
      return true;
    }
    return false;
  }

  /* Listener change pour le select fixture */
  document.addEventListener('change', (e) => {
    if (e.target?.dataset?.obsAction === 'set-fixture') {
      handleAction(e.target);
    }
  });

  /* Export public */
  window.ObsModule = {
    DIMENSIONS, DIM_OPTS, STAT_FIELDS, POSTES, TITULAR_THRESHOLD,
    dimAvg, getTrend, seasonStats, byOpponent, homeAwayStats, titularStats, noteColor,
    getObs, ensureObs,
    renderBody, handleAction, handleDimClick, afterRender, destroyCharts
  };
})();

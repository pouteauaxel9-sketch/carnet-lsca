/**
 * post-match.js — Saisie multi-joueurs après un match.
 *
 * Workflow :
 *   1) Ouverture depuis la vue catégorie (bouton « + Saisie post-match »).
 *   2) Saisie des infos du match (date, adversaire, score, lieu, compétition).
 *   3) Pour chaque joueur de la catégorie : on coche « présent » et on note
 *      ses 5 dimensions + commentaire court + temps de jeu.
 *   4) Enregistrement : crée une observation par joueur sélectionné.
 *
 * Dépend de :
 *   - window.appState / appUtils (renderAll, schedulePersist, showToast)
 *   - window.JDATA[cat].players  (effectif courant)
 *   - window.ObsModule.{ DIMENSIONS, DIM_OPTS, getObs }
 *   - window.EducatorModule.getEducator()  (optionnel)
 *
 * Expose : window.PostMatchModule.{ open, close, handleAction, isOpen }
 */
(function () {
  'use strict';

  /* ── helpers ───────────────────────────────────────────── */

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  const utils = () => window.appUtils;
  const state = () => window.appState;
  const dims = () => window.ObsModule?.DIMENSIONS || [];
  const dimOpts = () => window.ObsModule?.DIM_OPTS || [];

  /* ── état session ──────────────────────────────────────── */

  let session = null;
  /* session = {
       cat, season,
       meta: { date, adversaire, score, domicile, temps_collectif, competition },
       lines: { [pid]: { present:bool, dimensions:{tech,tact,...}, comment:'', temps:'',
                          note:'', poste:'', stats:{...}, expanded:false } }
     }
  */

  function isOpen() { return session !== null; }

  function open(cat) {
    const s = state();
    if (!s) return;
    const targetCat = cat || s.cat;
    const players = (window.JDATA?.[targetCat]?.players || []);
    const lines = {};
    players.forEach(p => {
      lines[p.name] = {
        present: false, dimensions: {}, comment: '', temps: '',
        note: '', poste: '', stats: {}, expanded: false,
      };
    });
    session = {
      cat: targetCat,
      season: s.season,
      meta: {
        date: new Date().toISOString().split('T')[0],
        adversaire: '',
        score: '',
        domicile: true,
        competition: '',
        team: '',                  // équipe filtrée (vide = tous joueurs)
      },
      lines,
    };
    renderModal();
  }

  function close() {
    if (session && hasDirtyChanges() && !confirm('Annuler la saisie en cours ? Les notes ne seront pas conservées.')) {
      return;
    }
    session = null;
    renderModal();
  }

  function hasDirtyChanges() {
    if (!session) return false;
    if (session.meta.adversaire || session.meta.score) return true;
    return Object.values(session.lines).some(l => l.present);
  }

  /* ── rendu ──────────────────────────────────────────────── */

  function renderModal() {
    let el = document.querySelector('#post-match-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'post-match-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = session ? renderOverlay() : '';
  }

  function renderOverlay() {
    const CAT_LABELS = window.CAT_LABELS || {};
    const catLabel = CAT_LABELS[session.cat] || session.cat.toUpperCase();

    const presentCount = Object.values(session.lines).filter(l => l.present).length;
    const totalCount = Object.keys(session.lines).length;

    return `
      <div class="modal-overlay" data-postmatch-overlay>
        <div class="modal-box modal-box--xl">
          <div class="modal-head">
            <div>
              <div class="card-kicker">${h(catLabel)} • Après-match</div>
              <h3>Saisie post-match (${presentCount}/${totalCount} présents)</h3>
            </div>
            <button class="modal-close" type="button" data-postmatch-action="close">×</button>
          </div>

          ${renderMeta()}
          ${renderLegend()}
          ${renderLinesHeader()}
          <div class="postmatch-lines">${renderLines()}</div>

          <div class="modal-footer">
            <button class="btn-ghost" type="button" data-postmatch-action="toggle-all">
              ${presentCount === totalCount ? 'Aucun présent' : 'Tous présents'}
            </button>
            <span style="flex:1"></span>
            <button class="btn-ghost" type="button" data-postmatch-action="close">Annuler</button>
            <button class="btn-primary" type="button" data-postmatch-action="save"
              ${presentCount === 0 ? 'disabled' : ''}>Enregistrer (${presentCount})</button>
          </div>
        </div>
      </div>`;
  }

  function renderMeta() {
    const m = session.meta;
    const domBtns = ['true', 'false'].map(v => {
      const label = v === 'true' ? 'Domicile' : 'Extérieur';
      const active = (v === 'true') === m.domicile;
      return `<button class="foot-btn ${active ? 'on' : ''}" type="button"
        data-postmatch-action="set-domicile" data-val="${v}">${h(label)}</button>`;
    }).join('');

    const teams = (window.CLUB_DATA?.categories?.[session.cat]?.teams) || [];
    const teamOptions = ['', ...teams].map(t =>
      `<option value="${h(t)}" ${m.team === t ? 'selected' : ''}>${t ? h(t) : 'Toutes les équipes'}</option>`
    ).join('');

    // Fixtures FFF scrapées (past + upcoming) pour pré-remplir la saisie
    const fixtures = getFixtures(session.cat, m.team);
    const fixtureBlock = fixtures.length
      ? `
      <div class="field-group postmatch-fixture-picker">
        <label class="field-label">Pré-remplir depuis un match scrapé (${fixtures.length})</label>
        <select class="field-input" data-postmatch-action="set-fixture">
          <option value="">— Choisir un match —</option>
          ${fixtures.map((f, i) => `<option value="${i}">${h(formatFixtureLabel(f))}</option>`).join('')}
        </select>
        <div class="field-hint">Auto-rempli depuis le scraper FFF. Modifiable ensuite.</div>
      </div>`
      : `
      <div class="field-group postmatch-fixture-picker">
        <label class="field-label">Pré-remplir depuis un match scrapé</label>
        <select class="field-input" disabled>
          <option>— Aucun match disponible —</option>
        </select>
        <div class="field-hint">Charge les feeds FFF (bouton « Actualiser ») ou sélectionne une équipe ci-dessus pour filtrer.</div>
      </div>`;

    return `
      <div class="postmatch-meta">
        <div class="field-group">
          <label class="field-label">Équipe</label>
          <select class="field-input" data-postmatch-action="set-team">${teamOptions}</select>
        </div>
        ${fixtureBlock}
        <div class="field-group">
          <label class="field-label">Date</label>
          <input class="field-input" type="date" id="pm-date" value="${h(m.date)}"
            data-postmatch-field="date">
        </div>
        <div class="field-group">
          <label class="field-label">Adversaire</label>
          <input class="field-input" type="text" value="${h(m.adversaire)}"
            placeholder="Nom du club..." data-postmatch-field="adversaire">
        </div>
        <div class="field-group">
          <label class="field-label">Score</label>
          <input class="field-input" type="text" value="${h(m.score)}"
            placeholder="3-1" data-postmatch-field="score">
        </div>
        <div class="field-group">
          <label class="field-label">Compétition</label>
          <input class="field-input" type="text" value="${h(m.competition)}"
            placeholder="Championnat..." data-postmatch-field="competition">
        </div>
        <div class="field-group">
          <label class="field-label">Lieu</label>
          <div class="foot-row">${domBtns}</div>
        </div>
      </div>`;
  }

  /* ── Fixtures scrapées (feeds FFF) ───────────────────────── */

  function loadFeeds() {
    try { return JSON.parse(localStorage.getItem('cfb6_feeds') || '{}') || {}; }
    catch { return {}; }
  }

  function getFixtures(cat, team) {
    const feeds = loadFeeds()[cat] || {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const past = (feeds.past || []).map(f => ({ ...f, kind: 'past' }));
    const up   = (feeds.upcoming || []).map(f => {
      const ts = toDate(f.date);
      // Si la date est passée, on traite ce match comme "passé" (le scraper hebdo
      // ne l'a pas encore déplacé). L'icône devient ✓ au lieu de 📅.
      return { ...f, kind: (ts && ts < todayMs) ? 'past' : 'upcoming' };
    });
    const all = [...past, ...up];
    const filtered = team ? all.filter(f => !f.team || f.team === team) : all;
    filtered.sort((a, b) => toDate(b.date) - toDate(a.date));
    return filtered.slice(0, 30);
  }

  function toDate(d) {
    if (!d) return 0;
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(d).getTime();
    const m = d.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();
    return 0;
  }

  function toIsoDate(d) {
    if (!d) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const m = d.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  function formatFixtureLabel(f) {
    const dateStr = f.date || '?';
    const lieu = f.isHome === true ? 'Dom.' : f.isHome === false ? 'Ext.' : '';
    const opp = f.opponent || (f.away && f.home ? (f.team === f.home ? f.away : f.home) : '?');
    const sc  = f.score ? ` — ${f.score}` : '';
    const kind = f.kind === 'upcoming' ? '📅' : '✓';
    return `${kind} ${dateStr} ${lieu ? '(' + lieu + ')' : ''} vs ${opp}${sc}`;
  }

  function renderLegend() {
    const items = dimOpts().map(o =>
      `<span class="postmatch-legend-item" style="background:${o.bg};color:${o.color};border-color:${o.color}">
        ${h(o.symbol)} ${h(o.label)}
      </span>`).join('');
    return `<div class="postmatch-legend">${items}</div>`;
  }

  function renderLinesHeader() {
    const dimsHtml = dims().map(d => `<span title="${h(d.question)}">${h(d.label.slice(0,4))}.</span>`).join('');
    return `
      <div class="postmatch-lines-header">
        <span class="pm-col-presence">Pré.</span>
        <span class="pm-col-name">Joueur</span>
        <span class="pm-col-temps">Tps</span>
        <span class="pm-col-dims">${dimsHtml}</span>
        <span class="pm-col-comment">Commentaire</span>
      </div>`;
  }

  function renderLines() {
    const all = window.JDATA?.[session.cat]?.players || [];
    if (!all.length) {
      return `<div class="dash-empty"><div class="dash-empty-msg">Aucun joueur dans cette catégorie</div>
        <div class="dash-empty-hint">Ajoute des joueurs depuis l'effectif.</div></div>`;
    }
    // Filtrage par équipe si meta.team renseigné
    const list = session.meta.team
      ? all.filter(p => state()?.data?.[session.cat]?.[p.name]?.profil?.team === session.meta.team)
      : all;
    if (!list.length) {
      return `<div class="dash-empty"><div class="dash-empty-msg">Aucun joueur dans cette équipe</div>
        <div class="dash-empty-hint">Assigne des joueurs à l'équipe « ${h(session.meta.team)} » depuis leur profil, ou choisis « Toutes les équipes ».</div></div>`;
    }
    return list.map(p => renderLine(p.name)).join('');
  }

  function renderLine(pid) {
    const line = session.lines[pid] || { present: false, dimensions: {}, comment: '', temps: '', stats: {} };
    const injStatus = window.InjuryModule?.currentStatus?.(pid, session.cat);
    const injBadge = injStatus
      ? (() => {
          const td = (window.InjuryModule?.TYPES || []).find(t => t.key === injStatus.type) || {};
          return ` <span class="pm-inj-badge" title="${h(td.label || '')}${injStatus.zone ? ' · ' + h(injStatus.zone) : ''}">${td.icon || '⚠'}</span>`;
        })()
      : '';
    const dimsBtns = dims().map(d => {
      const cur = line.dimensions[d.key] ?? '';
      const btns = dimOpts().map(o => {
        const active = String(cur) === String(o.val);
        const style = active
          ? `background:${o.bg};border-color:${o.color};color:${o.color}`
          : '';
        return `<button class="postmatch-dim-btn ${active ? 'on' : ''}"
          type="button"
          data-postmatch-action="set-dim"
          data-pid="${h(pid)}" data-dim="${h(d.key)}" data-val="${o.val}"
          style="${style}" title="${h(d.label)} : ${h(o.label)}">${h(o.symbol)}</button>`;
      }).join('');
      return `<div class="postmatch-dim-group">${btns}</div>`;
    }).join('');

    // Indicateur compact dans la ligne : note + buts/passes si > 0
    const stats = line.stats || {};
    const hasStats = Object.values(stats).some(v => v > 0) || line.note || line.poste;
    const summaryBits = [];
    if (line.note) summaryBits.push(`<span class="pm-mini-note" style="background:${noteCol(line.note)};color:#fff">${h(line.note)}</span>`);
    if (stats.buts) summaryBits.push(`<span class="pm-mini-stat">G ${stats.buts}</span>`);
    if (stats.passes_d) summaryBits.push(`<span class="pm-mini-stat">A ${stats.passes_d}</span>`);

    const expansion = line.expanded ? renderExpansion(pid, line) : '';

    return `
      <div class="postmatch-line ${line.present ? 'is-present' : ''} ${line.expanded ? 'is-expanded' : ''}" data-pid="${h(pid)}">
        <label class="postmatch-presence">
          <input type="checkbox" ${line.present ? 'checked' : ''}
            data-postmatch-action="toggle-presence" data-pid="${h(pid)}">
        </label>
        <span class="postmatch-name">${h(pid)}${injBadge}
          ${summaryBits.length ? `<span class="pm-mini-summary">${summaryBits.join('')}</span>` : ''}
        </span>
        <input class="postmatch-temps" type="number" min="0" max="120" placeholder="—"
          value="${h(line.temps)}"
          data-postmatch-action="set-temps" data-pid="${h(pid)}">
        <div class="postmatch-dims">${dimsBtns}</div>
        <input class="postmatch-comment" type="text"
          placeholder="Mot court..." value="${h(line.comment)}"
          data-postmatch-action="set-comment" data-pid="${h(pid)}">
        <button class="postmatch-toggle ${line.expanded ? 'on' : ''} ${hasStats ? 'has-data' : ''}"
          type="button" title="${line.expanded ? 'Replier les détails' : 'Saisir note + stats'}"
          data-postmatch-action="toggle-details" data-pid="${h(pid)}">
          ${line.expanded ? '▴' : '▾'}${hasStats && !line.expanded ? ' •' : ''}
        </button>
        ${expansion}
      </div>`;
  }

  function noteCol(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return '#8d897f';
    if (v >= 7) return '#639922';
    if (v >= 5) return '#ba7517';
    return '#d85a30';
  }

  function renderExpansion(pid, line) {
    const POSTES = window.ObsModule?.POSTES || [];
    const STAT_FIELDS = window.ObsModule?.STAT_FIELDS || [];
    const posteOpts = ['', ...POSTES].map(p =>
      `<option value="${h(p)}" ${line.poste === p ? 'selected' : ''}>${p || '— Position non précisée —'}</option>`
    ).join('');

    const off = STAT_FIELDS.filter(f => f.group === 'offensive');
    const dis = STAT_FIELDS.filter(f => f.group === 'discipline');

    const inputs = (fields) => fields.map(f => `
      <label class="pm-stat-field">
        <span class="pm-stat-label" title="${h(f.label)}">${h(f.short)}</span>
        <input type="number" min="0" max="${f.max}" step="${f.step}"
          value="${h(line.stats?.[f.key] ?? '')}"
          data-postmatch-action="set-stat" data-pid="${h(pid)}" data-stat="${h(f.key)}"
          placeholder="0">
      </label>`).join('');

    return `<div class="postmatch-expansion">
      <div class="pm-exp-row">
        <label class="pm-exp-field">
          <span>Note /10</span>
          <input type="number" min="0" max="10" step="0.5"
            value="${h(line.note)}" placeholder="—"
            data-postmatch-action="set-note" data-pid="${h(pid)}">
        </label>
        <label class="pm-exp-field">
          <span>Position jouée</span>
          <select data-postmatch-action="set-poste" data-pid="${h(pid)}">${posteOpts}</select>
        </label>
      </div>
      <div class="pm-stat-block">
        <div class="pm-stat-block-label">Offensif</div>
        <div class="pm-stat-row">${inputs(off)}</div>
      </div>
      <div class="pm-stat-block">
        <div class="pm-stat-block-label">Discipline</div>
        <div class="pm-stat-row">${inputs(dis)}</div>
      </div>
    </div>`;
  }

  /* ── actions ────────────────────────────────────────────── */

  function handleAction(target) {
    const a = target.dataset.postmatchAction;
    if (!a) return false;
    if (a === 'close') { close(); return true; }
    if (a === 'set-domicile') {
      session.meta.domicile = target.dataset.val === 'true';
      // re-render just the meta block
      renderModal();
      return true;
    }
    if (a === 'set-team') {
      session.meta.team = target.value || '';
      renderModal();
      return true;
    }
    if (a === 'set-fixture') {
      const idx = parseInt(target.value, 10);
      if (isNaN(idx)) return true;
      const fixtures = getFixtures(session.cat, session.meta.team);
      const f = fixtures[idx];
      if (!f) { utils()?.showToast('Match introuvable'); return true; }

      // Mise à jour de l'état session
      const iso = toIsoDate(f.date);
      if (iso) session.meta.date = iso;
      const opp = f.opponent || (f.team === f.home ? f.away : f.home);
      if (opp) session.meta.adversaire = opp;
      if (f.score) session.meta.score = f.score;
      if (f.competition) session.meta.competition = f.competition;
      if (typeof f.isHome === 'boolean') session.meta.domicile = f.isHome;

      // Mise à jour DIRECTE des inputs (pas de re-render complet, le menu reste stable)
      const root = document.querySelector('#post-match-modal-root');
      if (root) {
        const dateEl = root.querySelector('[data-postmatch-field="date"]');
        const advEl  = root.querySelector('[data-postmatch-field="adversaire"]');
        const scEl   = root.querySelector('[data-postmatch-field="score"]');
        const compEl = root.querySelector('[data-postmatch-field="competition"]');
        if (dateEl && session.meta.date) dateEl.value = session.meta.date;
        if (advEl)   advEl.value  = session.meta.adversaire || '';
        if (scEl)    scEl.value   = session.meta.score || '';
        if (compEl)  compEl.value = session.meta.competition || '';
        root.querySelectorAll('[data-postmatch-action="set-domicile"]').forEach(btn => {
          btn.classList.toggle('on', (btn.dataset.val === 'true') === session.meta.domicile);
        });
        // Remettre le select fixture sur "— Choisir un match —" pour pouvoir re-sélectionner
        target.value = '';
      }
      utils()?.showToast('Match pré-rempli : ' + (session.meta.adversaire || 'champs mis à jour'));
      return true;
    }
    if (a === 'toggle-presence') {
      const pid = target.dataset.pid;
      session.lines[pid].present = target.checked;
      // update only the line
      const row = document.querySelector(`.postmatch-line[data-pid="${cssEscape(pid)}"]`);
      if (row) row.classList.toggle('is-present', target.checked);
      // update counter
      const presentCount = Object.values(session.lines).filter(l => l.present).length;
      updateHeaderCounter(presentCount);
      return true;
    }
    if (a === 'toggle-all') {
      const all = Object.values(session.lines).every(l => l.present);
      Object.values(session.lines).forEach(l => { l.present = !all; });
      renderModal();
      return true;
    }
    if (a === 'set-dim') {
      const pid = target.dataset.pid;
      const dim = target.dataset.dim;
      const val = parseInt(target.dataset.val);
      const line = session.lines[pid];
      if (!line) return true;
      if (line.dimensions[dim] === val) {
        delete line.dimensions[dim];
      } else {
        line.dimensions[dim] = val;
        // si on note, on coche présent automatiquement
        if (!line.present) line.present = true;
      }
      // re-render local line to update button styles
      const lineEl = document.querySelector(`.postmatch-line[data-pid="${cssEscape(pid)}"]`);
      if (lineEl) {
        lineEl.outerHTML = renderLine(pid);
      }
      updateHeaderCounter(Object.values(session.lines).filter(l => l.present).length);
      return true;
    }
    if (a === 'set-comment') {
      session.lines[target.dataset.pid].comment = target.value || '';
      return true;
    }
    if (a === 'set-temps') {
      session.lines[target.dataset.pid].temps = target.value || '';
      return true;
    }
    if (a === 'set-note') {
      const pid = target.dataset.pid;
      const line = session.lines[pid];
      if (!line) return true;
      line.note = target.value || '';
      if (line.note && !line.present) line.present = true;
      updateMiniSummary(pid);
      updateHeaderCounter(Object.values(session.lines).filter(l => l.present).length);
      return true;
    }
    if (a === 'set-poste') {
      const pid = target.dataset.pid;
      session.lines[pid].poste = target.value || '';
      return true;
    }
    if (a === 'set-stat') {
      const pid = target.dataset.pid;
      const key = target.dataset.stat;
      const line = session.lines[pid];
      if (!line) return true;
      const v = target.value === '' ? null : parseInt(target.value);
      if (v == null || isNaN(v)) {
        delete line.stats[key];
      } else {
        line.stats[key] = v;
        if (!line.present) line.present = true;
      }
      updateMiniSummary(pid);
      updateHeaderCounter(Object.values(session.lines).filter(l => l.present).length);
      return true;
    }
    if (a === 'toggle-details') {
      const pid = target.dataset.pid;
      const line = session.lines[pid];
      if (!line) return true;
      line.expanded = !line.expanded;
      // re-render uniquement la ligne pour conserver le focus ailleurs
      const lineEl = document.querySelector(`.postmatch-line[data-pid="${cssEscape(pid)}"]`);
      if (lineEl) lineEl.outerHTML = renderLine(pid);
      return true;
    }
    if (a === 'save') {
      saveAll();
      return true;
    }
    return false;
  }

  function updateMiniSummary(pid) {
    // re-render uniquement la summary de la ligne (sans casser le focus de l'input courant)
    const lineEl = document.querySelector(`.postmatch-line[data-pid="${cssEscape(pid)}"] .pm-mini-summary`);
    const line = session.lines[pid];
    if (!line) return;
    const stats = line.stats || {};
    const bits = [];
    if (line.note) bits.push(`<span class="pm-mini-note" style="background:${noteCol(line.note)};color:#fff">${h(line.note)}</span>`);
    if (stats.buts) bits.push(`<span class="pm-mini-stat">G ${stats.buts}</span>`);
    if (stats.passes_d) bits.push(`<span class="pm-mini-stat">A ${stats.passes_d}</span>`);
    if (lineEl) {
      lineEl.innerHTML = bits.join('');
    } else {
      const nameEl = document.querySelector(`.postmatch-line[data-pid="${cssEscape(pid)}"] .postmatch-name`);
      if (nameEl && bits.length) {
        const span = document.createElement('span');
        span.className = 'pm-mini-summary';
        span.innerHTML = bits.join('');
        nameEl.appendChild(span);
      }
    }
  }

  function updateHeaderCounter(presentCount) {
    const head = document.querySelector('#post-match-modal-root h3');
    if (head) {
      const total = Object.keys(session.lines).length;
      head.textContent = `Saisie post-match (${presentCount}/${total} présents)`;
    }
    const saveBtn = document.querySelector('[data-postmatch-action="save"]');
    if (saveBtn) {
      saveBtn.textContent = `Enregistrer (${presentCount})`;
      saveBtn.disabled = presentCount === 0;
    }
    const toggleBtn = document.querySelector('[data-postmatch-action="toggle-all"]');
    if (toggleBtn) {
      const total = Object.keys(session.lines).length;
      toggleBtn.textContent = presentCount === total ? 'Aucun présent' : 'Tous présents';
    }
  }

  function cssEscape(str) {
    return String(str).replace(/(["\\])/g, '\\$1');
  }

  function handleMetaInput(target) {
    if (!session) return false;
    const f = target.dataset.postmatchField;
    if (!f) return false;
    session.meta[f] = target.value || '';
    return true;
  }

  /* ── enregistrement ─────────────────────────────────── */

  function saveAll() {
    const s = state();
    if (!s) return;
    const educator = window.EducatorModule?.getEducator() || { id: 'local', name: '' };
    const cat = session.cat;
    const season = session.season;
    const meta = session.meta;

    let created = 0;
    Object.entries(session.lines).forEach(([pid, line]) => {
      if (!line.present) return;
      if (!s.data[cat][pid]) s.data[cat][pid] = {};
      if (!s.data[cat][pid].observations) s.data[cat][pid].observations = {};
      if (!s.data[cat][pid].observations[season]) s.data[cat][pid].observations[season] = [];

      const noteV = (line.note != null && line.note !== '') ? parseFloat(line.note) : null;
      const cleanStats = {};
      Object.entries(line.stats || {}).forEach(([k, v]) => {
        if (v && Number(v) > 0) cleanStats[k] = Number(v);
      });

      const playerTeam = s.data[cat][pid]?.profil?.team || '';
      const obsTeam = meta.team || playerTeam;

      s.data[cat][pid].observations[season].push({
        id: uid(),
        date_match: meta.date,
        adversaire: meta.adversaire || '',
        domicile: meta.domicile,
        score_match: meta.score || '',
        team: obsTeam,
        temps_jeu: parseInt(line.temps) || null,
        note_match: (noteV != null && !isNaN(noteV)) ? noteV : null,
        poste_joue: line.poste || '',
        stats: cleanStats,
        dimensions: { ...line.dimensions },
        commentaire: line.comment || '',
        competition: meta.competition || '',
        educator_id: educator.id,
        educator_name: educator.name,
        season,
        source: 'post-match-batch',
      });
      created += 1;
    });

    utils()?.schedulePersist('Saisie post-match enregistrée');
    utils()?.showToast(created + ' observation' + (created > 1 ? 's' : '') + ' créée' + (created > 1 ? 's' : ''));
    session = null;
    renderModal();
    utils()?.renderAll();
  }

  document.addEventListener('input', e => {
    if (!session) return;
    handleMetaInput(e.target);
    const a = e.target.dataset?.postmatchAction;
    if (a === 'set-comment' || a === 'set-temps' || a === 'set-note' || a === 'set-stat') {
      handleAction(e.target);
    }
  });

  document.addEventListener('change', e => {
    if (!session) return;
    const a = e.target.dataset?.postmatchAction;
    if (a === 'toggle-presence' || a === 'set-poste' || a === 'set-stat'
        || a === 'set-team' || a === 'set-fixture') {
      handleAction(e.target);
    }
  });

  document.addEventListener('click', e => {
    if (!session) return;
    if (e.target?.matches?.('[data-postmatch-overlay]')) close();
  });

  document.addEventListener('keydown', e => {
    if (session && e.key === 'Escape') close();
  });

  window.PostMatchModule = { open, close, handleAction, isOpen };
})();

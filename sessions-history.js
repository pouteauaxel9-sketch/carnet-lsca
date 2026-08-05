/**
 * sessions-history.js — Historique des séances terrain (v2)
 *
 * Vues :
 *  - Liste : 5 dernières séances + toggle "voir toutes", puis stats catégorie
 *    (courbe moyenne jonglerie + Top 5 jongleurs + Top 5 progressions)
 *  - Détail : éditable (jonglages / objectifs / présents) + delta vs séance précédente
 *
 * Expose : window.SessionsHistoryModule.{ renderBody, handleAction,
 *          renderPlayerJuggleWidget }
 */
(function () {
  'use strict';

  const SESSIONS_KEY = 'cfb6_live_sessions_v1';

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s == null ? '' : s); }

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveSessions(store) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(store)); } catch {}
  }

  function playerLabel(pid, cat) {
    cat = cat || state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil
              || state().data?.[cat]?.[pid]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }

  function catPlayers(cat) {
    cat = cat || state().cat;
    const players = state().data?.[cat] || {};
    return Object.keys(players).filter(pid => {
      const p = players[pid];
      return p && (p.profil || p.juggleLog);
    });
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }
  function formatShortDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso + 'T00:00:00');
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch { return iso; }
  }

  /* ── Lecture juggle par joueur ───────────────────────── */

  function playerJuggleLog(pid, cat) {
    cat = cat || state().cat;
    const raw = state().data?.[cat]?.[pid]?.juggleLog;
    return Array.isArray(raw) ? raw : [];
  }

  function jgVal(entry, foot) {
    if (!entry) return null;
    if (foot === 'gauche') return entry.gauche ?? entry.faible ?? null;
    if (foot === 'droit')  return entry.droit  ?? entry.fort   ?? null;
    if (foot === 'deux')   return entry.deux   ?? null;
    return null;
  }

  function bestScore(entry) {
    const v = [jgVal(entry, 'gauche'), jgVal(entry, 'droit'), jgVal(entry, 'deux')].filter(x => x != null);
    return v.length ? Math.max(...v) : null;
  }

  /* ── Écriture juggle pour date passée ────────────────── */

  function upsertJuggleEntry(pid, cat, date, foot, val) {
    cat = cat || state().cat;
    if (!state().data[cat][pid]) state().data[cat][pid] = { profil: {} };
    if (!state().data[cat][pid].juggleLog) state().data[cat][pid].juggleLog = [];
    const log = state().data[cat][pid].juggleLog;
    let entry = log.find(e => e.date === date);
    if (!entry) {
      entry = { date, ts: new Date().toISOString(), gauche: null, droit: null, deux: null };
      log.push(entry);
    }
    if (foot === 'gauche') entry.gauche = val;
    if (foot === 'droit')  entry.droit  = val;
    if (foot === 'deux')   entry.deux   = val;
    entry.ts = new Date().toISOString();
    utils().schedulePersist?.();
  }

  /* ── Vue principale ──────────────────────────────────── */

  function renderBody(cat) {
    cat = cat || state().cat;
    const selectedDate = state().historySessionDate || null;
    if (selectedDate) return renderDetail(cat, selectedDate);
    return renderList(cat);
  }

  /* ── Liste : 5 dernières + toggle + stats catégorie ──── */

  function renderList(cat) {
    const store = loadSessions();
    const sessions = store[cat] || {};
    const dates = Object.keys(sessions).sort().reverse();
    const showAll = !!state().historyShowAll;
    const visibleDates = showAll ? dates : dates.slice(0, 5);

    if (dates.length === 0) {
      return `
        <div class="sh-empty">
          <div class="sh-empty-icon">📝</div>
          <h3>Aucune séance enregistrée</h3>
          <p>Les séances apparaîtront ici après ta première utilisation du Mode Terrain.</p>
        </div>
        ${renderCategoryJuggleStats(cat)}`;
    }

    // Stats globales
    let totalObj = 0, totalAcquis = 0, totalReussites = 0, totalTentatives = 0, totalPresences = 0;
    dates.forEach(d => {
      const s = sessions[d];
      totalObj += s.objectives?.length || 0;
      totalAcquis += (s.objectives || []).filter(o => o.acquis).length;
      totalReussites += (s.objectives || []).reduce((sum, o) => sum + (o.reussites || 0), 0);
      totalTentatives += (s.objectives || []).reduce((sum, o) => sum + (o.tentatives || 0), 0);
      totalPresences += (s.presentPids || []).length;
    });
    const avgPresent = dates.length ? Math.round(totalPresences / dates.length) : 0;
    const ratio = totalTentatives > 0 ? Math.round((totalReussites / totalTentatives) * 100) : null;

    const olderCount = dates.length - 5;

    return `
      <div class="sh-wrap">
        <div class="sh-stats">
          <div class="sh-stat"><strong>${dates.length}</strong><span>Séances</span></div>
          <div class="sh-stat"><strong>${avgPresent}</strong><span>Présents (moy.)</span></div>
          <div class="sh-stat"><strong>${totalAcquis}/${totalObj}</strong><span>Objectifs acquis</span></div>
          <div class="sh-stat"><strong>${ratio != null ? ratio + '%' : '—'}</strong><span>Ratio réussite</span></div>
        </div>

        <section class="sh-section-block">
          <h3 class="sh-section-title">📝 Séances ${showAll ? `(${dates.length})` : `— 5 dernières`}</h3>
          <div class="sh-list">
            ${visibleDates.map(d => renderListRow(cat, d, sessions[d])).join('')}
          </div>
          ${dates.length > 5 ? `
            <div class="sh-toggle-wrap">
              <button class="btn btn-ghost sh-toggle" type="button" data-history-action="toggle-show-all">
                ${showAll
                  ? `▲ Masquer les anciennes`
                  : `▼ Voir toutes les séances (${olderCount} plus anciennes)`}
              </button>
            </div>` : ''}
        </section>

        ${renderCategoryJuggleStats(cat)}
      </div>`;
  }

  function renderListRow(cat, date, s) {
    const nbPresents = (s.presentPids || []).length;
    const objectives = s.objectives || [];
    const nbAcquis = objectives.filter(o => o.acquis).length;
    const totalRs = objectives.reduce((a, o) => a + (o.reussites || 0), 0);
    const totalTs = objectives.reduce((a, o) => a + (o.tentatives || 0), 0);
    const ratio = totalTs > 0 ? Math.round((totalRs / totalTs) * 100) : null;
    const ratioCol = ratio == null ? '#94a3b8' : ratio >= 70 ? '#16a34a' : ratio >= 45 ? '#d97706' : '#dc2626';

    return `
      <article class="sh-row" data-history-action="open-detail" data-date="${h(date)}">
        <div class="sh-row-date">
          <div class="sh-row-day">${h(formatShortDate(date))}</div>
          <div class="sh-row-full">${h(formatDate(date))}</div>
        </div>
        <div class="sh-row-stats">
          <div class="sh-row-stat"><strong>${nbPresents}</strong><span>👥 Présents</span></div>
          <div class="sh-row-stat"><strong>${nbAcquis}/${objectives.length}</strong><span>🎯 Acquis</span></div>
          <div class="sh-row-stat"><strong>${totalRs}/${totalTs}</strong><span>Réussite</span></div>
          <div class="sh-row-stat"><strong style="color:${ratioCol}">${ratio != null ? ratio + '%' : '—'}</strong><span>Ratio</span></div>
        </div>
        <div class="sh-row-arrow">✎</div>
      </article>`;
  }

  /* ── Bloc stats jonglerie catégorie ──────────────────── */

  function renderCategoryJuggleStats(cat) {
    cat = cat || state().cat;
    const players = catPlayers(cat);

    // Collecte : { pid, entries: [{date, g, d, deux, best}] }
    const perPlayer = players.map(pid => {
      const log = playerJuggleLog(pid, cat)
        .filter(e => e && e.date)
        .map(e => ({
          date: e.date,
          gauche: jgVal(e, 'gauche'),
          droit:  jgVal(e, 'droit'),
          deux:   jgVal(e, 'deux'),
          best:   bestScore(e),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { pid, entries: log };
    }).filter(p => p.entries.length > 0);

    if (perPlayer.length === 0) {
      return `
        <section class="sh-section-block">
          <h3 class="sh-section-title">⚽ Stats jonglerie catégorie</h3>
          <p class="sh-muted">Aucune donnée de jonglerie pour cette catégorie.</p>
        </section>`;
    }

    // ── Courbe moyennes catégorie : { date -> {g:[], d:[], deux:[]} }
    const byDate = {};
    perPlayer.forEach(({ entries }) => {
      entries.forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = { gauche: [], droit: [], deux: [] };
        if (e.gauche != null) byDate[e.date].gauche.push(e.gauche);
        if (e.droit  != null) byDate[e.date].droit.push(e.droit);
        if (e.deux   != null) byDate[e.date].deux.push(e.deux);
      });
    });
    const chartData = Object.keys(byDate).sort().map(date => {
      const b = byDate[date];
      const avg = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
      return {
        date,
        gauche: avg(b.gauche),
        droit:  avg(b.droit),
        deux:   avg(b.deux),
      };
    });
    const svg = renderCategoryChart(chartData);

    // ── Top 5 meilleurs jongleurs (meilleur score max — 2 pieds prioritaire, sinon best all)
    const topBest = perPlayer.map(({ pid, entries }) => {
      // Score de référence : meilleur "2 pieds" jamais atteint, sinon meilleur toute jambe
      let deuxMax = null, allMax = null;
      entries.forEach(e => {
        if (e.deux != null && (deuxMax == null || e.deux > deuxMax)) deuxMax = e.deux;
        if (e.best != null && (allMax  == null || e.best > allMax )) allMax  = e.best;
      });
      const last = entries[entries.length - 1];
      return {
        pid,
        score: deuxMax != null ? deuxMax : allMax,
        useDeux: deuxMax != null,
        lastDate: last?.date,
      };
    }).filter(x => x.score != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // ── Top 5 progressions (delta best score : dernière séance vs séance précédente)
    const topProg = perPlayer.map(({ pid, entries }) => {
      if (entries.length < 2) return null;
      const last = entries[entries.length - 1];
      const prev = entries[entries.length - 2];
      if (last.best == null || prev.best == null) return null;
      return { pid, delta: last.best - prev.best, last: last.best, prev: prev.best, lastDate: last.date };
    }).filter(x => x && x.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    return `
      <section class="sh-section-block sh-cat-stats">
        <h3 class="sh-section-title">⚽ Stats jonglerie catégorie</h3>

        <div class="sh-cat-chart-wrap">
          <div class="sh-cat-chart-label">Moyenne de la catégorie par séance</div>
          ${svg}
        </div>

        <div class="sh-cat-tops">
          <div class="sh-cat-top">
            <h4>🏆 Top 5 jongleurs</h4>
            ${topBest.length === 0 ? '<p class="sh-muted">—</p>' : `
              <ol class="sh-cat-top-list">
                ${topBest.map((t, i) => `
                  <li class="sh-cat-top-item">
                    <span class="sh-cat-top-rank">${i + 1}</span>
                    <span class="sh-cat-top-name">${h(playerLabel(t.pid, cat))}</span>
                    <span class="sh-cat-top-score">${t.score}${t.useDeux ? ' <em>2P</em>' : ''}</span>
                  </li>`).join('')}
              </ol>`}
          </div>

          <div class="sh-cat-top">
            <h4>📈 Top 5 progressions</h4>
            ${topProg.length === 0 ? '<p class="sh-muted">Pas encore de progression (min. 2 mesures).</p>' : `
              <ol class="sh-cat-top-list">
                ${topProg.map((t, i) => `
                  <li class="sh-cat-top-item">
                    <span class="sh-cat-top-rank">${i + 1}</span>
                    <span class="sh-cat-top-name">${h(playerLabel(t.pid, cat))}</span>
                    <span class="sh-cat-top-score sh-cat-top-delta">+${t.delta} <em>(${t.prev}→${t.last})</em></span>
                  </li>`).join('')}
              </ol>`}
          </div>
        </div>
      </section>`;
  }

  function renderCategoryChart(entries) {
    if (!entries.length) return '<p class="sh-muted">Aucune mesure.</p>';
    const W = 640, H = 200, PAD_L = 34, PAD_R = 14, PAD_T = 26, PAD_B = 28;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    let maxVal = 0;
    entries.forEach(e => {
      [e.gauche, e.droit, e.deux].forEach(v => { if (v != null && v > maxVal) maxVal = v; });
    });
    if (maxVal === 0) maxVal = 10;
    maxVal = Math.ceil(maxVal * 1.15);

    const n = entries.length;
    const xStep = n > 1 ? chartW / (n - 1) : chartW;

    function makeLine(key, color) {
      const pts = entries.map((e, i) => {
        const v = e[key];
        if (v == null) return null;
        const x = PAD_L + i * xStep;
        const y = PAD_T + chartH - (v / maxVal) * chartH;
        return { x, y, v };
      }).filter(p => p);
      if (pts.length === 0) return '';
      const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
      const dots = pts.map(p =>
        `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}"><title>${Math.round(p.v)}</title></circle>`).join('');
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
    }

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = PAD_T + chartH - f * chartH;
      const val = Math.round(maxVal * f);
      return `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
              <text x="${PAD_L - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="#94a3b8">${val}</text>`;
    }).join('');

    // Labels X : on montre au plus 8 dates
    const step = Math.max(1, Math.ceil(n / 8));
    const xLabels = entries.map((e, i) => {
      if (i % step !== 0 && i !== n - 1) return '';
      const x = PAD_L + i * xStep;
      return `<text x="${x}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#94a3b8">${h(formatShortDate(e.date))}</text>`;
    }).join('');

    return `
      <svg class="sh-cat-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${makeLine('gauche', '#3b82f6')}
        ${makeLine('droit',  '#009640')}
        ${makeLine('deux',   '#f59e0b')}
        ${xLabels}
        <g transform="translate(${PAD_L}, 12)">
          <circle cx="0" cy="0" r="3.5" fill="#3b82f6"/><text x="7" y="3" font-size="10" fill="#0f172a">Gauche</text>
          <circle cx="60" cy="0" r="3.5" fill="#009640"/><text x="67" y="3" font-size="10" fill="#0f172a">Droit</text>
          <circle cx="115" cy="0" r="3.5" fill="#f59e0b"/><text x="122" y="3" font-size="10" fill="#0f172a">2 pieds</text>
        </g>
      </svg>`;
  }

  /* ── Détail éditable + delta vs séance précédente ───── */

  function findPreviousSessionDate(cat, currentDate) {
    const store = loadSessions();
    const dates = Object.keys(store[cat] || {}).sort();
    const idx = dates.indexOf(currentDate);
    if (idx <= 0) return null;
    return dates[idx - 1];
  }

  function playerEntryOnDate(pid, cat, date) {
    return playerJuggleLog(pid, cat).find(e => e.date === date) || null;
  }

  function renderDetail(cat, date) {
    const store = loadSessions();
    const s = (store[cat] && store[cat][date]) || null;
    if (!s) {
      return `<p class="sh-empty">Séance introuvable.</p>
              <button class="btn" data-history-action="back-list">← Retour</button>`;
    }
    const nbPresents = (s.presentPids || []).length;
    const objectives = s.objectives || [];
    const nbAcquis = objectives.filter(o => o.acquis).length;
    const totalRs = objectives.reduce((a, o) => a + (o.reussites || 0), 0);
    const totalTs = objectives.reduce((a, o) => a + (o.tentatives || 0), 0);
    const ratio = totalTs > 0 ? Math.round((totalRs / totalTs) * 100) : null;

    let duration = null;
    if (s.startedAt && s.endedAt) {
      duration = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
    }

    const prevDate = findPreviousSessionDate(cat, date);
    const editPresent = !!state().historyEditPresent;

    return `
      <div class="sh-wrap sh-detail">
        <button class="btn btn-ghost sh-back" type="button" data-history-action="back-list">← Retour à la liste</button>

        <header class="sh-detail-head">
          <h2>${h(formatDate(date))}</h2>
          <div class="sh-detail-meta">
            ${duration != null ? `<span>⏱ ${duration} min</span>` : ''}
            <span>👥 ${nbPresents} présent${nbPresents > 1 ? 's' : ''}</span>
            <span>🎯 ${nbAcquis}/${objectives.length} objectif${objectives.length > 1 ? 's' : ''} acquis</span>
            ${ratio != null ? `<span>📊 Ratio ${ratio}%</span>` : ''}
            ${prevDate ? `<span class="sh-detail-prev">↩ vs ${h(formatShortDate(prevDate))}</span>` : ''}
          </div>
          <p class="sh-detail-help">✎ Tout est éditable — les modifications sont sauvegardées automatiquement.</p>
        </header>

        ${renderPresentsSection(cat, date, s, editPresent)}

        ${renderJuggleSection(cat, date, s, prevDate)}

        ${renderObjectivesSection(cat, date, s)}

        <div class="sh-detail-actions">
          <button class="btn sh-delete" type="button" data-history-action="delete-session" data-date="${h(date)}"
                  title="Supprimer cette séance">🗑 Supprimer cette séance</button>
        </div>
      </div>`;
  }

  function renderPresentsSection(cat, date, s, editing) {
    const pres = s.presentPids || [];
    const all = catPlayers(cat).sort((a, b) => playerLabel(a, cat).localeCompare(playerLabel(b, cat), 'fr'));
    return `
      <section class="sh-section">
        <div class="sh-section-title-row">
          <h3>Joueurs présents (${pres.length})</h3>
          <button class="btn btn-ghost sh-edit-btn" type="button" data-history-action="toggle-edit-present">
            ${editing ? '✓ Terminer' : '✎ Modifier présents'}
          </button>
        </div>
        ${editing ? `
          <div class="sh-edit-present-grid">
            ${all.map(pid => {
              const on = pres.includes(pid);
              return `
                <label class="sh-edit-present-row ${on ? 'on' : ''}">
                  <input type="checkbox" ${on ? 'checked' : ''}
                         data-history-action="toggle-present-past"
                         data-pid="${h(pid)}" data-date="${h(date)}">
                  <span>${h(playerLabel(pid, cat))}</span>
                </label>`;
            }).join('')}
          </div>` : (
          pres.length === 0
            ? '<p class="sh-muted">Aucun joueur marqué présent.</p>'
            : `<div class="sh-presents">
                ${pres.map(pid => `<span class="sh-present-chip">${h(playerLabel(pid, cat))}</span>`).join('')}
              </div>`)}
      </section>`;
  }

  function renderJuggleSection(cat, date, s, prevDate) {
    const pres = (s.presentPids || []).slice()
      .sort((a, b) => playerLabel(a, cat).localeCompare(playerLabel(b, cat), 'fr'));
    if (pres.length === 0) {
      return `
        <section class="sh-section">
          <h3>Jonglerie (0 joueur)</h3>
          <p class="sh-muted">Ajoute des présents pour enregistrer leurs jonglages.</p>
        </section>`;
    }
    return `
      <section class="sh-section">
        <h3>Jonglerie (${pres.length} joueur${pres.length > 1 ? 's' : ''})</h3>
        <div class="sh-juggle-list">
          ${pres.map(pid => renderJuggleRow(cat, date, pid, prevDate)).join('')}
        </div>
      </section>`;
  }

  function renderJuggleRow(cat, date, pid, prevDate) {
    const entry = playerEntryOnDate(pid, cat, date);
    const prevEntry = prevDate ? playerEntryOnDate(pid, cat, prevDate) : null;
    const g = entry ? jgVal(entry, 'gauche') : null;
    const d = entry ? jgVal(entry, 'droit')  : null;
    const b = entry ? jgVal(entry, 'deux')   : null;

    function deltaBadge(cur, foot) {
      if (!prevEntry) return '';
      if (cur == null) return '';
      const p = jgVal(prevEntry, foot);
      if (p == null) return '<span class="sh-delta sh-delta-new" title="Première mesure">nouv.</span>';
      const d = cur - p;
      if (d === 0) return '<span class="sh-delta sh-delta-eq">=</span>';
      if (d > 0)  return `<span class="sh-delta sh-delta-up">+${d}</span>`;
      return `<span class="sh-delta sh-delta-down">${d}</span>`;
    }

    return `
      <article class="sh-jg-row">
        <div class="sh-jg-name">${h(playerLabel(pid, cat))}</div>
        <div class="sh-jg-inputs">
          ${['gauche','droit','deux'].map(foot => {
            const val = foot === 'gauche' ? g : foot === 'droit' ? d : b;
            const label = foot === 'gauche' ? 'Gauche' : foot === 'droit' ? 'Droit' : '2 pieds';
            return `
              <label class="sh-jg-field">
                <span class="sh-jg-field-label">${label}</span>
                <input type="number" min="0" max="500" inputmode="numeric"
                       class="sh-jg-input" placeholder="—"
                       value="${val == null ? '' : val}"
                       data-history-action="edit-juggle"
                       data-pid="${h(pid)}" data-date="${h(date)}" data-foot="${foot}">
                ${deltaBadge(val, foot)}
              </label>`;
          }).join('')}
        </div>
      </article>`;
  }

  function renderObjectivesSection(cat, date, s) {
    const objectives = s.objectives || [];
    return `
      <section class="sh-section">
        <h3>Objectifs travaillés (${objectives.length})</h3>
        ${objectives.length === 0
          ? '<p class="sh-muted">Aucun objectif pour cette séance.</p>'
          : `<div class="sh-obj-list">
              ${objectives.map(o => renderObjectiveEdit(o, date)).join('')}
            </div>`}
      </section>`;
  }

  function renderObjectiveEdit(o, date) {
    const ratio = o.tentatives > 0 ? Math.round((o.reussites / o.tentatives) * 100) : null;
    const badge = o.principleNum ? `<span class="sh-obj-num">#${o.principleNum}</span>` : '';
    const perso = o.source === 'custom' ? '<span class="sh-obj-tag">perso</span>' : '';
    const ratioCol = ratio == null ? '#94a3b8' : ratio >= 75 ? '#16a34a' : ratio >= 50 ? '#d97706' : '#dc2626';
    return `
      <article class="sh-obj-card ${o.acquis ? 'is-acquis' : ''}">
        <div class="sh-obj-head">
          <div class="sh-obj-title">
            ${badge}${perso}
            <span>${h(o.label)}</span>
          </div>
          <label class="sh-obj-acquis-toggle">
            <input type="checkbox" ${o.acquis ? 'checked' : ''}
                   data-history-action="toggle-acquis-past"
                   data-key="${h(o.key)}" data-date="${h(date)}">
            <span>Acquis</span>
          </label>
        </div>
        ${o.objective ? `<div class="sh-obj-objective">🎯 ${h(o.objective)}</div>` : ''}
        <div class="sh-obj-editor">
          <div class="sh-obj-editor-group">
            <label class="sh-obj-editor-label">Réussites</label>
            <div class="sh-obj-editor-btns">
              <button class="btn btn-ghost sh-obj-bmn" type="button"
                      data-history-action="dec-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="reussites">−</button>
              <input type="number" min="0" class="sh-obj-editor-input"
                     value="${o.reussites || 0}"
                     data-history-action="set-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="reussites">
              <button class="btn btn-ghost sh-obj-bpl" type="button"
                      data-history-action="inc-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="reussites">+</button>
            </div>
          </div>
          <div class="sh-obj-editor-group">
            <label class="sh-obj-editor-label">Tentatives</label>
            <div class="sh-obj-editor-btns">
              <button class="btn btn-ghost sh-obj-bmn" type="button"
                      data-history-action="dec-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="tentatives">−</button>
              <input type="number" min="0" class="sh-obj-editor-input"
                     value="${o.tentatives || 0}"
                     data-history-action="set-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="tentatives">
              <button class="btn btn-ghost sh-obj-bpl" type="button"
                      data-history-action="inc-obj-past" data-key="${h(o.key)}" data-date="${h(date)}" data-field="tentatives">+</button>
            </div>
          </div>
          <div class="sh-obj-editor-ratio" style="color:${ratioCol}">
            <strong>${ratio != null ? ratio + '%' : '—'}</strong>
            <span>Ratio</span>
          </div>
        </div>
        ${o.notes ? `<div class="sh-obj-notes">"${h(o.notes)}"</div>` : ''}
      </article>`;
  }

  /* ── Widget évolution jonglerie sur fiche joueur ─────── */

  function renderPlayerJuggleWidget(pid, cat) {
    cat = cat || state().cat;
    const log = state().data?.[cat]?.[pid]?.juggleLog || [];
    if (!log.length) {
      return '<p class="collapsible-empty">Aucune mesure de jonglerie enregistrée.</p>';
    }
    const sorted = [...log].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const last12 = sorted.slice(-12);

    const values = { gauche: [], droit: [], deux: [] };
    sorted.forEach(e => {
      const g = jgVal(e, 'gauche'); if (g != null) values.gauche.push(g);
      const d = jgVal(e, 'droit');  if (d != null) values.droit.push(d);
      const b = jgVal(e, 'deux');   if (b != null) values.deux.push(b);
    });
    const avg = v => v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    const max = v => v.length ? Math.max(...v) : null;
    const best = { gauche: max(values.gauche), droit: max(values.droit), deux: max(values.deux) };
    const moy  = { gauche: avg(values.gauche), droit: avg(values.droit), deux: avg(values.deux) };

    const svg = renderMiniChart(last12);

    return `
      <div class="juggle-widget">
        <div class="juggle-widget-stats">
          <div class="jw-stat"><span>Meilleur G</span><strong>${best.gauche ?? '—'}</strong></div>
          <div class="jw-stat"><span>Meilleur D</span><strong>${best.droit ?? '—'}</strong></div>
          <div class="jw-stat"><span>Meilleur 2P</span><strong>${best.deux ?? '—'}</strong></div>
          <div class="jw-stat"><span>Moy. G</span><strong>${moy.gauche ?? '—'}</strong></div>
          <div class="jw-stat"><span>Moy. D</span><strong>${moy.droit ?? '—'}</strong></div>
          <div class="jw-stat"><span>Moy. 2P</span><strong>${moy.deux ?? '—'}</strong></div>
        </div>

        ${svg}

        <details class="juggle-widget-history">
          <summary>Historique complet (${sorted.length} mesures)</summary>
          <table class="juggle-widget-table">
            <thead>
              <tr><th>Date</th><th>Gauche</th><th>Droit</th><th>2 pieds</th></tr>
            </thead>
            <tbody>
              ${[...sorted].reverse().slice(0, 20).map(e => {
                return `<tr>
                  <td>${h(formatShortDate(e.date))}</td>
                  <td>${jgVal(e, 'gauche') ?? '—'}</td>
                  <td>${jgVal(e, 'droit')  ?? '—'}</td>
                  <td>${jgVal(e, 'deux')   ?? '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          ${sorted.length > 20 ? `<p class="jw-more">+ ${sorted.length - 20} mesures plus anciennes</p>` : ''}
        </details>
      </div>`;
  }

  function renderMiniChart(entries) {
    if (!entries.length) return '';
    const W = 500, H = 160, PAD = 30;
    const chartW = W - PAD * 2;
    const chartH = H - PAD * 2;

    let maxVal = 0;
    entries.forEach(e => {
      [jgVal(e, 'gauche'), jgVal(e, 'droit'), jgVal(e, 'deux')].forEach(v => {
        if (v != null && v > maxVal) maxVal = v;
      });
    });
    if (maxVal === 0) maxVal = 10;
    maxVal = Math.ceil(maxVal * 1.1);

    const n = entries.length;
    const xStep = n > 1 ? chartW / (n - 1) : chartW;

    function makeLine(foot, color) {
      const pts = entries.map((e, i) => {
        const v = jgVal(e, foot);
        if (v == null) return null;
        const x = PAD + i * xStep;
        const y = PAD + chartH - (v / maxVal) * chartH;
        return { x, y, v };
      }).filter(p => p);
      if (pts.length === 0) return '';
      const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
      const dots = pts.map(p =>
        `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}"/>`).join('');
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}`;
    }

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = PAD + chartH - f * chartH;
      const val = Math.round(maxVal * f);
      return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
              <text x="${PAD - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="#94a3b8">${val}</text>`;
    }).join('');

    const xLabels = entries.map((e, i) => {
      const x = PAD + i * xStep;
      return `<text x="${x}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#94a3b8">${h(formatShortDate(e.date))}</text>`;
    }).join('');

    return `
      <svg class="juggle-widget-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${makeLine('gauche', '#3b82f6')}
        ${makeLine('droit',  '#009640')}
        ${makeLine('deux',   '#f59e0b')}
        ${xLabels}
        <g class="jw-chart-legend" transform="translate(${PAD}, 12)">
          <circle cx="0" cy="0" r="3.5" fill="#3b82f6"/><text x="7" y="3" font-size="10" fill="#0f172a">Gauche</text>
          <circle cx="60" cy="0" r="3.5" fill="#009640"/><text x="67" y="3" font-size="10" fill="#0f172a">Droit</text>
          <circle cx="115" cy="0" r="3.5" fill="#f59e0b"/><text x="122" y="3" font-size="10" fill="#0f172a">2 pieds</text>
        </g>
      </svg>`;
  }

  /* ── Actions ─────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.historyAction;
    if (!action) return false;
    const cat = state().cat;

    if (action === 'open-detail') {
      state().historySessionDate = el.dataset.date;
      state().historyEditPresent = false;
      utils().renderAll?.();
      return true;
    }
    if (action === 'back-list') {
      state().historySessionDate = null;
      state().historyEditPresent = false;
      utils().renderAll?.();
      return true;
    }
    if (action === 'toggle-show-all') {
      state().historyShowAll = !state().historyShowAll;
      utils().renderAll?.();
      return true;
    }
    if (action === 'toggle-edit-present') {
      state().historyEditPresent = !state().historyEditPresent;
      utils().renderAll?.();
      return true;
    }
    if (action === 'delete-session') {
      if (!confirm('Supprimer définitivement cette séance ? Cette action est irréversible.')) return true;
      const date = el.dataset.date;
      const store = loadSessions();
      if (store[cat]) delete store[cat][date];
      saveSessions(store);
      state().historySessionDate = null;
      utils().showToast?.('Séance supprimée');
      utils().renderAll?.();
      return true;
    }

    // ── Édition présents
    if (action === 'toggle-present-past') {
      const date = el.dataset.date;
      const pid = el.dataset.pid;
      const store = loadSessions();
      const s = store[cat]?.[date];
      if (!s) return true;
      if (!Array.isArray(s.presentPids)) s.presentPids = [];
      const i = s.presentPids.indexOf(pid);
      if (i >= 0) s.presentPids.splice(i, 1);
      else s.presentPids.push(pid);
      saveSessions(store);
      // Refresh juste l'affichage local sans full renderAll (préserve scroll)
      utils().renderAll?.();
      return true;
    }

    // ── Édition jonglage passé
    if (action === 'edit-juggle') {
      const pid = el.dataset.pid;
      const date = el.dataset.date;
      const foot = el.dataset.foot;
      const raw = el.value.trim();
      const val = raw === '' ? null : Math.max(0, Math.min(500, parseInt(raw, 10) || 0));
      upsertJuggleEntry(pid, cat, date, foot, val);
      utils().showToast?.('Jonglage mis à jour');
      // Update le delta badge sans full render (on garde le focus)
      // Note : le badge ne se met pas à jour ici, mais il rafraîchira au prochain render.
      return true;
    }

    // ── Édition objectifs passés
    if (action === 'inc-obj-past' || action === 'dec-obj-past') {
      const date = el.dataset.date;
      const key = el.dataset.key;
      const field = el.dataset.field;
      const dir = action === 'inc-obj-past' ? 1 : -1;
      const store = loadSessions();
      const s = store[cat]?.[date];
      if (!s) return true;
      const obj = (s.objectives || []).find(o => o.key === key);
      if (!obj) return true;
      obj[field] = Math.max(0, (obj[field] || 0) + dir);
      saveSessions(store);
      utils().renderAll?.();
      return true;
    }
    if (action === 'set-obj-past') {
      const date = el.dataset.date;
      const key = el.dataset.key;
      const field = el.dataset.field;
      const val = Math.max(0, parseInt(el.value, 10) || 0);
      const store = loadSessions();
      const s = store[cat]?.[date];
      if (!s) return true;
      const obj = (s.objectives || []).find(o => o.key === key);
      if (!obj) return true;
      obj[field] = val;
      saveSessions(store);
      return true;
    }
    if (action === 'toggle-acquis-past') {
      const date = el.dataset.date;
      const key = el.dataset.key;
      const store = loadSessions();
      const s = store[cat]?.[date];
      if (!s) return true;
      const obj = (s.objectives || []).find(o => o.key === key);
      if (!obj) return true;
      obj.acquis = !obj.acquis;
      saveSessions(store);
      utils().renderAll?.();
      return true;
    }

    return false;
  }

  window.SessionsHistoryModule = {
    renderBody, handleAction, renderPlayerJuggleWidget,
  };
})();

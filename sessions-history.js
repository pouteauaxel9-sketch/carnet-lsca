/**
 * sessions-history.js — Historique des séances terrain
 *
 * Lit le store cfb6_live_sessions_v1 (rempli par live-training.js)
 * et propose 2 vues :
 *  - Liste chronologique de toutes les séances (avec stats)
 *  - Détail d'une séance (objectifs + compteurs + acquis)
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

  function playerLabel(pid, cat) {
    cat = cat || state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil
              || state().data?.[cat]?.[pid]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
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

  /* ── Vue liste + détail ────────────────────────────── */

  function renderBody(cat) {
    cat = cat || state().cat;
    const selectedDate = state().historySessionDate || null;
    if (selectedDate) {
      return renderDetail(cat, selectedDate);
    }
    return renderList(cat);
  }

  function renderList(cat) {
    const store = loadSessions();
    const sessions = store[cat] || {};
    const dates = Object.keys(sessions).sort().reverse(); // plus récent d'abord

    if (dates.length === 0) {
      return `
        <div class="sh-empty">
          <div class="sh-empty-icon">📝</div>
          <h3>Aucune séance enregistrée</h3>
          <p>Les séances apparaîtront ici après ta première utilisation du Mode Terrain.</p>
        </div>`;
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

    return `
      <div class="sh-wrap">
        <div class="sh-stats">
          <div class="sh-stat"><strong>${dates.length}</strong><span>Séances</span></div>
          <div class="sh-stat"><strong>${avgPresent}</strong><span>Présents (moy.)</span></div>
          <div class="sh-stat"><strong>${totalAcquis}/${totalObj}</strong><span>Objectifs acquis</span></div>
          <div class="sh-stat"><strong>${ratio != null ? ratio + '%' : '—'}</strong><span>Ratio réussite</span></div>
        </div>

        <div class="sh-list">
          ${dates.map(d => renderListRow(cat, d, sessions[d])).join('')}
        </div>
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
          <div class="sh-row-stat">
            <strong>${nbPresents}</strong>
            <span>👥 Présents</span>
          </div>
          <div class="sh-row-stat">
            <strong>${nbAcquis}/${objectives.length}</strong>
            <span>🎯 Acquis</span>
          </div>
          <div class="sh-row-stat">
            <strong>${totalRs}/${totalTs}</strong>
            <span>Réussite</span>
          </div>
          <div class="sh-row-stat">
            <strong style="color:${ratioCol}">${ratio != null ? ratio + '%' : '—'}</strong>
            <span>Ratio</span>
          </div>
        </div>
        <div class="sh-row-arrow">→</div>
      </article>`;
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

    // Durée
    let duration = null;
    if (s.startedAt && s.endedAt) {
      duration = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
    }

    return `
      <div class="sh-wrap">
        <button class="btn btn-ghost sh-back" type="button" data-history-action="back-list">← Retour à la liste</button>

        <header class="sh-detail-head">
          <h2>${h(formatDate(date))}</h2>
          <div class="sh-detail-meta">
            ${duration != null ? `<span>⏱ ${duration} min</span>` : ''}
            <span>👥 ${nbPresents} présent${nbPresents > 1 ? 's' : ''}</span>
            <span>🎯 ${nbAcquis}/${objectives.length} objectif${objectives.length > 1 ? 's' : ''} acquis</span>
            ${ratio != null ? `<span>📊 Ratio ${ratio}%</span>` : ''}
          </div>
        </header>

        <section class="sh-section">
          <h3>Joueurs présents (${nbPresents})</h3>
          ${nbPresents === 0
            ? '<p class="sh-muted">Aucun joueur marqué présent.</p>'
            : `<div class="sh-presents">
                ${(s.presentPids || []).map(pid => `<span class="sh-present-chip">${h(playerLabel(pid, cat))}</span>`).join('')}
              </div>`}
        </section>

        <section class="sh-section">
          <h3>Objectifs travaillés (${objectives.length})</h3>
          ${objectives.length === 0
            ? '<p class="sh-muted">Aucun objectif pour cette séance.</p>'
            : `<div class="sh-obj-list">
                ${objectives.map(renderObjectiveDetail).join('')}
              </div>`}
        </section>

        <button class="btn sh-delete" type="button" data-history-action="delete-session" data-date="${h(date)}"
                title="Supprimer cette séance">🗑 Supprimer cette séance</button>
      </div>`;
  }

  function renderObjectiveDetail(o) {
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
            ${o.acquis ? '<span class="sh-obj-badge-acquis">✓ Acquis</span>' : ''}
          </div>
        </div>
        ${o.objective ? `<div class="sh-obj-objective">🎯 ${h(o.objective)}</div>` : ''}
        <div class="sh-obj-numbers">
          <div class="sh-obj-num-box"><strong>${o.reussites || 0}</strong><span>Réussies</span></div>
          <div class="sh-obj-num-box"><strong>${o.tentatives || 0}</strong><span>Tentatives</span></div>
          <div class="sh-obj-num-box" style="color:${ratioCol}"><strong>${ratio != null ? ratio + '%' : '—'}</strong><span>Ratio</span></div>
        </div>
        ${o.notes ? `<div class="sh-obj-notes">"${h(o.notes)}"</div>` : ''}
      </article>`;
  }

  /* ── Widget évolution jonglerie sur fiche joueur ────── */

  function renderPlayerJuggleWidget(pid, cat) {
    cat = cat || state().cat;
    const log = state().data?.[cat]?.[pid]?.juggleLog || [];
    if (!log.length) {
      return '<p class="collapsible-empty">Aucune mesure de jonglerie enregistrée.</p>';
    }
    const sorted = [...log].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const last12 = sorted.slice(-12);

    // Résumé : moyennes globales
    const values = { gauche: [], droit: [], deux: [] };
    sorted.forEach(e => {
      if (e.gauche != null) values.gauche.push(e.gauche);
      if (e.droit  != null) values.droit.push(e.droit);
      if (e.deux   != null) values.deux.push(e.deux);
      // Migration fallback : anciens fort/faible
      if (e.fort   != null && e.droit  == null) values.droit.push(e.fort);
      if (e.faible != null && e.gauche == null) values.gauche.push(e.faible);
    });
    const avg = v => v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    const max = v => v.length ? Math.max(...v) : null;
    const best = { gauche: max(values.gauche), droit: max(values.droit), deux: max(values.deux) };
    const moy  = { gauche: avg(values.gauche), droit: avg(values.droit), deux: avg(values.deux) };

    // Mini graphique SVG des 12 dernières mesures
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
                const g = e.gauche ?? e.faible;
                const d = e.droit ?? e.fort;
                const b = e.deux;
                return `<tr>
                  <td>${h(formatShortDate(e.date))}</td>
                  <td>${g ?? '—'}</td>
                  <td>${d ?? '—'}</td>
                  <td>${b ?? '—'}</td>
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

    // Calcul du max global
    let maxVal = 0;
    entries.forEach(e => {
      const g = e.gauche ?? e.faible;
      const d = e.droit ?? e.fort;
      const b = e.deux;
      [g, d, b].forEach(v => { if (v != null && v > maxVal) maxVal = v; });
    });
    if (maxVal === 0) maxVal = 10;
    maxVal = Math.ceil(maxVal * 1.1);

    const n = entries.length;
    const xStep = n > 1 ? chartW / (n - 1) : chartW;

    function makeLine(values, color) {
      const pts = entries.map((e, i) => {
        let v = e[values.key];
        if (v == null && values.fallback) v = e[values.fallback];
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

    // Axe Y
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const y = PAD + chartH - f * chartH;
      const val = Math.round(maxVal * f);
      return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
              <text x="${PAD - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="#94a3b8">${val}</text>`;
    }).join('');

    // Labels X (dates)
    const xLabels = entries.map((e, i) => {
      const x = PAD + i * xStep;
      return `<text x="${x}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#94a3b8">${h(formatShortDate(e.date))}</text>`;
    }).join('');

    return `
      <svg class="juggle-widget-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${makeLine({ key: 'gauche', fallback: 'faible' }, '#3b82f6')}
        ${makeLine({ key: 'droit',  fallback: 'fort'   }, '#009640')}
        ${makeLine({ key: 'deux' },                       '#f59e0b')}
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

    if (action === 'open-detail') {
      state().historySessionDate = el.dataset.date;
      utils().renderAll?.();
      return true;
    }
    if (action === 'back-list') {
      state().historySessionDate = null;
      utils().renderAll?.();
      return true;
    }
    if (action === 'delete-session') {
      if (!confirm('Supprimer définitivement cette séance ? Cette action est irréversible.')) return true;
      const cat = state().cat;
      const date = el.dataset.date;
      const store = loadSessions();
      if (store[cat]) delete store[cat][date];
      try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(store)); } catch {}
      state().historySessionDate = null;
      utils().showToast?.('Séance supprimée');
      utils().renderAll?.();
      return true;
    }
    return false;
  }

  window.SessionsHistoryModule = {
    renderBody, handleAction, renderPlayerJuggleWidget,
  };
})();

/**
 * season-plan.js — Plan de saison par principes de jeu
 *
 * Vue récapitulative qui montre, pour chaque principe FFF (1 à 9) :
 *   - Combien de semaines il a été travaillé sur la saison
 *   - La moyenne d'éval globale de l'équipe sur ce principe
 *   - Une alerte si le principe est prioritaire pour la catégorie
 *     mais sous-travaillé (moins de 3 semaines sur la saison)
 *   - Une frise par semaine (vue calendrier)
 *
 * Données : lit le store de WeeklyFocusModule.
 *
 * Expose : window.SeasonPlanModule.{ renderBody, handleAction }
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cfb6_weekly_focus_v1';
  const MIN_WEEKS_PRIORITY = 3; // seuil sous-travaillé pour un prioritaire

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? ''); }
  function toast(m) { utils().showToast?.(m); }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function getPrinciples() {
    return window.WeeklyFocusModule?.GAME_PRINCIPLES || [];
  }

  /* ── Agrégation ─────────────────────────────────────── */

  function aggregate(cat, seasonStart, seasonEnd) {
    const store = loadStore();
    const weeks = store[cat] || {};
    const isoKeys = Object.keys(weeks)
      .filter(iso => (!seasonStart || iso >= seasonStart) && (!seasonEnd || iso <= seasonEnd))
      .sort();

    const principles = getPrinciples();
    // Initialiser stats par principe
    const stats = principles.map(p => ({
      num: p.num, label: p.label, phase: p.phase, subPhase: p.subPhase,
      priority: p.priority?.[cat] || 'a-definir',
      weeksWorked: [],   // [{iso, label, theme, items, totalRatings, avgPct}]
      totalRatings: 0,
      sumPct: 0,
    }));

    isoKeys.forEach(iso => {
      const w = weeks[iso];
      (w.items || []).forEach(it => {
        if (!it.principleNum) return;
        const s = stats.find(x => x.num === it.principleNum);
        if (!s) return;
        // Collecter toutes les notes pour ce principe / cette semaine
        let count = 0, sum = 0;
        Object.values(w.ratings || {}).forEach(playerRatings => {
          const v = playerRatings[it.id];
          if (v != null) {
            count++;
            sum += (v / (it.scale || 5)) * 100;
          }
        });
        s.weeksWorked.push({
          iso, label: w.label, theme: w.theme,
          ratingsCount: count,
          avgPct: count ? sum / count : null,
        });
        s.totalRatings += count;
        s.sumPct += sum;
      });
    });

    stats.forEach(s => {
      s.weekCount = s.weeksWorked.length;
      s.avgPct = s.totalRatings ? Math.round(s.sumPct / s.totalRatings) : null;
      s.underWorked = s.priority === 'prioritaire' && s.weekCount < MIN_WEEKS_PRIORITY;
      s.untouched = s.weekCount === 0;
    });

    return { stats, weeksTotal: isoKeys.length, isoKeys };
  }

  /* ── Rendu ──────────────────────────────────────────── */

  function renderBody(cat) {
    cat = cat || state().cat;
    const season = state().season || '';
    // Bornes saison ~ sept à juin (approximation)
    const seasonYears = (season.match(/(\d{4})/g) || []).map(Number);
    let seasonStart = null, seasonEnd = null;
    if (seasonYears.length >= 2) {
      seasonStart = `${seasonYears[0]}-08-01`;
      seasonEnd   = `${seasonYears[1]}-07-31`;
    }

    const agg = aggregate(cat, seasonStart, seasonEnd);
    const priorityFilter = (state().planFilter || 'all');
    const filtered = agg.stats.filter(s => {
      if (priorityFilter === 'priority') return s.priority === 'prioritaire';
      if (priorityFilter === 'gap') return s.underWorked || (s.priority === 'prioritaire' && s.untouched);
      return true;
    });

    const catLbl = (window.CAT_LABELS?.[cat] || cat).toUpperCase();
    const PRI = window.WeeklyFocusModule?.PRIORITY_LABELS || {
      'prioritaire': { icon:'🟢', label:'Prioritaire', color:'#16a34a' },
      'secondaire': { icon:'🟡', label:'Secondaire', color:'#eab308' },
      'non-prioritaire': { icon:'🟠', label:'Non-prioritaire', color:'#f97316' },
      'a-definir': { icon:'🔵', label:'À définir', color:'#1e40af' },
    };

    const summary = computeSummary(agg.stats);

    return `
      <div class="plan-wrap">
        <header class="plan-head">
          <div>
            <h2 class="plan-title">Plan de saison — ${h(catLbl)} <span class="plan-season">Saison ${h(season)}</span></h2>
            <p class="plan-subtitle">Suivi des 9 principes de jeu sur ${agg.weeksTotal} semaine${agg.weeksTotal > 1 ? 's' : ''} enregistrée${agg.weeksTotal > 1 ? 's' : ''}.</p>
          </div>
          <div class="plan-actions">
            <button class="btn btn-ghost" data-plan-action="export-excel">Excel</button>
          </div>
        </header>

        <section class="plan-summary">
          <div class="plan-stat plan-stat-good">
            <div class="plan-stat-val">${summary.covered}/9</div>
            <div class="plan-stat-lbl">Principes couverts</div>
          </div>
          <div class="plan-stat plan-stat-warn">
            <div class="plan-stat-val">${summary.gaps}</div>
            <div class="plan-stat-lbl">Prioritaires sous-travaillés</div>
          </div>
          <div class="plan-stat plan-stat-info">
            <div class="plan-stat-val">${summary.avgPct != null ? summary.avgPct + '%' : '—'}</div>
            <div class="plan-stat-lbl">Niveau moyen équipe</div>
          </div>
          <div class="plan-stat plan-stat-info">
            <div class="plan-stat-val">${summary.totalRatings}</div>
            <div class="plan-stat-lbl">Notes enregistrées</div>
          </div>
        </section>

        <nav class="plan-filters" aria-label="Filtres">
          <button class="plan-filter ${priorityFilter === 'all' ? 'on' : ''}" data-plan-action="filter" data-filter="all">Tous (9)</button>
          <button class="plan-filter ${priorityFilter === 'priority' ? 'on' : ''}" data-plan-action="filter" data-filter="priority">Prioritaires</button>
          <button class="plan-filter ${priorityFilter === 'gap' ? 'on' : ''}" data-plan-action="filter" data-filter="gap">⚠ Gaps</button>
        </nav>

        <div class="plan-list">
          ${filtered.length === 0
            ? '<p class="plan-empty">Aucun principe à afficher avec ce filtre.</p>'
            : filtered.map(s => renderPrincipleRow(s, agg.isoKeys, PRI, cat)).join('')
          }
        </div>

        ${summary.recommendations.length > 0 ? `
          <section class="plan-reco">
            <h3>💡 Recommandations pour les prochaines semaines</h3>
            <ul>
              ${summary.recommendations.map(r => `<li>${h(r)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </div>
    `;
  }

  function renderPrincipleRow(s, allWeeks, PRI, cat) {
    const prio = PRI[s.priority] || PRI['a-definir'];
    const phaseLbl = s.phase === 'avec' ? '🔵 Avec ballon' : s.phase === 'sans' ? '🔴 Sans ballon' : '';
    const subLbl = ({
      'construire': 'Construire/Progresser',
      'desequilibrer': 'Déséquilibrer/Finir',
      'opposer': 'S\'opposer',
      'recuperer': 'Récupérer',
    })[s.subPhase] || s.subPhase;

    const status = s.untouched ? 'untouched' : s.underWorked ? 'underworked' : 'ok';
    const statusBadge = ({
      untouched: '<span class="plan-status plan-status-untouched">⛔ Non touché</span>',
      underworked: '<span class="plan-status plan-status-warn">⚠ Sous-travaillé</span>',
      ok: '<span class="plan-status plan-status-ok">✅ Couvert</span>',
    })[status];

    // Timeline : pour chaque semaine, est-ce que ce principe a été travaillé ?
    const workedSet = new Set(s.weeksWorked.map(w => w.iso));
    const timeline = allWeeks.map(iso => {
      const w = s.weeksWorked.find(x => x.iso === iso);
      if (!w) return `<span class="plan-cell plan-cell-empty" title="${h(iso)}"></span>`;
      const c = w.avgPct == null ? 'mid' : w.avgPct >= 70 ? 'good' : w.avgPct >= 45 ? 'mid' : 'low';
      return `<span class="plan-cell plan-cell-${c}" title="${h(iso)} · ${w.avgPct != null ? Math.round(w.avgPct) + '%' : 'non noté'} (${w.ratingsCount} note${w.ratingsCount > 1 ? 's' : ''})"></span>`;
    }).join('');

    return `
      <article class="plan-row plan-row-${status}">
        <div class="plan-row-head">
          <div class="plan-row-num">#${s.num}</div>
          <div class="plan-row-info">
            <div class="plan-row-title">
              <span class="plan-row-label">${h(s.label)}</span>
              <span class="plan-row-phase">${phaseLbl} · ${h(subLbl)}</span>
            </div>
            <div class="plan-row-meta">
              <span class="plan-row-prio" style="color:${prio.color}">${prio.icon} ${h(prio.label)} ${cat.toUpperCase()}</span>
              ${statusBadge}
              <span class="plan-row-weeks">${s.weekCount} semaine${s.weekCount > 1 ? 's' : ''}</span>
              <span class="plan-row-avg">${s.avgPct != null ? s.avgPct + '%' : '—'}</span>
            </div>
          </div>
        </div>
        <div class="plan-timeline" aria-label="Timeline saison">
          ${timeline}
        </div>
      </article>
    `;
  }

  /* ── Synthèse + recommandations ─────────────────────── */

  function computeSummary(stats) {
    const covered = stats.filter(s => s.weekCount > 0).length;
    const gaps = stats.filter(s => s.underWorked || (s.priority === 'prioritaire' && s.untouched)).length;
    const allRatings = stats.reduce((a, s) => a + s.totalRatings, 0);
    const allSumPct = stats.reduce((a, s) => a + s.sumPct, 0);
    const avgPct = allRatings ? Math.round(allSumPct / allRatings) : null;

    // Recommandations
    const recos = [];
    // 1. Principes prioritaires non touchés
    const untouchedPrio = stats.filter(s => s.priority === 'prioritaire' && s.untouched);
    if (untouchedPrio.length) {
      recos.push(`Aucune semaine sur ${untouchedPrio.length} principe${untouchedPrio.length > 1 ? 's' : ''} prioritaire${untouchedPrio.length > 1 ? 's' : ''} : ${untouchedPrio.map(p => '#' + p.num).join(', ')} — à programmer rapidement.`);
    }
    // 2. Prioritaires faibles en moyenne
    const weakPrio = stats.filter(s => s.priority === 'prioritaire' && s.avgPct != null && s.avgPct < 50 && s.weekCount > 0);
    if (weakPrio.length) {
      recos.push(`Niveau faible (<50%) sur ${weakPrio.map(p => '#' + p.num + ' ' + p.label).join(', ')} — penser à revenir dessus avec une approche différente.`);
    }
    // 3. Principe le plus régulier
    const mostWorked = stats.filter(s => s.weekCount > 0).sort((a, b) => b.weekCount - a.weekCount)[0];
    if (mostWorked && mostWorked.weekCount >= 4) {
      recos.push(`Principe le plus travaillé : #${mostWorked.num} ${mostWorked.label} (${mostWorked.weekCount} semaines, ${mostWorked.avgPct}%).`);
    }

    return { covered, gaps, totalRatings: allRatings, avgPct, recommendations: recos };
  }

  /* ── Actions ────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.planAction;
    if (!action) return false;

    if (action === 'filter') {
      state().planFilter = el.dataset.filter || 'all';
      utils().renderAll?.();
      return true;
    }
    if (action === 'export-excel') {
      exportExcel();
      return true;
    }
    return false;
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') { toast('Excel non disponible'); return; }
    const cat = state().cat;
    const season = state().season || '';
    const seasonYears = (season.match(/(\d{4})/g) || []).map(Number);
    let seasonStart = null, seasonEnd = null;
    if (seasonYears.length >= 2) {
      seasonStart = `${seasonYears[0]}-08-01`;
      seasonEnd   = `${seasonYears[1]}-07-31`;
    }
    const agg = aggregate(cat, seasonStart, seasonEnd);
    const headers = ['#', 'Principe', 'Phase', 'Priorité ' + cat.toUpperCase(),
                     'Semaines', 'Moy. équipe', 'Statut'];
    const rows = agg.stats.map(s => [
      s.num, s.label,
      s.phase === 'avec' ? 'Avec ballon' : 'Sans ballon',
      s.priority,
      s.weekCount,
      s.avgPct != null ? s.avgPct + '%' : '',
      s.untouched ? 'Non touché' : s.underWorked ? 'Sous-travaillé' : 'Couvert',
    ]);
    const aoa = [
      [`Plan de saison — ${cat.toUpperCase()} — Saison ${season}`],
      [],
      headers,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan');
    XLSX.writeFile(wb, `plan-saison-${cat}-${season}.xlsx`);
    toast('Export Excel terminé');
  }

  window.SeasonPlanModule = { renderBody, handleAction, aggregate };
})();

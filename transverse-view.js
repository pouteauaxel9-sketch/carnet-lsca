/**
 * transverse-view.js — Analyses transverses sur une catégorie.
 *
 * - Top progressions / Top reculs (score global vs saison N-1)
 * - Moyennes catégorie par pilier (référence pour comparer)
 * - Top performances match (note, buts, passes)
 * - Distribution score global (histogramme buckets)
 *
 * Expose : window.TransverseModule.{ renderBody(cat), catPillarAverages(cat, season),
 *           playerPercentile(cat, pid, pillarKey, season) }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const state = () => window.appState;
  const PILLARS = () => window.PILLARS || {};
  const CAT_LABELS = () => window.CAT_LABELS || {};
  const SEASONS = () => window.SEASONS || [];

  const WEIGHTS = { technique: 0.35, tactique: 0.25, physique: 0.20, mental: 0.15, perso: 0.05 };

  function pAvg(cat, pid, key, season) {
    const pillars = PILLARS()[cat] || [];
    const data = state()?.data?.[cat]?.[pid]?.[season];
    if (!data) return 0;
    const pillar = pillars.find(p => p.key === key);
    if (!pillar) return 0;
    let total = 0, count = 0;
    pillar.criteria.forEach((_, i) => {
      const v = data.ratings?.[key]?.[i] || 0;
      if (v > 0) { total += v; count++; }
    });
    return count ? total / count : 0;
  }
  function pScore(cat, pid, season) {
    const pillars = PILLARS()[cat] || [];
    let total = 0, wsum = 0;
    pillars.forEach(p => {
      const avg = pAvg(cat, pid, p.key, season);
      if (avg > 0) {
        total += (avg / 4) * 100 * (WEIGHTS[p.key] || 0.1);
        wsum += WEIGHTS[p.key] || 0.1;
      }
    });
    return wsum ? Math.round(total / wsum) : 0;
  }

  /* ── Moyennes catégorie ───────────────────────────────── */

  function catPillarAverages(cat, season = state()?.season) {
    const players = window.JDATA?.[cat]?.players || [];
    const pillars = PILLARS()[cat] || [];
    const out = {};
    pillars.forEach(p => {
      const vals = players.map(pl => pAvg(cat, pl.name, p.key, season)).filter(v => v > 0);
      out[p.key] = vals.length
        ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)
        : null;
    });
    return out;
  }

  function categoryScores(cat, season = state()?.season) {
    const players = window.JDATA?.[cat]?.players || [];
    return players.map(p => ({ pid: p.name, score: pScore(cat, p.name, season) })).filter(r => r.score > 0);
  }

  /* ── Top progressions / reculs ────────────────────────── */

  function progressionList(cat, season = state()?.season) {
    const seasons = SEASONS();
    const idx = seasons.indexOf(season);
    const prevSeason = idx >= 0 ? seasons[idx + 1] : null;
    if (!prevSeason) return [];
    const players = window.JDATA?.[cat]?.players || [];
    const arr = [];
    players.forEach(p => {
      const now = pScore(cat, p.name, season);
      const prev = pScore(cat, p.name, prevSeason);
      if (!now || !prev) return;
      arr.push({ pid: p.name, now, prev, delta: now - prev });
    });
    return arr;
  }

  /* ── Top performances match (sur la saison) ───────────── */

  function topMatchPerformers(cat, season = state()?.season, k = 5) {
    const players = window.JDATA?.[cat]?.players || [];
    const seasonStats = window.ObsModule?.seasonStats;
    if (!seasonStats) return { topButeurs: [], topPasseurs: [], topNotes: [] };

    const arr = players.map(p => {
      const obs = state()?.data?.[cat]?.[p.name]?.observations?.[season] || [];
      const s = seasonStats(obs);
      return { pid: p.name, stats: s };
    }).filter(r => r.stats && r.stats.matches > 0);

    const topButeurs  = arr.filter(r => r.stats.buts > 0).sort((a, b) => b.stats.buts - a.stats.buts).slice(0, k);
    const topPasseurs = arr.filter(r => r.stats.passes_d > 0).sort((a, b) => b.stats.passes_d - a.stats.passes_d).slice(0, k);
    const topNotes    = arr.filter(r => r.stats.noteAvg != null).sort((a, b) => b.stats.noteAvg - a.stats.noteAvg).slice(0, k);
    return { topButeurs, topPasseurs, topNotes };
  }

  /* ── Percentile joueur vs catégorie ───────────────────── */

  function playerPercentile(cat, pid, pillarKey, season = state()?.season) {
    const players = window.JDATA?.[cat]?.players || [];
    const target = pAvg(cat, pid, pillarKey, season);
    if (!target) return null;
    const vals = players.map(p => pAvg(cat, p.name, pillarKey, season)).filter(v => v > 0);
    if (vals.length < 3) return null;
    const below = vals.filter(v => v < target).length;
    return Math.round((below / vals.length) * 100);
  }

  /* ── Distribution score (histogramme buckets) ─────────── */

  function distribution(cat, season = state()?.season) {
    const buckets = [
      { label: '0', range: [0, 0],   count: 0 },
      { label: '1-39', range: [1, 39], count: 0 },
      { label: '40-59', range: [40, 59], count: 0 },
      { label: '60-79', range: [60, 79], count: 0 },
      { label: '80-100', range: [80, 100], count: 0 },
    ];
    const players = window.JDATA?.[cat]?.players || [];
    players.forEach(p => {
      const s = pScore(cat, p.name, season);
      const b = buckets.find(x => s >= x.range[0] && s <= x.range[1]);
      if (b) b.count++;
    });
    return buckets;
  }

  /* ── Rendu ────────────────────────────────────────────── */

  function renderBody(cat) {
    const catLabel = CAT_LABELS()[cat] || cat.toUpperCase();
    const season = state()?.season;

    const scores = categoryScores(cat, season);
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length)
      : 0;
    const playersCount = (window.JDATA?.[cat]?.players || []).length;
    const evaluatedCount = scores.length;

    const prog = progressionList(cat, season);
    const topUp   = prog.filter(p => p.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const topDown = prog.filter(p => p.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

    const perf = topMatchPerformers(cat, season, 5);

    const pillars = PILLARS()[cat] || [];
    const avgs = catPillarAverages(cat, season);
    const dist = distribution(cat, season);

    return `
      <section class="transverse-shell">
        <div class="category-toolbar">
          <div class="view-switcher">
            ${Object.keys(CAT_LABELS()).map(c => `
              <button class="view-chip ${cat === c ? 'on' : ''}" type="button" data-action="switch-category" data-cat="${c}">
                ${h(CAT_LABELS()[c])}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="transverse-hero">
          <div>
            <div class="card-kicker">Analyses • ${h(catLabel)}</div>
            <h1>Tableau de bord transverse</h1>
            <p>Vue d'ensemble de la catégorie sur la saison ${h(season)} : progressions saillantes, performances match, distribution des niveaux.</p>
          </div>
          <div class="dashboard-stats">
            <div class="dash-stat"><span>Joueurs</span><strong>${playersCount}</strong></div>
            <div class="dash-stat"><span>Évalués</span><strong>${evaluatedCount}</strong></div>
            <div class="dash-stat"><span>Score moyen</span><strong>${avgScore}%</strong></div>
            <div class="dash-stat"><span>Saison</span><strong>${h(season)}</strong></div>
          </div>
        </div>

        <div class="transverse-grid">
          ${renderProgressionCard('Top progressions', topUp, 'up')}
          ${renderProgressionCard('Reculs notables', topDown, 'down')}
          ${renderDistributionCard(dist, playersCount)}

          ${renderTopPerfCard('Top buteurs (saison)', perf.topButeurs, 'buts')}
          ${renderTopPerfCard('Top passeurs (saison)', perf.topPasseurs, 'passes_d')}
          ${renderTopPerfCard('Top notes (saison)', perf.topNotes, 'noteAvg')}

          ${renderPillarAveragesCard(avgs, pillars)}
        </div>
      </section>`;
  }

  function renderProgressionCard(title, rows, kind) {
    if (!rows.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">${kind === 'up' ? 'Progression' : 'Vigilance'}</div><h2>${h(title)}</h2></div></div>
        <div class="dash-empty">
          <div class="dash-empty-msg">Pas assez de données</div>
          <div class="dash-empty-hint">Il faut au moins deux saisons évaluées pour comparer.</div>
        </div>
      </section>`;
    }
    const arrow = kind === 'up' ? '↗' : '↘';
    const cls   = kind === 'up' ? 'delta-up' : 'delta-down';
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">${kind === 'up' ? 'Progression' : 'Vigilance'}</div><h2>${h(title)}</h2></div></div>
      <table class="leader-table">
        <thead><tr><th></th><th>Joueur</th><th>N-1</th><th>Saison</th><th>Δ</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr>
            <td class="rank-cell">${i + 1}</td>
            <td><button class="player-link" type="button" data-action="select-player" data-player="${h(r.pid)}">${h(r.pid)}</button></td>
            <td>${r.prev}%</td>
            <td><strong>${r.now}%</strong></td>
            <td class="${cls}"><strong>${arrow} ${Math.abs(r.delta)}%</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  }

  function renderTopPerfCard(title, rows, key) {
    if (!rows.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Saison</div><h2>${h(title)}</h2></div></div>
        <div class="dash-empty"><div class="dash-empty-msg">Aucune donnée</div></div>
      </section>`;
    }
    const valFor = r => {
      if (key === 'buts')     return r.stats.buts;
      if (key === 'passes_d') return r.stats.passes_d;
      if (key === 'noteAvg')  return r.stats.noteAvg?.toFixed(1) ?? '—';
      return '';
    };
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Saison</div><h2>${h(title)}</h2></div></div>
      <table class="leader-table">
        <thead><tr><th></th><th>Joueur</th><th>${key === 'buts' ? 'Buts' : key === 'passes_d' ? 'Passes' : 'Note ⌀'}</th><th>M.</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr>
            <td class="rank-cell">${i + 1}</td>
            <td><button class="player-link" type="button" data-action="select-player" data-player="${h(r.pid)}">${h(r.pid)}</button></td>
            <td><strong>${valFor(r)}</strong></td>
            <td>${r.stats.matches}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  }

  function renderPillarAveragesCard(avgs, pillars) {
    const rows = pillars.map(p => {
      const avg = avgs[p.key];
      const pct = avg ? Math.round((avg / 4) * 100) : 0;
      const color = pct >= 60 ? '#639922' : pct >= 40 ? '#ba7517' : pct > 0 ? '#d85a30' : '#8d897f';
      return `<div class="pillar-avg-row">
        <span class="pillar-avg-name">${h(p.label)}</span>
        <div class="pillar-avg-bar-bg">
          <div class="pillar-avg-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="pillar-avg-val" style="color:${color}"><strong>${avg != null ? avg.toFixed(2) : '—'}</strong> / 4</span>
      </div>`;
    }).join('');
    return `<section class="dashboard-card span-2">
      <div class="card-head"><div><div class="card-kicker">Référentiel</div><h2>Moyennes catégorie par pilier</h2></div></div>
      <div class="pillar-avg-list">${rows}</div>
      <p class="info-text">Ces moyennes servent de référence pour comparer un joueur à sa catégorie (voir sa fiche).</p>
    </section>`;
  }

  function renderDistributionCard(buckets, total) {
    const evaluated = buckets.reduce((a, b) => a + b.count, 0);
    const max = Math.max(...buckets.map(b => b.count), 1);
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Distribution</div><h2>Score global (${evaluated}/${total})</h2></div></div>
      <div class="histo-list">
        ${buckets.map(b => {
          const pct = Math.round((b.count / max) * 100);
          const color = b.label === '80-100' ? '#185fa5'
                      : b.label === '60-79' ? '#639922'
                      : b.label === '40-59' ? '#ba7517'
                      : b.label === '1-39' ? '#d85a30'
                      : '#8d897f';
          return `<div class="histo-row">
            <span class="histo-label">${b.label}</span>
            <div class="histo-bar-bg"><div class="histo-bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="histo-count">${b.count}</span>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }

  /* ── Exports ──────────────────────────────────────────── */

  window.TransverseModule = {
    renderBody,
    catPillarAverages,
    categoryScores,
    progressionList,
    topMatchPerformers,
    playerPercentile,
    distribution,
  };
})();

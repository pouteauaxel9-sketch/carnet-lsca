/**
 * career.js — Vue carrière joueur multi-saisons
 *
 * Agrège toutes les saisons d'un joueur en une vue carrière :
 *   - Timeline visuelle (jonglerie, score global, obs match par saison)
 *   - Cumul matchs, séances, observations
 *   - Évolution des piliers (graphe radar saison par saison)
 *   - Performance match cumulée (buts/passes/minutes lifetime)
 *
 * Pas de stockage propre : agrégation à la volée à partir des saisons existantes.
 *
 * Expose : window.CareerModule.{ open(pid), close(), renderBody(pid),
 *           handleAction, isOpen }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const state = () => window.appState;
  const SEASONS = () => window.SEASONS || [];

  /* ── helpers calcul ─────────────────────────────────────── */

  function pAvg(cat, pid, key, season) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const data = state()?.data?.[cat]?.[pid]?.[season];
    if (!data) return 0;
    const pillar = PILLARS.find(p => p.key === key);
    if (!pillar) return 0;
    let total = 0, count = 0;
    pillar.criteria.forEach((_, i) => {
      const v = data.ratings?.[key]?.[i] || 0;
      if (v > 0) { total += v; count++; }
    });
    return count ? total / count : 0;
  }
  function pScore(cat, pid, season) {
    const W = { technique: 0.35, tactique: 0.25, physique: 0.20, mental: 0.15, perso: 0.05 };
    const PILLARS = window.PILLARS?.[cat] || [];
    let total = 0, wsum = 0;
    PILLARS.forEach(p => {
      const a = pAvg(cat, pid, p.key, season);
      if (a > 0) { total += (a/4)*100*(W[p.key]||0.1); wsum += W[p.key] || 0.1; }
    });
    return wsum ? Math.round(total/wsum) : 0;
  }

  /* ── Récup données toutes saisons ───────────────────────── */

  function gatherCareer(pid, cat = state()?.cat) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const seasonStats = window.ObsModule?.seasonStats;
    const jdataSeasons = (window.JDATA?.[cat]?.players?.find(p => p.name === pid))?.seasons || {};
    const seasons = SEASONS();

    const perSeason = seasons.map(season => {
      const obs = state()?.data?.[cat]?.[pid]?.observations?.[season] || [];
      const seances = state()?.data?.[cat]?.[pid]?.seances?.[season] || [];
      const stats = seasonStats ? seasonStats(obs) : null;
      const score = pScore(cat, pid, season);
      const pillarsValues = {};
      PILLARS.forEach(p => {
        const avg = pAvg(cat, pid, p.key, season);
        pillarsValues[p.key] = avg ? Math.round((avg / 5) * 100) : 0;
      });
      return {
        season,
        score,
        obsCount: obs.length,
        seancesCount: seances.filter(Boolean).length,
        juggleScore: jdataSeasons[season] ?? null,
        pillars: pillarsValues,
        stats,
      };
    });

    // Cumul lifetime
    const cumul = {
      matches:      0,
      minutes:      0,
      buts:         0,
      passes_d:     0,
      tirs_cadres:  0,
      jaune:        0,
      rouge:        0,
      fautes_commises: 0,
      fautes_subies: 0,
      obsTotal:     0,
      seancesTotal: 0,
    };
    perSeason.forEach(s => {
      cumul.obsTotal     += s.obsCount;
      cumul.seancesTotal += s.seancesCount;
      if (s.stats) {
        cumul.matches      += s.stats.matches      || 0;
        cumul.minutes      += s.stats.minutes      || 0;
        cumul.buts         += s.stats.buts         || 0;
        cumul.passes_d     += s.stats.passes_d     || 0;
        cumul.tirs_cadres  += s.stats.tirs_cadres  || 0;
        cumul.jaune        += s.stats.jaune        || 0;
        cumul.rouge        += s.stats.rouge        || 0;
        cumul.fautes_commises += s.stats.fautes_commises || 0;
        cumul.fautes_subies   += s.stats.fautes_subies   || 0;
      }
    });

    return { perSeason, cumul };
  }

  /* ── état modal ─────────────────────────────────────────── */

  let openPid = null;
  function isOpen() { return openPid !== null; }

  function open(pid) {
    openPid = pid;
    renderModal();
  }
  function close() {
    openPid = null;
    renderModal();
  }
  function renderModal() {
    let el = document.querySelector('#career-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'career-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = openPid ? renderOverlay(openPid) : '';
  }

  /* ── rendu ──────────────────────────────────────────────── */

  function renderOverlay(pid) {
    const cat = state()?.cat;
    const data = gatherCareer(pid, cat);
    const prof = state()?.data?.[cat]?.[pid]?.profil || {};
    const displayName = (prof.prenom && prof.nom) ? prof.prenom + ' ' + prof.nom : pid;

    const hasAny = data.perSeason.some(s => s.score > 0 || s.obsCount > 0 || s.seancesCount > 0);
    if (!hasAny) {
      return `<div class="modal-overlay" data-career-overlay>
        <div class="modal-box" style="max-width:520px">
          <div class="modal-head">
            <div><div class="card-kicker">${h(pid)}</div><h3>Vue carrière</h3></div>
            <button class="modal-close" type="button" data-career-action="close">×</button>
          </div>
          <div class="dash-empty">
            <div class="dash-empty-msg">Pas encore de données carrière</div>
            <div class="dash-empty-hint">Une fois plusieurs saisons renseignées, tu pourras visualiser la progression complète.</div>
          </div>
        </div>
      </div>`;
    }

    return `<div class="modal-overlay" data-career-overlay>
      <div class="modal-box modal-box--xl">
        <div class="modal-head">
          <div>
            <div class="card-kicker">Carrière au club — ${h(displayName)}</div>
            <h3>Vue pluri-saisonnière</h3>
          </div>
          <button class="modal-close" type="button" data-career-action="close">×</button>
        </div>

        ${renderCumulBlock(data.cumul)}
        ${renderTimelineBlock(data.perSeason)}
        ${renderPillarsEvoBlock(data.perSeason, cat)}
        ${renderJuggleEvoBlock(data.perSeason)}

        <div class="modal-footer">
          <span style="flex:1"></span>
          <button class="btn-primary" type="button" data-career-action="close">Fermer</button>
        </div>
      </div>
    </div>`;
  }

  function renderCumulBlock(c) {
    const block = (label, val, sub) => `<div class="career-stat">
      <span>${h(label)}</span>
      <strong>${h(val)}</strong>
      ${sub ? `<small>${h(sub)}</small>` : ''}
    </div>`;
    return `<div class="career-cumul">
      <div class="career-section-title">Cumul lifetime</div>
      <div class="career-stat-grid">
        ${block('Matchs', c.matches, c.minutes ? c.minutes + ' min' : '')}
        ${block('Buts', c.buts, c.matches ? '⌀ ' + (c.buts / Math.max(1, c.matches)).toFixed(2) + '/match' : '')}
        ${block('Passes déc.', c.passes_d, c.matches ? '⌀ ' + (c.passes_d / Math.max(1, c.matches)).toFixed(2) + '/match' : '')}
        ${block('Implications', c.buts + c.passes_d, 'buts + passes')}
        ${block('Tirs cadrés', c.tirs_cadres)}
        ${block('Cartons', c.jaune + ' J · ' + c.rouge + ' R')}
        ${block('Observations', c.obsTotal, 'sur toutes saisons')}
        ${block('Séances saisies', c.seancesTotal)}
      </div>
    </div>`;
  }

  function renderTimelineBlock(perSeason) {
    const rows = perSeason.map(s => {
      const hasData = s.score > 0 || s.obsCount > 0 || s.seancesCount > 0;
      const scoreColor = s.score >= 70 ? '#639922' : s.score >= 50 ? '#ba7517' : s.score > 0 ? '#d85a30' : '#8d897f';
      return `<div class="career-timeline-row ${hasData ? '' : 'is-empty'}">
        <div class="career-season-label">
          <strong>${h(s.season)}</strong>
        </div>
        <div class="career-season-stats">
          ${hasData ? `
            <span class="career-season-score" style="color:${scoreColor}">
              <strong>${s.score || '—'}${s.score ? '%' : ''}</strong>
              <small>Score global</small>
            </span>
            <span class="career-season-obs">
              <strong>${s.obsCount}</strong><small>Obs match</small>
            </span>
            <span class="career-season-seances">
              <strong>${s.seancesCount}/3</strong><small>Séances</small>
            </span>
            ${s.stats ? `
              <span class="career-season-stat">
                <strong>${s.stats.buts || 0}B · ${s.stats.passes_d || 0}P</strong>
                <small>Implications</small>
              </span>` : ''}
            ${s.juggleScore != null ? `
              <span class="career-season-stat">
                <strong>${s.juggleScore}</strong><small>Jonglerie</small>
              </span>` : ''}
          ` : '<span class="career-season-empty">Aucune donnée</span>'}
        </div>
      </div>`;
    }).join('');
    return `<div class="career-block">
      <div class="career-section-title">Timeline saison par saison</div>
      <div class="career-timeline">${rows}</div>
    </div>`;
  }

  function renderPillarsEvoBlock(perSeason, cat) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const seasons = perSeason.filter(s => Object.values(s.pillars).some(v => v > 0));
    if (seasons.length < 2 || !PILLARS.length) return '';

    // Tableau évolution
    const rows = PILLARS.map(p => {
      const cells = perSeason.map(s => {
        const v = s.pillars[p.key] || 0;
        const col = v >= 70 ? '#639922' : v >= 45 ? '#ba7517' : v > 0 ? '#d85a30' : '#bbb';
        return `<td style="color:${col};font-weight:${v > 0 ? '700' : '400'}">${v || '—'}${v ? '%' : ''}</td>`;
      }).join('');
      return `<tr><th>${h(p.label)}</th>${cells}</tr>`;
    }).join('');
    const head = perSeason.map(s => `<th>${h(s.season)}</th>`).join('');

    return `<div class="career-block">
      <div class="career-section-title">Évolution des piliers</div>
      <div class="cat-table-wrap">
        <table class="career-pillar-table">
          <thead><tr><th></th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function renderJuggleEvoBlock(perSeason) {
    const data = perSeason.filter(s => s.juggleScore != null);
    if (data.length < 2) return '';
    const max = Math.max(...data.map(s => s.juggleScore || 0));
    return `<div class="career-block">
      <div class="career-section-title">Évolution jonglerie</div>
      <div class="career-juggle-bars">
        ${data.map(s => {
          const pct = max ? Math.round((s.juggleScore / max) * 100) : 0;
          return `<div class="career-juggle-row">
            <span class="career-juggle-season">${h(s.season)}</span>
            <div class="career-juggle-bar-bg">
              <div class="career-juggle-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="career-juggle-val">${s.juggleScore}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ── handler ──────────────────────────────────────────── */

  function handleAction(target) {
    const a = target.dataset.careerAction;
    if (!a) return false;
    if (a === 'close') { close(); return true; }
    if (a === 'open')  { open(target.dataset.pid || state()?.selPlayer); return true; }
    return false;
  }

  /* ── events ───────────────────────────────────────────── */

  document.addEventListener('click', e => {
    if (!openPid) return;
    if (e.target?.matches?.('[data-career-overlay]')) close();
  });
  document.addEventListener('keydown', e => {
    if (openPid && e.key === 'Escape') close();
  });

  /* ── exports ──────────────────────────────────────────── */

  window.CareerModule = {
    open, close, isOpen,
    handleAction,
    gatherCareer,
    renderBody: renderOverlay,
  };
})();

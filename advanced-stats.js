/**
 * advanced-stats.js — Statistiques avancées par poste et par phase
 *
 * Vue analytique du collectif d'une catégorie :
 *   - Par POSTE FFF : moyennes piliers, identités, niveaux relatifs
 *   - Par PHASE de jeu (avec/sans ballon) et SOUS-PHASE :
 *     niveau collectif, points forts/faibles, comparaison entre phases
 *   - Détection automatique de déséquilibres et recommandations
 *
 * Source des scores piliers : ratings stockés dans state.data[cat][pid][season].ratings
 * Source des notes hebdo par principe : weekly-focus store
 *
 * Expose : window.AdvancedStatsModule.{ renderBody, handleAction, aggregate }
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cfb6_weekly_focus_v1';

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? ''); }
  function toast(m) { utils().showToast?.(m); }

  function loadWeeklyStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  /* ── Helpers scores piliers ────────────────────────── */

  function pillarScore(pid, cat, pillarKey) {
    const season = state().season;
    const data = state().data?.[cat]?.[pid]?.[season];
    const PILLARS = window.PILLARS?.[cat] || [];
    const pillar = PILLARS.find(p => p.key === pillarKey);
    if (!data?.ratings?.[pillarKey] || !pillar) return null;
    const ratings = data.ratings[pillarKey];
    const vals = ratings.filter(v => v != null && v > 0);
    if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round((avg / 4) * 100);
  }

  function globalScore(pid, cat) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const WEIGHTS = window.WEIGHTS || {};
    let sum = 0, totalWeight = 0;
    PILLARS.forEach(p => {
      const s = pillarScore(pid, cat, p.key);
      if (s != null) {
        const w = WEIGHTS[p.key] || 0.2;
        sum += s * w;
        totalWeight += w;
      }
    });
    return totalWeight ? Math.round(sum / totalWeight) : null;
  }

  function playerLabel(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    return pid;
  }

  function playerPoste(pid, cat) {
    const season = state().season;
    return state().data?.[cat]?.[pid]?.[season]?.profil?.poste1 || null;
  }

  /* ── Agrégation par poste ──────────────────────────── */

  function aggregateByPoste(cat) {
    const POSTES = window.POSTES || [];
    const PILLARS = window.PILLARS?.[cat] || [];
    const players = Object.keys(state().data?.[cat] || {});

    const groups = {};
    POSTES.forEach(p => { groups[p] = { players: [], scores: {}, globals: [] }; });
    groups['Non assigné'] = { players: [], scores: {}, globals: [] };

    players.forEach(pid => {
      const poste = playerPoste(pid, cat) || 'Non assigné';
      const g = groups[poste] || groups['Non assigné'];
      g.players.push(pid);
      const gs = globalScore(pid, cat);
      if (gs != null) g.globals.push(gs);
      PILLARS.forEach(p => {
        if (!g.scores[p.key]) g.scores[p.key] = [];
        const s = pillarScore(pid, cat, p.key);
        if (s != null) g.scores[p.key].push(s);
      });
    });

    // Calcul moyennes par poste
    const result = Object.entries(groups)
      .filter(([_, g]) => g.players.length > 0)
      .map(([poste, g]) => {
        const pillarAvgs = {};
        PILLARS.forEach(p => {
          const vals = g.scores[p.key] || [];
          pillarAvgs[p.key] = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0) / vals.length) : null;
        });
        const globalAvg = g.globals.length ? Math.round(g.globals.reduce((a,b)=>a+b,0) / g.globals.length) : null;
        return {
          poste, count: g.players.length, globalAvg,
          pillarAvgs, players: g.players,
        };
      })
      .sort((a, b) => (b.globalAvg || 0) - (a.globalAvg || 0));

    return result;
  }

  /* ── Agrégation par phase ──────────────────────────── */

  function aggregateByPhase(cat) {
    const weeks = loadWeeklyStore()[cat] || {};
    const isoKeys = Object.keys(weeks);

    // Stats par phase et sous-phase
    const phases = {
      'avec': { label: 'On a le ballon', subs: {} },
      'sans': { label: "On n'a pas le ballon", subs: {} },
    };
    const subLabels = {
      construire: 'Construire / Progresser',
      desequilibrer: 'Déséquilibrer / Finir',
      opposer: "S'opposer à la progression",
      recuperer: "S'organiser pour récupérer",
    };

    isoKeys.forEach(iso => {
      const w = weeks[iso];
      (w.items || []).forEach(it => {
        if (!it.principleNum) return;
        const phase = it.phase;
        const sub = it.subPhase;
        if (!phases[phase]) return;
        if (!phases[phase].subs[sub]) {
          phases[phase].subs[sub] = { label: subLabels[sub] || sub, values: [], principleNums: new Set() };
        }
        const s = phases[phase].subs[sub];
        s.principleNums.add(it.principleNum);
        Object.values(w.ratings || {}).forEach(playerRatings => {
          const v = playerRatings[it.id];
          if (v != null) s.values.push((v / (it.scale || 5)) * 100);
        });
      });
    });

    // Synthèse
    const result = Object.entries(phases).map(([key, p]) => {
      const subs = Object.entries(p.subs).map(([sk, s]) => ({
        key: sk, label: s.label,
        avg: s.values.length ? Math.round(s.values.reduce((a,b)=>a+b,0) / s.values.length) : null,
        ratings: s.values.length,
        principles: s.principleNums.size,
      }));
      const allValues = subs.reduce((arr, s) => arr.concat(s.values || []), []);
      const phaseValues = Object.values(p.subs).reduce((arr, s) => arr.concat(s.values || []), []);
      return {
        key, label: p.label,
        avg: phaseValues.length ? Math.round(phaseValues.reduce((a,b)=>a+b,0) / phaseValues.length) : null,
        totalRatings: phaseValues.length,
        subs,
      };
    });

    return result;
  }

  /* ── Détection déséquilibres ───────────────────────── */

  function detectImbalances(byPhase, byPoste) {
    const recos = [];
    // Phase avec/sans : écart > 20%
    const avec = byPhase.find(p => p.key === 'avec');
    const sans = byPhase.find(p => p.key === 'sans');
    if (avec?.avg != null && sans?.avg != null) {
      const gap = Math.abs(avec.avg - sans.avg);
      if (gap >= 20) {
        const strong = avec.avg > sans.avg ? avec : sans;
        const weak = avec.avg > sans.avg ? sans : avec;
        recos.push({
          severity: 'warn',
          text: `Déséquilibre marqué : ${strong.label} (${strong.avg}%) bien meilleur que ${weak.label} (${weak.avg}%) — écart de ${gap}%.`,
        });
      }
    }

    // Sous-phases faibles (<50%)
    byPhase.forEach(p => {
      p.subs.forEach(s => {
        if (s.avg != null && s.avg < 50 && s.ratings >= 3) {
          recos.push({
            severity: 'warn',
            text: `${s.label} : niveau collectif faible (${s.avg}% sur ${s.ratings} notes) — à retravailler en priorité.`,
          });
        }
      });
    });

    // Postes : forte hétérogénéité
    if (byPoste.length >= 2) {
      const globals = byPoste.filter(p => p.globalAvg != null).map(p => p.globalAvg);
      if (globals.length >= 2) {
        const max = Math.max(...globals);
        const min = Math.min(...globals);
        if (max - min >= 30) {
          const strongPoste = byPoste.find(p => p.globalAvg === max);
          const weakPoste = byPoste.find(p => p.globalAvg === min);
          recos.push({
            severity: 'info',
            text: `Hétérogénéité par poste : ${strongPoste.poste} (${max}%) vs ${weakPoste.poste} (${min}%). Possible besoin de renfort sur ${weakPoste.poste}.`,
          });
        }
      }
    }

    return recos;
  }

  /* ── Rendu ──────────────────────────────────────────── */

  function renderBody(cat) {
    cat = cat || state().cat;
    const catLbl = (window.CAT_LABELS?.[cat] || cat).toUpperCase();
    const PILLARS = window.PILLARS?.[cat] || [];

    const byPoste = aggregateByPoste(cat);
    const byPhase = aggregateByPhase(cat);
    const recos = detectImbalances(byPhase, byPoste);

    const tab = state().statsTab || 'phase';

    return `
      <div class="advstats-wrap">
        <header class="advstats-head">
          <h2>Stats avancées — ${h(catLbl)}</h2>
          <p>Vue analytique du collectif par phase de jeu et par poste.</p>
        </header>

        <nav class="advstats-tabs">
          <button class="advstats-tab ${tab === 'phase' ? 'on' : ''}" data-advstats-action="tab" data-tab="phase">Par phase de jeu</button>
          <button class="advstats-tab ${tab === 'poste' ? 'on' : ''}" data-advstats-action="tab" data-tab="poste">Par poste FFF</button>
        </nav>

        ${tab === 'phase' ? renderPhaseView(byPhase, byPoste) : renderPosteView(byPoste, PILLARS)}

        ${recos.length > 0 ? `
          <section class="advstats-reco">
            <h3>🔍 Lecture automatique</h3>
            <ul>
              ${recos.map(r => `<li class="reco-${r.severity}">${h(r.text)}</li>`).join('')}
            </ul>
          </section>
        ` : ''}
      </div>
    `;
  }

  function renderPhaseView(byPhase, byPoste) {
    if (byPhase.every(p => p.avg == null)) {
      return `<p class="advstats-empty">Aucune note hebdo enregistrée sur des principes de jeu — saisir au moins quelques notes dans la vue Semaine pour voir les stats par phase.</p>`;
    }

    return `
      <div class="advstats-phases">
        ${byPhase.map(p => {
          const col = p.avg == null ? '#9ca3af' : p.avg >= 70 ? '#16a34a' : p.avg >= 45 ? '#d97706' : '#dc2626';
          const phaseClass = p.key === 'avec' ? 'phase-avec' : 'phase-sans';
          return `
            <article class="advstats-phase ${phaseClass}">
              <header class="advstats-phase-head">
                <div>
                  <h3>${h(p.label)}</h3>
                  <span class="advstats-phase-meta">${p.totalRatings} note${p.totalRatings > 1 ? 's' : ''} sur la saison</span>
                </div>
                <div class="advstats-phase-avg" style="color:${col}">${p.avg != null ? p.avg + '%' : '—'}</div>
              </header>
              <div class="advstats-subs">
                ${p.subs.length === 0
                  ? '<p class="advstats-empty">Aucun principe travaillé dans cette phase.</p>'
                  : p.subs.map(s => renderSubPhase(s)).join('')
                }
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderSubPhase(s) {
    const col = s.avg == null ? '#9ca3af' : s.avg >= 70 ? '#16a34a' : s.avg >= 45 ? '#d97706' : '#dc2626';
    const barWidth = s.avg != null ? s.avg : 0;
    return `
      <div class="advstats-sub">
        <div class="advstats-sub-head">
          <span class="advstats-sub-label">${h(s.label)}</span>
          <span class="advstats-sub-val" style="color:${col}">${s.avg != null ? s.avg + '%' : '—'}</span>
        </div>
        <div class="advstats-bar-bg">
          <div class="advstats-bar-fill" style="width:${barWidth}%;background:${col}"></div>
        </div>
        <div class="advstats-sub-meta">
          ${s.principles} principe${s.principles > 1 ? 's' : ''} évalué${s.principles > 1 ? 's' : ''} ·
          ${s.ratings} note${s.ratings > 1 ? 's' : ''}
        </div>
      </div>
    `;
  }

  function renderPosteView(byPoste, PILLARS) {
    if (!byPoste.length) {
      return `<p class="advstats-empty">Aucun joueur évalué avec un poste renseigné.</p>`;
    }

    return `
      <div class="advstats-poste-grid">
        <table class="advstats-poste-table">
          <thead>
            <tr>
              <th class="adv-th-poste">Poste</th>
              <th>Effectif</th>
              <th>Moy. globale</th>
              ${PILLARS.map(p => `<th>${h(p.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${byPoste.map(g => `
              <tr>
                <th scope="row" class="adv-td-poste">${h(g.poste)}</th>
                <td>${g.count}</td>
                <td class="adv-td-global">${renderScoreCell(g.globalAvg)}</td>
                ${PILLARS.map(p => `<td>${renderScoreCell(g.pillarAvgs[p.key])}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="advstats-poste-details">
          ${byPoste.map(g => `
            <article class="advstats-poste-card">
              <header>
                <h4>${h(g.poste)} <span class="adv-count">(${g.count})</span></h4>
                <div class="adv-global" style="color:${scoreColor(g.globalAvg)}">${g.globalAvg != null ? g.globalAvg + '%' : '—'}</div>
              </header>
              <ul class="adv-player-list">
                ${g.players.slice(0, 12).map(pid => {
                  const sc = globalScore(pid, state().cat);
                  return `<li><span>${h(playerLabel(pid))}</span><strong style="color:${scoreColor(sc)}">${sc != null ? sc + '%' : '—'}</strong></li>`;
                }).join('')}
                ${g.players.length > 12 ? `<li class="adv-more">… +${g.players.length - 12} autres</li>` : ''}
              </ul>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderScoreCell(v) {
    if (v == null) return '<span class="adv-na">—</span>';
    const col = scoreColor(v);
    return `<span style="color:${col};font-weight:600">${v}%</span>`;
  }

  function scoreColor(v) {
    if (v == null) return '#9ca3af';
    if (v >= 70) return '#16a34a';
    if (v >= 45) return '#d97706';
    return '#dc2626';
  }

  /* ── Actions ────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.advstatsAction;
    if (!action) return false;
    if (action === 'tab') {
      state().statsTab = el.dataset.tab || 'phase';
      utils().renderAll?.();
      return true;
    }
    return false;
  }

  window.AdvancedStatsModule = {
    renderBody, handleAction,
    aggregateByPoste, aggregateByPhase, detectImbalances,
  };
})();

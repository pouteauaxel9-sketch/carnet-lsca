/**
 * directeur-view.js — Dashboard responsable technique
 *
 * Vue club consolidée pour le responsable technique. Agrège les indicateurs
 * de toutes les catégories (U13, U11, U9) :
 *
 *   1. Bandeau d'alertes (joueurs sans obs > 60j, blessures actives,
 *      dossiers incomplets, joueurs non assignés à une équipe)
 *   2. Stats globales par catégorie (effectif, % évalué, % avec équipe,
 *      blessés actifs, score moyen)
 *   3. Top progressions du club (toutes catégories confondues)
 *   4. Pépites identifiées (joueurs avec tag 🎯 Pépite)
 *   5. Carte santé : blessures actives détaillées, durée moyenne d'indispo
 *   6. Carte assiduité : taux d'assiduité par catégorie
 *
 * Rien à stocker — tout est dérivé en temps réel des autres modules :
 *   - state.data, JDATA pour les effectifs
 *   - ObsModule pour les observations match
 *   - InjuryModule pour les indispos
 *   - AttendanceModule pour les présences
 *   - ProfilingModule pour les profils détectés
 *   - TransverseModule pour les progressions
 *
 * Expose : window.DirecteurModule.{ renderBody(), countAlerts() }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const state = () => window.appState;
  const CAT_LABELS = () => window.CAT_LABELS || {};
  const SEASONS    = () => window.SEASONS || [];

  /* ── helpers réutilisés des autres modules ──────────────── */

  const ALERT_DAYS = 60; // seuil "joueur sans obs depuis 60 jours"

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
  function lastObsDate(cat, pid, season) {
    const obs = state()?.data?.[cat]?.[pid]?.observations?.[season] || [];
    if (!obs.length) return null;
    const sorted = [...obs].sort((a, b) =>
      (b.date_match || '').localeCompare(a.date_match || '')
    );
    return sorted[0]?.date_match || null;
  }
  function daysSince(iso) {
    if (!iso) return Infinity;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return Infinity;
    return Math.floor((Date.now() - t) / 86400000);
  }
  function completionPercent(cat, pid, season) {
    const data = state()?.data?.[cat]?.[pid]?.[season];
    if (!data) return 0;
    const PILLARS = window.PILLARS?.[cat] || [];
    let rated = 0, total = 0;
    PILLARS.forEach(pillar => {
      total += pillar.criteria.length;
      pillar.criteria.forEach((_, i) => {
        if ((data.ratings?.[pillar.key]?.[i] || 0) > 0) rated++;
      });
    });
    return total ? Math.round((rated / total) * 100) : 0;
  }

  /* ── 1. Alertes ─────────────────────────────────────────── */

  function collectAlerts() {
    const season = state()?.season;
    const alerts = {
      noObsLong: [],     // sans obs depuis > 60j
      injuries: [],      // blessures actives
      lowCompletion: [], // dossiers < 30%
      noTeam: [],        // pas d'équipe assignée
    };
    Object.keys(CAT_LABELS()).forEach(cat => {
      const players = window.JDATA?.[cat]?.players || [];
      players.forEach(p => {
        const pid = p.name;
        const prof = state()?.data?.[cat]?.[pid]?.profil || {};

        // Sans obs > 60j
        const last = lastObsDate(cat, pid, season);
        const ds = daysSince(last);
        const obsCount = (state()?.data?.[cat]?.[pid]?.observations?.[season] || []).length;
        if (obsCount > 0 && ds > ALERT_DAYS && ds !== Infinity) {
          alerts.noObsLong.push({ cat, pid, days: ds, lastDate: last });
        }

        // Blessures actives
        const cs = window.InjuryModule?.currentStatus?.(pid, cat);
        if (cs) alerts.injuries.push({ cat, pid, status: cs });

        // Dossier faible
        const comp = completionPercent(cat, pid, season);
        const score = pScore(cat, pid, season);
        if (score > 0 && comp > 0 && comp < 30) {
          alerts.lowCompletion.push({ cat, pid, completion: comp });
        }

        // Sans équipe
        if (!prof.team) alerts.noTeam.push({ cat, pid });
      });
    });
    return alerts;
  }

  function countAlerts() {
    const a = collectAlerts();
    return a.noObsLong.length + a.injuries.length + a.lowCompletion.length + a.noTeam.length;
  }

  /* ── 2. Stats par catégorie ─────────────────────────────── */

  function categoryStats() {
    const season = state()?.season;
    return Object.keys(CAT_LABELS()).map(cat => {
      const players = window.JDATA?.[cat]?.players || [];
      let evaluated = 0, withTeam = 0, sumScore = 0, scoredCount = 0;
      players.forEach(p => {
        const s = pScore(cat, p.name, season);
        if (s > 0) { evaluated++; sumScore += s; scoredCount++; }
        const prof = state()?.data?.[cat]?.[p.name]?.profil;
        if (prof?.team) withTeam++;
      });
      const inj = window.InjuryModule?.countByStatus?.(cat) || { available: 0, injured: 0, sick: 0, other: 0 };
      return {
        cat,
        label: CAT_LABELS()[cat],
        total: players.length,
        evaluated,
        withTeam,
        avgScore: scoredCount ? Math.round(sumScore / scoredCount) : 0,
        injured: inj.injured,
        sick: inj.sick,
        other: inj.other,
        available: inj.available,
      };
    });
  }

  /* ── 3. Top progressions club ───────────────────────────── */

  function clubProgressions(limit = 5) {
    const season = state()?.season;
    const arr = [];
    Object.keys(CAT_LABELS()).forEach(cat => {
      const list = window.TransverseModule?.progressionList?.(cat, season) || [];
      list.forEach(p => arr.push({ ...p, cat }));
    });
    const ups   = arr.filter(p => p.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit);
    const downs = arr.filter(p => p.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit);
    return { ups, downs };
  }

  /* ── 4. Pépites identifiées ─────────────────────────────── */

  function clubPepites() {
    if (!window.ProfilingModule?.detect) return [];
    const season = state()?.season;
    const arr = [];
    Object.keys(CAT_LABELS()).forEach(cat => {
      const players = window.JDATA?.[cat]?.players || [];
      players.forEach(p => {
        const tags = window.ProfilingModule.detect(p.name, cat, season);
        const isPepite = tags.find(t => t.key === 'pepite');
        if (isPepite) arr.push({ pid: p.name, cat, reason: isPepite.reason, score: pScore(cat, p.name, season) });
      });
    });
    arr.sort((a, b) => b.score - a.score);
    return arr;
  }

  /* ── 5. Assiduité par catégorie ─────────────────────────── */

  function attendanceByCategory() {
    if (!window.AttendanceModule?.rate) return [];
    return Object.keys(CAT_LABELS()).map(cat => {
      const players = window.JDATA?.[cat]?.players || [];
      const rates = players.map(p => window.AttendanceModule.rate(p.name, { cat })).filter(r => r != null);
      const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
      return { cat, label: CAT_LABELS()[cat], avg, pointed: rates.length, total: players.length };
    });
  }

  /* ── Rendu principal ────────────────────────────────────── */

  function renderBody() {
    const alerts = collectAlerts();
    const stats = categoryStats();
    const prog = clubProgressions();
    const pepites = clubPepites();
    const att = attendanceByCategory();

    const totalPlayers = stats.reduce((a, s) => a + s.total, 0);
    const totalEvaluated = stats.reduce((a, s) => a + s.evaluated, 0);
    const totalInjured = stats.reduce((a, s) => a + s.injured + s.sick + s.other, 0);
    const evalPct = totalPlayers ? Math.round((totalEvaluated / totalPlayers) * 100) : 0;

    const alertsTotal = countAlerts();

    return `
      <section class="directeur-shell">

        <div class="directeur-hero">
          <div>
            <div class="card-kicker">Direction technique</div>
            <h1>Tableau de bord</h1>
            <p>Vue club consolidée — saison ${h(state()?.season)} — agrégat toutes catégories.</p>
          </div>
          <div class="dashboard-stats">
            <div class="dash-stat"><span>Effectif total</span><strong>${totalPlayers}</strong></div>
            <div class="dash-stat"><span>Évalués</span><strong>${totalEvaluated} (${evalPct}%)</strong></div>
            <div class="dash-stat"><span>Indispos</span><strong>${totalInjured}</strong></div>
            <div class="dash-stat directeur-alert-counter ${alertsTotal > 0 ? 'has-alerts' : ''}">
              <span>Alertes</span><strong>${alertsTotal}</strong>
            </div>
          </div>
        </div>

        ${renderAlertsCard(alerts)}

        <div class="directeur-grid">
          ${renderCategoryStatsCard(stats)}
          ${renderInjuriesDetailCard(alerts.injuries)}
          ${renderAttendanceCard(att)}
          ${renderProgressionsCard('Top progressions club', prog.ups, 'up')}
          ${renderProgressionsCard('Vigilance reculs', prog.downs, 'down')}
          ${renderPepitesCard(pepites)}
        </div>
      </section>`;
  }

  /* ── Cartes ─────────────────────────────────────────────── */

  function renderAlertsCard(a) {
    const total = a.noObsLong.length + a.injuries.length + a.lowCompletion.length + a.noTeam.length;
    if (!total) {
      return `<section class="dashboard-card directeur-alerts-card">
        <div class="card-head">
          <div><div class="card-kicker">Alertes</div><h2>Tout est à jour 👌</h2></div>
        </div>
        <p class="info-text">Aucune alerte sur les ${ALERT_DAYS} derniers jours. Continue comme ça !</p>
      </section>`;
    }

    function row(label, count, items, color) {
      if (!count) return '';
      const chips = items.slice(0, 12).map(it => {
        const catLbl = CAT_LABELS()[it.cat] || it.cat.toUpperCase();
        const extra = it.days ? ` (${it.days}j)` : it.completion ? ` (${it.completion}%)` : it.status ? ` (${it.status?.type})` : '';
        return `<button class="alert-chip" type="button" data-action="select-player-cat" data-cat="${h(it.cat)}" data-player="${h(it.pid)}" title="${h(catLbl)}">
          <span class="alert-chip-cat">${h(catLbl)}</span>
          <span>${h(it.pid)}${h(extra)}</span>
        </button>`;
      }).join('');
      const more = items.length > 12 ? `<span class="alert-more">+ ${items.length - 12} autres</span>` : '';
      return `<div class="alert-row" style="border-left:4px solid ${color}">
        <div class="alert-row-head"><strong>${h(label)}</strong><span>${count}</span></div>
        <div class="alert-chips">${chips}${more}</div>
      </div>`;
    }

    return `<section class="dashboard-card directeur-alerts-card directeur-alerts-active">
      <div class="card-head">
        <div><div class="card-kicker">Alertes (${total})</div><h2>À traiter en priorité</h2></div>
      </div>
      <div class="alert-rows">
        ${row(`Sans observation depuis ${ALERT_DAYS}+ jours`, a.noObsLong.length, a.noObsLong, '#d85a30')}
        ${row('Blessures / Indispos actives', a.injuries.length, a.injuries, '#993556')}
        ${row('Dossier d\'évaluation faible (<30%)', a.lowCompletion.length, a.lowCompletion, '#ba7517')}
        ${row('Pas d\'équipe assignée', a.noTeam.length, a.noTeam, '#5e5b54')}
      </div>
    </section>`;
  }

  function renderCategoryStatsCard(stats) {
    const rows = stats.map(s => {
      const evalPct = s.total ? Math.round((s.evaluated / s.total) * 100) : 0;
      const teamPct = s.total ? Math.round((s.withTeam / s.total) * 100) : 0;
      const evalColor = evalPct >= 80 ? '#639922' : evalPct >= 50 ? '#ba7517' : '#d85a30';
      return `<tr>
        <td><strong>${h(s.label)}</strong></td>
        <td>${s.total}</td>
        <td><span style="color:${evalColor};font-weight:700">${s.evaluated} (${evalPct}%)</span></td>
        <td>${s.withTeam} (${teamPct}%)</td>
        <td>${s.avgScore || '—'}${s.avgScore ? '%' : ''}</td>
        <td>${s.injured + s.sick + s.other}</td>
      </tr>`;
    }).join('');
    return `<section class="dashboard-card span-2">
      <div class="card-head"><div><div class="card-kicker">Effectif</div><h2>Vue par catégorie</h2></div></div>
      <div class="cat-table-wrap">
        <table class="cat-table">
          <thead><tr>
            <th>Catégorie</th><th>Effectif</th><th>Évalués</th><th>Avec équipe</th><th>Score ⌀</th><th>Indispos</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderInjuriesDetailCard(injuries) {
    if (!injuries.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Santé</div><h2>Aucune indispo active 💪</h2></div></div>
        <p class="info-text">Tout l'effectif est disponible.</p>
      </section>`;
    }
    const TYPES = window.InjuryModule?.TYPES || [];
    const rows = injuries.slice(0, 8).map(it => {
      const td = TYPES.find(t => t.key === it.status?.type) || {};
      const dur = window.InjuryModule?.daysOff?.(it.status);
      const catLbl = CAT_LABELS()[it.cat] || it.cat.toUpperCase();
      return `<button class="injury-detail-row" type="button" data-action="select-player-cat" data-cat="${h(it.cat)}" data-player="${h(it.pid)}">
        <span class="injury-detail-icon" style="color:${td.color}">${td.icon || '⚠'}</span>
        <span class="injury-detail-name"><strong>${h(it.pid)}</strong><small>${h(catLbl)}</small></span>
        <span class="injury-detail-zone">${h(it.status?.zone || td.label || '')}</span>
        <span class="injury-detail-dur">${dur != null ? dur + 'j' : ''}</span>
      </button>`;
    }).join('');
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Santé</div><h2>Indispos actives (${injuries.length})</h2></div></div>
      <div class="injury-detail-list">${rows}</div>
      ${injuries.length > 8 ? `<p class="info-text">+ ${injuries.length - 8} autres — voir fiches joueurs.</p>` : ''}
    </section>`;
  }

  function renderAttendanceCard(att) {
    const hasData = att.some(a => a.avg != null);
    if (!hasData) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Assiduité</div><h2>Pas encore de pointages</h2></div></div>
        <p class="info-text">Active la présence depuis les fiches joueurs pour voir le suivi club.</p>
      </section>`;
    }
    const rows = att.map(a => {
      const color = a.avg == null ? '#8d897f' : a.avg >= 85 ? '#639922' : a.avg >= 65 ? '#ba7517' : '#d85a30';
      const pct = a.avg || 0;
      return `<div class="att-cat-row">
        <span class="att-cat-name">${h(a.label)}</span>
        <div class="att-cat-bar-bg">
          <div class="att-cat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="att-cat-val" style="color:${color}">${a.avg != null ? a.avg + '%' : '—'} <span class="att-cat-meta">(${a.pointed}/${a.total} joueurs)</span></span>
      </div>`;
    }).join('');
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Assiduité</div><h2>Taux moyen par catégorie</h2></div></div>
      <div class="att-cat-list">${rows}</div>
    </section>`;
  }

  function renderProgressionsCard(title, rows, kind) {
    if (!rows.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">${kind === 'up' ? 'Progression' : 'Vigilance'}</div><h2>${h(title)}</h2></div></div>
        <div class="dash-empty">
          <div class="dash-empty-msg">Pas assez de données</div>
          <div class="dash-empty-hint">Il faut au moins deux saisons évaluées pour comparer.</div>
        </div>
      </section>`;
    }
    const cls = kind === 'up' ? 'delta-up' : 'delta-down';
    const arrow = kind === 'up' ? '↗' : '↘';
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">${kind === 'up' ? 'Progression club' : 'Vigilance club'}</div><h2>${h(title)}</h2></div></div>
      <table class="leader-table">
        <thead><tr><th></th><th>Joueur</th><th>Cat.</th><th>N-1</th><th>N</th><th>Δ</th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `<tr>
            <td class="rank-cell">${i + 1}</td>
            <td><button class="player-link" type="button" data-action="select-player-cat" data-cat="${h(r.cat)}" data-player="${h(r.pid)}">${h(r.pid)}</button></td>
            <td>${h(CAT_LABELS()[r.cat] || r.cat)}</td>
            <td>${r.prev}%</td>
            <td><strong>${r.now}%</strong></td>
            <td class="${cls}"><strong>${arrow} ${Math.abs(r.delta)}%</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  }

  function renderPepitesCard(pepites) {
    if (!pepites.length) {
      return `<section class="dashboard-card">
        <div class="card-head"><div><div class="card-kicker">Pépites</div><h2>Aucune pépite détectée</h2></div></div>
        <p class="info-text">Une pépite a un score ≥ 70% et des notes élevées sur 4 piliers minimum.</p>
      </section>`;
    }
    return `<section class="dashboard-card">
      <div class="card-head"><div><div class="card-kicker">Pépites du club 🎯</div><h2>${pepites.length} joueur${pepites.length > 1 ? 's' : ''}</h2></div></div>
      <div class="pepites-list">
        ${pepites.slice(0, 8).map(p => `<button class="pepite-card" type="button"
          data-action="select-player-cat" data-cat="${h(p.cat)}" data-player="${h(p.pid)}"
          title="${h(p.reason)}">
          <span class="pepite-score">${p.score}%</span>
          <span class="pepite-info">
            <strong>${h(p.pid)}</strong>
            <small>${h(CAT_LABELS()[p.cat] || p.cat)}</small>
          </span>
        </button>`).join('')}
      </div>
    </section>`;
  }

  /* ── Exports ────────────────────────────────────────────── */

  window.DirecteurModule = {
    renderBody,
    countAlerts,
    collectAlerts,
    categoryStats,
    clubProgressions,
    clubPepites,
  };
})();

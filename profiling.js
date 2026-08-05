/**
 * profiling.js — Détection automatique de profils étendue.
 *
 * Au-delà des 4 insights actuels d'app.js, ce module applique un jeu de règles
 * sur les évaluations (5 piliers) + les stats match (buts, passes, cartons,
 * note 0-10, minutes) pour tagger chaque joueur. Un joueur peut avoir
 * plusieurs profils simultanément.
 *
 * Profils détectés :
 *   🎯 Pépite               — niveau très haut sur 4+ piliers et progression
 *   ⚡ Profil offensif      — beaucoup de buts/passes, technique élevée
 *   🛡 Profil défensif      — tactique + physique élevés, peu de fautes
 *   🔄 Polyvalent           — répartition équilibrée des 5 piliers
 *   👑 Leader               — mental élevé + personnel élevé + nombreuses obs
 *   🔥 Fort caractère       — combat sur le terrain (fautes subies > moyenne,
 *                             cartons modérés, mental fort)
 *   ⚠ Technique fragile    — pilier technique < 40% alors qu'évalué
 *   📈 En forte progression — delta saison > +15%
 *   📉 En recul             — delta saison < -10%
 *   🎓 Polyvalent (postes)  — joue à plusieurs positions différentes
 *   💔 Discipline           — cumul cartons/fautes élevé
 *
 * Expose : window.ProfilingModule.{
 *   detect(pid, cat, season)      -> [{ key, label, icon, color, reason }]
 *   renderTags(pid)                -> HTML
 *   getCategoryGrouping(cat)       -> { [profileKey]: [pid, …] }
 *   renderCategoryGrouping(cat)    -> HTML pour la vue Analyses
 * }
 */
(function () {
  'use strict';

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  const state = () => window.appState;

  /* ── Catalogue de profils ─────────────────────────────── */

  const PROFILES = {
    pepite:        { label: 'Pépite',                 icon: '🎯', color: '#185fa5', bg: '#e6f1fb' },
    offensif:      { label: 'Profil offensif',        icon: '⚡', color: '#d85a30', bg: '#faece7' },
    defensif:      { label: 'Profil défensif',        icon: '🛡', color: '#0f6e56', bg: '#e1f5ee' },
    polyvalent:    { label: 'Polyvalent (piliers)',   icon: '🔄', color: '#5e5b54', bg: '#f4efe7' },
    leader:        { label: 'Leader',                 icon: '👑', color: '#854f0b', bg: '#faeeda' },
    combatif:      { label: 'Fort caractère',         icon: '🔥', color: '#993556', bg: '#fbeaf0' },
    fragile_tech:  { label: 'Technique fragile',      icon: '⚠',  color: '#ba7517', bg: '#faeeda' },
    progression:   { label: 'En forte progression',   icon: '📈', color: '#639922', bg: '#eaf3de' },
    recul:         { label: 'En recul',               icon: '📉', color: '#d85a30', bg: '#faece7' },
    poste_versatile: { label: 'Polyvalent (postes)',  icon: '🎓', color: '#185fa5', bg: '#e6f1fb' },
    discipline:    { label: 'Vigilance discipline',   icon: '💔', color: '#712b13', bg: '#faece7' },
  };

  /* ── Helpers calculs (réimplémentés pour découpage) ─── */

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
  function pAvgPct(cat, pid, key, season) {
    const a = pAvg(cat, pid, key, season);
    return a ? Math.round((a / 4) * 100) : 0;
  }
  function pScore(cat, pid, season) {
    const WEIGHTS = { technique: 0.35, tactique: 0.25, physique: 0.20, mental: 0.15, perso: 0.05 };
    const PILLARS = window.PILLARS?.[cat] || [];
    let total = 0, wsum = 0;
    PILLARS.forEach(p => {
      const avg = pAvg(cat, pid, p.key, season);
      if (avg > 0) { total += (avg / 5) * 100 * (WEIGHTS[p.key] || 0.1); wsum += WEIGHTS[p.key] || 0.1; }
    });
    return wsum ? Math.round(total / wsum) : 0;
  }
  function prevSeason(season) {
    const arr = window.SEASONS || [];
    const i = arr.indexOf(season);
    return i >= 0 ? arr[i + 1] : null;
  }

  /* ── Détection : applique les règles ──────────────────── */

  function detect(pid, cat = state()?.cat, season = state()?.season) {
    if (!cat || !season) return [];
    const obs = state()?.data?.[cat]?.[pid]?.observations?.[season] || [];
    const seasonStats = window.ObsModule?.seasonStats?.(obs);
    const tech = pAvgPct(cat, pid, 'technique', season);
    const tact = pAvgPct(cat, pid, 'tactique',  season);
    const phys = pAvgPct(cat, pid, 'physique',  season);
    const ment = pAvgPct(cat, pid, 'mental',    season);
    const pers = pAvgPct(cat, pid, 'perso',     season);
    const score = pScore(cat, pid, season);
    const prev = prevSeason(season);
    const prevScore = prev ? pScore(cat, pid, prev) : 0;
    const delta = (score && prevScore) ? (score - prevScore) : null;

    const tags = [];
    function add(key, reason) {
      const p = PROFILES[key];
      if (p) tags.push({ key, label: p.label, icon: p.icon, color: p.color, bg: p.bg, reason });
    }

    // Pépite : haut niveau sur 4+ piliers
    const high = [tech, tact, phys, ment, pers].filter(v => v >= 65).length;
    if (score >= 70 && high >= 4) {
      add('pepite', `Niveau haut sur ${high}/5 piliers (score ${score}%)`);
    }

    // Offensif : technique + buts/passes
    if (seasonStats && seasonStats.matches >= 3) {
      const implPerMatch = (seasonStats.buts + seasonStats.passes_d) / seasonStats.matches;
      if (implPerMatch >= 0.5 && tech >= 50) {
        add('offensif', `${seasonStats.buts}B + ${seasonStats.passes_d}P en ${seasonStats.matches} matchs · technique ${tech}%`);
      }
    }

    // Défensif : tactique + physique élevés, peu de fautes
    if (tact >= 55 && phys >= 50 && seasonStats) {
      const foulsPerMatch = seasonStats.matches ? seasonStats.fautes_commises / seasonStats.matches : 0;
      if (foulsPerMatch <= 1.5 && (seasonStats.fautes_subies > seasonStats.fautes_commises || foulsPerMatch < 1)) {
        add('defensif', `Tactique ${tact}% · physique ${phys}% · ${foulsPerMatch.toFixed(1)} faute/match`);
      }
    }

    // Polyvalent piliers : écart-type faible entre les 5 piliers (et score > 0)
    if (score > 0) {
      const piliers = [tech, tact, phys, ment, pers].filter(v => v > 0);
      if (piliers.length >= 4) {
        const mean = piliers.reduce((a, b) => a + b, 0) / piliers.length;
        const variance = piliers.reduce((a, b) => a + (b - mean) ** 2, 0) / piliers.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev <= 10 && mean >= 40) {
          add('polyvalent', `Écart entre piliers faible (${Math.round(stdDev)} pts) · moy. ${Math.round(mean)}%`);
        }
      }
    }

    // Leader : mental + perso élevés + nombreuses observations
    if (ment >= 60 && pers >= 60 && obs.length >= 5) {
      add('leader', `Mental ${ment}% · personnel ${pers}% · ${obs.length} obs`);
    }

    // Fort caractère : nombreuses fautes subies + mental fort + cartons modérés
    if (seasonStats && seasonStats.matches >= 3) {
      const foulsSubies = seasonStats.matches ? seasonStats.fautes_subies / seasonStats.matches : 0;
      const cartons = (seasonStats.jaune || 0) + (seasonStats.rouge || 0);
      if (foulsSubies >= 1.5 && ment >= 55 && cartons <= 3) {
        add('combatif', `${seasonStats.fautes_subies} fautes subies (${foulsSubies.toFixed(1)}/match) · mental ${ment}%`);
      }
    }

    // Technique fragile : tech < 40% (et évalué)
    if (tech > 0 && tech < 40) {
      add('fragile_tech', `Technique ${tech}% — axe prioritaire de travail`);
    }

    // Progression / recul saison
    if (delta != null) {
      if (delta >= 15) add('progression', `+${delta}% vs saison précédente (${prev})`);
      else if (delta <= -10) add('recul', `${delta}% vs saison précédente (${prev})`);
    }

    // Postes joués multiples (versatilité positionnelle)
    if (obs.length >= 4) {
      const postes = new Set(obs.map(o => o.poste_joue).filter(Boolean));
      if (postes.size >= 3) {
        add('poste_versatile', `${postes.size} positions différentes jouées`);
      }
    }

    // Discipline : cartons élevés ou cumul fautes
    if (seasonStats && seasonStats.matches >= 3) {
      const cartons = (seasonStats.jaune || 0) + (seasonStats.rouge || 0) * 2;
      const foulsPerMatch = seasonStats.fautes_commises / seasonStats.matches;
      if (cartons >= 3 || foulsPerMatch >= 3) {
        add('discipline', `${seasonStats.jaune}J · ${seasonStats.rouge}R · ${foulsPerMatch.toFixed(1)} fautes/match`);
      }
    }

    return tags;
  }

  /* ── Rendu tags sur la fiche joueur ───────────────────── */

  function renderTags(pid) {
    const tags = detect(pid);
    if (!tags.length) {
      return `<div class="profiling-empty">Pas encore assez d'observations pour détecter un profil saillant.</div>`;
    }
    const items = tags.map(t => `
      <div class="profiling-tag" style="background:${t.bg};border-color:${t.color};color:${t.color}"
        title="${h(t.reason)}">
        <strong>${t.icon} ${h(t.label)}</strong>
        <span>${h(t.reason)}</span>
      </div>`).join('');
    return `<div class="detail-card profiling-card">
      <div class="card-kicker">Profils détectés</div>
      <h3>Tags automatiques (${tags.length})</h3>
      <div class="profiling-tags">${items}</div>
      <p class="info-text">Tags calculés à partir des évaluations piliers et des observations match. Plusieurs tags possibles par joueur.</p>
    </div>`;
  }

  /* ── Vue catégorie : joueurs groupés par profil ───────── */

  function getCategoryGrouping(cat = state()?.cat) {
    const players = window.JDATA?.[cat]?.players || [];
    const groups = {};
    Object.keys(PROFILES).forEach(k => { groups[k] = []; });
    players.forEach(p => {
      const tags = detect(p.name, cat);
      tags.forEach(t => { groups[t.key].push({ pid: p.name, reason: t.reason }); });
    });
    return groups;
  }

  function renderCategoryGrouping(cat = state()?.cat) {
    const groups = getCategoryGrouping(cat);
    const order = [
      'pepite', 'progression', 'leader', 'polyvalent', 'poste_versatile',
      'offensif', 'defensif', 'combatif',
      'fragile_tech', 'recul', 'discipline',
    ];
    const sections = order.map(key => {
      const list = groups[key] || [];
      if (!list.length) return '';
      const p = PROFILES[key];
      return `<div class="profile-group" style="border-left:4px solid ${p.color}">
        <div class="profile-group-head" style="background:${p.bg};color:${p.color}">
          <strong>${p.icon} ${h(p.label)}</strong>
          <span class="profile-group-count">${list.length}</span>
        </div>
        <div class="profile-group-list">
          ${list.map(r => `<button class="profile-player-chip" type="button"
            data-action="select-player" data-player="${h(r.pid)}"
            title="${h(r.reason)}">${h(r.pid)}</button>`).join('')}
        </div>
      </div>`;
    }).filter(Boolean).join('');

    if (!sections) {
      return `<div class="dash-empty">
        <div class="dash-empty-msg">Aucun profil saillant détecté</div>
        <div class="dash-empty-hint">Continue les évaluations et observations match pour activer les tags.</div>
      </div>`;
    }
    return `<section class="dashboard-card span-2">
      <div class="card-head">
        <div><div class="card-kicker">Profilage</div><h2>Joueurs groupés par profil détecté</h2></div>
      </div>
      <div class="profile-groups">${sections}</div>
    </section>`;
  }

  /* ── Exports ──────────────────────────────────────────── */

  window.ProfilingModule = {
    PROFILES,
    detect,
    renderTags,
    getCategoryGrouping,
    renderCategoryGrouping,
  };
})();

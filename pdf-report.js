(function () {
  'use strict';

  /* Couleurs d'accent par pilier dominant */
  const PILLAR_COLORS = {
    technique: '#185fa5',
    tactique:  '#0f6e56',
    physique:  '#854f0b',
    mental:    '#993556',
    perso:     '#5f5e5a'
  };

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Données joueur ──────────────────────────────────── */

  function gatherData(pid) {
    const state   = window.appState;
    const cat     = state.cat;
    const season  = state.season;

    // profil
    const pdata   = state.data[cat]?.[pid] || {};
    const prof    = pdata.profil || {};
    const seasonD = pdata[season] || {};

    // scores piliers (via app.js globals)
    const PILLARS = window.PILLARS?.[cat] || [];
    const pillarScores = {};
    PILLARS.forEach(p => {
      const avg = _pAvg(cat, pid, p.key, season);
      pillarScores[p.key] = { avg, pct: avg ? Math.round((avg / 4) * 100) : 0 };
    });

    // séances
    const seancesRaw = pdata.seances?.[season] || [null, null, null];
    const seances = seancesRaw.slice(0, 3);

    // observations
    const obsRaw = pdata.observations?.[season] || [];
    const observations = [...obsRaw].sort(
      (a, b) => new Date(b.date_match) - new Date(a.date_match)
    );

    const score   = _pScore(cat, pid, season);
    const level   = _getLevel(score);
    const displayName = (prof.prenom && prof.nom)
      ? prof.prenom + ' ' + prof.nom : pid;

    // Dominant pillar → accent color
    let dominantPillar = 'technique';
    let dominantPct = 0;
    PILLARS.forEach(p => {
      if (pillarScores[p.key]?.pct > dominantPct) {
        dominantPct = pillarScores[p.key].pct;
        dominantPillar = p.key;
      }
    });
    const accent = PILLAR_COLORS[dominantPillar] || '#185fa5';

    return {
      pid, cat, season, prof, seasonD, pillarScores, seances, observations,
      score, level, displayName, accent, PILLARS
    };
  }

  /* Shims pour fonctions app.js (disponibles via window) */
  function _pAvg(cat, pid, key, season) {
    const PILLARS  = window.PILLARS?.[cat] || [];
    const data     = window.appState?.data[cat]?.[pid]?.[season];
    if (!data) return 0;
    const pillar   = PILLARS.find(p => p.key === key);
    if (!pillar) return 0;
    let total = 0, count = 0;
    pillar.criteria.forEach((_, i) => {
      const v = data.ratings?.[key]?.[i] || 0;
      if (v > 0) { total += v; count++; }
    });
    return count ? total / count : 0;
  }

  function _pScore(cat, pid, season) {
    const WEIGHTS = { technique:0.35, tactique:0.25, physique:0.20, mental:0.15, perso:0.05 };
    const PILLARS = window.PILLARS?.[cat] || [];
    let total = 0, wsum = 0;
    PILLARS.forEach(p => {
      const avg = _pAvg(cat, pid, p.key, season);
      if (avg > 0) {
        total += (avg / 4) * 100 * (WEIGHTS[p.key] || 0.1);
        wsum  += WEIGHTS[p.key] || 0.1;
      }
    });
    return wsum ? Math.round(total / wsum) : 0;
  }

  function _getLevel(score) {
    if (score >= 80) return 'Très avancé';
    if (score >= 60) return 'Bon niveau';
    if (score >= 40) return 'En progression';
    if (score > 0)  return 'En difficulté';
    return 'Non évalué';
  }

  /* ── Génération HTML pour impression ─────────────────── */

  function buildPage1Html(d, coachComment) {
    const { prof, score, level, displayName, accent, PILLARS, pillarScores, season, cat } = d;

    const catLabels = window.CAT_LABELS || {};
    const age = prof.naissance
      ? Math.floor((new Date() - new Date(prof.naissance)) / 31557600000)
      : null;

    // Radar SVG simplifié (polygone)
    const radarSvg = buildRadarSvg(PILLARS, pillarScores);

    // Objectifs
    const objs = (prof.objectifs || []).filter(Boolean);
    const objRows = objs.length
      ? objs.map((o, i) => `<div class="pdf-obj-row">
          <span class="pdf-obj-num">${i + 1}</span>
          <span>${h(o)}</span>
        </div>`).join('')
      : '<div style="color:#888">Aucun objectif renseigné</div>';

    // Pillar bars
    const pillarBars = PILLARS.map(p => {
      const pct = pillarScores[p.key]?.pct || 0;
      const col = PILLAR_COLORS[p.key] || accent;
      return `<div class="pdf-pillar-row">
        <span class="pdf-pillar-name">${h(p.label)}</span>
        <div class="pdf-bar-bg">
          <div class="pdf-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <span class="pdf-pillar-pct" style="color:${col}">${pct}%</span>
      </div>`;
    }).join('');

    // Score badge color
    const scoreBg = score >= 70 ? '#eaf3de' : score >= 45 ? '#faeeda' : '#faece7';
    const scoreCol = score >= 70 ? '#27500a' : score >= 45 ? '#633806' : '#712b13';

    const photoHtml = prof.photo
      ? `<img src="${prof.photo}" class="pdf-photo" alt="${h(displayName)}">`
      : `<div class="pdf-photo pdf-photo-initials" style="background:${accent}22;color:${accent}">
           ${h(displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2))}
         </div>`;

    return `
      <header class="pdf-header" style="background:${accent}">
        <div class="pdf-header-content">
          ${photoHtml}
          <div class="pdf-header-info">
            <h1>${h(displayName)}</h1>
            <div class="pdf-tags">
              <span>${h(catLabels[cat] || cat.toUpperCase())}</span>
              <span>Saison ${h(season)}</span>
              ${prof.poste1 ? `<span>${h(prof.poste1)}</span>` : ''}
              ${prof.pied   ? `<span>Pied ${h(prof.pied)}</span>` : ''}
              ${age         ? `<span>${age} ans</span>` : ''}
              ${prof.annees_club ? `<span>${h(prof.annees_club)} an(s) au club</span>` : ''}
            </div>
          </div>
          <div class="pdf-score-badge" style="background:${scoreBg};color:${scoreCol}">
            <div class="pdf-score-val">${score || '—'}${score ? '%' : ''}</div>
            <div class="pdf-score-lbl">${h(level)}</div>
          </div>
        </div>
      </header>

      <div class="pdf-body">
        <div class="pdf-two-col">

          <section class="pdf-section">
            <h2>Radar des piliers</h2>
            <div class="pdf-radar-wrap">${radarSvg}</div>
            <div class="pdf-pillars">${pillarBars}</div>
          </section>

          <section class="pdf-section">
            <h2>Objectifs de saison</h2>
            <div class="pdf-objs">${objRows}</div>

            ${d.seasonD.comments?.main ? `
              <h2 style="margin-top:16px">Commentaire entraîneur</h2>
              <div class="pdf-comment">${h(d.seasonD.comments.main)}</div>` : ''}

            ${coachComment ? `
              <h2 style="margin-top:16px">Note pour l'entretien</h2>
              <div class="pdf-comment">${h(coachComment)}</div>` : ''}
          </section>

        </div>
      </div>`;
  }

  function buildPage2Html(d) {
    const { seances, observations, cat, season } = d;

    /* ── Séances ── */
    const ATELIERS    = window.SeanceModule?.ATELIERS || [];
    const SLOT_LABELS = window.SeanceModule?.SLOT_LABELS || ['S1','S2','S3'];
    const scoreA      = window.SeanceModule?.scoreAtelier;
    const scoreS      = window.SeanceModule?.seanceScore;
    const PERF_REF    = window.SeanceModule?.PERF_REF || {};

    const hasSeances = seances.some(Boolean);
    let seanceHtml = '<p style="color:#888">Aucune séance enregistrée cette saison.</p>';

    if (hasSeances && ATELIERS.length) {
      const headers = ['Atelier', ...SLOT_LABELS.map((l, i) => seances[i] ? l : null).filter(Boolean)];
      const filledSeances = seances.filter(Boolean);

      const statusBadge = (key, val, c) => {
        if (!val && val !== 0) return '<span style="color:#ccc">—</span>';
        const ref = PERF_REF[c]?.[key];
        if (!ref) {
          const sc = scoreA ? scoreA(key, val, c) : null;
          return sc !== null ? `<span>${sc}%</span>` : `<span>${val}</span>`;
        }
        const v = parseFloat(val);
        const status = v <= ref.excellent ? '✓✓' : v <= ref.bien ? '✓' : '△';
        const color  = v <= ref.excellent ? '#27500a' : v <= ref.bien ? '#633806' : '#712b13';
        const bg     = v <= ref.excellent ? '#eaf3de' : v <= ref.bien ? '#faeeda' : '#faece7';
        return `<span style="background:${bg};color:${color};padding:1px 5px;border-radius:4px">${val}s ${status}</span>`;
      };

      const rows = ATELIERS.map(a => {
        const cells = filledSeances.map(s => {
          const val = s?.ateliers?.[a.key];
          return `<td>${statusBadge(a.key, val, cat)}</td>`;
        }).join('');
        return `<tr><td>${h(a.label)}</td>${cells}</tr>`;
      });

      const scoreRow = `<tr class="pdf-score-row">
        <td><strong>Score séance</strong></td>
        ${filledSeances.map(s => `<td><strong>${scoreS ? scoreS(s, cat) : 0}%</strong></td>`).join('')}
      </tr>`;

      seanceHtml = `<table class="pdf-table">
        <thead><tr>${headers.map(h2 => `<th>${h(h2)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}${scoreRow}</tbody>
      </table>`;
    }

    /* ── Observations ── */
    const DIMS = window.ObsModule?.DIMENSIONS || [];
    const DIM_OPTS = window.ObsModule?.DIM_OPTS || [];
    const dimAvgFn = window.ObsModule?.dimAvg;

    const hasObs = observations.length > 0;
    let obsHtml = '<p style="color:#888">Aucune observation cette saison.</p>';

    if (hasObs && DIMS.length) {
      const dimRows = DIMS.map(dim => {
        const avg = dimAvgFn ? dimAvgFn(observations, dim.key) : null;
        const pct = avg !== null ? Math.round((avg / 3) * 100) : null;
        const color = pct !== null
          ? (pct >= 70 ? '#27500a' : pct >= 45 ? '#633806' : '#712b13') : '#888';
        const bg = pct !== null
          ? (pct >= 70 ? '#eaf3de' : pct >= 45 ? '#faeeda' : '#faece7') : '#f4efe7';
        return `<tr>
          <td>${h(dim.label)}</td>
          <td>${h(dim.question)}</td>
          <td style="text-align:center">
            ${pct !== null
              ? `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:4px;font-weight:700">${pct}%</span>`
              : '—'}
          </td>
        </tr>`;
      }).join('');

      obsHtml = `<p style="font-size:11px;color:#666;margin-bottom:8px">
        ${observations.length} observation${observations.length > 1 ? 's' : ''} — Saison ${h(season)}
      </p>
      <table class="pdf-table">
        <thead><tr><th>Dimension</th><th>Question terrain</th><th>Moyenne</th></tr></thead>
        <tbody>${dimRows}</tbody>
      </table>`;

      // Last 3 obs comments
      const recentWithComments = observations.filter(o => o.commentaire).slice(0, 3);
      if (recentWithComments.length) {
        obsHtml += `<div style="margin-top:10px">
          <strong style="font-size:11px">Derniers commentaires :</strong>
          ${recentWithComments.map(o => `
            <div class="pdf-comment" style="margin-top:5px;font-size:10px">
              <span style="color:#888">${o.date_match ? new Date(o.date_match).toLocaleDateString('fr-FR') : ''} vs ${h(o.adversaire || '')} —</span>
              ${h(o.commentaire)}
            </div>`).join('')}
        </div>`;
      }
    }

    const educator = window.EducatorModule?.getEducatorName() || '';
    const today = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    return `
      <div class="pdf-body pdf-page2-body">
        <section class="pdf-section">
          <h2>Séances d'évaluation terrain — Saison ${h(season)}</h2>
          ${seanceHtml}
        </section>

        <section class="pdf-section" style="margin-top:20px">
          <h2>Observations match — Saison ${h(season)}</h2>
          ${obsHtml}
        </section>
      </div>

      <footer class="pdf-footer">
        <div class="pdf-footer-logo">
          <div class="pdf-logo-placeholder">GJ LSCA<br>Louverne</div>
        </div>
        <div class="pdf-footer-meta">
          <span>Éducateur : ${h(educator)}</span>
          <span>Généré le ${today}</span>
        </div>
      </footer>`;
  }

  /* ── SVG Radar léger ──────────────────────────────────── */

  function buildRadarSvg(PILLARS, pillarScores) {
    if (!PILLARS.length) return '';
    const size = 160;
    const cx = size / 2, cy = size / 2, r = 65;
    const n = PILLARS.length;

    const angles = PILLARS.map((_, i) => (i * 2 * Math.PI / n) - Math.PI / 2);

    // Grid circles
    const gridLines = [0.25, 0.5, 0.75, 1].map(f =>
      `<circle cx="${cx}" cy="${cy}" r="${r * f}" fill="none" stroke="#e0e0e0" stroke-width="0.8"/>`
    ).join('');

    // Axis lines
    const axisLines = angles.map(a =>
      `<line x1="${cx}" y1="${cy}"
             x2="${cx + r * Math.cos(a)}"
             y2="${cy + r * Math.sin(a)}"
             stroke="#e0e0e0" stroke-width="0.8"/>`
    ).join('');

    // Data polygon
    const pts = PILLARS.map((p, i) => {
      const pct = (pillarScores[p.key]?.pct || 0) / 100;
      return `${cx + r * pct * Math.cos(angles[i])},${cy + r * pct * Math.sin(angles[i])}`;
    }).join(' ');
    const poly = `<polygon points="${pts}" fill="rgba(24,95,165,0.15)" stroke="#185fa5" stroke-width="1.5"/>`;

    // Labels
    const labels = PILLARS.map((p, i) => {
      const lx = cx + (r + 14) * Math.cos(angles[i]);
      const ly = cy + (r + 14) * Math.sin(angles[i]);
      const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end';
      return `<text x="${lx}" y="${ly + 4}" text-anchor="${anchor}"
        font-size="9" font-family="Arial,sans-serif" fill="#444">${h(p.label)}</text>`;
    }).join('');

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${gridLines}${axisLines}${poly}${labels}
    </svg>`;
  }

  /* ── Fenêtre d'impression ─────────────────────────────── */

  function generate(pid) {
    const state = window.appState;
    if (!state) return;

    const d = gatherData(pid);

    // Demander un commentaire coach optionnel
    const coachComment = window.prompt(
      'Commentaire pour l\'entretien parent (optionnel — laissez vide pour ignorer) :', ''
    ) || '';

    const css = buildCSS(d.accent);
    const page1 = buildPage1Html(d, coachComment);
    const page2 = buildPage2Html(d);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Carte joueur — ${h(d.displayName)}</title>
<style>${css}</style>
</head>
<body>
<div class="pdf-page">${page1}</div>
<div class="pdf-page pdf-page-break">${page2}</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      window.appUtils?.showToast('Le navigateur a bloqué l\'ouverture — autorisez les popups');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  /* ── CSS de la carte ──────────────────────────────────── */

  function buildCSS(accent) {
    return `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f0f0;color:#222;font-size:12px}
.pdf-page{
  width:210mm;min-height:297mm;background:#fff;
  margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,0.12);
  display:flex;flex-direction:column;
  page-break-after:always
}
.pdf-page-break{page-break-before:always}
.pdf-header{color:#fff;padding:24px 28px;flex-shrink:0}
.pdf-header-content{display:flex;align-items:center;gap:20px}
.pdf-photo{
  width:80px;height:80px;border-radius:50%;object-fit:cover;
  border:3px solid rgba(255,255,255,0.6);flex-shrink:0
}
.pdf-photo-initials{
  display:flex;align-items:center;justify-content:center;
  font-size:26px;font-weight:700;border:3px solid rgba(255,255,255,0.5)
}
.pdf-header-info{flex:1}
.pdf-header-info h1{font-size:24px;font-weight:700;letter-spacing:-0.4px;margin-bottom:8px}
.pdf-tags{display:flex;flex-wrap:wrap;gap:6px}
.pdf-tags span{
  background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);
  padding:3px 10px;border-radius:999px;font-size:10px;font-weight:600
}
.pdf-score-badge{
  text-align:center;padding:14px 18px;border-radius:14px;
  min-width:90px;flex-shrink:0
}
.pdf-score-val{font-size:28px;font-weight:700;font-family:'Courier New',monospace}
.pdf-score-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px}
.pdf-body{flex:1;padding:20px 28px;display:flex;flex-direction:column;gap:16px}
.pdf-page2-body{padding-top:24px}
.pdf-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1}
.pdf-section h2{
  font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;
  color:${accent};border-bottom:2px solid ${accent}22;padding-bottom:5px;margin-bottom:10px
}
.pdf-radar-wrap{display:flex;justify-content:center;margin-bottom:10px}
.pdf-pillars{display:grid;gap:5px}
.pdf-pillar-row{display:flex;align-items:center;gap:8px;font-size:10px}
.pdf-pillar-name{min-width:70px;color:#555}
.pdf-bar-bg{flex:1;height:6px;background:#eee;border-radius:999px;overflow:hidden}
.pdf-bar-fill{height:100%;border-radius:999px}
.pdf-pillar-pct{font-weight:700;min-width:28px;text-align:right;font-size:10px}
.pdf-objs{display:grid;gap:6px}
.pdf-obj-row{
  display:flex;align-items:flex-start;gap:8px;padding:6px 10px;
  background:#f8f8f8;border-radius:8px;font-size:11px
}
.pdf-obj-num{
  width:18px;height:18px;border-radius:50%;background:${accent};color:#fff;
  display:flex;align-items:center;justify-content:center;
  font-size:9px;font-weight:700;flex-shrink:0
}
.pdf-comment{
  font-size:11px;line-height:1.5;color:#444;
  background:#f9f9f9;border-left:3px solid ${accent};padding:8px 10px;border-radius:4px
}
.pdf-table{width:100%;border-collapse:collapse;font-size:10px}
.pdf-table th{background:${accent};color:#fff;padding:5px 8px;text-align:left;font-weight:600}
.pdf-table td{padding:4px 8px;border-bottom:1px solid #eee}
.pdf-table tr:nth-child(even) td{background:#f9f9f9}
.pdf-score-row td{background:#f0f8ff!important;font-weight:700}
.pdf-footer{
  padding:14px 28px;border-top:2px solid ${accent}22;
  display:flex;align-items:center;justify-content:space-between;
  background:#fafafa;flex-shrink:0
}
.pdf-footer-logo{}
.pdf-logo-placeholder{
  font-size:11px;font-weight:700;color:${accent};text-align:center;
  border:1px solid ${accent}44;padding:6px 12px;border-radius:6px;line-height:1.4
}
.pdf-footer-meta{display:flex;flex-direction:column;gap:3px;text-align:right;font-size:10px;color:#888}
@media print{
  body{background:#fff}
  .pdf-page{box-shadow:none;margin:0}
}`;
  }

  /* ── Export public ───────────────────────────────────── */

  window.PDFModule = { generate };
})();

/**
 * pdf-report.js — Bilan PDF joueur (refonte 2026)
 *
 * 3 pages :
 *  - Page 1 : synthèse pour l'entretien (photo, score, radar, insights)
 *  - Page 2 : détail piliers + séances ateliers + observations match
 *  - Page 3 : contexte (disponibilité, assiduité, principes travaillés)
 *
 * Palette : vert Louverné + neutres chauds. Logos club Louverné + GJ LSCA
 * intégrés en header via base64 (pdf-logos.js).
 */
(function () {
  'use strict';

  const GREEN = '#009640';
  const GREEN_DARK = '#006e2f';
  const GREEN_SOFT = '#e8f5ec';
  const RED = '#dc2626';
  const AMBER = '#d97706';
  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BORDER = '#e5e7eb';
  const BG_SOFT = '#f8f8f4';

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Data gathering ─────────────────────────────────── */

  function gatherData(pid) {
    const state = window.appState;
    const cat = state.cat;
    const season = state.season;
    const pdata = state.data[cat]?.[pid] || {};
    const prof = pdata.profil || {};
    const seasonD = pdata[season] || {};
    const PILLARS = window.PILLARS?.[cat] || [];

    const pillarScores = {};
    PILLARS.forEach(p => {
      const avg = _pAvg(cat, pid, p.key, season);
      pillarScores[p.key] = { avg, pct: avg ? Math.round((avg / 4) * 100) : 0 };
    });

    const seances = (pdata.seances?.[season] || [null, null, null]).slice(0, 3);
    const observations = [...(pdata.observations?.[season] || [])]
      .sort((a, b) => new Date(b.date_match) - new Date(a.date_match));

    const score = _pScore(cat, pid, season);
    const level = _getLevel(score);
    const displayName = (prof.prenom && prof.nom) ? prof.prenom + ' ' + prof.nom : pid;

    // Détection strongest / weakest pilier
    const scoredPillars = PILLARS.map(p => ({ ...p, pct: pillarScores[p.key].pct }))
                                  .filter(p => p.pct > 0);
    const strongest = scoredPillars.sort((a, b) => b.pct - a.pct)[0];
    const weakest = [...scoredPillars].sort((a, b) => a.pct - b.pct)[0];

    return {
      pid, cat, season, prof, seasonD, pillarScores, seances, observations,
      score, level, displayName, PILLARS, strongest, weakest,
    };
  }

  function _pAvg(cat, pid, key, season) {
    const data = window.appState?.data[cat]?.[pid]?.[season];
    if (!data?.ratings?.[key]) return 0;
    const vals = data.ratings[key].filter(v => v != null && v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  function _pScore(cat, pid, season) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const WEIGHTS = window.WEIGHTS || {};
    let sum = 0, total = 0;
    PILLARS.forEach(p => {
      const avg = _pAvg(cat, pid, p.key, season);
      if (avg > 0) {
        const w = WEIGHTS[p.key] || 0.2;
        sum += (avg / 4 * 100) * w;
        total += w;
      }
    });
    return total ? Math.round(sum / total) : 0;
  }

  function _getLevel(score) {
    if (score >= 70) return 'Excellent';
    if (score >= 50) return 'Bon';
    if (score >= 35) return 'Moyen';
    if (score > 0)   return 'À travailler';
    return 'Non évalué';
  }

  /* ── Composants visuels ─────────────────────────────── */

  function logoHeader(subtitle, clubOrigine) {
    const logos = window.PDF_LOGOS || {};
    const clubs = window.CLUBS_ORIGINE || [];
    // Trouver le club d'origine du joueur, sinon fallback Louverné
    const club = clubs.find(c => c.key === clubOrigine) || clubs[0] || { label: 'Louverné Sports', logo: 'louverne' };
    const clubLogo = logos[club.logo];
    return `
      <div class="pdf-topbar">
        <div class="pdf-topbar-left">
          ${clubLogo ? `<img src="${clubLogo}" class="pdf-logo-lsp" alt="${h(club.label)}">` : ''}
          <div class="pdf-topbar-club">
            <div class="pdf-club-name">${h(club.label)}</div>
            <div class="pdf-club-sub">${h(subtitle || 'Groupement Jeunes LSCA')}</div>
          </div>
        </div>
        ${logos.gjLsca ? `<img src="${logos.gjLsca}" class="pdf-logo-gj" alt="GJ LSCA">` : ''}
      </div>`;
  }

  function pageFooter(page, total) {
    const educator = window.EducatorModule?.getEducatorName?.() || '—';
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `
      <footer class="pdf-footer">
        <span>Éducateur : <strong>${h(educator)}</strong></span>
        <span>Généré le ${today}</span>
        <span>Page ${page} / ${total}</span>
      </footer>`;
  }

  function scoreBadge(score) {
    const bg = score >= 70 ? '#dcfce7' : score >= 50 ? GREEN_SOFT : score >= 35 ? '#fef3c7' : '#fee2e2';
    const col = score >= 70 ? '#14532d' : score >= 50 ? GREEN_DARK : score >= 35 ? '#78350f' : '#7f1d1d';
    return `<div class="pdf-score-badge" style="background:${bg};color:${col}">
      <div class="pdf-score-val">${score || '—'}${score ? '%' : ''}</div>
      <div class="pdf-score-lbl">${h(_getLevel(score))}</div>
    </div>`;
  }

  function pillarBar(pillar, pct) {
    const col = pct >= 70 ? GREEN : pct >= 50 ? '#65a30d' : pct >= 35 ? AMBER : RED;
    return `<div class="pdf-pillar-row">
      <span class="pdf-pillar-name">${h(pillar.label)}</span>
      <div class="pdf-bar-bg">
        <div class="pdf-bar-fill" style="width:${pct}%;background:${col}"></div>
      </div>
      <span class="pdf-pillar-pct" style="color:${col}">${pct}%</span>
    </div>`;
  }

  /* ── Radar SVG ──────────────────────────────────────── */

  function buildRadarSvg(PILLARS, pillarScores, size) {
    size = size || 220;
    if (!PILLARS.length) return '';
    const cx = size / 2, cy = size / 2, r = size * 0.36;
    const n = PILLARS.length;
    const angles = PILLARS.map((_, i) => (i * 2 * Math.PI / n) - Math.PI / 2);

    const grid = [0.25, 0.5, 0.75, 1].map(f =>
      `<circle cx="${cx}" cy="${cy}" r="${r * f}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`
    ).join('');
    const axes = angles.map(a =>
      `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}"
             stroke="#e5e7eb" stroke-width="1"/>`
    ).join('');
    const pts = PILLARS.map((p, i) => {
      const pct = (pillarScores[p.key]?.pct || 0) / 100;
      return `${cx + r * pct * Math.cos(angles[i])},${cy + r * pct * Math.sin(angles[i])}`;
    }).join(' ');
    const poly = `<polygon points="${pts}" fill="rgba(0,150,64,0.18)" stroke="${GREEN}" stroke-width="2"/>`;
    const dots = PILLARS.map((p, i) => {
      const pct = (pillarScores[p.key]?.pct || 0) / 100;
      const x = cx + r * pct * Math.cos(angles[i]);
      const y = cy + r * pct * Math.sin(angles[i]);
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="${GREEN}"/>`;
    }).join('');
    const labels = PILLARS.map((p, i) => {
      const lx = cx + (r + 18) * Math.cos(angles[i]);
      const ly = cy + (r + 18) * Math.sin(angles[i]);
      const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx > cx ? 'start' : 'end';
      const pct = pillarScores[p.key]?.pct || 0;
      return `<text x="${lx}" y="${ly + 3}" text-anchor="${anchor}"
        font-size="11" font-weight="600" fill="${TEXT}" font-family="Arial">${h(p.label)}</text>
        <text x="${lx}" y="${ly + 15}" text-anchor="${anchor}"
        font-size="10" fill="${MUTED}" font-family="Arial">${pct}%</text>`;
    }).join('');

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${grid}${axes}${poly}${dots}${labels}
    </svg>`;
  }

  /* ── Page 1 : Vue synthèse entretien ────────────────── */

  function buildPage1Html(d, coachComment) {
    const { prof, score, level, displayName, PILLARS, pillarScores, season, cat, strongest, weakest, seasonD } = d;
    const catLabels = window.CAT_LABELS || {};
    const age = prof.naissance ? Math.floor((new Date() - new Date(prof.naissance)) / 31557600000) : null;

    const photoHtml = prof.photo
      ? `<img src="${prof.photo}" class="pdf-photo" alt="${h(displayName)}">`
      : `<div class="pdf-photo pdf-photo-initials">
           ${h(displayName.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2))}
         </div>`;

    const radarSvg = buildRadarSvg(PILLARS, pillarScores, 240);
    const objectives = (prof.objectifs || []).filter(Boolean).slice(0, 4);

    return `
      ${logoHeader('Bilan individuel — Saison ' + season, prof.club_origine)}

      <div class="pdf-page1-hero">
        ${photoHtml}
        <div class="pdf-page1-hero-info">
          <h1>${h(displayName)}</h1>
          <div class="pdf-page1-tags">
            <span class="pdf-tag pdf-tag-primary">${h(catLabels[cat] || cat.toUpperCase())}</span>
            ${prof.poste1 ? `<span class="pdf-tag">${h(prof.poste1)}</span>` : ''}
            ${prof.pied   ? `<span class="pdf-tag">Pied ${h(prof.pied)}</span>` : ''}
            ${age         ? `<span class="pdf-tag">${age} ans</span>` : ''}
          </div>
        </div>
        ${scoreBadge(score)}
      </div>

      <div class="pdf-page1-body">
        <section class="pdf-radar-section">
          <div class="pdf-section-label">Profil global</div>
          <div class="pdf-radar-wrap">${radarSvg}</div>
        </section>

        <section class="pdf-highlights">
          <div class="pdf-highlight pdf-highlight-good">
            <div class="pdf-highlight-icon">↑</div>
            <div class="pdf-highlight-content">
              <div class="pdf-highlight-label">Point fort</div>
              <div class="pdf-highlight-value">${strongest ? h(strongest.label) + ' <strong>(' + strongest.pct + '%)</strong>' : '—'}</div>
            </div>
          </div>
          <div class="pdf-highlight pdf-highlight-focus">
            <div class="pdf-highlight-icon">→</div>
            <div class="pdf-highlight-content">
              <div class="pdf-highlight-label">À développer</div>
              <div class="pdf-highlight-value">${weakest ? h(weakest.label) + ' <strong>(' + weakest.pct + '%)</strong>' : '—'}</div>
            </div>
          </div>
        </section>

        ${objectives.length ? `
          <section class="pdf-objectives-section">
            <div class="pdf-section-label">Objectifs de la saison</div>
            <ol class="pdf-objectives-list">
              ${objectives.map(o => `<li>${h(o)}</li>`).join('')}
            </ol>
          </section>
        ` : ''}

        ${seasonD.comments?.main ? `
          <section class="pdf-coach-comment">
            <div class="pdf-section-label">Commentaire entraîneur</div>
            <blockquote>${h(seasonD.comments.main)}</blockquote>
          </section>
        ` : ''}

        ${coachComment ? `
          <section class="pdf-entretien-note">
            <div class="pdf-section-label pdf-section-label-accent">📝 À aborder pendant l'entretien</div>
            <div class="pdf-entretien-content">${h(coachComment)}</div>
          </section>
        ` : ''}
      </div>

      ${pageFooter(1, 3)}
    `;
  }

  /* ── Page 2 : Détail piliers + performance terrain ── */

  function buildPage2Html(d) {
    const { PILLARS, pillarScores, seances, observations, cat, season } = d;
    const ATELIERS = window.SeanceModule?.ATELIERS || [];
    const SLOT_LABELS = window.SeanceModule?.SLOT_LABELS || ['S1', 'S2', 'S3'];

    // Piliers
    const pillarBars = PILLARS.map(p => pillarBar(p, pillarScores[p.key].pct)).join('');

    // Séances ateliers
    let seanceHtml = '';
    if (ATELIERS.length && seances.some(s => s)) {
      seanceHtml = `
        <table class="pdf-table pdf-table-compact">
          <thead>
            <tr>
              <th>Atelier</th>
              ${SLOT_LABELS.map(l => `<th>${h(l)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${ATELIERS.slice(0, 8).map(a => {
              const cells = seances.map(s => {
                const v = s?.[a.key];
                if (v == null || v === '') return '<td class="pdf-td-muted">—</td>';
                return `<td>${h(v)}${a.unit ? ' <span class="pdf-td-unit">' + a.unit + '</span>' : ''}</td>`;
              }).join('');
              return `<tr><td class="pdf-td-name">${h(a.label)}</td>${cells}</tr>`;
            }).join('')}
          </tbody>
        </table>`;
    } else {
      seanceHtml = '<div class="pdf-muted">Aucune séance d\'atelier saisie cette saison.</div>';
    }

    // Observations match
    let obsHtml = '';
    if (observations.length) {
      const recent = observations.slice(0, 5);
      obsHtml = `
        <table class="pdf-table pdf-table-compact">
          <thead>
            <tr>
              <th>Date</th><th>Adversaire</th><th>Score</th><th>Note</th><th>Résumé</th>
            </tr>
          </thead>
          <tbody>
            ${recent.map(o => {
              const dt = o.date_match ? new Date(o.date_match).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) : '—';
              const notes = (o.notes_libres || o.commentaire || '').slice(0, 80);
              return `<tr>
                <td>${h(dt)}</td>
                <td>${h(o.adversaire || '—')}</td>
                <td>${h(o.score_match || '—')}</td>
                <td><strong>${o.note_match ?? '—'}</strong></td>
                <td class="pdf-td-note">${h(notes)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      if (observations.length > 5) {
        obsHtml += `<div class="pdf-muted-small">+ ${observations.length - 5} autre${observations.length - 5 > 1 ? 's' : ''} observation${observations.length - 5 > 1 ? 's' : ''} sur la saison</div>`;
      }
    } else {
      obsHtml = '<div class="pdf-muted">Aucune observation de match enregistrée.</div>';
    }

    return `
      ${logoHeader('Détail de l\'évaluation', d.prof.club_origine)}

      <section class="pdf-section">
        <h2 class="pdf-h2">Détail par pilier</h2>
        <div class="pdf-pillars-list">${pillarBars}</div>
      </section>

      <section class="pdf-section">
        <h2 class="pdf-h2">Ateliers physico-techniques</h2>
        ${seanceHtml}
      </section>

      <section class="pdf-section">
        <h2 class="pdf-h2">Observations match — Saison ${h(season)}</h2>
        ${obsHtml}
      </section>

      ${pageFooter(2, 3)}
    `;
  }

  /* ── Page 3 : Contexte (dispo / présence / principes) ── */

  function buildPage3Html(d) {
    const { pid, cat, season } = d;

    // Disponibilité (blessures)
    let injHtml = '';
    const inj = window.InjuryModule;
    if (inj) {
      const cur = inj.currentStatus?.(pid, cat);
      const history = (inj.list?.(pid, cat) || []).filter(e => e !== cur);
      if (cur) {
        const days = inj.daysOff?.(cur);
        injHtml = `<div class="pdf-status pdf-status-warn">
          ⚠ Indisponible — ${h(cur.type || 'blessure')} ${days ? '(depuis ' + days + ' j)' : ''}
          ${cur.note ? '<div class="pdf-status-note">' + h(cur.note) + '</div>' : ''}
        </div>`;
      } else {
        injHtml = `<div class="pdf-status pdf-status-ok">✓ Disponible</div>`;
      }
      if (history.length) {
        injHtml += `<div class="pdf-status-hist-label">Historique récent :</div>
          <ul class="pdf-status-hist">${history.slice(0, 4).map(e => {
            const dur = inj.daysOff?.(e);
            return `<li>${h(e.type || 'Indispo')}${e.start ? ' — ' + h(e.start) : ''}${dur ? ' (' + dur + ' j)' : ''}</li>`;
          }).join('')}</ul>`;
      }
    }

    // Assiduité
    let attHtml = '';
    const att = window.AttendanceModule;
    if (att) {
      const tr = att.rate?.(pid, { type: 'training' });
      const mt = att.rate?.(pid, { type: 'match' });
      const all = att.rate?.(pid);
      const total = (att.list?.(pid) || []).length;
      attHtml = `<div class="pdf-att-grid">
        <div class="pdf-att-cell"><div class="pdf-att-val">${all != null ? all + '%' : '—'}</div><div class="pdf-att-lbl">Global</div></div>
        <div class="pdf-att-cell"><div class="pdf-att-val">${tr != null ? tr + '%' : '—'}</div><div class="pdf-att-lbl">Entraînements</div></div>
        <div class="pdf-att-cell"><div class="pdf-att-val">${mt != null ? mt + '%' : '—'}</div><div class="pdf-att-lbl">Matchs</div></div>
        <div class="pdf-att-cell"><div class="pdf-att-val">${total}</div><div class="pdf-att-lbl">Pointages</div></div>
      </div>`;
    }

    // Profils détectés
    let profHtml = '';
    const pm = window.ProfilingModule;
    if (pm?.detect) {
      const tags = pm.detect(pid, cat, season) || [];
      if (tags.length) {
        profHtml = `<div class="pdf-profile-tags">${tags.slice(0, 4).map(t => {
          const p = pm.PROFILES?.[t.key] || pm.PROFILES?.find?.(x => x.key === t.key);
          const label = p?.label || t.key;
          return `<div class="pdf-profile-tag"><strong>${h(label)}</strong>${t.reason ? '<div class="pdf-profile-reason">' + h(t.reason) + '</div>' : ''}</div>`;
        }).join('')}</div>`;
      } else {
        profHtml = '<div class="pdf-muted-small">Aucun profil distinctif pour le moment.</div>';
      }
    }

    // Principes de jeu travaillés
    let principlesHtml = '';
    const wf = window.WeeklyFocusModule;
    if (wf) {
      try {
        const store = JSON.parse(localStorage.getItem('cfb6_weekly_focus_v1') || '{}');
        const weeks = store[cat] || {};
        const stats = {};
        Object.keys(weeks).sort().forEach(iso => {
          const w = weeks[iso];
          (w.items || []).forEach(it => {
            if (!it.principleNum) return;
            const v = w.ratings?.[pid]?.[it.id];
            if (v == null) return;
            const k = it.principleNum;
            if (!stats[k]) stats[k] = { num: k, label: it.criterion, values: [], weeks: 0 };
            stats[k].values.push((v / (it.scale || 5)) * 100);
            stats[k].weeks++;
          });
        });
        const arr = Object.values(stats).sort((a, b) => b.weeks - a.weeks).slice(0, 5);
        if (arr.length) {
          principlesHtml = `<ul class="pdf-principles-mini">
            ${arr.map(s => {
              const avg = Math.round(s.values.reduce((a, b) => a + b, 0) / s.values.length);
              const col = avg >= 70 ? GREEN : avg >= 45 ? AMBER : RED;
              return `<li>
                <span class="pdf-principle-num">#${s.num}</span>
                <span class="pdf-principle-label">${h(s.label)}</span>
                <span class="pdf-principle-avg" style="color:${col}">${avg}%</span>
                <span class="pdf-principle-weeks">${s.weeks} sem.</span>
              </li>`;
            }).join('')}
          </ul>`;
        } else {
          principlesHtml = '<div class="pdf-muted-small">Aucun principe évalué pour ce joueur cette saison.</div>';
        }
      } catch (e) { principlesHtml = '<div class="pdf-muted-small">Données non disponibles.</div>'; }
    }

    return `
      ${logoHeader('Contexte & suivi transverse', d.prof.club_origine)}

      <div class="pdf-page3-grid">
        <section class="pdf-section">
          <h2 class="pdf-h2">🩹 Disponibilité</h2>
          ${injHtml || '<div class="pdf-muted-small">Module non chargé.</div>'}
        </section>

        <section class="pdf-section">
          <h2 class="pdf-h2">📅 Assiduité</h2>
          ${attHtml || '<div class="pdf-muted-small">Module non chargé.</div>'}
        </section>

        <section class="pdf-section">
          <h2 class="pdf-h2">🏷 Profils détectés</h2>
          ${profHtml || '<div class="pdf-muted-small">—</div>'}
        </section>

        <section class="pdf-section pdf-section-wide">
          <h2 class="pdf-h2">⚽ Principes de jeu travaillés</h2>
          ${principlesHtml}
        </section>
      </div>

      ${pageFooter(3, 3)}
    `;
  }

  /* ── CSS ────────────────────────────────────────────── */

  function buildCSS() {
    return `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
  background: #ececec;
  color: ${TEXT};
  font-size: 12px;
}
.pdf-page {
  width: 210mm; min-height: 297mm; background: #fff;
  margin: 12px auto; box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  padding: 22mm 20mm 15mm; page-break-after: always;
  display: flex; flex-direction: column;
}
.pdf-page-break { page-break-before: always; }

/* Topbar avec logos */
.pdf-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px; border-bottom: 3px solid ${GREEN};
  margin-bottom: 20px;
}
.pdf-topbar-left { display: flex; align-items: center; gap: 12px; }
.pdf-logo-lsp { height: 48px; width: auto; }
.pdf-logo-gj { height: 52px; width: auto; }
.pdf-topbar-club { display: flex; flex-direction: column; }
.pdf-club-name { font-size: 15px; font-weight: 700; color: ${TEXT}; line-height: 1.1; }
.pdf-club-sub { font-size: 10px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

/* Footer */
.pdf-footer {
  margin-top: auto;
  border-top: 1px solid ${BORDER}; padding-top: 8px;
  display: flex; justify-content: space-between; font-size: 10px; color: ${MUTED};
}
.pdf-footer strong { color: ${TEXT}; }

/* Page 1 - Hero */
.pdf-page1-hero {
  display: flex; align-items: center; gap: 18px;
  padding: 16px 20px; background: ${GREEN_SOFT};
  border-radius: 12px; margin-bottom: 20px;
}
.pdf-photo {
  width: 90px; height: 90px; border-radius: 50%; object-fit: cover;
  border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); flex-shrink: 0;
}
.pdf-photo-initials {
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 700; color: ${GREEN_DARK}; background: #fff;
}
.pdf-page1-hero-info { flex: 1; min-width: 0; }
.pdf-page1-hero-info h1 {
  font-size: 26px; font-weight: 700; color: ${TEXT}; letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.pdf-page1-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.pdf-tag {
  background: #fff; color: ${MUTED}; font-size: 11px; padding: 3px 10px;
  border-radius: 999px; font-weight: 500; border: 1px solid ${BORDER};
}
.pdf-tag-primary { background: ${GREEN}; color: #fff; border-color: ${GREEN}; }

.pdf-score-badge {
  border-radius: 12px; padding: 12px 18px; text-align: center; min-width: 100px;
  flex-shrink: 0;
}
.pdf-score-val { font-size: 32px; font-weight: 700; line-height: 1; letter-spacing: -0.02em; }
.pdf-score-lbl { font-size: 11px; font-weight: 600; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

/* Page 1 - Body */
.pdf-page1-body { display: flex; flex-direction: column; gap: 16px; }
.pdf-section-label {
  font-size: 10px; font-weight: 700; color: ${MUTED};
  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
}
.pdf-section-label-accent { color: ${GREEN_DARK}; }

.pdf-radar-section {
  background: #fff; border: 1px solid ${BORDER}; border-radius: 12px;
  padding: 14px 18px; text-align: center;
}
.pdf-radar-wrap { display: flex; justify-content: center; }

.pdf-highlights { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pdf-highlight {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 10px; background: ${BG_SOFT};
  border-left: 4px solid ${GREEN};
}
.pdf-highlight-focus { border-left-color: ${AMBER}; }
.pdf-highlight-icon {
  font-size: 20px; font-weight: 700; color: ${GREEN};
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  background: #fff; border-radius: 50%; flex-shrink: 0;
}
.pdf-highlight-focus .pdf-highlight-icon { color: ${AMBER}; }
.pdf-highlight-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${MUTED}; font-weight: 600; }
.pdf-highlight-value { font-size: 14px; color: ${TEXT}; margin-top: 2px; }
.pdf-highlight-value strong { color: ${GREEN}; }
.pdf-highlight-focus .pdf-highlight-value strong { color: ${AMBER}; }

.pdf-objectives-section, .pdf-coach-comment, .pdf-entretien-note {
  background: ${BG_SOFT}; border-radius: 10px; padding: 12px 16px;
}
.pdf-objectives-list { padding-left: 24px; }
.pdf-objectives-list li { margin: 4px 0; color: ${TEXT}; font-size: 12px; }
.pdf-coach-comment blockquote {
  font-style: italic; color: ${TEXT}; font-size: 12px;
  padding-left: 12px; border-left: 3px solid ${GREEN};
}
.pdf-entretien-note {
  background: #fefce8; border: 1px solid #fde68a;
}
.pdf-entretien-content { font-size: 12px; color: ${TEXT}; line-height: 1.5; }

/* Page 2 */
.pdf-section { margin-bottom: 16px; }
.pdf-h2 {
  font-size: 14px; font-weight: 700; color: ${GREEN_DARK};
  margin-bottom: 10px; padding-bottom: 4px; border-bottom: 2px solid ${GREEN_SOFT};
}
.pdf-pillars-list { display: flex; flex-direction: column; gap: 8px; }
.pdf-pillar-row { display: flex; align-items: center; gap: 12px; }
.pdf-pillar-name { flex: 0 0 120px; font-size: 12px; font-weight: 500; color: ${TEXT}; }
.pdf-bar-bg { flex: 1; height: 10px; background: #f3f4f6; border-radius: 5px; overflow: hidden; }
.pdf-bar-fill { height: 100%; border-radius: 5px; transition: width 0.3s; }
.pdf-pillar-pct { flex: 0 0 40px; text-align: right; font-weight: 700; font-size: 12px; }

.pdf-table {
  width: 100%; border-collapse: collapse; font-size: 11px;
  background: #fff; border-radius: 8px; overflow: hidden;
}
.pdf-table th {
  background: ${GREEN_SOFT}; color: ${GREEN_DARK}; padding: 8px 10px;
  text-align: left; font-weight: 700; font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pdf-table td { padding: 7px 10px; border-bottom: 1px solid ${BORDER}; }
.pdf-table tr:last-child td { border-bottom: none; }
.pdf-table-compact th, .pdf-table-compact td { padding: 6px 10px; }
.pdf-td-name { font-weight: 500; }
.pdf-td-muted { color: ${MUTED}; }
.pdf-td-unit { color: ${MUTED}; font-weight: 400; font-size: 10px; }
.pdf-td-note { color: ${MUTED}; font-style: italic; }

.pdf-muted { color: ${MUTED}; font-style: italic; font-size: 12px; text-align: center; padding: 16px; }
.pdf-muted-small { color: ${MUTED}; font-size: 11px; padding: 8px 0; }

/* Page 3 */
.pdf-page3-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
}
.pdf-page3-grid .pdf-section {
  background: #fff; border: 1px solid ${BORDER}; border-radius: 10px;
  padding: 12px 14px; margin-bottom: 0;
}
.pdf-page3-grid .pdf-section-wide { grid-column: 1 / -1; }

.pdf-status {
  padding: 10px 12px; border-radius: 8px; font-size: 12px; font-weight: 500;
}
.pdf-status-ok { background: ${GREEN_SOFT}; color: ${GREEN_DARK}; border-left: 3px solid ${GREEN}; }
.pdf-status-warn { background: #fef3c7; color: #92400e; border-left: 3px solid ${AMBER}; }
.pdf-status-note { font-weight: 400; font-style: italic; margin-top: 4px; font-size: 11px; }
.pdf-status-hist-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${MUTED}; margin: 8px 0 4px; }
.pdf-status-hist { list-style: none; padding-left: 0; font-size: 11px; }
.pdf-status-hist li { padding: 3px 0; border-bottom: 1px dashed ${BORDER}; }
.pdf-status-hist li:last-child { border: none; }

.pdf-att-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.pdf-att-cell {
  background: ${BG_SOFT}; border-radius: 8px; padding: 10px 8px; text-align: center;
}
.pdf-att-val { font-size: 22px; font-weight: 700; color: ${GREEN_DARK}; line-height: 1; }
.pdf-att-lbl { font-size: 9px; text-transform: uppercase; color: ${MUTED}; margin-top: 4px; font-weight: 600; letter-spacing: 0.05em; }

.pdf-profile-tags { display: flex; flex-direction: column; gap: 5px; }
.pdf-profile-tag {
  background: ${GREEN_SOFT}; border-left: 3px solid ${GREEN};
  padding: 6px 10px; border-radius: 6px; font-size: 12px;
}
.pdf-profile-reason { color: ${MUTED}; font-style: italic; font-size: 10px; margin-top: 2px; }

.pdf-principles-mini { list-style: none; padding: 0; }
.pdf-principles-mini li {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  border-bottom: 1px solid ${BORDER}; font-size: 11px;
}
.pdf-principles-mini li:last-child { border: none; }
.pdf-principle-num {
  background: ${GREEN}; color: #fff; padding: 2px 7px; border-radius: 999px;
  font-weight: 700; font-size: 10px; flex-shrink: 0;
}
.pdf-principle-label { flex: 1; color: ${TEXT}; }
.pdf-principle-avg { font-weight: 700; }
.pdf-principle-weeks { font-size: 10px; color: ${MUTED}; flex-shrink: 0; }

@media print {
  body { background: #fff; }
  .pdf-page { margin: 0; box-shadow: none; }
}`;
  }

  /* ── Génération ─────────────────────────────────────── */

  function generate(pid) {
    const state = window.appState;
    if (!state) return;
    const d = gatherData(pid);
    const coachComment = window.prompt(
      'Message à afficher pour l\'entretien parent (optionnel) :', ''
    ) || '';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bilan — ${h(d.displayName)}</title>
<style>${buildCSS()}</style>
</head>
<body>
<div class="pdf-page">${buildPage1Html(d, coachComment)}</div>
<div class="pdf-page pdf-page-break">${buildPage2Html(d)}</div>
<div class="pdf-page pdf-page-break">${buildPage3Html(d)}</div>
<script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      window.appUtils?.showToast('Le navigateur a bloqué l\'ouverture — autorise les popups');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  window.PDFModule = { generate };
})();

/**
 * pre-seance.js — Fiche pré-séance imprimable (préparation avant terrain)
 *
 * Modal "Préparer la séance" qui laisse l'éducateur :
 *   - Choisir le nombre de groupes (2 / 3 / 4)
 *   - Répartir les joueurs présents (manuel ou auto : aléatoire / par équipe)
 *   - Attribuer une couleur de chasuble à chaque joueur (vert / orange / jaune / bleu)
 *   - Saisir le contenu de la séance (texte libre + import Word .docx via mammoth)
 *   - Générer un PDF 1 page à imprimer ou consulter sur téléphone
 *
 * Stockage : draft en session (pas persisté) — le PDF est le livrable final.
 * Expose : window.PreSeanceModule.{ open, handleAction }
 */
(function () {
  'use strict';

  const CHASUBLE_COLORS = [
    { key: 'vert',    label: 'Vert',   bg: '#009640', text: '#fff' },
    { key: 'orange',  label: 'Orange', bg: '#f97316', text: '#fff' },
    { key: 'jaune',   label: 'Jaune',  bg: '#eab308', text: '#0f172a' },
    { key: 'bleu',    label: 'Bleu',   bg: '#2563eb', text: '#fff' },
  ];

  let draft = null; // { nbGroupes, groupes: [ [{pid, color}] ], contenu, contenuHtml }

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function toast(m) { utils().showToast?.(m); }

  function sortedPlayers(cat) {
    cat = cat || state().cat;
    const players = state().data?.[cat] || {};
    return Object.keys(players)
      .filter(pid => players[pid]?.profil || players[pid]?.juggleLog)
      .sort((a, b) => playerLabel(a, cat).localeCompare(playerLabel(b, cat), 'fr'));
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

  function playerTeam(pid, cat) {
    cat = cat || state().cat;
    const prof = state().data?.[cat]?.[pid]?.profil;
    return prof?.team || '';
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function thisMondayIso() {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  /* ── Ouverture / initialisation ─────────────────────── */

  function open() {
    const cat = state().cat;
    const week = window.WeeklyFocusModule?.getCurrentWeek?.(cat);
    const items = (week?.items || []);

    // Présents par défaut : ceux de la séance Mode Terrain du jour, sinon tous les joueurs
    let presentPids = [];
    try {
      const live = JSON.parse(localStorage.getItem('cfb6_live_sessions_v1') || '{}');
      const s = live[cat]?.[todayIso()];
      if (s?.presentPids?.length) presentPids = s.presentPids.slice();
    } catch {}
    if (!presentPids.length) presentPids = sortedPlayers(cat);

    draft = {
      cat,
      date: todayIso(),
      theme: week?.theme || '',
      principes: items,
      presentPids,
      nbGroupes: 3,
      groupes: [[], [], []],   // chaque groupe = liste de { pid, color }
      unassigned: presentPids.slice().map(pid => ({ pid, color: 'vert' })),
      contenu: '',
      contenuHtml: '',
      contenuFile: '',
    };

    renderEditor();
  }

  function close() {
    draft = null;
    const root = document.querySelector('#pre-seance-root');
    if (root) root.innerHTML = '';
  }

  /* ── Répartitions automatiques ──────────────────────── */

  function applyRepartition(kind) {
    if (!draft) return;
    const groupes = Array.from({ length: draft.nbGroupes }, () => []);
    const pool = draft.presentPids.slice();

    if (kind === 'aleatoire') {
      // Shuffle Fisher-Yates
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.forEach((pid, i) => {
        const color = i % 2 === 0 ? 'vert' : 'orange';
        groupes[i % draft.nbGroupes].push({ pid, color });
      });
    } else if (kind === 'equipe') {
      // Regrouper par équipe principale
      const byTeam = {};
      pool.forEach(pid => {
        const t = playerTeam(pid, draft.cat) || '—';
        if (!byTeam[t]) byTeam[t] = [];
        byTeam[t].push(pid);
      });
      const teams = Object.keys(byTeam);
      teams.slice(0, draft.nbGroupes).forEach((t, i) => {
        byTeam[t].forEach((pid, j) => {
          const color = j % 2 === 0 ? 'vert' : 'orange';
          groupes[i].push({ pid, color });
        });
      });
      // Overflow : les équipes en trop sont réparties round-robin
      teams.slice(draft.nbGroupes).forEach((t, idx) => {
        byTeam[t].forEach((pid, j) => {
          const groupIdx = (draft.nbGroupes - 1 + idx + j) % draft.nbGroupes;
          groupes[groupIdx].push({ pid, color: j % 2 === 0 ? 'vert' : 'orange' });
        });
      });
    }

    draft.groupes = groupes;
    // Recalcule unassigned
    const assigned = new Set(groupes.flat().map(x => x.pid));
    draft.unassigned = draft.presentPids.filter(pid => !assigned.has(pid)).map(pid => ({ pid, color: 'vert' }));
    renderEditor();
  }

  function setNbGroupes(n) {
    if (!draft) return;
    const old = draft.groupes || [];
    const newGroupes = Array.from({ length: n }, (_, i) => old[i] || []);
    // Les joueurs des anciens groupes en trop passent dans unassigned
    const overflow = old.slice(n).flat();
    draft.nbGroupes = n;
    draft.groupes = newGroupes;
    draft.unassigned = (draft.unassigned || []).concat(overflow);
    renderEditor();
  }

  function movePlayer(pid, fromGroup, toGroup) {
    if (!draft) return;
    const source = fromGroup === -1 ? draft.unassigned : draft.groupes[fromGroup];
    const target = toGroup   === -1 ? draft.unassigned : draft.groupes[toGroup];
    if (!source || !target) return;
    const idx = source.findIndex(x => x.pid === pid);
    if (idx < 0) return;
    const [entry] = source.splice(idx, 1);
    target.push(entry);
    renderEditor();
  }

  function cyclePlayerColor(pid) {
    if (!draft) return;
    const all = [draft.unassigned, ...draft.groupes];
    for (const list of all) {
      const p = list.find(x => x.pid === pid);
      if (p) {
        const idx = CHASUBLE_COLORS.findIndex(c => c.key === p.color);
        p.color = CHASUBLE_COLORS[(idx + 1) % CHASUBLE_COLORS.length].key;
        renderEditor();
        return;
      }
    }
  }

  /* ── Contenu séance (texte + import Word) ───────────── */

  function setContenu(txt) {
    if (!draft) return;
    draft.contenu = txt || '';
    draft.contenuHtml = ''; // texte manuel prime sur HTML importé
  }

  async function importImage(file) {
    if (!file || !draft) return;
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
      toast('Format non supporté — utilise une image (PNG/JPG)');
      return;
    }
    draft.contenuFile = file.name;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      draft.contenuHtml = `<div class="ps-pdf-content-image"><img src="${dataUrl}" alt="Séance"></div>`;
      draft.contenu = '';
      toast('Image importée (' + file.name + ')');
      renderEditor();
    } catch (e) {
      toast('Import impossible : ' + e.message);
    }
  }

  /* ── Rendu éditeur (modal) ──────────────────────────── */

  function renderEditor() {
    let root = document.querySelector('#pre-seance-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pre-seance-root';
      document.body.appendChild(root);
    }
    if (!draft) { root.innerHTML = ''; return; }

    const cat = draft.cat;
    const catLbl = (window.CAT_LABELS?.[cat] || cat).toUpperCase();

    const groupCards = draft.groupes.map((list, gi) => `
      <article class="ps-group-card">
        <header class="ps-group-head">
          <strong>Groupe ${gi + 1}</strong>
          <span class="ps-group-count">${list.length} joueur${list.length > 1 ? 's' : ''}</span>
        </header>
        <div class="ps-group-list">
          ${list.map(p => renderPlayerChip(p, gi)).join('') || '<div class="ps-empty">Aucun joueur</div>'}
        </div>
        <select class="ps-move-select" data-pre-action="assign-to" data-group="${gi}">
          <option value="">+ Ajouter un joueur…</option>
          ${draft.unassigned.map(p => `<option value="${h(p.pid)}">${h(playerLabel(p.pid, cat))}</option>`).join('')}
        </select>
      </article>
    `).join('');

    root.innerHTML = `
      <div class="modal-overlay" data-pre-action="close-if-backdrop">
        <div class="modal-box modal-box--xl ps-box">
          <div class="modal-head">
            <div>
              <div class="card-kicker">Préparation ${h(catLbl)}</div>
              <h3>🖨 Fiche pré-séance — ${h(draft.date)}</h3>
            </div>
            <button class="modal-close" type="button" data-pre-action="close">×</button>
          </div>

          <div class="ps-scroll">
          <div class="ps-editor-grid">

            <section class="ps-panel">
              <h4>Configuration</h4>
              <div class="ps-row">
                <label class="ps-label">Nombre de groupes</label>
                <div class="ps-btn-group">
                  ${[2,3,4].map(n => `
                    <button class="ps-btn ${draft.nbGroupes === n ? 'on' : ''}"
                            type="button" data-pre-action="set-nb" data-n="${n}">${n}</button>
                  `).join('')}
                </div>
              </div>
              <div class="ps-row">
                <label class="ps-label">Répartition de départ</label>
                <div class="ps-btn-group">
                  <button class="ps-btn" type="button" data-pre-action="repartition" data-kind="reset">Vider</button>
                  <button class="ps-btn" type="button" data-pre-action="repartition" data-kind="aleatoire">🎲 Aléatoire</button>
                  <button class="ps-btn" type="button" data-pre-action="repartition" data-kind="equipe">👥 Par équipe</button>
                </div>
              </div>
              <p class="ps-hint">Clique le nom d'un joueur pour changer sa couleur de chasuble. Utilise les selects pour déplacer entre groupes.</p>
            </section>

            <section class="ps-panel">
              <h4>Contenu de la séance</h4>
              <div class="ps-content-actions">
                <label class="ps-file-btn">
                  📸 Importer une image de séance
                  <input type="file" accept="image/*" hidden data-pre-action="import-image">
                </label>
                ${draft.contenuFile ? `<span class="ps-file-info">🖼 ${h(draft.contenuFile)}</span>` : ''}
              </div>
              <p class="ps-hint">
                💡 <strong>Astuce Word → image</strong> : dans Word, sélectionne ton contenu → Ctrl+C → colle dans Paint (Ctrl+V) → sauve en PNG. Ou fais une capture d'écran directement (Outil Capture Windows / Cmd+Shift+4 Mac).
              </p>
              ${draft.contenuHtml ? `
                <div class="ps-content-preview" title="Contenu importé (aperçu)">
                  <div class="ps-content-preview-inner">${draft.contenuHtml}</div>
                  <p class="ps-hint">Contenu importé du fichier. Il apparaîtra tel quel dans le PDF.</p>
                </div>
              ` : `
                <textarea class="ps-textarea" rows="8"
                          placeholder="Notes / plan de séance / consignes... (ou importe un fichier Word au-dessus)"
                          data-pre-action="set-contenu">${h(draft.contenu)}</textarea>
              `}
            </section>

          </div>

          <section class="ps-groups-section">
            <h4>Groupes (${draft.nbGroupes})</h4>
            ${draft.unassigned.length ? `
              <div class="ps-unassigned">
                <strong>Non affectés (${draft.unassigned.length})</strong> :
                ${draft.unassigned.map(p => renderPlayerChip(p, -1)).join('')}
              </div>` : '<div class="ps-unassigned-empty">✓ Tous les présents sont affectés</div>'}
            <div class="ps-groups-grid">${groupCards}</div>
          </section>
          </div><!-- /.ps-scroll -->

          <div class="modal-footer ps-footer" style="justify-content:space-between">
            <span class="ps-info">${draft.presentPids.length} présent${draft.presentPids.length > 1 ? 's' : ''} · ${draft.principes.length} principe${draft.principes.length > 1 ? 's' : ''} FFF</span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" type="button" data-pre-action="close">Annuler</button>
              <button class="btn btn-primary" type="button" data-pre-action="print">🖨 Générer le PDF</button>
            </div>
          </div>

        </div>
      </div>`;
  }

  function renderPlayerChip(entry, groupIdx) {
    const c = CHASUBLE_COLORS.find(x => x.key === entry.color) || CHASUBLE_COLORS[0];
    return `<button class="ps-chip" type="button"
              data-pre-action="cycle-color" data-pid="${h(entry.pid)}"
              style="background:${c.bg};color:${c.text}">
      ${h(playerLabel(entry.pid, draft.cat))}
      <span class="ps-chip-move">
        <select data-pre-action="move-to" data-pid="${h(entry.pid)}" data-from="${groupIdx}" onclick="event.stopPropagation()">
          <option value="">↔</option>
          <option value="-1" ${groupIdx === -1 ? 'disabled' : ''}>Non affecté</option>
          ${draft.groupes.map((_, i) => `<option value="${i}" ${i === groupIdx ? 'disabled' : ''}>Groupe ${i + 1}</option>`).join('')}
        </select>
      </span>
    </button>`;
  }

  /* ── Actions ────────────────────────────────────────── */

  function handleAction(el, e) {
    if (!draft && el.dataset.preAction !== 'open') return false;
    const a = el.dataset.preAction;
    if (!a) return false;

    if (a === 'close') { close(); return true; }
    if (a === 'close-if-backdrop') {
      if (e && e.target === el) close();
      return true;
    }
    if (a === 'set-nb') { setNbGroupes(parseInt(el.dataset.n, 10)); return true; }
    if (a === 'repartition') {
      const kind = el.dataset.kind;
      if (kind === 'reset') {
        draft.groupes = Array.from({ length: draft.nbGroupes }, () => []);
        draft.unassigned = draft.presentPids.slice().map(pid => ({ pid, color: 'vert' }));
        renderEditor();
      } else {
        applyRepartition(kind);
      }
      return true;
    }
    if (a === 'assign-to') {
      const pid = el.value;
      const target = parseInt(el.dataset.group, 10);
      if (!pid) return true;
      movePlayer(pid, -1, target);
      return true;
    }
    if (a === 'move-to') {
      const pid = el.dataset.pid;
      const from = parseInt(el.dataset.from, 10);
      const to = parseInt(el.value, 10);
      if (isNaN(to) || from === to) return true;
      movePlayer(pid, from, to);
      return true;
    }
    if (a === 'cycle-color') {
      cyclePlayerColor(el.dataset.pid);
      return true;
    }
    if (a === 'set-contenu') { setContenu(el.value); return true; }
    if (a === 'import-image') {
      const file = el.files?.[0];
      if (file) importImage(file);
      return true;
    }
    if (a === 'print') { generatePDF(); return true; }
    return false;
  }

  /* ── Génération PDF ─────────────────────────────────── */

  function generatePDF() {
    if (!draft) return;
    const cat = draft.cat;
    const catLbl = (window.CAT_LABELS?.[cat] || cat).toUpperCase();
    const dateLabel = new Date(draft.date + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    const principesHtml = draft.principes.length
      ? draft.principes.map(it => {
          const phaseLbl = it.phase === 'avec' ? '🔵 Avec ballon' : it.phase === 'sans' ? '🔴 Sans ballon' : '';
          return `<div class="ps-pdf-principle">
            <div class="ps-pdf-principle-head">
              ${it.principleNum ? `<span class="ps-pdf-num">#${it.principleNum}</span>` : ''}
              <strong>${h(it.criterion || it.label || 'Principe')}</strong>
              <span class="ps-pdf-phase">${phaseLbl}</span>
            </div>
            ${it.objective ? `<div class="ps-pdf-objective">🎯 ${h(it.objective)}</div>` : ''}
          </div>`;
        }).join('')
      : '<div class="ps-pdf-empty">Aucun principe défini pour cette semaine.</div>';

    const groupesHtml = draft.groupes.map((list, gi) => {
      const chips = list.map(p => {
        const c = CHASUBLE_COLORS.find(x => x.key === p.color) || CHASUBLE_COLORS[0];
        // SVG inline (impression garantie) + bordure épaisse + texte coloré
        return `<div class="ps-pdf-chip" style="border-left:6px solid ${c.bg};color:${c.bg}">
          <svg class="ps-pdf-chip-dot" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6" cy="6" r="5" fill="${c.bg}"/>
          </svg>
          <span>${h(playerLabel(p.pid, cat))}</span>
        </div>`;
      }).join('');
      return `<div class="ps-pdf-group">
        <div class="ps-pdf-group-head">Groupe ${gi + 1} <span>(${list.length})</span></div>
        <div class="ps-pdf-group-list">${chips || '<div class="ps-pdf-empty-mini">—</div>'}</div>
      </div>`;
    }).join('');

    const contenuHtml = draft.contenuHtml
      ? `<div class="ps-pdf-content-html">${draft.contenuHtml}</div>`
      : draft.contenu
      ? `<div class="ps-pdf-content-text">${h(draft.contenu).replace(/\n/g, '<br>')}</div>`
      : `<div class="ps-pdf-content-lines">
          ${Array.from({ length: 12 }, () => '<div class="ps-pdf-line"></div>').join('')}
        </div>`;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Fiche pré-séance ${draft.date}</title>
<style>${buildPdfCss()}</style></head>
<body>

  <!-- ═══════════════ FORMAT : A4 PAYSAGE bi-fold (plié en 2) ═══════════════ -->
  <div class="ps-fold-sheet">

    <!-- ── Colonne GAUCHE : infos séance ── -->
    <div class="ps-fold-panel ps-fold-panel-left">
      <header class="ps-fold-head">
        <div>
          <div class="ps-pdf-kicker">P'tits Verts · ${h(catLbl)}</div>
          <h1>Fiche pré-séance</h1>
          <div class="ps-pdf-date">${h(dateLabel)}</div>
          ${draft.theme ? `<div class="ps-pdf-theme">🎨 <strong>${h(draft.theme)}</strong></div>` : ''}
        </div>
        <div class="ps-pdf-stats">
          <div class="ps-pdf-stat"><strong>${draft.presentPids.length}</strong><span>Prés.</span></div>
          <div class="ps-pdf-stat"><strong>${draft.nbGroupes}</strong><span>Grp.</span></div>
        </div>
      </header>

      <section class="ps-pdf-section">
        <h2>🎯 Principes & objectifs</h2>
        <div class="ps-pdf-principles">${principesHtml}</div>
      </section>

      <section class="ps-pdf-section ps-pdf-section-groups">
        <h2>👥 Groupes</h2>
        <div class="ps-pdf-groups ps-pdf-groups-${draft.nbGroupes}">${groupesHtml}</div>
      </section>

      <footer class="ps-pdf-foot">Généré le ${new Date().toLocaleString('fr-FR')} · Axel Pouteau · <span style="color:#009640;font-weight:700">v5.8.0 bi-fold</span></footer>
    </div>

    <!-- ── Ligne de pli au milieu ── -->
    <div class="ps-fold-line" aria-hidden="true">
      <span class="ps-fold-icon">✂ — — — Plier ici — — — ✂</span>
    </div>

    <!-- ── Colonne DROITE : image de séance en grand ── -->
    <div class="ps-fold-panel ps-fold-panel-right">
      <div class="ps-fold-panel-head">
        <span class="ps-pdf-kicker">📝 Séance</span>
        <span class="ps-fold-panel-date">${h(dateLabel)}</span>
      </div>
      <div class="ps-fold-content">
        ${contenuHtml}
      </div>
    </div>

  </div>

  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { toast('Popup bloquée — autorise les pop-ups pour ce site'); return; }
    win.document.write(html);
    win.document.close();
    close();
  }

  function buildPdfCss() {
    return `
      /* ── Reset + impression ── */
      *, *::before, *::after {
        box-sizing: border-box; margin: 0; padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page { size: A4 landscape; margin: 0; }
      html, body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: #fff; }
      body { font-size: 11px; line-height: 1.35; }

      /* ── Feuille A4 paysage plié en 2 (bi-fold A5) ── */
      .ps-fold-sheet {
        width: 297mm;
        height: 210mm;
        display: grid;
        grid-template-columns: 1fr 8mm 1fr;
        page-break-after: auto;
        position: relative;
        overflow: hidden;
      }
      .ps-fold-panel {
        padding: 10mm 8mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ps-fold-panel-left {
        background: linear-gradient(180deg, #fff 0%, #f0fdf4 100%);
      }
      .ps-fold-panel-right {
        background: #fff;
      }
      /* Ligne de pli au milieu (visuelle uniquement) */
      .ps-fold-line {
        display: flex;
        align-items: center;
        justify-content: center;
        border-left: 1px dashed #94a3b8;
        border-right: 1px dashed #94a3b8;
        background: #f8fafc;
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }
      .ps-fold-icon {
        color: #64748b;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .3em;
        text-transform: uppercase;
      }

      /* ── Header panneau gauche ── */
      .ps-fold-head {
        display: flex; justify-content: space-between; align-items: flex-start;
        margin-bottom: 10px; padding-bottom: 8px;
        border-bottom: 3px solid #009640;
        gap: 8px;
      }
      .ps-pdf-kicker {
        font-size: 9px; text-transform: uppercase; color: #009640;
        font-weight: 800; letter-spacing: .12em;
      }
      h1 { font-size: 20px; margin: 2px 0 3px; color: #0f172a; letter-spacing: -0.5px; }
      .ps-pdf-date { color: #475569; font-size: 11px; text-transform: capitalize; }
      .ps-pdf-theme { color: #009640; font-size: 11px; margin-top: 4px; }

      /* ── Header panneau droit ── */
      .ps-fold-panel-head {
        display: flex; justify-content: space-between; align-items: center;
        padding-bottom: 6px; margin-bottom: 8px;
        border-bottom: 3px solid #009640;
      }
      .ps-fold-panel-date { font-size: 10px; color: #64748b; font-weight: 600; text-transform: capitalize; }
      .ps-fold-content {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      /* ── Stats header (compact pour bi-fold) ── */
      .ps-pdf-stats { display: flex; gap: 4px; flex-shrink: 0; }
      .ps-pdf-stat {
        text-align: center; padding: 4px 8px; min-width: 40px;
        background: #f0fdf4; border-radius: 6px;
        border: 1px solid rgba(0,150,64,0.15);
      }
      .ps-pdf-stat strong { display: block; font-size: 16px; color: #009640; line-height: 1; font-weight: 800; }
      .ps-pdf-stat span { font-size: 8px; text-transform: uppercase; color: #475569; font-weight: 700; letter-spacing: .05em; }

      /* ── Sections ── */
      .ps-pdf-section { margin-bottom: 10px; }
      h2 {
        font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
        color: #009640; margin-bottom: 6px; padding: 3px 0 4px;
        border-bottom: 2px solid #009640; font-weight: 800;
      }

      /* ── Principes (compact bi-fold) ── */
      .ps-pdf-principles { display: flex; flex-direction: column; gap: 4px; }
      .ps-pdf-principle {
        background: #f8fafc; border-left: 3px solid #009640;
        padding: 5px 8px; border-radius: 3px; font-size: 10px;
      }
      .ps-pdf-principle-head { display: flex; align-items: center; gap: 5px; }
      .ps-pdf-num {
        background: #009640; color: #fff !important;
        font-weight: 700; padding: 1px 6px; border-radius: 8px; font-size: 8px;
      }
      .ps-pdf-phase { color: #64748b; font-size: 9px; margin-left: auto; }
      .ps-pdf-objective {
        color: #0f172a; margin-top: 3px; font-style: italic; font-size: 10px;
        padding-left: 3px; border-left: 2px solid #e5e7eb;
      }
      .ps-pdf-empty, .ps-pdf-empty-mini {
        color: #94a3b8; font-style: italic; text-align: center; padding: 8px; font-size: 10px;
      }

      /* ── Groupes (compact bi-fold) ── */
      .ps-pdf-section-groups { flex: 1; display: flex; flex-direction: column; }
      .ps-pdf-groups { display: grid; gap: 4px; flex: 1; }
      .ps-pdf-groups-2 { grid-template-columns: 1fr 1fr; }
      .ps-pdf-groups-3 { grid-template-columns: 1fr 1fr 1fr; }
      .ps-pdf-groups-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
      .ps-pdf-group {
        border: 1.5px solid #009640; border-radius: 5px; overflow: hidden;
        page-break-inside: avoid;
        display: flex; flex-direction: column;
      }
      .ps-pdf-group-head {
        background: #009640; color: #fff !important;
        padding: 3px 6px; font-weight: 800; font-size: 10px;
        letter-spacing: .03em; flex-shrink: 0;
      }
      .ps-pdf-group-head span { color: #d1fae5 !important; font-weight: 500; font-size: 9px; margin-left: 3px; }
      .ps-pdf-group-list {
        padding: 4px; display: flex; flex-direction: column; gap: 2px;
        background: #fafafa; flex: 1;
      }

      /* ── Chips joueurs (impression-safe : SVG + bordure + fond selon couleur) ── */
      .ps-pdf-chip {
        display: flex; align-items: center; gap: 4px;
        padding: 2px 5px; background: #fff;
        border-radius: 3px; border-top: 1px solid #f1f5f9;
        font-size: 9px; font-weight: 600;
      }
      .ps-pdf-chip:first-child { border-top: none; }
      .ps-pdf-chip-dot {
        width: 8px; height: 8px; flex-shrink: 0;
      }
      .ps-pdf-chip span { flex: 1; color: #0f172a; font-weight: 600; font-size: 9px; }

      /* ── Contenu panneau droit (image de séance en grand) ── */
      .ps-pdf-content-image { width: 100%; text-align: center; }
      .ps-pdf-content-image img {
        max-width: 100%;
        max-height: 185mm;
        width: auto; height: auto;
        object-fit: contain;
        display: inline-block;
      }
      .ps-pdf-content-text {
        background: #fafafa; padding: 10px 14px; border-radius: 6px;
        font-size: 11px; line-height: 1.5; white-space: pre-wrap;
        border-left: 4px solid #009640;
        max-height: 185mm; overflow: hidden; width: 100%;
      }
      .ps-pdf-content-html { font-size: 10px; line-height: 1.4; width: 100%; max-height: 185mm; overflow: hidden; }
      .ps-pdf-content-html p { margin-bottom: 6px; }
      .ps-pdf-content-html h1, .ps-pdf-content-html h2, .ps-pdf-content-html h3 {
        font-size: 12px; margin: 6px 0 3px; color: #009640;
        text-transform: none; border: none; letter-spacing: 0; padding: 0;
      }
      .ps-pdf-content-html img {
        max-width: 100% !important; max-height: 180mm !important;
        height: auto !important; width: auto !important;
        object-fit: contain; display: block; margin: 4px auto;
      }
      .ps-pdf-content-lines {
        display: flex; flex-direction: column; gap: 10px;
        padding: 8px 0; width: 100%;
      }
      .ps-pdf-line { border-bottom: 1px solid #cbd5e1; height: 14px; }
      .ps-pdf-foot {
        margin-top: auto; padding-top: 6px;
        border-top: 1px solid #e5e7eb; font-size: 8px;
        color: #94a3b8; text-align: center;
      }
    `;
  }

  /* ── Exports ────────────────────────────────────────── */

  window.PreSeanceModule = { open, close, handleAction };
})();

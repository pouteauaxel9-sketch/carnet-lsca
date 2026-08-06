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

    // Le contenu séance a-t-il une image ou du texte substantiel ?
    const hasRichContent = !!(draft.contenuHtml || (draft.contenu && draft.contenu.length > 60));

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Fiche pré-séance ${draft.date}</title>
<style>${buildPdfCss()}</style></head>
<body>

  <!-- ═══════════════ PAGE 1 : Groupes + Principes ═══════════════ -->
  <div class="ps-pdf-page">
    <header class="ps-pdf-head">
      <div class="ps-pdf-head-left">
        <div class="ps-pdf-kicker">P'tits Verts · ${h(catLbl)}</div>
        <h1>Fiche pré-séance</h1>
        <div class="ps-pdf-date">${h(dateLabel)}</div>
        ${draft.theme ? `<div class="ps-pdf-theme">🎨 <strong>${h(draft.theme)}</strong></div>` : ''}
      </div>
      <div class="ps-pdf-stats">
        <div class="ps-pdf-stat"><strong>${draft.presentPids.length}</strong><span>Présents</span></div>
        <div class="ps-pdf-stat"><strong>${draft.nbGroupes}</strong><span>Groupes</span></div>
        <div class="ps-pdf-stat"><strong>${draft.principes.length}</strong><span>Principes</span></div>
      </div>
    </header>

    <section class="ps-pdf-section">
      <h2>🎯 Principes de jeu & objectifs</h2>
      <div class="ps-pdf-principles">${principesHtml}</div>
    </section>

    <section class="ps-pdf-section ps-pdf-section-groups">
      <h2>👥 Composition des groupes</h2>
      <div class="ps-pdf-groups ps-pdf-groups-${draft.nbGroupes}">${groupesHtml}</div>
    </section>

    <footer class="ps-pdf-foot">Page 1/${hasRichContent ? 2 : 1} · Généré le ${new Date().toLocaleString('fr-FR')} · Axel Pouteau</footer>
  </div>

  ${hasRichContent ? `
  <!-- ═══════════════ Force page break robuste ═══════════════ -->
  <div class="page-break-forcer"></div>

  <!-- ═══════════════ PAGE 2 : Contenu séance ═══════════════ -->
  <div class="ps-pdf-page ps-pdf-page-content">
    <header class="ps-pdf-head-compact">
      <div>
        <span class="ps-pdf-kicker">P'tits Verts · ${h(catLbl)}</span>
        <span class="ps-pdf-date-inline">${h(dateLabel)}${draft.theme ? ' · ' + h(draft.theme) : ''}</span>
      </div>
      <div class="ps-pdf-page-num">Page 2/2</div>
    </header>
    <section class="ps-pdf-section ps-pdf-section-content">
      ${contenuHtml}
    </section>
  </div>
  ` : ''}

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
      @page { size: A4; margin: 10mm; }
      html, body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: #fff; }
      body { font-size: 12px; line-height: 1.4; }

      /* ── Page container + forceur de saut de page ── */
      .ps-pdf-page {
        padding: 4mm 2mm;
        break-after: page;
        page-break-after: always;
      }
      .ps-pdf-page:last-child { break-after: auto; page-break-after: auto; }
      .ps-pdf-page-content { padding-top: 2mm; }
      .page-break-forcer {
        page-break-before: always;
        break-before: page;
        height: 0;
      }

      /* ── Header page 1 ── */
      .ps-pdf-head {
        display: flex; justify-content: space-between; align-items: flex-start;
        margin-bottom: 14px; padding-bottom: 12px;
        border-bottom: 4px solid #009640;
        background: linear-gradient(to right, rgba(0,150,64,0.06), transparent);
        padding: 10px 12px; border-radius: 8px 8px 0 0;
      }
      .ps-pdf-head-left { flex: 1; }
      .ps-pdf-kicker {
        font-size: 10px; text-transform: uppercase; color: #009640;
        font-weight: 800; letter-spacing: .12em;
      }
      h1 { font-size: 26px; margin: 2px 0 4px; color: #0f172a; letter-spacing: -0.5px; }
      .ps-pdf-date { color: #475569; font-size: 13px; text-transform: capitalize; }
      .ps-pdf-theme { color: #009640; font-size: 13px; margin-top: 6px; }

      /* ── Header compact page 2 ── */
      .ps-pdf-head-compact {
        display: flex; justify-content: space-between; align-items: center;
        padding-bottom: 6px; margin-bottom: 8px;
        border-bottom: 2px solid #009640;
        font-size: 11px; color: #64748b;
      }
      .ps-pdf-date-inline { margin-left: 8px; font-weight: 600; color: #009640; text-transform: capitalize; }
      .ps-pdf-page-num { color: #94a3b8; font-size: 10px; font-weight: 700; }

      /* ── Stats header ── */
      .ps-pdf-stats { display: flex; gap: 8px; }
      .ps-pdf-stat {
        text-align: center; padding: 8px 14px; min-width: 68px;
        background: #f0fdf4; border-radius: 10px;
        border: 1px solid rgba(0,150,64,0.15);
      }
      .ps-pdf-stat strong { display: block; font-size: 24px; color: #009640; line-height: 1; font-weight: 800; }
      .ps-pdf-stat span { font-size: 9px; text-transform: uppercase; color: #475569; font-weight: 700; letter-spacing: .05em; }

      /* ── Sections ── */
      .ps-pdf-section { margin-bottom: 12px; }
      h2 {
        font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
        color: #009640; margin-bottom: 8px; padding: 4px 0 6px;
        border-bottom: 2px solid #009640; font-weight: 800;
      }

      /* ── Principes ── */
      .ps-pdf-principles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .ps-pdf-principle {
        background: #f8fafc; border-left: 4px solid #009640;
        padding: 8px 12px; border-radius: 4px; font-size: 11px;
      }
      .ps-pdf-principle-head { display: flex; align-items: center; gap: 6px; }
      .ps-pdf-num {
        background: #009640; color: #fff !important;
        font-weight: 700; padding: 2px 8px; border-radius: 10px; font-size: 9px;
      }
      .ps-pdf-phase { color: #64748b; font-size: 10px; margin-left: auto; }
      .ps-pdf-objective {
        color: #0f172a; margin-top: 4px; font-style: italic; font-size: 11px;
        padding-left: 4px; border-left: 2px solid #e5e7eb;
      }
      .ps-pdf-empty, .ps-pdf-empty-mini {
        color: #94a3b8; font-style: italic; text-align: center; padding: 12px; font-size: 11px;
      }

      /* ── Groupes ── */
      .ps-pdf-section-groups { flex: 1; }
      .ps-pdf-groups { display: grid; gap: 8px; }
      .ps-pdf-groups-2 { grid-template-columns: 1fr 1fr; }
      .ps-pdf-groups-3 { grid-template-columns: 1fr 1fr 1fr; }
      .ps-pdf-groups-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
      .ps-pdf-group {
        border: 2px solid #009640; border-radius: 8px; overflow: hidden;
        page-break-inside: avoid;
      }
      .ps-pdf-group-head {
        background: #009640; color: #fff !important;
        padding: 6px 10px; font-weight: 800; font-size: 12px;
        letter-spacing: .03em;
      }
      .ps-pdf-group-head span { color: #d1fae5 !important; font-weight: 500; font-size: 11px; margin-left: 4px; }
      .ps-pdf-group-list {
        padding: 8px; display: flex; flex-direction: column; gap: 4px;
        min-height: 60px; background: #fafafa;
      }

      /* ── Chips joueurs (impression-safe : SVG + texte coloré + bordure) ── */
      .ps-pdf-chip {
        display: flex; align-items: center; gap: 6px;
        padding: 5px 8px; background: #fff;
        border-radius: 4px; border-top: 1px solid #e5e7eb;
        font-size: 11px; font-weight: 700;
      }
      .ps-pdf-chip:first-child { border-top: none; }
      .ps-pdf-chip-dot {
        width: 12px; height: 12px; flex-shrink: 0;
      }
      .ps-pdf-chip span { flex: 1; color: #0f172a; font-weight: 600; }

      /* ── Contenu page 2 ── */
      .ps-pdf-section-content { min-height: 260mm; }
      .ps-pdf-section-content h2 { display: none; } /* on utilise le head compact */

      .ps-pdf-content-image { text-align: center; page-break-inside: avoid; }
      .ps-pdf-content-image img {
        max-width: 100%;
        max-height: 260mm;
        width: auto; height: auto;
        display: inline-block;
        object-fit: contain;
      }
      .ps-pdf-content-text {
        background: #fafafa; padding: 14px 18px; border-radius: 6px;
        font-size: 13px; line-height: 1.6; white-space: pre-wrap;
        border-left: 4px solid #009640;
      }
      .ps-pdf-content-html { font-size: 12px; line-height: 1.5; }
      .ps-pdf-content-html p { margin-bottom: 8px; }
      .ps-pdf-content-html h1, .ps-pdf-content-html h2, .ps-pdf-content-html h3 {
        font-size: 14px; margin: 8px 0 4px; color: #009640;
        text-transform: none; border: none; letter-spacing: 0; padding: 0;
      }
      .ps-pdf-content-html img {
        max-width: 100% !important; max-height: 200mm !important;
        height: auto !important; width: auto !important;
        object-fit: contain; display: block; margin: 8px auto;
        page-break-inside: avoid;
      }
      .ps-pdf-content-html table { width: 100%; border-collapse: collapse; margin: 6px 0; }
      .ps-pdf-content-html td, .ps-pdf-content-html th { border: 1px solid #cbd5e1; padding: 4px 6px; }
      .ps-pdf-content-html ul, .ps-pdf-content-html ol { padding-left: 20px; margin: 4px 0; }
      .ps-pdf-content-lines { display: flex; flex-direction: column; gap: 14px; padding: 12px 0; }
      .ps-pdf-line { border-bottom: 1px solid #cbd5e1; height: 16px; }
      .ps-pdf-foot {
        margin-top: 16px; padding-top: 8px;
        border-top: 1px solid #e5e7eb; font-size: 10px;
        color: #94a3b8; text-align: center;
      }
    `;
  }

  /* ── Exports ────────────────────────────────────────── */

  window.PreSeanceModule = { open, close, handleAction };
})();

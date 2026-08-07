/**
 * pre-seance.js — Fiche pré-séance (v6.0)
 *
 * Modèle data : chaque groupe contient 2 équipes fixes
 *   - Équipe 1 : chasuble VERTE
 *   - Équipe 2 : chasuble BLEUE
 *
 * Éditeur : drag & drop HTML5 des joueurs entre pool / équipes.
 * PDF : layout selon la maquette user (header logo conditionnel + objectif + grille 2xN
 *       avec 2 équipes par groupe + colonne séance rotated pour landscape).
 *
 * Expose : window.PreSeanceModule.{ open, close, handleAction }
 */
(function () {
  'use strict';

  const TEAM_COLORS = [
    { key: 'vert', label: 'Équipe 1', bg: '#009640', text: '#fff' },
    { key: 'bleu', label: 'Équipe 2', bg: '#0284c7', text: '#fff' },
  ];

  const SESSIONS_KEY = 'cfb6_live_sessions_v1';

  let draft = null;
  let saveTimer = null;

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function toast(m) { utils().showToast?.(m); }

  /* ── Store : lire/écrire dans cfb6_live_sessions_v1[cat][date] ── */

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveSessions(store) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(store)); } catch {}
  }

  // Sauvegarde le draft courant dans store[cat][date].preparation (débounce 400ms)
  function persistDraft() {
    if (!draft) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const store = loadSessions();
      if (!store[draft.cat]) store[draft.cat] = {};
      if (!store[draft.cat][draft.date]) store[draft.cat][draft.date] = {};
      store[draft.cat][draft.date].preparation = {
        objectif: draft.objectif,
        timing: draft.timing,
        rappels: draft.rappels,
        theme: draft.theme,
        principes: draft.principes,
        nbGroupes: draft.nbGroupes,
        groupes: draft.groupes,
        pool: draft.pool,
        presentPids: draft.presentPids,
        contenuHtml: draft.contenuHtml,
        contenuFile: draft.contenuFile,
        updatedAt: new Date().toISOString(),
      };
      saveSessions(store);
    }, 400);
  }

  function sortedPlayers(cat) {
    cat = cat || state().cat;
    const players = state().data?.[cat] || {};
    return Object.keys(players)
      .filter(pid => {
        const p = players[pid];
        if (!p) return false;
        if (p.profil?.left) return false;   // Exclure joueurs partis / montés
        return p.profil || p.juggleLog;
      })
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
    return state().data?.[cat]?.[pid]?.profil?.team || '';
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  /* ── Ouverture / init ───────────────────────────────── */

  function open() {
    const cat = state().cat;
    const date = todayIso();
    const week = window.WeeklyFocusModule?.getCurrentWeek?.(cat);
    const items = week?.items || [];

    // Existe-t-il déjà une préparation sauvegardée pour cette date ?
    const store = loadSessions();
    const existing = store[cat]?.[date]?.preparation;
    const livePresentPids = store[cat]?.[date]?.presentPids || [];

    if (existing) {
      // Recharger le draft existant (édition permanente)
      draft = {
        cat, date,
        theme: existing.theme || week?.theme || '',
        principes: existing.principes || items,
        objectif: existing.objectif || '',
        presentPids: (existing.presentPids && existing.presentPids.length)
          ? existing.presentPids
          : (livePresentPids.length ? livePresentPids : sortedPlayers(cat)),
        nbGroupes: existing.nbGroupes || 3,
        groupes: existing.groupes || Array.from({ length: existing.nbGroupes || 3 }, () => ({ teams: [[], []] })),
        pool: existing.pool || [],
        contenuHtml: existing.contenuHtml || '',
        contenuFile: existing.contenuFile || '',
        timing: existing.timing || 'Échauffement · 10 min\nAtelier 1 · 20 min\nAtelier 2 · 20 min\nJeu final · 15 min\nDébrief · 5 min',
        rappels: existing.rappels || '',
      };
      // Si l'utilisateur a modifié les principes de la semaine depuis, resynchroniser
      draft.principes = items;
      draft.theme = week?.theme || draft.theme;
      toast('📝 Préparation existante rechargée');
    } else {
      // Nouvelle préparation : présents par défaut = Mode Terrain du jour, sinon tout l'effectif
      let presentPids = livePresentPids.length ? livePresentPids.slice() : sortedPlayers(cat);
      draft = {
        cat, date,
        theme: week?.theme || '',
        principes: items,
        objectif: '',
        presentPids,
        nbGroupes: 3,
        groupes: Array.from({ length: 3 }, () => ({ teams: [[], []] })),
        pool: presentPids.slice(),
        contenuHtml: '',
        contenuFile: '',
        timing: 'Échauffement · 10 min\nAtelier 1 · 20 min\nAtelier 2 · 20 min\nJeu final · 15 min\nDébrief · 5 min',
        rappels: '',
      };
    }

    renderEditor();
  }

  function close() {
    draft = null;
    const root = document.querySelector('#pre-seance-root');
    if (root) root.innerHTML = '';
  }

  /* ── Manipulations data ─────────────────────────────── */

  function setNbGroupes(n) {
    if (!draft) return;
    const old = draft.groupes || [];
    // Récupérer tous les joueurs affectés dans les groupes en trop
    const overflow = [];
    for (let i = n; i < old.length; i++) {
      old[i].teams.forEach(t => overflow.push(...t));
    }
    const newGroupes = Array.from({ length: n }, (_, i) => old[i] || { teams: [[], []] });
    draft.nbGroupes = n;
    draft.groupes = newGroupes;
    draft.pool = (draft.pool || []).concat(overflow);
    renderEditor();
  }

  function movePlayer(pid, targetGroupIdx, targetTeamIdx) {
    if (!draft) return;
    removePlayerFromAll(pid);
    if (targetGroupIdx === -1) {
      if (!draft.pool.includes(pid)) draft.pool.push(pid);
    } else {
      const g = draft.groupes[targetGroupIdx];
      if (g && g.teams[targetTeamIdx] && !g.teams[targetTeamIdx].includes(pid)) {
        g.teams[targetTeamIdx].push(pid);
      }
    }
    renderEditor();
  }

  /* ── Gestion des présents (dans la préparation) ── */

  function togglePresent(pid) {
    if (!draft) return;
    const idx = draft.presentPids.indexOf(pid);
    if (idx >= 0) {
      // Retirer des présents : nettoyer aussi du pool et des groupes
      draft.presentPids.splice(idx, 1);
      removePlayerFromAll(pid);
    } else {
      // Ajouter aux présents : mettre dans le pool
      draft.presentPids.push(pid);
      if (!draft.pool.includes(pid)) draft.pool.push(pid);
    }
    renderEditor();
  }

  function setAllPresents(present) {
    if (!draft) return;
    const all = sortedPlayers(draft.cat);
    if (present) {
      draft.presentPids = all.slice();
      // Ajouter au pool ceux qui n'y sont pas déjà ET pas dans un groupe
      const assigned = new Set();
      draft.groupes.forEach(g => g.teams.forEach(t => t.forEach(pid => assigned.add(pid))));
      draft.pool = all.filter(pid => !assigned.has(pid));
    } else {
      draft.presentPids = [];
      draft.pool = [];
      draft.groupes = draft.groupes.map(() => ({ teams: [[], []] }));
    }
    renderEditor();
  }

  function removePlayerFromAll(pid) {
    draft.pool = draft.pool.filter(x => x !== pid);
    draft.groupes.forEach(g => {
      g.teams = g.teams.map(t => t.filter(x => x !== pid));
    });
  }

  function resetRepartition() {
    if (!draft) return;
    draft.groupes = Array.from({ length: draft.nbGroupes }, () => ({ teams: [[], []] }));
    draft.pool = draft.presentPids.slice();
    renderEditor();
  }

  function applyRandom() {
    if (!draft) return;
    const pool = draft.presentPids.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const groupes = Array.from({ length: draft.nbGroupes }, () => ({ teams: [[], []] }));
    pool.forEach((pid, i) => {
      const gIdx = i % draft.nbGroupes;
      const tIdx = Math.floor(i / draft.nbGroupes) % 2;
      groupes[gIdx].teams[tIdx].push(pid);
    });
    draft.groupes = groupes;
    draft.pool = [];
    renderEditor();
  }

  function applyByTeam() {
    if (!draft) return;
    const byTeam = {};
    draft.presentPids.forEach(pid => {
      const t = playerTeam(pid, draft.cat) || '—';
      if (!byTeam[t]) byTeam[t] = [];
      byTeam[t].push(pid);
    });
    const teams = Object.keys(byTeam);
    const groupes = Array.from({ length: draft.nbGroupes }, () => ({ teams: [[], []] }));
    teams.forEach((t, i) => {
      byTeam[t].forEach((pid, j) => {
        const gIdx = i % draft.nbGroupes;
        const tIdx = j % 2;
        groupes[gIdx].teams[tIdx].push(pid);
      });
    });
    draft.groupes = groupes;
    draft.pool = [];
    renderEditor();
  }

  /* ── Import image séance ────────────────────────────── */

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
      toast('Image importée (' + file.name + ')');
      renderEditor();
    } catch (e) {
      toast('Import impossible : ' + e.message);
    }
  }

  function setObjectif(txt) {
    if (!draft) return;
    draft.objectif = txt || '';
    persistDraft();
  }
  function setTiming(txt) {
    if (!draft) return;
    draft.timing = txt || '';
    persistDraft();
  }
  function setRappels(txt) {
    if (!draft) return;
    draft.rappels = txt || '';
    persistDraft();
  }

  /* ── Éditeur (modal) avec drag & drop ───────────────── */

  function renderEditor() {
    // Auto-save à chaque render (donc à chaque modification)
    persistDraft();

    let root = document.querySelector('#pre-seance-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pre-seance-root';
      document.body.appendChild(root);
    }
    if (!draft) { root.innerHTML = ''; return; }

    // Sauvegarder position de scroll avant re-render (sinon retour tout en haut à chaque clic)
    const prevScroll = root.querySelector('.ps-scroll')?.scrollTop || 0;

    const cat = draft.cat;
    const catLbl = (window.CAT_LABELS?.[cat] || cat).toUpperCase();

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

            <!-- Barre de config compacte en haut -->
            <section class="ps-config-bar">
              <div class="ps-config-row">
                <label class="ps-label">Groupes</label>
                <div class="ps-btn-group">
                  ${[2,3,4,5,6].map(n => `
                    <button class="ps-btn ${draft.nbGroupes === n ? 'on' : ''}"
                            type="button" data-pre-action="set-nb" data-n="${n}">${n}</button>
                  `).join('')}
                </div>
                <span class="ps-config-sep">·</span>
                <label class="ps-label">Répartition</label>
                <div class="ps-btn-group">
                  <button class="ps-btn" type="button" data-pre-action="reset">Vider</button>
                  <button class="ps-btn" type="button" data-pre-action="random">🎲 Aléatoire</button>
                  <button class="ps-btn" type="button" data-pre-action="by-team">👥 Par équipe</button>
                </div>
                <span class="ps-config-sep">·</span>
                <label class="ps-file-btn ps-file-btn-inline">
                  📸 Image de séance
                  <input type="file" accept="image/*" hidden data-pre-action="import-image">
                </label>
                ${draft.contenuFile ? `<span class="ps-file-info">🖼 ${h(draft.contenuFile)}</span>` : ''}
              </div>
              <p class="ps-hint">💡 Glisse-dépose les joueurs du pool vers les équipes (Équipe 1 vert · Équipe 2 bleu).</p>
            </section>

            <!-- Grille 4 champs 2x2 -->
            <div class="ps-fields-grid">
              <section class="ps-panel ps-field-panel">
                <h4>🎯 Objectif spécifique</h4>
                <textarea class="ps-textarea" rows="4"
                          placeholder="Ex: Améliorer la circulation du ballon en supériorité numérique..."
                          data-pre-action="set-objectif">${h(draft.objectif)}</textarea>
              </section>

              <section class="ps-panel ps-field-panel">
                <h4>📋 Principes FFF de la semaine <small>(auto)</small></h4>
                ${draft.principes.length ? `
                  <ul class="ps-principes-preview-list">
                    ${draft.principes.map(it => `
                      <li>
                        <strong>#${it.principleNum || '?'}</strong> ${h(it.criterion || it.label || '')}
                        ${it.objective ? `<div class="ps-principe-obj">🎯 ${h(it.objective)}</div>` : ''}
                      </li>
                    `).join('')}
                  </ul>
                ` : `
                  <p class="ps-hint">Aucun principe défini cette semaine. Ajoute-les depuis la vue Semaine.</p>
                `}
              </section>

              <section class="ps-panel ps-field-panel">
                <h4>⏱ Timing de la séance</h4>
                <textarea class="ps-textarea" rows="5"
                          placeholder="Une phase par ligne, ex: Échauffement · 10 min"
                          data-pre-action="set-timing">${h(draft.timing)}</textarea>
              </section>

              <section class="ps-panel ps-field-panel">
                <h4>⚠ Rappels du jour</h4>
                <textarea class="ps-textarea" rows="5"
                          placeholder="Ex: Rendre les nouveaux maillots, penser au retour de blessure de X..."
                          data-pre-action="set-rappels">${h(draft.rappels)}</textarea>
              </section>
            </div>

            <!-- Sélection des présents (tous les joueurs de la catégorie, toggle) -->
            <section class="ps-presents-section">
              <div class="ps-presents-head">
                <h4>👥 Joueurs présents à la séance <span class="ps-presents-count">${draft.presentPids.length}/${sortedPlayers(draft.cat).length}</span></h4>
                <div class="ps-presents-actions">
                  <button class="ps-btn" type="button" data-pre-action="all-presents">Tout cocher</button>
                  <button class="ps-btn" type="button" data-pre-action="none-presents">Tout décocher</button>
                </div>
              </div>
              <div class="ps-presents-chips">
                ${sortedPlayers(draft.cat).map(pid => {
                  const present = draft.presentPids.includes(pid);
                  return `<button class="ps-present-chip ${present ? 'on' : ''}" type="button"
                          data-pre-action="toggle-present" data-pid="${h(pid)}">
                    ${present ? '✓' : '☐'} ${h(playerLabel(pid, draft.cat))}
                  </button>`;
                }).join('')}
              </div>
            </section>

            <!-- Pool des joueurs présents non affectés -->
            <section class="ps-pool-section" data-drop-zone="pool">
              <h4>Non affectés à un groupe <span class="ps-pool-count">(${draft.pool.length}/${draft.presentPids.length})</span></h4>
              <div class="ps-pool-chips">
                ${draft.pool.map(pid => renderDraggableChip(pid, 'pool')).join('') ||
                  '<div class="ps-pool-empty">✓ Tous les présents sont affectés</div>'}
              </div>
            </section>

            <!-- Grille des groupes -->
            <section class="ps-groups-section">
              <h4>Groupes (${draft.nbGroupes})</h4>
              <div class="ps-groups-grid ps-groups-grid-${draft.nbGroupes}">
                ${draft.groupes.map((g, gi) => renderGroupCard(g, gi)).join('')}
              </div>
            </section>

          </div>

          <div class="modal-footer ps-footer" style="justify-content:space-between">
            <span class="ps-info">${draft.presentPids.length} présent${draft.presentPids.length > 1 ? 's' : ''} · ${draft.principes.length} principe${draft.principes.length > 1 ? 's' : ''} FFF</span>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost" type="button" data-pre-action="close">Annuler</button>
              <button class="btn btn-primary" type="button" data-pre-action="print">🖨 Générer le PDF</button>
            </div>
          </div>
        </div>
      </div>`;

    // Attacher les listeners drag & drop (une fois par render)
    attachDnD();

    // Restaurer la position de scroll (évite le retour en haut à chaque clic)
    const scrollEl = root.querySelector('.ps-scroll');
    if (scrollEl && prevScroll > 0) scrollEl.scrollTop = prevScroll;
  }

  function renderDraggableChip(pid, source) {
    return `<div class="ps-dnd-chip" draggable="true"
              data-pid="${h(pid)}" data-source="${h(source)}">
      ${h(playerLabel(pid, draft.cat))}
    </div>`;
  }

  function renderGroupCard(g, gi) {
    return `
      <article class="ps-group-card">
        <header class="ps-group-head">
          <strong>Groupe ${gi + 1}</strong>
          <span class="ps-group-count">${g.teams[0].length + g.teams[1].length} joueur${(g.teams[0].length + g.teams[1].length) > 1 ? 's' : ''}</span>
        </header>
        <div class="ps-group-teams">
          ${g.teams.map((team, ti) => {
            const c = TEAM_COLORS[ti];
            return `
              <div class="ps-team-box ps-team-${c.key}" data-drop-zone="team" data-group="${gi}" data-team="${ti}"
                   style="background:${c.bg}20; border-color:${c.bg}">
                <div class="ps-team-head" style="background:${c.bg}; color:${c.text}">
                  ${c.label} <span class="ps-team-count">(${team.length})</span>
                </div>
                <div class="ps-team-chips">
                  ${team.map(pid => renderDraggableChip(pid, 'team-' + gi + '-' + ti)).join('') ||
                    '<div class="ps-team-empty">Dépose ici</div>'}
                </div>
              </div>`;
          }).join('')}
        </div>
      </article>`;
  }

  /* ── Drag & drop ────────────────────────────────────── */

  let draggedPid = null;

  function attachDnD() {
    const root = document.querySelector('#pre-seance-root');
    if (!root) return;

    // Sur chaque chip draggable
    root.querySelectorAll('.ps-dnd-chip').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        draggedPid = chip.dataset.pid;
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', () => {
        draggedPid = null;
        chip.classList.remove('dragging');
        root.querySelectorAll('.drop-hover').forEach(el => el.classList.remove('drop-hover'));
      });
    });

    // Sur chaque zone de drop
    root.querySelectorAll('[data-drop-zone]').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drop-hover');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drop-hover');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drop-hover');
        if (!draggedPid) return;
        const kind = zone.dataset.dropZone;
        if (kind === 'pool') {
          movePlayer(draggedPid, -1, 0);
        } else if (kind === 'team') {
          movePlayer(draggedPid, parseInt(zone.dataset.group, 10), parseInt(zone.dataset.team, 10));
        }
      });
    });
  }

  /* ── Actions dispatcher ─────────────────────────────── */

  function handleAction(el, e) {
    if (!draft && el.dataset.preAction !== 'open') return false;
    const a = el.dataset.preAction;
    if (!a) return false;

    if (a === 'close') { close(); return true; }
    if (a === 'close-if-backdrop') { if (e && e.target === el) close(); return true; }
    if (a === 'set-nb') { setNbGroupes(parseInt(el.dataset.n, 10)); return true; }
    if (a === 'reset') { resetRepartition(); return true; }
    if (a === 'random') { applyRandom(); return true; }
    if (a === 'by-team') { applyByTeam(); return true; }
    if (a === 'toggle-present') { togglePresent(el.dataset.pid); return true; }
    if (a === 'all-presents') { setAllPresents(true); return true; }
    if (a === 'none-presents') { setAllPresents(false); return true; }
    if (a === 'set-objectif') { setObjectif(el.value); return true; }
    if (a === 'set-timing') { setTiming(el.value); return true; }
    if (a === 'set-rappels') { setRappels(el.value); return true; }
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

    // Logo conditionnel : U13 → GJ LSCA, sinon Louverné
    const logos = window.PDF_LOGOS || {};
    const logoSrc = cat === 'u13' ? (logos.gjLsca || logos.louverne || '') : (logos.louverne || '');
    const logoName = cat === 'u13' ? 'GJ LSCA' : 'Louverné Sports';

    // Groupes → HTML avec 2 équipes chacun
    const groupesHtml = draft.groupes.map((g, gi) => {
      const totalJoueurs = g.teams[0].length + g.teams[1].length;
      return `<div class="ps-pdf-group">
        <div class="ps-pdf-group-head">Groupe ${gi + 1} <span>(${totalJoueurs})</span></div>
        <div class="ps-pdf-group-teams">
          ${g.teams.map((team, ti) => {
            const c = TEAM_COLORS[ti];
            const players = team.map(pid => `<div class="ps-pdf-player">${h(playerLabel(pid, cat))}</div>`).join('');
            return `<div class="ps-pdf-team" style="background:${c.bg}15; border-color:${c.bg}">
              <div class="ps-pdf-team-head" style="background:${c.bg}; color:${c.text}">${c.label}</div>
              <div class="ps-pdf-team-list">${players || '<div class="ps-pdf-team-empty">—</div>'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    const contenuHtml = draft.contenuHtml ||
      `<div class="ps-pdf-empty-content">Aucune image de séance importée.<br>💡 Importe une capture d'écran de ta séance depuis l'éditeur.</div>`;

    // Choix du nb de colonnes selon nb de groupes
    let gridCols = 2;
    if (draft.nbGroupes >= 5) gridCols = 3;
    if (draft.nbGroupes >= 7) gridCols = 4;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Fiche pré-séance ${draft.date}</title>
<style>${buildPdfCss(gridCols)}</style></head>
<body>

  <div class="ps-fold-sheet">

    <!-- ═══ COLONNE GAUCHE : 4 blocs empilés (logo / header+objectif / groupes / timing+rappels) ═══ -->
    <div class="ps-fold-half ps-fold-left">

      <!-- Bloc 1 : LOGO en bandeau, plus grand -->
      <div class="ps-block ps-block-logo">
        ${logoSrc
          ? `<img src="${logoSrc}" class="ps-block-logo-img" alt="${h(logoName)}">`
          : `<div class="ps-block-logo-placeholder">${h(logoName)}</div>`}
        <div class="ps-block-logo-name">${h(logoName)}</div>
      </div>

      <!-- Bloc 2 : ENTÊTE + OBJECTIF + PRINCIPES FFF -->
      <div class="ps-block ps-block-head">
        <div class="ps-block-head-top">
          <div class="ps-block-head-title">
            <div class="ps-pdf-kicker">${h(logoName)} · ${h(catLbl)}</div>
            <h1>Fiche pré-séance</h1>
            <div class="ps-pdf-date">${h(dateLabel)}${draft.theme ? ' · <strong style="color:#009640">' + h(draft.theme) + '</strong>' : ''}</div>
          </div>
          <div class="ps-pdf-stats">
            <div class="ps-pdf-stat"><strong>${draft.presentPids.length}</strong><span>Prés.</span></div>
            <div class="ps-pdf-stat"><strong>${draft.nbGroupes}</strong><span>Grp.</span></div>
            <div class="ps-pdf-stat"><strong>${draft.principes.length}</strong><span>Prin.</span></div>
          </div>
        </div>

        <div class="ps-pdf-objectif-block">
          <div class="ps-pdf-objectif-icon">🎯</div>
          <div class="ps-pdf-objectif-body">
            <div class="ps-pdf-objectif-label">Objectif spécifique de la séance</div>
            <div class="ps-pdf-objectif-value">${h(draft.objectif) || '<em style="color:#d1fae5">Non défini</em>'}</div>
          </div>
        </div>

        ${draft.principes.length ? `
          <div class="ps-pdf-principes-block">
            <div class="ps-pdf-principes-label">📋 Principes FFF de la semaine</div>
            <ul class="ps-pdf-principes-list">
              ${draft.principes.map(it => `
                <li>
                  <span class="ps-pdf-principe-num">#${it.principleNum || '?'}</span>
                  <span class="ps-pdf-principe-crit">${h(it.criterion || it.label || '')}</span>
                  ${it.objective ? `<div class="ps-pdf-principe-obj">→ ${h(it.objective)}</div>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>

      <!-- Bloc 3 : GROUPES -->
      <div class="ps-block ps-block-groups">
        <div class="ps-block-label">👥 Composition des groupes</div>
        <div class="ps-pdf-groups-grid" style="grid-template-columns: repeat(${gridCols}, 1fr)">
          ${groupesHtml}
        </div>
      </div>

      <!-- Bloc 4 : TIMING + RAPPELS -->
      ${(draft.timing || draft.rappels) ? `
        <div class="ps-block ps-block-extras">
          <div class="ps-pdf-extras">
            ${draft.timing ? `
              <div class="ps-pdf-extra-block ps-pdf-timing">
                <div class="ps-pdf-extra-label">⏱ Timing de la séance</div>
                <ul class="ps-pdf-timing-list">
                  ${draft.timing.split('\n').filter(Boolean).map(line => {
                    const m = line.match(/^(.+?)\s*·\s*(.+)$/);
                    if (m) return `<li><span class="ps-pdf-timing-phase">${h(m[1].trim())}</span><span class="ps-pdf-timing-dur">${h(m[2].trim())}</span></li>`;
                    return `<li><span class="ps-pdf-timing-phase">${h(line.trim())}</span></li>`;
                  }).join('')}
                </ul>
              </div>
            ` : ''}
            ${draft.rappels ? `
              <div class="ps-pdf-extra-block ps-pdf-rappels">
                <div class="ps-pdf-extra-label">⚠ Rappels du jour</div>
                <ul class="ps-pdf-rappels-list">
                  ${draft.rappels.split('\n').filter(Boolean).map(line => `<li>${h(line.trim())}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <footer class="ps-pdf-foot">
        v6.5.0 · Axel Pouteau
      </footer>
    </div>

    <!-- ═══ Ligne de pli verticale ═══ -->
    <div class="ps-fold-line"><span class="ps-fold-icon">✂ Plier ici ✂</span></div>

    <!-- ═══ COLONNE DROITE : Séance rotated pour landscape ═══ -->
    <div class="ps-fold-half ps-fold-right">
      <div class="ps-rotated-content">
        <div class="ps-fold-landscape-head">
          <span class="ps-pdf-kicker">📝 Séance · ${h(dateLabel)}</span>
          <span class="ps-fold-panel-date">↻ Tourner la feuille</span>
        </div>
        <div class="ps-fold-landscape-body">
          ${contenuHtml}
        </div>
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

  function buildPdfCss(gridCols) {
    return `
      *, *::before, *::after {
        box-sizing: border-box; margin: 0; padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      @page { size: A4 landscape; margin: 0; }
      html, body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: #fff; }
      body { font-size: 11px; line-height: 1.4; }

      /* Feuille A4 paysage, pli vertical au milieu */
      .ps-fold-sheet {
        width: 297mm; height: 210mm;
        display: grid;
        grid-template-columns: 1fr 8mm 1fr;
        position: relative;
        overflow: hidden;
      }
      .ps-fold-half { overflow: hidden; position: relative; }
      .ps-fold-left {
        padding: 8mm 6mm;
        display: flex; flex-direction: column;
        background: #fff;
      }
      .ps-fold-right { background: #fff; }

      /* Pli vertical */
      .ps-fold-line {
        display: flex; align-items: center; justify-content: center;
        border-left: 1px dashed #94a3b8;
        border-right: 1px dashed #94a3b8;
        background: #f8fafc;
        writing-mode: vertical-rl;
      }
      .ps-fold-icon {
        color: #64748b; font-size: 9px; font-weight: 700;
        letter-spacing: .3em; text-transform: uppercase;
      }

      /* ── Layout 4 blocs empilés (vertical) ── */
      .ps-fold-left {
        display: flex; flex-direction: column;
        gap: 5px;
      }
      .ps-block {
        border-radius: 6px;
        overflow: hidden;
      }

      /* Bloc 1 : LOGO + nom club, en bandeau stylé */
      .ps-block-logo {
        display: flex; align-items: center; justify-content: center;
        gap: 14px;
        padding: 6px 12px;
        background: linear-gradient(90deg, #fff 0%, #f0fdf4 50%, #fff 100%);
        border-radius: 8px;
        border: 1px solid #d1fae5;
        box-shadow: 0 1px 3px rgba(0,150,64,0.08);
      }
      .ps-block-logo-img {
        max-height: 75px;
        width: auto;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0,150,64,0.15));
      }
      .ps-block-logo-placeholder {
        padding: 10px 18px;
        background: #009640; color: #fff;
        font-size: 14px; font-weight: 800;
        border-radius: 8px;
      }
      .ps-block-logo-name {
        font-size: 18px; font-weight: 800; color: #009640;
        letter-spacing: -0.2px;
        text-transform: uppercase;
      }

      /* Bloc 2 : entête + objectif */
      .ps-block-head {
        border: 1.5px solid #009640;
        background: #fff;
        padding: 8px 10px;
      }
      .ps-block-head-top {
        display: flex; align-items: center; gap: 10px;
        padding-bottom: 6px; margin-bottom: 6px;
        border-bottom: 2px solid #f0fdf4;
      }
      .ps-block-head-title { flex: 1; min-width: 0; }
      .ps-pdf-kicker {
        font-size: 9px; text-transform: uppercase; color: #009640;
        font-weight: 800; letter-spacing: .1em;
      }
      h1 {
        font-size: 20px; margin: 2px 0 2px;
        color: #0f172a; letter-spacing: -0.4px;
        font-weight: 800;
      }
      .ps-pdf-date {
        color: #475569; font-size: 10px;
        text-transform: capitalize;
      }

      /* Stats en mini-cartes */
      .ps-pdf-stats { display: flex; gap: 3px; flex-shrink: 0; }
      .ps-pdf-stat {
        text-align: center; padding: 4px 8px; min-width: 38px;
        background: #f0fdf4; border-radius: 6px;
        border: 1.5px solid #009640;
      }
      .ps-pdf-stat strong {
        display: block; font-size: 16px; color: #009640;
        line-height: 1; font-weight: 800;
      }
      .ps-pdf-stat span {
        font-size: 7px; text-transform: uppercase; color: #475569;
        font-weight: 700; letter-spacing: .05em;
      }

      /* Bloc 3 : groupes */
      .ps-block-groups {
        border: 1.5px solid #e5e7eb;
        background: #fafafa;
        padding: 6px 8px;
      }
      .ps-block-label {
        font-size: 9px; text-transform: uppercase; color: #009640;
        font-weight: 800; letter-spacing: .08em;
        margin-bottom: 4px;
      }

      /* Bloc 4 : extras */
      .ps-block-extras {
        /* pas de border, laisse les blocs internes se styler */
      }

      /* ── Bloc Objectif (icône + texte) ── */
      .ps-pdf-objectif-block {
        display: flex; align-items: center; gap: 10px;
        background: linear-gradient(90deg, #009640 0%, #16a34a 100%);
        color: #fff !important;
        padding: 8px 12px;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,150,64,0.2);
      }
      .ps-pdf-objectif-icon {
        font-size: 22px;
        flex-shrink: 0;
      }
      .ps-pdf-objectif-body { flex: 1; }
      .ps-pdf-objectif-label {
        font-size: 8px; text-transform: uppercase; color: #d1fae5 !important;
        font-weight: 800; letter-spacing: .08em;
      }
      .ps-pdf-objectif-value {
        color: #fff !important; font-size: 13px; margin-top: 2px;
        font-weight: 600; line-height: 1.3;
      }
      .ps-pdf-objectif-value em { color: #d1fae5 !important; }

      /* ── Bloc Principes FFF (compact) ── */
      .ps-pdf-principes-block {
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        padding: 5px 10px;
        margin-top: 6px;
      }
      .ps-pdf-principes-label {
        font-size: 9px; text-transform: uppercase; color: #009640;
        font-weight: 800; letter-spacing: .08em; margin-bottom: 4px;
      }
      .ps-pdf-principes-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 3px;
      }
      .ps-pdf-principes-list li {
        display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px;
        font-size: 10px;
      }
      .ps-pdf-principe-num {
        background: #009640; color: #fff !important;
        font-weight: 700; padding: 1px 6px; border-radius: 8px; font-size: 8px;
        flex-shrink: 0;
      }
      .ps-pdf-principe-crit { color: #0f172a; font-weight: 600; }
      .ps-pdf-principe-obj {
        width: 100%; padding-left: 22px;
        color: #475569; font-style: italic; font-size: 9px;
      }

      /* ── Grille groupes ── */
      .ps-pdf-groups-grid {
        display: grid;
        gap: 4px;
        align-content: start;
      }
      .ps-pdf-group {
        border: 1.5px solid #009640;
        border-radius: 5px;
        overflow: hidden;
        display: flex; flex-direction: column;
        page-break-inside: avoid;
      }
      .ps-pdf-group-head {
        background: #009640; color: #fff !important;
        padding: 3px 8px; font-weight: 800; font-size: 10px;
        flex-shrink: 0;
      }
      .ps-pdf-group-head span {
        color: #d1fae5 !important; font-weight: 500; font-size: 9px;
      }
      .ps-pdf-group-teams {
        display: grid; grid-template-columns: 1fr 1fr; gap: 2px;
        padding: 2px;
      }
      .ps-pdf-team {
        border-radius: 3px;
        border: 1px solid;
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .ps-pdf-team-head {
        font-size: 8px; font-weight: 800; padding: 2px 4px;
        text-align: center;
        flex-shrink: 0;
      }
      .ps-pdf-team-list {
        padding: 2px 4px;
      }
      .ps-pdf-player {
        font-size: 8px; padding: 0 2px; color: #0f172a;
        line-height: 1.4;
      }
      .ps-pdf-team-empty {
        font-size: 7px; color: #94a3b8; font-style: italic; text-align: center;
        padding: 2px;
      }

      /* ── Extras (timing + rappels côte à côte) ── */
      .ps-pdf-extras {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
      }
      .ps-pdf-extra-block {
        border-radius: 4px; padding: 5px 8px;
        font-size: 9px;
      }
      .ps-pdf-timing {
        background: #f0f9ff; border-left: 3px solid #0284c7;
      }
      .ps-pdf-rappels {
        background: #fef3c7; border-left: 3px solid #f59e0b;
      }
      .ps-pdf-extra-label {
        font-size: 8px; text-transform: uppercase;
        font-weight: 800; letter-spacing: .06em;
        margin-bottom: 3px;
      }
      .ps-pdf-timing .ps-pdf-extra-label { color: #0284c7; }
      .ps-pdf-rappels .ps-pdf-extra-label { color: #b45309; }
      .ps-pdf-timing-list {
        list-style: none; padding: 0; margin: 0;
      }
      .ps-pdf-timing-list li {
        display: flex; justify-content: space-between;
        align-items: baseline;
        padding: 1px 0;
        border-bottom: 1px dotted rgba(2, 132, 199, .2);
      }
      .ps-pdf-timing-list li:last-child { border-bottom: none; }
      .ps-pdf-timing-phase { color: #0f172a; font-weight: 500; }
      .ps-pdf-timing-dur {
        color: #0284c7; font-weight: 700; font-size: 9px;
        white-space: nowrap;
      }
      .ps-pdf-rappels-list {
        list-style: disc; padding-left: 14px; margin: 0;
      }
      .ps-pdf-rappels-list li {
        color: #0f172a; padding: 1px 0;
      }

      /* Footer */
      .ps-pdf-foot {
        padding-top: 3px;
        font-size: 7px; color: #cbd5e1; text-align: center;
      }

      /* ── Colonne droite : contenu ROTATED 90° pour affichage landscape ── */
      .ps-rotated-content {
        width: 210mm; height: 148mm;
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%) rotate(90deg);
        transform-origin: center center;
        padding: 6mm;
        box-sizing: border-box;
        display: flex; flex-direction: column;
        justify-content: flex-start;
      }
      .ps-fold-landscape-head {
        display: flex; justify-content: space-between; align-items: center;
        padding-bottom: 6px; margin-bottom: 8px;
        border-bottom: 2px solid #009640;
        flex-shrink: 0;
      }
      .ps-fold-landscape-body {
        flex: 1; display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .ps-fold-panel-date { font-size: 9px; color: #64748b; font-weight: 600; }

      /* Image séance dans zone landscape (210x148 logique) */
      .ps-pdf-content-image {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
      }
      .ps-pdf-content-image img {
        max-width: 100%; max-height: 130mm;
        width: auto; height: auto;
        object-fit: contain;
      }
      .ps-pdf-empty-content {
        color: #94a3b8; font-style: italic; text-align: center;
        padding: 40px 20px; font-size: 12px;
      }
    `;
  }

  window.PreSeanceModule = { open, close, handleAction };
})();

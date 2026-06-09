/**
 * weekly-focus.js — Grille d'évaluation hebdomadaire éditable
 *
 * Permet à l'éducateur de définir 3 à 8 critères (issus de PILLARS ou
 * créés en custom) à évaluer chaque semaine, puis de saisir rapidement
 * une note 0-5 par joueur, par critère. Permet aussi de joindre un
 * fichier de séance (PDF, image, Word) par semaine.
 *
 * Stockage : localStorage('cfb6_weekly_focus_v1') + sync Supabase facultatif
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cfb6_weekly_focus_v1';
  const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s == null ? '' : s); }
  function toast(m) { if (utils().showToast) utils().showToast(m); }

  /* Principes FFF */
  const GAME_PRINCIPLES = [
    { num: 1, phase: 'avec', subPhase: 'construire', label: "Créer et utiliser des espaces",
      priority: { u9: 'prioritaire', u11: 'prioritaire', u13: 'secondaire', u15: 'secondaire', u18: 'secondaire' } },
    { num: 2, phase: 'avec', subPhase: 'construire', label: "Jouer dans les intervalles et entre les lignes",
      priority: { u9: 'non-prioritaire', u11: 'secondaire', u13: 'secondaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 3, phase: 'avec', subPhase: 'construire', label: "Jouer à l'opposé après avoir fixé collectivement",
      priority: { u9: 'non-prioritaire', u11: 'non-prioritaire', u13: 'secondaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 4, phase: 'avec', subPhase: 'desequilibrer', label: "Jouer combiné pour créer un surnombre",
      priority: { u9: 'non-prioritaire', u11: 'secondaire', u13: 'secondaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 5, phase: 'avec', subPhase: 'desequilibrer', label: "Se démarquer pour fixer et éliminer, passer ou finir",
      priority: { u9: 'secondaire', u11: 'prioritaire', u13: 'prioritaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 6, phase: 'sans', subPhase: 'opposer', label: "Freiner la progression de l'adversaire, organiser et réorganiser les alignements",
      priority: { u9: 'prioritaire', u11: 'secondaire', u13: 'secondaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 7, phase: 'sans', subPhase: 'recuperer', label: "S'organiser en déséquilibre",
      priority: { u9: 'secondaire', u11: 'secondaire', u13: 'secondaire', u15: 'prioritaire', u18: 'prioritaire' } },
    { num: 8, phase: 'sans', subPhase: 'recuperer', label: "Densifier et être actif dans le CJD (axe ballon-but)",
      priority: { u9: 'prioritaire', u11: 'prioritaire', u13: 'prioritaire', u15: 'secondaire', u18: 'secondaire' } },
    { num: 9, phase: 'sans', subPhase: 'recuperer', label: "Défendre son but, récupérer ou dégager le ballon",
      priority: { u9: 'secondaire', u11: 'prioritaire', u13: 'secondaire', u15: 'secondaire', u18: 'prioritaire' } },
  ];
  const PHASE_LABELS = { avec: "On a le ballon", sans: "On n'a pas le ballon" };
  const SUBPHASE_LABELS = {
    construire: "Construire / Progresser", desequilibrer: "Déséquilibrer / Finir",
    opposer: "S'opposer à la progression", recuperer: "S'organiser pour récupérer",
  };
  const PRIORITY_LABELS = {
    'prioritaire': { icon: '🟢', label: 'Prioritaire', color: '#16a34a' },
    'secondaire': { icon: '🟡', label: 'Secondaire', color: '#eab308' },
    'non-prioritaire': { icon: '🟠', label: 'Non-prioritaire', color: '#f97316' },
    'a-definir': { icon: '🔵', label: 'À définir', color: '#1e40af' },
  };
  function principlePriority(p, cat) { return (p.priority && p.priority[cat]) || 'a-definir'; }

  /* Helpers semaine */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtIso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function mondayOf(date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d;
  }
  function thisMondayIso() { return fmtIso(mondayOf(new Date())); }
  function weekLabel(iso) {
    const m = new Date(iso + 'T00:00:00');
    const s = new Date(m); s.setDate(m.getDate() + 6);
    const f = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
    return 'Semaine du ' + f(m) + ' au ' + f(s);
  }
  function shiftWeek(iso, w) {
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + w * 7); return fmtIso(d);
  }

  /* Storage */
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; } }
  function saveStore(store) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { console.warn(e); }
    try { if (window.SupabaseService && window.SupabaseService.upsertSetting) window.SupabaseService.upsertSetting('weekly_focus', store); } catch {}
  }
  function getWeek(cat, iso) { const s = loadStore(); return (s[cat] && s[cat][iso]) || null; }
  function ensureWeek(cat, iso) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) {
      store[cat][iso] = {
        label: weekLabel(iso), theme: '', items: [], ratings: {}, notes: {},
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      saveStore(store);
    }
    return store[cat][iso];
  }
  function setWeek(cat, iso, mut) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) store[cat][iso] = ensureWeek(cat, iso);
    const w = store[cat][iso]; mut(w); w.updatedAt = new Date().toISOString();
    saveStore(store); return w;
  }

  /* Vue */
  let viewWeekIso = null;
  function currentWeekIso() { return viewWeekIso || thisMondayIso(); }
  function open() { viewWeekIso = thisMondayIso(); state().view = 'weekly'; if (utils().renderAll) utils().renderAll(); }
  function close() { state().view = 'dashboard'; if (utils().renderAll) utils().renderAll(); }
  function isOpen() { return state().view === 'weekly'; }

  function render(target) {
    const cat = state().cat;
    const iso = currentWeekIso();
    const week = ensureWeek(cat, iso);
    const players = sortedPlayers(cat);
    const isCurrent = iso === thisMondayIso();
    const isFuture = iso > thisMondayIso();

    target.innerHTML = `
      <div class="weekly-wrap">
        <header class="weekly-head">
          <div class="weekly-nav">
            <button class="btn btn-ghost" data-weekly-action="prev-week" title="Semaine précédente">←</button>
            <div class="weekly-title">
              <div class="weekly-label">${h(week.label)}</div>
              <div class="weekly-sub">${isCurrent ? 'Semaine en cours' : isFuture ? 'À venir' : 'Archive'}</div>
            </div>
            <button class="btn btn-ghost" data-weekly-action="next-week" title="Semaine suivante">→</button>
            ${isCurrent ? '' : '<button class="btn" data-weekly-action="goto-current">Cette semaine</button>'}
          </div>
          <div class="weekly-theme">
            <input id="weekly-theme-input" class="weekly-theme-input" type="text"
                   placeholder="Thème de la semaine (ex: conduite + démarquage)"
                   value="${h(week.theme || '')}" data-weekly-action="set-theme">
          </div>
          ${renderAttachment(week)}
        </header>
        ${renderItemsEditor(cat, week)}
        ${week.items.length === 0
          ? '<div class="weekly-empty"><p>Aucun critère défini pour cette semaine.</p><p class="weekly-empty-hint">Ajoute jusqu’à 8 critères pour démarrer.</p></div>'
          : renderGrid(cat, week, players)
        }
      </div>
    `;
  }

  /* Pièce jointe */
  function formatSize(b) {
    if (!b) return '';
    if (b < 1024) return b + ' o';
    if (b < 1048576) return Math.round(b / 1024) + ' Ko';
    return (b / 1048576).toFixed(1) + ' Mo';
  }
  function iconForFile(type, name) {
    type = type || ''; const ext = (name || '').toLowerCase().split('.').pop();
    if (type.indexOf('image/') === 0) return '🖼️';
    if (type === 'application/pdf' || ext === 'pdf') return '📄';
    if (ext === 'doc' || ext === 'docx') return '📝';
    if (ext === 'xls' || ext === 'xlsx') return '📊';
    if (ext === 'ppt' || ext === 'pptx') return '📑';
    return '📎';
  }
  function renderAttachment(week) {
    const a = week.attachment;
    if (a && a.data) {
      return `
        <div class="weekly-attachment weekly-attachment-set">
          <span class="wa-icon">${iconForFile(a.type, a.name)}</span>
          <div class="wa-info">
            <div class="wa-name">${h(a.name)}</div>
            <div class="wa-meta">${h(formatSize(a.size))}${a.uploadedBy ? ' · ' + h(a.uploadedBy) : ''}</div>
          </div>
          <div class="wa-actions">
            <button class="btn btn-ghost" type="button" data-weekly-action="view-attachment">Voir</button>
            <button class="btn btn-ghost" type="button" data-weekly-action="download-attachment" title="Télécharger">⬇</button>
            <button class="btn btn-ghost wa-remove" type="button" data-weekly-action="remove-attachment" title="Retirer">×</button>
          </div>
        </div>`;
    }
    return `
      <div class="weekly-attachment">
        <input type="file" id="weekly-attachment-input" class="sr-only"
               accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
               data-weekly-action="upload-attachment">
        <label for="weekly-attachment-input" class="btn btn-ghost wa-upload-btn">
          📎 Joindre la séance (PDF, image, Word…)
        </label>
        <span class="wa-hint">Max 2 Mo. Partagé avec les autres éducateurs si la synchro est active.</span>
      </div>`;
  }

  function handleAttachmentUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { toast('Fichier trop volumineux (max 2 Mo)'); try { input.value = ''; } catch {} return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const cat = state().cat, iso = currentWeekIso();
      const coach = (window.EducatorModule && window.EducatorModule.getEducatorName) ? window.EducatorModule.getEducatorName() : '';
      setWeek(cat, iso, w => {
        w.attachment = {
          name: file.name, type: file.type || '', size: file.size,
          data: ev.target.result, uploadedBy: coach, uploadedAt: new Date().toISOString(),
        };
      });
      toast('Séance jointe : ' + file.name);
      if (utils().renderAll) utils().renderAll();
    };
    reader.onerror = () => toast('Erreur lecture fichier');
    reader.readAsDataURL(file);
  }
  function viewAttachment() {
    const w = getWeek(state().cat, currentWeekIso());
    if (!w || !w.attachment || !w.attachment.data) return;
    const a = w.attachment;
    try {
      const nw = window.open();
      if (!nw) { toast('Pop-up bloquée'); return; }
      if (a.type === 'application/pdf' || a.type.indexOf('image/') === 0) {
        nw.document.write('<title>' + h(a.name) + '</title><iframe src="' + a.data + '" style="border:0;width:100%;height:100vh"></iframe>');
      } else { nw.close(); downloadAttachment(); }
    } catch (e) { console.warn(e); }
  }
  function downloadAttachment() {
    const w = getWeek(state().cat, currentWeekIso());
    if (!w || !w.attachment || !w.attachment.data) return;
    const link = document.createElement('a');
    link.href = w.attachment.data; link.download = w.attachment.name;
    document.body.appendChild(link); link.click(); link.remove();
  }
  function removeAttachment() {
    if (!confirm('Retirer le fichier joint ?')) return;
    setWeek(state().cat, currentWeekIso(), w => { delete w.attachment; });
    toast('Fichier retiré');
    if (utils().renderAll) utils().renderAll();
  }

  /* Items editor */
  function renderItemsEditor(cat, week) {
    const used = new Set(week.items.filter(it => it.principleNum).map(it => 'p' + it.principleNum));
    const groups = {};
    GAME_PRINCIPLES.forEach(p => {
      const k = p.phase + '|' + p.subPhase;
      if (!groups[k]) groups[k] = { phase: p.phase, subPhase: p.subPhase, items: [] };
      groups[k].items.push(p);
    });
    return `
      <section class="weekly-items">
        <div class="weekly-items-head">
          <h3>Principes de jeu travaillés cette semaine</h3>
          <div class="weekly-items-actions">
            <button class="btn btn-ghost" data-weekly-action="clone-prev"
                    title="Reprendre les critères de la semaine précédente">↺ Reprendre semaine -1</button>
          </div>
        </div>
        ${week.items.length === 0 ? '' : `
          <div class="weekly-items-list">
            ${week.items.map(it => {
              const isP = !!it.principleNum;
              const phase = it.phase;
              const prioKey = it.priority || (isP && (() => {
                const p = GAME_PRINCIPLES.find(x => x.num === it.principleNum);
                return p && p.priority && p.priority[cat];
              })()) || 'a-definir';
              const prio = PRIORITY_LABELS[prioKey] || PRIORITY_LABELS['a-definir'];
              const cls = it.custom ? 'is-custom' : (phase === 'avec' ? 'is-avec' : phase === 'sans' ? 'is-sans' : '');
              const tag = it.custom ? 'Perso' : isP ? ('#' + it.principleNum + ' ' + (phase === 'avec' ? 'Avec' : 'Sans'))
                        : ((window.PILLARS && window.PILLARS[cat] && window.PILLARS[cat].find(p => p.key === it.pillar) || {}).label || it.pillar);
              return `
                <div class="weekly-item-chip ${cls}" title="${h(prio.label)}">
                  <span class="weekly-item-pillar">${h(tag)}</span>
                  <span class="weekly-item-crit">${h(it.criterion)}</span>
                  ${isP ? '<span class="weekly-item-prio" style="color:' + prio.color + '">' + prio.icon + '</span>' : ''}
                  <span class="weekly-item-scale">/ ${it.scale || 5}</span>
                  <button class="weekly-item-rm" type="button"
                          data-weekly-action="remove-item" data-item-id="${h(it.id)}">×</button>
                </div>`;
            }).join('')}
          </div>`}
        ${week.items.length < 8 ? `
          <details class="weekly-add" ${week.items.length === 0 ? 'open' : ''}>
            <summary>+ Ajouter un principe (${week.items.length}/8)</summary>
            <div class="weekly-add-body">
              <div class="weekly-add-section weekly-add-section-full">
                <label class="weekly-add-label">Principe de jeu FFF</label>
                <select class="weekly-add-select" data-weekly-action="add-principle">
                  <option value="">— Choisir un principe de jeu —</option>
                  ${Object.values(groups).map(g => {
                    const phaseLbl = PHASE_LABELS[g.phase] || g.phase;
                    const subLbl = SUBPHASE_LABELS[g.subPhase] || g.subPhase;
                    return `<optgroup label="${h(phaseLbl)} → ${h(subLbl)}">${g.items.map(p => {
                      if (used.has('p' + p.num)) return '';
                      const prio = PRIORITY_LABELS[principlePriority(p, cat)] || PRIORITY_LABELS['a-definir'];
                      return `<option value="p${p.num}">${prio.icon} #${p.num} — ${h(p.label)} (${prio.label} ${cat.toUpperCase()})</option>`;
                    }).join('')}</optgroup>`;
                  }).join('')}
                </select>
              </div>
              <div class="weekly-add-section weekly-add-section-full">
                <label class="weekly-add-label">+ Objectif supplémentaire</label>
                <form class="weekly-add-custom" data-weekly-action="add-custom" onsubmit="return false;">
                  <input type="text" name="custom-name" placeholder="Ex: conduite côté faible, finition tête…" maxlength="80">
                  <button type="button" class="btn" data-weekly-action="add-custom-go">Ajouter</button>
                </form>
              </div>
            </div>
          </details>
        ` : '<p class="weekly-add-max">Maximum 8 critères atteint.</p>'}
      </section>`;
  }

  function renderGrid(cat, week, players) {
    if (players.length === 0) return '<p class="weekly-empty">Aucun joueur.</p>';
    return `
      <section class="weekly-grid-wrap">
        <h3>Saisie rapide <span class="weekly-grid-hint">(tap pour cycler 0 → 5)</span></h3>
        <div class="weekly-grid-table-wrap">
          <table class="weekly-grid-table">
            <thead><tr>
              <th class="weekly-th-player">Joueur</th>
              ${week.items.map(it => `
                <th class="weekly-th-crit" title="${h(it.criterion)}">
                  <div class="weekly-th-pillar">${h(it.custom ? 'Perso' : ((window.PILLARS && window.PILLARS[cat] && window.PILLARS[cat].find(p => p.key === it.pillar) || {}).label || ''))}</div>
                  <div class="weekly-th-name">${h(it.criterion)}</div>
                </th>`).join('')}
              <th class="weekly-th-avg">Moy.</th>
              <th class="weekly-th-note">Note</th>
            </tr></thead>
            <tbody>${players.map(pid => renderPlayerRow(pid, cat, week)).join('')}</tbody>
          </table>
        </div>
        <div class="weekly-cards">${players.map(pid => renderPlayerCard(pid, cat, week)).join('')}</div>
        <div class="weekly-actions">
          <button class="btn btn-ghost" data-weekly-action="clear-week">Vider les notes</button>
          <button class="btn" data-weekly-action="export-week">Exporter (Excel)</button>
        </div>
      </section>`;
  }

  function renderPlayerRow(pid, cat, week) {
    const ratings = week.ratings[pid] || {};
    const avg = computeRowAvg(week, ratings);
    return `
      <tr class="weekly-row" data-pid="${h(pid)}">
        <th class="weekly-td-player">${h(playerLabel(pid))}</th>
        ${week.items.map(it => {
          const v = ratings[it.id];
          return `<td class="weekly-td-cell">
            <button class="weekly-rate ${v == null ? '' : 'is-set'} ${rateClass(v, it.scale)}"
                    data-weekly-action="cycle-rate" data-pid="${h(pid)}" data-item-id="${h(it.id)}">
              ${v == null ? '·' : v}
            </button>
          </td>`;
        }).join('')}
        <td class="weekly-td-avg">${avg == null ? '—' : avg.toFixed(1)}</td>
        <td class="weekly-td-note">
          <input type="text" class="weekly-note-input" value="${h(week.notes[pid] || '')}"
                 placeholder="Note rapide…" data-weekly-action="set-note" data-pid="${h(pid)}">
        </td>
      </tr>`;
  }

  function renderPlayerCard(pid, cat, week) {
    const ratings = week.ratings[pid] || {};
    const avg = computeRowAvg(week, ratings);
    return `
      <article class="weekly-card" data-pid="${h(pid)}">
        <header class="weekly-card-head">
          <div class="weekly-card-name">${h(playerLabel(pid))}</div>
          <div class="weekly-card-avg">${avg == null ? '—' : avg.toFixed(1) + '/5'}</div>
        </header>
        <div class="weekly-card-grid">
          ${week.items.map(it => {
            const v = ratings[it.id];
            return `<button class="weekly-card-crit ${v == null ? '' : 'is-set'} ${rateClass(v, it.scale)}"
                            data-weekly-action="cycle-rate" data-pid="${h(pid)}" data-item-id="${h(it.id)}">
              <span class="weekly-card-label">${h(it.criterion)}</span>
              <span class="weekly-card-value">${v == null ? '·' : v + '/' + (it.scale || 5)}</span>
            </button>`;
          }).join('')}
        </div>
        <input type="text" class="weekly-card-note" value="${h(week.notes[pid] || '')}"
               placeholder="Note rapide…" data-weekly-action="set-note" data-pid="${h(pid)}">
      </article>`;
  }

  function computeRowAvg(week, ratings) {
    const vals = week.items.map(it => {
      const v = ratings[it.id];
      if (v == null) return null;
      return (v / (it.scale || 5)) * 5;
    }).filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function rateClass(v, scale) {
    if (v == null) return '';
    const norm = v / (scale || 5);
    if (norm >= 0.8) return 'rate-excellent';
    if (norm >= 0.6) return 'rate-good';
    if (norm >= 0.4) return 'rate-mid';
    if (norm >= 0.2) return 'rate-low';
    return 'rate-poor';
  }
  function playerLabel(pid) {
    const cat = state().cat, season = state().season;
    const prof = state().data && state().data[cat] && state().data[cat][pid] && state().data[cat][pid][season] && state().data[cat][pid][season].profil;
    if (prof && prof.prenom && prof.nom) return prof.prenom + ' ' + prof.nom;
    if (prof && prof.prenom) return prof.prenom;
    return pid;
  }
  function sortedPlayers(cat) {
    const obj = (state().data && state().data[cat]) || {};
    return Object.keys(obj).sort((a, b) => playerLabel(a).localeCompare(playerLabel(b), 'fr', { sensitivity: 'base' }));
  }

  function handleAction(el) {
    const action = el.dataset.weeklyAction;
    if (!action) return false;
    const cat = state().cat, iso = currentWeekIso();

    if (action === 'upload-attachment')   { handleAttachmentUpload(el); return true; }
    if (action === 'view-attachment')     { viewAttachment(); return true; }
    if (action === 'download-attachment') { downloadAttachment(); return true; }
    if (action === 'remove-attachment')   { removeAttachment(); return true; }

    if (action === 'prev-week')    { viewWeekIso = shiftWeek(iso, -1); if (utils().renderAll) utils().renderAll(); return true; }
    if (action === 'next-week')    { viewWeekIso = shiftWeek(iso,  1); if (utils().renderAll) utils().renderAll(); return true; }
    if (action === 'goto-current') { viewWeekIso = thisMondayIso(); if (utils().renderAll) utils().renderAll(); return true; }
    if (action === 'close')        { close(); return true; }

    if (action === 'set-theme') {
      setWeek(cat, iso, w => { w.theme = el.value || ''; });
      return true;
    }
    if (action === 'add-principle') {
      const key = el.value; if (!key) return true;
      const num = parseInt(key.replace(/^p/, ''), 10);
      const principle = GAME_PRINCIPLES.find(p => p.num === num);
      if (!principle) return true;
      setWeek(cat, iso, w => {
        if (w.items.length >= 8) return;
        if (w.items.some(it => it.principleNum === num)) return;
        w.items.push({
          id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          pillar: 'tactique', criterion: principle.label, principleNum: num,
          phase: principle.phase, subPhase: principle.subPhase,
          priority: (principle.priority && principle.priority[cat]) || 'a-definir', scale: 5,
        });
      });
      el.value = ''; if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'add-from-catalog') {
      const key = el.value; if (!key) return true;
      const parts = key.split('::');
      setWeek(cat, iso, w => {
        if (w.items.length >= 8) return;
        w.items.push({
          id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          pillar: parts[0], criterion: parts[1], scale: 5,
        });
      });
      el.value = ''; if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'add-custom-go') {
      const form = el.closest('form');
      const input = form && form.querySelector('input[name="custom-name"]');
      const name = ((input && input.value) || '').trim();
      if (!name) { toast('Donne un nom au critère perso'); return true; }
      setWeek(cat, iso, w => {
        if (w.items.length >= 8) return;
        w.items.push({
          id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          pillar: null, criterion: name, custom: true, scale: 5,
        });
      });
      if (input) input.value = '';
      if (utils().renderAll) utils().renderAll();
      return true;
    }
    if (action === 'remove-item') {
      const id = el.dataset.itemId;
      setWeek(cat, iso, w => {
        w.items = w.items.filter(it => it.id !== id);
        Object.keys(w.ratings).forEach(pid => { if (w.ratings[pid]) delete w.ratings[pid][id]; });
      });
      if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'cycle-rate') {
      const pid = el.dataset.pid, itemId = el.dataset.itemId;
      setWeek(cat, iso, w => {
        const it = w.items.find(i => i.id === itemId);
        if (!it) return;
        const max = it.scale || 5;
        if (!w.ratings[pid]) w.ratings[pid] = {};
        const cur = w.ratings[pid][itemId];
        let next;
        if (cur == null) next = 0;
        else if (cur >= max) next = null;
        else next = cur + 1;
        if (next == null) delete w.ratings[pid][itemId];
        else w.ratings[pid][itemId] = next;
      });
      if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'set-note') {
      const pid = el.dataset.pid, val = el.value || '';
      setWeek(cat, iso, w => { if (val) w.notes[pid] = val; else delete w.notes[pid]; });
      return true;
    }
    if (action === 'clone-prev') {
      const prevIso = shiftWeek(iso, -1);
      const prev = getWeek(cat, prevIso);
      if (!prev || !prev.items || !prev.items.length) { toast('Rien à reprendre'); return true; }
      setWeek(cat, iso, w => {
        prev.items.forEach(it => {
          if (w.items.length >= 8) return;
          if (w.items.some(x => x.criterion === it.criterion && x.pillar === it.pillar)) return;
          w.items.push(Object.assign({}, it, { id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }));
        });
        if (!w.theme && prev.theme) w.theme = prev.theme;
      });
      toast('Critères repris');
      if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'clear-week') {
      if (!confirm('Vider toutes les notes ?')) return true;
      setWeek(cat, iso, w => { w.ratings = {}; w.notes = {}; });
      toast('Notes vidées');
      if (utils().renderAll) utils().renderAll(); return true;
    }
    if (action === 'export-week') { exportToExcel(cat, iso); return true; }
    return false;
  }

  function exportToExcel(cat, iso) {
    if (typeof XLSX === 'undefined') { toast('Excel non disponible'); return; }
    const week = getWeek(cat, iso);
    if (!week) return;
    const players = sortedPlayers(cat);
    const headers = ['Joueur'].concat(week.items.map(it => it.criterion)).concat(['Moyenne /5', 'Note']);
    const rows = players.map(pid => {
      const ratings = week.ratings[pid] || {};
      const row = [playerLabel(pid)];
      week.items.forEach(it => row.push(ratings[it.id] != null ? ratings[it.id] : ''));
      const avg = computeRowAvg(week, ratings);
      row.push(avg == null ? '' : Number(avg.toFixed(1)));
      row.push(week.notes[pid] || '');
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([
      [weekLabel(iso) + ' — ' + ((window.CAT_LABELS && window.CAT_LABELS[cat]) || cat).toUpperCase()],
      [week.theme || ''], [], headers
    ].concat(rows));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Semaine');
    XLSX.writeFile(wb, 'semaine_' + cat + '_' + iso + '.xlsx');
    toast('Export Excel terminé');
  }

  function summaryFor(pid, cat) {
    const w = getWeek(cat, thisMondayIso());
    if (!w || !w.items.length) return null;
    const ratings = w.ratings[pid] || {};
    const avg = computeRowAvg(w, ratings);
    return {
      iso: thisMondayIso(), label: w.label, theme: w.theme,
      items: w.items.map(it => Object.assign({}, it, { value: ratings[it.id] != null ? ratings[it.id] : null })),
      avg, note: w.notes[pid] || '',
    };
  }
  function recentRatings(pid, cat, pillar, criterion, max) {
    max = max || 6;
    const store = loadStore();
    const weeks = store[cat] || {};
    const out = [];
    Object.keys(weeks).sort().reverse().forEach(iso => {
      const w = weeks[iso];
      const it = w.items && w.items.find(x => x.criterion === criterion && (!pillar || x.pillar === pillar));
      if (!it) return;
      const v = w.ratings && w.ratings[pid] && w.ratings[pid][it.id];
      if (v != null) out.push({ iso, value: v, scale: it.scale || 5 });
      if (out.length >= max) return;
    });
    return out;
  }
  function badge() {
    const w = getWeek(state().cat, thisMondayIso());
    return (w && w.items && w.items.length) || 0;
  }
  function getCurrentWeek(cat) { return getWeek(cat, thisMondayIso()); }

  function renderPlayerWidget(pid, cat) {
    const s = summaryFor(pid, cat || state().cat);
    if (!s) return '';
    const filled = s.items.filter(it => it.value != null).length;
    return `
      <div class="player-weekly-card">
        <div class="player-weekly-head">
          <div>
            <div class="player-weekly-title">📋 ${h(s.label)}</div>
            ${s.theme ? '<div class="player-weekly-theme">' + h(s.theme) + '</div>' : ''}
          </div>
          <div class="player-weekly-avg">${s.avg == null ? filled + '/' + s.items.length : s.avg.toFixed(1) + '/5'}</div>
        </div>
        <div class="player-weekly-items">
          ${s.items.map(it => `
            <span class="player-weekly-item" title="${h(it.criterion)}">
              ${h(it.criterion)}
              <span class="player-weekly-item-val ${it.value == null ? 'is-na' : ''}">${it.value == null ? '·' : it.value + '/' + (it.scale || 5)}</span>
            </span>`).join('')}
        </div>
        ${s.note ? '<div class="player-weekly-note">"' + h(s.note) + '"</div>' : ''}
      </div>`;
  }

  function pillarBoost(pid, cat, pillarKey, weeksBack) {
    weeksBack = weeksBack || 4;
    const store = loadStore();
    const weeks = store[cat] || {};
    const isoKeys = Object.keys(weeks).sort().reverse().slice(0, weeksBack);
    const values = [];
    isoKeys.forEach(iso => {
      const w = weeks[iso];
      (w.items || []).forEach(it => {
        if (it.pillar !== pillarKey) return;
        const v = w.ratings && w.ratings[pid] && w.ratings[pid][it.id];
        if (v == null) return;
        values.push((v / (it.scale || 5)) * 100);
      });
    });
    if (!values.length) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { avg, count: values.length, weeks_used: isoKeys.length };
  }
  function allPillarBoosts(pid, cat, weeksBack) {
    const pillars = (window.PILLARS && window.PILLARS[cat]) || [];
    const out = {};
    pillars.forEach(p => { const b = pillarBoost(pid, cat, p.key, weeksBack); if (b) out[p.key] = b; });
    return out;
  }

  window.WeeklyFocusModule = {
    open, close, isOpen, render, handleAction,
    summaryFor, recentRatings, badge, getCurrentWeek,
    renderPlayerWidget, pillarBoost, allPillarBoosts,
    GAME_PRINCIPLES, PRIORITY_LABELS, PHASE_LABELS, SUBPHASE_LABELS,
  };
})();

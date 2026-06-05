/**
 * weekly-focus.js — Grille d'évaluation hebdomadaire éditable
 *
 * Permet à l'éducateur de définir 3 à 8 critères (issus de PILLARS ou
 * créés en custom) à évaluer chaque semaine, puis de saisir rapidement
 * une note 0-5 par joueur, par critère.
 *
 * Stockage : localStorage('cfb6_weekly_focus_v1') + sync Supabase facultatif
 *   {
 *     [cat]: {
 *       [weekStart_YYYY-MM-DD]: {
 *         label, theme,
 *         items: [{ id, pillar, criterion, custom?, scale }],
 *         ratings: { [pid]: { [itemId]: 0..5 } },
 *         notes:   { [pid]: string },
 *         createdAt, updatedAt
 *       }
 *     }
 *   }
 *
 * Agrégation : les notes hebdo viennent compléter les évals piliers
 * (moyenne pondérée 30% hebdo / 70% pilier saison) au prochain calcul.
 *
 * Expose : window.WeeklyFocusModule.{ open, close, isOpen, handleAction,
 *          getCurrentWeek, summaryFor, recentRatings, badge }
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'cfb6_weekly_focus_v1';

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s ?? ''); }
  function toast(m) { utils().showToast?.(m); }

  /* ── helpers semaine ─────────────────────────────────── */

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtIso(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

  // Retourne le lundi de la semaine d'une date (semaine ISO, lundi = début)
  function mondayOf(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=dim, 1=lun, ..., 6=sam
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d;
  }

  function thisMondayIso() { return fmtIso(mondayOf(new Date())); }

  function weekLabel(isoMonday) {
    const m = new Date(isoMonday + 'T00:00:00');
    const s = new Date(m); s.setDate(m.getDate() + 6);
    const fmt = d => `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    return `Semaine du ${fmt(m)} au ${fmt(s)}`;
  }

  function shiftWeek(isoMonday, weeks) {
    const d = new Date(isoMonday + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return fmtIso(d);
  }

  /* ── storage ─────────────────────────────────────────── */

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch { return {}; }
  }

  function saveStore(store) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (err) { console.warn('weekly-focus save failed', err); }
    // Best-effort sync Supabase
    try { window.SupabaseService?.upsertSetting?.('weekly_focus', store); } catch {}
  }

  function getWeek(cat, isoMonday) {
    const store = loadStore();
    return store[cat]?.[isoMonday] || null;
  }

  function ensureWeek(cat, isoMonday) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][isoMonday]) {
      store[cat][isoMonday] = {
        label: weekLabel(isoMonday),
        theme: '',
        items: [],
        ratings: {},
        notes: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveStore(store);
    }
    return store[cat][isoMonday];
  }

  function setWeek(cat, isoMonday, mutator) {
    const store = loadStore();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][isoMonday]) store[cat][isoMonday] = ensureWeek(cat, isoMonday);
    const w = store[cat][isoMonday];
    mutator(w);
    w.updatedAt = new Date().toISOString();
    saveStore(store);
    return w;
  }

  /* ── vue ─────────────────────────────────────────────── */

  let viewWeekIso = null; // null = semaine courante
  let activePid = null;   // pour mobile : joueur en focus

  function currentWeekIso() { return viewWeekIso || thisMondayIso(); }

  function open() {
    viewWeekIso = thisMondayIso();
    state().view = 'weekly';
    activePid = null;
    utils().renderAll?.();
  }

  function close() {
    state().view = 'dashboard';
    utils().renderAll?.();
  }

  function isOpen() { return state().view === 'weekly'; }

  /* ── catalog critères dispo ──────────────────────────── */

  function availableCriteria(cat) {
    const pillars = window.PILLARS?.[cat] || [];
    const out = [];
    pillars.forEach(p => {
      (p.criteria || []).forEach(c => {
        out.push({ pillar: p.key, pillarLabel: p.label, criterion: c });
      });
    });
    return out;
  }

  /* ── render ──────────────────────────────────────────── */

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
            <label class="sr-only" for="weekly-theme-input">Thème de la semaine</label>
            <input id="weekly-theme-input" class="weekly-theme-input"
                   type="text" placeholder="Thème de la semaine (ex: conduite + démarquage)"
                   value="${h(week.theme || '')}"
                   data-weekly-action="set-theme">
          </div>
        </header>

        ${renderItemsEditor(cat, week)}

        ${week.items.length === 0
          ? `<div class="weekly-empty">
              <p>Aucun critère défini pour cette semaine.</p>
              <p class="weekly-empty-hint">Ajoute jusqu'à 8 critères ci-dessus pour démarrer la saisie.</p>
            </div>`
          : renderGrid(cat, week, players)
        }
      </div>
    `;
  }

  function renderItemsEditor(cat, week) {
    const catalog = availableCriteria(cat);
    const used = new Set(week.items.filter(it => !it.custom).map(it => it.pillar + '::' + it.criterion));

    return `
      <section class="weekly-items">
        <div class="weekly-items-head">
          <h3>Critères évalués cette semaine</h3>
          <div class="weekly-items-actions">
            <button class="btn btn-ghost" data-weekly-action="clone-prev"
                    title="Reprendre les critères de la semaine précédente">↺ Reprendre semaine -1</button>
          </div>
        </div>

        ${week.items.length === 0 ? '' : `
          <div class="weekly-items-list">
            ${week.items.map((it, idx) => `
              <div class="weekly-item-chip ${it.custom ? 'is-custom' : ''}">
                <span class="weekly-item-pillar">${h(it.custom ? 'Perso' : (window.PILLARS?.[cat]?.find(p => p.key === it.pillar)?.label || it.pillar))}</span>
                <span class="weekly-item-crit">${h(it.criterion)}</span>
                <span class="weekly-item-scale">/ ${it.scale || 5}</span>
                <button class="weekly-item-rm" type="button"
                        data-weekly-action="remove-item" data-item-id="${h(it.id)}"
                        aria-label="Retirer ${h(it.criterion)}">×</button>
              </div>
            `).join('')}
          </div>
        `}

        ${week.items.length < 8 ? `
          <details class="weekly-add" ${week.items.length === 0 ? 'open' : ''}>
            <summary>+ Ajouter un critère (${week.items.length}/8)</summary>
            <div class="weekly-add-body">
              <div class="weekly-add-section">
                <label class="weekly-add-label">Depuis les piliers</label>
                <select class="weekly-add-select" data-weekly-action="add-from-catalog">
                  <option value="">— Choisir un critère —</option>
                  ${catalog.map(c => {
                    const key = c.pillar + '::' + c.criterion;
                    if (used.has(key)) return '';
                    return `<option value="${h(key)}">${h(c.pillarLabel)} → ${h(c.criterion)}</option>`;
                  }).join('')}
                </select>
              </div>
              <div class="weekly-add-section">
                <label class="weekly-add-label">Ou un critère perso</label>
                <form class="weekly-add-custom" data-weekly-action="add-custom" onsubmit="return false;">
                  <input type="text" name="custom-name" placeholder="Ex: jeu de tête défensif" maxlength="60">
                  <button type="button" class="btn" data-weekly-action="add-custom-go">Ajouter</button>
                </form>
              </div>
            </div>
          </details>
        ` : '<p class="weekly-add-max">Maximum 8 critères atteint.</p>'}
      </section>
    `;
  }

  function renderGrid(cat, week, players) {
    if (players.length === 0) {
      return '<p class="weekly-empty">Aucun joueur dans cette catégorie.</p>';
    }

    // Vue tableau (desktop) + vue cartes (mobile via CSS)
    return `
      <section class="weekly-grid-wrap">
        <h3>Saisie rapide <span class="weekly-grid-hint">(tap pour cycler 0 → 5)</span></h3>

        <!-- Vue tableau (desktop) -->
        <div class="weekly-grid-table-wrap">
          <table class="weekly-grid-table">
            <thead>
              <tr>
                <th class="weekly-th-player">Joueur</th>
                ${week.items.map(it => `
                  <th class="weekly-th-crit" title="${h(it.criterion)}">
                    <div class="weekly-th-pillar">${h(it.custom ? 'Perso' : (window.PILLARS?.[cat]?.find(p => p.key === it.pillar)?.label || ''))}</div>
                    <div class="weekly-th-name">${h(it.criterion)}</div>
                  </th>
                `).join('')}
                <th class="weekly-th-avg">Moy.</th>
                <th class="weekly-th-note">Note</th>
              </tr>
            </thead>
            <tbody>
              ${players.map(pid => renderPlayerRow(pid, cat, week)).join('')}
            </tbody>
          </table>
        </div>

        <!-- Vue mobile : carte par joueur -->
        <div class="weekly-cards">
          ${players.map(pid => renderPlayerCard(pid, cat, week)).join('')}
        </div>

        <div class="weekly-actions">
          <button class="btn btn-ghost" data-weekly-action="clear-week">Vider les notes</button>
          <button class="btn" data-weekly-action="export-week">Exporter (Excel)</button>
        </div>
      </section>
    `;
  }

  function renderPlayerRow(pid, cat, week) {
    const ratings = week.ratings[pid] || {};
    const avg = computeRowAvg(week, ratings);
    return `
      <tr class="weekly-row" data-pid="${h(pid)}">
        <th scope="row" class="weekly-td-player">${h(playerLabel(pid))}</th>
        ${week.items.map(it => {
          const v = ratings[it.id];
          return `
            <td class="weekly-td-cell">
              <button class="weekly-rate ${v == null ? '' : 'is-set'} ${rateClass(v, it.scale)}"
                      type="button"
                      data-weekly-action="cycle-rate"
                      data-pid="${h(pid)}" data-item-id="${h(it.id)}"
                      title="${h(it.criterion)} — ${v == null ? 'non noté' : v + '/' + (it.scale || 5)}">
                ${v == null ? '·' : v}
              </button>
            </td>`;
        }).join('')}
        <td class="weekly-td-avg">${avg == null ? '—' : avg.toFixed(1)}</td>
        <td class="weekly-td-note">
          <input type="text" class="weekly-note-input"
                 value="${h(week.notes[pid] || '')}"
                 placeholder="Note rapide…"
                 data-weekly-action="set-note" data-pid="${h(pid)}">
        </td>
      </tr>
    `;
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
            return `
              <button class="weekly-card-crit ${v == null ? '' : 'is-set'} ${rateClass(v, it.scale)}"
                      type="button"
                      data-weekly-action="cycle-rate"
                      data-pid="${h(pid)}" data-item-id="${h(it.id)}">
                <span class="weekly-card-label">${h(it.criterion)}</span>
                <span class="weekly-card-value">${v == null ? '·' : v + '/' + (it.scale || 5)}</span>
              </button>`;
          }).join('')}
        </div>
        <input type="text" class="weekly-card-note"
               value="${h(week.notes[pid] || '')}"
               placeholder="Note rapide pour ${h(playerLabel(pid))}…"
               data-weekly-action="set-note" data-pid="${h(pid)}">
      </article>
    `;
  }

  /* ── helpers calcul ──────────────────────────────────── */

  function computeRowAvg(week, ratings) {
    const vals = week.items
      .map(it => {
        const v = ratings[it.id];
        if (v == null) return null;
        return (v / (it.scale || 5)) * 5;
      })
      .filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a,b) => a+b, 0) / vals.length;
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
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }

  function sortedPlayers(cat) {
    const obj = state().data?.[cat] || {};
    return Object.keys(obj).sort((a, b) =>
      playerLabel(a).localeCompare(playerLabel(b), 'fr', { sensitivity: 'base' }));
  }

  /* ── actions ─────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.weeklyAction;
    if (!action) return false;
    const cat = state().cat;
    const iso = currentWeekIso();

    if (action === 'prev-week')  { viewWeekIso = shiftWeek(iso, -1); utils().renderAll?.(); return true; }
    if (action === 'next-week')  { viewWeekIso = shiftWeek(iso,  1); utils().renderAll?.(); return true; }
    if (action === 'goto-current') { viewWeekIso = thisMondayIso(); utils().renderAll?.(); return true; }
    if (action === 'close')      { close(); return true; }

    if (action === 'set-theme') {
      const val = el.value || '';
      setWeek(cat, iso, w => { w.theme = val; });
      return true;
    }

    if (action === 'add-from-catalog') {
      const key = el.value;
      if (!key) return true;
      const [pillar, criterion] = key.split('::');
      setWeek(cat, iso, w => {
        if (w.items.length >= 8) return;
        w.items.push({
          id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          pillar, criterion, scale: 5,
        });
      });
      el.value = '';
      utils().renderAll?.();
      return true;
    }

    if (action === 'add-custom-go') {
      const form = el.closest('form');
      const input = form?.querySelector('input[name="custom-name"]');
      const name = (input?.value || '').trim();
      if (!name) { toast('Donne un nom au critère perso'); return true; }
      setWeek(cat, iso, w => {
        if (w.items.length >= 8) return;
        w.items.push({
          id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          pillar: null, criterion: name, custom: true, scale: 5,
        });
      });
      if (input) input.value = '';
      utils().renderAll?.();
      return true;
    }

    if (action === 'remove-item') {
      const id = el.dataset.itemId;
      setWeek(cat, iso, w => {
        w.items = w.items.filter(it => it.id !== id);
        Object.keys(w.ratings).forEach(pid => { delete w.ratings[pid]?.[id]; });
      });
      utils().renderAll?.();
      return true;
    }

    if (action === 'cycle-rate') {
      const pid = el.dataset.pid;
      const itemId = el.dataset.itemId;
      setWeek(cat, iso, w => {
        const it = w.items.find(i => i.id === itemId);
        if (!it) return;
        const max = it.scale || 5;
        if (!w.ratings[pid]) w.ratings[pid] = {};
        const cur = w.ratings[pid][itemId];
        // null → 0 → 1 → … → max → null
        let next;
        if (cur == null) next = 0;
        else if (cur >= max) next = null;
        else next = cur + 1;
        if (next == null) delete w.ratings[pid][itemId];
        else w.ratings[pid][itemId] = next;
      });
      utils().renderAll?.();
      return true;
    }

    if (action === 'set-note') {
      const pid = el.dataset.pid;
      const val = el.value || '';
      setWeek(cat, iso, w => {
        if (val) w.notes[pid] = val;
        else delete w.notes[pid];
      });
      return true; // pas de re-render pour ne pas perdre le focus
    }

    if (action === 'clone-prev') {
      const prevIso = shiftWeek(iso, -1);
      const prev = getWeek(cat, prevIso);
      if (!prev || !prev.items?.length) {
        toast('Aucun critère à reprendre dans la semaine précédente');
        return true;
      }
      setWeek(cat, iso, w => {
        prev.items.forEach(it => {
          if (w.items.length >= 8) return;
          // évite doublon
          if (w.items.some(x => x.criterion === it.criterion && x.pillar === it.pillar)) return;
          w.items.push({
            ...it,
            id: 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          });
        });
        if (!w.theme && prev.theme) w.theme = prev.theme;
      });
      toast('Critères repris de la semaine précédente');
      utils().renderAll?.();
      return true;
    }

    if (action === 'clear-week') {
      if (!confirm('Vider toutes les notes de cette semaine ? (les critères restent)')) return true;
      setWeek(cat, iso, w => { w.ratings = {}; w.notes = {}; });
      toast('Notes vidées');
      utils().renderAll?.();
      return true;
    }

    if (action === 'export-week') {
      exportToExcel(cat, iso);
      return true;
    }

    return false;
  }

  /* ── export Excel ────────────────────────────────────── */

  function exportToExcel(cat, iso) {
    if (typeof XLSX === 'undefined') { toast('Excel non disponible'); return; }
    const week = getWeek(cat, iso);
    if (!week) return;
    const players = sortedPlayers(cat);

    const headers = ['Joueur', ...week.items.map(it => it.criterion), 'Moyenne /5', 'Note'];
    const rows = players.map(pid => {
      const ratings = week.ratings[pid] || {};
      const row = [playerLabel(pid)];
      week.items.forEach(it => row.push(ratings[it.id] ?? ''));
      const avg = computeRowAvg(week, ratings);
      row.push(avg == null ? '' : Number(avg.toFixed(1)));
      row.push(week.notes[pid] || '');
      return row;
    });

    const aoa = [
      [`${weekLabel(iso)} — ${(window.CAT_LABELS?.[cat] || cat).toUpperCase()}`],
      [week.theme || ''],
      [],
      headers,
      ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Semaine');
    XLSX.writeFile(wb, `semaine_${cat}_${iso}.xlsx`);
    toast('Export Excel terminé');
  }

  /* ── API publique pour l'app ─────────────────────────── */

  // Renvoie un résumé de la semaine en cours pour un joueur (utilisé sur la fiche joueur)
  function summaryFor(pid, cat) {
    const iso = thisMondayIso();
    const w = getWeek(cat, iso);
    if (!w || !w.items.length) return null;
    const ratings = w.ratings[pid] || {};
    const avg = computeRowAvg(w, ratings);
    return {
      iso, label: w.label, theme: w.theme,
      items: w.items.map(it => ({ ...it, value: ratings[it.id] ?? null })),
      avg, note: w.notes[pid] || '',
    };
  }

  // Renvoie les N dernières notes hebdo d'un joueur pour un critère donné
  function recentRatings(pid, cat, pillar, criterion, max = 6) {
    const store = loadStore();
    const weeks = store[cat] || {};
    const out = [];
    Object.keys(weeks).sort().reverse().forEach(iso => {
      const w = weeks[iso];
      const it = w.items?.find(x => x.criterion === criterion && (!pillar || x.pillar === pillar));
      if (!it) return;
      const v = w.ratings?.[pid]?.[it.id];
      if (v != null) out.push({ iso, value: v, scale: it.scale || 5 });
      if (out.length >= max) return;
    });
    return out;
  }

  // Badge nav : nombre de critères définis cette semaine pour la catégorie courante
  function badge() {
    const cat = state().cat;
    const w = getWeek(cat, thisMondayIso());
    return w?.items?.length || 0;
  }

  function getCurrentWeek(cat) { return getWeek(cat, thisMondayIso()); }

  // Petit widget pour la fiche joueur (section profil)

  function renderPlayerWidget(pid, cat) {
    const s = summaryFor(pid, cat || state().cat);
    if (!s) return '';
    const filled = s.items.filter(it => it.value != null).length;
    return `
      <div class="player-weekly-card">
        <div class="player-weekly-head">
          <div>
            <div class="player-weekly-title">📋 ${h(s.label)}</div>
            ${s.theme ? `<div class="player-weekly-theme">${h(s.theme)}</div>` : ''}
          </div>
          <div class="player-weekly-avg">
            ${s.avg == null ? `${filled}/${s.items.length}` : s.avg.toFixed(1) + '/5'}
          </div>
        </div>
        <div class="player-weekly-items">
          ${s.items.map(it => `
            <span class="player-weekly-item" title="${h(it.criterion)}">
              ${h(it.criterion)}
              <span class="player-weekly-item-val ${it.value == null ? 'is-na' : ''}">
                ${it.value == null ? '·' : it.value + '/' + (it.scale || 5)}
              </span>
            </span>`).join('')}
        </div>
        ${s.note ? `<div class="player-weekly-note">"${h(s.note)}"</div>` : ''}
      </div>
    `;
  }

  /* Agregation Semaine -> Pilier
   * Pour un joueur, retourne pour chaque pilier la moyenne des notes
   * hebdo des N dernieres semaines (rapportees en pourcentage), ainsi
   * que le nombre d'observations utilisees.
   */
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
    return { avg: avg, count: values.length, weeks_used: isoKeys.length };
  }

  function allPillarBoosts(pid, cat, weeksBack) {
    const pillars = (window.PILLARS && window.PILLARS[cat]) || [];
    const out = {};
    pillars.forEach(p => {
      const b = pillarBoost(pid, cat, p.key, weeksBack);
      if (b) out[p.key] = b;
    });
    return out;
  }

  window.WeeklyFocusModule = {
    open: open, close: close, isOpen: isOpen, render: render, handleAction: handleAction,
    summaryFor: summaryFor, recentRatings: recentRatings, badge: badge, getCurrentWeek: getCurrentWeek,
    renderPlayerWidget: renderPlayerWidget,
    pillarBoost: pillarBoost, allPillarBoosts: allPillarBoosts,
  };
})();

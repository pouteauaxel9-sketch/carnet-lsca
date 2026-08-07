/**
 * live-training.js — Mode Terrain V2
 *
 * 2 onglets utiles :
 *  - ⚽ Jonglerie : saisie touches pied fort/faible par joueur présent,
 *                  historique et trend automatique.
 *  - 🎯 Objectifs séance : les principes de la Semaine en cours,
 *                          avec compteurs Réussite / Tentative / Acquis.
 *
 * Barre "Présents" en haut : sélection des joueurs vraiment là ce jour.
 * Filtre tous les onglets. Sauvegardé par séance (date).
 *
 * Store localStorage : cfb6_live_sessions_v1
 *   {
 *     [cat]: {
 *       [YYYY-MM-DD]: {
 *         startedAt, endedAt,
 *         presentPids: [pid, ...],
 *         objectives: [
 *           { id, source, label, principleNum?, reussites, tentatives, acquis, notes }
 *         ]
 *       }
 *     }
 *   }
 */
(function () {
  'use strict';

  const SESSIONS_KEY = 'cfb6_live_sessions_v1';

  function state() { return window.appState || {}; }
  function utils() { return window.appUtils || {}; }
  function h(s) { return utils().h ? utils().h(s) : String(s == null ? '' : s); }
  function toast(m) { utils().showToast && utils().showToast(m); }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(10); } catch {} }

  /* ── UI state ────────────────────────────────────────── */
  let visible = false;
  let activeTab = 'juggle';   // 'juggle' | 'objectifs'
  let presentPickerOpen = false;
  let searchQuery = '';
  let sunMode = false;

  /* ── Helpers ─────────────────────────────────────────── */

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function playerLabel(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil
              || state().data?.[cat]?.[pid]?.profil;
    if (prof?.prenom && prof?.nom) return prof.prenom + ' ' + prof.nom;
    if (prof?.prenom) return prof.prenom;
    return pid;
  }

  function playerTeam(pid) {
    const cat = state().cat;
    const season = state().season;
    const prof = state().data?.[cat]?.[pid]?.[season]?.profil
              || state().data?.[cat]?.[pid]?.profil;
    return prof?.team || '';
  }

  function sortedPlayers(cat) {
    const obj = state().data?.[cat] || {};
    return Object.keys(obj).filter(pid => {
      const prof = obj[pid].profil;
      return !prof?.left; // exclure ceux marqués "partis"
    }).sort((a, b) =>
      playerLabel(a).localeCompare(playerLabel(b), 'fr', { sensitivity: 'base' }));
  }

  /* ── Store séance du jour ────────────────────────────── */

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveSessions(store) {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(store)); }
    catch (e) { console.warn(e); }
  }
  function todaySession() {
    const cat = state().cat;
    const store = loadSessions();
    return (store[cat] && store[cat][todayIso()]) || null;
  }
  function ensureSession() {
    const cat = state().cat;
    const iso = todayIso();
    const store = loadSessions();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) store[cat][iso] = {};
    const s = store[cat][iso];
    // Init défensive des champs Mode Terrain (au cas où seule la préparation ait été
    // sauvée avant l'ouverture du Mode Terrain — évite les crash)
    if (!s.startedAt) s.startedAt = new Date().toISOString();
    if (s.endedAt === undefined) s.endedAt = null;
    if (!Array.isArray(s.presentPids)) {
      // Reprise auto : si la préparation a défini des joueurs (via groupes ou présents),
      // on pré-remplit avec ceux-là
      const prep = s.preparation;
      if (prep?.presentPids?.length) {
        s.presentPids = prep.presentPids.slice();
      } else if (prep?.groupes) {
        const fromGroupes = [];
        prep.groupes.forEach(g => (g.teams || []).forEach(t => (t || []).forEach(pid => fromGroupes.push(pid))));
        s.presentPids = fromGroupes;
      } else {
        s.presentPids = [];
      }
    }
    if (!Array.isArray(s.objectives)) s.objectives = [];
    saveSessions(store);
    return s;
  }
  function setSession(mutator) {
    const cat = state().cat;
    const iso = todayIso();
    const store = loadSessions();
    if (!store[cat]) store[cat] = {};
    if (!store[cat][iso]) store[cat][iso] = ensureSession();
    mutator(store[cat][iso]);
    saveSessions(store);
    return store[cat][iso];
  }

  function presentPids() {
    const s = todaySession();
    return s?.presentPids || [];
  }
  function isPresent(pid) {
    return presentPids().includes(pid);
  }
  function togglePresent(pid) {
    setSession(s => {
      const idx = s.presentPids.indexOf(pid);
      if (idx === -1) s.presentPids.push(pid);
      else s.presentPids.splice(idx, 1);
    });
  }
  function setAllPresent(all) {
    setSession(s => {
      s.presentPids = all ? sortedPlayers(state().cat) : [];
    });
  }

  /* ── Objectifs séance (sync avec principes Semaine) ── */

  function currentWeekPrinciples() {
    const wf = window.WeeklyFocusModule;
    if (!wf?.getCurrentWeek) return [];
    const w = wf.getCurrentWeek(state().cat);
    if (!w) return [];
    return (w.items || []).map(it => ({
      key: 'p' + (it.principleNum || 'c' + it.id),
      label: it.criterion,
      objective: it.objective || '',
      principleNum: it.principleNum,
      custom: it.custom,
    }));
  }

  function ensureObjectivesFromWeek() {
    const principles = currentWeekPrinciples();
    // Filtre selon la sélection définie dans la Fiche pré-séance (si présente)
    // Sinon comportement legacy = tous les principes de la semaine
    const s0 = todaySession();
    const selected = s0?.preparation?.selectedPrincipleNums;
    let toInject = principles;
    if (Array.isArray(selected)) {
      toInject = principles.filter(p => selected.includes(p.principleNum) || p.custom);
    }
    setSession(s => {
      const existing = new Map(s.objectives.map(o => [o.key, o]));
      toInject.forEach(p => {
        if (!existing.has(p.key)) {
          s.objectives.push({
            id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            key: p.key,
            source: p.custom ? 'custom' : 'principle',
            label: p.label,
            objective: p.objective || '',
            principleNum: p.principleNum,
            reussites: 0,
            tentatives: 0,
            acquis: false,
            notes: '',
          });
        } else {
          // Sync l'objectif si maj côté Semaine
          const o = existing.get(p.key);
          if (p.objective && o.objective !== p.objective) o.objective = p.objective;
        }
      });
    });
  }

  function bumpObjective(key, field) {
    setSession(s => {
      const o = s.objectives.find(x => x.key === key);
      if (!o) return;
      o[field] = (o[field] || 0) + 1;
    });
    haptic();
  }
  function decObjective(key, field) {
    setSession(s => {
      const o = s.objectives.find(x => x.key === key);
      if (!o) return;
      o[field] = Math.max(0, (o[field] || 0) - 1);
    });
  }
  function toggleAcquis(key) {
    setSession(s => {
      const o = s.objectives.find(x => x.key === key);
      if (!o) return;
      o.acquis = !o.acquis;
    });
    haptic();
  }
  function setObjectiveNote(key, val) {
    setSession(s => {
      const o = s.objectives.find(x => x.key === key);
      if (o) o.notes = val;
    });
  }
  function removeObjective(key) {
    setSession(s => {
      s.objectives = s.objectives.filter(o => o.key !== key);
    });
  }
  function addCustomObjective(label) {
    label = (label || '').trim();
    if (!label) return;
    setSession(s => {
      s.objectives.push({
        id: 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        key: 'c_' + Date.now(),
        source: 'custom',
        label,
        reussites: 0,
        tentatives: 0,
        acquis: false,
        notes: '',
      });
    });
  }

  /* ── Jonglerie (juggleLog par joueur) ────────────────── */

  function loadJuggleLog(pid) {
    const cat = state().cat;
    const raw = state().data?.[cat]?.[pid]?.juggleLog;
    return Array.isArray(raw) ? raw : [];
  }

  function saveJuggle(pid, foot, val) {
    const cat = state().cat;
    if (!state().data[cat][pid]) state().data[cat][pid] = { profil: {} };
    if (!state().data[cat][pid].juggleLog) state().data[cat][pid].juggleLog = [];
    const log = state().data[cat][pid].juggleLog;
    const today = todayIso();
    let entry = log.find(e => e.date === today);
    if (!entry) {
      entry = { date: today, ts: new Date().toISOString(), gauche: null, droit: null, deux: null };
      log.push(entry);
    }
    if (foot === 'gauche') entry.gauche = val;
    if (foot === 'droit')  entry.droit = val;
    if (foot === 'deux')   entry.deux = val;
    entry.ts = new Date().toISOString();
    utils().schedulePersist && utils().schedulePersist();
  }

  /* ── Open / Close ────────────────────────────────────── */

  function open() {
    visible = true;
    activeTab = 'juggle';
    searchQuery = '';
    ensureSession();
    ensureObjectivesFromWeek();
    renderOverlay();
    document.body.classList.add('live-training-active');
  }

  function close() {
    // Finaliser la séance : marquer endedAt
    setSession(s => { s.endedAt = new Date().toISOString(); });
    const s = todaySession();
    if (s) {
      const p = s.presentPids.length;
      const objDone = s.objectives.filter(o => o.acquis).length;
      const objTotal = s.objectives.length;
      if (p > 0 || objTotal > 0) {
        toast(`Séance : ${p} présent${p > 1 ? 's' : ''} · ${objDone}/${objTotal} objectif${objTotal > 1 ? 's' : ''} acquis`);
      }
    }
    visible = false;
    presentPickerOpen = false;
    document.body.classList.remove('live-training-active');
    const el = document.getElementById('live-training-overlay');
    if (el) el.remove();
    utils().renderAll?.();
  }

  function isOpen() { return visible; }

  /* ── Render ──────────────────────────────────────────── */

  function renderOverlay() {
    let el = document.getElementById('live-training-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'live-training-overlay';
      document.body.appendChild(el);
    }
    // NB : le click sur les checkbox toggle-present est routé via le dispatcher
    // global d'app.js (MODULE_CLICK_SELECTOR). Ne PAS ajouter ici de listener
    // 'change' supplémentaire — sinon double toggle → l'état revient à zéro.
    el.className = 'live-overlay' + (sunMode ? ' live-overlay-sun' : '');
    let body;
    if (activeTab === 'objectifs') body = renderObjectifsView();
    else body = renderJuggleView();
    el.innerHTML = body + (presentPickerOpen ? renderPresentPicker() : '');
  }

  function renderHeader(subtitle) {
    const cat = state().cat;
    const nbPresents = presentPids().length;
    const nbTotal = sortedPlayers(cat).length;
    const teamFilter = state().selTeam || '';
    return `
      <header class="live-head">
        <button class="live-close" type="button" data-live-action="close" aria-label="Fermer">×</button>
        <div class="live-title">
          <div class="live-cat">Mode Terrain — ${h((window.CAT_LABELS?.[cat] || cat).toUpperCase())}</div>
          <div class="live-week">${h(subtitle || todayIsoLabel())}</div>
        </div>
        <div class="live-head-actions">
          <button class="live-presents-btn ${nbPresents > 0 ? 'has-selection' : ''}" type="button"
                  data-live-action="open-presents"
                  title="Sélectionner les joueurs présents">
            👥 ${nbPresents}/${nbTotal}
          </button>
          <button class="live-icon-btn ${sunMode ? 'on' : ''}" type="button"
                  data-live-action="toggle-sun" title="Mode plein soleil">☀</button>
          <button class="live-finish-btn" type="button"
                  data-live-action="finish-session"
                  title="Terminer la séance et proposer le bilan">
            ✅ Séance terminée
          </button>
        </div>
      </header>`;
  }

  function todayIsoLabel() {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  }

  function renderTabs() {
    const tabs = [
      { key: 'juggle',    label: '⚽ Jonglerie' },
      { key: 'objectifs', label: '🎯 Objectifs séance' },
    ];
    return `
      <nav class="live-tabs" role="tablist">
        ${tabs.map(t => `
          <button class="live-tab ${activeTab === t.key ? 'on' : ''}" type="button"
                  data-live-action="set-tab" data-tab="${t.key}"
                  role="tab" aria-selected="${activeTab === t.key}">
            ${h(t.label)}
          </button>`).join('')}
      </nav>`;
  }

  /* ── Vue Jonglerie ── */

  function renderJuggleView() {
    const cat = state().cat;
    const pres = presentPids();
    let visibleP;
    if (pres.length > 0) {
      visibleP = sortedPlayers(cat).filter(p => pres.includes(p));
    } else {
      visibleP = sortedPlayers(cat);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      visibleP = visibleP.filter(pid => playerLabel(pid).toLowerCase().includes(q));
    }

    return `
      <div class="live-shell">
        ${renderHeader('Jonglerie · ' + todayIsoLabel())}
        ${renderTabs()}
        <div class="live-toolbar">
          <input type="search" class="live-search" placeholder="🔍 Rechercher un joueur…"
                 value="${h(searchQuery)}" data-live-action="search" autocomplete="off">
          <span class="live-juggle-legend">${pres.length > 0 ? 'Seulement les présents (' + visibleP.length + ')' : 'Aucun présent sélectionné — clique 👥 en haut'}</span>
        </div>
        <div class="live-juggle-list">
          ${visibleP.length === 0
            ? '<p class="live-empty">Sélectionne les joueurs présents (bouton 👥 en haut).</p>'
            : visibleP.map(pid => renderJuggleRow(pid)).join('')}
        </div>
      </div>`;
  }

  // Migration douce : anciennes entrées avec fort/faible → utiliser comme fallback affichage
  function migrateEntry(entry) {
    if (!entry) return {};
    const out = Object.assign({}, entry);
    // Pas d'écrasement : si gauche/droit/deux existent, ils gagnent. Sinon fort/faible utilisés en lecture seule.
    return out;
  }

  function renderJuggleRow(pid) {
    const log = loadJuggleLog(pid);
    const today = todayIso();
    const todayEntry = migrateEntry(log.find(e => e.date === today));
    const last = migrateEntry(log.filter(e => e.date !== today)
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]);

    const t = (cur, prev) => cur != null && prev != null ? cur - prev : null;
    const trendCls = v => v == null ? '' : v > 0 ? 'trend-up' : v < 0 ? 'trend-down' : 'trend-flat';
    const trendIco = v => v == null ? '' : v > 0 ? '↑' : v < 0 ? '↓' : '=';

    const feet = [
      { key: 'gauche', label: 'Pied gauche' },
      { key: 'droit',  label: 'Pied droit' },
      { key: 'deux',   label: 'Des 2 pieds' },
    ];

    const inputs = feet.map(f => {
      const cur = todayEntry[f.key];
      const prev = last?.[f.key];
      const trend = t(cur, prev);
      return `
        <label class="live-juggle-input-wrap">
          <span class="live-juggle-lbl">${h(f.label)}</span>
          <input type="number" min="0" max="500" step="1" inputmode="numeric"
                 class="live-juggle-input"
                 value="${cur != null ? cur : ''}"
                 placeholder="${prev != null ? prev : '—'}"
                 data-live-action="save-juggle" data-pid="${h(pid)}" data-foot="${f.key}">
          ${trend != null ? `<span class="live-juggle-trend ${trendCls(trend)}">${trendIco(trend)}${Math.abs(trend)}</span>` : ''}
        </label>`;
    }).join('');

    // Ligne de rappel : affiche G / D / 2P de la dernière séance
    let lastLine = 'Première mesure';
    if (last?.date) {
      const g = last.gauche ?? (last.faible ?? '—');
      const d = last.droit ?? (last.fort ?? '—');
      const b = last.deux ?? '—';
      lastLine = `Dernière (${h(last.date)}) — G:${g} · D:${d} · 2P:${b}`;
    }

    return `
      <article class="live-juggle-row" data-pid="${h(pid)}">
        <div class="live-juggle-name">${h(playerLabel(pid))}</div>
        <div class="live-juggle-inputs">${inputs}</div>
        <div class="live-juggle-last">${lastLine}</div>
      </article>`;
  }

  /* ── Vue Objectifs séance ── */

  function renderObjectifsView() {
    ensureObjectivesFromWeek();
    const s = todaySession();
    const objectives = s?.objectives || [];
    const pres = presentPids().length;

    // Résumé
    const totalReussites = objectives.reduce((sum, o) => sum + (o.reussites || 0), 0);
    const totalTentatives = objectives.reduce((sum, o) => sum + (o.tentatives || 0), 0);
    const ratio = totalTentatives > 0 ? Math.round((totalReussites / totalTentatives) * 100) : null;
    const acquis = objectives.filter(o => o.acquis).length;

    return `
      <div class="live-shell">
        ${renderHeader('Objectifs · ' + todayIsoLabel())}
        ${renderTabs()}
        <div class="live-obj-summary">
          <div class="live-obj-stat"><strong>${pres}</strong><span>Présents</span></div>
          <div class="live-obj-stat"><strong>${acquis}/${objectives.length}</strong><span>Acquis</span></div>
          <div class="live-obj-stat"><strong>${totalReussites}/${totalTentatives}</strong><span>Réussite</span></div>
          <div class="live-obj-stat"><strong>${ratio != null ? ratio + '%' : '—'}</strong><span>Ratio</span></div>
        </div>

        ${objectives.length === 0 ? `
          <div class="live-empty" style="padding: 40px 20px">
            <p>Aucun objectif défini pour cette séance.</p>
            <p style="font-size:12px;color:#94a3b8;margin-top:8px">
              Va dans la vue <strong>Semaine</strong> ajouter des principes de jeu — ils apparaîtront ici automatiquement.
            </p>
          </div>
        ` : `<div class="live-obj-list">${objectives.map(renderObjectiveCard).join('')}</div>`}

        <form class="live-obj-add" onsubmit="return false;">
          <input type="text" placeholder="+ Ajouter un objectif custom (ex: coup-franc direct)"
                 maxlength="80" id="live-obj-new-input">
          <button class="btn btn-primary" type="button" data-live-action="add-custom-obj">Ajouter</button>
        </form>
      </div>`;
  }

  function renderObjectiveCard(o) {
    const ratio = o.tentatives > 0 ? Math.round((o.reussites / o.tentatives) * 100) : null;
    const badge = o.principleNum ? `<span class="live-obj-num">#${o.principleNum}</span>` : '';
    const custom = o.source === 'custom' ? '<span class="live-obj-tag">perso</span>' : '';
    const ratioCol = ratio == null ? '#94a3b8' : ratio >= 75 ? '#16a34a' : ratio >= 50 ? '#d97706' : '#dc2626';
    return `
      <article class="live-obj-card ${o.acquis ? 'is-acquis' : ''}" data-key="${h(o.key)}">
        <div class="live-obj-head">
          <div class="live-obj-title">
            ${badge}${custom}
            <span>${h(o.label)}</span>
          </div>
          <button class="live-obj-rm" type="button" data-live-action="remove-obj" data-key="${h(o.key)}"
                  title="Retirer">×</button>
        </div>
        ${o.objective ? `<div class="live-obj-objective">🎯 ${h(o.objective)}</div>` : ''}
        <div class="live-obj-counters">
          <div class="live-obj-counter">
            <div class="live-obj-counter-val">${o.reussites || 0}</div>
            <div class="live-obj-counter-lbl">Réussies</div>
            <div class="live-obj-counter-btns">
              <button class="live-obj-btn dec" type="button" data-live-action="dec-obj" data-key="${h(o.key)}" data-field="reussites">−</button>
              <button class="live-obj-btn inc reussite" type="button" data-live-action="inc-obj" data-key="${h(o.key)}" data-field="reussites">+ Réussite</button>
            </div>
          </div>
          <div class="live-obj-counter">
            <div class="live-obj-counter-val">${o.tentatives || 0}</div>
            <div class="live-obj-counter-lbl">Tentatives</div>
            <div class="live-obj-counter-btns">
              <button class="live-obj-btn dec" type="button" data-live-action="dec-obj" data-key="${h(o.key)}" data-field="tentatives">−</button>
              <button class="live-obj-btn inc tentative" type="button" data-live-action="inc-obj" data-key="${h(o.key)}" data-field="tentatives">+ Tentative</button>
            </div>
          </div>
          <div class="live-obj-ratio" style="color:${ratioCol}">
            <div class="live-obj-ratio-val">${ratio != null ? ratio + '%' : '—'}</div>
            <div class="live-obj-ratio-lbl">Ratio</div>
          </div>
        </div>
        <div class="live-obj-actions">
          <label class="live-obj-acquis-toggle">
            <input type="checkbox" ${o.acquis ? 'checked' : ''}
                   data-live-action="toggle-acquis" data-key="${h(o.key)}">
            <span>✓ Objectif acquis</span>
          </label>
          <input type="text" class="live-obj-note" placeholder="Note rapide (facultatif)…"
                 value="${h(o.notes || '')}"
                 data-live-action="obj-note" data-key="${h(o.key)}">
        </div>
      </article>`;
  }

  /* ── Modal Présents ── */

  function renderPresentPicker() {
    const cat = state().cat;
    const players = sortedPlayers(cat);
    const pres = presentPids();
    return `
      <div class="live-present-picker" data-live-action="close-presents-backdrop">
        <div class="live-present-box" data-live-action="noop">
          <header class="live-present-head">
            <h3>👥 Présents ce soir</h3>
            <button class="live-close" type="button" data-live-action="close-presents">×</button>
          </header>
          <div class="live-present-bulk">
            <span>${pres.length}/${players.length} sélectionnés</span>
            <button class="btn btn-ghost" type="button" data-live-action="select-all-presents">Tout cocher</button>
            <button class="btn btn-ghost" type="button" data-live-action="select-none-presents">Tout décocher</button>
          </div>
          <div class="live-present-list">
            ${players.map(pid => {
              const on = pres.includes(pid);
              return `
                <label class="live-present-row ${on ? 'on' : ''}">
                  <input type="checkbox" ${on ? 'checked' : ''}
                         data-live-action="toggle-present" data-pid="${h(pid)}">
                  <span>${h(playerLabel(pid))}</span>
                </label>`;
            }).join('')}
          </div>
          <footer class="live-present-foot">
            <button class="btn btn-primary" type="button" data-live-action="close-presents">Valider</button>
          </footer>
        </div>
      </div>`;
  }

  /* ── Actions ─────────────────────────────────────────── */

  function handleAction(el) {
    const action = el.dataset.liveAction;
    if (!action) return false;

    if (action === 'noop') { return true; }
    if (action === 'close') { close(); return true; }
    if (action === 'toggle-sun') { sunMode = !sunMode; renderOverlay(); return true; }
    if (action === 'finish-session') {
      const iso = todayIso();
      const cat = state().cat;
      const goToBilan = confirm(
        'Séance terminée ✅\n\n' +
        'Veux-tu faire le bilan de séance maintenant ?\n' +
        '(Ressenti, engagement, ce qui a marché…)\n\n' +
        'OK = ouvrir le bilan\nAnnuler = fermer juste le Mode Terrain'
      );
      close();
      if (goToBilan) {
        // Naviguer vers Bilans → Séances → détail de la séance du jour
        state().view = 'bilans';
        state().bilansTab = 'seances';
        state().historySessionDate = iso;
        utils().renderAll?.();
        // Petit délai pour scroller sur le bloc bilan
        setTimeout(() => {
          const bilanEl = document.querySelector('.sh-bilan-section');
          if (bilanEl) bilanEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      }
      return true;
    }
    if (action === 'set-tab') {
      activeTab = el.dataset.tab || 'juggle';
      renderOverlay();
      return true;
    }
    if (action === 'search') {
      searchQuery = el.value || '';
      const list = document.querySelector('.live-juggle-list');
      if (list) {
        const cat = state().cat;
        const pres = presentPids();
        let vp = pres.length > 0 ? sortedPlayers(cat).filter(p => pres.includes(p)) : sortedPlayers(cat);
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          vp = vp.filter(pid => playerLabel(pid).toLowerCase().includes(q));
        }
        list.innerHTML = vp.length === 0
          ? '<p class="live-empty">Aucun joueur trouvé.</p>'
          : vp.map(pid => renderJuggleRow(pid)).join('');
      }
      return true;
    }
    if (action === 'save-juggle') {
      const pid = el.dataset.pid;
      const foot = el.dataset.foot;
      const val = el.value.trim() === '' ? null : Math.max(0, Math.min(500, parseInt(el.value, 10) || 0));
      saveJuggle(pid, foot, val);
      return true;
    }

    // Présents
    if (action === 'open-presents')  { presentPickerOpen = true; renderOverlay(); return true; }
    if (action === 'close-presents') { presentPickerOpen = false; renderOverlay(); return true; }
    if (action === 'close-presents-backdrop') {
      // Ferme uniquement si l'élément avec cette action est le backdrop lui-même
      // (pas remonté depuis un enfant qui n'a pas d'action propre)
      if (el.classList.contains('live-present-picker')) {
        presentPickerOpen = false;
        renderOverlay();
      }
      return true;
    }
    if (action === 'toggle-present') {
      togglePresent(el.dataset.pid);
      // Update just the row visual, no full re-render (préserve scroll)
      const row = el.closest('.live-present-row');
      if (row) row.classList.toggle('on', el.checked);
      // Update le compteur en haut
      const badge = document.querySelector('.live-presents-btn');
      const total = sortedPlayers(state().cat).length;
      if (badge) badge.textContent = `👥 ${presentPids().length}/${total}`;
      const cnt = document.querySelector('.live-present-bulk span');
      if (cnt) cnt.textContent = `${presentPids().length}/${total} sélectionnés`;
      return true;
    }
    if (action === 'select-all-presents')  { setAllPresent(true); renderOverlay(); return true; }
    if (action === 'select-none-presents') { setAllPresent(false); renderOverlay(); return true; }

    // Objectifs
    if (action === 'inc-obj')      { bumpObjective(el.dataset.key, el.dataset.field); renderOverlay(); return true; }
    if (action === 'dec-obj')      { decObjective(el.dataset.key, el.dataset.field); renderOverlay(); return true; }
    if (action === 'toggle-acquis'){ toggleAcquis(el.dataset.key); renderOverlay(); return true; }
    if (action === 'remove-obj')   {
      if (!confirm('Retirer cet objectif de la séance ?')) return true;
      removeObjective(el.dataset.key);
      renderOverlay();
      return true;
    }
    if (action === 'obj-note') {
      setObjectiveNote(el.dataset.key, el.value || '');
      return true;
    }
    if (action === 'add-custom-obj') {
      const input = document.getElementById('live-obj-new-input');
      addCustomObjective(input?.value || '');
      if (input) input.value = '';
      renderOverlay();
      return true;
    }

    return false;
  }

  /* ── API publique ────────────────────────────────────── */

  function isPlayerPresentToday(pid) { return isPresent(pid); }

  window.LiveTrainingModule = {
    open, close, isOpen, handleAction,
    isPlayerPresentToday,
  };

  // Raccourci clavier Shift+T pour ouvrir
  document.addEventListener('keydown', e => {
    if (e.shiftKey && e.key === 'T' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!visible) open();
      else close();
    }
  });
})();

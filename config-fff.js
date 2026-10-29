/**
 * config-fff.js — Modal de configuration des URLs FFF par équipe
 *
 * Permet à l'éducateur de :
 *   - Voir les URLs FFF actuellement configurées pour chaque équipe
 *   - Ajouter / modifier l'URL d'une équipe sans toucher au code
 *   - Copier la config au format JSON prêt à coller dans data/fff-urls.json
 *     sur GitHub (le scraper se re-déclenche tout seul après commit)
 *
 * Les URLs sont stockées en localStorage ('cfb6_fff_urls_override') et
 * synchronisées entre devices via Supabase. L'app utilise en priorité
 * l'override avant la valeur en dur dans TEAM_SOURCE_CONFIG.
 *
 * Expose : window.ConfigFffModule.{ open, close, handleAction, getUrlForTeam }
 */
(function () {
  'use strict';

  const OVERRIDE_KEY = 'cfb6_fff_urls_override';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const utils = () => window.appUtils || {};
  const CFG   = () => window.TEAM_SOURCE_CONFIG || {};

  /* ── Overrides localStorage ────────────────────────────── */

  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveOverrides(o) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  }

  // URL effective pour une équipe : override > config code
  function getUrlForTeam(teamKey) {
    const over = loadOverrides();
    if (over[teamKey]) return over[teamKey];
    return CFG()[teamKey]?.fffUrl || '';
  }

  /* ── UI Modal ──────────────────────────────────────────── */

  let modal = null;
  // modal = { stage: 'edit' | 'copy', edits: { teamKey: url } }

  function open() {
    // Nouvelle structure : edits = { teamKey: [{ label, url }, ...] }
    modal = { stage: 'edit', edits: {} };
    const over = loadOverrides();          // peut être au format string (legacy) ou array
    const standingsJson = window.appState?.__standingsJsonData || {};
    Object.keys(CFG()).forEach(key => {
      let phases;
      if (over[key]) {
        // Nouvelle structure override : array de {label,url}
        if (Array.isArray(over[key])) phases = over[key].slice();
        else phases = [{ label: 'Phase 1', url: String(over[key]) }];
      } else if (standingsJson.teams?.[key]?.phases) {
        // Depuis le JSON scrapé (phases connues)
        phases = Object.keys(standingsJson.teams[key].phases).map(label => ({
          label,
          url: standingsJson.teams[key].phases[label].url || '',
        }));
      } else if (CFG()[key]?.fffUrl) {
        phases = [{ label: 'Phase 1', url: CFG()[key].fffUrl }];
      } else {
        phases = [];
      }
      modal.edits[key] = phases;
    });
    render();
  }

  function close() {
    modal = null;
    render();
    utils().renderAll?.();
  }

  function render() {
    let el = document.querySelector('#config-fff-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'config-fff-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modal ? renderOverlay() : '';
  }

  function renderOverlay() {
    const body = modal.stage === 'copy' ? renderCopyStage() : renderEditStage();
    return `
      <div class="modal-overlay" data-cfg-fff-overlay>
        <div class="modal-box" style="max-width:820px;max-height:90vh;display:flex;flex-direction:column">
          <div class="modal-head">
            <div>
              <div class="card-kicker">Championnats FFF</div>
              <h3>⚙️ Config URLs FFF par équipe</h3>
            </div>
            <button class="modal-close" type="button" data-cfg-fff-action="close">×</button>
          </div>
          ${body}
        </div>
      </div>`;
  }

  function renderEditStage() {
    const CFG_LIST = CFG();
    // Group par catégorie
    const byCat = {};
    Object.keys(CFG_LIST).forEach(key => {
      const cat = CFG_LIST[key].category || 'autre';
      (byCat[cat] = byCat[cat] || []).push(key);
    });
    const catOrder = ['u13', 'u11', 'u9', 'u7'];
    const CAT_LABELS = window.CAT_LABELS || {};

    return `
      <div class="cfg-fff-body" style="padding:16px 20px;overflow-y:auto;flex:1">
        <p style="margin:0 0 16px;color:#64748b;font-size:13px;line-height:1.5">
          Colle une URL de type <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">mayenne.fff.fr/competitions?id=X&phase=Y&poule=Z</code>
          pour chaque équipe qui a un championnat. Laisse vide pour les équipes sans classement
          (plateaux U7/U9…).
        </p>
        ${catOrder.filter(c => byCat[c]).map(cat => `
          <details open style="margin:10px 0;border:1px solid #e2e8f0;border-radius:8px">
            <summary style="padding:10px 14px;cursor:pointer;font-weight:700;background:#f8fafc">
              ${h(CAT_LABELS[cat] || cat.toUpperCase())} <span style="color:#94a3b8;font-weight:400">(${byCat[cat].length} équipe${byCat[cat].length > 1 ? 's' : ''})</span>
            </summary>
            <div style="padding:12px 14px">
              ${byCat[cat].map(key => {
                const team = CFG_LIST[key];
                const phases = modal.edits[key] || [];
                const hasAny = phases.some(p => (p.url || '').trim());
                return `
                  <div class="cfg-fff-team">
                    <div class="cfg-fff-team-head">
                      ${hasAny ? '✅' : '⚪'} <strong>${h(team.teamLabel || key)}</strong>
                      <span style="color:#94a3b8;font-weight:400;font-size:11px;margin-left:6px">${h(team.division || '')}</span>
                    </div>
                    ${phases.map((p, idx) => `
                      <div class="cfg-fff-phase-row">
                        <input type="text" class="field-input cfg-fff-phase-label"
                               placeholder="Phase 1"
                               value="${h(p.label || '')}"
                               data-cfg-fff-action="edit-phase-label"
                               data-key="${h(key)}" data-idx="${idx}">
                        <input type="url" class="field-input cfg-fff-phase-url"
                               placeholder="https://mayenne.fff.fr/competitions?tab=ranking&id=XXX&phase=X&poule=X&type=ch"
                               value="${h(p.url || '')}"
                               data-cfg-fff-action="edit-phase-url"
                               data-key="${h(key)}" data-idx="${idx}">
                        <button class="btn-ghost cfg-fff-phase-del" type="button" title="Supprimer cette phase"
                                data-cfg-fff-action="del-phase"
                                data-key="${h(key)}" data-idx="${idx}">🗑</button>
                      </div>`).join('')}
                    <button class="btn-ghost cfg-fff-add-phase" type="button"
                            data-cfg-fff-action="add-phase" data-key="${h(key)}">
                      + Ajouter une phase
                    </button>
                  </div>`;
              }).join('')}
            </div>
          </details>
        `).join('')}
      </div>
      <div class="modal-footer" style="padding:12px 20px;gap:8px">
        <button class="btn-ghost" type="button" data-cfg-fff-action="close">Annuler</button>
        <span style="flex:1"></span>
        <button class="btn-ghost" type="button" data-cfg-fff-action="go-copy">📋 Voir / Copier le JSON</button>
        <button class="btn-primary" type="button" data-cfg-fff-action="save">💾 Enregistrer</button>
      </div>`;
  }

  function renderCopyStage() {
    // Construit un objet au même format que data/fff-urls.json
    const CFG_LIST = CFG();
    const season = window.CLUB_DATA?.season || window.appState?.season || '2026-2027';
    const payload = {
      comment: "URLs des championnats FFF à scraper. Édité depuis l'app P'tits Verts.",
      season,
      teams: {},
    };
    Object.keys(CFG_LIST).forEach(key => {
      const phases = (modal.edits[key] || []).filter(p => (p.url || '').trim());
      if (!phases.length) return;
      payload.teams[key] = {
        label: CFG_LIST[key].teamLabel || key,
        phases: phases.map(p => ({ label: (p.label || '').trim() || 'Phase', url: p.url.trim() })),
      };
    });
    const json = JSON.stringify(payload, null, 2);

    const nbTeams = Object.keys(payload.teams).length;
    return `
      <div class="cfg-fff-body" style="padding:16px 20px;overflow-y:auto;flex:1">
        <p style="margin:0 0 10px">
          <strong>${nbTeams} équipe${nbTeams > 1 ? 's' : ''}</strong> avec une URL FFF renseignée.
          Copie ce JSON et colle-le dans <code>data/fff-urls.json</code> sur GitHub :
        </p>
        <ol style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 14px 20px">
          <li>Clic sur <strong>📋 Copier le JSON</strong> ci-dessous</li>
          <li>Va sur ton repo GitHub → <strong>data/fff-urls.json</strong> → ✏️ Edit</li>
          <li>Sélectionne tout (Ctrl+A) → remplace par le contenu copié</li>
          <li>Clic <strong>Commit changes</strong></li>
          <li>GitHub Action tourne auto (~1 min) → les classements/matchs s'ajoutent dans l'app</li>
        </ol>
        <textarea id="cfg-fff-json-ta" readonly
                  style="width:100%;min-height:280px;font-family:monospace;font-size:12px;
                         padding:10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc"
        >${h(json)}</textarea>
      </div>
      <div class="modal-footer" style="padding:12px 20px;gap:8px">
        <button class="btn-ghost" type="button" data-cfg-fff-action="back-edit">← Retour édition</button>
        <span style="flex:1"></span>
        <button class="btn-primary" type="button" data-cfg-fff-action="copy-json">📋 Copier le JSON</button>
      </div>`;
  }

  /* ── Actions ───────────────────────────────────────────── */

  function handleAction(target) {
    const act = target.dataset.cfgFffAction;
    if (!act) return false;

    if (act === 'close') { close(); return true; }
    if (act === 'edit-phase-label' || act === 'edit-phase-url') {
      const key = target.dataset.key;
      const idx = parseInt(target.dataset.idx, 10);
      if (!key || isNaN(idx)) return true;
      modal.edits[key] = modal.edits[key] || [];
      modal.edits[key][idx] = modal.edits[key][idx] || { label: '', url: '' };
      if (act === 'edit-phase-label') modal.edits[key][idx].label = target.value;
      else                            modal.edits[key][idx].url   = target.value;
      return true;
    }
    if (act === 'add-phase') {
      const key = target.dataset.key;
      if (!key) return true;
      modal.edits[key] = modal.edits[key] || [];
      const n = modal.edits[key].length + 1;
      modal.edits[key].push({ label: 'Phase ' + n, url: '' });
      render();
      return true;
    }
    if (act === 'del-phase') {
      const key = target.dataset.key;
      const idx = parseInt(target.dataset.idx, 10);
      if (!key || isNaN(idx)) return true;
      modal.edits[key].splice(idx, 1);
      render();
      return true;
    }
    if (act === 'save') {
      const over = {};
      Object.keys(modal.edits).forEach(k => {
        const phases = (modal.edits[k] || []).filter(p => (p.url || '').trim());
        if (phases.length) over[k] = phases.map(p => ({ label: (p.label || '').trim() || 'Phase', url: p.url.trim() }));
      });
      saveOverrides(over);
      utils().showToast?.('✅ Config enregistrée. Pour que le scraper utilise ces URLs, copie le JSON et pousse-le sur GitHub.');
      close();
      return true;
    }
    if (act === 'go-copy')  { modal.stage = 'copy'; render(); return true; }
    if (act === 'back-edit') { modal.stage = 'edit'; render(); return true; }
    if (act === 'copy-json') {
      const ta = document.querySelector('#cfg-fff-json-ta');
      if (!ta) return true;
      ta.select();
      try {
        navigator.clipboard.writeText(ta.value).then(
          () => utils().showToast?.('📋 JSON copié dans le presse-papier !'),
          () => { document.execCommand('copy'); utils().showToast?.('📋 JSON copié'); }
        );
      } catch { document.execCommand('copy'); utils().showToast?.('📋 JSON copié'); }
      return true;
    }
    return false;
  }

  // Hook global click
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-cfg-fff-action]');
    if (!t) return;
    if (handleAction(t)) e.preventDefault();
  });

  // Hook global input (pour l'édition temps réel)
  document.addEventListener('input', e => {
    const t = e.target;
    const act = t?.dataset?.cfgFffAction;
    if (act === 'edit-url' || act === 'edit-phase-label' || act === 'edit-phase-url') handleAction(t);
  });

  /* ── Exports ───────────────────────────────────────────── */

  window.ConfigFffModule = { open, close, handleAction, getUrlForTeam };
})();

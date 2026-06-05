(function () {
  'use strict';

  const EDUCATOR_KEY = 'cfb6_educator';
  const COLORS = ['#185fa5', '#0f6e56', '#854f0b', '#993556', '#5f5e5a', '#d85a30'];

  function loadEducator() {
    try {
      return JSON.parse(localStorage.getItem(EDUCATOR_KEY) || 'null') ||
        { id: 'local', name: '', color: '#185fa5' };
    } catch { return { id: 'local', name: '', color: '#185fa5' }; }
  }

  function saveEducator(data) {
    localStorage.setItem(EDUCATOR_KEY, JSON.stringify(data));
  }

  function getEducator() { return loadEducator(); }
  function getEducatorName() { const n = loadEducator().name; return n || 'Éducateur'; }
  function getEducatorId() { return loadEducator().id || 'local'; }

  function h(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderBadgeHtml() {
    const ed = loadEducator();
    const name = ed.name || 'Configurer';
    const syncStatus = window.SyncModule?.status?.() || { status: 'off' };
    const syncIcon = ({
      on: '☁️',
      off: '',
      pending: '⏳',
      error: '⚠️',
    })[syncStatus.status] || '';
    const syncTitle = ({
      on: 'Synchro multi-coach active',
      off: 'Synchro désactivée — clique pour configurer',
      pending: 'Synchro en cours...',
      error: 'Erreur synchro : ' + (syncStatus.error || ''),
    })[syncStatus.status] || '';
    return `<button class="educator-badge" type="button" data-educator-action="open-config" title="${h(syncTitle || 'Profil éducateur')}" style="${ed.name ? 'border-color:' + ed.color : ''}">
      <span class="educator-dot" style="background:${ed.color || '#185fa5'}"></span>
      <span>${h(name)}</span>
      ${syncIcon ? `<span class="educator-sync-icon">${syncIcon}</span>` : ''}
    </button>`;
  }

  function injectBadge() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    const existing = navRight.querySelector('.educator-badge');
    if (existing) existing.remove();
    navRight.insertAdjacentHTML('afterbegin', renderBadgeHtml());
  }

  // Re-render le badge à chaque changement de status de synchro
  if (window.SyncModule?.onStatusChange) {
    window.SyncModule.onStatusChange(() => injectBadge());
  } else {
    // SyncModule peut être chargé après auth-local — réessayer
    setTimeout(() => {
      window.SyncModule?.onStatusChange?.(() => injectBadge());
      injectBadge();
    }, 1500);
  }

  let configOpen = false;
  let tempColor = null;

function renderConfigModal() {
    const ed = loadEducator();
    const colorBtns = COLORS.map(c =>
      `<button class="educator-color-btn ${ed.color === c ? 'on' : ''}" type="button"
        data-educator-action="pick-color" data-color="${c}"
        style="background:${c}"></button>`
    ).join('');

    const syncCfg = window.SyncModule?.getCurrentConfig?.() || {};
    const syncStatus = window.SyncModule?.status?.() || {};
    const statusBadge = ({
      on: '<span style="color:#16a34a">Synchro active</span>',
      off: '<span style="color:#6b7280">Synchro desactivee</span>',
      pending: '<span style="color:#d97706">Synchro en cours...</span>',
      error: `<span style="color:#dc2626">Erreur : ${h(syncStatus.error || '')}</span>`,
    })[syncStatus.status] || '';

    return `<div class="modal-overlay" id="educator-modal-overlay">
      <div class="modal-box" style="max-width:480px">
        <div class="modal-head">
          <div><div class="card-kicker">Configuration</div><h3>Educateur</h3></div>
          <button class="modal-close" type="button" data-educator-action="close-config">x</button>
        </div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
          Votre nom apparait sur chaque seance et observation que vous saisissez.
        </p>
        <div class="field-group">
          <label class="field-label">Votre nom</label>
          <input class="field-input" id="educator-name-input" type="text"
            value="${h(ed.name || '')}" placeholder="Prenom Nom...">
        </div>
        <div class="field-group" style="margin-top:12px">
          <label class="field-label">Couleur</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${colorBtns}</div>
        </div>

        <div style="border-top:1px solid #e5e7eb;margin:18px 0 12px;padding-top:14px">
          <div class="card-kicker">Synchro multi-coach</div>
          <div style="font-size:13px;font-weight:500;margin-bottom:6px">Supabase ${statusBadge}</div>
          <p style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.4">
            Configure les identifiants Supabase de ton club pour partager
            blessures / semaines / presences entre tous les educateurs.
          </p>
          <div class="field-group" style="margin-bottom:8px">
            <label class="field-label">URL Supabase</label>
            <input class="field-input" id="sync-url-input" type="url"
              value="${h(syncCfg.url || '')}" placeholder="https://xxxxx.supabase.co">
          </div>
          <div class="field-group" style="margin-bottom:8px">
            <label class="field-label">Anon key</label>
            <input class="field-input" id="sync-anon-input" type="text"
              value="${h(syncCfg.anonKeyFull || '')}" placeholder="eyJhbGc...">
          </div>
          <div class="field-group">
            <label class="field-label">Code club</label>
            <input class="field-input" id="sync-club-input" type="text"
              value="${h(syncCfg.clubCode || '')}" placeholder="louverne-lsca">
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" type="button" data-educator-action="sync-now"
            style="margin-right:auto">Synchroniser maintenant</button>
          <button class="btn-ghost" type="button" data-educator-action="close-config">Annuler</button>
          <button class="btn-primary" type="button" data-educator-action="save-config">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  function renderModal() {
    let el = document.querySelector('#educator-modal-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'educator-modal-root';
      document.body.appendChild(el);
    }
    el.innerHTML = configOpen ? renderConfigModal() : '';
  }

  function handleAction(target) {
    const ea = target.dataset.educatorAction;
    if (!ea) return false;

    if (ea === 'open-config') {
      configOpen = true;
      tempColor = loadEducator().color || '#185fa5';
      renderModal();
      return true;
    }
    if (ea === 'close-config') {
      configOpen = false;
      renderModal();
      return true;
    }
    if (ea === 'pick-color') {
      tempColor = target.dataset.color;
      document.querySelectorAll('.educator-color-btn').forEach(btn => {
        btn.classList.toggle('on', btn.dataset.color === tempColor);
      });
      return true;
    }
    if (ea === 'save-config') {
      const name = (document.querySelector('#educator-name-input')?.value || '').trim();
      const ed = loadEducator();
      const color = tempColor || ed.color || '#185fa5';
      saveEducator({ ...ed, name, color });

      const url = (document.querySelector('#sync-url-input')?.value || '').trim();
      const anonKey = (document.querySelector('#sync-anon-input')?.value || '').trim();
      const clubCode = (document.querySelector('#sync-club-input')?.value || '').trim();
      if (window.SyncModule?.setConfig) {
        window.SyncModule.setConfig({ url, anonKey, clubCode });
      }

      configOpen = false;
      renderModal();
      injectBadge();
      window.appUtils?.showToast('Profil & synchro mis a jour');
      return true;
    }
    if (ea === 'sync-now') {
      window.SyncModule?.pull?.().then(() => window.SyncModule?.push?.()).then(() => {
        window.appUtils?.showToast('Synchro terminee');
      }).catch(err => window.appUtils?.showToast('Erreur synchro : ' + err.message));
      return true;
    }
    return false;
  }

  window.EducatorModule = {
    getEducator,
    getEducatorName,
    getEducatorId,
    injectBadge,
    handleAction,
    renderModal
  };

  injectBadge();

  if (window.SyncModule?.onStatusChange) {
    window.SyncModule.onStatusChange(() => injectBadge());
  } else {
    setTimeout(() => {
      window.SyncModule?.onStatusChange?.(() => injectBadge());
      injectBadge();
    }, 1500);
  }
})();

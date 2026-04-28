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
    return `<button class="educator-badge" type="button" data-educator-action="open-config" title="Profil éducateur" style="${ed.name ? 'border-color:' + ed.color : ''}">
      <span class="educator-dot" style="background:${ed.color || '#185fa5'}"></span>
      <span>${h(name)}</span>
    </button>`;
  }

  function injectBadge() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    const existing = navRight.querySelector('.educator-badge');
    if (existing) existing.remove();
    navRight.insertAdjacentHTML('afterbegin', renderBadgeHtml());
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
    return `<div class="modal-overlay" id="educator-modal-overlay">
      <div class="modal-box" style="max-width:380px">
        <div class="modal-head">
          <div><div class="card-kicker">Configuration</div><h3>Éducateur / Éducatrice</h3></div>
          <button class="modal-close" type="button" data-educator-action="close-config">×</button>
        </div>
        <p style="font-size:12px;color:var(--text3);margin-bottom:14px">
          Votre nom apparaît sur chaque séance et observation que vous saisissez.
        </p>
        <div class="field-group">
          <label class="field-label">Votre nom</label>
          <input class="field-input" id="educator-name-input" type="text"
            value="${h(ed.name || '')}" placeholder="Prénom Nom...">
        </div>
        <div class="field-group" style="margin-top:12px">
          <label class="field-label">Couleur</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${colorBtns}</div>
        </div>
        <div class="modal-footer">
          <span style="flex:1"></span>
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
      configOpen = false;
      renderModal();
      injectBadge();
      window.appUtils?.showToast('Profil éducateur mis à jour');
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

  /* Auto-inject badge once DOM is ready (app.js already ran) */
  injectBadge();
})();

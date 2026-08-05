/**
 * pwa.js — Enregistrement du Service Worker + gestion installation
 *
 * - Enregistre sw.js si supporté
 * - Capture l'événement beforeinstallprompt pour afficher un bouton "Installer"
 *   uniquement quand le navigateur le propose
 * - Gère le clic sur data-action="install-pwa"
 * - Affiche un toast quand une nouvelle version du SW est dispo
 *
 * Indépendant des autres modules : peut être chargé en dernier.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  let deferredPrompt = null;

  /* ── Enregistrement du SW ─────────────────────────────── */

  if ('serviceWorker' in navigator) {
    let reloadingForUpdate = false;

    // Quand un nouveau SW prend le contrôle → reload automatique (une fois)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => {
          // Détecter une nouvelle version pendant l'utilisation
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Nouvelle version installée en attente → on la force à prendre le relais
                // (le SW appelle déjà skipWaiting sur install, mais on double-tape par sécurité)
                window.appUtils?.showToast?.('Mise à jour appliquée — actualisation...');
                newWorker.postMessage('SKIP_WAITING');
              }
            });
          });
        })
        .catch(err => console.warn('SW register:', err.message));
    });
  }

  /* ── Capture de l'événement beforeinstallprompt ──────── */

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const item = document.querySelector('#install-pwa-item');
    if (item) item.hidden = false;
  });

  // Quand l'app est installée → on cache le bouton et on toast
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const item = document.querySelector('#install-pwa-item');
    if (item) item.hidden = true;
    window.appUtils?.showToast?.('App installée — retrouve-la dans tes apps');
  });

  /* ── Détection iOS Safari (pas de beforeinstallprompt) ──── */

  function isIosSafari() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    return isIOS && isSafari;
  }
  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
  }

  // Sur iOS, on affiche quand même l'item du menu (au clic on guidera)
  if (isIosSafari() && !isStandalone()) {
    document.addEventListener('DOMContentLoaded', () => {
      const item = document.querySelector('#install-pwa-item');
      if (item) item.hidden = false;
    });
  }

  /* ── Handler action install-pwa ──────────────────────── */

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action="install-pwa"]');
    if (!t) return;

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          window.appUtils?.showToast?.('Installation en cours...');
        }
        deferredPrompt = null;
      });
    } else if (isIosSafari()) {
      // Pas d'API native sur iOS Safari : on guide
      alert(
        'Pour installer l\'app sur iPhone/iPad :\n\n' +
        '1. Appuie sur le bouton de partage (carré avec flèche vers le haut)\n' +
        '2. Choisis « Sur l\'écran d\'accueil »\n' +
        '3. Confirme « Ajouter »'
      );
    } else {
      window.appUtils?.showToast?.('Installation indisponible — utilise le menu navigateur');
    }
  });

  /* ── Détection deep-link via query string ────────────── */
  // Permet aux shortcuts du manifest.json de pointer un état initial
  // (ex. ?view=team, ?action=postmatch)
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const action = params.get('action');
    if (!view && !action) return;
    // On attend que appState soit prêt
    const apply = () => {
      const state = window.appState;
      if (!state) return setTimeout(apply, 100);
      if (view && ['dashboard', 'player', 'team', 'weekly', 'bilans'].includes(view)) {
        state.view = view;
        window.appUtils?.renderAll?.();
      }
      if (action === 'postmatch') {
        window.PostMatchModule?.open?.(state.cat);
      }
    };
    setTimeout(apply, 200);
  });

  window.PWAModule = {
    canInstall: () => Boolean(deferredPrompt) || isIosSafari(),
    isStandalone,
  };
})();

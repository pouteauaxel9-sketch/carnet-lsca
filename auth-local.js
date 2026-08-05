/**
 * auth-local.js — Stub minimal (mono-utilisateur, 2026-08).
 *
 * Le système multi-éducateurs a été retiré car Axel est le seul
 * utilisateur de l'app. Cet objet reste exposé pour la compatibilité
 * avec les autres modules (attendance, evaluation, observation, pdf,
 * post-match) qui appellent EducatorModule.getEducator[Name/Id]().
 *
 * Peut être définitivement supprimé plus tard si aucun module ne l'appelle.
 */
(function () {
  'use strict';

  const EDUCATOR = { id: 'axel', name: 'Axel Pouteau', color: '#009640' };

  function getEducator()     { return EDUCATOR; }
  function getEducatorName() { return EDUCATOR.name; }
  function getEducatorId()   { return EDUCATOR.id; }

  // handleAction reste no-op pour ne pas casser le dispatcher registre
  function handleAction() { return false; }

  window.EducatorModule = {
    getEducator, getEducatorName, getEducatorId, handleAction,
  };
})();

/**
 * feeds-form.js — DEPRECATED (2026-08).
 *
 * Ce module servait à éditer manuellement les classements et matchs dans
 * une modal tabulaire. Il a été retiré car :
 *   - Les classements sont désormais scrappés automatiquement depuis le
 *     site FFF (via Supabase → state.remoteClubData) — plus besoin de
 *     saisie manuelle.
 *   - Les blocs "Matchs à venir" et "Résultats" ont été supprimés du
 *     dashboard.
 *
 * Le fichier reste présent (vide) pour éviter les erreurs 404 chez les
 * navigateurs qui gardent l'ancien service worker en cache. Il n'est
 * plus référencé dans index.html ni dans sw.js.
 *
 * Peut être définitivement supprimé après quelques semaines de production.
 */

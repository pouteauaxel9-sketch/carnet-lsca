# 🔍 Audit fonctionnel P'tits Verts

> Démarré le : 2026-10-27
> Objectif : passer en revue chaque fonctionnalité de l'app pour décider : **garder tel quel / ajuster / supprimer**.

## Comment remplir

Pour chaque feature, 3 colonnes :

- **État** : 🟢 OK · 🟡 Bof · 🔴 KO · ⚪ Jamais testé
- **Utilité** : ⭐ (0) · ⭐ (1) · ⭐⭐ (2) · ⭐⭐⭐ (3)
- **Action** : ✅ Garder · 🔧 Ajuster · ❌ Supprimer · 💤 En veille

Note libre à la fin de la ligne si besoin.

---

## 🏠 Zone 1 — Dashboard (page d'accueil)

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 1.1 | Carte hero (nom de la catégorie, bouton Mode Terrain) | | | | |
| 1.2 | Widget 🎂 Anniversaires à venir (30 j) | | | | |
| 1.3 | Carte "Semaine en cours" (axe + principes FFF) | | | | |
| 1.4 | Carte "Prochaine séance" | | | | |
| 1.5 | Carte Stats rapides (nb joueurs, séances) | | | | |
| 1.6 | Switch catégorie (U9/U11/U13) en haut | | | | |
| 1.7 | Menu ⋯ (Import/Export JSON, options) | | | | |

---

## 👤 Zone 2 — Fiche Joueur

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 2.1 | Mini-onglets (Identité / Sportif / Suivi / Jonglerie / Historique) | | | | |
| 2.2 | Identité (nom, prénom, naissance, numéro licence) | | | | |
| 2.3 | Profil sportif (pied fort, poste1, poste2, équipe) | | | | |
| 2.4 | Masquage postes pour U9 | | | | |
| 2.5 | Suivi joueur (notes libres, objectifs individuels) | | | | |
| 2.6 | Carnet de jonglerie (log pied D/G, tête, tempo) | | | | |
| 2.7 | Historique séances/matchs du joueur | | | | |
| 2.8 | Bouton "Joueur parti" (left = true) | | | | |
| 2.9 | Export PDF rapport joueur | | | | |
| 2.10 | Photo joueur | | | | |

---

## 📝 Zone 3 — Fiche Pré-séance (préparation)

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 3.1 | Sélection date séance | | | | |
| 3.2 | Objectif principal (texte libre) | | | | |
| 3.3 | Toggle Présents (coche/décoche joueurs) | | | | |
| 3.4 | Bouton "Tous présents / Aucun" | | | | |
| 3.5 | Composition équipes (drag & drop vert/bleu) | | | | |
| 3.6 | Sélection Principes FFF (toggle N° par N°) | | | | |
| 3.7 | Timing séance (durée blocs) | | | | |
| 3.8 | Rappels / consignes (texte libre) | | | | |
| 3.9 | Export PDF bi-fold (portrait + paysage sur même feuille) | | | | |
| 3.10 | Persistance automatique du brouillon | | | | |

---

## ⚽ Zone 4 — Mode Terrain (séance en live)

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 4.1 | Démarrage séance (bouton principal) | | | | |
| 4.2 | Pointage présents (depuis prépa ou live) | | | | |
| 4.3 | Timer / chrono visible | | | | |
| 4.4 | Rappel des objectifs (principes FFF filtrés) | | | | |
| 4.5 | Prise de notes rapides pendant séance | | | | |
| 4.6 | Évaluation étoiles 5 catégories en fin de séance | | | | |
| 4.7 | Notes libres bilan fin de séance | | | | |
| 4.8 | Lecture tablette/téléphone (ergonomie extérieur) | | | | |

---

## 📊 Zone 5 — Bilans & Historique

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 5.1 | Liste séances réalisées | | | | |
| 5.2 | Détail d'une séance (prépa + bilan + étoiles) | | | | |
| 5.3 | Semaine en cours (axe + principes) | | | | |
| 5.4 | Plan saison (vue d'ensemble) | | | | |
| 5.5 | Vue transverse (toutes catégories) | | | | |
| 5.6 | Vue équipe (par équipe principale) | | | | |
| 5.7 | Vue directeur (synthèse globale) | | | | |
| 5.8 | Stats avancées (progression, graphs) | | | | |
| 5.9 | Observation match | | | | |
| 5.10 | Post-match (bilan rencontre) | | | | |
| 5.11 | Carrière joueur (évolution long terme) | | | | |
| 5.12 | Blessures / absences (injury) | | | | |

---

## 🔄 Zone 6 — Sync & Sauvegarde

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 6.1 | Sync Supabase cloud (PC ↔ téléphone) | | | | |
| 6.2 | Pull auto toutes les 60 s | | | | |
| 6.3 | Pull au retour sur l'onglet (visibilitychange) | | | | |
| 6.4 | Export JSON manuel | | | | |
| 6.5 | Import JSON manuel | | | | |
| 6.6 | Rappel auto-backup 15 jours | | | | |
| 6.7 | PWA installable (icône bureau/home) | | | | |
| 6.8 | Mode offline (service worker) | | | | |

---

## 📄 Zone 7 — Exports PDF

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 7.1 | PDF fiche pré-séance (bi-fold) | | | | |
| 7.2 | PDF rapport joueur (identité + jonglerie + matchs) | | | | |
| 7.3 | Export Excel (effectif, stats) | | | | |

---

## 🎨 Zone 8 — Design & UX

| # | Fonctionnalité | État | Utilité | Action | Notes |
|---|---|---|---|---|---|
| 8.1 | Design system (couleurs Louverné, tokens) | | | | |
| 8.2 | Lisibilité mobile (phone en poche extérieur) | | | | |
| 8.3 | Navigation (menu principal, cohérence) | | | | |
| 8.4 | Vitesse de chargement | | | | |
| 8.5 | Icônes / splash screen PWA | | | | |

---

## 📋 Synthèse post-audit (à remplir à la fin)

### 🔴 À ajuster en priorité
- …

### ❌ À supprimer (gras)
- …

### 💡 Idées nouvelles qui ont émergé
- …

### ✅ Fonctionnalités phares (ne pas toucher)
- …

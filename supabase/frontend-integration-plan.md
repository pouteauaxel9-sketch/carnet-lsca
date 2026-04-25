# Frontend Integration Plan

## But

Brancher progressivement l'app actuelle sur Supabase sans casser l'existant.

## Ordre conseille

1. Connecter seulement le dashboard club.
2. Lire depuis Supabase :
   - `clubs`
   - `club_identities`
   - `categories`
   - `teams`
   - `team_sources`
   - `standings`
   - `fixtures`
   - `results`
3. Garder les fiches joueurs en local au debut.
4. Migrer les joueurs ensuite.

## Ce qu'il faudra ajouter dans l'app

### Fichier config

Exemple futur :

```js
const SUPABASE_URL = '...';
const SUPABASE_ANON_KEY = '...';
```

### Services a creer

- `supabaseClient.js`
- `clubService.js`
- `teamService.js`
- `playerService.js`
- `syncService.js`

### Requetes principales

- charger le club actif
- charger les categories
- charger les equipes d'une categorie
- charger les classements
- charger les matchs a venir
- charger les resultats
- charger le statut de synchro

## Principe de migration douce

Tant que Supabase n'est pas branche :

- l'app continue avec ses constantes locales

Quand Supabase est pret :

- dashboard lit en priorite Supabase
- sinon fallback local

## Decision recommande

Ne pas migrer toute la logique joueur d'un coup.

Commencer par :

1. dashboard
2. categories / equipes
3. joueurs

# Architecture Cible

## Objectif

Faire evoluer l'application de `fiche joueur locale` vers `plateforme club connectee`.

## Niveaux du produit

1. `Dashboard club`
   Vue d'accueil avec :
   - matchs passes
   - matchs a venir
   - classements
   - infos diverses
   - acces aux categories

2. `Vue categorie`
   Vue d'ensemble d'une categorie :
   - effectif
   - equipes
   - statut des sources
   - acces fiches joueurs

3. `Vue joueur`
   Fiche individuelle :
   - profil
   - evaluation
   - jonglerie
   - commentaires
   - progression

## Pourquoi ce schema SQL

Il separe bien :

- le `club`
- les `identites`
- les `categories`
- les `equipes`
- les `sources externes`
- les `donnees synchronisees`
- les `donnees joueur`

Ca permet :

- plusieurs equipes dans une categorie
- plusieurs identites de club selon la categorie
- stockage durable
- synchronisation automatique
- futur multi-coachs

## Tables importantes

- `clubs`
  Le projet principal.
- `club_identities`
  Gere `Louverne Sports` et `GJ LSCA`.
- `categories`
  U13, U11, U9, etc.
- `teams`
  U13 A, U13 B, U13 C, U12...
- `team_sources`
  URLs FFF et statut de synchro.
- `standings`
  Classements.
- `fixtures`
  Matchs a venir.
- `results`
  Matchs passes.
- `players`
  Joueurs.
- `player_evaluations`
  Evaluation par saison.
- `player_ratings`
  Notes detaillees.
- `juggling_results`
  Scores de jonglerie.
- `sync_logs`
  Historique de synchronisation.

## Strategie d'integration conseillee

### Phase 1

Mettre en place Supabase en lecture seule pour :

- dashboard club
- equipes
- sources
- standings
- fixtures
- results

### Phase 2

Migrer les fiches joueurs :

- `players`
- `player_objectives`
- `player_evaluations`
- `player_ratings`
- `juggling_results`

### Phase 3

Ajouter :

- authentification coachs
- roles
- historique de synchro
- planning d'entrainement

## Mapping de ton besoin actuel

- `U7 a U11 + seniors`
  `Louverne Sports`
- `U12 a U18`
  `GJ LSCA`

### Sources configurees

- `U13 A`
- `U12`

### Sources en attente

- `U13 B`
- `U13 C`

## Prochaine etape technique

Quand tu voudras aller plus loin, il faudra que je te prepare :

1. le client Supabase dans le frontend
2. une Edge Function de synchronisation FFF
3. les requetes pour remplacer les donnees locales du dashboard

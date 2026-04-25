# Supabase Setup

Ce dossier prepare la V2 backend du projet.

## Fichiers

- `schema.sql`
  Cree la structure complete de la base.
- `seed.sql`
  Insere le club, les identites, les categories, les equipes et les sources FFF deja connues.

## Ordre d'installation

1. Creer un projet Supabase.
2. Ouvrir l'editeur SQL.
3. Executer `schema.sql`.
4. Executer `seed.sql`.
5. Remplir `supabase-config.js` a la racine du projet avec :
   - `url`
   - `anonKey`
   - `clubCode`
   - `season`
6. Recharger l'application.

## Ce qui est deja modele

- Club principal : `Louverne Sports - GJ LSCA`
- Identites :
  - `Louverne Sports`
  - `GJ LSCA`
- Categories :
  - `U13`
  - `U11`
  - `U9`
- Equipes configurees :
  - `U13 A`
  - `U13 B`
  - `U13 C`
  - `U12`
- Sources FFF configurees :
  - `U13 A`
  - `U12`
- Sources en attente :
  - `U13 B`
  - `U13 C`

## Etape suivante recommandee

Creer une Edge Function Supabase, par exemple `sync_fff_team`, qui :

1. lit `team_sources`
2. recupere les pages FFF
3. normalise les donnees
4. remplit :
   - `standings`
   - `fixtures`
   - `results`
   - `sync_logs`

## Variables a preparer plus tard

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Fichiers frontend ajoutes

- `supabase-config.js`
  Fichier local a remplir.
- `supabase-config.example.js`
  Modele d'exemple.
- `supabase-service.js`
  Couche de lecture Supabase par API REST.

## Integration frontend plus tard

L'app actuelle pourra ensuite :

1. lire les donnees club depuis Supabase
2. remplacer progressivement les constantes locales
3. garder le localStorage uniquement comme mode secours ou brouillon local

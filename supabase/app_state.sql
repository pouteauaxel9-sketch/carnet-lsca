-- ====================================================================
-- app_state — Synchronisation multi-coach des données de l'application
-- ====================================================================
-- Une seule table générique qui stocke n'importe quel "blob" JSON
-- partagé entre les éducateurs d'un même club, identifié par club_code.
--
-- Storage keys utilisées par l'app :
--   - 'weekly_focus' : grille hebdo + ratings + flash (mode terrain)
--   - 'injury'       : blessures par catégorie / joueur
--   - 'attendance'   : pointages assiduité
--   - 'player_data'  : optionnellement le state principal (ratings piliers, profils...)
--
-- Le champ updated_by permet de tracer quel coach a écrit en dernier.
-- Le champ updated_at sert au last-writer-wins pour la résolution de conflits.
--
-- Politique RLS : un coach authentifié (via anon key) peut lire/écrire
-- toutes les lignes de son club. Le filtre se fait via club_code dans
-- l'URL de requête. Pour des droits plus fins (par catégorie), prévoir
-- une évolution avec auth.uid().
-- ====================================================================

create table if not exists public.app_state (
  id uuid primary key default gen_random_uuid(),
  club_code text not null,
  storage_key text not null,
  payload jsonb not null,
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (club_code, storage_key)
);

create index if not exists app_state_club_idx on public.app_state (club_code);

-- Trigger pour bumper updated_at automatiquement
drop trigger if exists app_state_set_updated_at on public.app_state;
create trigger app_state_set_updated_at
  before update on public.app_state
  for each row execute function public.set_updated_at();

-- RLS
alter table public.app_state enable row level security;

drop policy if exists "app_state read" on public.app_state;
create policy "app_state read" on public.app_state
  for select using (true);

drop policy if exists "app_state write" on public.app_state;
create policy "app_state write" on public.app_state
  for insert with check (true);

drop policy if exists "app_state update" on public.app_state;
create policy "app_state update" on public.app_state
  for update using (true) with check (true);

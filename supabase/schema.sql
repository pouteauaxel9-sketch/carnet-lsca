create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  default_season text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.club_identities (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  label text not null,
  age_from integer,
  age_to integer,
  category_codes text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  code text not null,
  label text not null,
  age_band text,
  is_results_official boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (club_id, code)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  identity_id uuid references public.club_identities(id) on delete set null,
  code text not null,
  label text not null,
  official_name text,
  team_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (club_id, code)
);

create table if not exists public.team_sources (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  provider text not null default 'fff',
  provider_area text not null default 'district-mayenne',
  status text not null default 'pending' check (status in ('pending', 'configured', 'connected', 'error')),
  ranking_url text,
  agenda_url text,
  results_url text,
  provider_competition_id text,
  provider_phase text,
  provider_pool text,
  provider_type text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  full_name text not null,
  first_name text,
  last_name text,
  gender text check (gender in ('male', 'female', 'mixed', 'unknown')),
  birth_date date,
  license_number text,
  dominant_foot text,
  main_position text,
  secondary_position text,
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  years_at_club integer,
  parent_contact text,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.player_objectives (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  season text not null,
  objective_order integer not null default 0,
  label text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.player_evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  category_code text not null,
  season text not null,
  global_score integer not null default 0 check (global_score between 0 and 100),
  coach_comment text,
  self_comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (player_id, category_code, season)
);

create table if not exists public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.player_evaluations(id) on delete cascade,
  pillar_key text not null,
  criterion_index integer not null,
  criterion_label text not null,
  rating integer not null default 0 check (rating between 0 and 4),
  comment text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (evaluation_id, pillar_key, criterion_index)
);

create table if not exists public.juggling_results (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  category_code text not null,
  season text not null,
  score integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (player_id, category_code, season)
);

create table if not exists public.standings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season text not null,
  competition_label text,
  rank_text text,
  points integer,
  played integer,
  won integer,
  drawn integer,
  lost integer,
  goals_for integer,
  goals_against integer,
  goal_difference integer,
  raw_payload jsonb,
  source_snapshot_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season text not null,
  competition_label text,
  external_match_id text,
  match_date timestamptz,
  home_team text not null,
  away_team text not null,
  venue text,
  is_home boolean,
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled', 'played')),
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  season text not null,
  competition_label text,
  external_match_id text,
  match_date timestamptz,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  is_home boolean,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.training_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  location text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  team_source_id uuid references public.team_sources(id) on delete set null,
  provider text not null default 'fff',
  status text not null check (status in ('started', 'success', 'error')),
  step text,
  message text,
  details jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_categories_club_code on public.categories(club_id, code);
create index if not exists idx_teams_category on public.teams(category_id);
create index if not exists idx_players_category on public.players(category_id);
create index if not exists idx_players_team on public.players(team_id);
create index if not exists idx_player_evaluations_player_season on public.player_evaluations(player_id, season);
create index if not exists idx_standings_team_season on public.standings(team_id, season);
create index if not exists idx_fixtures_team_season on public.fixtures(team_id, season);
create index if not exists idx_results_team_season on public.results(team_id, season);
create index if not exists idx_sync_logs_source_created on public.sync_logs(team_source_id, created_at desc);

create trigger set_updated_at_clubs before update on public.clubs for each row execute function public.set_updated_at();
create trigger set_updated_at_club_identities before update on public.club_identities for each row execute function public.set_updated_at();
create trigger set_updated_at_categories before update on public.categories for each row execute function public.set_updated_at();
create trigger set_updated_at_teams before update on public.teams for each row execute function public.set_updated_at();
create trigger set_updated_at_team_sources before update on public.team_sources for each row execute function public.set_updated_at();
create trigger set_updated_at_players before update on public.players for each row execute function public.set_updated_at();
create trigger set_updated_at_player_objectives before update on public.player_objectives for each row execute function public.set_updated_at();
create trigger set_updated_at_player_evaluations before update on public.player_evaluations for each row execute function public.set_updated_at();
create trigger set_updated_at_player_ratings before update on public.player_ratings for each row execute function public.set_updated_at();
create trigger set_updated_at_juggling_results before update on public.juggling_results for each row execute function public.set_updated_at();
create trigger set_updated_at_standings before update on public.standings for each row execute function public.set_updated_at();
create trigger set_updated_at_fixtures before update on public.fixtures for each row execute function public.set_updated_at();
create trigger set_updated_at_results before update on public.results for each row execute function public.set_updated_at();
create trigger set_updated_at_training_slots before update on public.training_slots for each row execute function public.set_updated_at();

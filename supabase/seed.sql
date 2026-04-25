begin;

with inserted_club as (
  insert into public.clubs (code, display_name, default_season, notes)
  values ('louverne-lsca', 'Louverne Sports - GJ LSCA', '2025-2026', 'Projet progression joueur et dashboard club')
  on conflict (code) do update
  set display_name = excluded.display_name,
      default_season = excluded.default_season,
      notes = excluded.notes
  returning id
)
insert into public.club_identities (club_id, label, age_from, age_to, category_codes)
select id, 'Louverne Sports', 7, 11, array['u7','u9','u11','seniors']
from inserted_club
on conflict do nothing;

with inserted_club as (
  select id from public.clubs where code = 'louverne-lsca'
)
insert into public.club_identities (club_id, label, age_from, age_to, category_codes)
select id, 'GJ LSCA', 12, 18, array['u12','u13','u14','u15','u16','u17','u18']
from inserted_club
on conflict do nothing;

with club_ref as (
  select id from public.clubs where code = 'louverne-lsca'
)
insert into public.categories (club_id, code, label, age_band, is_results_official, display_order)
select id, 'u13', 'U13', 'U12-U13', true, 10 from club_ref
on conflict (club_id, code) do update
set label = excluded.label,
    age_band = excluded.age_band,
    is_results_official = excluded.is_results_official,
    display_order = excluded.display_order;

with club_ref as (
  select id from public.clubs where code = 'louverne-lsca'
)
insert into public.categories (club_id, code, label, age_band, is_results_official, display_order)
select id, 'u11', 'U11', 'U10-U11', false, 20 from club_ref
on conflict (club_id, code) do update
set label = excluded.label,
    age_band = excluded.age_band,
    is_results_official = excluded.is_results_official,
    display_order = excluded.display_order;

with club_ref as (
  select id from public.clubs where code = 'louverne-lsca'
)
insert into public.categories (club_id, code, label, age_band, is_results_official, display_order)
select id, 'u9', 'U9', 'U8-U9', false, 30 from club_ref
on conflict (club_id, code) do update
set label = excluded.label,
    age_band = excluded.age_band,
    is_results_official = excluded.is_results_official,
    display_order = excluded.display_order;

with refs as (
  select
    c.id as club_id,
    cat.id as category_id,
    ci.id as identity_id
  from public.clubs c
  join public.categories cat on cat.club_id = c.id and cat.code = 'u13'
  join public.club_identities ci on ci.club_id = c.id and ci.label = 'GJ LSCA'
  where c.code = 'louverne-lsca'
)
insert into public.teams (club_id, category_id, identity_id, code, label, official_name, team_order)
select club_id, category_id, identity_id, 'u13a', 'U13 A', 'GJ LSCA LOUVERNE', 1 from refs
on conflict (club_id, code) do update
set label = excluded.label,
    official_name = excluded.official_name,
    team_order = excluded.team_order;

with refs as (
  select
    c.id as club_id,
    cat.id as category_id,
    ci.id as identity_id
  from public.clubs c
  join public.categories cat on cat.club_id = c.id and cat.code = 'u13'
  join public.club_identities ci on ci.club_id = c.id and ci.label = 'GJ LSCA'
  where c.code = 'louverne-lsca'
)
insert into public.teams (club_id, category_id, identity_id, code, label, official_name, team_order)
select club_id, category_id, identity_id, 'u13b', 'U13 B', 'GJ LSCA LOUVERNE 2', 2 from refs
on conflict (club_id, code) do update
set label = excluded.label,
    official_name = excluded.official_name,
    team_order = excluded.team_order;

with refs as (
  select
    c.id as club_id,
    cat.id as category_id,
    ci.id as identity_id
  from public.clubs c
  join public.categories cat on cat.club_id = c.id and cat.code = 'u13'
  join public.club_identities ci on ci.club_id = c.id and ci.label = 'GJ LSCA'
  where c.code = 'louverne-lsca'
)
insert into public.teams (club_id, category_id, identity_id, code, label, official_name, team_order)
select club_id, category_id, identity_id, 'u13c', 'U13 C', 'GJ LSCA LOUVERNE 3', 3 from refs
on conflict (club_id, code) do update
set label = excluded.label,
    official_name = excluded.official_name,
    team_order = excluded.team_order;

with refs as (
  select
    c.id as club_id,
    cat.id as category_id,
    ci.id as identity_id
  from public.clubs c
  join public.categories cat on cat.club_id = c.id and cat.code = 'u13'
  join public.club_identities ci on ci.club_id = c.id and ci.label = 'GJ LSCA'
  where c.code = 'louverne-lsca'
)
insert into public.teams (club_id, category_id, identity_id, code, label, official_name, team_order)
select club_id, category_id, identity_id, 'u12', 'U12', 'GJ LSCA LOUVERNE 21', 4 from refs
on conflict (club_id, code) do update
set label = excluded.label,
    official_name = excluded.official_name,
    team_order = excluded.team_order;

insert into public.team_sources (
  team_id,
  provider,
  provider_area,
  status,
  ranking_url,
  agenda_url,
  results_url,
  provider_competition_id,
  provider_phase,
  provider_pool,
  provider_type
)
select
  t.id,
  'fff',
  'district-mayenne',
  'configured',
  'https://mayenne.fff.fr/competitions?tab=ranking&id=437629&phase=2&poule=2&type=ch',
  'https://mayenne.fff.fr/competitions?tab=agenda&id=437629&phase=2&poule=2&type=ch',
  'https://mayenne.fff.fr/competitions?doing_wp_cron=1777045696.9000658988952636718750&id=437629&poule=2&phase=2&type=ch&tab=resultat&beginWeek=06%2F04%2F2026&endweek=12%2F04%2F2026',
  '437629',
  '2',
  '2',
  'ch'
from public.teams t
join public.clubs c on c.id = t.club_id
where c.code = 'louverne-lsca' and t.code = 'u13a'
on conflict (team_id) do update
set status = excluded.status,
    ranking_url = excluded.ranking_url,
    agenda_url = excluded.agenda_url,
    results_url = excluded.results_url,
    provider_competition_id = excluded.provider_competition_id,
    provider_phase = excluded.provider_phase,
    provider_pool = excluded.provider_pool,
    provider_type = excluded.provider_type;

insert into public.team_sources (
  team_id,
  provider,
  provider_area,
  status,
  ranking_url,
  agenda_url,
  results_url,
  provider_competition_id,
  provider_phase,
  provider_pool,
  provider_type
)
select
  t.id,
  'fff',
  'district-mayenne',
  'configured',
  'https://mayenne.fff.fr/competitions?tab=ranking&id=437631&phase=2&poule=1&type=ch',
  'https://mayenne.fff.fr/competitions?tab=agenda&id=437631&phase=2&poule=1&type=ch&beginWeek=2026-05-04&endWeek=2026-05-10&limitWeek=2026-04-20',
  'https://mayenne.fff.fr/competitions?tab=resultat&id=437631&phase=2&poule=1&type=ch&beginWeek=13%2F04%2F2026&endweek=19%2F04%2F2026',
  '437631',
  '2',
  '1',
  'ch'
from public.teams t
join public.clubs c on c.id = t.club_id
where c.code = 'louverne-lsca' and t.code = 'u12'
on conflict (team_id) do update
set status = excluded.status,
    ranking_url = excluded.ranking_url,
    agenda_url = excluded.agenda_url,
    results_url = excluded.results_url,
    provider_competition_id = excluded.provider_competition_id,
    provider_phase = excluded.provider_phase,
    provider_pool = excluded.provider_pool,
    provider_type = excluded.provider_type;

insert into public.team_sources (team_id, provider, provider_area, status)
select t.id, 'fff', 'district-mayenne', 'pending'
from public.teams t
join public.clubs c on c.id = t.club_id
where c.code = 'louverne-lsca' and t.code in ('u13b', 'u13c')
on conflict (team_id) do update
set status = excluded.status;

commit;

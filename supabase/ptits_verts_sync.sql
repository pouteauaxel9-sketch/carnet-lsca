-- ====================================================================
-- ptits_verts — Table de sync pour l'app P'tits Verts
-- ====================================================================
-- Une seule ligne (id='main') contient tout le state de l'app en JSON.
-- Le module sync-supabase.js lit/écrit cette unique ligne depuis chaque
-- device, avec un last-writer-wins basé sur updated_at.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL Supabase
-- (SQL Editor → New query → coller → Run).
-- ====================================================================

create table if not exists public.ptits_verts (
  id          text primary key,
  data        jsonb not null,
  device_hint text,
  updated_at  timestamptz not null default timezone('utc', now())
);

-- Row Level Security activée + policies "allow all"
-- (lecture et écriture ouvertes avec la clé publishable, ce qui est OK
-- pour cette app en usage perso club. Pour multi-tenant plus tard, on
-- raffinera avec auth.uid()).
alter table public.ptits_verts enable row level security;

drop policy if exists "ptits_verts read anon"   on public.ptits_verts;
drop policy if exists "ptits_verts insert anon" on public.ptits_verts;
drop policy if exists "ptits_verts update anon" on public.ptits_verts;

create policy "ptits_verts read anon"
  on public.ptits_verts
  for select
  to anon
  using (true);

create policy "ptits_verts insert anon"
  on public.ptits_verts
  for insert
  to anon
  with check (true);

create policy "ptits_verts update anon"
  on public.ptits_verts
  for update
  to anon
  using (true)
  with check (true);

-- Vérification : la table doit répondre à cette requête
-- select * from public.ptits_verts;

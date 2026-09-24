-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — working as a team (run after 0005)
--
-- 1. profiles: a name for everyone who signs in, so the CRM can say who
--    logged a call or made a change. Each person edits only their own.
-- 2. calls.created_by and activities.actor: filled in automatically with
--    whoever is signed in (website intake has no person, so stays empty).
-- 3. applicants.assigned_to: which of you is looking after a client.
--
-- Personal settings need nothing new: each person gets their own row in
-- the settings table (key "user:<their id>").
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table calls      add column if not exists created_by  uuid default auth.uid() references auth.users(id) on delete set null;
alter table activities add column if not exists actor       uuid default auth.uid() references auth.users(id) on delete set null;
alter table applicants add column if not exists assigned_to uuid references auth.users(id) on delete set null;
create index if not exists applicants_assigned_idx on applicants(assigned_to);

alter table profiles enable row level security;
do $$ begin
  create policy profiles_read on profiles for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy profiles_insert_own on profiles for insert to authenticated with check (id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy profiles_update_own on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
exception when duplicate_object then null; end $$;

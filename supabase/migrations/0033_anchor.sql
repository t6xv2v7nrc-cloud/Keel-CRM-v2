-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: who or what a client must live near (run after 0032)
--
-- Matching brief B6. Many clients must stay near someone or something: a parent they care for, a hospital, the
-- children's school, college. The client record gains:
--   applicants.anchor            in their words: "mum, I care for her", "Northwick Park Hospital"
--   applicants.anchor_postcode   where that is (only its district is ever looked up, never the full postcode)
--   applicants.max_travel_mins   the longest journey they will make to it
-- Properties further than that (a rough bus or train time from the distance) are hidden as too far; the rest are
-- ranked by how near they are. Nothing is filled in here.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0033 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants
--     drop column if exists anchor, drop column if exists anchor_postcode, drop column if exists max_travel_mins;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0033 as table public.applicants;

alter table applicants add column if not exists anchor          text;
alter table applicants add column if not exists anchor_postcode text;
alter table applicants add column if not exists max_travel_mins smallint;

do $$ begin
  alter table applicants add constraint applicants_max_travel_mins_check check (max_travel_mins is null or max_travel_mins between 5 and 240);
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: women-only places (run after 0033)
--
-- Matching brief B7. Some clients can only live somewhere women only, and some properties are only for women:
--   applicants.female_only   true when the client needs a women-only place
--   properties.female_only   true when the property is for women only
-- A client who needs one is only offered women-only places; a women-only place offered to anyone else carries an
-- amber "Women only: check it suits them". Nothing is filled in here.
--
-- Backup: applicants and properties as it was is copied to keel_backup.applicants_before_0034 and keel_backup.properties_before_0034 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants drop column if exists female_only;
--   alter table properties drop column if exists female_only;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0034 as table public.applicants;
create table if not exists keel_backup.properties_before_0034 as table public.properties;

alter table applicants add column if not exists female_only boolean;
alter table properties add column if not exists female_only boolean;

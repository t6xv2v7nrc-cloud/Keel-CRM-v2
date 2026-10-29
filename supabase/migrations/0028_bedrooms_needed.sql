-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: the bedrooms a client needs (run after 0027)
--
-- Matching brief A4. Until now the bedrooms a client needs were only read from their words each time ("2/3 bed",
-- "studio or 1 bed"), and a family's LHA size ignored what they asked for. The record gains one answer:
--   applicants.bedrooms_needed   0 for a studio, 1 to 5 (5 means 5 or more); empty means not recorded, and Keel reads
--                                it from their words instead
-- Nothing is filled in here. The app fills it in from a client's own words when they arrive from the Bin or their
-- notes are saved (never over a typed answer), and Settings has a one-off "Fill in from notes" that shows every
-- change before anything is written.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0028 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants drop column if exists bedrooms_needed;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0028 as table public.applicants;

alter table applicants add column if not exists bedrooms_needed smallint;

do $$ begin
  alter table applicants add constraint applicants_bedrooms_needed_check check (bedrooms_needed is null or bedrooms_needed between 0 and 5);
exception when duplicate_object then null; end $$;

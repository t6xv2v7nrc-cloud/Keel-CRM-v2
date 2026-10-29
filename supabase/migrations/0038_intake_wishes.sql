-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: when a client must move by, and a garden or balcony (run after 0037)
--
-- Matching brief C2. Two more answers from a client's first message:
--   applicants.move_by         the date they must move by
--   applicants.wants_outdoor   true when they want a garden or a balcony
-- (The bedrooms they need, the top-up they can pay, who they must live near and women only came in 0028 to 0034.)
-- The Bin reads them from a message or screenshot, and Client details has a box for each. Nothing is filled in here.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0038 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants drop column if exists move_by, drop column if exists wants_outdoor;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0038 as table public.applicants;

alter table applicants add column if not exists move_by       date;
alter table applicants add column if not exists wants_outdoor boolean;

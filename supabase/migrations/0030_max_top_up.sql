-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: the top-up a client can pay (run after 0029)
--
-- Matching brief B3. Some clients can pay a little on top of the LHA they get. A property over their LHA is now
-- hidden only when it is over by more than that:
--   applicants.max_top_up   pounds a month they can add on top of their LHA; empty or 0 means none
-- Matching says it plainly: "£50 over LHA, within their £200 top-up". Nothing is filled in here.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0030 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants drop column if exists max_top_up;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0030 as table public.applicants;

alter table applicants add column if not exists max_top_up numeric(8,2);

do $$ begin
  alter table applicants add constraint applicants_max_top_up_check check (max_top_up is null or (max_top_up >= 0 and max_top_up <= 2000));
exception when duplicate_object then null; end $$;

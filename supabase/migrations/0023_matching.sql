-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: what matching needs on every client (run after 0022)
--
-- Step 6 of the update brief (matching). The client record gains the answers matching asks for that
-- had nowhere to live:
--   postcode_area   where they want to live, as postcode areas or districts ("HA1, HA2", "UB")
--   age_band        under_35 | 35_plus, for when the date of birth is not known (a date of birth wins)
--   benefit_cap     capped | not_capped | exempt: whether the benefit cap applies to them
-- Household, UC, PIP and LCWRA already have their own columns. Nothing is filled in: empty means not known,
-- and the client's Profile asks for it.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0023 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants
--     drop column if exists postcode_area, drop column if exists age_band, drop column if exists benefit_cap;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0023 as table public.applicants;

alter table applicants add column if not exists postcode_area text;
alter table applicants add column if not exists age_band      text;
alter table applicants add column if not exists benefit_cap   text;

do $$ begin
  alter table applicants add constraint applicants_age_band_check check (age_band is null or age_band in ('under_35', '35_plus'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table applicants add constraint applicants_benefit_cap_check check (benefit_cap is null or benefit_cap in ('capped', 'not_capped', 'exempt'));
exception when duplicate_object then null; end $$;

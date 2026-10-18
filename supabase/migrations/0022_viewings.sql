-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: how each viewing went, why a deal was lost, and how fast Keel answers officers (run after 0021)
--
-- Step 5 of the update brief (viewings), with the response discipline Ridwan set: record when a housing officer's
-- nomination arrives, when Keel first replies, and when the viewing's outcome goes back to the officer.
-- Targets (Team settings): first reply within 4 working hours, the outcome back the same day.
--
-- deals gain:
--   viewing_outcome             viewed | no_show | offered | declined | signed: how the viewing went
--   reason_lost                 too_far | too_small | failed_affordability | client_dropped_out | property_issue | other
--                               (the free-text fell_through_reason stays, for the detail)
--   outcome_at                  when the outcome was recorded
--   outcome_sent_to_officer_at  when the outcome went back to the housing officer, so same-day reporting is trackable
-- applicants gain:
--   nominated_at                when the officer's nomination arrived (empty means when the client got in touch)
--   officer_replied_at          when Keel first replied to that nomination
-- Nothing is filled in for deals from before: the app works out their reason group from the written reason, and
-- how their viewing went from how far they got, without writing either down.
--
-- Backup: deals and applicants as they were are copied to keel_backup.deals_before_0022 and
-- keel_backup.applicants_before_0022 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table deals
--     drop column if exists viewing_outcome, drop column if exists reason_lost,
--     drop column if exists outcome_at, drop column if exists outcome_sent_to_officer_at;
--   alter table applicants drop column if exists nominated_at, drop column if exists officer_replied_at;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.deals_before_0022 as table public.deals;
create table if not exists keel_backup.applicants_before_0022 as table public.applicants;

alter table deals add column if not exists viewing_outcome            text;
alter table deals add column if not exists reason_lost                text;
alter table deals add column if not exists outcome_at                 timestamptz;
alter table deals add column if not exists outcome_sent_to_officer_at timestamptz;
alter table applicants add column if not exists nominated_at          timestamptz;
alter table applicants add column if not exists officer_replied_at    timestamptz;

do $$ begin
  alter table deals add constraint deals_viewing_outcome_check
    check (viewing_outcome is null or viewing_outcome in ('viewed', 'no_show', 'offered', 'declined', 'signed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table deals add constraint deals_reason_lost_check
    check (reason_lost is null or reason_lost in ('too_far', 'too_small', 'failed_affordability', 'client_dropped_out', 'property_issue', 'other'));
exception when duplicate_object then null; end $$;

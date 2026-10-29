-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: whether bills are included (run after 0035)
--
-- Matching brief B9. Whether bills are included changes what a client really pays. Each property says so:
--   properties.bills_status   included | excluded | partial; the detail ("water and council tax") stays in the bills
--                             note it already has, and the list of what is included (0019) stays as it is
-- It shows on each match and in the WhatsApp message to the client. Nothing is filled in here.
--
-- Backup: properties as it was is copied to keel_backup.properties_before_0036 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists bills_status;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0036 as table public.properties;

alter table properties add column if not exists bills_status text;

do $$ begin
  alter table properties add constraint properties_bills_status_check check (bills_status is null or bills_status in ('included', 'excluded', 'partial'));
exception when duplicate_object then null; end $$;

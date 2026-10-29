-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: when a property was last confirmed available (run after 0030)
--
-- Matching brief B4. Properties go stale: a provider lets one and nobody hears. Each property now says when it was
-- last confirmed free:
--   properties.availability_confirmed_at   when someone last confirmed it is still available (the Confirmed available
--                                          button on its card); empty means not since it was added
-- A match on a property not confirmed for over 7 days stays on the list with a red "Check still available (last
-- confirmed 12 days ago)". Nothing is filled in here: until someone confirms one, its added date counts.
--
-- Backup: properties as it was is copied to keel_backup.properties_before_0031 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists availability_confirmed_at;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0031 as table public.properties;

alter table properties add column if not exists availability_confirmed_at timestamptz;

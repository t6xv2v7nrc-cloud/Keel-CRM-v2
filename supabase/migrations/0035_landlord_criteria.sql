-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: a landlord's own rules for a property (run after 0034)
--
-- Matching brief B8. Some landlords only take certain tenants: an age range, or only some benefits. Each property
-- can now say so:
--   properties.landlord_criteria   {"min_age": 25, "max_age": 60, "benefits": ["uc", "pip", "working"]}; any part can
--                                  be left out, and empty means anyone. Benefits are uc, pip, lcwra, hb, esa, working.
-- A client outside those rules is not offered it; where their age or benefits are not known, it says to check.
--
-- Backup: properties as it was is copied to keel_backup.properties_before_0035 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists landlord_criteria;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0035 as table public.properties;

alter table properties add column if not exists landlord_criteria jsonb;

do $$ begin
  alter table properties add constraint properties_landlord_criteria_check check (landlord_criteria is null or jsonb_typeof(landlord_criteria) = 'object');
exception when duplicate_object then null; end $$;

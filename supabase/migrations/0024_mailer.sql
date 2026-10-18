-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: the Mailer (run after 0023)
--
-- Step 7 of the update brief. Property alerts and borough digests to housing officers are now written and checked
-- inside Keel, so every send keeps to the rules (only properties that pass every check, only officers allowed to
-- receive mail, a shared mailbox in place of personal emails).
--   properties.photo_urls       up to 3 links to photos, put in alerts
--   officer_sends.property_ids  the properties a send carried
--   officer_sends.subject       its subject line
-- Business details for the email footer (redress scheme, client money protection, LLAS, ICO, fees) are kept in
-- Team settings, not here.
--
-- Backup: properties and officer_sends as they were are copied to keel_backup.properties_before_0024 and
-- keel_backup.officer_sends_before_0024 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists photo_urls;
--   alter table officer_sends drop column if exists property_ids, drop column if exists subject;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0024 as table public.properties;
create table if not exists keel_backup.officer_sends_before_0024 as table public.officer_sends;

alter table properties add column if not exists photo_urls text[] not null default '{}';
alter table officer_sends add column if not exists property_ids uuid[] not null default '{}';
alter table officer_sends add column if not exists subject text;

do $$ begin
  alter table properties add constraint properties_photo_urls_check check (cardinality(photo_urls) <= 3);
exception when duplicate_object then null; end $$;

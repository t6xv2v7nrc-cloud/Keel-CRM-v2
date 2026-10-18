-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: properties are ready to send unless marked otherwise (run after 0024)
--
-- Ridwan's decision: the suppliers make sure their properties' safety checks are done, so a property counts as ready
-- to send by default. Missing papers or photos no longer hold one back; only a rent over LHA does, or Ridwan marking
-- it Not ready by hand, with a reason:
--   properties.not_ready_at    when it was marked not ready (empty means ready)
--   properties.not_ready_note  why ("waiting for the gas certificate")
--
-- Backup: properties as it was is copied to keel_backup.properties_before_0025 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists not_ready_at, drop column if exists not_ready_note;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0025 as table public.properties;

alter table properties add column if not exists not_ready_at   timestamptz;
alter table properties add column if not exists not_ready_note text;

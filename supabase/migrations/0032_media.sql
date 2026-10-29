-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: photos or video in hand for a property (run after 0031)
--
-- Matching brief B5. A property with photos or a video gets a far better answer from a client. Each property says
-- whether they are in hand, and where:
--   properties.has_media   true when photos or a video are in hand to send (photo links, 0024, count too)
--   properties.media_url   a link to the photos or a video tour
-- Properties with photos are ranked first for a client; without, matches carry an amber "No photos or video: get
-- them before sending". They never stop a property being sent.
--
-- Backup: properties as it was is copied to keel_backup.properties_before_0032 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties drop column if exists has_media, drop column if exists media_url;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0032 as table public.properties;

alter table properties add column if not exists has_media boolean;
alter table properties add column if not exists media_url text;

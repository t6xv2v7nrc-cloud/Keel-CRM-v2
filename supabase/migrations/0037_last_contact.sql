-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: when Keel last heard from and replied to a client (run after 0036)
--
-- Matching brief C1. People who message Keel (or are handed over by the WhatsApp AI) and hear nothing for a day go
-- elsewhere. Each client now records:
--   applicants.last_contact_at   when Keel last got in touch with them: a note of contact, a call, a property or
--                                message sent on WhatsApp
--   applicants.last_inbound_at   when they (or the AI on their behalf) last messaged Keel: an enquiry or message
--                                arriving in the Bin, or a note logged as them getting in touch
-- The Pipeline's Awaiting reply list shows, in red, everyone whose last message has had no reply from Keel within 24
-- hours (messages more than 14 days old are not chased). Both are filled in once here from what Keel already holds:
-- last_contact_at from the latest contact note, call or WhatsApp send on their timeline; last_inbound_at from when
-- the latest of their messages that went through the Bin arrived. Nothing else is changed.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0037 first.
--
-- Rollback (Supabase SQL Editor):
--   alter table applicants drop column if exists last_contact_at, drop column if exists last_inbound_at;
--
-- Row level security stays as it is (signed-in only); nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0037 as table public.applicants;

alter table applicants add column if not exists last_contact_at timestamptz;
alter table applicants add column if not exists last_inbound_at timestamptz;

-- once: the latest contact Keel already knows of (contact notes, calls, WhatsApp sends), never later than now
update applicants a set last_contact_at = least(now(), x.at)
from (
  select entity_id as id, max(created_at) as at from activities
  where entity_type = 'applicant' and kind in ('contact', 'whatsapp', 'call')
  group by entity_id
) x
where a.id = x.id and a.last_contact_at is null;
update applicants a set last_contact_at = least(now(), c.at)
from (select applicant_id as id, max(created_at) as at from calls group by applicant_id) c
where a.id = c.id and (a.last_contact_at is null or a.last_contact_at < c.at);

-- once: when the latest of their messages that went through the Bin arrived
update applicants a set last_inbound_at = least(now(), x.at)
from (
  select act.entity_id as id, max(i.created_at) as at
  from activities act join inbox_items i on i.id = act.inbox_item_id
  where act.entity_type = 'applicant'
  group by act.entity_id
) x
where a.id = x.id and a.last_inbound_at is null;

create index if not exists applicants_last_inbound_idx on applicants(last_inbound_at);

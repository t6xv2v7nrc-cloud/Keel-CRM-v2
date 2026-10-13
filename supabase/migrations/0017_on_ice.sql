-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — clients on ice (run after 0016)
--
-- A client can be put on ice: paused until they are ready, or until a date.
-- While on ice they are not matched to properties, not flagged as stuck or
-- gone cold, and left out of the Pipeline's main list. On the return date
-- they come back by themselves, with a next step to check in.
--   iced_at      when they were put on ice (null: not on ice)
--   iced_until   the day they come back (null: until someone takes them off)
--   iced_reason  why, in a few words ("wants to think about it")
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table applicants add column if not exists iced_at timestamptz;
alter table applicants add column if not exists iced_until date;
alter table applicants add column if not exists iced_reason text;

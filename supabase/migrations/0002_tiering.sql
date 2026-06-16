-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — referral tiering fields (run after 0001_init.sql)
-- Adds the structured referral answers + computed tier to applicants.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table applicants
  add column if not exists on_uc              boolean,
  add column if not exists pip                boolean,
  add column if not exists lcwra              boolean,
  add column if not exists council_registered boolean,
  add column if not exists work_status        text,   -- 'not_working'|'part_time'|'full_time'
  add column if not exists household_type     text,   -- 'single'|'couple'|'family'|'other'
  add column if not exists urgency            text,   -- 'homeless_tonight'|'at_risk_56'|'temp_accommodation'|'overcrowding'|'none'
  add column if not exists council            text,
  add column if not exists officer_name       text,
  add column if not exists officer_email      text,
  add column if not exists officer_phone      text,
  add column if not exists housing_situation  text,
  add column if not exists consent            boolean,
  add column if not exists tier               int;    -- 1 | 2 | 3 (effective; may be overridden)

create index if not exists applicants_tier_idx on applicants(tier);
create index if not exists applicants_urgency_idx on applicants(urgency);

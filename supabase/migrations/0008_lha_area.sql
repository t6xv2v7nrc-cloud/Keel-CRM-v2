-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — LHA area chosen by hand for a property (run after 0007)
--
-- Keel estimates each property's LHA area (Broad Rental Market Area) from
-- its postcode. When you check one on the VOA's LHA Direct and it differs,
-- the right area is saved here and used from then on.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table properties add column if not exists lha_area text;

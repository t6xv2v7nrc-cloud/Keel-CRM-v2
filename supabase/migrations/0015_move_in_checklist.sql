-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — move-in checklist (run after 0014)
--
-- deals.checklist: the move-in checks ticked for a placement, as
-- { "Gas safety certificate given": "2026-10-12", ... } (the day each was
-- ticked). The list of checks itself lives in Team settings.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table deals add column if not exists checklist jsonb not null default '{}'::jsonb;

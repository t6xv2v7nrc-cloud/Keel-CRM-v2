-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — date clients from when the Bin received them (run after 0015)
--
-- A client confirmed from the Bin was dated from the moment someone pressed
-- Confirm, which can be days or weeks after the referral or enquiry arrived.
-- This dates every such client from when their Bin item arrived instead, so
-- "added", "stuck", "gone cold" and "new this week" read true. Clients whose
-- stage has not moved since are moved back with it. Nothing else changes,
-- and their "updated" time is left as it was.
--
-- The app does this itself for new clients from now on.
-- Idempotent; safe to re-run (a client already dated from the Bin is left alone).
-- ════════════════════════════════════════════════════════════════════

do $$
begin
  alter table applicants disable trigger applicants_updated_at;

  with first_seen as (
    select act.entity_id as applicant_id, min(i.created_at) as received
    from activities act
    join inbox_items i on i.id = act.inbox_item_id
    where act.entity_type = 'applicant' and act.kind = 'created'
    group by act.entity_id
  )
  update applicants a set
    stage_changed_at = case
      when a.stage_changed_at is not null and a.stage_changed_at <= a.created_at + interval '1 minute' then f.received
      else a.stage_changed_at end,
    created_at = f.received
  from first_seen f
  where f.applicant_id = a.id and f.received < a.created_at;

  alter table applicants enable trigger applicants_updated_at;
end $$;

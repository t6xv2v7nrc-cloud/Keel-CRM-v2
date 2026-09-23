-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — backfill client notes from their original enquiry
--
-- Clients confirmed before notes were captured have an empty notes field,
-- but their message is still on the Bin item they were created from
-- (inbox_items.extraction.transcription, after "Message:"). The confirm
-- step logged an activity linking the client to that Bin item, so we can
-- copy the message across.
--
-- Only fills notes that are empty; never overwrites anything you typed.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

update applicants a
set notes = m.msg
from (
  select distinct on (act.entity_id)
         act.entity_id as applicant_id,
         trim(substring(i.extraction->>'transcription' from 'Message:\s*(.*)$')) as msg
  from activities act
  join inbox_items i on i.id = act.inbox_item_id
  where act.entity_type = 'applicant'
    and act.inbox_item_id is not null
  order by act.entity_id, act.created_at asc
) m
where a.id = m.applicant_id
  and coalesce(trim(a.notes), '') = ''
  and coalesce(m.msg, '') <> '';

-- Show what was filled (optional check)
select full_name, left(notes, 80) as notes_preview
from applicants
where notes is not null
order by updated_at desc
limit 20;

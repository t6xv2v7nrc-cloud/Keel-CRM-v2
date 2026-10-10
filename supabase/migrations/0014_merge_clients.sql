-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — merge duplicate clients (run after 0013)
--
-- merge_applicants(keep, gone) folds one client record into another in a
-- single step, so nothing is half-moved if it fails:
--   • calls, properties in progress (deals), fees and incentives, requests to
--     providers, old placements and the timeline move to the kept client
--     (a property both were going for keeps whichever got further);
--   • any detail the kept client is missing is filled in from the other;
--   • notes are joined; the stage is whichever is further along;
--   • the other record is deleted and the kept client's timeline says so.
-- Tables from updates not yet run are skipped.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create or replace function merge_applicants(keep uuid, gone uuid) returns void
language plpgsql
set search_path = public
as $$
declare
  col text;
  order_of text[] := array['lost', 'lead', 'referred', 'viewing', 'offer', 'placed', 'fee_invoiced', 'fee_paid'];
  steps text[] := array['fell_through', 'sent', 'interested', 'viewing', 'viewed', 'offered', 'accepted', 'moved_in'];
  k applicants%rowtype;
  g applicants%rowtype;
begin
  if keep = gone then return; end if;
  select * into k from applicants where id = keep;
  select * into g from applicants where id = gone;
  if k.id is null or g.id is null then raise exception 'Client not found'; end if;

  if to_regclass('public.calls') is not null then
    update calls set applicant_id = keep where applicant_id = gone;
  end if;
  if to_regclass('public.deals') is not null then
    -- a property both were going for: keep whichever got further
    delete from deals d using deals d2
      where d.applicant_id = keep and d2.applicant_id = gone and d2.address = d.address
        and array_position(steps, d2.status::text) > array_position(steps, d.status::text);
    delete from deals d where d.applicant_id = gone
      and exists (select 1 from deals d2 where d2.applicant_id = keep and d2.address = d.address);
    update deals set applicant_id = keep where applicant_id = gone;
  end if;
  if to_regclass('public.receivables') is not null then
    update receivables set applicant_id = keep where applicant_id = gone;
  end if;
  if to_regclass('public.requests') is not null then
    update requests set client_ids = array_remove(array_replace(client_ids, gone, keep), null)
      where gone = any(client_ids);
    update requests set client_ids = array(select distinct unnest(client_ids)) where keep = any(client_ids);
  end if;
  update placements set applicant_id = keep where applicant_id = gone;
  update activities set entity_id = keep where entity_type = 'applicant' and entity_id = gone;

  -- fill in whatever the kept client is missing (every column, so later additions are covered too)
  for col in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'applicants'
      and column_name not in ('id', 'full_name', 'stage', 'notes', 'created_at', 'updated_at', 'stage_changed_at')
  loop
    execute format(
      'update applicants k set %1$I = g.%1$I from applicants g where k.id = $1 and g.id = $2 and k.%1$I is null and g.%1$I is not null', col)
      using keep, gone;
  end loop;

  update applicants set
    notes = case
      when coalesce(g.notes, '') = '' or g.notes = k.notes then k.notes
      when coalesce(k.notes, '') = '' then g.notes
      else k.notes || E'\n\n' || g.notes end,
    stage = case
      when array_position(order_of, g.stage::text) > array_position(order_of, k.stage::text) then g.stage
      else k.stage end
  where id = keep;

  delete from applicants where id = gone;
  insert into activities (entity_type, entity_id, kind, body)
    values ('applicant', keep, 'updated', 'Merged ' || g.full_name || '''s duplicate record into this one');
end $$;

revoke all on function merge_applicants(uuid, uuid) from public;
grant execute on function merge_applicants(uuid, uuid) to authenticated;

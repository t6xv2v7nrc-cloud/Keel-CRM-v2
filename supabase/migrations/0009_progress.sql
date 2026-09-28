-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — client progress (run after 0008)
--
-- 1. deals: each property a client is going for, and how far it has got:
--    sent → interested → viewing booked → viewed → offer made → accepted →
--    moved in (or fell through, with the reason). The address is copied in,
--    so a deal still reads well after its property list is purged.
-- 2. applicants.next_step: what to do next ("Chase documents"); the date is
--    the existing applicants.next_call_at.
-- 3. applicants.stage_changed_at: when the stage last moved, so clients who
--    have not moved for a while can be flagged as stuck. Filled in from the
--    stage history for existing clients.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists deals (
  id                  uuid primary key default gen_random_uuid(),
  applicant_id        uuid not null references applicants(id) on delete cascade,
  property_id         uuid references properties(id) on delete set null,
  address             text not null,
  status              text not null default 'sent' check (status in
                        ('sent', 'interested', 'viewing', 'viewed', 'offered', 'accepted', 'moved_in', 'fell_through')),
  viewing_at          timestamptz,
  move_in_on          date,
  fell_through_reason text,
  notes               text,
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists deals_applicant_address_idx on deals(applicant_id, address);
create index if not exists deals_property_idx on deals(property_id);
create index if not exists deals_viewing_idx on deals(viewing_at);

do $$ begin
  create trigger deals_updated_at before update on deals
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

alter table applicants
  add column if not exists next_step        text,
  add column if not exists stage_changed_at timestamptz;

update applicants a set stage_changed_at = coalesce(
  (select max(created_at) from activities
    where entity_type = 'applicant' and entity_id = a.id and kind = 'stage_change'),
  a.created_at)
where stage_changed_at is null;

alter table deals enable row level security;
do $$ begin
  create policy auth_all_deals on deals for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

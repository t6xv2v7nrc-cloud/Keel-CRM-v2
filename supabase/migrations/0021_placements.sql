-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: placements, who invoices the council, and the split in writing (run after 0020)
--
-- Step 4 of the update brief (placements and incentives). A placement is a client's moved-in deal. The
-- placements table (from 0001, unused until now) gains:
--   deal_id                   the moved-in deal it belongs to (one placement per deal)
--   route                     procurement | officer | self_referral: how the council came to it
--   provider_id               the partner (Watermint, Yumi, KPL, Feldon...) from Providers, not free text
--   fee_type                  week_rent | incentive | mixed: what Keel is paid
--   keel_share_pct            Keel's share of the incentive, in per cent
--   invoiced_by               keel | partner: whose name is on the paperwork the council pays
--   split_agreed_in_writing   and split_document_url, the link to that agreement
--   renters_rights_sheet_on   the day the tenant was given the Renters' Rights Act information sheet
-- Amounts, invoice and paid dates are not kept here: they are read from Finances (receivables), never typed twice.
-- Every moved-in deal without a placement gets one now, with its council, move-in date, rent and partner.
--
-- Backup: placements as it was is copied to keel_backup.placements_before_0021 first.
--
-- Rollback (Supabase SQL Editor):
--   delete from placements where deal_id is not null;   -- the rows made here and by the app since
--   alter table placements
--     drop column if exists deal_id, drop column if exists route, drop column if exists provider_id,
--     drop column if exists fee_type, drop column if exists keel_share_pct, drop column if exists invoiced_by,
--     drop column if exists split_agreed_in_writing, drop column if exists split_document_url,
--     drop column if exists renters_rights_sheet_on;
--
-- Row level security stays on (signed-in only, from 0001); nobody who is not signed in can reach it.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.placements_before_0021 as table public.placements;

alter table placements add column if not exists deal_id                 uuid references deals(id) on delete set null;
alter table placements add column if not exists route                   text;
alter table placements add column if not exists provider_id             uuid references providers(id) on delete set null;
alter table placements add column if not exists fee_type                text;
alter table placements add column if not exists keel_share_pct          numeric(5, 2);
alter table placements add column if not exists invoiced_by             text;
alter table placements add column if not exists split_agreed_in_writing boolean not null default false;
alter table placements add column if not exists split_document_url      text;
alter table placements add column if not exists renters_rights_sheet_on date;
create unique index if not exists placements_deal_idx on placements(deal_id) where deal_id is not null;

do $$ begin
  alter table placements add constraint placements_route_check check (route is null or route in ('procurement', 'officer', 'self_referral'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table placements add constraint placements_fee_type_check check (fee_type is null or fee_type in ('week_rent', 'incentive', 'mixed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table placements add constraint placements_invoiced_by_check check (invoiced_by is null or invoiced_by in ('keel', 'partner'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table placements add constraint placements_keel_share_check check (keel_share_pct is null or keel_share_pct between 0 and 100);
exception when duplicate_object then null; end $$;

alter table placements enable row level security;
revoke all on placements from anon;

-- A placement for every moved-in deal that has none, noted on the client's timeline
with made as (
  insert into placements (applicant_id, property_id, deal_id, council, move_in_date, rent_pcm, provider_id, route)
  select d.applicant_id, d.property_id, d.id, coalesce(nullif(trim(a.council), ''), nullif(trim(a.referring_borough), '')),
    d.move_in_on, p.rent_pcm, p.provider_id,
    case when coalesce(trim(a.officer_name), '') <> '' or coalesce(trim(a.officer_email), '') <> '' or coalesce(trim(a.officer_phone), '') <> ''
      then 'officer' end
  from deals d
  join applicants a on a.id = d.applicant_id
  left join properties p on p.id = d.property_id
  where d.status = 'moved_in' and not exists (select 1 from placements x where x.deal_id = d.id)
  returning applicant_id, deal_id
)
insert into activities (entity_type, entity_id, kind, body)
select 'applicant', made.applicant_id, 'money', 'Placement recorded from the move-in: who invoices and the split still to fill in'
from made;

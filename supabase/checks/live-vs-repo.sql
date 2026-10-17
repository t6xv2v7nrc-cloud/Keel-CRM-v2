-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: which of the repo's migrations has the live database had?
--
-- READ-ONLY. It changes nothing. Paste it into the Supabase SQL Editor and Run.
-- One row per migration file: done, PART RUN, NOT RUN, or "cannot tell" for
-- the two that only tidy data. Then one row for every table or view in the
-- live database that no migration here created, with its columns and whether
-- row level security is on (if it is off, anyone with the app's public key
-- can read that table).
--
-- This is not a migration: it lives in supabase/checks/, not supabase/migrations/.
-- ════════════════════════════════════════════════════════════════════

with expect(migration, kind, name) as (values
  ('0001', 'table', 'applicants'), ('0001', 'table', 'properties'), ('0001', 'table', 'contacts'),
  ('0001', 'table', 'placements'), ('0001', 'table', 'inbox_items'), ('0001', 'table', 'activities'),
  ('0002', 'column', 'applicants.tier'),
  ('0003', 'data', 'notes copied from the Bin'),
  ('0004', 'column', 'properties.source_tag'),
  ('0005', 'table', 'calls'), ('0005', 'table', 'settings'), ('0005', 'column', 'applicants.next_call_at'),
  ('0006', 'table', 'profiles'), ('0006', 'column', 'activities.actor'),
  ('0007', 'column', 'profiles.role'), ('0007', 'function', 'is_keel_owner'),
  ('0008', 'column', 'properties.lha_area'),
  ('0009', 'table', 'deals'), ('0009', 'column', 'applicants.next_step'),
  ('0010', 'table', 'providers'), ('0010', 'table', 'requests'), ('0010', 'column', 'properties.provider_id'),
  ('0010', 'column', 'applicants.share_with_landlords'),
  ('0011', 'function', 'applicants_share_default'),
  ('0012', 'table', 'receivables'),
  ('0013', 'column', 'receivables.invoice_number'), ('0013', 'function', 'next_invoice_no'),
  ('0014', 'function', 'merge_applicants'),
  ('0015', 'column', 'deals.checklist'),
  ('0016', 'data', 'client dates from the Bin'),
  ('0017', 'column', 'applicants.iced_at'),
  ('0018', 'table', 'lha_rates'), ('0018', 'table', 'postcode_brma'),
  ('0019', 'column', 'properties.accommodation_type'), ('0019', 'column', 'properties.gas_expiry'), ('0019', 'column', 'properties.photo_count'),
  ('0020', 'column', 'officers.status'), ('0020', 'column', 'officers.send_to_mailbox'), ('0020', 'table', 'officer_sends'), ('0020', 'table', 'council_schemes'),
  ('0021', 'column', 'placements.deal_id'), ('0021', 'column', 'placements.split_agreed_in_writing'), ('0021', 'column', 'placements.renters_rights_sheet_on')
), found as (
  select e.migration, e.kind, e.name, case e.kind
    when 'table' then exists (select 1 from information_schema.tables t
                              where t.table_schema = 'public' and t.table_name = e.name)
    when 'column' then exists (select 1 from information_schema.columns c
                               where c.table_schema = 'public' and c.table_name || '.' || c.column_name = e.name)
    when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.proname = e.name)
  end as present
  from expect e
), known(name) as (values
  ('applicants'), ('properties'), ('contacts'), ('placements'), ('inbox_items'), ('activities'), ('calls'), ('settings'),
  ('profiles'), ('deals'), ('providers'), ('requests'), ('receivables'), ('lha_rates'), ('postcode_brma'),
  ('officers'), ('officer_sends'), ('council_schemes')
)
select migration as item,
  case when bool_and(kind = 'data') then 'cannot tell (only tidies data)'
       when bool_and(present) then 'done'
       when bool_or(present) then 'PART RUN'
       else 'NOT RUN' end as status,
  string_agg(case when kind <> 'data' and not present then name end, ', ') as detail
from found
group by migration
union all
select 'not from the repo: ' || t.table_name,
  lower(t.table_type) || case when t.table_type <> 'BASE TABLE' then ''
    when (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = t.table_name) then ', RLS on' else ', RLS OFF' end,
  (select string_agg(c.column_name, ', ' order by c.ordinal_position) from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = t.table_name)
from information_schema.tables t
where t.table_schema = 'public' and t.table_name not in (select name from known)
order by 1;

-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: who may be emailed, and each council's scheme (run after 0019)
--
-- Step 3 of the update brief.
--   officers         HELM (the earlier Keel) made this table; it holds the housing officer list. Here it gains:
--                    route_type (procurement_mailbox | housing_officer | landlord_scheme), send_to_mailbox (the
--                    only address used when set), status (active | left | on_leave | opted_out | bounced) with
--                    status_date and leave_until, opted_out_at and opt_out_note, bounce_count and last_bounce_at,
--                    last_nominated_client_at, opt_in_source and opted_in_at, last_sent_at.
--                    Nothing in it is renamed or removed. On a database without it, it is made with HELM's columns.
--   officer_sends    every send to an officer: a one-property alert, a monthly digest or a bulk email, so a
--                    second bulk send inside 30 days can be warned about.
--   council_schemes  each council's procurement or landlord scheme: route mailbox, scheme name, registered
--                    and when, incentive terms, the most it pays, documents required, focus borough, last contact.
--
-- Backup: officers as it was is copied to keel_backup.officers_before_0020 first (a schema the app and the
-- website cannot reach).
--
-- Rollback (Supabase SQL Editor):
--   drop table if exists council_schemes;
--   drop table if exists officer_sends;
--   alter table officers
--     drop column if exists route_type, drop column if exists send_to_mailbox, drop column if exists status,
--     drop column if exists status_date, drop column if exists leave_until, drop column if exists opted_out_at,
--     drop column if exists opt_out_note, drop column if exists bounce_count, drop column if exists last_bounce_at,
--     drop column if exists last_nominated_client_at, drop column if exists opt_in_source,
--     drop column if exists opted_in_at, drop column if exists last_sent_at;
--   drop policy if exists auth_all_officers on officers;
--
-- Row level security stays on; everyone signed in can read and change these. Nobody who is not signed in can
-- reach them: officer emails must never be public.
-- Idempotent; safe to re-run (the backup is taken once, the first time).
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
do $$ begin
  if to_regclass('public.officers') is not null and to_regclass('keel_backup.officers_before_0020') is null then
    execute 'create table keel_backup.officers_before_0020 as table public.officers';
  end if;
end $$;

-- HELM's officers table, only where it never existed (a fresh database)
create table if not exists officers (
  id               uuid primary key default gen_random_uuid(),
  name             text,
  title            text,
  council          text,
  borough          text,
  email            text,
  phone            text,
  temp             text,
  score            int,
  referrals_30d    int,
  signed_30d       int,
  fees_generated   numeric,
  avg_fee_split    numeric,
  active_leads     int,
  last_contact_at  timestamptz,
  first_referral   date,
  tenure_months    int,
  response_hrs     numeric,
  conversion_pct   numeric,
  prefers_sms      boolean,
  notes            text,
  streak           int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- new officers added from Keel need an id made for them
do $$ declare t text; d text; begin
  select data_type, column_default into t, d from information_schema.columns
  where table_schema = 'public' and table_name = 'officers' and column_name = 'id';
  if d is null and t = 'uuid' then execute 'alter table officers alter column id set default gen_random_uuid()';
  elsif d is null and t = 'text' then execute 'alter table officers alter column id set default gen_random_uuid()::text';
  end if;
end $$;

alter table officers add column if not exists route_type               text not null default 'housing_officer';
alter table officers add column if not exists send_to_mailbox          text;
alter table officers add column if not exists status                   text not null default 'active';
alter table officers add column if not exists status_date              date;
alter table officers add column if not exists leave_until              date;
alter table officers add column if not exists opted_out_at             timestamptz;
alter table officers add column if not exists opt_out_note             text;
alter table officers add column if not exists bounce_count             int not null default 0;
alter table officers add column if not exists last_bounce_at           timestamptz;
alter table officers add column if not exists last_nominated_client_at timestamptz;
alter table officers add column if not exists opt_in_source            text;
alter table officers add column if not exists opted_in_at              timestamptz;
alter table officers add column if not exists last_sent_at             timestamptz;
do $$ begin
  alter table officers add constraint officers_route_type_check check (route_type in ('procurement_mailbox', 'housing_officer', 'landlord_scheme'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table officers add constraint officers_status_check check (status in ('active', 'left', 'on_leave', 'opted_out', 'bounced'));
exception when duplicate_object then null; end $$;

create table if not exists officer_sends (
  id          uuid primary key default gen_random_uuid(),
  officer_id  text not null,                 -- officers.id, kept as text whatever HELM made it
  kind        text not null check (kind in ('alert', 'digest', 'bulk')),
  address     text,
  note        text,
  sent_at     timestamptz not null default now(),
  sent_by     uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists officer_sends_officer_idx on officer_sends(officer_id, sent_at desc);

create table if not exists council_schemes (
  id                  uuid primary key default gen_random_uuid(),
  council             text not null,
  scheme_name         text,
  route_mailbox       text,
  registered          boolean not null default false,
  registered_on       date,
  incentive_terms     text,
  max_incentive       numeric(10, 2) check (max_incentive is null or max_incentive >= 0),
  documents_required  text,
  focus_borough       boolean not null default false,
  last_contact        date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists council_schemes_council_idx on council_schemes(lower(council));

alter table officers enable row level security;
alter table officer_sends enable row level security;
alter table council_schemes enable row level security;
revoke all on officers from anon;
revoke all on officer_sends from anon;
revoke all on council_schemes from anon;
do $$ begin
  create policy auth_all_officers on officers for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_officer_sends on officer_sends for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_council_schemes on council_schemes for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

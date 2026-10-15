-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: what a property is, who it suits and its safety papers (run after 0018)
--
-- Step 2 of the update brief. Adds columns to properties; nothing is renamed or removed.
--   accommodation_type  self_contained | shared_kitchen | hmo_room
--   bills_included      what the rent includes: water, gas, electricity, council_tax, internet, tv_licence
--   floor, lift         0 is the ground floor, -1 a basement
--   suitable_for        uc_35_plus | sar_exempt | under_35_standard | couples | families
--   gas_expiry, no_gas  gas safety certificate (or no gas supply at all)
--   eicr_expiry         electrical safety report
--   epc_rating, epc_sap energy certificate: A to G, and its SAP score
--   licence_needed, licence_no, licence_expiry   HMO or selective licence
--   alarms_checked      the day smoke and carbon monoxide alarms were last checked
--   photo_count         photos ready to send
--   prs_landlord_id, prs_property_id   the PRS database IDs, once adverts must show them
-- The BRMA stays in lha_area (0008). The LHA rate, the gap, the shared-rate gap and whether
-- the papers are complete are worked out by the app, never typed.
--
-- Backup: a copy of properties as it was is kept in keel_backup.properties_before_0019.
-- keel_backup is a separate schema the app and the website cannot reach.
--
-- Rollback (Supabase SQL Editor):
--   alter table properties
--     drop column if exists accommodation_type, drop column if exists bills_included, drop column if exists floor,
--     drop column if exists lift, drop column if exists suitable_for, drop column if exists gas_expiry,
--     drop column if exists no_gas, drop column if exists eicr_expiry, drop column if exists epc_rating,
--     drop column if exists epc_sap, drop column if exists licence_needed, drop column if exists licence_no,
--     drop column if exists licence_expiry, drop column if exists alarms_checked, drop column if exists photo_count,
--     drop column if exists prs_landlord_id, drop column if exists prs_property_id;
-- (The backup copy is not needed for that: the columns above are all new.)
--
-- Idempotent; safe to re-run (the backup is taken once, the first time).
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.properties_before_0019 as table public.properties;

alter table properties add column if not exists accommodation_type text;
alter table properties add column if not exists bills_included    text[] not null default '{}';
alter table properties add column if not exists floor             int;
alter table properties add column if not exists lift              boolean;
alter table properties add column if not exists suitable_for      text[] not null default '{}';
alter table properties add column if not exists gas_expiry        date;
alter table properties add column if not exists no_gas            boolean not null default false;
alter table properties add column if not exists eicr_expiry       date;
alter table properties add column if not exists epc_rating        text;
alter table properties add column if not exists epc_sap           int;
alter table properties add column if not exists licence_needed    boolean;
alter table properties add column if not exists licence_no        text;
alter table properties add column if not exists licence_expiry    date;
alter table properties add column if not exists alarms_checked    date;
alter table properties add column if not exists photo_count       int;
alter table properties add column if not exists prs_landlord_id   text;
alter table properties add column if not exists prs_property_id   text;

do $$ begin
  alter table properties add constraint properties_accommodation_type_check
    check (accommodation_type is null or accommodation_type in ('self_contained', 'shared_kitchen', 'hmo_room'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_suitable_for_check
    check (suitable_for <@ array['uc_35_plus', 'sar_exempt', 'under_35_standard', 'couples', 'families']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_bills_included_check
    check (bills_included <@ array['water', 'gas', 'electricity', 'council_tax', 'internet', 'tv_licence']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_epc_rating_check check (epc_rating is null or epc_rating in ('A', 'B', 'C', 'D', 'E', 'F', 'G'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_epc_sap_check check (epc_sap is null or epc_sap between 1 and 150);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_floor_check check (floor is null or floor between -2 and 60);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table properties add constraint properties_photo_count_check check (photo_count is null or photo_count between 0 and 200);
exception when duplicate_object then null; end $$;

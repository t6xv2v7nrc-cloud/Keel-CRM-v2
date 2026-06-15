-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — Phase 1 schema (§4 of KEEL_CRM_PLAN.md)
-- Run this once in the Supabase SQL editor.
-- Tables are prefixed-free but distinct from v1's (leads/officers/etc.),
-- so they coexist safely in the same project.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────
do $$ begin
  create type contact_type as enum ('housing_officer','partner','landlord','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type applicant_stage as enum
    ('lead','referred','viewing','offer','placed','fee_invoiced','fee_paid','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_status as enum ('void','under_offer','let','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type inbox_status as enum
    ('queued','extracting','review','confirmed','discarded','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fee_status as enum ('pending','invoiced','paid');
exception when duplicate_object then null; end $$;

-- ── Contacts (officers, partners, landlords) ────────────────────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  type contact_type not null default 'other',
  full_name text not null,
  organisation text,
  borough text,
  email text,
  phone text,                          -- E.164 normalised (+44...)
  notes text,
  created_at timestamptz not null default now()
);

-- ── Applicants (people being housed) ────────────────────────────────
create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,                          -- E.164
  email text,
  date_of_birth date,
  adults int default 1,
  children int default 0,
  benefit_type text,                   -- 'UC' | 'HB' | other
  referring_borough text,
  source text,                         -- 'officer' | 'website' | 'whatsapp' | ...
  referred_by uuid references contacts(id) on delete set null,
  stage applicant_stage not null default 'lead',
  budget_pcm numeric,
  lha_band text,                       -- 'shared' | '1bed' | ...
  requirements text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Properties ──────────────────────────────────────────────────────
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  address_line text not null,
  postcode text,
  borough text,
  property_type text,                  -- 'studio' | '1bed' | 'hmo_room' | ...
  rent_pcm numeric,
  lha_rate_pcm numeric,
  landlord_id uuid references contacts(id) on delete set null,
  status property_status not null default 'void',
  available_from date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Placements (applicant matched into a property) ──────────────────
create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  property_id uuid references properties(id) on delete set null,
  council text,
  officer_id uuid references contacts(id) on delete set null,
  move_in_date date,
  rent_pcm numeric,
  incentive_amount numeric,
  fee_amount numeric,
  fee_splits jsonb default '[]'::jsonb,        -- [{"partner":"KPL","pct":50}]
  fee_status fee_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Inbox items (The Bin) ───────────────────────────────────────────
create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  image_path text,                     -- storage path in private 'bin' bucket
  source_hint text,                    -- optional user note typed at paste time
  status inbox_status not null default 'queued',
  detected_type text,
  raw_text text,
  extraction jsonb,                    -- full structured extraction (§5 contract)
  matches jsonb,                       -- matching engine output (§6)
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- ── Activities (the "what happened where" trail) ────────────────────
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,           -- 'applicant'|'property'|'placement'|'contact'
  entity_id uuid not null,
  kind text not null,                  -- 'created'|'updated'|'stage_change'|'note'|'extraction'
  body text not null,                  -- human sentence
  inbox_item_id uuid references inbox_items(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────
create index if not exists activities_entity_idx
  on activities(entity_type, entity_id, created_at desc);
create index if not exists applicants_name_trgm
  on applicants using gin (full_name gin_trgm_ops);
create index if not exists contacts_name_trgm
  on contacts using gin (full_name gin_trgm_ops);
create index if not exists applicants_phone_idx on applicants(phone);
create index if not exists contacts_phone_idx on contacts(phone);
create index if not exists applicants_stage_idx on applicants(stage);
create index if not exists properties_status_idx on properties(status);
create index if not exists inbox_status_idx on inbox_items(status, created_at desc);

-- ── updated_at triggers ─────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  create trigger applicants_updated_at before update on applicants
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger properties_updated_at before update on properties
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger placements_updated_at before update on placements
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security — single-operator system.
-- Any authenticated user may do everything; anon is blocked.
-- ════════════════════════════════════════════════════════════════════
alter table contacts     enable row level security;
alter table applicants   enable row level security;
alter table properties   enable row level security;
alter table placements   enable row level security;
alter table inbox_items  enable row level security;
alter table activities   enable row level security;

do $$ begin
  create policy auth_all_contacts    on contacts    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_applicants  on applicants  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_properties  on properties  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_placements  on placements  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_inbox       on inbox_items for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_activities  on activities  for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════
-- Fuzzy name matching RPC (§6). Used by the matching engine.
-- SECURITY INVOKER so it still respects the caller's RLS.
-- ════════════════════════════════════════════════════════════════════
create or replace function match_applicants(query text, threshold real default 0.45)
returns table (id uuid, full_name text, phone text, referring_borough text, stage applicant_stage, score real)
language sql stable security invoker as $$
  select a.id, a.full_name, a.phone, a.referring_borough, a.stage,
         similarity(a.full_name, query) as score
  from applicants a
  where similarity(a.full_name, query) > threshold
  order by score desc
  limit 5
$$;

create or replace function match_contacts(query text, threshold real default 0.45)
returns table (id uuid, full_name text, organisation text, borough text, type contact_type, score real)
language sql stable security invoker as $$
  select c.id, c.full_name, c.organisation, c.borough, c.type,
         similarity(c.full_name, query) as score
  from contacts c
  where similarity(c.full_name, query) > threshold
  order by score desc
  limit 5
$$;

-- ── Private storage bucket for screenshots ──────────────────────────
insert into storage.buckets (id, name, public)
values ('bin', 'bin', false)
on conflict (id) do nothing;

-- Authenticated users may read/write objects in the 'bin' bucket.
do $$ begin
  create policy bin_auth_read on storage.objects
    for select to authenticated using (bucket_id = 'bin');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy bin_auth_insert on storage.objects
    for insert to authenticated with check (bucket_id = 'bin');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy bin_auth_delete on storage.objects
    for delete to authenticated using (bucket_id = 'bin');
exception when duplicate_object then null; end $$;

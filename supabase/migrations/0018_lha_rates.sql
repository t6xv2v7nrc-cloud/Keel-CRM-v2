-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: LHA rates and postcode areas held with their source (run after 0017)
--
-- Step 1 of the update brief.
--   lha_rates      one row per BRMA, size and year: the monthly Universal Credit
--                  LHA rate, where it came from (source_url) and the date it
--                  applies from. Loaded from the gov.uk CSV in Team settings,
--                  never typed in. bedrooms 0 is the shared accommodation rate.
--   postcode_brma  which BRMA a postcode district ("NW11") or sector ("NW10 4")
--                  is in. manual_override = checked by hand (on the VOA's LHA
--                  Direct, say). Team corrections already saved in Team
--                  settings for a postcode district are copied in.
--
-- Backup: none needed. This adds two new tables and changes no existing one
-- (it only reads the settings row to copy the corrections).
--
-- Rollback (Supabase SQL Editor):
--   drop table if exists postcode_brma;
--   drop table if exists lha_rates;
-- The app goes back to the built-in rates and the corrections in Team settings.
--
-- Signed-in people can read both; only the owner can change them (once 0007 has
-- been run). Nothing here is open to anyone who is not signed in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists lha_rates (
  id              uuid primary key default gen_random_uuid(),
  brma            text not null,
  bedrooms        int not null check (bedrooms between 0 and 4),   -- 0 = shared accommodation rate (SAR)
  monthly_uc      numeric(10, 2) not null check (monthly_uc > 0),
  source_url      text not null,
  effective_from  date not null,
  loaded_at       timestamptz not null default now(),
  loaded_by       uuid default auth.uid() references auth.users(id) on delete set null
);
create unique index if not exists lha_rates_area_size_date_idx on lha_rates(brma, bedrooms, effective_from);
create index if not exists lha_rates_date_idx on lha_rates(effective_from);

create table if not exists postcode_brma (
  postcode_prefix  text primary key,            -- "NW11" (district) or "NW10 4" (sector)
  brma             text not null,
  manual_override  boolean not null default true,
  note             text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid default auth.uid() references auth.users(id) on delete set null
);

alter table lha_rates enable row level security;
alter table postcode_brma enable row level security;
revoke all on lha_rates from anon;
revoke all on postcode_brma from anon;

do $$ begin
  create policy lha_rates_read on lha_rates for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy postcode_brma_read on postcode_brma for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'is_keel_owner') then
    create policy lha_rates_owner_write on lha_rates for all to authenticated using (is_keel_owner()) with check (is_keel_owner());
  else
    create policy lha_rates_owner_write on lha_rates for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null; end $$;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'is_keel_owner') then
    create policy postcode_brma_owner_write on postcode_brma for all to authenticated using (is_keel_owner()) with check (is_keel_owner());
  else
    create policy postcode_brma_owner_write on postcode_brma for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null; end $$;

-- Team corrections for a postcode district, saved in Team settings, come across as checked by hand.
-- (Corrections for a whole borough stay in Team settings.)
insert into postcode_brma (postcode_prefix, brma, manual_override, note)
select o.key, o.value, true, 'Copied from Team settings'
from settings s, jsonb_each_text(coalesce(s.value -> 'lhaAreaOverrides', '{}'::jsonb)) as o(key, value)
where s.key = 'app' and o.key ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?( [0-9])?$'
on conflict (postcode_prefix) do nothing;

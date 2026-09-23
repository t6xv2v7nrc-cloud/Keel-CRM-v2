-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — call log, app settings, triage lock (run after 0004)
--
-- 1. calls: every call to or from a client, with its outcome and notes.
-- 2. applicants.next_call_at: when to call the client next.
-- 3. applicants.tier_locked: true when the tier was set by hand, so a
--    change to the tier rules in Settings never overrides it.
-- 4. settings: app-wide rules (tiers, urgency, matching, calls) shared by
--    every device.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists calls (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  direction    text not null default 'outgoing' check (direction in ('outgoing', 'incoming')),
  outcome      text not null check (outcome in ('answered', 'no_answer', 'voicemail', 'busy', 'wrong_number')),
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists calls_applicant_idx on calls(applicant_id, created_at desc);
create index if not exists calls_created_idx on calls(created_at desc);

alter table applicants
  add column if not exists next_call_at date,
  add column if not exists tier_locked  boolean not null default false;
create index if not exists applicants_next_call_idx on applicants(next_call_at);

-- A stored tier that differs from the standard rules was set by hand: lock it.
update applicants set tier_locked = true
where tier_locked = false and tier is not null and tier <> (
  case
    when household_type = 'single' and coalesce(on_uc, false) and coalesce(pip, false)
         and coalesce(lcwra, false) and coalesce(council_registered, false) then 1
    when coalesce(council_registered, false) and (coalesce(on_uc, false) or work_status = 'full_time') then 2
    else 3
  end
);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table calls    enable row level security;
alter table settings enable row level security;
do $$ begin
  create policy auth_all_calls    on calls    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_settings on settings for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — money owed (run after 0011)
--
-- receivables: money Keel is owed for a placement.
--   letting_fee: from whoever pays it (a provider such as Watermint or
--                Zuber, or the landlord). Status: due, chased, paid.
--   incentive:   from a council. Status: to_claim, submitted, chased, paid
--                (or declined).
-- Each has an amount and a due date, worked out from the sign-up date
-- (e.g. a Watermint fee is due one month after sign up) and changeable.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists receivables (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('letting_fee', 'incentive')),
  applicant_id       uuid not null references applicants(id) on delete cascade,
  deal_id            uuid references deals(id) on delete set null,       -- the placement it is for
  property_address   text,
  payer              text not null,                                      -- 'Watermint', 'Zuber', 'Landlord', or the council
  provider_id        uuid references providers(id) on delete set null,   -- when the payer is a provider
  amount             numeric(10, 2),                                     -- null until the amount is known
  sign_up_on         date,                                               -- the due date is worked out from this
  due_on             date,
  claim_submitted_on date,                                               -- incentives
  status             text not null default 'due'
                       check (status in ('due', 'chased', 'paid', 'to_claim', 'submitted', 'declined')),
  paid_on            date,
  notes              text,
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists receivables_due_idx on receivables(status, due_on);
create index if not exists receivables_applicant_idx on receivables(applicant_id);
create index if not exists receivables_deal_idx on receivables(deal_id);

do $$ begin
  create trigger receivables_updated_at before update on receivables
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

alter table receivables enable row level security;
do $$ begin
  create policy auth_all_receivables on receivables for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

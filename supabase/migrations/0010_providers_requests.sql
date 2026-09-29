-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — providers and property requests (run after 0009)
--
-- 1. providers: who supplies properties (the source tag on a list: BP,
--    SR, ZUB...), their WhatsApp number, and the rules they work to
--    (benefits, household, boroughs, max rent, furnished).
-- 2. properties.provider_id: which provider a property came from, filled
--    in from its source tag.
-- 3. requests: every request sent to a provider on WhatsApp (check
--    availability, book a viewing, send client details), with its status
--    and when to chase.
-- 4. applicants.share_with_landlords: the client has agreed their details
--    can be sent to landlords and agents. Off until someone ticks it.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists providers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  contact_first_name text,
  company            text,
  tag                text not null,
  whatsapp           text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),  -- digits only: 447700900123
  email              text,
  rules              jsonb not null default '{}'::jsonb,
  fee_terms          text,
  notes              text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists providers_tag_idx on providers (upper(tag));
do $$ begin
  create trigger providers_updated_at before update on providers
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- The tags already on stock lists, so properties link up straight away. Fill in the names and numbers in Team settings.
insert into providers (name, tag)
select t, t from unnest(array['BP', 'SR', 'SL', 'WM', 'SLE', 'MIXE', 'ZUB']) as t
on conflict do nothing;

alter table properties add column if not exists provider_id uuid references providers(id) on delete set null;
create index if not exists properties_provider_idx on properties(provider_id);
update properties p set provider_id = pr.id
from providers pr
where p.provider_id is null and p.source_tag is not null and upper(trim(p.source_tag)) = upper(pr.tag);

create table if not exists requests (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid references providers(id) on delete set null,
  property_id      uuid references properties(id) on delete set null,
  property_address text not null,               -- kept so the request reads well after a list is purged
  client_ids       uuid[] not null default '{}',
  type             text not null check (type in ('availability', 'viewing', 'details')),
  message          text not null,
  slots            jsonb not null default '[]'::jsonb,   -- proposed viewing times, ISO
  status           text not null default 'sent' check (status in ('sent', 'confirmed', 'declined', 'no_reply', 'cancelled')),
  sent_at          timestamptz not null default now(),
  follow_up_at     timestamptz,
  outcome_note     text,
  override_reason  text,                         -- why it was sent although a client did not meet the provider's rules
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists requests_status_idx on requests(status, follow_up_at);
create index if not exists requests_property_idx on requests(property_id);
create index if not exists requests_clients_idx on requests using gin (client_ids);
do $$ begin
  create trigger requests_updated_at before update on requests
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

alter table applicants add column if not exists share_with_landlords boolean not null default false;

-- Everyone signed in can read providers and send requests. Changing providers
-- is for the owner, like the rest of Team settings (once 0007 has been run).
alter table providers enable row level security;
alter table requests  enable row level security;
do $$ begin
  create policy providers_read on providers for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'is_keel_owner') then
    create policy providers_owner_write on providers for all to authenticated using (is_keel_owner()) with check (is_keel_owner());
  else
    create policy providers_owner_write on providers for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null; end $$;
do $$ begin
  create policy auth_all_requests on requests for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

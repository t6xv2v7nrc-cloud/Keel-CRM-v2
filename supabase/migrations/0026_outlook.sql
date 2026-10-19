-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: emails brought in from Outlook (run after 0025)
--
-- Keel can now read the connected person's Outlook inbox for emails from housing officers and councils (never
-- anything else): a reply about a client goes on that client's timeline, a nomination goes to the Bin, and any other
-- officer email waits under the Bin to be filed or ignored. This table remembers each email Keel has dealt with, so
-- none is brought in twice, even when two people's mailboxes both received it.
--   outlook_messages   one row per email: who sent it, its subject, when, what Keel did with it, and for the ones
--                      waiting, a short preview. The email itself stays in Outlook.
--
-- Backup: a new table only; no existing table changes, so nothing needs copying first.
--
-- Rollback (Supabase SQL Editor):
--   drop table if exists outlook_messages;
--
-- Row level security on, signed-in only; nothing here is reachable without signing in.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists outlook_messages (
  message_id    text primary key,             -- the email's internet message id: the same in every mailbox
  mailbox       text,                         -- whose Outlook it was read from
  from_address  text not null,
  from_name     text,
  subject       text,
  received_at   timestamptz not null,
  snippet       text,                         -- the first lines, for one waiting to be filed
  handled       text not null default 'pending' check (handled in ('pending', 'reply', 'bin', 'ignored')),
  applicant_id  uuid references applicants(id) on delete set null,
  inbox_item_id uuid references inbox_items(id) on delete set null,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  handled_at    timestamptz
);
create index if not exists outlook_messages_received_idx on outlook_messages(received_at desc);
create index if not exists outlook_messages_pending_idx on outlook_messages(handled) where handled = 'pending';

alter table outlook_messages enable row level security;
revoke all on outlook_messages from anon;
do $$ begin
  create policy auth_all_outlook_messages on outlook_messages for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

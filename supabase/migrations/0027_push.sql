-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: push notifications to phones and computers (run after 0026)
--
-- Each person can turn on notifications on each of their devices (Settings, My settings). Keel then sends a short
-- notification when something needs them while Keel is closed: something new in the Bin, a viewing within the hour,
-- an officer waiting on a reply or emailing about a client, and a morning summary on working days. First names and
-- short addresses only.
--   push_subscriptions   one row per device that turned notifications on: where to send (the browser's push
--                        address and its keys). Each person sees and removes only their own.
--   push_keys            Keel's own signing keys for push (made once by the server). Nobody signed in can read
--                        them: no policy lets anyone but the server near this table.
--   push_log             what has been sent already, so nothing is sent twice. Server only, like push_keys.
--
-- Backup: new tables only; no existing table changes, so nothing needs copying first.
--
-- Rollback (Supabase SQL Editor):
--   drop table if exists push_log; drop table if exists push_keys; drop table if exists push_subscriptions;
--
-- Row level security on for all three; nothing here is reachable without signing in, and the keys and log not even then.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  device       text,                          -- "iPhone", "Mac": so you can tell your devices apart
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

create table if not exists push_keys (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);

create table if not exists push_log (
  key     text primary key,                   -- what was sent: "bin:<item>", "viewing:<deal>:<time>", "morning:<day>"
  sent_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
alter table push_keys enable row level security;
alter table push_log enable row level security;
revoke all on push_subscriptions from anon;
revoke all on push_keys from anon, authenticated;
revoke all on push_log from anon, authenticated;
do $$ begin
  create policy own_push_subscriptions on push_subscriptions for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

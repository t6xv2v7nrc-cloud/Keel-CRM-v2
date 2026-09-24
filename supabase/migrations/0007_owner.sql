-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — an owner who controls the team rules (run after 0006)
--
-- 1. profiles.role: 'owner' or 'member'. The first person who set up a
--    profile becomes the owner; everyone after is a member.
-- 2. Only the owner can change the team settings (tier logic, urgency,
--    matching rules). Everyone can still read them and save their own
--    personal settings.
-- 3. Only the owner can change anyone's role (so a member cannot make
--    themselves owner). The owner can hand over to someone else.
--
-- If the wrong person ends up as owner, fix it with (put your email in):
--   update profiles set role = case when email = 'you@example.com' then 'owner' else 'member' end;
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table profiles add column if not exists role text not null default 'member';
do $$ begin
  alter table profiles add constraint profiles_role_check check (role in ('owner', 'member'));
exception when duplicate_object then null; end $$;

-- The earliest profile becomes owner if there is none yet
update profiles set role = 'owner'
where id = (select id from profiles order by created_at limit 1)
  and not exists (select 1 from profiles where role = 'owner');

-- Is the signed-in person the owner? (security definer: reads profiles without RLS loops)
create or replace function is_keel_owner() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner')
$$;

-- Roles: the first profile ever is the owner; after that only the owner can change roles
create or replace function profiles_guard_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.role := case when exists (select 1 from profiles where role = 'owner') then 'member' else 'owner' end;
    return new;
  end if;
  if new.role is distinct from old.role and not is_keel_owner() then
    raise exception 'Only the owner can change roles';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role before insert or update on profiles
  for each row execute function profiles_guard_role();

-- The owner may update any profile (to hand over ownership)
do $$ begin
  create policy profiles_owner_update on profiles for update to authenticated using (is_keel_owner()) with check (true);
exception when duplicate_object then null; end $$;

-- Settings: everyone reads; each person writes only their own row; only the owner writes the team row
drop policy if exists auth_all_settings on settings;
do $$ begin
  create policy settings_read on settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy settings_own on settings for all to authenticated
    using (key = 'user:' || auth.uid()::text) with check (key = 'user:' || auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy settings_team on settings for all to authenticated
    using (key = 'app' and is_keel_owner()) with check (key = 'app' and is_keel_owner());
exception when duplicate_object then null; end $$;

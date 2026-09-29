-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2 — sharing with landlords by default (run after 0010)
--
-- Team settings can say new clients start as "OK to share with landlords"
-- (settings key 'app', value shareWithLandlordsByDefault). This applies it
-- to every new client however they arrive: the Bin, the app, or the
-- website intake form.
--
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create or replace function applicants_share_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(new.share_with_landlords, false) then
    new.share_with_landlords := coalesce(
      (select (value ->> 'shareWithLandlordsByDefault')::boolean from settings where key = 'app'),
      false);
  end if;
  return new;
end $$;

do $$ begin
  create trigger applicants_share_default before insert on applicants
    for each row execute function applicants_share_default();
exception when duplicate_object then null; end $$;

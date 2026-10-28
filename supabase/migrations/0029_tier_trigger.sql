-- ════════════════════════════════════════════════════════════════════
-- Keel CRM v2: tiers worked out by the database, so they never go stale (run after 0028)
--
-- Matching brief A6. A client's tier was worked out by the app when someone saved their answers, so a client nobody
-- had saved since the tier rules changed (or one added another way) kept an old tier: 43 live clients were wrong.
-- Now the database works it out itself, from the tier rules in Team settings (settings key 'app', value.tierLogic),
-- exactly as src/lib/tiering.ts does:
--   keel_canonical_borough(text)    "Ealing Council", "RBKC", "LB of Harrow" to the borough's name (src/lib/london.ts)
--   keel_tier_field(client, field)  what a condition tests: household, UC, PIP, LCWRA, HB, council-registered, consent,
--                                   work, urgency, council, children, adults, budget (FIELDS in tiering.ts)
--   keel_condition_holds(client, condition), keel_tier_for(client, logic): the first tier whose conditions all hold
--                                   (and one of its "any" list, if it has one); the last tier is everyone else; a tier
--                                   with no conditions matches nobody
--   keel_tier_logic()               the saved tier rules, else the standard three tiers
--   trigger applicants_zz_tier      on every new or changed client: their tier, unless it was set by hand (tier_locked)
--   trigger settings_retier         when the tier rules are saved: every client not set by hand is worked out again,
--                                   and each one whose tier moves gets a line on their timeline
-- Then every client not set by hand is worked out once now, each change noted on their timeline.
--
-- A tier set by hand (tier_locked) is never touched. Working a tier out again does not count as the client being
-- updated: their "updated" time is kept, so the Pipeline's Recently updated order does not jump.
--
-- Backup: applicants as it was is copied to keel_backup.applicants_before_0029 first.
--
-- Rollback (Supabase SQL Editor):
--   drop trigger if exists applicants_zz_tier on applicants;
--   drop trigger if exists settings_retier on settings;
--   drop function if exists keel_applicants_tier(), keel_settings_retier(), keel_tier_for(applicants, jsonb),
--     keel_condition_holds(applicants, jsonb), keel_tier_field(applicants, text), keel_tier_logic(), keel_canonical_borough(text);
--   -- and, to put the old tiers back:
--   -- update applicants a set tier = b.tier from keel_backup.applicants_before_0029 b where a.id = b.id;
--
-- Row level security stays as it is (signed-in only). The functions run as whoever saves, so they read only what
-- that person may read; none is open to anyone signed out.
-- Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists keel_backup;
revoke all on schema keel_backup from public;
do $$ begin
  revoke all on schema keel_backup from anon, authenticated;
exception when undefined_object then null; end $$;
create table if not exists keel_backup.applicants_before_0029 as table public.applicants;

-- ── A borough's name from however it was written (canonicalBorough in src/lib/london.ts) ──
create or replace function public.keel_canonical_borough(t text) returns text
language sql immutable set search_path = public as $fn$
  with x as (
    select lower(trim(coalesce(t, ''))) as plain,
           ' ' || trim(regexp_replace(replace(lower(coalesce(t, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g')) || ' ' as low
  )
  select coalesce(
    (select b from x, unnest(array[
    'Barking & Dagenham', 'Barnet', 'Bexley', 'Brent', 'Bromley', 'Camden', 'City of London', 'Croydon',
    'Ealing', 'Enfield', 'Greenwich', 'Hackney', 'Hammersmith & Fulham', 'Haringey', 'Harrow', 'Havering',
    'Hillingdon', 'Hounslow', 'Islington', 'Kensington & Chelsea', 'Kingston upon Thames', 'Lambeth', 'Lewisham', 'Merton',
    'Newham', 'Redbridge', 'Richmond upon Thames', 'Southwark', 'Sutton', 'Tower Hamlets', 'Waltham Forest', 'Wandsworth',
    'Westminster', 'Hertsmere', 'Epsom & Ewell', 'Elmbridge', 'Spelthorne', 'Tandridge', 'Thurrock', 'Slough',
    'Norwich', 'Reading'
    ]::text[]) b where lower(b) = x.plain limit 1),
    (select k.borough from x, (values
    (1, 'hammersmith and fulham', 'Hammersmith & Fulham'), (2, 'kensington and chelsea', 'Kensington & Chelsea'), (3, 'barking and dagenham', 'Barking & Dagenham'), (4, 'kingston upon thames', 'Kingston upon Thames'),
    (5, 'richmond upon thames', 'Richmond upon Thames'), (6, 'epsom and ewell', 'Epsom & Ewell'), (7, 'city of london', 'City of London'), (8, 'waltham forest', 'Waltham Forest'),
    (9, 'tower hamlets', 'Tower Hamlets'), (10, 'westminster', 'Westminster'), (11, 'hammersmith', 'Hammersmith & Fulham'), (12, 'hillingdon', 'Hillingdon'),
    (13, 'wandsworth', 'Wandsworth'), (14, 'spelthorne', 'Spelthorne'), (15, 'kensington', 'Kensington & Chelsea'), (16, 'greenwich', 'Greenwich'),
    (17, 'islington', 'Islington'), (18, 'redbridge', 'Redbridge'), (19, 'southwark', 'Southwark'), (20, 'hertsmere', 'Hertsmere'),
    (21, 'elmbridge', 'Elmbridge'), (22, 'tandridge', 'Tandridge'), (23, 'haringey', 'Haringey'), (24, 'havering', 'Havering'),
    (25, 'hounslow', 'Hounslow'), (26, 'lewisham', 'Lewisham'), (27, 'thurrock', 'Thurrock'), (28, 'kingston', 'Kingston upon Thames'),
    (29, 'richmond', 'Richmond upon Thames'), (30, 'dagenham', 'Barking & Dagenham'), (31, 'bromley', 'Bromley'), (32, 'croydon', 'Croydon'),
    (33, 'enfield', 'Enfield'), (34, 'hackney', 'Hackney'), (35, 'lambeth', 'Lambeth'), (36, 'norwich', 'Norwich'),
    (37, 'chelsea', 'Kensington & Chelsea'), (38, 'barking', 'Barking & Dagenham'), (39, 'barnet', 'Barnet'), (40, 'bexley', 'Bexley'),
    (41, 'camden', 'Camden'), (42, 'ealing', 'Ealing'), (43, 'harrow', 'Harrow'), (44, 'merton', 'Merton'),
    (45, 'newham', 'Newham'), (46, 'sutton', 'Sutton'), (47, 'slough', 'Slough'), (48, 'fulham', 'Hammersmith & Fulham'),
    (49, 'brent', 'Brent'), (50, 'epsom', 'Epsom & Ewell'), (51, 'rbkc', 'Kensington & Chelsea'), (52, 'lbhf', 'Hammersmith & Fulham')
    ) as k(i, key, borough) where x.plain <> '' and position(' ' || k.key || ' ' in x.low) > 0 order by k.i limit 1)
  )
$fn$;

-- ── What a condition tests (FIELDS in src/lib/tiering.ts) ──
create or replace function public.keel_tier_field(a public.applicants, field text) returns text
language sql stable set search_path = public as $fn$
  select case field
    when 'household' then coalesce(nullif(a.household_type, ''),
      case when coalesce(a.children, 0) > 0 then 'family' when coalesce(a.adults, 0) >= 2 then 'couple' end)
    when 'uc' then case when a.on_uc is true or coalesce(a.benefit_type, '') ~* '\m(uc|universal credit)\M' then 'true' else a.on_uc::text end
    when 'pip' then case when a.pip is true or coalesce(a.benefit_type, '') ~* '\mpip\M' then 'true' else a.pip::text end
    when 'lcwra' then case when a.lcwra is true or coalesce(a.benefit_type, '') ~* '\mlcwra\M' then 'true' else a.lcwra::text end
    when 'hb' then case when coalesce(a.benefit_type, '') ~* '\m(hb|housing benefit)\M' then 'true' end
    when 'councilRegistered' then a.council_registered::text
    when 'consent' then a.consent::text
    when 'work' then nullif(a.work_status, '')
    when 'urgency' then nullif(a.urgency, '')
    when 'council' then public.keel_canonical_borough(coalesce(nullif(a.council, ''), a.referring_borough))
    when 'children' then a.children::text
    when 'adults' then a.adults::text
    when 'budget' then a.budget_pcm::text
  end
$fn$;

-- ── One condition (conditionHolds in src/lib/tiering.ts) ──
create or replace function public.keel_condition_holds(a public.applicants, c jsonb) returns boolean
language plpgsql stable set search_path = public as $fn$
declare
  v text := public.keel_tier_field(a, c->>'field');
  vals text[] := array(select jsonb_array_elements_text(case when jsonb_typeof(c->'values') = 'array' then c->'values' else '[]'::jsonb end));
  n numeric := case when (c->>'n') ~ '^-?[0-9]+(\.[0-9]+)?$' then (c->>'n')::numeric else 0 end;
  isnum boolean := coalesce(v ~ '^-?[0-9]+(\.[0-9]+)?$', false);
begin
  return coalesce(case c->>'op'
    when 'yes' then v = 'true'
    when 'no' then v = 'false'
    when 'unknown' then v is null or v = ''
    when 'oneOf' then v is not null and v = any(vals)
    when 'noneOf' then not (coalesce(v, 'null') = any(vals))
    when 'atLeast' then isnum and v::numeric >= n
    when 'atMost' then isnum and v::numeric <= n
    else false
  end, false);
end
$fn$;

-- ── A client's tier under some tier rules (computeTier in src/lib/tiering.ts) ──
create or replace function public.keel_tier_for(a public.applicants, logic jsonb) returns integer
language plpgsql stable set search_path = public as $fn$
declare
  tiers jsonb := case when jsonb_typeof(logic->'tiers') = 'array' then logic->'tiers' else '[]'::jsonb end;
  total integer := jsonb_array_length(case when jsonb_typeof(logic->'tiers') = 'array' then logic->'tiers' else '[]'::jsonb end);
  k integer;
  t jsonb;
  alls jsonb;
  anys jsonb;
  all_ok boolean;
  any_ok boolean;
begin
  for k in 0 .. total - 2 loop
    t := tiers->k;
    alls := case when jsonb_typeof(t->'all') = 'array' then t->'all' else '[]'::jsonb end;
    anys := case when jsonb_typeof(t->'any') = 'array' then t->'any' else '[]'::jsonb end;
    continue when jsonb_array_length(alls) = 0 and jsonb_array_length(anys) = 0; -- an unfinished tier matches nobody
    select coalesce(bool_and(public.keel_condition_holds(a, c)), true) into all_ok from jsonb_array_elements(alls) c;
    if not all_ok then continue; end if;
    if jsonb_array_length(anys) = 0 then return k + 1; end if;
    select coalesce(bool_or(public.keel_condition_holds(a, c)), false) into any_ok from jsonb_array_elements(anys) c;
    if any_ok then return k + 1; end if;
  end loop;
  return greatest(1, total);
end
$fn$;

-- ── The tier rules in force: Team settings, else the standard three tiers ──
create or replace function public.keel_tier_logic() returns jsonb
language sql stable set search_path = public as $fn$
  select coalesce(
    (select s.value->'tierLogic' from public.settings s where s.key = 'app' and jsonb_typeof(s.value->'tierLogic'->'tiers') = 'array'),
    '{"tiers":[{"label":"Tier 1","all":[{"field":"household","op":"oneOf","values":["single"]},{"field":"uc","op":"yes"},{"field":"pip","op":"yes"},{"field":"lcwra","op":"yes"},{"field":"councilRegistered","op":"yes"}],"any":[]},{"label":"Tier 2","all":[{"field":"councilRegistered","op":"yes"}],"any":[{"field":"uc","op":"yes"},{"field":"work","op":"oneOf","values":["full_time"]}]},{"label":"Tier 3","all":[],"any":[]}]}'::jsonb
  )
$fn$;

-- ── Every new or changed client: their tier, unless set by hand ──
-- Named "zz" so it runs after applicants_updated_at: when nothing but the tier changed (the rules were saved, or this
-- update is working tiers out again), the client keeps their "updated" time.
create or replace function public.keel_applicants_tier() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if coalesce(new.tier_locked, false) then return new; end if;
  new.tier := public.keel_tier_for(new, public.keel_tier_logic());
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'tier' - 'updated_at') = (to_jsonb(old) - 'tier' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$fn$;
drop trigger if exists applicants_zz_tier on public.applicants;
create trigger applicants_zz_tier before insert or update on public.applicants
  for each row execute function public.keel_applicants_tier();

-- ── When the tier rules are saved: every client not set by hand, worked out again ──
create or replace function public.keel_settings_retier() returns trigger
language plpgsql set search_path = public as $fn$
declare
  logic jsonb;
begin
  if new.key <> 'app' then return new; end if;
  if tg_op = 'UPDATE' and (old.value->'tierLogic') is not distinct from (new.value->'tierLogic') then return new; end if;
  logic := public.keel_tier_logic();
  with calc as (
    select a.id, a.tier as was, public.keel_tier_for(a, logic) as now_tier
    from public.applicants a where not coalesce(a.tier_locked, false)
  ), moved as (
    select * from calc where was is distinct from now_tier
  ), done as (
    update public.applicants a set tier = m.now_tier from moved m where a.id = m.id returning a.id
  )
  insert into public.activities (entity_type, entity_id, kind, body)
  select 'applicant', m.id, 'updated',
    'Tier worked out again after the tier rules changed: '
      || coalesce(nullif(trim(logic->'tiers'->(m.was - 1)->>'label'), ''), case when m.was is null then 'none' else 'Tier ' || m.was end)
      || ' to ' || coalesce(nullif(trim(logic->'tiers'->(m.now_tier - 1)->>'label'), ''), 'Tier ' || m.now_tier)
  from moved m where m.id in (select id from done);
  return new;
end
$fn$;
drop trigger if exists settings_retier on public.settings;
create trigger settings_retier after insert or update on public.settings
  for each row execute function public.keel_settings_retier();

-- nobody signed out can call any of these
revoke all on function public.keel_canonical_borough(text) from public, anon;
revoke all on function public.keel_tier_field(public.applicants, text) from public, anon;
revoke all on function public.keel_condition_holds(public.applicants, jsonb) from public, anon;
revoke all on function public.keel_tier_for(public.applicants, jsonb) from public, anon;
revoke all on function public.keel_tier_logic() from public, anon;
revoke all on function public.keel_applicants_tier() from public, anon;
revoke all on function public.keel_settings_retier() from public, anon;
grant execute on function public.keel_canonical_borough(text) to authenticated;
grant execute on function public.keel_tier_field(public.applicants, text) to authenticated;
grant execute on function public.keel_condition_holds(public.applicants, jsonb) to authenticated;
grant execute on function public.keel_tier_for(public.applicants, jsonb) to authenticated;
grant execute on function public.keel_tier_logic() to authenticated;
grant execute on function public.keel_applicants_tier() to authenticated;
grant execute on function public.keel_settings_retier() to authenticated;

-- ── Once now: every client not set by hand, worked out again, each change on their timeline ──
with logic as (select public.keel_tier_logic() as l),
calc as (
  select a.id, a.tier as was, public.keel_tier_for(a, logic.l) as now_tier, logic.l
  from public.applicants a, logic where not coalesce(a.tier_locked, false)
), moved as (
  select * from calc where was is distinct from now_tier
), done as (
  update public.applicants a set tier = m.now_tier from moved m where a.id = m.id returning a.id
)
insert into public.activities (entity_type, entity_id, kind, body)
select 'applicant', m.id, 'updated',
  'Tier worked out again by the database (0029): '
    || coalesce(nullif(trim(m.l->'tiers'->(m.was - 1)->>'label'), ''), case when m.was is null then 'none' else 'Tier ' || m.was end)
    || ' to ' || coalesce(nullif(trim(m.l->'tiers'->(m.now_tier - 1)->>'label'), ''), 'Tier ' || m.now_tier)
from moved m where m.id in (select id from done);

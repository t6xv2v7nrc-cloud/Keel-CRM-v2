// Checks that the database works tiers out exactly as the app does (0029, brief A6): random clients under the standard
// tiers and under a five-tier logic using every kind of condition, a tier set by hand left alone, the tiers worked out
// again when the rules are saved (each change on the timeline), and the "updated" time kept when only the tier moves.
// Needs pglite: npm i --no-save @electric-sql/pglite && npx tsx scripts/test-tier-sql.ts
import { readdirSync, readFileSync } from 'node:fs';
import { computeTier } from '../src/lib/tiering';
import { canonicalBorough } from '../src/lib/london';
import { DEFAULT_SETTINGS, DEFAULT_TIER_LOGIC, setActiveSettings } from '../src/lib/settings';
import type { TierLogic } from '../src/lib/settings';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

type Row = Record<string, unknown>;
async function main() {
  let PGlite: typeof import('@electric-sql/pglite').PGlite, pg_trgm: unknown;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
    ({ pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm'));
  } catch {
    console.log('First run: npm i --no-save @electric-sql/pglite');
    process.exit(1);
  }
  let pgcrypto = {};
  try { pgcrypto = { pgcrypto: (await import('@electric-sql/pglite/contrib/pgcrypto')).pgcrypto }; } catch { /* older pglite */ }
  const db = new PGlite({ extensions: { pg_trgm: pg_trgm as never, ...pgcrypto } });
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
  `);
  const dir = new URL('../supabase/migrations/', import.meta.url).pathname;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(dir + f, 'utf8'));
  const one = async <T = Row>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];

  // canonical boroughs: the database reads council names as the app does
  const names = ['Harrow', 'harrow council', 'LB of Harrow', 'RBKC', 'Royal Borough of Kensington & Chelsea', 'Hammersmith', 'H&F', 'Westminster City Council',
    'City of London', 'Barking and Dagenham', 'Tower Hamlets Council', 'Hounslow', 'Reading', 'reading borough council', 'Kingston', 'Richmond', 'nowhere', '', 'Slough', 'Epsom'];
  const bad: string[] = [];
  for (const n of names) {
    const [{ b }] = await one<{ b: string | null }>('select keel_canonical_borough($1) as b', [n]);
    if (b !== canonicalBorough(n)) bad.push(`${n}: db ${b}, app ${canonicalBorough(n)}`);
  }
  check('council names read the same in the database and the app', bad.length === 0, bad.join('; '));

  // random clients
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
  const yn = () => pick([true, false, null]);
  const clients = Array.from({ length: 300 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    full_name: `Client ${i}`, stage: 'referred',
    household_type: pick(['single', 'couple', 'family', 'other', null, '']),
    adults: pick([1, 2, 3, null]), children: pick([0, 1, 2, 4, null]),
    on_uc: yn(), pip: yn(), lcwra: yn(), council_registered: yn(), consent: yn(),
    benefit_type: pick([null, '', 'UC', 'universal credit, PIP', 'HB', 'housing benefit', 'LCWRA', 'ESA', 'pip']),
    work_status: pick(['not_working', 'part_time', 'full_time', null, '']),
    urgency: pick(['homeless_tonight', 'at_risk_56', 'temp_accommodation', 'overcrowding', 'none', null]),
    council: pick(['Harrow', 'harrow council', 'RBKC', 'Hounslow', null, '', 'Croydon']),
    referring_borough: pick([null, 'Ealing', 'LB of Brent']),
    budget_pcm: pick([null, 900, 1100, 1300, 1600]),
  }));
  for (const c of clients) {
    const cols = Object.keys(c);
    await db.query(`insert into applicants (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => (c as Row)[k]));
  }

  const compare = async (logic: TierLogic, label: string) => {
    setActiveSettings({ ...DEFAULT_SETTINGS, tierLogic: logic });
    const rows = await one<{ id: string; tier: number }>('select id, tier from applicants order by id');
    const wrong = rows.filter((r) => {
      const c = clients.find((x) => x.id === r.id)!;
      return computeTier(c, logic) !== r.tier;
    });
    check(`${label}: all 300 clients get the same tier as the app`, wrong.length === 0,
      wrong.slice(0, 3).map((r) => `${r.id.slice(-3)} db ${r.tier} app ${computeTier(clients.find((x) => x.id === r.id)!, logic)}`).join('; '));
  };
  await compare(DEFAULT_TIER_LOGIC, 'standard tiers, no settings saved');

  // a five-tier logic using every kind of condition
  const five: TierLogic = { tiers: [
    { label: 'Priority', all: [{ field: 'household', op: 'oneOf', values: ['single'] }, { field: 'uc', op: 'yes' }, { field: 'pip', op: 'yes' }], any: [] },
    { label: 'Registered', all: [{ field: 'councilRegistered', op: 'yes' }], any: [{ field: 'uc', op: 'yes' }, { field: 'work', op: 'oneOf', values: ['full_time'] }, { field: 'hb', op: 'yes' }] },
    { label: 'Focus', all: [{ field: 'council', op: 'oneOf', values: ['Harrow', 'Kensington & Chelsea'] }, { field: 'children', op: 'atMost', n: 2 }], any: [] },
    { label: 'Working', all: [{ field: 'budget', op: 'atLeast', n: 1100 }, { field: 'urgency', op: 'noneOf', values: ['none'] }, { field: 'consent', op: 'no' }], any: [{ field: 'adults', op: 'atLeast', n: 2 }, { field: 'lcwra', op: 'unknown' }] },
    { label: 'Everyone else', all: [], any: [] },
  ] };
  await db.query(`insert into settings (key, value) values ('app', $1)`, [JSON.stringify({ tierLogic: five, urgentLevels: [] })]);
  await compare(five, 'five tiers saved in Team settings');
  const moved = await one<{ n: number }>(`select count(*)::int as n from activities where body like 'Tier worked out again after the tier rules changed:%'`);
  check('saving the rules notes each client whose tier moved on their timeline', moved[0].n > 0, String(moved[0].n));

  // a tier set by hand is left alone
  const locked = clients[0].id;
  await db.query(`update applicants set tier = 2, tier_locked = true where id = $1`, [locked]);
  await db.query(`update applicants set on_uc = not coalesce(on_uc, false) where id = $1`, [locked]);
  check('a tier set by hand is never changed', (await one<{ tier: number }>('select tier from applicants where id = $1', [locked]))[0].tier === 2);

  // only the tier moved: the "updated" time is kept
  const backdate = async (id: string) => db.exec(`alter table applicants disable trigger user;
    update applicants set updated_at = '2026-01-01T00:00:00Z' where id = '${id}';
    alter table applicants enable trigger user;`);
  // a client whose tier moves when the rules go back to the standard ones
  const mover = clients.slice(1).find((c) => computeTier(c, five) !== computeTier(c, DEFAULT_TIER_LOGIC))!;
  await backdate(mover.id);
  await db.query(`update settings set value = $1 where key = 'app'`, [JSON.stringify({ tierLogic: DEFAULT_TIER_LOGIC })]);
  const kept = await one<{ updated_at: string; tier: number }>('select updated_at::text, tier from applicants where id = $1', [mover.id]);
  check('working tiers out again keeps the client\'s updated time', kept[0].updated_at.startsWith('2026-01-01') && kept[0].tier === computeTier(mover, DEFAULT_TIER_LOGIC), JSON.stringify(kept[0]));
  const all = await one<{ id: string; tier: number }>('select id, tier from applicants where not tier_locked order by id');
  const wrong = all.filter((r) => computeTier(clients.find((x) => x.id === r.id)!, DEFAULT_TIER_LOGIC) !== r.tier);
  check('saving the rules back to the standard ones works every tier out again', wrong.length === 0, String(wrong.length));

  // a real change still counts as an update
  await backdate(clients[2].id);
  await db.query(`update applicants set council_registered = true, on_uc = true where id = $1`, [clients[2].id]);
  const after = await one<{ updated_at: string; tier: number }>('select updated_at::text, tier from applicants where id = $1', [clients[2].id]);
  check('a change to their answers is an update, and the tier follows it', !after[0].updated_at.startsWith('2026-01-01') && after[0].tier <= 2, JSON.stringify(after[0]));

  // nobody signed out can run the functions
  const anon = await one<{ ok: boolean }>(`select has_function_privilege('anon', 'keel_tier_logic()', 'execute') as ok`);
  check('signed-out visitors cannot run the tier functions', anon[0].ok === false);

  setActiveSettings(DEFAULT_SETTINGS);
  console.log(failed ? `\n${failed} failed` : '\nAll passed');
  process.exit(failed ? 1 : 0);
}
main();

// Checks the database files: runs every migration in order, twice (they must be safe to re-run), against an
// in-memory Postgres with Supabase's auth and storage stubbed, then checks what the database functions do.
//   npm i --no-save @electric-sql/pglite && node scripts/check-migrations.mjs
// (--no-save keeps it out of package.json, so the deploy does not install it.)
let PGlite, pg_trgm;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm'));
} catch {
  console.log('First run: npm i --no-save @electric-sql/pglite');
  process.exit(1);
}
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url).pathname;
let pgcrypto = {};
try { pgcrypto = { pgcrypto: (await import('@electric-sql/pglite/contrib/pgcrypto')).pgcrypto }; } catch {}
export async function freshDb({ twice = false } = {}) {
  const db = new PGlite({ extensions: { pg_trgm, ...pgcrypto } });
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
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      try { await db.exec(readFileSync(dir + f, 'utf8')); }
      catch (e) { throw new Error(`${f}${i ? ' (second run)' : ''}: ${e.message}`); }
    }
  }
  return db;
}

const db = await freshDb({ twice: true });
console.log('PASS  every migration runs, and runs again safely');
let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };
const K = '11111111-1111-1111-1111-111111111111', G = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into applicants (id, full_name, phone, stage, notes, budget_pcm, council) values
    ('${K}', 'Anna Mecani', null, 'lead', 'First note', null, 'Barnet'),
    ('${G}', 'Ana Mecani', '+447700900123', 'viewing', 'Second note', 1100, 'Brent');
  insert into calls (applicant_id, direction, outcome) values ('${G}', 'outgoing', 'answered');
  insert into deals (applicant_id, address, status) values ('${K}', '1 Elm Road', 'sent'), ('${G}', '1 Elm Road', 'viewing'), ('${G}', '2 Oak Lane', 'interested');
  insert into receivables (kind, applicant_id, payer, amount) values ('letting_fee', '${G}', 'Watermint', 300);
  insert into requests (property_address, client_ids, type, message) values ('1 Elm Road', array['${G}', '${K}']::uuid[], 'availability', 'x');
  insert into activities (entity_type, entity_id, kind, body) values ('applicant', '${G}', 'note', 'old line');
`);
await db.query(`select merge_applicants($1, $2)`, [K, G]);
const one = async (sql) => (await db.query(sql)).rows;
const a = (await one(`select * from applicants`));
check('one record left, the kept one', a.length === 1 && a[0].id === K);
check('missing details filled in, kept ones kept', a[0].phone === '+447700900123' && Number(a[0].budget_pcm) === 1100 && a[0].council === 'Barnet', JSON.stringify({ phone: a[0].phone, budget: a[0].budget_pcm, council: a[0].council }));
check('notes joined', a[0].notes === 'First note\n\nSecond note', JSON.stringify(a[0].notes));
check('stage is the further one', a[0].stage === 'viewing');
check('calls moved', (await one(`select count(*)::int n from calls where applicant_id = '${K}'`))[0].n === 1);
const deals = await one(`select address, status from deals where applicant_id = '${K}' order by address`);
check('properties moved; one both were going for keeps the one that got further', deals.map((d) => `${d.address}:${d.status}`).join(',') === '1 Elm Road:viewing,2 Oak Lane:interested', JSON.stringify(deals));
check('fees moved', (await one(`select count(*)::int n from receivables where applicant_id = '${K}'`))[0].n === 1);
const req = await one(`select client_ids from requests`);
check('requests name the kept client once', JSON.stringify(req[0].client_ids) === JSON.stringify([K]), JSON.stringify(req[0].client_ids));
const acts = await one(`select body from activities where entity_id = '${K}' order by created_at`);
check('timeline moved, and says it was merged', acts.some((x) => x.body === 'old line') && acts.some((x) => x.body === "Merged Ana Mecani's duplicate record into this one"), JSON.stringify(acts));
// merging into itself does nothing; a missing client is an error
await db.query(`select merge_applicants($1, $1)`, [K]);
check('merging a client into themselves changes nothing', (await one(`select count(*)::int n from applicants`))[0].n === 1);
let err = '';
try { await db.query(`select merge_applicants($1, $2)`, [K, '33333333-3333-3333-3333-333333333333']); } catch (e) { err = e.message; }
check('a client that is not there stops it', /Client not found/.test(err), err);
// invoice numbers from 0013
const n1 = (await one(`select next_invoice_no(1) n`))[0].n, n2 = (await one(`select next_invoice_no(1) n`))[0].n, n3 = (await one(`select next_invoice_no(50) n`))[0].n, n4 = (await one(`select next_invoice_no(1) n`))[0].n;
check('invoice numbers run on, never repeat, and respect the lowest number', [n1, n2, n3, n4].map(Number).join(',') === '1,2,50,51', [n1, n2, n3, n4].join(','));
// 0016: clients confirmed from the Bin are dated from when the Bin received them
const R = '44444444-4444-4444-4444-444444444444', M = '55555555-5555-5555-5555-555555555555', I = '66666666-6666-6666-6666-666666666666';
await db.exec(`
  insert into inbox_items (id, status, created_at) values ('${I}', 'confirmed', '2026-09-01T09:00:00Z');
  insert into applicants (id, full_name, stage, created_at, stage_changed_at, updated_at) values
    ('${R}', 'Rana Late', 'referred', '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z', '2026-09-26T10:00:00Z'),
    ('${M}', 'Mo Moved', 'viewing', '2026-09-20T10:00:00Z', '2026-09-25T10:00:00Z', '2026-09-26T10:00:00Z');
  insert into activities (entity_type, entity_id, kind, body, inbox_item_id) values
    ('applicant', '${R}', 'created', 'Created applicant Rana Late at stage referred (from screenshot)', '${I}'),
    ('applicant', '${M}', 'created', 'Created applicant Mo Moved at stage referred (from screenshot)', '${I}');
`);
await db.exec(readFileSync(dir + '0016_received_dates.sql', 'utf8'));
await db.exec(readFileSync(dir + '0016_received_dates.sql', 'utf8'));
const dated = Object.fromEntries((await one(`select id, created_at, stage_changed_at, updated_at from applicants where id in ('${R}', '${M}')`)).map((r) => [r.id, r]));
const iso = (d) => (d ? new Date(d).toISOString() : null);
check('a client from the Bin is dated from when the Bin received it', iso(dated[R].created_at) === '2026-09-01T09:00:00.000Z', iso(dated[R].created_at));
check('its stage, unmoved since, goes back with it', iso(dated[R].stage_changed_at) === '2026-09-01T09:00:00.000Z', iso(dated[R].stage_changed_at));
check('a stage moved later keeps its own date', iso(dated[M].stage_changed_at) === '2026-09-25T10:00:00.000Z' && iso(dated[M].created_at) === '2026-09-01T09:00:00.000Z');
check('"updated" times are left as they were', iso(dated[R].updated_at) === '2026-09-26T10:00:00.000Z', iso(dated[R].updated_at));
const trig = await one(`select tgenabled from pg_trigger where tgname = 'applicants_updated_at'`);
check('the "updated" clock is switched back on afterwards', trig[0]?.tgenabled === 'O', JSON.stringify(trig));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

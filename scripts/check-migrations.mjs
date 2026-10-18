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
export async function freshDb({ twice = false, upTo = null } = {}) {
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
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql') && (!upTo || f.slice(0, 4) <= upTo)).sort();
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

// 0018: LHA rates and postcode areas; team corrections for a postcode district are copied in, boroughs are not
await db.exec(`
  insert into settings (key, value) values ('app', '{"lhaAreaOverrides": {"NW11": "Inner North London", "NW10 4": "Inner West London", "Haringey": "Outer North London"}}')
    on conflict (key) do update set value = excluded.value;
`);
await db.exec(readFileSync(dir + '0018_lha_rates.sql', 'utf8'));
await db.exec(readFileSync(dir + '0018_lha_rates.sql', 'utf8'));
const pb = await one(`select postcode_prefix, brma, manual_override from postcode_brma order by postcode_prefix`);
check('postcode corrections copied from Team settings, checked by hand; borough ones stay in settings',
  JSON.stringify(pb.map((r) => [r.postcode_prefix, r.brma, r.manual_override])) === JSON.stringify([['NW10 4', 'Inner West London', true], ['NW11', 'Inner North London', true]]), JSON.stringify(pb));
await db.exec(`insert into lha_rates (brma, bedrooms, monthly_uc, source_url, effective_from) values ('Outer West London', 1, 1100, 'https://www.gov.uk/x', '2026-04-01')`);
let dupe = false;
try { await db.exec(`insert into lha_rates (brma, bedrooms, monthly_uc, source_url, effective_from) values ('Outer West London', 1, 1200, 'https://www.gov.uk/x', '2026-04-01')`); } catch { dupe = true; }
check('one rate per area, size and start date', dupe);
let bad = 0;
for (const sql of [
  `insert into lha_rates (brma, bedrooms, monthly_uc, source_url, effective_from) values ('X', 5, 100, 'u', '2026-04-01')`,
  `insert into lha_rates (brma, bedrooms, monthly_uc, source_url, effective_from) values ('X', 1, 0, 'u', '2026-04-01')`,
  `insert into lha_rates (brma, bedrooms, monthly_uc, effective_from) values ('X', 1, 100, '2026-04-01')`,
]) { try { await db.exec(sql); } catch { bad++; } }
check('a size over 4 bed, a zero rate or a rate with no source is refused', bad === 3, String(bad));
const rls = await one(`select relname, relrowsecurity from pg_class where relname in ('lha_rates', 'postcode_brma') order by relname`);
check('row level security is on for both new tables', rls.length === 2 && rls.every((r) => r.relrowsecurity));

// 0019: property checks; a backup copy is taken first, outside the schema the app reads
const back = await one(`select count(*)::int as n from keel_backup.properties_before_0019`);
check('properties are backed up into keel_backup before 0019 changes them', back.length === 1 && typeof back[0].n === 'number');
const inPublic = await one(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name like '%before_0019%'`);
check('the backup is not in the public schema the API serves', inPublic[0].n === 0);
await db.exec(`insert into properties (id, address_line, accommodation_type, suitable_for, bills_included, epc_rating) values
  ('77777777-7777-7777-7777-777777777777', '9 Test Row', 'shared_kitchen', array['uc_35_plus', 'sar_exempt'], array['water', 'internet'], 'C')`);
const cp = await one(`select accommodation_type, suitable_for, no_gas, photo_count from properties where id = '77777777-7777-7777-7777-777777777777'`);
check('the new property fields save', cp[0].accommodation_type === 'shared_kitchen' && cp[0].suitable_for.join() === 'uc_35_plus,sar_exempt' && cp[0].no_gas === false && cp[0].photo_count === null, JSON.stringify(cp[0]));
let refused = 0;
for (const sql of [
  `update properties set accommodation_type = 'castle' where id = '77777777-7777-7777-7777-777777777777'`,
  `update properties set suitable_for = array['students'] where id = '77777777-7777-7777-7777-777777777777'`,
  `update properties set epc_rating = 'H' where id = '77777777-7777-7777-7777-777777777777'`,
  `update properties set bills_included = array['pool'] where id = '77777777-7777-7777-7777-777777777777'`,
]) { try { await db.exec(sql); } catch { refused++; } }
check('a made-up type, suitability, EPC rating or bill is refused', refused === 4, String(refused));

// 0020: officers (HELM's table, made here when missing) gain send status; sends log; council schemes
const oid = (await one(`insert into officers (name, council, email) values ('Test Officer', 'Harrow', 'test.officer@harrow.example') returning id`))[0].id;
check('a new officer gets an id made for it', typeof oid === 'string' && oid.length > 10, String(oid));
const off = (await one(`select route_type, status, bounce_count from officers where id = '${oid}'`))[0];
check('officers start active, as housing officers, with no bounces', off.route_type === 'housing_officer' && off.status === 'active' && off.bounce_count === 0, JSON.stringify(off));
let offBad = 0;
for (const sql of [`update officers set status = 'retired' where id = '${oid}'`, `update officers set route_type = 'pigeon' where id = '${oid}'`,
  `insert into officer_sends (officer_id, kind) values ('${oid}', 'spam')`, `insert into council_schemes (council, max_incentive) values ('Harrow', -1)`]) {
  try { await db.exec(sql); } catch { offBad++; }
}
check('an unknown status, route, send kind or a negative incentive is refused', offBad === 4, String(offBad));
await db.exec(`insert into officer_sends (officer_id, kind) values ('${oid}', 'bulk'); insert into council_schemes (council, scheme_name, registered) values ('Islington', 'Rental alert', false);`);
const rls20 = await one(`select relname, relrowsecurity from pg_class where relname in ('officers', 'officer_sends', 'council_schemes') order by relname`);
check('row level security is on for officers, sends and schemes', rls20.length === 3 && rls20.every((r) => r.relrowsecurity));
// on a database that already had HELM's officers (with rows and a text id with no default), the backup is taken and the id gets a default
const helm = await freshDb({ upTo: '0019' });
await helm.exec(`create table officers (id text primary key, name text, council text, email text, temp text, score int, created_at timestamptz default now(), updated_at timestamptz default now());
  insert into officers (id, name, council, email, temp, score) values ('o-1', 'Old Officer', 'Brent', 'old@brent.example', 'hot', 80);`);
for (let i = 0; i < 2; i++) await helm.exec(readFileSync(dir + '0020_council_contacts.sql', 'utf8'));
const bk = await helm.query(`select id, temp, score from keel_backup.officers_before_0020`);
check('HELM officers are backed up as they were, once', bk.rows.length === 1 && bk.rows[0].temp === 'hot', JSON.stringify(bk.rows));
const kept = (await helm.query(`select id, name, temp, status, route_type from officers`)).rows[0];
check('HELM columns and rows are kept; new ones start active', kept.id === 'o-1' && kept.temp === 'hot' && kept.status === 'active' && kept.route_type === 'housing_officer', JSON.stringify(kept));
const newId = (await helm.query(`insert into officers (name) values ('New One') returning id`)).rows[0].id;
check('a text id with no default gets one, so Keel can add officers', typeof newId === 'string' && newId.length > 10, String(newId));

// 0021: placements hang off moved-in deals; made for every moved-in deal once, noted on the timeline
const fresh21 = await freshDb({ upTo: '0020' });
await fresh21.exec(`
  insert into providers (id, name, tag) values ('88888888-8888-8888-8888-888888888888', 'Test Partner', 'TSTP');
  insert into applicants (id, full_name, stage, council, officer_email) values ('99999999-9999-9999-9999-999999999999', 'Placed Person', 'placed', 'Harrow', 'o@harrow.example');
  insert into applicants (id, full_name, stage) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Still Looking', 'viewing');
  insert into properties (id, address_line, rent_pcm, provider_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1 Moved Road', 1100, '88888888-8888-8888-8888-888888888888');
  insert into deals (id, applicant_id, property_id, address, status, move_in_on) values
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '99999999-9999-9999-9999-999999999999', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1 Moved Road', 'moved_in', '2026-10-01'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, '2 Viewing Road', 'viewing', null);
`);
for (let i = 0; i < 2; i++) await fresh21.exec(readFileSync(dir + '0021_placements.sql', 'utf8'));
const pl = (await fresh21.query(`select deal_id, council, move_in_date, rent_pcm, provider_id, route, split_agreed_in_writing from placements`)).rows;
check('one placement per moved-in deal, made once, with council, move-in, rent, partner and route',
  pl.length === 1 && pl[0].council === 'Harrow' && Number(pl[0].rent_pcm) === 1100 && pl[0].provider_id === '88888888-8888-8888-8888-888888888888' && pl[0].route === 'officer' && pl[0].split_agreed_in_writing === false, JSON.stringify(pl));
const plAct = (await fresh21.query(`select count(*)::int as n from activities where body like 'Placement recorded%'`)).rows[0].n;
check('each placement made is noted on the timeline, once', plAct === 1, String(plAct));
let plBad = 0;
for (const sql of [`update placements set route = 'walk_in'`, `update placements set fee_type = 'tips'`, `update placements set invoiced_by = 'council'`, `update placements set keel_share_pct = 120`,
  `insert into placements (applicant_id, deal_id) values ('99999999-9999-9999-9999-999999999999', 'cccccccc-cccc-cccc-cccc-cccccccccccc')`]) {
  try { await fresh21.exec(sql); } catch { plBad++; }
}
check('an unknown route, fee type or invoicer, a share over 100%, or a second placement for one deal is refused', plBad === 5, String(plBad));
const plBackup = (await fresh21.query(`select count(*)::int as n from keel_backup.placements_before_0021`)).rows[0].n;
check('placements are backed up first', plBackup === 0);

// 0022: how each viewing went, why a deal was lost, replies to officers; deals and applicants backed up, nothing filled in
const fresh22 = await freshDb({ upTo: '0021' });
await fresh22.exec(`
  insert into applicants (id, full_name, stage) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Viewed Person', 'viewing');
  insert into deals (id, applicant_id, address, status, viewing_at, fell_through_reason) values
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '3 Seen Road', 'fell_through', '2026-10-01 14:00', 'Client said no');
`);
for (let i = 0; i < 2; i++) await fresh22.exec(readFileSync(dir + '0022_viewings.sql', 'utf8'));
const vd = (await fresh22.query(`select viewing_outcome, reason_lost, outcome_at, outcome_sent_to_officer_at from deals`)).rows[0];
check('deals gain outcome columns, and nothing is filled in for old ones', vd && vd.viewing_outcome === null && vd.reason_lost === null && vd.outcome_sent_to_officer_at === null, JSON.stringify(vd));
await fresh22.exec(`update deals set viewing_outcome = 'no_show', reason_lost = 'too_far', outcome_sent_to_officer_at = now();
  update applicants set nominated_at = now(), officer_replied_at = now();`);
let vBad = 0;
for (const sql of [`update deals set viewing_outcome = 'maybe'`, `update deals set reason_lost = 'weather'`]) {
  try { await fresh22.exec(sql); } catch { vBad++; }
}
check('an unknown outcome or reason lost is refused', vBad === 2, String(vBad));
const vBackup = (await fresh22.query(`select (select count(*)::int from keel_backup.deals_before_0022) as d, (select count(*)::int from keel_backup.applicants_before_0022) as a`)).rows[0];
check('deals and applicants are backed up first, once', vBackup.d === 1 && vBackup.a === 1, JSON.stringify(vBackup));

// 0023: what matching needs on every client; applicants backed up, nothing filled in
const fresh23 = await freshDb({ upTo: '0022' });
await fresh23.exec(`insert into applicants (id, full_name, stage) values ('abababab-abab-abab-abab-abababababab', 'Match Person', 'lead');`);
for (let i = 0; i < 2; i++) await fresh23.exec(readFileSync(dir + '0023_matching.sql', 'utf8'));
const m23 = (await fresh23.query(`select postcode_area, age_band, benefit_cap from applicants`)).rows[0];
check('clients gain postcode area, age band and benefit cap, empty', m23 && m23.postcode_area === null && m23.age_band === null && m23.benefit_cap === null, JSON.stringify(m23));
await fresh23.exec(`update applicants set postcode_area = 'HA1, HA2', age_band = 'under_35', benefit_cap = 'capped'`);
let mBad = 0;
for (const sql of [`update applicants set age_band = '40'`, `update applicants set benefit_cap = 'maybe'`]) {
  try { await fresh23.exec(sql); } catch { mBad++; }
}
check('an unknown age band or benefit cap is refused', mBad === 2, String(mBad));
const m23b = (await fresh23.query(`select count(*)::int as n from keel_backup.applicants_before_0023`)).rows[0].n;
check('applicants are backed up first', m23b === 1, String(m23b));

// 0024: the Mailer: photo links on properties (3 at most), the properties and subject of each officer send
const fresh24 = await freshDb({ upTo: '0023' });
await fresh24.exec(`insert into properties (id, address_line) values ('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', '1 Photo Road');
  insert into officers (id, name, email) values ('efefefef-efef-efef-efef-efefefefefef', 'Mail Person', 'mp@example.test');
  insert into officer_sends (officer_id, kind, address) values ('efefefef-efef-efef-efef-efefefefefef', 'bulk', 'mp@example.test');`);
for (let i = 0; i < 2; i++) await fresh24.exec(readFileSync(dir + '0024_mailer.sql', 'utf8'));
const p24 = (await fresh24.query(`select photo_urls from properties`)).rows[0];
const s24 = (await fresh24.query(`select property_ids, subject from officer_sends`)).rows[0];
check('properties gain photo links, sends their properties and subject (empty to start)', Array.isArray(p24.photo_urls) && p24.photo_urls.length === 0 && Array.isArray(s24.property_ids) && s24.subject === null, JSON.stringify({ p24, s24 }));
await fresh24.exec(`update properties set photo_urls = array['https://a', 'https://b', 'https://c']`);
let pBad = 0;
try { await fresh24.exec(`update properties set photo_urls = array['1', '2', '3', '4']`); } catch { pBad++; }
check('a fourth photo link is refused', pBad === 1);
const b24 = (await fresh24.query(`select (select count(*)::int from keel_backup.properties_before_0024) as p, (select count(*)::int from keel_backup.officer_sends_before_0024) as s`)).rows[0];
check('properties and officer sends are backed up first', b24.p === 1 && b24.s === 1, JSON.stringify(b24));

// The read-only check of a live database against these files
const liveCheck = readFileSync(new URL('../supabase/checks/live-vs-repo.sql', import.meta.url).pathname, 'utf8');
const status = async (d) => Object.fromEntries((await d.query(liveCheck)).rows.map((r) => [r.item, [r.status, r.detail]]));
const full = await status(db);
const numbered = Object.keys(full).filter((k) => /^\d{4}$/.test(k));
check('live check: every migration reads as done on a database that has had them all (data-only ones cannot be told)',
  numbered.length === 24 && numbered.every((k) => full[k][0] === 'done' || (['0003', '0016'].includes(k) && full[k][0].startsWith('cannot tell'))), JSON.stringify(full));
const behind = await freshDb();
await behind.exec(`alter table properties drop column lha_area; drop table postcode_brma;
  create table eod_reports (id uuid primary key, report_date date, data jsonb);`);
const live = await status(behind);
check('live check: a missing column reads as not run', live['0008']?.[0] === 'NOT RUN' && live['0008'][1] === 'properties.lha_area', JSON.stringify(live['0008']));
check('live check: half of a migration reads as part run, naming what is missing', live['0018']?.[0] === 'PART RUN' && live['0018'][1] === 'postcode_brma', JSON.stringify(live['0018']));
check('live check: a table no migration made is listed with its columns, and RLS off is said', live['not from the repo: eod_reports']?.[0] === 'base table, RLS OFF'
  && live['not from the repo: eod_reports'][1] === 'id, report_date, data', JSON.stringify(live['not from the repo: eod_reports']));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

// The A9 dry run on the repo's sample data (supabase/seed.sql): what "Fill in from their notes" would write, client by
// client, and how each sample client fares against each available sample property under the matching rules. Writes
// nothing. The same list for the live database is on Settings, Team settings, Fill in from their notes.
// Run with: npx tsx scripts/backfill-dry-run.ts
import { readFileSync } from 'node:fs';
import { backfillPlan, FILL_LABEL } from '../src/lib/autoFill';
import { ruledMatch } from '../src/lib/matchRules';
import type { RuleProperty } from '../src/lib/matchRules';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });
const today = new Date().toISOString().slice(0, 10);
const sql = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');

/** The rows of `insert into <table> (cols) values (...), (...)`: quoted text, numbers and null; anything else is null. */
function rowsOf(table: string): Array<Record<string, string | number | null>> {
  const m = new RegExp(`insert into ${table}\\s*\\(([^)]*)\\)\\s*values([\\s\\S]*?)(?:on conflict|;)`, 'i').exec(sql);
  if (!m) return [];
  const cols = m[1].split(',').map((c) => c.trim());
  const body = m[2];
  const rows: Array<Record<string, string | number | null>> = [];
  let depth = 0, quote = false, cur = '', fields: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === "'" && body[i + 1] === "'") { cur += "'"; i++; continue; }
      if (ch === "'") quote = false;
      cur += ch;
      continue;
    }
    if (ch === "'") { quote = true; cur += ch; continue; }
    if (ch === '(') { depth++; if (depth === 1) { cur = ''; fields = []; continue; } }
    if (ch === ')') {
      depth--;
      if (depth === 0) {
        fields.push(cur.trim());
        rows.push(Object.fromEntries(cols.map((c, j) => {
          const v = fields[j] ?? '';
          if (/^'[\s\S]*'$/.test(v)) return [c, v.slice(1, -1)];
          if (/^-?\d+(\.\d+)?$/.test(v)) return [c, Number(v)];
          return [c, null];
        })));
        continue;
      }
    }
    if (ch === ',' && depth === 1) { fields.push(cur.trim()); cur = ''; continue; }
    if (depth >= 1) cur += ch;
  }
  return rows;
}

const people: Applicant[] = rowsOf('applicants').map((r, i) => ({
  id: `seed-${i + 1}`, full_name: String(r.full_name), phone: r.phone as string | null, email: null, date_of_birth: null,
  adults: r.adults as number | null, children: r.children as number | null, benefit_type: r.benefit_type as string | null,
  referring_borough: r.referring_borough as string | null, source: r.source as string | null, referred_by: null,
  stage: String(r.stage) as Applicant['stage'], budget_pcm: r.budget_pcm as number | null, lha_band: r.lha_band as string | null,
  requirements: r.requirements as string | null, notes: r.notes as string | null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null, officer_name: null,
  officer_email: null, officer_phone: null, housing_situation: null, consent: null, tier: null,
  created_at: `${today}T09:00:00Z`, updated_at: `${today}T09:00:00Z`,
  // the columns the matching brief adds, empty as they are before anything is filled in
  age_band: null, bedrooms_needed: null, postcode_area: null, benefit_cap: null,
}));
const properties: RuleProperty[] = rowsOf('properties').map((r, i) => ({
  id: `seed-p${i + 1}`, address_line: String(r.address_line), postcode: r.postcode as string | null, area: null, borough: r.borough as string | null,
  property_type: r.property_type as string | null, bedrooms: null, rent_pcm: r.rent_pcm as number | null, rent_text: null, furnished: null,
  notes: r.notes as string | null, lha_area: null, ...(r.status ? { status: r.status } : {}),
} as RuleProperty));

console.log(`# A9 dry run on supabase/seed.sql (${people.length} clients, nothing written)\n`);
const plan = backfillPlan(people);
console.log('| Client | Field | Now | Would become | From their words |');
console.log('|---|---|---|---|---|');
for (const r of plan) for (const f of r.fills) {
  console.log(`| ${r.name} | ${FILL_LABEL[f.field]} | ${f.from === null || f.from === '' ? '(empty)' : f.from} | ${f.words} | "${f.source}" |`);
}
const skipped = people.filter((a) => a.stage === 'lost').map((a) => a.full_name);
console.log(`\n${plan.length} of ${people.length} clients would change; ${skipped.length ? `left out as lost: ${skipped.join(', ')}` : 'none lost'}.`);

console.log('\n# Each sample client against each available sample property\n');
const available = properties.filter((p) => (p as RuleProperty & { status?: string }).status !== 'let');
for (const a of people.filter((x) => ['lead', 'referred', 'viewing', 'offer'].includes(x.stage))) {
  for (const p of available) {
    const r = ruledMatch(p, a, { today });
    const said = r.match ? `shown (${r.match.strength}): ${r.match.line}${r.match.warnings.length ? `; ${r.match.warnings.map((w) => `${w.tone}: ${w.words}`).join('; ')}` : ''}`
      : r.hidden ? `hidden (${r.hidden}): ${r.why}` : 'not a match on size, area or rent';
    console.log(`- ${a.full_name} × ${p.address_line}: ${said}`);
  }
}

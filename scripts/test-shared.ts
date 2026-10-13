// Checks for clients who want nothing shared (no rooms, en-suites or HMOs). Run with: npx tsx scripts/test-shared.ts
import { scoreMatch, selfContainedFrom, withSelfContained, SELF_CONTAINED_ONLY } from '../src/lib/propertyMatch';
import type { PropertyLike } from '../src/lib/propertyMatch';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

setActiveSettings(DEFAULT_SETTINGS);
let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Sam Single', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: 1200, lha_band: null, requirements: null, notes: 'Looking for a studio in Brent', on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: 'single', urgency: null, council: 'Brent',
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});
const prop = (property_type: string, p: Partial<PropertyLike> = {}): PropertyLike => ({
  address_line: '12 Elm Road', postcode: 'NW2 6NR', borough: 'Brent', property_type, bedrooms: /(\d)-Bed/.exec(property_type) ? Number(/(\d)-Bed/.exec(property_type)![1]) : 0,
  rent_pcm: 1000, rent_text: null, area: null, furnished: null, notes: null, lha_area: null, ...p,
});

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const anyone = make({});
const noShared = make({ requirements: SELF_CONTAINED_ONLY });
const offered = (a: Applicant, type: string, p: Partial<PropertyLike> = {}) => scoreMatch(prop(type, p), a) !== null;

check('without the switch, a single client is offered an en-suite room', offered(anyone, 'En-suite Room'));
for (const t of ['Room', 'En-suite Room', 'En-suite Studio', 'HMO Room', 'En-suite HMO Room']) {
  check(`switched on: never offered a ${t}`, !offered(noShared, t));
}
check('switched on: a studio is still offered', offered(noShared, 'Studio'));
check('switched on: a self-contained studio is still offered', offered(noShared, 'Self-Contained Studio'));
check('switched on: a 1 bed flat is still offered', offered(noShared, '1-Bed Flat'));
check('switched on: a studio whose notes say shared kitchen is not offered', !offered(noShared, 'Studio', { notes: 'Shared kitchen on the first floor' }));
check('a 2 bed flat with an en-suite bathroom is not shared', offered(make({ requirements: SELF_CONTAINED_ONLY, household_type: 'couple', adults: 2, notes: '2 bed in Brent' }), '2-Bed Flat', { notes: 'Master bedroom en-suite' }));

// Their own words count too
check('"self-contained" in their notes', selfContainedFrom(make({ notes: 'I need a self-contained flat' })) === 'notes');
check('"I don’t want a shared house"', selfContainedFrom(make({ notes: 'I dont want a shared house please' })) === 'notes');
check('"no en-suites"', selfContainedFrom(make({ notes: 'Studio please, no en-suites' })) === 'notes');
check('"own kitchen and bathroom"', selfContainedFrom(make({ notes: 'Must have my own kitchen' })) === 'notes');
check('nothing said, nothing assumed', selfContainedFrom(make({ notes: 'Studio or 1 bed in Brent' })) === null);
check('the switch shows in must-haves', selfContainedFrom(noShared) === 'must-haves');

// The switch writes and clears its words in must-haves, leaving the rest
check('switching on adds it first', withSelfContained('Ground floor, near school', true) === 'Self-contained only, Ground floor, near school');
check('switching off takes it out', withSelfContained('Self-contained only, Ground floor', false) === 'Ground floor');
check('switching off leaves nothing when it was all there was', withSelfContained('Self-contained only', false) === null);
check('switching on twice does not repeat it', withSelfContained(withSelfContained('Ground floor', true), true) === 'Self-contained only, Ground floor');
check('their own wording in must-haves is cleared too', withSelfContained('no house share; ground floor', false) === 'ground floor');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

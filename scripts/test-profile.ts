// Checks for a client's profile: who they are, the rate they are paid, where they can be placed, what to ask.
// Run with: npx tsx scripts/test-profile.ts
import { exemptionsFrom, profileOf } from '../src/lib/clientProfile';
import { readAgeText, readHouseholdText, readNotes } from '../src/lib/readNotes';
import { LHA_RATES } from '../src/data/lha-rates';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { CouncilScheme } from '../src/lib/councils';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
const today = '2026-10-17';
let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Test Client', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-10-01', updated_at: '2026-10-01', ...p,
});

// The client in the screenshot: one adult asking for a 1 bedroom or studio, household left "not known"
const kelso = make({ full_name: 'Kelso Page', notes: 'Hi i am interested in a 1 bedroom or studio flat please\nArea: london' });
const kp = profileOf(kelso, { today });
check('one adult asking for a 1 bed or studio reads as single', kp.household.value === 'single' && kp.household.how === 'read', JSON.stringify(kp.household));
check('the notes reader suggests Single for the form', readNotes(kelso).suggestions.some((s) => s.field === 'Household' && s.value === 'Single'));
check('sure enough to fill in with one tap', kp.sureAnswers.some((s) => s.field === 'Household' && s.patch.household_type === 'single'));
check('single, age not known: the rate is not settled, and their date of birth is asked for',
  kp.size.value === null && kp.toAsk.some((q) => q.what === 'Their date of birth'), JSON.stringify(kp.toAsk.map((q) => q.what)));
check('UC not recorded: asked', kp.toAsk.some((q) => q.what === 'Whether they are on Universal Credit'));
check('the summary says it in one go', /^Single \(from their message\), age not known\. Wants a studio or 1 bed/.test(kp.summary), kp.summary);
check('an answer already on the form is never in the one-tap fill-in', !profileOf({ ...kelso, household_type: 'couple' }, { today }).sureAnswers.some((s) => s.field === 'Household'));

// Household reading: what rules single out
check('"we" rules out single', readHouseholdText('We are looking for a 1 bed flat') === null);
check('a 1 or 2 bed request is not read as single', readHouseholdText('I need a 1 or 2 bedroom flat') === null);
check('a partner makes a couple', readHouseholdText('Me and my partner want a 1 bed')?.type === 'couple');
check('a child still makes a family', readHouseholdText('a studio or 1 bed for me and my 2 year old')?.type === 'family');

// Age: date of birth, or an age they gave
check('age from the date of birth', profileOf(make({ date_of_birth: '1990-10-18' }), { today }).age.value === 35 && profileOf(make({ date_of_birth: '1990-10-17' }), { today }).age.value === 36);
check('age from their message', readAgeText("I'm 28 and on UC")?.age === 28 && readAgeText('I am a 40 year old man')?.age === 40 && readAgeText('aged 33')?.age === 33);
check('not an age: minutes, a child\'s age', readAgeText("I'm 15 minutes from the station") === null && readAgeText('my 13-year-old daughter') === null);
check('"over 35" is a band without an age', readAgeText("I'm over 35")?.band === '35_plus' && readAgeText("I'm over 35")?.age === null);

// The rate they are paid
const single40 = profileOf(make({ household_type: 'single', date_of_birth: '1986-01-01', on_uc: true }), { today });
check('single, 35 or over: 1 bed rate', single40.rateType.value === 'uc_35_plus' && single40.size.value === 1);
const single28 = profileOf(make({ household_type: 'single', notes: "I'm 28", on_uc: true }), { today });
check('single, under 35: shared rate', single28.rateType.value === 'under_35_standard' && single28.size.value === 'shared');
const pip28 = profileOf(make({ household_type: 'single', notes: "I'm 28", on_uc: true, pip: true }), { today });
check('under 35 with PIP: exempt, 1 bed rate', pip28.rateType.value === 'sar_exempt' && pip28.size.value === 1);
const pipAny = profileOf(make({ household_type: 'single', on_uc: true, pip: true }), { today });
check('PIP, age not known: still the 1 bed rate, and their age is not asked for', pipAny.size.value === 1 && !pipAny.toAsk.some((q) => q.what === 'Their date of birth'), JSON.stringify(pipAny.toAsk.map((q) => q.what)));
check('PIP: exempt from the benefit cap, and it is not asked', pipAny.benefits.cap === 'exempt' && !pipAny.toAsk.some((q) => /benefit cap/.test(q.what)));
check('PIP is not a lead to check: it is certain', !exemptionsFrom(make({ pip: true })).some((e) => /PIP/.test(e)));
const fled = profileOf(make({ household_type: 'single', notes: "I'm 26, fleeing domestic abuse", on_uc: true }), { today });
check('domestic abuse is pointed out to check, not assumed', fled.exemptions.some((e) => /Domestic abuse/.test(e)) && fled.rateType.value === 'under_35_standard');
check('care leaver and hostel stays are read', exemptionsFrom(make({ notes: 'care leaver, been in a hostel for 6 months' })).length === 2);
const couple = profileOf(make({ household_type: 'couple', adults: 2 }), { today });
check('a couple: 1 bed rate', couple.rateType.value === 'couples' && couple.size.value === 1);
const family = profileOf(make({ household_type: 'family', children: 2 }), { today });
check('a family with 2 children: 2 bed rate', family.rateType.value === 'families' && family.size.value === 2, String(family.size.value));
check('a family needs no age', !family.toAsk.some((q) => q.what === 'Their date of birth'));

// Where to place them: available matches, counted by the LHA they are paid there
const props = [
  { id: 'p1', address_line: '1 Low Road, Hayes UB3 1AA', postcode: 'UB3 1AA', area: null, borough: 'Hillingdon', property_type: 'Studio', bedrooms: 0,
    rent_pcm: LHA_RATES['Outer West London'][1] - 50, rent_text: null, furnished: null, notes: null, status: 'void' },
  { id: 'p2', address_line: '2 High Road, Hayes UB3 2AA', postcode: 'UB3 2AA', area: null, borough: 'Hillingdon', property_type: 'Studio', bedrooms: 0,
    rent_pcm: LHA_RATES['Outer West London'][1] + 100, rent_text: null, furnished: null, notes: null, status: 'void' },
  { id: 'p3', address_line: '3 Let Road, Hayes UB3 3AA', postcode: 'UB3 3AA', area: null, borough: 'Hillingdon', property_type: 'Studio', bedrooms: 0,
    rent_pcm: 500, rent_text: null, furnished: null, notes: null, status: 'let' },
];
const over35 = make({ household_type: 'single', date_of_birth: '1980-01-01', on_uc: true, pip: true, notes: 'Studio in Hayes please', council: 'Hillingdon' });
const placed = profileOf(over35, { properties: props, today });
const owl = placed.places.find((x) => x.brma === 'Outer West London');
check('one studio within their LHA fits; the dearer one and the let one do not', owl?.fits === 1 && owl.best?.address.startsWith('1 Low Road') === true, JSON.stringify(placed.places));
check('Hillingdon is a focus borough: starred', owl?.focus === true);
const under35 = profileOf({ ...over35, date_of_birth: '2000-01-01', pip: false }, { properties: props, today });
check('an under-35 on the shared rate: no studio fits', (under35.places.find((x) => x.brma === 'Outer West London')?.fits ?? 0) === 0, JSON.stringify(under35.places));
const noStock = profileOf(make({ household_type: 'single', date_of_birth: '1980-01-01', notes: 'Anywhere in Croydon', council: 'Croydon' }), { properties: [], today });
check('nothing in stock: still says what they are paid in their areas', noStock.places.some((x) => x.brma === 'Outer South London' && x.rate === LHA_RATES['Outer South London'][1] && x.fits === 0), JSON.stringify(noStock.places));

const slough = { id: 'p9', address_line: '21 Bath Road, Slough SL1 3UA', postcode: 'SL1 3UA', area: null, borough: null, property_type: 'Studio', bedrooms: 0,
  rent_pcm: 700, rent_text: null, furnished: null, notes: null, status: 'void' };
const kelsoOld = { ...kelso, household_type: 'single', date_of_birth: '1980-01-01', on_uc: true, pip: true };
const kpl = profileOf(kelsoOld, { properties: [slough, ...props], today });
check('"Area: london" is read as London', kp.wants.areas.join() === 'London' && kp.toAsk.some((q) => q.what === 'Which parts of London'));
check('a client who wants London is not placed in Slough', !kpl.places.some((x) => x.brma === 'East Thames Valley') && kpl.places.some((x) => x.brma === 'Outer West London'), JSON.stringify(kpl.places.map((x) => x.brma)));
check('one who asks for Slough can be', profileOf({ ...kelsoOld, notes: 'A studio in Slough please' }, { properties: [slough], today }).places.some((x) => x.brma === 'East Thames Valley' && x.fits === 1));

// Council and incentive
const scheme: CouncilScheme = { id: 's', council: 'Hillingdon', scheme_name: 'Home finder', route_mailbox: null, registered: true, registered_on: '2026-09-01',
  incentive_terms: null, max_incentive: 4000, documents_required: null, focus_borough: true, last_contact: null, notes: null, created_at: '', updated_at: '' };
const withScheme = profileOf(over35, { schemes: [scheme], today });
check('their council\'s scheme and what it pays', withScheme.council.incentive === 'Registered with Home finder, up to £4,000' && withScheme.council.incentiveMax === 4000, String(withScheme.council.incentive));
check('an officer referral says an incentive often comes with it', profileOf(make({ officer_email: 'x@harrow.example', council: 'Harrow' }), { today }).council.route === 'housing officer');
check('no council: asked for', profileOf(make({}), { today }).toAsk.some((q) => q.what === 'Their council'));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

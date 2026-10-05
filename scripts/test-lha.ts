// Checks for the LHA calculations. Run with: npx tsx scripts/test-lha.ts
import { existsSync, readFileSync } from 'node:fs';
import { brmaGroups, lhaAreaFor, lhaCheck, lhaSizeOf, lhaWords, lookupPostcode, parseDistrict, parseLhaCsv, rateFor, searchPlaces } from '../src/lib/lha';
import { LHA_RATES } from '../src/data/lha-rates';
import { matchesForProperty } from '../src/lib/propertyMatch';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const P = (p: Partial<Parameters<typeof lhaCheck>[0]>) => ({
  address_line: '1 Test Road', postcode: null, borough: null, property_type: null, bedrooms: null, rent_pcm: null, rent_text: null, ...p,
});

// Sizes
check('studio counts as 1 bed', lhaSizeOf({ property_type: 'Studio', bedrooms: 0 }) === 1);
check('self-contained studio counts as 1 bed', lhaSizeOf({ property_type: 'Self-Contained Studio', bedrooms: 0 }) === 1);
check('en-suite room counts as 1 bed', lhaSizeOf({ property_type: 'En-suite Room', bedrooms: 0 }) === 1);
check('en-suite HMO room counts as 1 bed', lhaSizeOf({ property_type: 'En-suite HMO Room', bedrooms: 0 }) === 1);
check('a plain room is a shared room', lhaSizeOf({ property_type: 'Room', bedrooms: 0 }) === 'shared');
check('2-bed flat is 2 bed', lhaSizeOf({ property_type: '2-Bed Flat', bedrooms: 2 }) === 2);
check('5 bed is capped at 4 bed', lhaSizeOf({ property_type: '5-Bed House', bedrooms: 5 }) === 4);

// Rates from the file
check('Outer North London 1 bed is £1,150', rateFor('Outer North London', 1) === 1150);
check('Outer North London shared is £595', rateFor('Outer North London', 'shared') === 595);
check('Inner North London 2 bed is £1,793.98', rateFor('Inner North London', 2) === 1793.98);

// Areas
check('N12 is estimated as Outer North London', lhaAreaFor(P({ postcode: 'N12 0DA' }))?.brma === 'Outer North London');
check('a property with no postcode falls back to its borough', lhaAreaFor(P({ borough: 'Croydon' }))?.brma === 'Outer South London');
check('an area set by hand wins', lhaAreaFor(P({ postcode: 'N12 0DA', lha_area: 'Inner North London' }))?.brma === 'Inner North London');
check('RG1 is Reading', lhaAreaFor(P({ postcode: 'RG1 7LH' }))?.brma === 'Reading');

// Postcode lookup
check('"nw11" is NW11', parseDistrict('nw11') === 'NW11');
check('a full postcode with no space gives its district', parseDistrict('ha87ab') === 'HA8' && parseDistrict('NW11 9LJ') === 'NW11');
check('N1 1AA is N1, not N11', parseDistrict('N1 1AA') === 'N1');
check('SW1A 1AA is SW1', parseDistrict('SW1A 1AA') === 'SW1');
check('a name is not a postcode', parseDistrict('Anna') === null && parseDistrict('Barnet') === null);
const nw11 = lookupPostcode('nw11');
check('NW11 is Golders Green, Barnet, Inner North London', !!nw11?.places?.includes('Golders Green') && nw11?.borough === 'Barnet' && nw11?.area?.brma === 'Inner North London',
  JSON.stringify(nw11));
check('Watford WD17 is South West Herts', lookupPostcode('WD17 1AA')?.area?.brma === 'South West Herts');
check('"golders" finds NW11', searchPlaces('golders').some((l) => l.district === 'NW11'));
check('a home-county property gets its area', lhaAreaFor(P({ postcode: 'SS1 1AA' }))?.brma === 'Southend');
const groups = brmaGroups(false).map(([g]) => g).join(',');
check('area lists show London and the home counties only', groups === 'London,Home counties' && !brmaGroups(false).some(([, n]) => n.includes('Leeds')), groups);
check('the rest of England is there when asked for', brmaGroups(true).some(([, n]) => n.includes('Leeds')));
check('a saved area outside the region still shows', brmaGroups(false, 'Leeds').some(([, n]) => n.includes('Leeds')));
check('14 London and 28 home-county areas, all in the rates file', brmaGroups(false).map(([, n]) => n.length).join('+') === '14+28');

// Comparisons
const studio = lhaCheck(P({ postcode: 'N12 0DA', property_type: 'Studio', bedrooms: 0, rent_pcm: 1186 }));
check('£1,186 studio in N12 is £36 over LHA', studio?.status === 'over' && lhaWords(studio) === '£36 over LHA', studio ? lhaWords(studio) : 'none');
const flat = lhaCheck(P({ postcode: 'N12 0DA', property_type: '2-Bed Flat', bedrooms: 2, rent_pcm: 1300 }));
check('£1,300 2-bed in N12 is £100 under LHA', flat?.status === 'under' && lhaWords(flat) === '£100 under LHA', flat ? lhaWords(flat) : 'none');
const room = lhaCheck(P({ postcode: 'N17 9AA', property_type: 'Room', bedrooms: 0, rent_pcm: 650 }));
check('£650 room in N17 is £55 over the shared rate', room?.size === 'shared' && lhaWords(room!) === '£55 over LHA', room ? lhaWords(room) : 'none');
const lhaText = lhaCheck(P({ postcode: 'N17 9AA', property_type: 'En-suite Room', bedrooms: 0, rent_text: '1-Bed LHA' }));
check('"1-Bed LHA" rent reads as £1,150 and is at LHA', lhaText?.rent === 1150 && lhaText.status === 'at');
check('no area, no check', lhaCheck(P({ property_type: 'Studio', rent_pcm: 900 })) === null);

// New year's file loads (the published CSV, if it is on this machine)
const CSV = process.env.LHA_CSV ?? 'C:/Users/R250/Downloads/england-rates-2026-to-2027.csv';
if (existsSync(CSV)) {
  const t = parseLhaCsv(readFileSync(CSV, 'latin1'));
  check('the CSV loads all 152 areas', Object.keys(t.rates).length === 152, String(Object.keys(t.rates).length));
  check('year read from the header', t.year === '2026 to 2027', t.year);
  check('loaded rates match the built-in ones', JSON.stringify(t.rates['Outer East London']) === JSON.stringify(LHA_RATES['Outer East London']));
} else {
  console.log('SKIP  CSV loading (set LHA_CSV to the rates file to check it)');
}

// Matching uses the client's own LHA (the UC-only rent limit is switched off here: it is checked in test-rules)
setActiveSettings({ ...DEFAULT_SETTINGS, ucOnlyRentCap: 0 });
let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});
const single = make({ full_name: 'Single on UC', on_uc: true, household_type: 'single', council: 'Barnet', notes: 'North Finchley please' });
const prop = { address_line: '45 Ballards Lane', postcode: 'N12 0DA', area: 'North Finchley', borough: 'Barnet', property_type: 'Studio', bedrooms: 0,
  rent_pcm: 1100, rent_text: '£1,100 pcm', furnished: null, notes: null };
const m = matchesForProperty(prop, [single])[0];
check('a £1,100 studio is £50 under a single\'s LHA in N12', !!m?.reasons.some((r) => /£50 under their LHA/.test(r)), m?.reasons.join('; '));
const pricey = matchesForProperty({ ...prop, rent_pcm: 1400, rent_text: '£1,400 pcm' }, [single])[0];
check('a £1,400 studio is £250 over their LHA', !!pricey?.cautions.some((c) => /£250 over their LHA/.test(c)), pricey ? pricey.cautions.join('; ') : 'not matched');
const family = make({ full_name: 'Family', on_uc: true, household_type: 'family', children: 2, council: 'Barnet', notes: 'North Finchley' });
const fam = matchesForProperty({ ...prop, property_type: '2-Bed Flat', bedrooms: 2, rent_pcm: 1450, rent_text: '£1,450 pcm' }, [family])[0];
check('family of 2 children judged on the 2 bed rate (£1,400)', !!fam?.cautions.some((c) => /£50 over their LHA \(2 bed/.test(c)), fam ? [...fam.reasons, ...fam.cautions].join('; ') : 'not matched');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

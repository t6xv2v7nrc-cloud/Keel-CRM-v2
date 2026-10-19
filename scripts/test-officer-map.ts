// Checks for housing officers on the map: grouped by council, placed by its districts or its name, with how each
// stands. Run with: npx tsx scripts/test-officer-map.ts
import { councilPlaceName, officerPlaces } from '../src/lib/officerMap';
import { middleOf } from '../src/lib/geo';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { OfficerRecord } from '../src/lib/councils';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
const today = '2026-10-19';

check('"Watford Borough Council" is Watford', councilPlaceName('Watford Borough Council') === 'Watford');
check('"London Borough of Harrow" is Harrow', councilPlaceName('London Borough of Harrow') === 'Harrow');
check('"Royal Borough of Windsor and Maidenhead"', councilPlaceName('Royal Borough of Windsor and Maidenhead') === 'Windsor and Maidenhead');
check('"Three Rivers District Council"', councilPlaceName('Three Rivers District Council') === 'Three Rivers');
check('the middle of two points', JSON.stringify(middleOf([[51, -0.2], [51.2, 0]])) === JSON.stringify([51.1, -0.1]) && middleOf([]) === null);

let n = 0;
const officer = (p: Partial<OfficerRecord>): OfficerRecord => ({ id: `o${++n}`, name: 'Jo Brennan', council: 'Harrow', email: `jo${n}@harrow.example`, status: 'active',
  route_type: 'housing_officer', opt_in_source: 'Asked for listings', ...p });
const client = (p: Partial<Applicant>) => ({ id: `a${++n}`, full_name: 'Sam Example', stage: 'referred', created_at: '2026-10-01', council: null, referring_borough: null,
  officer_name: null, officer_email: null, officer_phone: null, ...p }) as Applicant;

const jo = officer({ email: 'jo@harrow.example' });
const left = officer({ name: 'Ade Gone', status: 'left' });
const watford = officer({ name: 'Wes Town', council: 'Watford Borough Council', email: 'wes@watford.example' });
const nowhere = officer({ name: 'No Council', council: null, borough: null, email: 'nc@example.org' });
const clients = [
  client({ officer_name: 'Jo Brennan', officer_email: 'jo@harrow.example', council: 'Harrow' }),
  client({ officer_name: 'Jo Brennan', officer_email: 'jo@harrow.example', council: 'Harrow', stage: 'placed' }),
  client({ officer_name: 'Kim New', officer_email: 'kim@brent.gov.uk', council: 'Brent' }),
];
const { places, unplaced } = officerPlaces([jo, left, watford, nowhere], clients, today);
const harrow = places.find((p) => p.council === 'Harrow');
check('officers grouped by council', !!harrow && harrow.officers.length === 2, JSON.stringify(places.map((p) => [p.council, p.officers.length])));
check('Harrow is placed by its postcode districts', !!harrow && harrow.districts.includes('HA1') && harrow.london);
check('who can be emailed, by the mailing list rule', !!harrow && harrow.sendable === 1 && harrow.officers[0].name === 'Jo Brennan' && harrow.officers[0].words === 'Can be emailed'
  && harrow.officers[1].words === 'Left', JSON.stringify(harrow?.officers.map((o) => o.words)));
check('their clients are counted', !!harrow && harrow.officers[0].clients === 2 && harrow.officers[0].active === 1, JSON.stringify(harrow?.officers[0]));
const wat = places.find((p) => p.council === 'Watford');
check('a council Keel has no districts for is placed by its name', !!wat && wat.districts.length === 0 && wat.query === 'Watford' && !wat.london, JSON.stringify(wat));
const brent = places.find((p) => p.council === 'Brent');
check('an officer only named on a client shows, as not on the list', !!brent && brent.officers[0].words === 'Not on the officer list' && !brent.officers[0].listed && brent.officers[0].clients === 1,
  JSON.stringify(brent));
check('an officer with no council is listed as not on the map', unplaced.length === 1 && unplaced[0].name === 'No Council');
check('focus boroughs come first', places[0].council === 'Harrow', places.map((p) => p.council).join());

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll officer map checks pass');

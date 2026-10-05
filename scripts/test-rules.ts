// Checks for the house rules in propertyMatch: regions however they are written,
// self-contained asks, and the over-£1,300 rule for PIP / full-time clients.
// Run with: npx tsx scripts/test-rules.ts
import { parsePropertyList } from '../src/lib/parseProperties';
import { clientNeeds, matchesForApplicant, matchesForProperty } from '../src/lib/propertyMatch';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import { regionsIn } from '../src/lib/london';
import { clientAreas } from '../src/lib/geo';
import type { Applicant } from '../src/lib/types';

let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

// Regions
const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
check('"South East or South West of London"', eq(regionsIn('a unit in the South East or South West of London if possible'), ['south east london', 'south west london']));
check('"south-east London"', eq(regionsIn('south-east London please'), ['south east london']));
check('"SE London"', eq(regionsIn('anywhere SE London'), ['south east london']));
check('"North London"', eq(regionsIn('Anywhere in North London.'), ['north london']));
check('"central London"', eq(regionsIn('near central London'), ['central london']));
check('"moved from the north to London" is not a region', regionsIn('I moved from the north to London').length === 0);

const robinson = make({
  full_name: 'S Robinson', on_uc: true, pip: true, council_registered: true, work_status: 'not_working', referring_borough: 'Greenwich Borough', tier: 2,
  notes: `Hello

I am hoping to find a self-contained unit in the South East or South West of London if possible but I don't mind if it is further North to some degree.

I am currently with Greenwich Homeless Project in the Borough of Greenwich and will need to find somewhere quite quickly as I have come to the end of the time that they can support me as an overnight resident.`,
});
const ukOnly = make({ full_name: 'Uma (UC only, no budget)', on_uc: true, household_type: 'single', council: 'Croydon' });
const worker = make({ full_name: 'Will (full-time, wants Harrow only)', work_status: 'full_time', household_type: 'single', budget_pcm: 1000, notes: 'Harrow only.' });
const pipFamily = make({ full_name: 'Pam (PIP, family of 5)', pip: true, household_type: 'family', adults: 2, children: 3 });

const list = parsePropertyList(`Studio, Lewisham SE13 5AB, £1,100 pcm
Room in Woolwich SE18 7AA, £700 pcm bills inc
2 bed flat, 12 Park Lane, Croydon CR0 2AB, £1,450 pcm
1 bed flat, 4 High Street, Edmonton N9 0AA, £1,350 pcm
Studio, 8 Mill Road, Tottenham N17 9AA, £1,050 pcm`, new Date('2026-09-23')).properties;
check('parsed 5 properties', list.length === 5, String(list.length));
const [lewisham, woolwichRoom, croydon2bed, edmonton1bed, tottenham] = list;

const rob = matchesForApplicant(robinson, list);
const robFor = (p: typeof list[number]) => rob.find((x) => x.property === p)?.match;
check('Robinson: Lewisham studio (South East London)', robFor(lewisham)?.reasons.some((r) => /South East London/.test(r)) ?? false, robFor(lewisham)?.reasons.join('; '));
check('Robinson: no room (asked for self-contained)', !robFor(woolwichRoom));
check('Robinson: Croydon 2 bed over £1,300 offered (PIP)', robFor(croydon2bed)?.reasons.some((r) => /open to PIP/.test(r)) ?? false, robFor(croydon2bed)?.reasons.join('; '));
check('Robinson: Edmonton 1 bed over £1,300 offered (PIP) despite area', Boolean(robFor(edmonton1bed)), robFor(edmonton1bed)?.cautions.join('; '));
check('Robinson: Tottenham studio shown as open to other areas', robFor(tottenham)?.cautions.some((c) => /open to other areas/.test(c)) ?? false, robFor(tottenham)?.cautions.join('; '));

const forCroydon = matchesForProperty(croydon2bed, [robinson, ukOnly, worker, pipFamily]);
const names = forCroydon.map((m) => m.applicant.full_name);
check('£1,450 Croydon: full-time worker offered despite budget and "Harrow only"', names.some((n) => n.startsWith('Will')), names.join(', '));
check('£1,450 Croydon: UC-only client is not offered it (over the £1,100 limit for UC alone)', !forCroydon.some((m) => m.applicant.full_name.startsWith('Uma')));
check('£1,350 Edmonton 1 bed: PIP family of 5 not offered (too small)', !matchesForProperty(edmonton1bed, [pipFamily]).length);
check('£1,450 Croydon 2 bed: PIP family of 5 offered (2-3 bed fits)', names.some((n) => n.startsWith('Pam')));

// A whole availability email: greeting, intro, headings, sign-off, signature
const email = parsePropertyList(`Good Afternoon,

Please find our latest available properties below. All units accept DSS/UC tenants, with no deposit or RIA required. Rents are set at or just above LHA rates. Please feel free to reach out if you have any clients who may be suitable and we will be happy to assist.

PROPERTIES AVAILABLE

Barnet
Brentmead Place, London NW11 9LJ - Self-Contained Studio - £1,436 pcm - Bills: Exc. Council Tax & Electricity
East Barnet Road, New Barnet EN4 8RW - En-suite Studio - £1,146.86 pcm - Bills: Exc. Council Tax & Electricity

Reading
12 Oxford Road, Reading RG1 7LH - En-suite Room - £750 pcm
Studio, 5 Church Street, Caversham RG4 8AU - £900 pcm

Kind regards,
Ridwan Harir
Keel Lettings Ltd`, new Date('2026-09-23'));
check('email: 4 properties', email.properties.length === 4, email.properties.map((p) => p.address_line).join(' | '));
check('email: only the facts are shared notes', email.sharedNotes.length === 1 && /^All units accept/.test(email.sharedNotes[0]), JSON.stringify(email.sharedNotes));
check('email: "London" is not an area', email.properties[0].area === null && email.properties[0].borough === 'Barnet', `${email.properties[0].area} / ${email.properties[0].borough}`);
check('email: Reading heading and RG postcodes give Reading', email.properties.slice(2).every((p) => p.borough === 'Reading'), email.properties.slice(2).map((p) => p.borough).join(', '));
check('email: signature not in notes', !email.properties.some((p) => /Ridwan|Keel Lettings|Kind regards/.test(p.notes)));

for (const m of rob) console.log(`   ${m.match.strength.padEnd(8)} ${m.property.address_line}: ${m.match.reasons.join('; ')}${m.match.cautions.length ? `  [! ${m.match.cautions.join('; ')}]` : ''}`);
// On UC alone: nothing over the limit (£1,100 as standard)
const place = (rent: number, type = 'Studio', beds = 0) => ({
  address_line: '8 Mill Road, Tottenham N17 9AA', postcode: 'N17 9AA', area: 'Tottenham', borough: 'Haringey', property_type: type, bedrooms: beds,
  rent_pcm: rent, rent_text: `£${rent} pcm`, furnished: null, notes: null,
});
const ucOnly = make({ full_name: 'Una Only', on_uc: true, household_type: 'single', council: 'Haringey', notes: 'Studio in Tottenham' });
check('UC alone: a £1,150 studio is not a match', matchesForProperty(place(1150), [ucOnly]).length === 0);
check('UC alone: £1,100 exactly is fine', matchesForProperty(place(1100), [ucOnly]).length === 1);
check('UC alone: a higher budget does not lift the limit', matchesForProperty(place(1250), [{ ...ucOnly, id: 'u2', budget_pcm: 1400 }]).length === 0);
check('UC alone: "1-Bed LHA" rent over the limit is not a match',
  matchesForProperty({ ...place(0), rent_pcm: null, rent_text: '1-Bed LHA' }, [ucOnly]).length === 0);
check('UC with PIP is not limited', matchesForProperty(place(1150), [{ ...ucOnly, id: 'u3', pip: true }]).length === 1);
check('UC with LCWRA is not limited', matchesForProperty(place(1150), [{ ...ucOnly, id: 'u4', lcwra: true }]).length === 1);
check('UC and working is not limited', matchesForProperty(place(1150), [{ ...ucOnly, id: 'u5', work_status: 'full_time' }]).length === 1);
check('a UC-only family is limited too', matchesForProperty(place(1450, '2-Bed Flat', 2),
  [make({ full_name: 'Fay Family', on_uc: true, household_type: 'family', children: 2, council: 'Haringey', notes: '2 bed Tottenham' })]).length === 0);
check('the limit is a setting: 0 turns it off', (() => {
  setActiveSettings({ ...DEFAULT_SETTINGS, ucOnlyRentCap: 0 });
  const n = matchesForProperty(place(1150), [ucOnly]).length;
  setActiveSettings(DEFAULT_SETTINGS);
  return n === 1;
})());
check('clientNeeds reports the limit', clientNeeds(ucOnly).rentCap === 1100 && clientNeeds({ ...ucOnly, pip: true }).rentCap === null);

// "Central": said however they say it, and only the central districts count
check('"somewhere central" is central London', eq(regionsIn('Somewhere central please'), ['central london']));
check('"central heating" and "Finchley Central" are not', regionsIn('needs central heating, near Finchley Central').length === 0);
const maya = make({ full_name: 'Maya', work_status: 'full_time', household_type: 'single', budget_pcm: 1700, notes: 'Somewhere central please, studio or 1 bed' });
const flat = (address_line: string, postcode: string, borough: string) => ({
  address_line, postcode, area: null, borough, property_type: '1-Bed Flat', bedrooms: 1, rent_pcm: 1600, rent_text: '£1,600 pcm', furnished: null, notes: null,
});
const kennington = matchesForProperty(flat('3 Kennington Road, London SE1 7BL', 'SE1 7BL', 'Lambeth'), [maya])[0];
const streatham = matchesForProperty(flat('1 High Road, London SW16 1AA', 'SW16 1AA', 'Lambeth'), [maya])[0];
check('SE1 fits "central"', !!kennington?.reasons.some((r) => /Wants Central London/.test(r)) && !/just outside/.test(kennington.reasons.join()), kennington?.reasons.join('; '));
check('Streatham (Lambeth, SW16) is only just outside', !!streatham?.reasons.some((r) => /SW16 is just outside/.test(r)) && (streatham?.score ?? 0) < (kennington?.score ?? 0),
  streatham ? streatham.reasons.join('; ') : 'not matched');
check('"studio or 1 bed" takes a studio', /Studio suits their ask \(studio or 1 bed\)/.test(
  matchesForProperty({ ...flat('Flat 2, 10 Marchmont Street, London WC1N 1AB', 'WC1N 1AB', 'Camden'), property_type: 'Studio', bedrooms: 0 }, [maya])[0]?.reasons.join() ?? ''));
check('"1 bed flat or a studio" takes a studio too', /Studio suits their ask/.test(
  matchesForProperty({ ...flat('Flat 2, 10 Marchmont Street, London WC1N 1AB', 'WC1N 1AB', 'Camden'), property_type: 'Studio', bedrooms: 0 },
    [{ ...maya, id: 'm2', notes: 'central, a 1 bed flat or a studio' }])[0]?.reasons.join() ?? ''));
const areas = clientAreas(maya);
check('the map shades central districts for "central"', areas.exact.includes('WC1') && areas.exact.includes('SE1') && !areas.exact.includes('SW16') && areas.broad.length === 0,
  JSON.stringify(areas));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

import { parsePropertyList } from '../src/lib/parseProperties';
import { matchesForProperty } from '../src/lib/propertyMatch';
import type { Applicant } from '../src/lib/types';

const today = new Date('2026-09-23T10:00:00');

const samples: Record<string, string> = {
  'WhatsApp-style list': `Available this week, DSS welcome

1. Flat 2, 14 Bruce Grove, Tottenham, N17 6RA - Studio - £950 pcm bills inc
2. 45 Ballards Lane, North Finchley, N12 0DA - 1 bed flat - £1,300 pcm - available now
3. Room 3, 22 Park Avenue, Hayes UB3 4AB, en-suite room £220pw
4. ~~12 High Road, Wood Green N22 6BH - 2 bed - £1,600~~
5. 88 Station Road, Harrow HA1 2RS - 3 bed house - £2,000 pcm (LET)
6. Units 1 & 2, 10 Kings Road, Edmonton N18 2AB`,

  'Shared notes + bare addresses': `They are all rooms with ensuite bathroom and mini kitchenette
Rent is full LHA rate for 1 bed

Flat A, 5 Church Road, NW10 9NP
Flat B, 5 Church Road, NW10 9NP
7 Victoria Street, Enfield EN1 3HD`,

  'Blocks': `12 Oak Close, Whetstone N20 9AA
2 bed flat, part furnished
£1,650 pcm
Available from 1st October

Flat 7, Lime Court, Wembley HA9 7PQ
Studio, bills included, £1,100`,

  'Masked listings (no street)': `1 bed flat - Edmonton N9 - £1,350 pcm
Studio in Tottenham, £950 bills inc
They are all studios in N17 with bills included`,

  'Spreadsheet paste': `Address\tPostcode\tBeds\tType\tRent\tBills
3 Elm Grove, Crouch End\tN8 9AA\t\tStudio\t1050\tIncluded
19 Cedar Road\tSE6 4TT\t2\tFlat\t1-Bed LHA\tExcluded`,
};

let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});
const clients = [
  make({ full_name: 'Amira (UC single, wants North/East Finchley studio, £1,100)', on_uc: true, household_type: 'single', council: 'Barnet', budget_pcm: 1100,
    notes: 'Looking for a studio in North Finchley or East Finchley.' }),
  make({ full_name: 'Ben (couple, full time, North Finchley 1 bed, £1,500)', work_status: 'full_time', household_type: 'couple', council: 'Barnet', council_registered: true,
    budget_pcm: 1500, notes: 'Wants North Finchley, 1 bed.' }),
  make({ full_name: 'Chloe (T1 urgent, single, anywhere North London, ground floor, £950)', on_uc: true, pip: true, lcwra: true, council_registered: true,
    household_type: 'single', council: 'Haringey', urgency: 'homeless_tonight', budget_pcm: 950, notes: 'Anywhere in North London. Needs ground floor.' }),
  make({ full_name: 'Daniel (family 2+2, Tottenham/Wood Green, £1,650)', benefit_type: 'UC', adults: 2, children: 2, referring_borough: 'Haringey',
    budget_pcm: 1650, notes: 'Family of 4, wants Tottenham or Wood Green.' }),
  make({ full_name: 'Eve (single, Harrow only, £1,000)', on_uc: true, household_type: 'single', council: 'Harrow', budget_pcm: 1000, notes: 'Harrow only.' }),
  make({ full_name: 'Farah (family 3 kids, 2-3 bed Enfield/Edmonton, £1,800)', on_uc: true, pip: true, household_type: 'family', children: 3, council: 'Enfield',
    council_registered: true, budget_pcm: 1800, notes: 'Me and my 3 daughters. 2 to 3 bed, Enfield or Edmonton, part furnished.' }),
  make({ full_name: 'George (single, no notes)', work_status: 'part_time', household_type: 'single', council: 'Ealing' }),
  make({ full_name: 'Hana (single, no area given, UC, £1,000)', on_uc: true, household_type: 'single', budget_pcm: 1000, notes: 'I need somewhere as soon as possible.' }),
  make({ full_name: 'Idris (couple, Barnet council, no ask)', on_uc: true, household_type: 'couple', council: 'Barnet', budget_pcm: 1400 }),
  make({ full_name: 'Jade (single, asked N15 only)', on_uc: true, household_type: 'single', budget_pcm: 1000, notes: 'Looking around N15.' }),
  make({ full_name: 'Placed Paul (already placed)', stage: 'placed', household_type: 'single', notes: 'North Finchley' }),
];

for (const [name, text] of Object.entries(samples)) {
  const r = parsePropertyList(text, today);
  console.log(`\n══ ${name} ══  ${r.properties.length} properties`);
  if (r.sharedNotes.length) console.log('   shared notes:', JSON.stringify(r.sharedNotes));
  if (r.skipped.length) console.log('   skipped:', JSON.stringify(r.skipped));
  for (const p of r.properties) {
    console.log(`\n • ${p.address_line}`);
    console.log(`   area=${p.area} | borough=${p.borough} | pc=${p.postcode} | type=${p.property_type} | beds=${p.bedrooms} | rent=${p.rent_text} (${p.rent_pcm ?? '-'} pcm) | bills=${p.bills} | furnished=${p.furnished} | avail=${p.available_from}${p.warnings.length ? ` | ⚠ ${p.warnings.join(', ')}` : ''}`);
    const ms = matchesForProperty(p, clients);
    if (ms.length === 0) console.log('   → no matches');
    for (const m of ms) console.log(`   → ${m.strength.toUpperCase()} ${m.score} ${m.applicant.full_name.split(' (')[0]}: ${m.reasons.join('; ')}${m.cautions.length ? `  [! ${m.cautions.join('; ')}]` : ''}`);
  }
}

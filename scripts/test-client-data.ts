// Checks for the client data rules of the matching brief (Part A): the family LHA size, reading who is moving in,
// bedroom ranges, filling empty answers from notes, the worked-out LHA rate, Needs info, Missing age, the backfill.
// Run with: npx tsx scripts/test-client-data.ts
import { householdCheck, needsInfo, rateOf, tierNeeds } from '../src/lib/clientProfile';
import { readAgeText, readHouseholdText, readNotes } from '../src/lib/readNotes';
import { clientNeeds, readBeds } from '../src/lib/propertyMatch';
import { autoFill, backfillPlan, backfillText } from '../src/lib/autoFill';
import { readWishes } from '../src/lib/readWishes';
import { parseEnquiryEmail } from '../src/lib/parseEnquiry';
import { applyFilters, DEFAULT_FILTERS, filtersFromParams, filtersToParams, missingAge } from '../src/lib/search';
import { ageUnanswered, prepared } from '../src/features/bin/defaults';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
const today = '2026-10-28';
let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Test Client', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-10-01', updated_at: '2026-10-01', age_band: null, bedrooms_needed: null, ...p,
});
const size = (p: Partial<Applicant>) => rateOf(make(p), today).size.value;

// ── A1: a family's LHA size is the bedrooms they asked for ──
check('A1: family, children 0, notes "3 bedroom" is paid the 3 bed rate', size({ household_type: 'family', children: 0, notes: 'Looking for a 3 bedroom house' }) === 3, String(size({ household_type: 'family', children: 0, notes: 'Looking for a 3 bedroom house' })));
check('A1: asked for more than 4 is capped at 4', size({ household_type: 'family', children: 5, notes: 'Need a 5 bed' }) === 4);
check('A1: a range takes its smallest: "2/3 bed" is 2', size({ household_type: 'family', children: 3, notes: 'need a 2/3 bed' }) === 2);
check('A1: recorded bedrooms needed wins over their words', size({ household_type: 'family', children: 1, notes: 'a 2 bed', bedrooms_needed: 3 }) === 3);
check('A1: nothing asked: worked out from the children (3 children, 3 bed)', size({ household_type: 'family', children: 3 }) === 3);
check('A1: nothing asked, 1 child: 2 bed', size({ household_type: 'family', children: 1 }) === 2);
const sizeWhy = rateOf(make({ household_type: 'family', children: 0, notes: 'Looking for a 3 bedroom house' }), today).size;
check('A1: says where the size came from', sizeWhy.how === 'read' && /asked for 3 bedrooms/.test(sizeWhy.why ?? ''), JSON.stringify(sizeWhy));

// ── A2: who is moving in, read even when recorded ──
const hh = (t: string) => readHouseholdText(t);
check('A2: "3 kids" is a family with 3 children', hh('I have 3 kids')?.type === 'family' && hh('I have 3 kids')?.children === 3);
check('A2: "my son and daughter" is 2 children', hh('me, my son and daughter')?.children === 2, JSON.stringify(hh('me, my son and daughter')));
check('A2: "I have twins" is 2 children', hh('I have twins')?.type === 'family' && hh('I have twins')?.children === 2, JSON.stringify(hh('I have twins')));
check('A2: "a 5 year old" is a family', hh('Single mum with a 5 year old')?.type === 'family');
check('A2: "I have a son" is a family of 1 child', hh('I have a son, he is 4')?.children === 1, JSON.stringify(hh('I have a son, he is 4')));
check('A2: "my wife and I" is a couple', hh('Looking for a flat for me and my wife')?.type === 'couple');
check('A2: a grown-up son with younger children is an extra adult', (() => { const r = hh('Me, my 2 kids and my 19 year old son'); return r?.type === 'family' && r.adults === 2 && r.children === 2; })(), JSON.stringify(hh('Me, my 2 kids and my 19 year old son')));
check('A2: "2 adults and 3 children"', (() => { const r = hh('2 adults and 3 children'); return r?.type === 'family' && r.adults === 2 && r.children === 3; })(), JSON.stringify(hh('2 adults and 3 children')));
check('A2: "I don’t have any children" is not a family', hh('I don’t have any children, it is just me')?.type === 'single');
check('A2: recorded single, notes "3 kids": amber check', householdCheck(make({ household_type: 'single', notes: 'Me and my 3 kids need a home' })) === 'Check household: notes say a family with 3 children',
  String(householdCheck(make({ household_type: 'single', notes: 'Me and my 3 kids need a home' }))));
check('A2: recorded family of 1 child, notes "3 kids": amber check on the count', /notes say 3 children, 1 recorded/.test(householdCheck(make({ household_type: 'family', children: 1, notes: 'I have 3 kids' })) ?? ''));
check('A2: recorded and read agree: no check', householdCheck(make({ household_type: 'family', children: 3, notes: 'I have 3 kids' })) === null);
check('A2: nothing recorded: no check (the reading is used)', householdCheck(make({ notes: 'I have 3 kids' })) === null);
const famNeeds = clientNeeds(make({ household_type: 'family', children: 0, notes: 'single mum with 3 kids' }));
check('A2: a family with no children recorded counts the children in their words', famNeeds.children === 3, String(famNeeds.children));
check('A2: nothing recorded, "my 2 children": matching treats them as a family', clientNeeds(make({ adults: null, children: null, notes: 'Me and my 2 children' })).household === 'family');

// ── A3: several sizes, ranges, preferred ──
const b = (t: string) => readBeds(t);
check('A3: "2/3 bed" is 2 to 3', b('need a 2/3 bed')?.min === 2 && b('need a 2/3 bed')?.max === 3);
check('A3: "1 bed, 2 bed" is 1 to 2', b('1 bed, 2 bed is fine')?.min === 1 && b('1 bed, 2 bed is fine')?.max === 2);
check('A3: "2 or 3 bedroom" is 2 to 3', b('2 or 3 bedroom house')?.min === 2 && b('2 or 3 bedroom house')?.max === 3);
check('A3: "preferably a 2 bed" in a 1 to 2 range', b('1 bed or 2 bed, preferably a 2 bed')?.preferred === 2, JSON.stringify(b('1 bed or 2 bed, preferably a 2 bed')));
check('A3: "studio or 1 bed" is 0 to 1', b('studio or 1 bed please')?.min === 0 && b('studio or 1 bed please')?.max === 1);
check('A3: where they live now is not an ask', b('currently in a 1 bed with 3 kids, need a 3 bed')?.min === 3, JSON.stringify(b('currently in a 1 bed with 3 kids, need a 3 bed')));
check('A3: "no studios" is not a studio ask', b('no studios, 1 bed only')?.min === 1, JSON.stringify(b('no studios, 1 bed only')));
check('A3: "studio, 1 bed or 2 bed" is 0 to 2', b('studio, 1 bed or 2 bed')?.min === 0 && b('studio, 1 bed or 2 bed')?.max === 2, JSON.stringify(b('studio, 1 bed or 2 bed')));

// ── A4: fill empty answers from their words, never typed ones ──
const f1 = autoFill(make({ adults: 1, children: 0, notes: "I'm 28 and looking for a 1 bed for me and my partner" }));
check('A4: couple, adults 2, age band under 35 and 1 bedroom filled', f1.patch.household_type === 'couple' && f1.patch.adults === 2 && f1.patch.age_band === 'under_35' && f1.patch.bedrooms_needed === 1, JSON.stringify(f1.patch));
const f2 = autoFill(make({ household_type: 'single', adults: 1, notes: 'Me and my 3 kids, need a 3 bed', bedrooms_needed: 2, age_band: '35_plus' }));
check('A4: typed household, bedrooms and age band are never changed', !('household_type' in f2.patch) && !('bedrooms_needed' in f2.patch) && !('age_band' in f2.patch) && !('children' in f2.patch), JSON.stringify(f2.patch));
const f3 = autoFill(make({ household_type: 'family', children: 0, notes: 'aged 50, single dad of 2 kids, 2 or 3 bed' }));
check('A4: a family with 0 children gets the count; "aged 50" is 35 plus; "2 or 3 bed" needs 2', f3.patch.children === 2 && f3.patch.age_band === '35_plus' && f3.patch.bedrooms_needed === 2, JSON.stringify(f3.patch));
check('A4: "over 35" alone gives the band', autoFill(make({ notes: 'client is over 35, on UC' })).patch.age_band === '35_plus');
check('A4: a date of birth means no age band is filled', !('age_band' in autoFill(make({ date_of_birth: '1980-01-01', notes: "I'm 28" })).patch));
check('A4: a weak reading is not filled', !('household_type' in autoFill(make({ notes: 'Studio or HMO room near Harrow' })).patch));
check('A4: columns not there yet are left out', !('bedrooms_needed' in autoFill(make({ notes: 'need a 2 bed' }), { bedrooms: false }).patch));
check('A4: "under 35 minutes" is not an age', readAgeText('must be under 35 minutes from work') === null);
check('A4: an officer saying "client is 40"', readAgeText('Client is 40 and on UC')?.band === '35_plus');

// ── A5: the LHA band is worked out, not typed ──
check('A5: the old LHA band text is never suggested from notes', !readNotes(make({ notes: 'On 1 bed LHA, needs a flat' })).suggestions.some((s) => s.field === 'LHA band'));
check('A5: the worked-out rate: single under 35 is the shared rate', size({ household_type: 'single', age_band: 'under_35' }) === 'shared');
check('A5: couple is the 1 bed rate whatever the old band said', size({ household_type: 'couple', lha_band: '3-Bed' }) === 1);

// ── A7: the last tier with gaps is "Needs info" ──
const gappy = make({ notes: 'need somewhere' });
check('A7: missing UC, household, age and council are listed', JSON.stringify(needsInfo(gappy, today)) === JSON.stringify(['UC', 'household', 'age', 'council']), JSON.stringify(needsInfo(gappy, today)));
check('A7: shown for the last tier', JSON.stringify(tierNeeds(gappy, today)) === JSON.stringify(['UC', 'household', 'age', 'council']));
check('A7: not for a tier set by hand', tierNeeds({ ...gappy, tier: 3, tier_locked: true }, today).length === 0);
const tier2 = make({ household_type: 'single', on_uc: true, council_registered: true, council: 'Harrow' });
check('A7: not for a higher tier', tierNeeds(tier2, today).length === 0);
const known = make({ household_type: 'couple', on_uc: false, council: 'Harrow' });
check('A7: last tier with nothing missing keeps its tier name', tierNeeds(known, today).length === 0);

// ── A8: Missing age filter, and age asked on the Bin card ──
const noAge = make({ household_type: 'single' });
const withBand = make({ household_type: 'single', age_band: 'under_35' });
const fam = make({ household_type: 'family', children: 2 });
check('A8: a single with no date of birth or age band is missing their age', missingAge(noAge) && !missingAge(withBand) && !missingAge(fam));
const list = applyFilters([noAge, withBand, fam], { ...DEFAULT_FILTERS, age: 'missing' });
check('A8: the Missing age filter shows only them', list.length === 1 && list[0] === noAge);
check('A8: the filter survives the address bar', filtersFromParams(filtersToParams({ ...DEFAULT_FILTERS, age: 'missing' })).age === 'missing');
const ex = { doc_type: 'applicant_referral' as const, transcription: '', summary: '', confidence: 0.9, applicant: { full_name: 'Jo Bloggs', notes: 'Looking for a room' } };
check('A8: a new single client with no age cannot be confirmed yet', ageUnanswered(ex, { applicantTarget: 'create' }));
check('A8: "not given yet" answers it', !ageUnanswered(ex, { applicantTarget: 'create', ageNotGiven: true }));
check('A8: an age in their message answers it', !ageUnanswered(prepared({ ...ex, applicant: { ...ex.applicant, notes: "I'm 31, looking for a room" } }), { applicantTarget: 'create' }));
check('A8: a family is not asked', !ageUnanswered({ ...ex, applicant: { ...ex.applicant, notes: 'Me and my 2 kids' } }, { applicantTarget: 'create' }));
check('A8: updating an existing client is not held up', !ageUnanswered(ex, { applicantTarget: 'some-id' }));

// ── A9: the backfill, dry run first ──
const people = [
  make({ full_name: 'Amy Family', household_type: null, notes: 'Me and my 2 kids, need a 2/3 bed' }),
  make({ full_name: 'Ben Lost', stage: 'lost', notes: "I'm 30, 1 bed" }),
  make({ full_name: 'Cat Done', household_type: 'single', age_band: 'under_35', bedrooms_needed: 1, notes: "I'm 30, 1 bed" }),
];
const plan = backfillPlan(people);
check('A9: only clients with something to fill, lost ones left out', plan.length === 1 && plan[0].name === 'Amy Family', JSON.stringify(plan.map((r) => r.name)));
check('A9: each change says field, old, new and the words', /Amy Family \| Household \| \(empty\) → Family with children \| “/.test(backfillText(plan)) && /Bedrooms needed \| \(empty\) → 2 bedrooms \| “2\/3 bed”/.test(backfillText(plan)), backfillText(plan));

// ── C2: what the home must be, from their words ──
const w = readWishes('Need to move by 15 November. Can top up £100. Near my mum in HA1 3UJ as I care for her, within 30 minutes. Female only please, a garden would be nice.', today);
check('C2: move by date', w.move_by === '2026-11-15', String(w.move_by));
check('C2: top-up', w.max_top_up === 100, String(w.max_top_up));
check('C2: who they must live near, and its postcode', /^Mum in HA1 3UJ/.test(w.anchor ?? '') && w.anchor_postcode === 'HA1 3UJ', JSON.stringify(w));
check('C2: longest journey', w.max_travel_mins === 30);
check('C2: women only and a garden', w.female_only === true && w.wants_outdoor === true);
check('C2: "no garden needed" is not a wish', !readWishes('no garden needed', today).wants_outdoor);
check('C2: "can\'t top up" is a top-up of 0', readWishes("I can't top up the rent", today).max_top_up === 0);
check('C2: a move-by date already passed this year is next year', readWishes('must move out by 3rd January', today).move_by === '2027-01-03');
const enq = parseEnquiryEmail('First Name: Ana\nLast Name: Lee\nEmail: ana@example.com\nMessage: I am 40, need a 2 bed near the hospital where I have dialysis, must move by 1/12, can top up £50');
check('C2: a website enquiry carries the age band, bedrooms and wishes', enq?.applicant?.age_band === '35_plus' && enq.applicant.bedrooms_needed === 2 && enq.applicant.move_by === '2026-12-01' && enq.applicant.max_top_up === 50 && /hospital/i.test(enq.applicant.anchor ?? ''), JSON.stringify(enq?.applicant));
check('C2: a website enquiry no longer forces 1 adult and 0 children when it does not say', enq?.applicant?.adults === undefined && enq?.applicant?.children === undefined, JSON.stringify(enq?.applicant));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

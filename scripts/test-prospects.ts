// Checks for the building a place is in (a client who turned one flat down is not offered the others there), floors
// and lifts, and each match's fit, chance of placing and expected money. Run with: npx tsx scripts/test-prospects.ts
import { buildingOf, sameBuilding, turnedDown } from '../src/lib/buildings';
import { hiddenForApplicant, hiddenWords, matchesForProperty, ruledMatch, sinkOf } from '../src/lib/matchRules';
import type { RuleDeal, RuleProperty } from '../src/lib/matchRules';
import { byExpected, chanceWords, fitOf, prospectContext, prospectFor, ranked, whyWords } from '../src/lib/prospects';
import { isStaleReferral, referralAgeDays } from '../src/lib/search';
import { rateFor } from '../src/lib/lha';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant, Deal } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });
const today = '2026-10-22';
const now = new Date(2026, 9, 22, 12);
let id = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Test Client', phone: null, email: null, date_of_birth: '1980-01-01', adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: 'I want a 1 bed in Harrow', on_uc: true, pip: false, lcwra: true,
  council_registered: true, work_status: 'not_working', household_type: 'single', urgency: null, council: 'Harrow',
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: true,
  tier: null, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01', postcode_area: 'HA1', age_band: '35_plus', benefit_cap: 'not_capped', ...p,
});
const nwl1 = rateFor('North West London', 1)!;
let pid = 0;
const property = (p: Partial<RuleProperty>): RuleProperty => ({
  id: `p${++pid}`, address_line: `Flat ${pid}, 12 Station Road, Harrow HA1 2AA`, postcode: 'HA1 2AA', area: null, borough: 'Harrow', property_type: '1 bed', bedrooms: 1,
  rent_pcm: Math.floor(nwl1 - 60), rent_text: null, furnished: null, notes: null, lha_area: null, accommodation_type: 'self_contained', suitable_for: [], ...p,
});
let did = 0;
const deal = (p: Partial<Deal>): Deal => ({
  id: `d${++did}`, applicant_id: 'x', property_id: null, address: '', status: 'sent', viewing_at: null, move_in_on: null, fell_through_reason: null, notes: null,
  created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-10T10:00:00Z', ...p,
});

// ── The building ──
const b = (s: string, pc?: string) => buildingOf(s, pc);
check('flats at one address are one building', sameBuilding(b('Flat 2, 12 Station Road, Harrow HA1 2AA'), b('Flat 3, 12 Station Road, Harrow HA1 2AA')));
check('"Flat 2 12 Station Rd" and "Ground floor flat, 12 Station Road" too', sameBuilding(b('Flat 2 12 Station Rd'), b('Ground floor flat, 12 Station Road, HA1 2AA'))
  && sameBuilding(b('12A Station Road'), b('12B Station Road, Harrow')), JSON.stringify(b('Flat 2 12 Station Rd')));
check('the house next door is not', !sameBuilding(b('Flat 1, 12 Station Road'), b('Flat 1, 14 Station Road')));
check('the same number on another street is not', !sameBuilding(b('12 Station Road, HA1 2AA'), b('12 Station Avenue, HA1 2AB')));
check('the same street name in another postcode is not', !sameBuilding(b('Flat 1, 12 Church Road, HA1 2AA'), b('Flat 1, 12 Church Road, NW10 4AB')));
check('a named block: "Flat 4, Kings Court, Station Road"', sameBuilding(b('Flat 4, Kings Court, Station Road'), b('Flat 9, Kings Court, Station Road, HA1 2AA')));

// what counts as turning it down
check('turned down: said no at the viewing, or it fell through over the place, the landlord or the money',
  turnedDown({ status: 'viewed', fell_through_reason: null, viewing_outcome: 'declined' })
  && turnedDown({ status: 'fell_through', fell_through_reason: 'Client said no' })
  && turnedDown({ status: 'fell_through', fell_through_reason: 'Too far from where they need to be' })
  && turnedDown({ status: 'fell_through', fell_through_reason: 'Landlord would not take UC or benefits' })
  && turnedDown({ status: 'fell_through', fell_through_reason: null }));
check('not turned down: let to someone else, the landlord pulled out, they went quiet or moved in elsewhere',
  !turnedDown({ status: 'fell_through', fell_through_reason: 'Let to someone else' }) && !turnedDown({ status: 'fell_through', fell_through_reason: 'Landlord pulled out' })
  && !turnedDown({ status: 'fell_through', fell_through_reason: 'Client stopped replying' }) && !turnedDown({ status: 'fell_through', fell_through_reason: 'Moved in somewhere else with Keel' })
  && !turnedDown({ status: 'viewing', fell_through_reason: null }));

// ── The rule: no other flat in a building they turned down ──
const sam = client({ full_name: 'Sam Turner' });
const flat1 = property({});
const flat2 = property({});
const elsewhere = property({ address_line: 'Flat 1, 40 Other Road, Harrow HA1 2AB', postcode: 'HA1 2AB' });
check('before anything is turned down, Flat 2 is offered', !!ruledMatch(flat2, sam, { today }).match);
const said: RuleDeal[] = [deal({ applicant_id: sam.id, property_id: flat1.id, address: flat1.address_line, status: 'fell_through', fell_through_reason: 'Client said no' })];
const r = ruledMatch(flat2, sam, { today, deals: said });
check('Sam said no to Flat 1: Flat 2 at the same address is not offered', r.hidden === 'turned_down' && /Turned down Flat 1, 12 Station Road \(Client said no\)/.test(r.why ?? ''), JSON.stringify(r));
check('nor Flat 1 again', ruledMatch(flat1, sam, { today, deals: said }).hidden === 'turned_down');
check('another building still is', !!ruledMatch(elsewhere, sam, { today, deals: said }).match);
check('another client still gets Flat 2', !!ruledMatch(flat2, client({}), { today, deals: said }).match);
check('counted under the list, in words', hiddenWords(hiddenForApplicant(sam, [flat1, flat2, elsewhere], { today, deals: said })) === '2 in a building they turned down');
const letElsewhere: RuleDeal[] = [deal({ applicant_id: sam.id, property_id: flat1.id, address: flat1.address_line, status: 'fell_through', fell_through_reason: 'Let to someone else' })];
check('Flat 1 let to someone else: Flat 2 is still offered', !!ruledMatch(flat2, sam, { today, deals: letElsewhere }).match);
const goingFor: RuleDeal[] = [...said, deal({ applicant_id: sam.id, property_id: flat2.id, address: flat2.address_line, status: 'viewing' })];
check('already going for Flat 2 (a viewing booked): it stays', !!ruledMatch(flat2, sam, { today, deals: goingFor }).match);

// ── Floors and lifts ──
const needsLevel = client({ notes: 'I want a 1 bed in Harrow, ground floor please, I use a wheelchair' });
check('needs step-free: floor 2 with no lift is never offered', ruledMatch(property({ floor: 2, lift: false }), needsLevel, { today }).hidden === 'stairs');
const g = ruledMatch(property({ floor: 0 }), needsLevel, { today }).match;
check('the ground floor is, and says so', !!g && g.reasons.includes('Ground floor, as they need'), JSON.stringify(g?.reasons));
const lifted = ruledMatch(property({ floor: 4, lift: true }), needsLevel, { today }).match;
check('floor 4 with a lift is', !!lifted && lifted.reasons.some((x) => /lift/.test(x)));
const unknownLift = ruledMatch(property({ floor: 2, lift: null }), needsLevel, { today }).match;
check('floor 2, lift not known: offered with a check', !!unknownLift && unknownLift.cautions.some((c) => /check for a lift/.test(c)), JSON.stringify(unknownLift?.cautions));
const family = client({ household_type: 'family', adults: 1, children: 2, notes: 'Family of 3 wanting a 2 bed in Harrow' });
const two = (p: Partial<RuleProperty>) => property({ property_type: '2 bed', bedrooms: 2, rent_pcm: Math.floor(rateFor('North West London', 2)! - 60), ...p });
const ground = ruledMatch(two({ floor: 0 }), family, { today }).match!;
const top = ruledMatch(two({ floor: 4, lift: false }), family, { today }).match!;
check('a family: the ground floor scores above floor 4 with no lift', ground.score > top.score && top.cautions.some((c) => /hard with children/.test(c)), `${ground.score} vs ${top.score}`);

// ── Fit, chance and money ──
check('fit: a 0 to 100 score that levels off, warnings taking it down', fitOf({ score: 30, warnings: [] }) === 45 && fitOf({ score: 90, warnings: [] }) === 83
  && fitOf({ score: 90, warnings: [{ tone: 'red', words: 'x' }] }) === 71 && fitOf({ score: 500, warnings: [] }) === 99);
const ctx0 = prospectContext({ deals: [], now });
check('no history yet: starts from 20%', Math.abs(ctx0.base - 0.2) < 1e-9 && ctx0.closed === 0);
const history = [
  ...Array.from({ length: 6 }, (_, i) => deal({ applicant_id: `h${i}`, status: 'moved_in', property_id: 'pp1' })),
  ...Array.from({ length: 14 }, (_, i) => deal({ applicant_id: `g${i}`, status: 'fell_through', fell_through_reason: 'Client said no', property_id: i < 2 ? 'pp1' : 'pp2' })),
];
const ctx = prospectContext({ deals: history, now, properties: [{ id: 'pp1', provider_id: 'good' }, { id: 'pp2', provider_id: 'poor' }],
  receivables: [{ kind: 'incentive', amount: 3000, status: 'due' }, { kind: 'incentive', amount: 5000, status: 'paid' }, { kind: 'incentive', amount: 4000, status: 'paid' }] });
check('Keel\'s own rate: 6 placed of 20 ended, smoothed', Math.abs(ctx.base - (6 + 2) / 30) < 1e-9 && ctx.closed === 20, String(ctx.base));
check('a typical incentive from Finances: the middle one', ctx.typicalIncentive === 4000);

const officerClient = client({ full_name: 'Priya Strong', officer_name: 'Jo Brennan', officer_email: 'jo@harrow.gov.uk', created_at: '2026-10-20T10:00:00Z' });
const best = ruledMatch(property({ provider_id: 'good' }), officerClient, { today }).match!;
const pBest = prospectFor(best, property({ provider_id: 'good' }), { ...ctx, lastContact: () => '2026-10-21T10:00:00Z' });
check('a strong, new officer referral, under LHA, in touch, with a provider that places: easy money', pBest.label === 'Easy money' && pBest.chance >= 0.55, `${chanceWords(pBest)} ${JSON.stringify(pBest.factors.map((f) => f.words))}`);
check('its money: a likely incentive at the typical amount, times the chance', pBest.value === 4000 && pBest.expected === Math.round((4000 * pBest.chance) / 50) * 50, `${pBest.value} ${pBest.expected}`);
check('the reasons up are kept in words', pBest.factors.some((f) => f.up && f.words === 'Strong fit') && pBest.factors.some((f) => f.up && f.words === 'Referred by a housing officer'));

const shaky = client({ full_name: 'Lee Quiet', notes: 'something in Harrow', household_type: null, age_band: null, date_of_birth: null, pip: null, lcwra: null, created_at: '2026-08-01T10:00:00Z' });
const shakyDeals = [deal({ applicant_id: shaky.id, status: 'fell_through', fell_through_reason: 'Client said no', address: '3 Far Lane, Harrow HA2 0AA' }),
  deal({ applicant_id: shaky.id, status: 'fell_through', viewing_outcome: 'no_show', fell_through_reason: 'Client did not turn up', address: '9 Near Road, Harrow HA2 0AB' })];
const sm = ruledMatch(property({ provider_id: 'poor' }), shaky, { today, showOverLha: true })?.match;
const pShaky = sm ? prospectFor(sm, property({ provider_id: 'poor' }), prospectContext({ deals: [...history, ...shakyDeals], now, properties: [{ id: 'pp1', provider_id: 'good' }, { id: 'pp2', provider_id: 'poor' }] })) : null;
check('never contacted, details missing, a no and a missed viewing, a provider that rarely places: hard work', !!pShaky && pShaky.label === 'Hard work' && pShaky.chance < 0.2,
  pShaky ? `${chanceWords(pShaky)} ${JSON.stringify(pShaky.factors.map((f) => f.words))}` : 'no match');
check('the reasons down are kept too', !!pShaky && pShaky.factors.some((f) => !f.up && /Turned down 1 place before/.test(f.words)) && pShaky.factors.some((f) => !f.up && /Missed 1 viewing/.test(f.words))
  && pShaky.factors.some((f) => !f.up && f.words === 'Never contacted'));

const viewing = [deal({ applicant_id: officerClient.id, property_id: 'pv', address: 'Flat 7, 12 Station Road, Harrow HA1 2AA', status: 'viewing' })];
const pv = property({ id: 'pv', address_line: 'Flat 7, 12 Station Road, Harrow HA1 2AA' });
const mv = ruledMatch(pv, officerClient, { today, deals: viewing }).match!;
const withViewing = prospectFor(mv, pv, prospectContext({ deals: viewing, now }));
const withoutViewing = prospectFor(mv, pv, prospectContext({ deals: [], now }));
check('a viewing booked on this very place raises the chance', withViewing.chance > withoutViewing.chance && withViewing.factors.some((f) => f.words === 'Viewing booked'), `${chanceWords(withViewing)} vs ${chanceWords(withoutViewing)}`);
const offerElsewhere = prospectFor(mv, pv, prospectContext({ deals: [deal({ applicant_id: officerClient.id, address: '5 Hill Road, Harrow HA3 0AA', status: 'offered' })], now }));
check('an offer already elsewhere lowers it', offerElsewhere.chance < withoutViewing.chance && offerElsewhere.factors.some((f) => /Already has an offer at 5 Hill Road/.test(f.words)));

check('why, in words: where it starts, what moved it, what it is worth', /^Starts from Keel's own rate: 27% of properties sent end in a placement \(20 so far\)\. Up: .*strong fit/.test(whyWords(pBest, ctx))
  && /Could bring £4,000; at \d+% that is worth about £[\d,]+\.$/.test(whyWords(pBest, ctx)), whyWords(pBest, ctx));
check('best bets first: the most money likely', [pShaky!, pBest].sort(byExpected)[0] === pBest);

// ── Old referrals sit lower, unless they are a good match ──
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const oldOne = client({ full_name: 'Olive Oldreferral', notes: 'a 1 bed please', council: null, postcode_area: null, created_at: ago(75) });
const newOne = client({ full_name: 'Nina Newreferral', notes: 'a 1 bed please', council: null, postcode_area: null, created_at: ago(10) });
check('a referral 75 days old is old (60 days as standard); 10 days is not', isStaleReferral(oldOne, now) && !isStaleReferral(newOne, now) && referralAgeDays(oldOne, now) === 75);
check('an officer\'s nomination date counts first', !isStaleReferral({ created_at: ago(90), nominated_at: ago(20) }, now));
const loose = property({ borough: 'Brent', address_line: '8 Loose Lane, Wembley HA9 0AA', postcode: 'HA9 0AA' });
const mOld = ruledMatch(loose, oldOne, { today }).match!, mNew = ruledMatch(loose, newOne, { today }).match!;
check('both are loose (Possible) fits here', mOld?.strength === 'possible' && mNew?.strength === 'possible', `${mOld?.strength} ${mNew?.strength}`);
check('a Possible with an old referral sinks below a newer Possible', sinkOf(mOld, now) > sinkOf(mNew, now));
const order = ranked([mOld, mNew], (m) => m, (m) => prospectFor(m, loose, prospectContext({ deals: [], now })), now).map((x) => x.item.applicant.full_name);
check('on the property\'s list: the newer referral first', order[0] === 'Nina Newreferral', order.join(', '));
const listed = matchesForProperty(loose, [oldOne, newOne], { today }).map((m) => m.applicant.full_name);
check('the same in the Mailer\'s order', listed.indexOf('Nina Newreferral') < listed.indexOf('Olive Oldreferral'), listed.join(', '));
const oldGood = client({ full_name: 'Gita Goodmatch', created_at: ago(80) });
const mg = ruledMatch(flat2, oldGood, { today }).match!;
check('an old referral that is a good match keeps its place', (mg.strength === 'good' || mg.strength === 'strong') && sinkOf(mg, now) === 0, mg.strength);
const pOld = prospectFor(mOld, loose, prospectContext({ deals: [], now }));
check('an old referral lowers the chance, and says so', pOld.factors.some((f) => !f.up && f.words === 'Referral 75 days old'), JSON.stringify(pOld.factors.map((f) => f.words)));
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true, staleReferralDays: 0 });
check('0 days in Team settings turns it off', !isStaleReferral(oldOne, now) && sinkOf(mOld, now) === 1);
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll prospect checks pass');

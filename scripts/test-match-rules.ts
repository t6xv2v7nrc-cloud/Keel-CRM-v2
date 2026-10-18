// Checks for the matching rules: LHA at the rate a client is paid, kind of place, size, area, London officers,
// income per match and incentive-bearing first. Run with: npx tsx scripts/test-match-rules.ts
import {
  hiddenForApplicant, hiddenWords, incomeFor, matchesForApplicant, matchesForProperty, ruledMatch, rulesFor, targetsOf,
} from '../src/lib/matchRules';
import type { RuleProperty } from '../src/lib/matchRules';
import { matchingGaps } from '../src/lib/clientProfile';
import { rateFor } from '../src/lib/lha';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { CouncilScheme } from '../src/lib/councils';
import type { Applicant, Provider } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });
const today = '2026-10-18';
let id = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Test Client', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: true, pip: false, lcwra: false,
  council_registered: true, work_status: 'not_working', household_type: 'single', urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: true,
  tier: null, created_at: '2026-10-01', updated_at: '2026-10-01', postcode_area: null, age_band: null, benefit_cap: 'not_capped', ...p,
});
let pid = 0;
const property = (p: Partial<RuleProperty>): RuleProperty => ({
  id: `p${++pid}`, address_line: `Flat ${pid}, 1 Test Road`, postcode: 'HA1 2AA', area: null, borough: null, property_type: '1 bed', bedrooms: 1,
  rent_pcm: 1000, rent_text: null, furnished: null, notes: null, lha_area: null, accommodation_type: 'self_contained', suitable_for: [], ...p,
});

const nwl1 = rateFor('North West London', 1)!;
const nwlShared = rateFor('North West London', 'shared')!;
const over40 = client({ notes: 'I want a 1 bed in Harrow', date_of_birth: '1980-01-01', lcwra: true }); // LCWRA lifts the UC-only limit, so the LHA rule decides
const under = property({ rent_pcm: Math.floor(nwl1 - 20) });
const r1 = ruledMatch(under, over40, { today });
check('35 plus, within their 1 bed LHA in Harrow: offered', !!r1.match && r1.hidden === null, JSON.stringify(r1));
check('the one line says why: the area, the size and the LHA', !!r1.match && /Asked for Harrow/.test(r1.match.line) && /under their 1 bed LHA/.test(r1.match.line), r1.match?.line);
const dear = property({ rent_pcm: Math.ceil(nwl1 + 50) });
check('over their LHA: hidden', ruledMatch(dear, over40, { today }).hidden === 'over_lha');
const shown = ruledMatch(dear, over40, { today, showOverLha: true }).match;
check('with the switch on: shown, with a red warning', !!shown && shown.warnings[0]?.tone === 'red' && /over their 1 bed LHA/.test(shown.warnings[0].words), JSON.stringify(shown?.warnings));

// under 35 on the shared rate
const under35 = client({ notes: "I'm 27, looking in Harrow", date_of_birth: null });
check('under 35 standard: a 1 bed above the shared rate is over their LHA', ruledMatch(under, under35, { today }).hidden === 'over_lha');
const room = property({ property_type: 'Room with shared kitchen', bedrooms: 0, accommodation_type: 'shared_kitchen', rent_pcm: Math.floor(nwlShared - 10), suitable_for: ['under_35_standard'] });
const rr = ruledMatch(room, under35, { today });
check('a shared-kitchen room within their shared rate: offered', !!rr.match, JSON.stringify(rr));
check('the same room above the shared rate: hidden', ruledMatch({ ...room, rent_pcm: Math.ceil(nwlShared + 30) }, under35, { today }).hidden === 'over_lha');
check('recorded age band works without a date of birth', ruledMatch(under, client({ notes: 'Harrow please', age_band: 'under_35' }), { today }).hidden === 'over_lha'
  && !!ruledMatch(under, client({ notes: 'Harrow please', age_band: '35_plus' }), { today }).match);

// kind of place and who it suits
const couple = client({ household_type: 'couple', adults: 2, notes: 'Harrow' });
check('a shared kitchen never goes to a couple', rulesFor({ ...room, suitable_for: [] }, couple, { today }).hidden === 'kind');
check('marked as suiting families only: not for a single 35 plus', rulesFor(property({ suitable_for: ['families'] }), over40, { today }).hidden === 'suits');
check('marked as suiting them: fine', rulesFor(property({ suitable_for: ['uc_35_plus'], rent_pcm: 900 }), over40, { today }).hidden === null);

// area
const nw10 = property({ postcode: 'NW10 4AA', rent_pcm: 900 });
const nextDoor = ruledMatch(nw10, over40, { today });
check('next door but in another LHA area: hidden', nextDoor.hidden === 'area', JSON.stringify(nextDoor));
check('Wembley (Brent, the same LHA area as Harrow): allowed', rulesFor(property({ postcode: 'HA9 6AA', rent_pcm: 900 }), over40, { today }).hidden !== 'area');
check('a postcode area they want counts: HA', targetsOf(client({ postcode_area: 'HA' })).brmas?.has('North West London') === true);
check('"London" is every London area', targetsOf(client({ notes: 'Area: london' })).how === 'london');
check('open to anywhere: not held to an area', targetsOf(client({ notes: 'anywhere is fine' })).brmas === null);
check('nothing said, council known: their council and next door', targetsOf(client({ council: 'Harrow' })).how === 'council');

// London officers: nothing outside Greater London
const officerClient = client({ notes: 'anywhere', council: 'Harrow', officer_name: 'Jo Brennan', officer_email: 'jo@harrow.example', date_of_birth: '1980-01-01' });
const watford = property({ postcode: 'WD17 1AA', rent_pcm: Math.floor((rateFor('South West Herts', 1) ?? 900) - 10) });
check('outside London to a London officer\'s client: hidden', rulesFor(watford, officerClient, { today }).hidden === 'outside_london');
const ool = rulesFor(watford, officerClient, { today, showOutsideLondon: true });
check('with the switch on: amber', ool.hidden === null && ool.warnings.some((w) => w.tone === 'amber' && /Outside Greater London/.test(w.words)));
check('a client who came by themselves is not held to it', rulesFor(watford, client({ notes: 'anywhere', date_of_birth: '1980-01-01' }), { today }).hidden === null);

// warnings
check('age not known: amber, with the shared rate here', rulesFor(under, client({ notes: 'Harrow' }), { today }).warnings.some((w) => /Age not known/.test(w.words)));
check('benefit cap applies: amber', rulesFor(under, { ...over40, benefit_cap: 'capped' }, { today }).warnings.some((w) => /benefit cap/.test(w.words)));

// income
const providers = [{ id: 'wm', name: 'Watermint', tag: 'WM', rules: { fee_amount: 250 } }] as unknown as Provider[];
const schemes = [{ id: 's1', council: 'Harrow', scheme_name: 'Harrow PSL', max_incentive: 4000, registered: true }] as unknown as CouncilScheme[];
const harrowClient = client({ notes: 'Harrow', council: 'Harrow', date_of_birth: '1980-01-01' });
const inc = incomeFor({ ...under, provider_id: 'wm' }, harrowClient, { providers, schemes });
check('income: the provider fee and the most the council pays', inc.fee === 250 && inc.incentive === 4000 && inc.upTo && inc.total === 4250 && inc.words === 'up to £4,000 incentive + £250 fee', JSON.stringify(inc));
check('an incentive on Finances wins over the scheme', incomeFor(under, harrowClient, { schemes, receivables: [{ applicant_id: harrowClient.id, kind: 'incentive', status: 'due', amount: 2500 }] }).incentive === 2500);
check('an officer referral with no amount: likely', incomeFor(under, client({ officer_name: 'Jo' }), {}).likely);

// order
const noIncentive = client({ notes: 'I want a 1 bed in Harrow', date_of_birth: '1981-01-01', full_name: 'No Incentive', tier: 1 });
const ordered = matchesForProperty(under, [noIncentive, harrowClient], { schemes });
check('on a property, the client with an incentive comes first', ordered[0]?.applicant.id === harrowClient.id, ordered.map((m) => `${m.applicant.full_name} ${m.strength}`).join(', '));
const list = matchesForApplicant(over40, [under, dear, nw10], { today });
check('a client sees only what the rules allow', list.length === 1 && list[0].property.id === under.id);
const hidden = hiddenForApplicant(over40, [under, dear, nw10], { today });
check('and how many were hidden, and why', hidden.total === 2 && hiddenWords(hidden) === 'outside the areas they want'.replace(/^/, '1 ') + ', 1 over their LHA', hiddenWords(hidden));

// what matching still needs
const gaps = matchingGaps(client({ household_type: null, on_uc: null, pip: null, lcwra: null, benefit_cap: null }), today);
check('missing answers for matching are listed', ['Postcode area', 'Who is moving in', 'Age band', 'UC', 'Benefit cap', 'PIP or LCWRA'].every((g) => gaps.includes(g)), gaps.join(', '));
check('nothing missing for a full record', matchingGaps({ ...over40, postcode_area: 'HA1' }, today).length === 0, matchingGaps({ ...over40, postcode_area: 'HA1' }, today).join(', '));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll match rules checks pass');

// Checks for Weekly numbers: placements, viewings, losses, money, LHA, replies, the month's goal.
// Run with: npx tsx scripts/test-kpis.ts
import { goalLines, kpiPeriod, kpisFor } from '../src/lib/kpis';
import type { KpiData } from '../src/lib/kpis';
import { rateFor } from '../src/lib/lha';
import { MOVED_IN_ELSEWHERE } from '../src/lib/viewings';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Placement } from '../src/lib/placements';
import type { Applicant, Deal, Property, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
// Sunday 18 October 2026: the week is Mon 12 to Sun 18
const now = new Date(2026, 9, 18, 15);
const week = kpiPeriod('week', 0, now);
check('the week runs Monday to Sunday', week.from === '2026-10-12' && week.to === '2026-10-18', `${week.from} ${week.to}`);
check('last week', kpiPeriod('week', 1, now).from === '2026-10-05' && /^Last week/.test(kpiPeriod('week', 1, now).label));
check('the month', kpiPeriod('month', 0, now).from === '2026-10-01' && kpiPeriod('month', 1, now).from === '2026-09-01');

let n = 0;
const client = (p: Partial<Applicant>) => ({ id: `a${++n}`, full_name: 'Test', stage: 'placed', created_at: '2026-10-12T10:00:00', council: 'Harrow', officer_name: null, officer_email: null, officer_phone: null, source: null, iced_at: null, iced_until: null, nominated_at: null, officer_replied_at: null, ...p }) as Applicant;
const deal = (p: Partial<Deal>): Deal => ({ id: `d${++n}`, applicant_id: 'a1', property_id: null, address: `${n} Road`, status: 'moved_in', viewing_at: null, move_in_on: '2026-10-14', fell_through_reason: null, notes: null,
  created_at: '2026-10-01T10:00:00', updated_at: '2026-10-14T10:00:00', viewing_outcome: null, reason_lost: null, outcome_at: null, outcome_sent_to_officer_at: null, ...p });
const rec = (p: Partial<Receivable>): Receivable => ({ id: `r${++n}`, kind: 'incentive', applicant_id: 'a1', deal_id: null, property_address: null, payer: 'Harrow council', provider_id: null, amount: 4000,
  sign_up_on: '2026-10-14', due_on: '2026-10-14', claim_submitted_on: null, status: 'due', paid_on: null, notes: null, created_at: '', updated_at: '', ...p });
const placement = (p: Partial<Placement>): Placement => ({ id: `pl${++n}`, applicant_id: 'a1', property_id: null, deal_id: null, council: 'Harrow', move_in_date: '2026-10-14', rent_pcm: 1000, route: 'officer',
  provider_id: null, fee_type: 'incentive', keel_share_pct: null, invoiced_by: 'keel', split_agreed_in_writing: true, split_document_url: null, renters_rights_sheet_on: null, notes: null, created_at: '', updated_at: '', ...p });
const nwl = rateFor('North West London', 1)!;
const property = (p: Partial<Property>) => ({ id: `p${++n}`, address_line: `${n} Station Road, Harrow HA1 2AA`, postcode: 'HA1 2AA', borough: 'Harrow', property_type: '1 bed', bedrooms: 1, rent_pcm: nwl - 10, rent_text: null, status: 'void', ...p }) as Property;

const a1 = client({ officer_name: 'Jo', officer_email: 'jo@harrow.example', nominated_at: '2026-10-12T10:00:00', officer_replied_at: '2026-10-12T11:00:00' });
const a2 = client({ council: 'Brent' });
const a3 = client({ council: 'Croydon', officer_name: 'Sam', nominated_at: '2026-10-13T09:00:00', officer_replied_at: '2026-10-14T16:00:00' });
const within = property({});
const over = property({ rent_pcm: nwl + 100 });
const d1 = deal({ applicant_id: a1.id }); // Harrow, officer, incentive in writing
const d2 = deal({ applicant_id: a2.id }); // Brent, no record
const d3 = deal({ applicant_id: a3.id, move_in_on: '2026-10-01' }); // last week's
const viewed = deal({ applicant_id: a1.id, status: 'viewed', viewing_at: '2026-10-13T11:00:00', viewing_outcome: 'viewed', outcome_at: '2026-10-13T12:00:00', outcome_sent_to_officer_at: '2026-10-13T16:00:00' });
const viewedLate = deal({ applicant_id: a1.id, status: 'offered', viewing_at: '2026-10-15T11:00:00', viewing_outcome: 'offered', outcome_at: '2026-10-15T12:00:00', outcome_sent_to_officer_at: '2026-10-16T09:00:00' });
const noShow = deal({ applicant_id: a2.id, status: 'interested', viewing_at: '2026-10-14T11:00:00', viewing_outcome: 'no_show' });
const future = deal({ applicant_id: a2.id, status: 'viewing', viewing_at: '2026-10-18T18:00:00' });
const lost1 = deal({ applicant_id: a2.id, status: 'fell_through', fell_through_reason: 'Too far from where they need to be', updated_at: '2026-10-15T10:00:00' });
const lost2 = deal({ applicant_id: a2.id, status: 'fell_through', fell_through_reason: 'Failed referencing or affordability', reason_lost: 'failed_affordability', outcome_at: '2026-10-16T10:00:00' });
const notLost = deal({ applicant_id: a1.id, status: 'fell_through', fell_through_reason: MOVED_IN_ELSEWHERE, updated_at: '2026-10-14T10:00:00' });
const oldLoss = deal({ applicant_id: a1.id, status: 'fell_through', fell_through_reason: 'Client found somewhere else', updated_at: '2026-10-14T10:00:00' });
const sentDeal = deal({ applicant_id: a2.id, status: 'sent', property_id: within.id, created_at: '2026-10-13T10:00:00' });
const sentOver = deal({ applicant_id: a2.id, status: 'sent', property_id: over.id, created_at: '2026-10-13T10:00:00' });
const data: KpiData = {
  deals: [d1, d2, d3, viewed, viewedLate, noShow, future, lost1, lost2, notLost, oldLoss, sentDeal, sentOver],
  applicants: [a1, a2, a3],
  placements: [placement({ applicant_id: a1.id, deal_id: d1.id })],
  receivables: [rec({ applicant_id: a1.id, deal_id: d1.id, amount: 4000 }), rec({ kind: 'letting_fee', applicant_id: a3.id, amount: 300, sign_up_on: '2026-09-20', paid_on: '2026-10-16' }),
    rec({ applicant_id: a3.id, amount: 2000, sign_up_on: '2026-09-01', paid_on: '2026-10-13' })],
  providers: [],
  properties: [within, over],
  sends: [{ id: 's1', officer_id: 'o1', kind: 'alert', address: 'x@y', note: null, sent_at: '2026-10-14T10:00:00', sent_by: null, property_ids: [within.id] }],
};
const k = kpisFor(week, data, now);
check('placements this week (last week\'s left out)', k.placements === 2);
check('by borough, focus first', k.byBorough.map((x) => `${x.label} ${x.n}`).join(', ') === 'Harrow 1, Brent 1', k.byBorough.map((x) => x.label).join());
check('by route: the record, else not set', k.byRoute.map((x) => `${x.label} ${x.n}`).sort().join(', ') === 'Housing officer 1, Not set 1', k.byRoute.map((x) => `${x.label} ${x.n}`).join());
check('viewings that took place: no-shows and future ones left out', k.viewings === 2 && k.viewingsPerPlacement === 1, `${k.viewings}`);
check('reasons lost, and moving in with Keel is not a loss', k.lostTotal === 2 && k.lost.map((x) => x.key).sort().join() === 'failed_affordability,too_far', JSON.stringify(k.lost));
check('incentive per placement and the split in writing', k.incentive.placements === 1 && k.incentive.perPlacement === 4000 && k.incentive.inWritingShare === 1);
check('sign up to cash: the middle of what was paid', k.signUpToCash.count === 2 && k.signUpToCash.days === Math.round((26 + 42) / 2), JSON.stringify(k.signUpToCash));
check('sent within LHA: properties sent to clients or in the Mailer', k.withinLha.sent === 2 && k.withinLha.within === 1 && k.withinLha.over === 1 && k.withinLha.share === 0.5, JSON.stringify(k.withinLha));
check('first replies: on time and late', k.replies.onTime === 1 && k.replies.late === 1, JSON.stringify(k.replies));
check('outcomes back the same day', k.outcomes.onTime === 1 && k.outcomes.late === 1, JSON.stringify(k.outcomes));

const month = kpiPeriod('month', 0, now);
const goal = goalLines(month, data, { placementsMin: 6, placementsMax: 8, withIncentive: 4 });
check('the month\'s goal: placements against 6 to 8, and those with an incentive', goal[0].amount === '3 of 6 to 8' && goal[1].amount === '2 of 4', goal.map((g) => g.amount).join(' | '));
check('a goal of 0 is left out', goalLines(month, data, { placementsMin: 6, placementsMax: 8, withIncentive: 0 }).length === 1);
const reached = goalLines(month, data, { placementsMin: 2, placementsMax: 8, withIncentive: 1 });
check('reaching the bottom of the range says how far to the top', /Goal reached; 5 more/.test(reached[0].words), reached[0].words);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll weekly numbers checks pass');

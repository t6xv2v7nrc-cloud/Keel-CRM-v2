// Checks for targets. Run with: npx tsx scripts/test-targets.ts
import { periodOf, progressIn, targetLines } from '../src/lib/targets';
import type { Deal, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const tue = new Date('2026-10-13T10:00:00'); // a Tuesday
const week = periodOf('week', tue);
check('the week runs Monday to Sunday', week.from === '2026-10-12' && week.to === '2026-10-18', `${week.from} to ${week.to}`);
check('Tuesday is 2 of 7 days gone', Math.abs(week.gone - 2 / 7) < 1e-9, String(week.gone));
check('a Sunday belongs to the week before it', periodOf('week', new Date('2026-10-18T20:00:00')).from === '2026-10-12');
const month = periodOf('month', tue);
check('the month is October', month.from === '2026-10-01' && month.to === '2026-10-31' && month.label === 'October 2026');
const year = periodOf('year', tue);
check('the year', year.from === '2026-01-01' && year.to === '2026-12-31' && year.label === '2026');

const deal = (p: Partial<Deal>): Deal => ({ id: 'd', applicant_id: 'a', property_id: null, address: 'x', status: 'moved_in', viewing_at: null, move_in_on: '2026-10-12',
  fell_through_reason: null, notes: null, created_at: '', updated_at: '2026-10-12T10:00:00Z', ...p });
const fee = (p: Partial<Receivable>): Receivable => ({ id: 'r', kind: 'letting_fee', applicant_id: 'a', deal_id: null, property_address: null, payer: 'X', provider_id: null,
  amount: 300, sign_up_on: '2026-10-12', due_on: null, claim_submitted_on: null, status: 'due', paid_on: null, notes: null, created_at: '', updated_at: '', ...p });
const deals = [deal({ applicant_id: 'a' }), deal({ id: 'd2', applicant_id: 'b', move_in_on: '2026-10-05' }), deal({ id: 'd3', applicant_id: 'c', status: 'accepted' })];
const recs = [
  fee({ applicant_id: 'a' }),                                         // a: already counted by their move-in
  fee({ id: 'r2', applicant_id: 'e', amount: 250, sign_up_on: '2026-10-13' }), // e: placed with no deal tracked
  fee({ id: 'r6', kind: 'incentive', applicant_id: 'c', amount: 700, sign_up_on: null, status: 'due' }), // c: offer accepted, not signed up yet
  fee({ id: 'r7', applicant_id: 'h', amount: 900, sign_up_on: '2026-10-16' }),  // h: signs up on Friday, not yet
  fee({ id: 'r3', kind: 'incentive', applicant_id: 'a', amount: 1000, sign_up_on: '2026-10-13', status: 'to_claim' }),
  fee({ id: 'r4', applicant_id: 'f', amount: 500, status: 'declined' }),  // declined: left out
  fee({ id: 'r5', applicant_id: 'g', amount: 400, sign_up_on: '2026-09-30', status: 'paid' }), // last month
];
const w = progressIn(week, deals, recs, '2026-10-13');
check('placements this week: a moved in, e signed up; not b (last week) or c (only accepted)', w.placements === 2, String(w.placements));
check('fees this week: £300 + £250 + £1,000 incentive, not the declined one', w.fees === 1550, String(w.fees));
check('nothing still waiting for a sign-up counts: no date yet, or a date still to come', w.fees === 1550 && w.placements === 2);
check('once Friday comes, the fee signed up that day counts', progressIn(week, deals, recs, '2026-10-16').fees === 2450);
const m = progressIn(month, deals, recs, '2026-10-13');
check('placements this month count last week too', m.placements === 3, String(m.placements));

const lines = targetLines({ placements: 2, fees: 2000 }, w, week);
check('both targets shown', lines.length === 2);
check('placements reached', lines[0].words === 'Target reached' && lines[0].share === 1 && lines[0].amount === '2 of 2');
check('fees: £450 to go, ahead of pace on a Tuesday', lines[1].words === '£450 to go' && lines[1].onTrack && lines[1].amount === '£1,550 of £2,000', JSON.stringify(lines[1]));
check('behind pace is said', !targetLines({ placements: 10, fees: 0 }, { placements: 1, fees: 0 }, { gone: 0.5 })[0].onTrack);
check('a target of 0 is left out', targetLines({ placements: 0, fees: 0 }, w, week).length === 0);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

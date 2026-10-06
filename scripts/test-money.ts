// Checks for money owed. Run with: npx tsx scripts/test-money.ts
import { addRule, describe, dueDate, dueRuleFor, dueWords, feeChaseText, incentiveFor, isOpen, lettingFeeFor, overdueDays, owed, ruleWords, totals } from '../src/lib/money';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Provider, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const provider = (p: Partial<Provider>): Provider => ({
  id: 'wm', name: 'Watermint', contact_first_name: 'Sam', company: null, tag: 'WM', whatsapp: '447700900123', email: null,
  rules: {}, fee_terms: null, notes: null, active: true, created_at: '', updated_at: '', ...p,
});
const watermint = provider({ rules: { fee_amount: 300, fee_due: { n: 1, unit: 'months' } } });
const zuber = provider({ id: 'zub', name: 'Zuber', tag: 'ZUB', rules: { fee_amount: 250, fee_due: { n: 14, unit: 'days' } } });

// Due dates from the sign-up date
check('Watermint fee: sign up + 1 month', dueDate('letting_fee', '2026-10-06', watermint) === '2026-11-06');
check('Zuber fee: its own rule, 14 days', dueDate('letting_fee', '2026-10-06', zuber) === '2026-10-20');
check('a landlord fee uses the team standard (1 month)', dueDate('letting_fee', '2026-10-06', null) === '2026-11-06');
check('an incentive uses the incentive standard (6 weeks)', dueDate('incentive', '2026-10-06') === '2026-11-17');
check('no sign-up date, no due date', dueDate('letting_fee', null, watermint) === null);
check('31 January + 1 month is the end of February', addRule('2026-01-31', { n: 1, unit: 'months' }) === '2026-02-28');
check('a month over the year end', addRule('2026-12-15', { n: 1, unit: 'months' }) === '2027-01-15');
check('weeks', addRule('2026-10-06', { n: 2, unit: 'weeks' }) === '2026-10-20');
check('the standard can be changed in Team settings', (() => {
  setActiveSettings({ ...DEFAULT_SETTINGS, feeDue: { n: 7, unit: 'days' } });
  const d = dueDate('letting_fee', '2026-10-06', null);
  setActiveSettings(DEFAULT_SETTINGS);
  return d === '2026-10-13';
})());
check('rule in words', ruleWords({ n: 1, unit: 'months' }) === '1 month after sign up' && ruleWords(dueRuleFor('incentive')) === '6 weeks after sign up');

// New entries
const fee = lettingFeeFor({ applicantId: 'a1', dealId: 'd1', address: 'Broadfield Close, London NW2 6NR', signUpOn: '2026-10-06', provider: watermint });
check('letting fee at move-in: from the provider, at its usual fee, due a month on', fee.payer === 'Watermint' && fee.amount === 300 && fee.due_on === '2026-11-06' && fee.status === 'due', JSON.stringify(fee));
const landlordFee = lettingFeeFor({ applicantId: 'a1', dealId: 'd1', address: 'x', signUpOn: '2026-10-06', provider: null });
check('no provider: the landlord pays, amount still to set', landlordFee.payer === 'Landlord' && landlordFee.amount === null);
const inc = incentiveFor({ applicantId: 'a1', dealId: 'd1', address: 'x', signUpOn: '2026-10-06', council: 'Barnet' });
check('incentive: from the council, still to claim', inc.payer === 'Barnet council' && inc.status === 'to_claim' && inc.due_on === '2026-11-17');
check('timeline wording', describe({ kind: 'letting_fee', payer: 'Watermint', amount: 300, due_on: '2026-11-06' }) === 'Letting fee of £300 from Watermint, due Fri 6 Nov');

// Money owed: sorted by due date, overdue flagged
let n = 0;
const r = (p: Partial<Receivable>): Receivable => ({
  id: `r${++n}`, kind: 'letting_fee', applicant_id: 'a1', deal_id: null, property_address: 'Broadfield Close, London NW2 6NR', payer: 'Watermint',
  provider_id: 'wm', amount: 300, sign_up_on: null, due_on: null, claim_submitted_on: null, status: 'due', paid_on: null, notes: null,
  created_at: '2026-09-01', updated_at: '2026-09-01', ...p,
});
const today = '2026-10-06';
const list = [
  r({ id: 'soon', due_on: '2026-10-10' }),
  r({ id: 'late', due_on: '2026-10-01', status: 'chased' }),
  r({ id: 'undated', due_on: null, amount: null }),
  r({ id: 'paid', due_on: '2026-09-20', status: 'paid', paid_on: '2026-09-25', amount: 450 }),
  r({ id: 'later', due_on: '2026-11-06', kind: 'incentive', status: 'submitted', payer: 'Barnet council', amount: 1000 }),
  r({ id: 'no', due_on: '2026-09-01', kind: 'incentive', status: 'declined', amount: 500 }),
];
check('sorted by due date, overdue first, undated last; paid and declined left out', owed(list).map((x) => x.id).join(',') === 'late,soon,later,undated', owed(list).map((x) => x.id).join(','));
check('5 days late is flagged overdue', overdueDays(list[1], today) === 5 && dueWords(list[1], today) === 'Overdue 5 days');
check('due today is not overdue yet', overdueDays(r({ due_on: today }), today) === null && dueWords(r({ due_on: today }), today) === 'Due today');
check('paid is never overdue', overdueDays(list[3], today) === null && !isOpen(list[3]));
check('due later reads as a date', dueWords(list[0], today) === 'Due Sat 10 Oct');
const t = totals(list, today);
check('totals: owed £1,600 across 4, £300 overdue, £300 due this week, £450 paid in the last 30 days',
  t.owed === 1600 && t.owedCount === 4 && t.overdue === 300 && t.overdueCount === 1 && t.soon === 300 && t.soonCount === 1 && t.paid30 === 450 && t.unpriced === 1, JSON.stringify(t));

// Chasing
const chase = feeChaseText(list[1], watermint, { full_name: 'Anna Mecani' }, 'Ridwan');
check('chase message', chase.startsWith('Salam Sam, the letting fee of £300 for Anna at Broadfield Close, London NW2 6NR was due on Thu 1 Oct.') && chase.endsWith('Thanks, Ridwan, Keel Lettings') && !chase.includes('Mecani'), chase);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

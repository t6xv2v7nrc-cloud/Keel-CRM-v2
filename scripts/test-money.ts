// Checks for money owed. Run with: npx tsx scripts/test-money.ts
import {
  addRule, awaitingFirstRent, basisRule, basisWords, byMonth, calendarEntries, describe, dueDate, dueOn, dueRuleFor, dueWords, feeChaseText, feeFrom,
  firstRentExpected, firstRentLate, icsFile, incentiveFor, isOpen, lettingFeeFor, moneyEvents, monthGrid, nextMonth, overdueDays, owed, potentials,
  potentialTotals, rentOf, ruleWords, totals, usualFee, usualFeeWords, ghostTotal, periods, financesCsv,
} from '../src/lib/money';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Deal, Property, Provider, Receivable } from '../src/lib/types';

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

// Fees worked out from the rent
check('a week of £1,250 pcm is £288.46', feeFrom('weeks', 1, 1250) === 288.46, String(feeFrom('weeks', 1, 1250)));
check('2 weeks of £1,300 pcm is £600', feeFrom('weeks', 2, 1300) === 600);
check('50% of £1,250 pcm is £625', feeFrom('percent', 50, 1250) === 625);
check('a set amount ignores the rent', feeFrom('fixed', 300, null) === 300);
check('no rent, no worked-out fee', feeFrom('weeks', 1, null) === null && feeFrom('percent', 50, 0) === null);
check('rule words', basisRule('weeks', 1) === '1 week\'s rent' && basisRule('weeks', 2) === '2 weeks\' rent' && basisRule('percent', 50) === '50% of a month\'s rent');
check('how it was worked out', basisWords({ fee_basis: 'weeks', fee_rate: 1, rent_pcm: 1250 }) === '1 week\'s rent at £1,250 pcm' && basisWords({ fee_basis: 'fixed', fee_rate: 300 }) === null);
check('usual fee: weeks of rent wins over an old set amount', JSON.stringify(usualFee({ fee_basis: 'weeks', fee_rate: 1, fee_amount: 300 })) === '{"basis":"weeks","rate":1}');
check('usual fee: a set amount saved before', JSON.stringify(usualFee({ fee_amount: 300 })) === '{"basis":"fixed","rate":300}' && usualFee({}) === null);
check('provider card words', usualFeeWords({ fee_basis: 'percent', fee_rate: 50 }) === '50% of a month\'s rent' && usualFeeWords({ fee_amount: 300 }) === '£300');
const weekly = provider({ id: 'wk', name: 'Weekly Homes', rules: { fee_basis: 'weeks', fee_rate: 1 } });
const wkFee = lettingFeeFor({ applicantId: 'a1', dealId: 'd1', address: 'x', signUpOn: '2026-10-06', provider: weekly, rentPcm: 1250 });
check('move-in fee from a provider paid in weeks of rent', wkFee.amount === 288.46 && wkFee.fee_basis === 'weeks' && wkFee.rent_pcm === 1250, JSON.stringify(wkFee));
check('rent from the listing', rentOf({ address_line: 'x', postcode: 'NW2 6NR', borough: null, property_type: 'Studio', bedrooms: 0, rent_pcm: 1100, rent_text: null }) === 1100);
check('rent written as "1-Bed LHA" uses the area\'s rate', (rentOf({ address_line: 'Broadfield Close, London NW2 6NR', postcode: 'NW2 6NR', borough: 'Brent', property_type: '1 bed', bedrooms: 1, rent_pcm: null, rent_text: '1-Bed LHA' }) ?? 0) > 1000);

// Waiting for the first month's rent
const afterRent = provider({ id: 'ar', name: 'After Rent Lets', rules: { fee_amount: 400, fee_due: { n: 7, unit: 'days', from: 'first_rent' } } });
const arFee = lettingFeeFor({ applicantId: 'a1', dealId: 'd1', address: 'x', signUpOn: '2026-10-06', provider: afterRent });
check('a fee that waits: first rent expected a month after sign up, fee 7 days after that',
  arFee.due_after === 'first_rent' && arFee.first_rent_due_on === '2026-11-06' && arFee.due_on === '2026-11-13', JSON.stringify(arFee));
check('rule words for first rent', ruleWords({ n: 7, unit: 'days', from: 'first_rent' }) === '7 days after the first month\'s rent is paid'
  && ruleWords({ n: 0, unit: 'days', from: 'first_rent' }) === 'when the first month\'s rent is paid');
check('once the rent is paid early, the fee counts from that day', dueOn({ ...arFee, first_rent_paid_on: '2026-10-30' }, afterRent) === '2026-11-06');
check('a fee switched to wait, from a provider whose rule counts from sign up, falls due the day the rent is paid',
  dueOn({ kind: 'letting_fee', sign_up_on: '2026-10-06', due_after: 'first_rent', first_rent_due_on: '2026-11-10' }, watermint) === '2026-11-10');
check('the expected first rent date follows Team settings', (() => {
  setActiveSettings({ ...DEFAULT_SETTINGS, firstRentExpected: { n: 5, unit: 'weeks' } });
  const d = firstRentExpected('2026-10-06');
  setActiveSettings(DEFAULT_SETTINGS);
  return d === '2026-11-10';
})());
const waiting = r({ id: 'wait', due_after: 'first_rent', first_rent_due_on: '2026-10-01', due_on: '2026-10-01', amount: 400 });
check('waiting for first rent is never overdue', overdueDays(waiting, today) === null && awaitingFirstRent(waiting));
check('first rent 5 days late is flagged to check', firstRentLate(waiting, today) === 5 && dueWords(waiting, today) === 'Check first rent, expected Thu 1 Oct');
check('waiting, not late yet', dueWords(r({ due_after: 'first_rent', first_rent_due_on: '2026-11-06', due_on: '2026-11-13' }), today) === 'Waiting for first rent, Fri 6 Nov');
const paidRent = r({ due_after: 'first_rent', first_rent_due_on: '2026-09-20', first_rent_paid_on: '2026-09-22', due_on: '2026-09-29' });
check('once the rent is paid, the fee can be overdue', !awaitingFirstRent(paidRent) && overdueDays(paidRent, today) === 7);
const tw = totals([...list, waiting], today);
check('totals count fees waiting for first rent apart from overdue', tw.waiting === 400 && tw.waitingCount === 1 && tw.checkRent === 1 && tw.overdue === 300 && tw.owed === 2000, JSON.stringify(tw));
check('timeline wording while waiting', describe({ kind: 'letting_fee', payer: 'After Rent Lets', amount: 400, due_on: '2026-11-13', due_after: 'first_rent' }) === 'Letting fee of £400 from After Rent Lets, due once the first month\'s rent is paid');

// Potential: clients going for a property
const prop = (p: Partial<Property>): Property => ({
  id: 'p1', address_line: 'Flat 6, 78 Thornton Avenue', postcode: 'W4 1QG', borough: 'Hounslow', property_type: '1 bed', rent_pcm: 1300, lha_rate_pcm: null,
  landlord_id: null, status: 'void', available_from: null, notes: null, bedrooms: 1, bills: null, furnished: null, rent_text: null, area: null,
  source_tag: 'WK', provider_id: 'wk', created_at: '', updated_at: '', ...p,
});
const deal = (d: Partial<Deal>): Deal => ({
  id: 'd', applicant_id: 'a', property_id: 'p1', address: 'Flat 6, 78 Thornton Avenue', status: 'viewing', viewing_at: null, move_in_on: null,
  fell_through_reason: null, notes: null, created_at: '2026-10-01', updated_at: '2026-10-01', ...d,
});
const props = [
  prop({}), prop({ id: 'p2', address_line: '2 Elm Road', provider_id: null, source_tag: null, rent_pcm: 1000 }),
  prop({ id: 'p3', address_line: '5 Ash Grove', rent_pcm: 1300 }),
];
const deals = [
  deal({ id: 'd1', applicant_id: 'anna', status: 'accepted' }),
  deal({ id: 'd2', applicant_id: 'ben', status: 'offered' }),                          // same flat as Anna: both count
  deal({ id: 'd3', applicant_id: 'ben', property_id: 'p2', address: '2 Elm Road', status: 'viewing' }), // Ben counted once, at his offer
  deal({ id: 'd4', applicant_id: 'anna', property_id: 'p2', address: '2 Elm Road', status: 'viewed' }), // Anna counted once
  deal({ id: 'd5', applicant_id: 'cara', property_id: null, address: '9 Oak Lane', status: 'viewing' }), // already let to Dan
  deal({ id: 'd6', applicant_id: 'dan', property_id: null, address: '9 Oak Lane', status: 'moved_in' }), // placed, not potential
  deal({ id: 'd7', applicant_id: 'eve', property_id: 'p3', address: '5 Ash Grove', status: 'sent' }),    // only sent: not counted
  deal({ id: 'd8', applicant_id: 'fin', property_id: 'p2', address: '2 Elm Road', status: 'fell_through' }),
  deal({ id: 'd9', applicant_id: 'gus', property_id: 'p2', address: '2 Elm Road', status: 'viewing' }),   // landlord: fee not known
  deal({ id: 'd10', applicant_id: 'hal', status: 'viewing' }),                                           // a third client viewing Anna's flat
  deal({ id: 'd11', applicant_id: 'ivy', property_id: 'p3', address: '5 Ash Grove', status: 'interested' }), // interested: not counted
];
const pots = potentials(deals, [], props, [weekly]);
const ids = pots.map((p) => `${p.deal.applicant_id}:${p.deal.id}`).join(',');
check('potential: viewings booked or further only, each client once, several clients on one property each counted', ids === 'anna:d1,ben:d2,gus:d9,hal:d10', ids);
check('properties only sent, or clients only interested, are not counted', !pots.some((p) => p.deal.status === 'sent' || p.deal.status === 'interested'));
check('three clients going for the same flat all count', pots.filter((p) => p.deal.property_id === 'p1').length === 3);
check('potential fee worked out from the provider\'s usual fee and the rent', pots[0].amount === 300 && pots[0].payer === 'Weekly Homes', String(pots[0].amount));
check('no provider: the landlord, fee not known', pots[2].payer === 'Landlord' && pots[2].amount === null);
const pt = potentialTotals(pots);
check('potential totals: £900 from four clients, £600 likely from offers, one not priced',
  pt.total === 900 && pt.count === 4 && pt.likely === 600 && pt.likelyCount === 2 && pt.unpriced === 1, JSON.stringify(pt));
check('a withdrawn property (say its provider is switched off) brings in nothing',
  potentials(deals, [], props.map((x) => (x.id === 'p2' ? { ...x, status: 'withdrawn' as const } : x)), [weekly]).every((p) => p.deal.id !== 'd9'));
check('a property marked let brings in nothing',
  potentials(deals, [], props.map((x) => (x.id === 'p1' ? { ...x, status: 'let' as const } : x)), [weekly]).every((p) => p.deal.property_id !== 'p1'));
check('a deal with a fee already on Finances is not potential any more',
  potentials(deals, [{ kind: 'letting_fee', deal_id: 'd1', applicant_id: 'anna', status: 'due' }], props, [weekly]).every((p) => p.deal.id !== 'd1'));

// Ghost total: owed now plus every viewing booked or further
const ghost = ghostTotal(list, pots, today);
check('ghost total: £1,600 owed + £600 offers + £300 viewings = £2,500; 2 not known (one pipeline fee, one owed item)',
  ghost.total === 2500 && ghost.owed === 1600 && ghost.likely === 600 && ghost.viewings === 300 && ghost.unknown === 2, JSON.stringify(ghost));
check('ghost total leaves paid money out', ghostTotal([r({ status: 'paid', paid_on: today, amount: 999 })], [], today).total === 0);
check('viewings count as viewings', ghostTotal([], [{ ...pots[0], deal: { ...pots[0].deal, status: 'viewing' } }], today).viewings === 300);
check('a property only sent adds nothing to the ghost total', ghostTotal([], [{ ...pots[0], deal: { ...pots[0].deal, status: 'sent' } }], today).total === 0);

// By month and the calendar
const months = byMonth(list, today, 2, 1);
check('by month: paid in September, owed by due month', months.map((m) => `${m.label}:${m.paid}/${m.owed}`).join(' ') === 'Aug:0/0 Sep:450/0 Oct:0/600 Nov:0/1000',
  months.map((m) => `${m.label}:${m.paid}/${m.owed}`).join(' '));
check('this month is marked', months[2].current && !months[1].current);
const events = moneyEvents([...list, waiting], today);
check('calendar: first rent and due dates, paid days, soonest first', events.map((e) => `${e.day}:${e.kind}`).join(',') ===
  '2026-09-25:paid,2026-10-01:first_rent,2026-10-01:due,2026-10-01:due,2026-10-10:due,2026-11-06:due', events.map((e) => `${e.day}:${e.kind}`).join(','));
check('a waiting fee\'s first rent is flagged late, its own due date is not',
  events.find((e) => e.kind === 'first_rent')?.late === true && events.find((e) => e.kind === 'due' && e.r.id === 'wait')?.late === false
  && events.find((e) => e.r.id === 'late')?.late === true);
const grid = monthGrid('2026-10');
check('October 2026 starts on a Thursday, Monday first', grid[0].join(',') === ',,,2026-10-01,2026-10-02,2026-10-03,2026-10-04' && grid.length === 5 && grid[4][5] === '2026-10-31' && grid[4][6] === null, grid[0].join(','));
check('February 2027 has 4 weeks plus', monthGrid('2027-02').flat().filter(Boolean).length === 28);
check('next month over the year end', nextMonth('2026-12') === '2027-01' && nextMonth('2026-01', -1) === '2025-12');
const entries = calendarEntries(events, (id) => (id === 'a1' ? 'Anna' : null));
check('calendar entries leave out paid ones and name the client by first name', entries.length === 5 && entries.every((e) => !/Mecani/.test(e.title)) && entries[0].title === 'First month\'s rent due (Anna): Watermint fee follows', entries[0].title);
const ics = icsFile(entries, new Date('2026-10-06T09:00:00Z'));
check('calendar file: all-day entries with a 9am reminder', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('DTSTART;VALUE=DATE:20261001\r\n') && ics.includes('DTEND;VALUE=DATE:20261002\r\n')
  && ics.includes('TRIGGER;RELATED=START:PT9H') && ics.includes('DTSTAMP:20261006T090000Z') && ics.trimEnd().endsWith('END:VCALENDAR'));
check('calendar file escapes commas and folds long lines', ics.includes('Broadfield Close\\, London') && ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));

// For the accountant
const ps = periods('2026-10-06');
check('this tax year runs 6 April to 5 April', ps[0].label === '2026 to 2027 tax year' && ps[0].from === '2026-04-06' && ps[0].to === '2027-04-05');
check('before 6 April it is still last year\'s tax year', periods('2026-04-05')[0].from === '2025-04-06' && periods('2026-04-06')[0].from === '2026-04-06');
check('months, and everything', ps[2].from === '2026-10-01' && ps[2].to === '2026-10-31' && ps[3].from === '2026-09-01' && ps[3].to === '2026-09-30' && ps[4].key === 'all');
const csv = financesCsv(list, ps[3], (id) => (id === 'a1' ? 'Anna Mecani' : ''));
const csvLines = csv.replace('\uFEFF', '').trim().split('\r\n');
check('September: each fee by the day it was paid, else due, else added; oldest first; the address quoted',
  csvLines.length === 7 && csvLines[3].startsWith('2026-09-25,,Letting fee,Watermint,Anna Mecani,"Broadfield Close, London NW2 6NR",450.00,Paid,2026-09-25'), csvLines.join(' / '));
check('a fee with no amount yet is still listed, with the amount blank', csvLines[1].includes(',,Due,'));
check('totals paid and still owed', csvLines[5].endsWith('Total paid,450.00') && csvLines[6].endsWith('Total still owed,0.00'), csvLines.slice(5).join(' / '));
check('starts with a byte-order mark so Excel reads the £ sign', csv.startsWith('\uFEFF'));
const allCsv = financesCsv(list, ps[4], () => 'X').trim().split('\r\n');
check('everything: every fee, oldest first', allCsv.length === 1 + list.length + 3 && allCsv[1].startsWith('2026-09-01'), allCsv[1]);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

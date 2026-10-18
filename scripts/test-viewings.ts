// Checks for viewings: outcomes, why deals are lost, working hours, and replies to housing officers.
// Run with: npx tsx scripts/test-viewings.ts
import {
  addWorkingHours, caseworkAddress, dueWords, LOST_REASONS, mailtoLink, MOVED_IN_ELSEWHERE, outcomeBack, outcomeEmail, outcomeForMove, outcomeOf,
  outcomeStep, reasonCode, reasonLostOf, replyState, responsesDue, toRecord, tookWords, workingHoursBetween,
} from '../src/lib/viewings';
import type { OfficerRecord } from '../src/lib/councils';
import type { ResponseRules } from '../src/lib/settings';
import type { Applicant, Deal } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const rules: ResponseRules = { replyHours: 4, dayStart: '09:00', dayEnd: '17:30', watchDays: 14 };
// local times, the way the app reads them: 12 October 2026 is a Monday
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString();
const same = (a: Date, b: Date) => a.getTime() === b.getTime();

const client = (p: Partial<Applicant>): Applicant => ({
  id: 'a1', full_name: 'Amira Hassan', phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: 1200, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null,
  lcwra: null, council_registered: null, work_status: null, household_type: 'single', urgency: null, council: 'Harrow', officer_name: 'Jo Brennan',
  officer_email: 'jo.brennan@harrow.gov.uk', officer_phone: null, housing_situation: null, consent: null, tier: null, created_at: iso(12, 10), updated_at: iso(12, 10),
  stage_changed_at: iso(12, 10), iced_at: null, iced_until: null, iced_reason: null, nominated_at: null, officer_replied_at: null, ...p,
});
const deal = (p: Partial<Deal>): Deal => ({ id: 'd1', applicant_id: 'a1', property_id: 'p1', address: 'Flat 2, 10 Station Road, Harrow HA1 2AA', status: 'viewing',
  viewing_at: iso(13, 14), move_in_on: null, fell_through_reason: null, notes: null, created_at: iso(12, 11), updated_at: iso(12, 11),
  viewing_outcome: null, reason_lost: null, outcome_at: null, outcome_sent_to_officer_at: null, ...p });

// ── Working hours ──
check('4 working hours from 10am Monday is 2pm Monday', same(addWorkingHours(at(12, 10), 4, rules), at(12, 14)));
check('from 4pm Monday it runs into Tuesday morning (1.5h + 2.5h)', same(addWorkingHours(at(12, 16), 4, rules), at(13, 11, 30)));
check('from 5pm Friday it is Monday 12:30pm', same(addWorkingHours(at(9, 17), 4, rules), at(12, 12, 30)));
check('a nomination on Saturday is due Monday 1pm', same(addWorkingHours(at(10, 15), 4, rules), at(12, 13)));
check('before the day starts counts from 9am', same(addWorkingHours(at(13, 7), 4, rules), at(13, 13)));
check('working hours between 4pm Monday and 11:30am Tuesday is 4', workingHoursBetween(at(12, 16), at(13, 11, 30), rules) === 4);
check('a weekend adds nothing', workingHoursBetween(at(9, 17), at(12, 9), rules) === 0.5);
check('took words', tookWords(0.25) === '15 working minutes' && tookWords(1) === '1 working hour' && tookWords(3.46) === '3.5 working hours');

// ── First reply to the officer ──
const fresh = client({});
const r = replyState(fresh, at(12, 13), rules)!;
check('an officer client has a reply due 4 working hours after arriving', !!r && same(r.due, at(12, 14)) && r.waiting && !r.overdue);
check('past the target it is overdue', replyState(fresh, at(12, 15), rules)!.overdue);
const replied = replyState(client({ officer_replied_at: iso(12, 11, 30) }), at(12, 15), rules)!;
check('replied in time: not waiting, not late, took 1.5 hours', !replied.waiting && !replied.late && replied.took === 1.5);
check('replied late is late', replyState(client({ officer_replied_at: iso(13, 10) }), at(13, 12), rules)!.late);
check('nominated_at wins over when they got in touch', same(replyState(client({ nominated_at: iso(14, 9) }), at(14, 10), rules)!.due, at(14, 13)));
check('no officer: nothing to track', replyState(client({ officer_name: null, officer_email: null }), at(12, 13), rules) === null);
check('older than the watch days: not chased', !replyState(fresh, at(30, 10), rules)!.waiting);
check('a lost or iced client is not chased', !replyState(client({ stage: 'lost' }), at(12, 15), rules)!.waiting
  && !replyState(client({ iced_at: iso(12, 11), iced_until: '2026-11-01' }), at(12, 15), rules)!.waiting);

// ── Outcomes ──
check('outcomes move the deal', outcomeStep('viewed') === 'viewed' && outcomeStep('offered') === 'offered' && outcomeStep('signed') === 'moved_in'
  && outcomeStep('declined') === 'fell_through' && outcomeStep('no_show') === 'interested');
const passed = deal({});
const now = at(13, 16);
check('a picked outcome is written with its time', outcomeForMove(passed, 'interested', { picked: 'no_show', now })?.viewing_outcome === 'no_show'
  && outcomeForMove(passed, 'interested', { picked: 'no_show', now })?.outcome_at === now.toISOString());
check('moving on after the viewing records what the move means', outcomeForMove(passed, 'viewed', { now })?.viewing_outcome === 'viewed'
  && outcomeForMove(deal({ status: 'viewed' }), 'offered', { now })?.viewing_outcome === 'offered'
  && outcomeForMove(deal({ status: 'offered' }), 'moved_in', { now })?.viewing_outcome === 'signed');
check('falling through after a viewing is declined, or a no-show by its reason', outcomeForMove(passed, 'fell_through', { now, reason: 'Client said no' })?.viewing_outcome === 'declined'
  && outcomeForMove(passed, 'fell_through', { now, reason: 'Client did not turn up' })?.viewing_outcome === 'no_show');
check('cancelling a viewing before its time records nothing', outcomeForMove(deal({ viewing_at: iso(20, 14) }), 'fell_through', { now, reason: 'Client said no' }) === null);
check('a deal that never had a viewing records nothing', outcomeForMove(deal({ status: 'sent', viewing_at: null }), 'fell_through', { now }) === null);
check('booking a new viewing clears the last outcome and its send', JSON.stringify(outcomeForMove(deal({ status: 'interested', viewing_outcome: 'no_show', outcome_sent_to_officer_at: iso(13, 15) }), 'viewing', { now }))
  === JSON.stringify({ viewing_outcome: null, outcome_at: null, outcome_sent_to_officer_at: null }));
check('the same outcome again changes nothing', outcomeForMove(deal({ status: 'viewed', viewing_outcome: 'offered' }), 'offered', { now }) === null);
check('old deals: outcome worked out from how far they got', outcomeOf(deal({ status: 'accepted' })) === 'offered' && outcomeOf(deal({ status: 'moved_in' })) === 'signed'
  && outcomeOf(deal({ status: 'fell_through', fell_through_reason: 'Client did not turn up' })) === 'no_show' && outcomeOf(deal({ status: 'interested', viewing_at: null })) === null);
check('moved in elsewhere has no viewing outcome', outcomeOf(deal({ status: 'fell_through', fell_through_reason: MOVED_IN_ELSEWHERE })) === null);

// ── Why it was lost ──
check('every listed reason falls in its group', LOST_REASONS.every((g) => g.reasons.every((x) => reasonCode(x) === g.code)));
check('written reasons are grouped by their words', reasonCode('Too far from her kids school') === 'too_far' && reasonCode('Landlord wanted a guarantor') === 'failed_affordability'
  && reasonCode('Damp in the bedroom') === 'property_issue' && reasonCode('Changed her mind') === 'client_dropped_out' && reasonCode('Something odd') === 'other');
check('a recorded reason wins; live deals have none', reasonLostOf(deal({ status: 'fell_through', fell_through_reason: 'Client said no', reason_lost: 'too_small' })) === 'too_small'
  && reasonLostOf(deal({ status: 'viewing' })) === null);
check('closed because they moved in elsewhere with Keel is not a loss', reasonLostOf(deal({ status: 'fell_through', fell_through_reason: MOVED_IN_ELSEWHERE })) === null);
check('an old reason with no group yet still counts', reasonLostOf(deal({ status: 'fell_through', fell_through_reason: 'Let to someone else' })) === 'property_issue');

// ── The outcome back to the officer ──
const told = deal({ status: 'viewed', viewing_outcome: 'viewed', outcome_at: iso(13, 15) });
const ob = outcomeBack(told, fresh, at(13, 16), rules)!;
check('an outcome is due back by the end of the viewing day', !!ob && ob.day === '2026-10-13' && ob.waiting && !ob.overdue && ob.due.getHours() === 23);
check('the next day it is overdue', outcomeBack(told, fresh, at(14, 9), rules)!.overdue);
check('sent the same day is on time', !outcomeBack({ ...told, outcome_sent_to_officer_at: iso(13, 17) }, fresh, at(14, 9), rules)!.late);
check('sent the next day is late', outcomeBack({ ...told, outcome_sent_to_officer_at: iso(14, 10) }, fresh, at(14, 11), rules)!.late);
check('no outcome recorded, or no officer: nothing to send', outcomeBack(deal({ status: 'viewed' }), fresh, now, rules) === null
  && outcomeBack(told, client({ officer_name: null, officer_email: null }), now, rules) === null);

// ── What is waiting on us ──
const waitingDeals = [deal({ id: 'd-rec' }), told, deal({ id: 'd-future', viewing_at: iso(16, 11) })];
check('viewings to record are the passed ones', toRecord(waitingDeals, now, rules).map((d) => d.id).join() === 'd-rec');
const due = responsesDue([fresh], waitingDeals, at(13, 16), rules);
check('waiting on us: a reply, a viewing to record and an outcome to send, soonest first',
  due.map((d) => d.kind).join() === 'reply,record,outcome' || due.map((d) => d.kind).join() === 'reply,outcome,record', due.map((d) => d.kind).join());
check('the reply is overdue by Tuesday afternoon', due.find((d) => d.kind === 'reply')!.overdue);
check('due words', dueWords(at(13, 14), at(13, 9)) === 'by 2pm today' && dueWords(at(14, 11, 30), at(13, 9)) === 'by 11:30am tomorrow'
  && dueWords(new Date(2026, 9, 13, 23, 59, 59), at(13, 9)) === 'today' && dueWords(at(16, 9), at(13, 9)) === 'by 9am Fri 16 Oct');

// ── Telling the officer ──
const rec = (p: Partial<OfficerRecord>): OfficerRecord => ({ id: 1, name: 'Jo Brennan', email: 'jo.brennan@harrow.gov.uk', status: 'active', ...p });
check('casework goes to the officer on the client', caseworkAddress(fresh, []).address === 'jo.brennan@harrow.gov.uk');
check('a shared mailbox replaces the personal email', caseworkAddress(fresh, [rec({ send_to_mailbox: 'housing.options@harrow.gov.uk' })]).address === 'housing.options@harrow.gov.uk');
const left = caseworkAddress(fresh, [rec({ status: 'left' })]);
check('someone who has left is never written to', left.address === null && /has left/.test(left.note ?? ''), left.note ?? '');
check('a bounced officer with a team mailbox goes to the mailbox', caseworkAddress(fresh, [rec({ status: 'bounced', send_to_mailbox: 'team@harrow.gov.uk' })]).address === 'team@harrow.gov.uk');
const out = caseworkAddress(fresh, [rec({ status: 'opted_out' })]);
check('opted out of property emails still hears about their own client', out.address === 'jo.brennan@harrow.gov.uk' && /own client/.test(out.note ?? ''));
check('no email saved: nothing to send to', caseworkAddress(client({ officer_email: null }), []).address === null);

const mail = outcomeEmail(fresh, { ...deal({ status: 'interested' }), viewing_outcome: 'no_show' }, 'Ridwan');
check('the email greets the officer and names the client', mail.subject === 'Amira Hassan: viewing at Flat 2, 10 Station Road' && mail.body.startsWith('Hi Jo,'));
check('a no-show asks the officer to check in', /did not make it to the viewing/.test(mail.body) && /Ridwan\nKeel Lettings$/.test(mail.body));
check('a lost one gives the reason in words', /\(too small\)/.test(outcomeEmail(fresh, deal({ status: 'fell_through', viewing_outcome: 'declined', reason_lost: 'too_small' })).body));
check('no em dashes in the email', !/—/.test(Object.values(mail).join(' ')));
check('mailto link keeps the address readable and encodes the rest', mailtoLink('jo@harrow.gov.uk', { subject: 'A B', body: 'x\ny' }) === 'mailto:jo@harrow.gov.uk?subject=A%20B&body=x%0Ay');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll viewings checks pass');

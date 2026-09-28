// Checks for client progress: stage from deals, next steps, stuck. Run with: npx tsx scripts/test-progress.ts
import { lastMoved, nextMove, shouldAdvance, stageFromDeals, stepAfter, stuckDays, takesOver, viewingsBetween, viewingShort } from '../src/lib/progress';
import { queueLabel } from '../src/lib/calls';
import { addDays, todayIso } from '../src/lib/calls';
import type { Applicant, Deal, DealStatus } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
let id = 0;
const client = (p: Partial<Applicant> = {}): Applicant => ({
  id: 'a1', full_name: 'Anna Mecani', phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null,
  referring_borough: null, source: 'website', referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null,
  notes: null, on_uc: null, pip: null, lcwra: null, council_registered: null, work_status: null, household_type: null, urgency: null,
  council: null, officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null, tier: null,
  created_at: daysAgo(30), updated_at: daysAgo(1), stage_changed_at: daysAgo(10), ...p,
});
const deal = (status: DealStatus, p: Partial<Deal> = {}): Deal => ({
  id: `d${++id}`, applicant_id: 'a1', property_id: null, address: 'Broadfield Close, London NW2 6NR', status, viewing_at: null,
  move_in_on: null, fell_through_reason: null, notes: null, created_at: daysAgo(5), updated_at: daysAgo(5), ...p,
});

// Stage follows the furthest deal, forwards only
check('sent and interested leave the stage alone', stageFromDeals([deal('sent'), deal('interested')]) === null);
check('a viewing booked means Viewing', stageFromDeals([deal('sent'), deal('viewing')]) === 'viewing');
check('an accepted offer means Offer', stageFromDeals([deal('viewed'), deal('accepted')]) === 'offer');
check('a move-in means Placed', stageFromDeals([deal('moved_in')]) === 'placed');
check('fell-through deals do not count', stageFromDeals([deal('fell_through'), deal('interested')]) === null);
check('referred moves forward to viewing', shouldAdvance('referred', 'viewing'));
check('offer never moves back to viewing', !shouldAdvance('offer', 'viewing'));
check('a lost client is not moved on its own', !shouldAdvance('lost', 'viewing'));

// Next moves and next steps
check('interested → Book a viewing', nextMove('interested')?.to === 'viewing' && nextMove('interested')?.label === 'Book a viewing');
check('moved in has no next move', nextMove('moved_in') === null && nextMove('fell_through') === null);
const at = new Date(); at.setDate(at.getDate() + 2); at.setHours(14, 0, 0, 0);
const vStep = stepAfter('viewing', 'Broadfield Close, London NW2 6NR', at.toISOString());
check('booking a viewing sets the step for that day', vStep?.step === 'Viewing at Broadfield Close, 2pm' && vStep?.on === addDays(2), JSON.stringify(vStep));
check('an offer sets a chase two days later', stepAfter('offered', 'Broadfield Close, London NW2 6NR')?.on === addDays(2));
check('an automatic step replaces a later one', takesOver({ next_call_at: addDays(5), next_step: 'Chase documents' }, { on: addDays(2) }, 'Broadfield Close'));
check('but not a sooner one', !takesOver({ next_call_at: addDays(1), next_step: 'Chase documents' }, { on: addDays(2) }, 'Broadfield Close'));
check('unless it is about the same property', takesOver({ next_call_at: addDays(1), next_step: 'Book a viewing at Broadfield Close' }, { on: addDays(2) }, 'Broadfield Close, London NW2 6NR'));
check('the queue shows the step', queueLabel({ kind: 'due', date: todayIso(), overdue: false }, 'Chase documents') === 'Due today: Chase documents');
check('a scheduled step reads naturally', queueLabel({ kind: 'scheduled', date: addDays(1) }, 'Chase documents') === 'Chase documents, tomorrow');
check('viewing times read "Today, 2pm"', viewingShort(new Date(new Date().setHours(14, 0, 0, 0)).toISOString()) === 'Today, 2pm');

// Stuck
check('10 days at Referred with nothing sent is stuck (limit 7)', stuckDays(client(), []) === 10);
check('a deal moved 2 days ago means moving', stuckDays(client(), [deal('interested', { updated_at: daysAgo(2) })]) === null);
check('a viewing coming up is never stuck', stuckDays(client({ stage: 'viewing' }), [deal('viewing', { viewing_at: at.toISOString(), updated_at: daysAgo(20) })]) === null);
check('placed and lost clients are never stuck', stuckDays(client({ stage: 'placed' }), []) === null && stuckDays(client({ stage: 'lost' }), []) === null);
check('before the update, the stage age falls back to when they arrived', lastMoved(client({ stage_changed_at: undefined }), []) === client({ stage_changed_at: undefined }).created_at);

// This week
const start = new Date(); start.setHours(0, 0, 0, 0);
const end = new Date(start); end.setDate(end.getDate() + 7);
const soon = viewingsBetween([deal('viewing', { viewing_at: at.toISOString() }), deal('viewing', { viewing_at: addDays(10) + 'T10:00:00Z' }), deal('viewed', { viewing_at: at.toISOString() })], start, end);
check('the week shows booked viewings in the next 7 days only', soon.length === 1);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

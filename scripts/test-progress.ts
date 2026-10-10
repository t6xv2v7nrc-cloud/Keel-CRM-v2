// Checks for client progress: stage from deals, next steps, stuck. Run with: npx tsx scripts/test-progress.ts
import { checklistProgress, coldDays, lastMoved, needsChecklist, nextMove, shouldAdvance, stageFromDeals, stepAfter, stuckDays, takesOver, viewingsBetween, viewingShort } from '../src/lib/progress';
import { queueLabel } from '../src/lib/calls';
import { isActive, isHoused } from '../src/lib/search';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
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

// Active means still being housed; moved in is housed
check('lead, referred, viewing and offer are active', ['lead', 'referred', 'viewing', 'offer'].every((st) => isActive(client({ stage: st as Applicant['stage'] }))));
check('placed (and the old fee stages) are housed, not active', ['placed', 'fee_invoiced', 'fee_paid'].every((st) => !isActive(client({ stage: st as Applicant['stage'] })) && isHoused(client({ stage: st as Applicant['stage'] }))));
check('lost is neither', !isActive(client({ stage: 'lost' })) && !isHoused(client({ stage: 'lost' })));

// Gone cold: a lead or referral with nothing for 30 days (Team settings), no property in play, no next step booked
const old = { stage_changed_at: daysAgo(45), created_at: daysAgo(60) };
check('45 days at Referred with nothing is cold', coldDays(client(old), []) === 45);
check('10 days is stuck, not cold', coldDays(client(), []) === null);
check('a property still in play is not cold', coldDays(client(old), [deal('sent', { updated_at: daysAgo(40) })]) === null);
check('a fallen-through property does not keep them warm', coldDays(client(old), [deal('fell_through', { updated_at: daysAgo(40) })]) === 40);
check('a next step booked for later is not cold', coldDays(client({ ...old, next_call_at: addDays(3) }), []) === null);
check('an old next step does not keep them warm', coldDays(client({ ...old, next_call_at: addDays(-20) }), []) === 45);
check('only leads and referrals go cold', coldDays(client({ ...old, stage: 'viewing' }), []) === null && coldDays(client({ ...old, stage: 'lost' }), []) === null);
setActiveSettings({ ...DEFAULT_SETTINGS, coldAfterDays: 0 });
check('0 in Team settings turns it off', coldDays(client(old), []) === null);
setActiveSettings(DEFAULT_SETTINGS);

// Move-in checklist: shown once accepted, counted against the team's current list
const items = DEFAULT_SETTINGS.moveInChecklist;
check('the checklist shows for accepted and moved in only', needsChecklist(deal('accepted')) && needsChecklist(deal('moved_in')) && !needsChecklist(deal('offered')) && !needsChecklist(deal('fell_through')));
check('nothing ticked before 0015 is run', checklistProgress(deal('accepted'), items).done === 0 && checklistProgress(deal('accepted'), items).total === items.length);
const ticked = checklistProgress(deal('accepted', { checklist: { [items[0]]: '2026-10-01', [items[3]]: '2026-10-02', 'A check since removed': '2026-09-01' } }), items);
check('ticks count, a check since removed does not', ticked.done === 2 && ticked.left.length === items.length - 2, `${ticked.done} of ${ticked.total}`);
check('what is left keeps the list order', ticked.left[0] === items[1]);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

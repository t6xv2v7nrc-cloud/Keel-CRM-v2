// Checks for the notifications (the bell, the pop-ups and what push sends): each from the same rules as Home, with
// first names only. Run with: npx tsx scripts/test-notifications.ts
import { morningWords, noticesFor, pushPlan, pushWorthy, unreadOf } from '../src/lib/notifications';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Activity, Applicant, Deal, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);

// Tuesday 20 October 2026, 2pm
const now = new Date(2026, 9, 20, 14, 0);
const iso = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
let n = 0;
const client = (p: Partial<Applicant>) => ({ id: `a${++n}`, full_name: 'Sam Harrowfield', stage: 'referred', created_at: iso(-200), officer_name: null, officer_email: null,
  officer_phone: null, officer_replied_at: null, nominated_at: null, iced_at: null, iced_until: null, ...p }) as Applicant;
const deal = (p: Partial<Deal>) => ({ id: `d${++n}`, applicant_id: 'x', address: 'Flat 3, 12 Station Road, Harrow HA1 2AA', status: 'viewing', viewing_at: null, ...p }) as Deal;

const nominated = client({ full_name: 'Priya Nominee Long', officer_name: 'Jo Brennan', officer_email: 'jo@harrow.gov.uk', nominated_at: iso(-30) });
const viewer = client({ full_name: 'Ella Viewer' });
const soon = deal({ applicant_id: viewer.id, viewing_at: iso(0.75) });
const later = deal({ applicant_id: viewer.id, viewing_at: iso(5) });
const back = client({ full_name: 'Omar Paused', iced_at: iso(-500), iced_until: '2026-10-20' });
const owed = { id: 'r1', applicant_id: viewer.id, kind: 'fee', status: 'due', amount: 1250, payer: 'Watermint', due_on: '2026-09-20', sign_up_on: '2026-09-01' } as unknown as Receivable;
const email = { id: 'act1', entity_type: 'applicant', entity_id: viewer.id, kind: 'email', body: 'Email from Jo Brennan (Harrow): Re: viewing. Ella is happy with Thursday.', created_at: iso(-2) } as Activity;

const list = noticesFor({
  applicants: [nominated, viewer, back], deals: [soon, later], receivables: [owed], now, stepsDue: 3,
  inbox: [{ id: 'i1', status: 'review', source_hint: 'Website enquiry', created_at: iso(-5) }, { id: 'i2', status: 'review', source_hint: 'Outlook: email from Ade New', created_at: iso(-1) },
    { id: 'i3', status: 'confirmed', source_hint: null, created_at: iso(-1) }],
  officerEmails: [{ message_id: '<m1>', from_name: 'Vic Example', from_address: 'vic@haringey.gov.uk', subject: 'Forum', received_at: iso(-3) }],
  emails: [email],
});
const kinds = list.map((x) => x.kind);
const of = (k: string) => list.find((x) => x.kind === k);

check('the Bin: one line for everything waiting, newest named', of('bin')?.title === '2 in the Bin to review' && of('bin')?.detail === 'Newest: Outlook: email from Ade New' && of('bin')?.id === 'bin:i2', JSON.stringify(of('bin')));
check('a new item in the Bin makes it unread again (its id changes)', noticesFor({ applicants: [], deals: [], receivables: [], stepsDue: 0, officerEmails: [], emails: [], now,
  inbox: [{ id: 'i9', status: 'review', source_hint: null, created_at: iso(0) }] })[0].id === 'bin:i9');
check('a nomination waiting on a first reply, overdue, is urgent', of('reply')?.urgent === true && of('reply')?.title === 'Reply to Jo about Priya' && /Overdue/.test(of('reply')?.detail ?? ''), JSON.stringify(of('reply')));
check('a viewing within the hour is urgent; one in 5 hours is not shown yet', list.filter((x) => x.kind === 'viewing').length === 1 && of('viewing')?.urgent === true && /^Viewing at .+: Ella$/.test(of('viewing')!.title), JSON.stringify(of('viewing')));
check('next steps due: one line', of('steps')?.title === '3 next steps due');
check('money overdue, from whom and how late', of('overdue')?.title === '£1,250 overdue from Watermint' && of('overdue')?.detail === '30 days late', JSON.stringify(of('overdue')));
check('officer emails to file', of('officer_email')?.title === 'Email from Vic Example to file');
check('an officer email on a client\'s timeline', of('email')?.title === 'Jo Brennan emailed about Ella' && of('email')?.detail === 'Re: viewing. Ella is happy with Thursday.', JSON.stringify(of('email')));
check('back from ice today', of('ice')?.title === 'Omar is back from ice');
check('urgent first', list.findIndex((x) => !x.urgent) > list.findLastIndex((x) => x.urgent), kinds.join());
check('first names only: never a surname', !list.some((x) => /Nominee|Long|Harrowfield|Viewer|Paused/.test(`${x.title} ${x.detail ?? ''}`)), list.map((x) => x.title).join(' | '));
const same = noticesFor({ applicants: [client({ full_name: 'Priya Nominee', officer_name: 'Priya Example', officer_email: 'p@harrow.gov.uk', nominated_at: iso(-1) })],
  deals: [], receivables: [], inbox: [], officerEmails: [], emails: [], stepsDue: 0, now });
check('an officer with the client\'s first name is named in full', same[0]?.title === 'Reply to Priya Example about Priya', same[0]?.title);
check('unread is what is not marked read', unreadOf(list, new Set([of('bin')!.id])).length === list.length - 1);
check('nothing to do: nothing shown', noticesFor({ applicants: [], deals: [], receivables: [], inbox: [], officerEmails: [], emails: [], stepsDue: 0, now }).length === 0);

// what goes to phones
const counts = { viewingsToday: 2, stepsDue: 3, repliesOwed: 1, overdue: 0 };
check('push: new things and a viewing within the hour; next steps and money wait for the morning', pushWorthy(of('bin')!) && pushWorthy(of('reply')!) && pushWorthy(of('viewing')!)
  && !pushWorthy(of('steps')!) && !pushWorthy(of('overdue')!));
const afternoon = pushPlan(list, new Set(), now, counts);
check('push: more than three new at once go as one', afternoon.length === 1 && /things need you in Keel$/.test(afternoon[0].title) && afternoon[0].keys.length > 3, JSON.stringify(afternoon.map((m) => m.title)));
const allSent = new Set(list.map((x) => x.id));
check('push: nothing is sent twice', pushPlan(list, allSent, now, counts).length === 0);
const one = pushPlan(list, new Set([...allSent].filter((id) => !id.startsWith('bin:'))), now, counts);
check('push: one new thing goes on its own, opening its page', one.length === 1 && one[0].title === '2 in the Bin to review' && one[0].url === '/bin', JSON.stringify(one));
const tue9 = new Date(2026, 9, 20, 9, 0), sat9 = new Date(2026, 9, 24, 9, 0), tue12 = new Date(2026, 9, 20, 12, 0);
const morning = pushPlan([], new Set(), tue9, counts);
check('push: a summary on a working morning', morning.length === 1 && morning[0].keys[0] === 'morning:2026-10-20' && morning[0].body === 'Today: 2 viewings, 3 next steps due, 1 reply owed to officers.', JSON.stringify(morning));
check('push: not at the weekend, not after 11, not twice', pushPlan([], new Set(), sat9, counts).length === 0 && pushPlan([], new Set(), tue12, counts).length === 0
  && pushPlan([], new Set(['morning:2026-10-20']), tue9, counts).length === 0);
check('push: a quiet morning says so', morningWords({ viewingsToday: 0, stepsDue: 0, repliesOwed: 0, overdue: 0 }) === 'Nothing pressing yet: a good morning to chase new properties.');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll notification checks pass');

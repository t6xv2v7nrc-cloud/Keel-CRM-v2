// Checks for council contacts: who may be emailed (the hard rule), list health, sends and focus boroughs.
// Run with: npx tsx scripts/test-councils.ts
import {
  addressBox, boroughOf, bulkSendsIn30, byFocus, focusRank, listHealth, mailingList, nominatedAt, recordFor, sendAddress, statusOf, whyNotSendable,
} from '../src/lib/councils';
import type { OfficerRecord, OfficerSend } from '../src/lib/councils';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
const today = '2026-10-15';
let n = 0;
const O = (p: Partial<OfficerRecord>): OfficerRecord => ({
  id: `o${++n}`, name: `Officer ${n}`, council: 'Harrow', email: `officer${n}@harrow.example`, phone: null, route_type: 'housing_officer', send_to_mailbox: null,
  status: 'active', leave_until: null, bounce_count: 0, opt_in_source: 'Asked for listings', opted_in_at: null, last_nominated_client_at: null, ...p,
});

// Who may be emailed
check('active and opted in: yes', whyNotSendable(O({}), { today }) === null);
check('left: no', whyNotSendable(O({ status: 'left' }), { today }) === 'Left');
check('opted out: no', whyNotSendable(O({ status: 'opted_out' }), { today }) === 'Opted out');
check('bounced: no', whyNotSendable(O({ status: 'bounced' }), { today }) === 'Email bounced');
check('on leave: no, with the return date', whyNotSendable(O({ status: 'on_leave', leave_until: '2026-11-02' }), { today }) === 'On leave until 2 Nov 2026');
check('back from leave once the date has passed', statusOf(O({ status: 'on_leave', leave_until: '2026-10-14' }), today) === 'active' && whyNotSendable(O({ status: 'on_leave', leave_until: '2026-10-14' }), { today }) === null);
check('on leave with no date stays on leave', statusOf(O({ status: 'on_leave', leave_until: null }), today) === 'on_leave');
check('a housing officer who has neither opted in nor sent a client: no', whyNotSendable(O({ opt_in_source: null }), { today }) === 'Not opted in yet');
check('sending a client counts as opting in (recorded, from HELM, or from a client in Keel)',
  whyNotSendable(O({ opt_in_source: null, last_nominated_client_at: '2026-09-01' }), { today }) === null
  && whyNotSendable(O({ opt_in_source: null, first_referral: '2025-01-10' }), { today }) === null
  && whyNotSendable(O({ opt_in_source: null }), { today, nominatedFromClients: '2026-10-01' }) === null);
check('an opt-in date alone counts', whyNotSendable(O({ opt_in_source: null, opted_in_at: '2026-10-01T10:00:00Z' }), { today }) === null);
check('procurement mailboxes and landlord schemes need no opt-in', whyNotSendable(O({ route_type: 'procurement_mailbox', opt_in_source: null }), { today }) === null
  && whyNotSendable(O({ route_type: 'landlord_scheme', opt_in_source: null }), { today }) === null);
check('no email at all: no', whyNotSendable(O({ email: null }), { today }) === 'No email');
check('a status not yet recorded (before 0020) counts as active', statusOf(O({ status: undefined }), today) === 'active');

// The address: their shared mailbox wins
check('mailbox set: it is the only address', sendAddress(O({ email: 'jo@islington.example', send_to_mailbox: 'rental.alert@islington.gov.uk' })) === 'rental.alert@islington.gov.uk');
check('mailbox alone is enough to be emailed', whyNotSendable(O({ email: null, send_to_mailbox: 'rental.alert@islington.gov.uk' }), { today }) === null);

// The hard rule over a list
const jo = O({ name: 'Jo Bloggs', email: 'jo@islington.example', send_to_mailbox: 'rental.alert@islington.gov.uk' });
const sam = O({ name: 'Sam Smith', email: 'sam@islington.example', send_to_mailbox: 'rental.alert@islington.gov.uk' });
const ali = O({ name: 'Ali Khan' });
const gone = O({ name: 'Gone Away', status: 'left' });
const out = O({ name: 'No Thanks', status: 'opted_out' });
const cold = O({ name: 'Never Asked', opt_in_source: null });
const list = mailingList([jo, sam, ali, gone, out, cold], { today });
check('the mailing list leaves out the left, opted out and not opted in', list.to.length === 3 && list.left.map((l) => l.why).sort().join() === 'Left,Not opted in yet,Opted out', JSON.stringify(list.left.map((l) => l.why)));
check('both officers behind a shared mailbox are on the list, at the mailbox', list.to.length === 3 && list.to.filter((t) => t.address === 'rental.alert@islington.gov.uk').length === 2);
check('the mailbox goes once, never the personal emails behind it', list.addresses.join() === `rental.alert@islington.gov.uk,${ali.email}` && !addressBox(list).includes('jo@islington.example') && !addressBox(list).includes('sam@'));
check('the Bcc box: a mailbox plain, a person with their name', addressBox(list) === `rental.alert@islington.gov.uk; Ali Khan <${ali.email}>`, addressBox(list));
const late = mailingList([O({ status: 'on_leave', leave_until: '2026-10-01' })], { today });
check('someone back from leave is on the list again', late.to.length === 1);

// Bulk sends: a second inside 30 days is warned about; one-property alerts do not count
const S = (officer: OfficerRecord, kind: OfficerSend['kind'], sent_at: string): OfficerSend => ({ id: `s${++n}`, officer_id: String(officer.id), kind, address: null, note: null, sent_at, sent_by: null });
const sends = [S(ali, 'bulk', '2026-10-01T10:00:00Z'), S(ali, 'digest', '2026-10-10T10:00:00Z'), S(ali, 'alert', '2026-10-12T10:00:00Z'), S(jo, 'bulk', '2026-09-01T10:00:00Z'), S(jo, 'bulk', '2026-10-14T09:00:00Z')];
check('bulk emails and digests in the last 30 days are counted, alerts are not', bulkSendsIn30(ali, sends, today) === 2);
check('a send more than 30 days ago drops off', bulkSendsIn30(jo, sends, today) === 1);

// List health
const h = listHealth([jo, sam, ali, gone, out, cold, O({ name: 'Bounced', status: 'bounced', bounce_count: 1 }), O({ name: 'Away', status: 'on_leave', leave_until: '2026-12-01' }), O({ name: 'No Address', email: null })], sends, { today });
check('list health counts each group', [h.sendable.length, h.left.length, h.optedOut.length, h.notOptedIn.length, h.bounced.length, h.onLeave.length, h.noAddress.length, h.overSent.length].join() === '3,1,1,1,1,1,1,1',
  [h.sendable.length, h.left.length, h.optedOut.length, h.notOptedIn.length, h.bounced.length, h.onLeave.length, h.noAddress.length, h.overSent.length].join());
check('sent to twice in 30 days is Ali', h.overSent.map((o) => o.name).join() === 'Ali Khan');

// Nominations
check('the latest nomination wins', nominatedAt(O({ last_nominated_client_at: '2026-09-01', first_referral: '2025-01-01' }), '2026-10-02') === '2026-10-02');

// Focus boroughs: first, then the wish-list, then the rest
check('the borough from a council name', boroughOf({ council: 'London Borough of Harrow' }) === 'Harrow' && boroughOf({ council: 'Royal Borough of Kingston' }) === 'Kingston upon Thames' && boroughOf({ council: 'Somewhere District' }) === null);
check('focus, wish-list and the rest', focusRank('Harrow') === 0 && focusRank('Sutton') === 1 && focusRank('Brent') === 2 && focusRank(null) === 2);
const sorted = byFocus([O({ name: 'B', council: 'Brent' }), O({ name: 'S', council: 'Sutton' }), O({ name: 'H', council: 'Hounslow' }), O({ name: 'A', council: 'Croydon' })]);
check('sorted focus first, then wish-list, then the rest', sorted.map((o) => o.name).join() === 'A,H,S,B', sorted.map((o) => o.name).join());
setActiveSettings({ ...DEFAULT_SETTINGS, focusBoroughs: ['Brent'], wishlistBoroughs: [] });
check('the focus list comes from Team settings', focusRank('Brent') === 0 && focusRank('Harrow') === 2);
setActiveSettings(DEFAULT_SETTINGS);

// An officer named on a client, found on the list
const recs = [O({ name: 'Listed', email: 'Listed@Brent.example', phone: '020 7946 0000' }), O({ name: 'Boxed', email: 'x@y.example', send_to_mailbox: 'team@brent.example' })];
check('found by email, whatever the case', recordFor({ email: 'listed@brent.example', phone: null }, recs)?.name === 'Listed');
check('found by phone', recordFor({ email: null, phone: '+44 20 7946 0000' }, recs)?.name === 'Listed');
check('found by their team mailbox', recordFor({ email: 'team@brent.example', phone: null }, recs)?.name === 'Boxed');
check('not found', recordFor({ email: 'new@x.example', phone: null }, recs) === null);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

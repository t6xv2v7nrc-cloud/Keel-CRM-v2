// Checks for Outlook emails in Keel: only officer and council emails come in, each goes to the right place, and
// officer addresses are gathered without anyone already on the list. Run with: npx tsx scripts/test-outlook.ts
import {
  binText, isCouncilAddress, nameFromAddress, namesClient, officerAddresses, officerRowFor, plainText, snippetOf, sortEmail, timelineWords,
} from '../src/lib/outlookMail';
import type { GraphMessage } from '../src/lib/outlookMail';
import { mailingList } from '../src/lib/councils';
import type { OfficerRecord } from '../src/lib/councils';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);

let n = 0;
const client = (p: Partial<Applicant>) => ({ id: `a${++n}`, full_name: 'Sam Example', stage: 'referred', created_at: '2026-10-01', council: 'Harrow', referring_borough: null,
  officer_name: null, officer_email: null, officer_phone: null, ...p }) as Applicant;
const officer = (p: Partial<OfficerRecord>): OfficerRecord => ({ id: `o${++n}`, name: 'Jo Brennan', council: 'Harrow', email: 'jo.brennan@harrow.gov.uk', status: 'active',
  route_type: 'housing_officer', opt_in_source: 'Asked for listings', ...p });
const mail = (p: Partial<GraphMessage> & { fromAddress?: string; fromName?: string; text?: string }): GraphMessage => ({
  id: `m${++n}`, internetMessageId: `<m${n}@x>`, subject: p.subject ?? 'Hello', receivedDateTime: '2026-10-19T09:00:00Z',
  from: { emailAddress: { address: p.fromAddress ?? 'jo.brennan@harrow.gov.uk', name: p.fromName ?? 'Jo Brennan' } },
  body: { contentType: 'text', content: p.text ?? '' }, ...p,
});

// which addresses count
check('a .gov.uk address is a council', isCouncilAddress('Jo.Brennan@Harrow.gov.uk'));
check('a no-reply robot is not', !isCouncilAddress('noreply@harrow.gov.uk') && !isCouncilAddress('do-not-reply@brent.gov.uk'));
check('a personal address is not', !isCouncilAddress('someone@gmail.com'));
check('a domain an officer on the list uses counts', isCouncilAddress('ann@lbhf-housing.org.uk', new Set(['lbhf-housing.org.uk'])));

// plain text
check('html becomes text', plainText({ body: { contentType: 'html', content: '<p>Hi&nbsp;Ridwan,</p><p>Sam&amp;co</p>' } }) === 'Hi Ridwan,\nSam&co', JSON.stringify(plainText({ body: { contentType: 'html', content: '<p>Hi&nbsp;Ridwan,</p><p>Sam&amp;co</p>' } })));
check('the quoted earlier email is cut off', plainText({ body: { contentType: 'text', content: 'Yes, Thursday works.\n\nOn Mon 13 Oct 2026, Ridwan wrote:\n> Shall we book?' } }) === 'Yes, Thursday works.');
check('a preview is short and on one line', snippetOf({ body: { content: 'Line one\nLine two '.repeat(80) } }).length <= 280 && !snippetOf({ body: { content: 'a\nb' } }).includes('\n'));

// naming a client
check('full name named', namesClient('About Sam Example and the flat', { full_name: 'Sam Example' }));
check('first and last name both, apart', namesClient('Re: Example family. Sam would like to view', { full_name: 'Sam Example' }));
check('a first name alone is not enough', !namesClient('Sam would like to view', { full_name: 'Sam Example' }));
check('a one-word name never matches', !namesClient('Sam would like to view', { full_name: 'Sam' }));

// sorting
const jo = officer({});
const sam = client({ full_name: 'Sam Example', officer_name: 'Jo Brennan', officer_email: 'jo.brennan@harrow.gov.uk' });
const lee = client({ full_name: 'Lee Other', officer_email: 'kim@brent.gov.uk' });
const ctx = { applicants: [sam, lee], officers: [jo], own: ['ridwan@keel.example'] };
const reply = sortEmail(mail({ subject: 'Re: viewing', text: 'Sam Example is happy with Thursday.' }), ctx);
check('their officer, naming their client: a reply on that client', reply.kind === 'reply' && reply.applicant.id === sam.id, reply.kind);
const bySubject = sortEmail(mail({ fromAddress: 'team@brent.gov.uk', fromName: 'Brent Housing', subject: 'Lee Other: documents', text: 'Attached.' }), ctx);
check('a council email naming a client in its subject: a reply on that client', bySubject.kind === 'reply' && bySubject.applicant.id === lee.id, bySubject.kind);
const nom = sortEmail(mail({ fromAddress: 'ade@hounslow.gov.uk', fromName: 'Ade Officer', subject: 'Nomination: single male, 1 bed', text: 'Please find a nomination for a client in TA.' }), ctx);
check('a council officer putting someone new forward: a nomination for the Bin', nom.kind === 'nomination' && nom.council === 'Hounslow', JSON.stringify(nom));
const other = sortEmail(mail({ subject: 'Forum next week', text: 'Are you coming to the landlord forum?' }), ctx);
check('an officer email about nothing in Keel: waits to be filed', other.kind === 'other');
check('a personal email is left alone', sortEmail(mail({ fromAddress: 'friend@gmail.com', subject: 'Nomination for an award' }), ctx).kind === 'ignore');
check('your own email is left alone', sortEmail(mail({ fromAddress: 'ridwan@keel.example' }), ctx).kind === 'ignore');
check('a robot at a council is left alone', sortEmail(mail({ fromAddress: 'noreply@harrow.gov.uk', subject: 'Referral received' }), ctx).kind === 'ignore');
check('an officer on the list with a non-council address still counts', sortEmail(mail({ fromAddress: 'pat@charity.org', subject: 'Referral', text: 'A referral for you' }),
  { ...ctx, officers: [jo, officer({ email: 'pat@charity.org', council: 'Croydon' })] }).kind === 'nomination');

// what goes on the timeline and to the Bin
const tl = timelineWords(mail({ subject: 'Re: viewing', text: 'Sam is happy with Thursday.' }), { name: 'Jo Brennan', address: 'jo.brennan@harrow.gov.uk' }, 'Harrow');
check('the timeline line names who, their council, the subject and a preview', tl === 'Email from Jo Brennan (Harrow): Re: viewing. Sam is happy with Thursday.', tl);
const bt = binText(mail({ subject: 'Nomination', text: 'Client: Ali Test, 07700 900000' }), { name: 'Ade Officer', address: 'ade@hounslow.gov.uk' });
check('the Bin reads who sent it, the subject and the email', bt.startsWith('From: Ade Officer <ade@hounslow.gov.uk>\nSubject: Nomination\n\nClient: Ali Test'), bt);

// gathering officer addresses
const sent: GraphMessage[] = [
  { id: 's1', sentDateTime: '2026-09-01T10:00:00Z', toRecipients: [{ emailAddress: { address: 'new.person@croydon.gov.uk', name: 'New Person' } }, { emailAddress: { address: 'jo.brennan@harrow.gov.uk', name: 'Jo' } }] },
  { id: 's2', sentDateTime: '2026-10-01T10:00:00Z', toRecipients: [{ emailAddress: { address: 'NEW.PERSON@croydon.gov.uk', name: 'new.person@croydon.gov.uk' } }], ccRecipients: [{ emailAddress: { address: 'friend@gmail.com', name: 'Friend' } }] },
];
const received: GraphMessage[] = [
  { id: 'r1', receivedDateTime: '2026-10-05T10:00:00Z', from: { emailAddress: { address: 'kim.lee@brent.gov.uk', name: null } } },
  { id: 'r2', receivedDateTime: '2026-10-06T10:00:00Z', from: { emailAddress: { address: 'no-reply@brent.gov.uk', name: 'Brent' } } },
  { id: 'r3', receivedDateTime: '2026-10-06T10:00:00Z', from: { emailAddress: { address: 'ridwan@keel.example', name: 'Ridwan' } } },
];
const found = officerAddresses(sent, received, [jo], ['ridwan@keel.example']);
check('council addresses not on the list, most written to first', found.map((f) => f.address).join() === 'new.person@croydon.gov.uk,kim.lee@brent.gov.uk', found.map((f) => f.address).join());
check('counted, dated, named, and placed by council', found[0].sent === 2 && found[0].last === '2026-10-01T10:00:00Z' && found[0].name === 'New Person' && found[0].council === 'Croydon', JSON.stringify(found[0]));
check('a name read from the address when none was given', found[1].name === 'Kim Lee' && nameFromAddress('housing@brent.gov.uk') === null, JSON.stringify(found[1]));
const row = officerRowFor(found[0]);
check('added as a housing officer who has not opted in', row.route_type === 'housing_officer' && !row.opt_in_source && row.status === 'active', JSON.stringify(row));
const list = mailingList([{ ...(row as OfficerRecord), id: 'new1' }], {});
check('so the mailing list does not email them in bulk', list.to.length === 0 && list.left.length === 1, JSON.stringify(list.left));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll Outlook checks pass');

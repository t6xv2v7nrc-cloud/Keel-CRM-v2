// Checks for the Mailer: what can be sent, the wording, who it goes to. Run with: npx tsx scripts/test-mailer.ts
import {
  alertBody, alertRecipients, alertSubject, complianceLine, DIGEST_MAX, digestBody, digestPicks, digestRecipients, digestSubject, mailerReady, mailtoFor,
  oldMailerBackup, sendables,
} from '../src/lib/mailer';
import { credentialLines, missingBusiness, signature } from '../src/lib/business';
import { setLhaFromDatabase, rateFor } from '../src/lib/lha';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { OfficerRecord, OfficerSend } from '../src/lib/councils';
import type { RuledMatch } from '../src/lib/matchRules';
import type { Applicant, Property } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const today = '2026-10-18';
setActiveSettings(DEFAULT_SETTINGS);
const nwl = rateFor('North West London', 1)!;
let n = 0;
const papers = { gas_expiry: '2027-05-01', no_gas: false, eicr_expiry: '2029-02-01', epc_rating: 'C', epc_sap: 71, licence_needed: false, licence_no: null, licence_expiry: null, alarms_checked: '2026-09-20', photo_count: 5 };
const prop = (p: Partial<Property>): Property => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`, address_line: `Flat ${n}, 1 Station Road, Harrow HA1 2AA`, postcode: 'HA1 2AA', borough: 'Harrow', property_type: '1 bed',
  rent_pcm: nwl - 50, lha_rate_pcm: null, landlord_id: null, status: 'void', available_from: null, notes: null, bedrooms: 1, bills: null, furnished: null, rent_text: null,
  area: null, source_tag: null, lha_area: null, provider_id: null, created_at: '', updated_at: '', accommodation_type: 'self_contained', bills_included: ['water'], floor: 0, lift: false,
  suitable_for: [], prs_landlord_id: null, prs_property_id: null, photo_urls: ['https://photos.example/1', 'https://photos.example/2', 'https://photos.example/3', 'https://photos.example/4'],
  ...papers, ...p,
} as Property);

const good = prop({});
const over = prop({ rent_pcm: nwl + 80 });
const noPapers = prop({ gas_expiry: null, photo_count: 1, photo_urls: [] });
const nowhere = prop({ postcode: null, borough: null, address_line: 'Flat 9, Somewhere' });
const wembley = prop({ postcode: 'HA9 6AA', borough: 'Brent', address_line: '5 High Street, Wembley HA9 6AA' });
const watford = prop({ postcode: 'WD17 1AA', borough: null, area: 'Watford', address_line: '3 Market Street, Watford WD17 1AA', rent_pcm: (rateFor('South West Herts', 1) ?? 900) - 20 });
const let_ = prop({ status: 'let' });
const held = prop({ not_ready_at: '2026-10-15T10:00:00Z', not_ready_note: 'Waiting for the EICR' });
const list = sendables([good, over, noPapers, nowhere, wembley, watford, let_, held], today);
const of = (p: Property) => list.find((s) => s.property.id === p.id)!;
check('only available properties are considered', !list.some((s) => s.property.id === let_.id));
check('within LHA with papers and photos: ready', of(good).blockers.length === 0, of(good).blockers.join('; '));
check('over LHA: not held back, marked over, and listed after the rest', of(over).blockers.length === 0 && of(over).over && list.findIndex((s) => s.over) > list.findIndex((s) => !s.over));
check('over LHA: the alert says how far over', alertBody(of(over), { today }).includes('£80 over the LHA'));
check('pence over the LHA is not over', !sendables([prop({ rent_pcm: nwl + 0.5 })], today)[0].over);
check('papers or photos missing: ready all the same (the suppliers see to the checks)', of(noPapers).blockers.length === 0);
check('marked not ready by hand: held back, with why', of(held).blockers.some((b) => /Marked not ready: Waiting for the EICR/.test(b)));
check('no LHA area: held back, saying what to do', of(nowhere).blockers.some((b) => /LHA area not known/.test(b)));

check('built-in LHA rates: the Mailer will not send', !mailerReady().ok && /gov\.uk/.test(mailerReady().why ?? ''));
setLhaFromDatabase({ year: '2026/27', rates: { 'North West London': [600, nwl, 1400, 1700, 2000] }, source: { kind: 'database', url: 'https://www.gov.uk/lha-2026', effectiveFrom: '2026-04-01' } });
check('gov.uk rates loaded: it can', mailerReady().ok);
setLhaFromDatabase(null);

const subject = alertSubject(of(good), today);
check('subject: [Borough] | type | rent | LHA | available', subject === `[Harrow] | 1 bed | £${(nwl - 50).toLocaleString('en-GB')} pcm | LHA £${nwl.toLocaleString('en-GB')} | available now`, subject);
check('a later date says when', /available 1 Nov 2026$/.test(alertSubject(of(prop({ available_from: '2026-11-01' })) ?? sendables([prop({ available_from: '2026-11-01' })], today)[0], today)));
check('out of London: the town in the brackets', alertSubject(of(watford), today).startsWith('[Watford]'));
check('compliance line with expiry dates', complianceLine(good) === 'Gas safety to 1 May 2027 · EICR to 1 Feb 2029 · EPC C (71) · No licence needed · Alarms checked 20 Sep 2026', complianceLine(good));

setActiveSettings({ ...DEFAULT_SETTINGS, invoice: { ...DEFAULT_SETTINGS.invoice, email: 'hello@keel.example', phone: '020 0000 0000' },
  business: { ...DEFAULT_SETTINGS.business, redressScheme: 'The Property Ombudsman', redressNumber: 'D12345', icoNumber: 'ZA123456' } });
const body = alertBody(of(good), { greeting: 'Jo Brennan', myName: 'Ridwan', today });
check('greets the officer by first name', body.startsWith('Hi Jo,'));
check('the real LHA rate for its area', body.includes(`LHA: the 1 bed rate in North West London is £${nwl.toLocaleString('en-GB')} pcm, £50 under the LHA`), body);
check('the safety papers with their dates', body.includes('Safety: Gas safety to 1 May 2027'));
check('up to 3 photo links', body.includes('https://photos.example/3') && !body.includes('https://photos.example/4'));
check('business details and a way to stop', body.includes('Redress: The Property Ombudsman, member D12345 · ICO registration: ZA123456') && /Reply STOP, or email hello@keel\.example with Unsubscribe/.test(body));
check('no client names, no incentives, no em dashes', !/incentive/i.test(body) && !/—/.test(body));
check('blank credentials are left out, and listed as missing', !body.includes('LLAS') && missingBusiness({ ...DEFAULT_SETTINGS.business, redressScheme: 'TPO' }).length === 4);
check('the signature: name, business, contact, credentials', signature('Ridwan').join(' | ') === `Ridwan | Keel Lettings Ltd | 020 0000 0000 · hello@keel.example | ${credentialLines().join(' · ')}`, signature('Ridwan').join(' | '));
setActiveSettings(DEFAULT_SETTINGS);

// digests
const many = Array.from({ length: 10 }, (_, i) => prop({ rent_pcm: nwl - 10 * i }));
const all = sendables([...many, wembley, watford, over], today);
const picks = digestPicks('Harrow', all);
check(`a digest holds ${DIGEST_MAX} at most`, picks.length === DIGEST_MAX);
check('most under the LHA first', picks[0].checks.gap! <= picks[1].checks.gap!);
check('held-back properties never go in', !picks.some((s) => s.blockers.length));
const small = digestPicks('Harrow', sendables([good, wembley, watford], today));
check('the borough first, then next door; out of London left out', small.map((s) => s.property.id).join() === [good.id, wembley.id].join());
check('out of London only when included by hand', digestPicks('Harrow', sendables([good, watford], today), { includeOutside: true }).some((s) => s.property.id === watford.id));
check('digest subject', digestSubject('Harrow', 6, today) === '[Harrow] | 6 properties within LHA | October 2026');
check('a digest leaves out over-LHA properties unless included, then puts them last', !digestPicks('Harrow', all).some((s) => s.over)
  && digestPicks('Harrow', sendables([over, good], today), { includeOver: true }).map((s) => s.property.id).join() === [good.id, over.id].join());
check('with one over LHA the subject drops "within LHA" and the body says rent against LHA', digestSubject('Harrow', 6, today, false) === '[Harrow] | 6 properties | October 2026'
  && /each with its rent against the LHA/.test(digestBody('Harrow', sendables([good, over], today), { today })));
const dBody = digestBody('Harrow', small, { today });
check('digest body numbers each property', /\n1\. Flat 1, 1 Station Road/.test(dBody) && /\n2\. 5 High Street, Wembley/.test(dBody), dBody.slice(0, 300));

// recipients
const officer = (p: Partial<OfficerRecord>): OfficerRecord => ({ id: `o${++n}`, name: 'Jo Brennan', council: 'Harrow', email: `jo${n}@harrow.example`, status: 'active', route_type: 'housing_officer', opt_in_source: 'Asked for listings', ...p });
const jo = officer({ email: 'jo@harrow.example' });
const out = officer({ name: 'Out Person', email: 'out@harrow.example', status: 'opted_out' });
const boxed = officer({ name: 'Team Member', email: 'tm@harrow.example', send_to_mailbox: 'housing@harrow.example' });
const brent = officer({ name: 'Brent Person', council: 'Brent', email: 'bp@brent.example' });
const sends: OfficerSend[] = [{ id: 's1', officer_id: String(boxed.id), kind: 'digest', address: 'housing@harrow.example', note: null, sent_at: '2026-10-05T10:00:00Z', sent_by: null }];
const dr = digestRecipients('Harrow', [jo, out, boxed, brent], sends, { today });
check('a digest goes to that borough\'s officers on the mailing list only', dr.list.to.map((t) => t.address).join() === 'jo@harrow.example,housing@harrow.example' && dr.list.left.some((l) => l.why === 'Opted out'));
check('someone with a digest in the last 30 days is flagged', dr.recent.has(String(boxed.id)) && !dr.recent.has(String(jo.id)));

const client = (p: Partial<Applicant>) => ({ id: `a${++n}`, full_name: 'Amira Hassan', created_at: '2026-10-01', officer_name: 'Jo Brennan', officer_email: 'jo@harrow.example', officer_phone: null, source: 'officer', ...p }) as Applicant;
const m = (a: Applicant) => ({ applicant: a }) as RuledMatch;
const ar = alertRecipients(of(good), [m(client({})), m(client({ officer_email: 'out@harrow.example', officer_name: 'Out Person' })), m(client({ officer_email: 'new@harrow.example', officer_name: 'New Officer' })), m(client({ officer_name: null, officer_email: null, source: 'website' }))], [jo, out], { today });
check('an alert goes to the officers of clients it fits, through the mailing list', ar.list.to.map((t) => t.address).join() === 'jo@harrow.example' && ar.list.left.length === 1 && ar.clients === 3, JSON.stringify(ar.list.to.map((t) => t.address)));
check('officers not on the list are named, to add on Councils', ar.notListed.join() === 'New Officer');
const ol = alertRecipients(of(watford), [m(client({}))], [jo], { today });
check('out of London: London officers held back', ol.list.to.length === 0 && ol.londonHeld === 1);
check('unless included by hand', alertRecipients(of(watford), [m(client({}))], [jo], { today, includeLondon: true }).list.to.length === 1);

// mail links and the old mailer
check('one address goes in To', mailtoFor(['jo@harrow.example'], { subject: 'S', body: 'B' }) === 'mailto:jo@harrow.example?subject=S&body=B');
check('several go in Bcc', mailtoFor(['a@x.example', 'b@x.example'], { subject: 'S', body: 'B' }) === 'mailto:?bcc=a@x.example,b@x.example&subject=S&body=B');
check('too long to open: copy instead', mailtoFor(['a@x.example'], { subject: 'S', body: 'x'.repeat(3000) }) === null);
const backup = JSON.parse(oldMailerBackup(list, { to: [{ officer: jo, address: 'jo@harrow.example' }, { officer: boxed, address: 'housing@harrow.example' }] }));
check('the old mailer gets only what is ready and who can be emailed', backup.keelMailer === 1 && backup.props.length === list.filter((s) => !s.blockers.length).length
  && backup.officers.map((o: { email: string }) => o.email).join() === 'jo@harrow.example,housing@harrow.example' && backup.officers[1].name === '');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll mailer checks pass');

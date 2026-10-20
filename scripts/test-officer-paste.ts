// Checks for pasting housing officers onto the officer list: spreadsheets with headings, address lists from an email's
// To box, signatures, one a line; checked against the list, and never opted in unless you say they asked.
// Run with: npx tsx scripts/test-officer-paste.ts
import { fillWords, looksLikeOfficers, mailboxKind, pastedRow, readOfficerPaste } from '../src/lib/officerPaste';
import { mailingList } from '../src/lib/councils';
import type { OfficerRecord } from '../src/lib/councils';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);

const list: OfficerRecord[] = [
  { id: 'o1', name: 'Priya Example', email: 'priya.example@harrow.gov.uk', council: 'Harrow', phone: null, title: null, status: 'active', route_type: 'housing_officer' },
  { id: 'o2', name: 'Sam Phone', email: null, phone: '020 8000 1111', council: 'Brent', status: 'active', route_type: 'housing_officer' },
];
const show = (x: unknown) => JSON.stringify(x);

// a spreadsheet copied with its headings (tabs)
const sheet = readOfficerPaste([
  'First name\tSurname\tJob title\tCouncil\tEmail\tTel',
  'Jo\tBrennan\tHousing Options Officer\tLondon Borough of Hounslow\tjo.brennan@hounslow.gov.uk\t020 8583 2000',
  'Ann\tSmith\tTA Procurement Lead\tCroydon Council\tann.smith@croydon.gov.uk\t',
  'Priya\tExample\tSenior Housing Officer\tHarrow\tPriya.Example@harrow.gov.uk\t020 8863 5611',
].join('\n'), list);
const [jo, ann, priya] = sheet.officers;
check('spreadsheet: three officers read', sheet.officers.length === 3, show(sheet.officers.map((o) => o.name)));
check('spreadsheet: first name and surname joined, title, council as the borough, email and phone',
  jo.name === 'Jo Brennan' && jo.title === 'Housing Options Officer' && jo.council === 'Hounslow' && jo.email === 'jo.brennan@hounslow.gov.uk' && jo.phone === '020 8583 2000', show(jo));
check('spreadsheet: "Croydon Council" is Croydon', ann.council === 'Croydon' && ann.phone === null, show(ann));
check('already on the list (by email, any case): found, and what it adds', priya.existing?.id === 'o1' && priya.fills.title === 'Senior Housing Officer' && priya.fills.phone === '020 8863 5611' && !priya.fills.name, show(priya));
check('what it adds, in words', fillWords(priya.fills) === 'adds job title and phone', fillWords(priya.fills));

// comma separated, with quotes
const csv = readOfficerPaste('Name,Email,Borough\n"Okafor, Hannah",hannah.okafor@haringey.gov.uk,Haringey\nTom Lee,tom.lee@islington.gov.uk,Islington', []);
check('CSV with quotes: "Okafor, Hannah" is Hannah Okafor', csv.officers[0]?.name === 'Hannah Okafor' && csv.officers[0]?.council === 'Haringey' && csv.officers[1]?.name === 'Tom Lee', show(csv.officers));

// an Outlook To box
const to = readOfficerPaste('To: Brennan, Jo <jo.brennan@hounslow.gov.uk>; "Vic Example (Housing Needs)" <vic.example@haringey.gov.uk>; rental.alert@islington.gov.uk; Housing Options <housingoptions@harrow.gov.uk>', list);
const [t1, t2, t3, t4] = to.officers;
check('address list: four, from one line', to.officers.length === 4, show(to.officers.map((o) => o.email)));
check('address list: "Brennan, Jo" is Jo Brennan, the brackets dropped', t1.name === 'Jo Brennan' && t2.name === 'Vic Example', `${t1.name} / ${t2.name}`);
check('address list: council from a .gov.uk address', t1.council === 'Hounslow' && t2.council === 'Haringey', `${t1.council} / ${t2.council}`);
check('a team mailbox for properties is a procurement mailbox, with no made-up name', t3.route === 'procurement_mailbox' && t3.name === null && t3.council === 'Islington', show(t3));
check('a general team inbox stays a housing officer route, with a note', t4.route === 'housing_officer' && t4.notes.some((n) => /team mailbox/.test(n)), show(t4));
check('mailbox kinds', mailboxKind('lettings@brent.gov.uk', null) === 'procurement_mailbox' && mailboxKind('jo.brennan@brent.gov.uk', null) === null
  && mailboxKind('housing.needs@brent.gov.uk', 'Housing Needs') === 'team' && mailboxKind('a.b@brent.gov.uk', 'Jo Brennan') === null);

// signatures, one after another
const sigs = readOfficerPaste([
  'Kind regards,', '', 'Jo Brennan', 'Senior Housing Officer', 'Housing Needs Service', 'London Borough of Hounslow', 'Civic Centre, Lampton Road, Hounslow TW3 4DN',
  'T: 020 8583 2000 | M: 07700 900123', 'E: jo.brennan@hounslow.gov.uk', 'www.hounslow.gov.uk', '',
  'KIM TRIAL', 'Temporary Accommodation Officer', 'Hillingdon Council', 'Email: kim.trial@hillingdon.gov.uk', 'Direct line: 01895 250000',
].join('\n'), []);
const [s1, s2] = sigs.officers;
check('signatures: two officers', sigs.officers.length === 2, show(sigs.officers));
check('signature: name, title, council, phone and email; the address and website ignored',
  s1.name === 'Jo Brennan' && s1.title === 'Senior Housing Officer' && s1.council === 'Hounslow' && s1.phone === '020 8583 2000' && s1.email === 'jo.brennan@hounslow.gov.uk', show(s1));
check('signature: a name in capitals is tidied', s2.name === 'Kim Trial' && s2.title === 'Temporary Accommodation Officer' && s2.council === 'Hillingdon' && s2.phone === '01895 250000', show(s2));

const hill = readOfficerPaste('Kim Trial\nHillingdon Council\nkim.trial@gmail.com', []);
check('a council line is read, not mistaken for a greeting ("Hi...")', hill.officers[0]?.council === 'Hillingdon', show(hill.officers));

// two lines each, no gaps; and one a line
const pairs = readOfficerPaste('Jo Brennan\njo.brennan@hounslow.gov.uk\nAnn Smith\nann.smith@croydon.gov.uk', []);
check('name then email, no blank lines: two officers', pairs.officers.length === 2 && pairs.officers[1].name === 'Ann Smith' && pairs.officers[1].email === 'ann.smith@croydon.gov.uk', show(pairs.officers));
const lines = readOfficerPaste('Jo Brennan - Hounslow - jo.brennan@hounslow.gov.uk - 020 8583 2000\nAnn Smith, Croydon Council, ann.smith@croydon.gov.uk', []);
check('one officer a line, with dashes or commas', lines.officers.length === 2 && lines.officers[0].name === 'Jo Brennan' && lines.officers[0].phone === '020 8583 2000' && lines.officers[1].council === 'Croydon', show(lines.officers));
const one = readOfficerPaste('Jo Brennan, Harrow Council, jo.b@harrow.gov.uk, 020 8863 5611', []);
check('one line on its own, all of it read', one.officers.length === 1 && one.officers[0].name === 'Jo Brennan' && one.officers[0].council === 'Harrow' && one.officers[0].phone === '020 8863 5611', show(one.officers));

// names from addresses, duplicates, problems
const bare = readOfficerPaste('jo.brennan@hounslow.gov.uk\njo.brennan@hounslow.gov.uk\nANN.SMITH@croydon.gov.uk', []);
check('bare addresses: a name read from the address; the same one twice is once', bare.officers.length === 2 && bare.officers[0].name === 'Jo Brennan' && bare.officers[1].email === 'ann.smith@croydon.gov.uk', show(bare.officers));
const odd = readOfficerPaste('Name\tEmail\nJo Brennan\tjo at hounslow\nAnn Smith\tann.smith@gmail.com', []);
check('a broken email: kept by name, with a note, never emailed', odd.officers[0].email === null && odd.officers[0].ok && odd.officers[0].notes.some((n) => /not an email/.test(n)), show(odd.officers[0]));
check('a personal address is flagged', odd.officers[1].notes.includes('Not a council address'), show(odd.officers[1]));
const byPhone = readOfficerPaste('Sam Phone\n020 8000 1111', list);
check('on the list by phone', byPhone.officers[0]?.existing?.id === 'o2', show(byPhone.officers));
const mine = readOfficerPaste('From: Ridwan <ridwan@keellettings.com>\nTo: Jo Brennan <jo.brennan@hounslow.gov.uk>', [], ['Ridwan@keellettings.com']);
check('your own address in a pasted email is left out', mine.officers.length === 1 && mine.officers[0].email === 'jo.brennan@hounslow.gov.uk', show(mine.officers));
check('nothing pasted: nothing read', readOfficerPaste('   \n  ', []).officers.length === 0);
const prose = readOfficerPaste('Hi Ridwan,\nPlease find attached the referral for my client.\nMany thanks', []);
check('a sentence is not a name', prose.officers.length === 0, show(prose.officers));
const borough = readOfficerPaste('Tower Hamlets\nHousing Options Team\nhousingoptions@towerhamlets.gov.uk', []);
check('a borough is not a name', borough.officers[0]?.name !== 'Tower Hamlets' && borough.officers[0]?.council === 'Tower Hamlets', show(borough.officers));

// opting in: never by default (the hard rule)
const rowNo = pastedRow(jo, null);
check('added as active, not opted in', rowNo.status === 'active' && !rowNo.opt_in_source && !rowNo.opted_in_at && rowNo.notes === 'Added from a pasted list');
check('not opted in: mailingList leaves them out', mailingList([{ id: 'n', ...rowNo } as OfficerRecord]).to.length === 0);
const rowYes = pastedRow(jo, { source: 'Asked for listings at the Hounslow forum', at: '2026-10-20T10:00:00.000Z' });
check('opted in when you say they asked: how, and when', rowYes.opt_in_source === 'Asked for listings at the Hounslow forum' && rowYes.opted_in_at === '2026-10-20T10:00:00.000Z');
check('opted in: mailingList includes them', mailingList([{ id: 'y', ...rowYes } as OfficerRecord]).to.length === 1);
check('a procurement mailbox needs no opt-in', mailingList([{ id: 'm', ...pastedRow(t3, null) } as OfficerRecord]).to.length === 1);

// the Bin: a list of officers, not a client
check('looks like officers: two or more council addresses', looksLikeOfficers(to.officers.map((o) => o.email).join('; ')) && !looksLikeOfficers('My name is Sam, my officer is jo@hounslow.gov.uk'));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll officer paste checks pass');

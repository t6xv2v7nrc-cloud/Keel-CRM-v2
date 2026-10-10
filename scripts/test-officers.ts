// Checks for the housing officers box. Run with: npx tsx scripts/test-officers.ts
import { addressLine, bareEmails, emailList, officersFrom, officersText } from '../src/lib/officers';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

let n = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++n}`, full_name: `Client ${n}`, phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null, officer_name: null, officer_email: null, officer_phone: null,
  housing_situation: null, consent: null, tier: null, created_at: `2026-10-0${n}T10:00:00Z`, updated_at: '', ...p,
});

const list = [
  client({ officer_name: 'Tasha Dcruz', officer_email: 'TDcruz@westminster.gov.uk' }),
  client({ officer_name: 'Tasha Dcruz', officer_phone: '020 7641 6000' }),                          // same officer, no email this time
  client({ officer_phone: '+44 20 7641 6000', stage: 'lost' }),                                     // same again, phone only
  client({ officer_name: 'alexandra.k@brent.gov.uk' }),                                             // email typed in the name box
  client({ officer_name: 'Sam Patel', officer_email: 'sam.patel@shelter.org.uk' }),
  client({ officer_name: 'Okonkwo, Chidi', officer_email: 'chidi@gmail.com' }),                     // a comma in the name, no council
  client({}),                                                                                         // no officer
];
const officers = officersFrom(list);
check('each officer once: email, then phone, then name join the same person', officers.length === 4, officers.map((o) => o.key).join(' | '));
const tasha = officers.find((o) => o.name === 'Tasha Dcruz');
check('details are filled in from every referral, the newest first', tasha?.email === 'tdcruz@westminster.gov.uk' && tasha.phone === '+44 20 7641 6000' && tasha.clients.length === 3, JSON.stringify(tasha));
check('active clients are counted apart from lost ones', tasha?.active === 2);
check('where they work comes from the email', tasha?.org === 'Westminster' && officers.find((o) => o.email === 'alexandra.k@brent.gov.uk')?.org === 'Brent');
check('an email typed in the name box is the email, not the name', officers.some((o) => o.email === 'alexandra.k@brent.gov.uk' && o.name === null));
check('sorted by where they work, unplaced last', officers.map((o) => o.org ?? '-').join(',') === 'Brent,Shelter,Westminster,-', officers.map((o) => o.org ?? '-').join(','));

check('to-box format', addressLine({ name: 'Tasha Dcruz', email: 'tdcruz@westminster.gov.uk' }) === 'Tasha Dcruz <tdcruz@westminster.gov.uk>');
check('a name with a comma is quoted', addressLine({ name: 'Okonkwo, Chidi', email: 'chidi@gmail.com' }) === '"Okonkwo, Chidi" <chidi@gmail.com>');
check('no email, nothing to copy', addressLine({ name: 'X', email: null }) === null);
const all = emailList(officers);
check('all emails, semicolons between', all === 'alexandra.k@brent.gov.uk; Sam Patel <sam.patel@shelter.org.uk>; Tasha Dcruz <tdcruz@westminster.gov.uk>; "Okonkwo, Chidi" <chidi@gmail.com>', all);
check('bare emails for a mailto link', bareEmails(officers).length === 4);
const text = officersText(officers);
check('as text: a block per officer', text.split('\n\n').length === 4 && text.includes('Tasha Dcruz\nWestminster\ntdcruz@westminster.gov.uk\n+44 20 7641 6000'), text);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

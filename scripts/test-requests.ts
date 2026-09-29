// Checks for provider requests. Run with: npx tsx scripts/test-requests.ts
import {
  awaitingProviders, benefitWords, followUpFrom, householdWords, needsConsent, propertyProblems, providerFor, providerNumber,
  requestMessage, ruleProblems, rulesSummary,
} from '../src/lib/requests';
import { waLink } from '../src/lib/whatsapp';
import type { Applicant, Provider, ProviderRequest } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

let n = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++n}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null,
  referring_borough: null, source: 'website', referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null,
  notes: null, on_uc: null, pip: null, lcwra: null, council_registered: null, work_status: null, household_type: null, urgency: null,
  council: null, officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null, tier: null,
  created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});
const provider = (p: Partial<Provider>): Provider => ({
  id: 'pr1', name: 'Zubair Properties', contact_first_name: 'Zubair', company: null, tag: 'ZUB', whatsapp: '447700900123', email: null,
  rules: {}, fee_terms: null, notes: null, active: true, created_at: '', updated_at: '', ...p,
});

const charles = client({ full_name: 'Charles Okoro', phone: '07911 123456', on_uc: true, household_type: 'single', council: 'Brent',
  notes: 'Has epilepsy and anxiety', housing_situation: 'sofa surfing' });
const amira = client({ full_name: 'Amira Hassan', pip: true, on_uc: true, household_type: 'couple', council: 'Barnet' });
const zub = provider({ rules: { benefits_required: ['PIP', 'LCWRA'], household_allowed: ['Single'], boroughs: ['Brent', 'Barnet'], max_rent: 1300 } });

// Rules
check('rule warning: "ZUB needs PIP or LCWRA. Charles has UC only"', ruleProblems(zub, charles)[0] === 'ZUB needs PIP or LCWRA. Charles has UC only', ruleProblems(zub, charles).join(' | '));
check('household rule', ruleProblems(zub, amira).includes('ZUB takes singles only. Amira is a couple'), ruleProblems(zub, amira).join(' | '));
check('a client who meets every rule has no warnings', ruleProblems(zub, client({ full_name: 'Sam Lee', lcwra: true, household_type: 'single', council: 'Barnet' })).length === 0);
check('borough rule', ruleProblems(provider({ rules: { boroughs: ['Enfield'] } }), charles)[0] === 'ZUB takes clients from Enfield only. Charles is with Brent');
check('max rent is a property warning', propertyProblems(zub, { rent_pcm: 1436 })[0] === "Rent £1,436 is over ZUB's max of £1,300");
check('rules read as a summary', rulesSummary(zub.rules) === 'PIP or LCWRA · singles · max £1,300 · Brent or Barnet', rulesSummary(zub.rules));
check('full-time work counts as a benefit rule', ruleProblems(provider({ rules: { benefits_required: ['PIP', 'Full-time'] } }), client({ full_name: 'Jo', work_status: 'full_time' })).length === 0);

// Providers
check('a property finds its provider by source tag, any case', providerFor({ source_tag: ' zub ' }, [zub])?.id === 'pr1');
check('provider numbers are stored as digits', providerNumber('07700 900123') === '447700900123' && providerNumber('+44 7700 900123') === '447700900123');

// Messages
const property = { address_line: 'Broadfield Close, London NW2 6NR', rent_pcm: 1436, rent_text: '£1,436 pcm' };
const slots = [new Date(2026, 8, 30, 14, 0).toISOString(), new Date(2026, 9, 1, 11, 30).toISOString()];
const one = requestMessage({ type: 'viewing', provider: zub, property, clients: [charles], slots, myName: 'Ridwan' });
check('viewing message reads right', one === 'Salam Zubair, can I book a viewing at Broadfield Close, London NW2 6NR?\nClient: Charles, single, UC\nAvailable: Wed 30 Sep, 2pm or Thu 1 Oct, 11:30am\nThanks, Ridwan, Keel Lettings', JSON.stringify(one));
const two = requestMessage({ type: 'viewing', provider: zub, property, clients: [charles, amira], slots, myName: 'Ridwan' });
check('several clients: one message, one line each', two.split('\n').filter((l) => l.startsWith('Client:')).length === 2 && two.includes('Client: Amira, couple, UC and PIP'), JSON.stringify(two));
check('never the surname, phone or medical notes', ![two, one].some((m) => /Okoro|Hassan|07911|911 123|epilepsy|anxiety|sofa/i.test(m)));
check('availability check leaves out names', !requestMessage({ type: 'availability', provider: zub, property, clients: [charles], myName: 'Ridwan' }).includes('Charles'));
check('no clients drops the client line', !requestMessage({ type: 'availability', provider: zub, property, clients: [], myName: 'R' }).includes('I have a client'));
check('words for a family', householdWords(client({ full_name: 'F', household_type: 'family', children: 2 })) === 'family with 2 children');
check('words for benefits and work', benefitWords(client({ full_name: 'W', on_uc: true, work_status: 'part_time' })) === 'UC and working part time');
check('details need consent, availability does not', needsConsent('details') && !needsConsent('availability') && !needsConsent('viewing'));

// wa.me encoding: £ and new lines
const link = waLink('447700900123', 'Rent £1,436 pcm\nLine two');
check('£ is encoded', link.includes('%C2%A31%2C436'), link);
check('new lines are encoded as %0A', link.includes('pcm%0ALine%20two'), link);
check('link goes to the provider number', link.startsWith('https://wa.me/447700900123?text='));
check('the whole message survives the round trip', decodeURIComponent(waLink('447700900123', two).split('?text=')[1]) === two);

// Following up after 24 hours
const req = (id: string, sentHoursAgo: number, status: ProviderRequest['status'] = 'sent'): ProviderRequest => {
  const sent = new Date(Date.now() - sentHoursAgo * 3_600_000);
  return { id, provider_id: 'pr1', property_id: null, property_address: 'x', client_ids: [], type: 'viewing', message: '', slots: [], status,
    sent_at: sent.toISOString(), follow_up_at: followUpFrom(sent).toISOString(), outcome_note: null, override_reason: null, created_at: '', updated_at: '' };
};
const list = awaitingProviders([req('fresh', 1), req('old', 25), req('older', 49), req('done', 30, 'confirmed')]);
check('only open requests are listed', list.length === 3 && !list.some((x) => x.request.id === 'done'));
check('a request sent 25 hours ago is due a chase', list.find((x) => x.request.id === 'old')?.overdue === true);
check('one sent an hour ago is not yet', list.find((x) => x.request.id === 'fresh')?.overdue === false);
check('overdue first, oldest first', list.map((x) => x.request.id).join(',') === 'older,old,fresh', list.map((x) => x.request.id).join(','));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

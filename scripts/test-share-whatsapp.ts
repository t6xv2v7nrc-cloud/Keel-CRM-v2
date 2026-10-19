// Checks for the WhatsApp shares: matches to the referring officer, the Mailer on WhatsApp, a client recommending
// Keel, and a client to a landlord. Run with: npx tsx scripts/test-share-whatsapp.ts
import {
  alertWhatsApp, digestWhatsApp, landlordShareBlocked, landlordShareText, officerMatchesText, officerWhatsApp, recommendText, whatsappRecipients,
} from '../src/lib/shareWhatsApp';
import { matchesForApplicant } from '../src/lib/matchRules';
import { alertSubject, digestSubject, sendables } from '../src/lib/mailer';
import { rateFor } from '../src/lib/lha';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { AppSettings } from '../src/lib/settings';
import type { OfficerRecord } from '../src/lib/councils';
import type { Applicant, Property, Provider } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const today = '2026-10-18';
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });
const nwl = rateFor('North West London', 1)!;

const client = (p: Partial<Applicant>): Applicant => ({
  id: 'a1', full_name: 'Amina Yusuf Khan', phone: '07700 900123', email: 'amina@example.com', date_of_birth: '1980-01-01', adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'officer', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: 'I want a 1 bed in Harrow. Asthma.', on_uc: true, pip: false, lcwra: true,
  council_registered: true, work_status: 'not_working', household_type: 'single', urgency: null, council: 'Harrow',
  officer_name: 'Jo Brennan', officer_email: 'jo@harrow.example', officer_phone: '07700 900456', housing_situation: null, consent: true,
  tier: null, created_at: '2026-10-01', updated_at: '2026-10-01', postcode_area: 'HA', age_band: '35_plus', benefit_cap: 'not_capped',
  share_with_landlords: true, ...p,
} as Applicant);
let n = 0;
const prop = (p: Partial<Property>): Property => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`, address_line: `Flat ${n}, 1 Station Road, Harrow HA1 2AA`, postcode: 'HA1 2AA', borough: 'Harrow', property_type: '1 bed',
  rent_pcm: nwl - 50, lha_rate_pcm: null, landlord_id: null, status: 'void', available_from: null, notes: null, bedrooms: 1, bills: null, furnished: null, rent_text: null,
  area: null, source_tag: null, lha_area: null, provider_id: 'wm', created_at: '', updated_at: '', accommodation_type: 'self_contained', bills_included: [], floor: 0, lift: false,
  suitable_for: [], prs_landlord_id: null, prs_property_id: null, photo_urls: ['https://photos.example/1'],
  ...p,
} as Property);
const officer = (p: Partial<OfficerRecord>): OfficerRecord => ({ id: `o${++n}`, name: 'Jo Brennan', email: 'jo@harrow.example', phone: '07700 900456', status: 'active', ...p });

// to the officer who referred them
const amina = client({});
check('the officer\'s mobile on the client is used', officerWhatsApp(amina, []).number === '447700900456' && officerWhatsApp(amina, []).blocked === null);
check('else the mobile on the officer list', officerWhatsApp({ ...amina, officer_phone: null }, [officer({ phone: '07700 900789' })]).number === '447700900789');
const left = officerWhatsApp(amina, [officer({ status: 'left' })]);
check('an officer who left: never sent to', left.blocked !== null && /has left/.test(left.blocked) && left.number === null, JSON.stringify(left));
check('no number anywhere: WhatsApp asks who', officerWhatsApp({ ...amina, officer_phone: null }, []).number === null && /No mobile number/.test(officerWhatsApp({ ...amina, officer_phone: null }, []).note ?? ''));

const flat = prop({});
const items = matchesForApplicant(amina, [flat], { today });
check('the client has a match to send', items.length === 1, String(items.length));
const toOfficer = officerMatchesText(amina, items, 'Ridwan', today);
check('to the officer: their first name and the client\'s full name', toOfficer.startsWith('Hi Jo,') && toOfficer.includes('For Amina Yusuf Khan (single), we have a property that fits:'), toOfficer);
check('says the LHA the client is paid there, and how far under', /Their 1 bed LHA in North West London is £[\d,]+(\.\d\d)?: £50(\.00)? under the LHA/.test(toOfficer), toOfficer);
check('why it fits, photos and a question', /Asked for Harrow/.test(toOfficer) && toOfficer.includes('Photos: https://photos.example/1') && toOfficer.includes('Shall I book a viewing?'));
check('never the client\'s phone, email, health or any incentive', !/07700 900123|amina@example|Asthma|incentive/i.test(toOfficer));
const two = officerMatchesText(amina, [...items, ...items], null, today);
check('several are numbered and signed by Keel', two.includes('*1. Flat') && two.includes('*2. Flat') && two.includes('Shall I book viewings?') && two.trim().endsWith('Keel Lettings'));

// the Mailer on WhatsApp
const s = sendables([flat, prop({ rent_pcm: nwl + 80 })], today);
const alert = alertWhatsApp(s[0], alertSubject(s[0], today), { greeting: 'Jo Brennan', myName: 'Ridwan', today });
check('alert: subject in bold, greeting, the address, a way to stop', alert.startsWith('*[Harrow] |') && alert.includes('Hi Jo,') && alert.includes(`*${flat.address_line}*`) && /Reply STOP/.test(alert), alert);
check('alert: never an incentive', !/incentive/i.test(alert));
const overAlert = alertWhatsApp(s[1], alertSubject(s[1], today), { today });
check('over LHA: says how far over', overAlert.includes('£80 over the LHA'), overAlert);
const digest = digestWhatsApp('Harrow', s, digestSubject('Harrow', s.length, today, false), { today });
check('digest: each property numbered', digest.includes('*1. ') && digest.includes('*2. ') && digest.includes('in and around Harrow'), digest);

const list = {
  to: [{ officer: officer({ name: 'Ann' }), address: 'ann@x' }, { officer: officer({ name: 'Bo', send_to_mailbox: 'team@x' }), address: 'team@x' }, { officer: officer({ name: 'Cy', phone: null }), address: 'cy@x' }],
  left: [{ officer: officer({ name: 'Di', email: null }), why: 'No email' }, { officer: officer({ name: 'Ed' }), why: 'Opted out' }],
};
const wa = whatsappRecipients(list);
check('WhatsApp goes to the same officers, with a mobile', wa.to.map((t) => t.officer.name).join() === 'Ann,Di', wa.to.map((t) => t.officer.name).join());
check('a team mailbox, or no mobile: left out with why', wa.left.find((l) => l.officer.name === 'Bo')?.why === 'Uses the team mailbox' && wa.left.find((l) => l.officer.name === 'Cy')?.why === 'No mobile number');
check('anyone the email rules leave out stays out', !wa.to.some((t) => t.officer.name === 'Ed') && !wa.left.some((l) => l.officer.name === 'Ed'));

// a client recommending Keel
const withPhone: AppSettings = { ...DEFAULT_SETTINGS, invoice: { ...DEFAULT_SETTINGS.invoice, phone: '07700 900111', email: 'hello@keel.example' } };
const rec = recommendText(amina, 'Ridwan', withPhone);
check('recommend: their first name, Keel\'s WhatsApp link, the website, who sent it', rec.startsWith('Hi Amina,') && rec.includes('Message us on WhatsApp: https://wa.me/447700900111') && rec.includes('keellettings.com') && rec.includes('Ridwan, Keel Lettings'), rec);
check('recommend: never council incentives', !/incentive/i.test(rec) && !/incentive/i.test(DEFAULT_SETTINGS.whatsappRecommend));
const noPhone = recommendText(amina, null, { ...DEFAULT_SETTINGS, invoice: { ...DEFAULT_SETTINGS.invoice, phone: '', email: 'hello@keel.example' } });
check('no phone on invoices: by email instead, and no stray comma for a missing name', noPhone.includes('Message us by email: hello@keel.example') && !noPhone.includes('{') && /\nKeel Lettings$/.test(noPhone), noPhone);
const bare = recommendText(amina, null, { ...DEFAULT_SETTINGS, invoice: { ...DEFAULT_SETTINGS.invoice, phone: '', email: '' } });
check('nothing but the website: said once, no gaps left', bare.includes('Message us through keellettings.com') && (bare.match(/keellettings\.com/g) ?? []).length === 1 && !/\n{3,}/.test(bare), bare);

// a client to a landlord
const provider = { name: 'Watermint', contact_first_name: 'Zubair' } as Pick<Provider, 'name' | 'contact_first_name'>;
const toLandlord = landlordShareText(amina, flat, provider, 'Ridwan');
check('to a landlord: "Salam" and their name, the client\'s first name and household', toLandlord.startsWith('Salam Zubair,') && toLandlord.includes('• Amina, single'), toLandlord);
check('to a landlord: benefits and council', toLandlord.includes('• On ') && toLandlord.includes('Council: Harrow'), toLandlord);
check('to a landlord: never surname, phone, email or health', !/Yusuf|Khan|07700|amina@|Asthma|incentive/i.test(toLandlord), toLandlord);
check('no contact name: the provider\'s name', landlordShareText(amina, flat, { name: 'Watermint', contact_first_name: null }, null).startsWith('Salam Watermint,'));
check('only once they agreed', landlordShareBlocked(amina) === null && /has not agreed/.test(landlordShareBlocked({ ...amina, share_with_landlords: false }) ?? ''));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nAll WhatsApp share checks pass');

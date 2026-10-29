// Checks for the matching brief's rules (Part B) and follow-up (Part C): a 1 bed ask never gets a studio or room,
// floor or lift not known for step-free clients, top-ups, confirmed available, photos, distance to an anchor, women
// only, the landlord's rules, bills, the order of a client's list, the best 1 to 3, the WhatsApp wording, and
// Awaiting reply. Run with: npx tsx scripts/test-matching-brief.ts
import { hiddenWords, hiddenForApplicant, landlordFit, matchesForApplicant, placeOrder, ruledMatch, staleAvailability } from '../src/lib/matchRules';
import type { RuleProperty } from '../src/lib/matchRules';
import { accessOf, bestFew } from '../src/lib/propertyMatch';
import { rateFor } from '../src/lib/lha';
import { billsWords, clientMessage } from '../src/lib/whatsapp';
import { lhaFitOf } from '../src/lib/matchRules';
import { anchorKey, minutesToAnchor, setPointsForTest, travelMins } from '../src/lib/geo';
import { awaitingReply, waitWords } from '../src/lib/followUp';
import { criteriaWords } from '../src/lib/propertyEdit';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings({ ...DEFAULT_SETTINGS, showPossibleMatches: true });
const today = '2026-10-28';
let id = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'Test Client', phone: '07700900111', email: null, date_of_birth: '1980-01-01', adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: 'Harrow please', on_uc: true, pip: false, lcwra: true,
  council_registered: true, work_status: 'not_working', household_type: 'single', urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: true,
  tier: null, created_at: '2026-10-01', updated_at: '2026-10-01', postcode_area: null, age_band: null, benefit_cap: 'not_capped',
  bedrooms_needed: null, max_top_up: null, anchor: null, anchor_postcode: null, max_travel_mins: null, female_only: null, ...p,
});
let pid = 0;
const nwl1 = rateFor('North West London', 1)!;
const property = (p: Partial<RuleProperty>): RuleProperty => ({
  id: `p${++pid}`, address_line: `Flat ${pid}, ${pid} Station Road`, postcode: 'HA1 2AA', area: null, borough: 'Harrow', property_type: '1 bed', bedrooms: 1,
  rent_pcm: Math.floor(nwl1 - 30), rent_text: null, furnished: null, notes: null, lha_area: null, accommodation_type: 'self_contained', suitable_for: [],
  created_at: '2026-10-25T10:00:00Z', ...p,
});

// ── B1: asked for a 1 bed: no studio or room ──
const oneBed = client({ notes: 'Looking for a 1 bed in Harrow' });
const studio = property({ property_type: 'Studio', bedrooms: 0 });
const r1 = ruledMatch(studio, oneBed, { today });
check('B1: a single who asked for a 1 bed is not offered a studio', r1.hidden === 'wants_1bed' && /A studio: they asked for a 1 bed/.test(r1.why ?? ''), JSON.stringify(r1));
check('B1: nor a room', ruledMatch(property({ property_type: 'HMO Room', bedrooms: 0, accommodation_type: 'hmo_room', rent_pcm: Math.floor(nwl1 - 200) }), oneBed, { today }).hidden === 'wants_1bed');
check('B1: a 1 bed is still offered', !!ruledMatch(property({}), oneBed, { today }).match);
check('B1: "studio or 1 bed" still gets the studio', !!ruledMatch(studio, client({ notes: 'studio or 1 bed in Harrow' }), { today }).match);
check('B1: a couple who asked for a 1 bed is not offered a studio', ruledMatch(studio, client({ household_type: 'couple', adults: 2, notes: '1 bed in Harrow for me and my partner' }), { today }).hidden === 'wants_1bed');
check('B1: recorded bedrooms needed counts as the ask', ruledMatch(studio, client({ bedrooms_needed: 1 }), { today }).hidden === 'wants_1bed');

// ── B2: step-free and floor or lift not known ──
const stepFree = client({ notes: 'Harrow, needs ground floor, uses a wheelchair' });
const r2 = ruledMatch(property({ floor: null, lift: null }), stepFree, { today });
check('B2: floor not known: hidden for someone who needs step-free', r2.hidden === 'access_unknown' && /Floor or lift not known/.test(r2.why ?? ''), JSON.stringify(r2));
check('B2: floor 3, lift not known: hidden', ruledMatch(property({ floor: 3, lift: null }), stepFree, { today }).hidden === 'access_unknown');
check('B2: ground floor: offered', !!ruledMatch(property({ floor: 0 }), stepFree, { today }).match);
check('B2: notes saying "step-free" count as known', !!ruledMatch(property({ floor: null, notes: 'Step-free access' }), stepFree, { today }).match);
check('B2: "no lift" in the notes is not a lift', accessOf(property({ floor: 2, notes: 'Second floor, no lift' })) === 'stairs');
check('B2: someone who does not need step-free still sees it', !!ruledMatch(property({ floor: null }), client({}), { today }).match);
check('B2: counted under the list', hiddenWords(hiddenForApplicant(stepFree, [property({ floor: null })], { today })) === '1 floor or lift not known');

// ── B3: top-up ──
const fifty = property({ rent_pcm: Math.ceil(nwl1 + 50) });
check('B3: £50 over with no top-up: hidden', ruledMatch(fifty, client({}), { today }).hidden === 'over_lha');
const topped = ruledMatch(fifty, client({ max_top_up: 200 }), { today }).match;
check('B3: £50 over with a £200 top-up: offered, no red warning', !!topped && !topped.warnings.some((w) => w.tone === 'red'), JSON.stringify(topped?.warnings));
check('B3: the why line says so', !!topped && /over LHA, within their £200 top-up/.test(topped.line), topped?.line);
const tooDear = ruledMatch(property({ rent_pcm: Math.ceil(nwl1 + 300) }), client({ max_top_up: 200 }), { today });
check('B3: over by more than the top-up: hidden, and says it', tooDear.hidden === 'over_lha' && /more than their £200 top-up/.test(tooDear.why ?? ''), tooDear.why ?? '');

// ── B4: confirmed available ──
const old = property({ availability_confirmed_at: '2026-10-10T09:00:00Z' });
const m4 = ruledMatch(old, client({}), { today }).match;
check('B4: confirmed 18 days ago: still offered, with a red check', !!m4 && m4.warnings[0]?.tone === 'red' && m4.warnings[0].words === 'Check still available (last confirmed 18 days ago)', JSON.stringify(m4?.warnings));
check('B4: confirmed 2 days ago: no check', staleAvailability(property({ availability_confirmed_at: '2026-10-26T09:00:00Z' }), today) === null);
check('B4: never confirmed, added 20 days ago: counts from when it was added', /not confirmed since it was added 20 days ago/.test(staleAvailability(property({ availability_confirmed_at: null, created_at: '2026-10-08T09:00:00Z' }), today) ?? ''));
check('B4: before 0031 is run, nothing is said', staleAvailability(property({ created_at: '2026-01-01' }), today) === null);

// ── B5: photos or video ──
const noPhotos = ruledMatch(property({ has_media: false, photo_urls: [] }), client({}), { today }).match;
check('B5: no photos: amber "get them before sending"', !!noPhotos && noPhotos.warnings.some((w) => w.tone === 'amber' && w.words === 'No photos or video: get them before sending'));
check('B5: photo links count as photos', !ruledMatch(property({ photo_urls: ['https://x.example/1'] }), client({}), { today }).match!.warnings.some((w) => /No photos/.test(w.words)));
const withMedia = property({ has_media: true, rent_pcm: Math.floor(nwl1 - 10) });
const withoutMedia = property({ has_media: false, rent_pcm: Math.floor(nwl1 - 200) });
const list5 = matchesForApplicant(client({}), [withoutMedia, withMedia], { today });
check('B5: with photos ranks above without, even with less room under the LHA', list5[0]?.property === withMedia, list5.map((x) => x.property.id).join(','));

// ── B6: anchor and distance ──
setPointsForTest({ HA1: [51.5806, -0.3420], 'HA1 2AA': [51.5806, -0.3420], 'HA2 0AA': [51.5500, -0.3900], 'UB8 1AA': [51.5440, -0.4760], 'N17 6RA': [51.5990, -0.0700] });
const carer = client({ anchor: 'Mum (I care for her)', anchor_postcode: 'HA1 3UJ', max_travel_mins: 30, notes: 'Harrow or Hillingdon' });
check('B6: the anchor is placed by its district only', anchorKey(carer) === 'HA1');
const near = property({ postcode: 'HA2 0AA' });
const far = property({ postcode: 'UB8 1AA', borough: 'Hillingdon' });
const tooFar = ruledMatch(far, carer, { today });
check('B6: a journey of over 30 minutes is hidden as too far', tooFar.hidden === 'too_far' && /About \d+ minutes from mum: they said 30 at most/.test(tooFar.why ?? ''), tooFar.why ?? JSON.stringify(tooFar));
const close = ruledMatch(near, carer, { today }).match;
check('B6: a close one is offered, and the line says how near', !!close && /about \d+ min from mum/.test(close.line), close?.line);
check('B6: a rough journey time: 10 minutes plus 3.5 a kilometre', travelMins(0) === 10 && travelMins(10) === 45);
check('B6: not known until both places are placed', minutesToAnchor(carer, property({ postcode: 'SE1 1AA' })) === null);
const open6 = client({ anchor: 'Northwick Park Hospital', anchor_postcode: 'HA1 3UJ', notes: 'Harrow' });
const nearer = property({ postcode: 'HA1 2AA', rent_pcm: Math.floor(nwl1 - 5) });
const further = property({ postcode: 'HA2 0AA', rent_pcm: Math.floor(nwl1 - 300) });
const list6 = matchesForApplicant(open6, [further, nearer], { today });
check('B6: nearer ranks first when no limit is given', list6[0]?.property === nearer, list6.map((x) => `${x.property.postcode} ${x.match.travel}`).join(', '));

// ── B7: women only ──
const woman = client({ female_only: true });
check('B7: a client who needs women only is not offered an ordinary place', ruledMatch(property({}), woman, { today }).hidden === 'female_only');
check('B7: she is offered a women-only place', !!ruledMatch(property({ female_only: true }), woman, { today }).match);
check('B7: anyone else offered a women-only place is told to check', ruledMatch(property({ female_only: true }), client({}), { today }).match!.warnings.some((w) => w.words === 'Women only: check it suits them'));

// ── B8: the landlord's rules ──
const rules8 = property({ landlord_criteria: { min_age: 25, max_age: 40, benefits: ['uc', 'working'] } });
check('B8: 46 is outside ages 25 to 40: hidden', ruledMatch(rules8, client({}), { today }).hidden === 'landlord_criteria');
check('B8: why says so', /The landlord takes ages 25 to 40: they are 46/.test(ruledMatch(rules8, client({}), { today }).why ?? ''));
check('B8: 30 on UC is within the rules', landlordFit(rules8, client({ date_of_birth: '1996-01-01' })).no === null && !landlordFit(rules8, client({ date_of_birth: '1996-01-01' })).check);
check('B8: only housing benefit, landlord takes UC or working: hidden', landlordFit(property({ landlord_criteria: { benefits: ['uc', 'working'] } }), client({ on_uc: false, lcwra: false, benefit_type: 'HB' })).no !== null);
check('B8: age not known: offered with a check', /check their age/.test(landlordFit(rules8, client({ date_of_birth: null })).check ?? ''));
check('B8: in words', criteriaWords({ min_age: 25, max_age: 40, benefits: ['uc', 'pip'] }) === 'ages 25 to 40, takes UC or PIP' && criteriaWords(null) === 'anyone');

// ── B9: bills ──
check('B9: bills included', billsWords({ bills_status: 'included' }) === 'Bills included');
check('B9: some, with the note', billsWords({ bills_status: 'partial', bills: 'water and council tax' }) === 'Some bills included: water and council tax');
check('B9: not included', billsWords({ bills_status: 'excluded', bills: 'extra' }) === 'Bills not included');
check('B9: before 0036: the list of what is included', billsWords({ bills_included: ['water', 'council_tax'] })?.startsWith('Bills included: water') === true, String(billsWords({ bills_included: ['water', 'council_tax'] })));

// ── B10: the order of a client's list ──
const sc = property({ property_type: '1 bed', rent_pcm: Math.floor(nwl1 - 10), has_media: false });
const ensuite = property({ property_type: 'En-suite Room', bedrooms: 0, accommodation_type: null, notes: 'En-suite room, shared kitchen', rent_pcm: Math.floor(nwl1 - 400), has_media: true });
const roomP = property({ property_type: 'HMO Room', bedrooms: 0, accommodation_type: 'hmo_room', rent_pcm: Math.floor(nwl1 - 500), has_media: true });
const plain = client({ notes: 'Harrow, room or flat' });
const order10 = matchesForApplicant(plain, [roomP, ensuite, sc], { today }).map((x) => x.property);
check('B10: self-contained, then en-suite, then a room', order10[0] === sc && order10[1] === ensuite && order10[2] === roomP, order10.map((p) => p.property_type).join(' > '));
const exempt = property({ notes: 'Exempt accommodation, housing association', rent_pcm: Math.floor(nwl1 - 5) });
const ordinary = property({ rent_pcm: Math.floor(nwl1 - 300) });
const pip = client({ pip: true, lcwra: false });
check('B10: exempt housing association places first for PIP clients', matchesForApplicant(pip, [ordinary, exempt], { today })[0]?.property === exempt);
check('B10: not for others', matchesForApplicant(client({}), [exempt, ordinary], { today })[0]?.property === ordinary);
const more = property({ rent_pcm: Math.floor(nwl1 - 200) }), less = property({ rent_pcm: Math.floor(nwl1 - 20) });
check('B10: most room under the LHA last breaks the tie', matchesForApplicant(client({}), [less, more], { today })[0]?.property === more);
check('B10: the order is kept on the match', JSON.stringify(placeOrder(sc, plain, ['Asked for Harrow'], null, null)) === JSON.stringify([0, 0, 20, 1, 0]), JSON.stringify(placeOrder(sc, plain, ['Asked for Harrow'], null, null)));

// ── B11: the best 1 to 3 ──
const five = Array.from({ length: 6 }, () => ({ s: 'strong' as const }));
check('B11: a client page suggests at most 3', bestFew(five, (x) => x.s, 3).length === 3);
check('B11: a property still shows up to 5 strong', bestFew(five, (x) => x.s).length === 5);

// ── B12: the WhatsApp wording ──
const pB = { ...property({ property_type: '1-Bed Flat', floor: 2, lift: true, bills_status: 'included' as const, media_url: 'https://photos.example/a', furnished: 'Furnished' }), available_from: '2026-11-03' };
const msg = clientMessage('Amina Yusuf', [pB], 'Ridwan', '{properties}', (p) => lhaFitOf(p, client({})));
check('B12: rent against their LHA in a sentence', /Rent £[\d,]+ pcm\. That is £30 under your 1 bed LHA here, £[\d,]+\./.test(msg), msg);
check('B12: kitchen, floor and lift, bills, furnished', /Own kitchen\. Floor 2, lift\. Bills included\. Furnished\./.test(msg), msg);
check('B12: when it is free and the photo link', /Free from 3 Nov( 2026)?\./.test(msg) && /Photos: https:\/\/photos\.example\/a/.test(msg), msg);
const msgTop = clientMessage('Amina Yusuf', [fifty], null, '{properties}', (p) => lhaFitOf(p, client({ max_top_up: 100 })));
check('B12: over, within their top-up, said plainly', /over your 1 bed LHA here, £[\d,]+, within the £100 you can top up\./.test(msgTop), msgTop);
const guessed = clientMessage('A B', [property({ property_type: 'Studio', bedrooms: 0, accommodation_type: null })], null, '{properties}');
check('B12: a guessed kind of place is never printed', !/kitchen/i.test(guessed), guessed);

// ── C1: Awaiting reply ──
const now = new Date('2026-10-28T12:00:00Z');
const waiting = client({ full_name: 'Waiting Wanda', last_inbound_at: '2026-10-27T06:00:00Z', last_contact_at: '2026-10-20T10:00:00Z' });
const fresh = client({ full_name: 'Fresh Fred', last_inbound_at: '2026-10-28T09:00:00Z', last_contact_at: null });
const answered = client({ full_name: 'Answered Ann', last_inbound_at: '2026-10-27T06:00:00Z', last_contact_at: '2026-10-27T08:00:00Z' });
const stale = client({ full_name: 'Old Olive', last_inbound_at: '2026-09-01T09:00:00Z', last_contact_at: null });
const housed = client({ full_name: 'Housed Hal', stage: 'placed', last_inbound_at: '2026-10-27T06:00:00Z' });
const noted = client({ full_name: 'Noted Nia', last_inbound_at: '2026-10-27T06:00:00Z' });
const aw = awaitingReply([waiting, fresh, answered, stale, housed, noted], (id) => (id === noted.id ? '2026-10-27T07:00:00Z' : null), now);
check('C1: waiting, not answered: listed; answered, old, housed or replied by a note: not', aw.map((w) => w.applicant.full_name).join(',') === 'Waiting Wanda,Fresh Fred', aw.map((w) => w.applicant.full_name).join(','));
check('C1: over 24 hours is red', aw[0].late && aw[0].hours === 30 && !aw[1].late);
check('C1: in words', waitWords(aw[0]) === 'Waiting 30 hours' && waitWords(aw[1]) === 'Messaged 3 hours ago', `${waitWords(aw[0])} / ${waitWords(aw[1])}`);
const before = { ...client({ full_name: 'New Nora', created_at: '2026-10-26T09:00:00Z' }) } as Applicant;
delete (before as Partial<Applicant>).last_inbound_at;
check('C1: before 0037, a new client who has had no contact counts from when they got in touch', awaitingReply([before], () => null, now)[0]?.late === true);

setActiveSettings(DEFAULT_SETTINGS);
console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

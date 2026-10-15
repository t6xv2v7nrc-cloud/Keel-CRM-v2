// Checks for a property's LHA gap, kind, papers and flags (Step 2). Run with: npx tsx scripts/test-property-checks.ts
import { accommodationOf, checksFor, floorWords, inGreaterLondon, lhaLine, papersFor, sendBlockers } from '../src/lib/propertyChecks';
import { changedFields, changeWords, hasCheckFields } from '../src/lib/propertyEdit';
import type { EditableProperty } from '../src/lib/propertyEdit';
import { LHA_RATES } from '../src/data/lha-rates';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Property } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);
const today = '2026-10-15';
// a property with every 0019 field recorded and in date
const P = (p: Partial<Property>): Property => ({
  id: 'p', address_line: '45 Ballards Lane', postcode: 'N12 0DA', borough: 'Barnet', property_type: 'Studio', rent_pcm: 1100, lha_rate_pcm: null,
  landlord_id: null, status: 'void', available_from: null, notes: null, bedrooms: 0, bills: null, furnished: null, rent_text: null, area: null,
  source_tag: null, lha_area: null, provider_id: null, created_at: '', updated_at: '',
  accommodation_type: 'self_contained', bills_included: [], floor: 1, lift: false, suitable_for: ['uc_35_plus'], gas_expiry: '2027-03-01', no_gas: false,
  eicr_expiry: '2029-01-01', epc_rating: 'C', epc_sap: 70, licence_needed: false, licence_no: null, licence_expiry: null, alarms_checked: '2026-09-01',
  photo_count: 5, prs_landlord_id: null, prs_property_id: null, ...p,
});
const oneBed = LHA_RATES['Outer North London'][1];
const sar = LHA_RATES['Outer North London'][0];

// LHA rate and gap
const ok = checksFor(P({}), today);
check('a studio in N12 is judged on the 1 bed rate in Outer North London', ok.lha?.rate === oneBed && ok.lha?.area.brma === 'Outer North London');
check('gap is rent minus the rate', ok.gap === Math.round((1100 - oneBed) * 100) / 100, String(ok.gap));
check('a compliant, in-date property under LHA has no flags', ok.flags.length === 0 && sendBlockers(ok).length === 0, JSON.stringify(ok.flags));
check('the LHA line names the BRMA, the rate and the gap', lhaLine(ok) === `Outer North London · 1 bed LHA £${oneBed.toLocaleString('en-GB')} · £${Math.abs(1100 - oneBed)} under`, String(lhaLine(ok)));
const over = checksFor(P({ rent_pcm: oneBed + 36 }), today);
check('over LHA is red, in pounds', over.flags[0]?.tone === 'red' && over.flags[0].words === '£36 over LHA', JSON.stringify(over.flags));
check('over LHA stops it being sent', sendBlockers(over).some((b) => b.startsWith('£36 over LHA')));
check('exactly at LHA is not red', checksFor(P({ rent_pcm: oneBed }), today).flags.length === 0);
check('a "1-Bed LHA" rent is at LHA, not red', checksFor(P({ rent_pcm: null, rent_text: '1-Bed LHA' }), today).flags.length === 0);

// Shared units: the shared-rate gap
const room = checksFor(P({ property_type: 'En-suite Room', accommodation_type: 'shared_kitchen', rent_pcm: 1000, suitable_for: ['uc_35_plus'] }), today);
check('a shared-kitchen unit shows the shared rate and its gap', room.sar === sar && room.sarGap === Math.round((1000 - sar) * 100) / 100, JSON.stringify({ sar: room.sar, gap: room.sarGap }));
check('a self-contained flat has no shared-rate gap', ok.sar === null && ok.sarGap === null);
const noSuits = checksFor(P({ property_type: 'En-suite Room', accommodation_type: 'shared_kitchen', rent_pcm: 1000, suitable_for: [] }), today);
check('shared kitchen with nobody marked as suited is amber', noSuits.flags.some((f) => f.tone === 'amber' && f.key === 'suits_not_set'));
check('amber does not stop a send', sendBlockers(noSuits).length === 0);

// Greater London
check('N12 is in Greater London', inGreaterLondon(P({})) === true);
check('Slough is not', inGreaterLondon(P({ postcode: 'SL1 2AB', borough: null })) === false);
check('TW18 (Spelthorne) is not', inGreaterLondon(P({ postcode: 'TW18 1AA', borough: null })) === false);
check('TW3 (Hounslow) is', inGreaterLondon(P({ postcode: 'TW3 1AA', borough: null })) === true);
check('no postcode or borough: cannot say', inGreaterLondon(P({ postcode: null, borough: null, address_line: 'Somewhere' })) === null);
const slough = checksFor(P({ postcode: 'SL1 2AB', borough: null }), today);
check('outside Greater London is amber', slough.flags.some((f) => f.key === 'outside_london' && f.tone === 'amber'));

// Papers
check('all present and in date', papersFor(P({}), today).complete);
const gasGone = papersFor(P({ gas_expiry: '2026-10-01' }), today);
check('an expired gas certificate fails, with the date', !gasGone.complete && gasGone.failing[0] === 'gas safety certificate ran out 1 Oct 2026', JSON.stringify(gasGone.failing));
check('no gas supply needs no gas certificate', papersFor(P({ gas_expiry: null, no_gas: true }), today).complete);
check('a missing EICR is missing', papersFor(P({ eicr_expiry: null }), today).missing.includes('electrical report (EICR)'));
check('EPC F is below the legal minimum', papersFor(P({ epc_rating: 'F' }), today).failing.some((x) => /EPC F, below the legal minimum E/.test(x)));
check('an HMO room needs a licence', papersFor(P({ accommodation_type: 'hmo_room' }), today).missing.join() === 'licence number,licence');
check('a licence number needs its end date', papersFor(P({ licence_no: 'HMO/123' }), today).missing.join() === 'licence');
check('no licence needed for a flat marked so', papersFor(P({ licence_needed: false }), today).complete);
check('alarms checked over a year ago fail', papersFor(P({ alarms_checked: '2025-10-14' }), today).failing.some((x) => /alarms last checked/.test(x)) && papersFor(P({ alarms_checked: '2025-10-15' }), today).complete);
const thin = checksFor(P({ photo_count: 2, eicr_expiry: null }), today);
const grey = thin.flags.find((f) => f.tone === 'grey');
check('missing papers or under 3 photos: grey "not ready", saying why', grey?.words === 'Not ready to send' && grey.detail === 'no electrical report (EICR), 2 of 3 photos', grey?.detail);
check('not ready stops a send', sendBlockers(thin).length === 1);
check('no photos recorded counts as none', checksFor(P({ photo_count: null }), today).flags.some((f) => f.key === 'not_ready'));
// before 0019: nothing recorded, so no grey flag on every card, but it still cannot be sent
const before = checksFor({ ...P({}), accommodation_type: undefined, gas_expiry: undefined, eicr_expiry: undefined, photo_count: undefined, suitable_for: undefined } as Property, today);
check('before 0019: papers unknown, no grey flag', !before.papers.known && !before.flags.some((f) => f.tone === 'grey'));
check('before 0019: still not sendable', sendBlockers(before).includes('Safety papers not recorded yet'));

// Kind of place, from the type when not set
check('a room is an HMO room', accommodationOf({ property_type: 'Room', notes: null })?.type === 'hmo_room');
check('an en-suite room has a shared kitchen', accommodationOf({ property_type: 'En-suite Room', notes: null })?.type === 'shared_kitchen');
check('a studio is self-contained unless the notes say shared kitchen', accommodationOf({ property_type: 'Studio', notes: null })?.type === 'self_contained'
  && accommodationOf({ property_type: 'Studio', notes: 'Shared kitchen on the first floor' })?.type === 'shared_kitchen');
check('a 2 bed flat is self-contained, and marked as read from the type', JSON.stringify(accommodationOf({ property_type: '2-Bed Flat', notes: null })) === '{"type":"self_contained","estimated":true}');
check('what is set wins', accommodationOf({ property_type: 'Room', notes: null, accommodation_type: 'shared_kitchen' })?.estimated === false);

check('floor words', floorWords(0, false) === 'Ground floor, no lift' && floorWords(-1, null) === 'Basement' && floorWords(3, true) === 'Floor 3, lift' && floorWords(null, null) === null);

// Editing: the new fields only go when the database has them, and the history says what changed
const base = P({});
const edited: EditableProperty = { ...base, suitable_for: ['uc_35_plus', 'couples'], gas_expiry: '2027-06-01', bills_included: ['water'] };
const patch = changedFields(base, edited);
check('only changed fields are saved; lists compare by what is in them', JSON.stringify(Object.keys(patch).sort()) === '["bills_included","gas_expiry","suitable_for"]', JSON.stringify(patch));
check('same list in another order is no change', Object.keys(changedFields(P({ suitable_for: ['couples', 'uc_35_plus'] }), { ...base, suitable_for: ['uc_35_plus', 'couples'] })).length === 0);
check('history in words', changeWords(base, patch) === 'Bills included none → Water; Suits UC 35 plus → UC 35 plus, Couples; Gas certificate 1 Mar 2027 → 1 Jun 2027', changeWords(base, patch));
const old = { ...base } as Partial<Property>;
for (const k of ['accommodation_type', 'gas_expiry', 'eicr_expiry'] as const) delete old[k];
check('a property without the 0019 columns cannot take them; one only on this device can', !hasCheckFields(old) && hasCheckFields(old, true) && hasCheckFields(base));
check('leaving the new fields out of an edit touches nothing', Object.keys(changedFields(base, { address_line: base.address_line, postcode: base.postcode, area: null, borough: base.borough,
  property_type: base.property_type, bedrooms: base.bedrooms, rent_pcm: base.rent_pcm, rent_text: null, bills: null, furnished: null, available_from: null, notes: null })).length === 0);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

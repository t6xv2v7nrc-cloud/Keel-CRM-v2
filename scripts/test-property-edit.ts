// Checks for editing a saved property. Run with: npx tsx scripts/test-property-edit.ts
import { bedsOfType, changedFields, changeWords, rentFrom, rentWords } from '../src/lib/propertyEdit';
import type { EditableProperty } from '../src/lib/propertyEdit';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

check('"£950 pcm" is £950 a month', rentFrom('£950 pcm').rent_pcm === 950);
check('"£220 pw" is £953 a month', rentFrom('£220 pw').rent_pcm === 953);
check('"£1,250" is £1,250 a month', rentFrom('£1,250').rent_pcm === 1250);
check('"1-Bed LHA" has no figure but keeps the words', rentFrom('1-Bed LHA').rent_pcm === null && rentFrom('1-Bed LHA').rent_text === '1-Bed LHA');
check('an empty rent clears it', rentFrom('  ').rent_text === null && rentFrom('').rent_pcm === null);
check('a saved rent with no words shows as £ pcm', rentWords({ rent_text: null, rent_pcm: 1100 }) === '£1,100 pcm' && rentFrom(rentWords({ rent_text: null, rent_pcm: 1100 })).rent_pcm === 1100);
check('types give bedrooms: 2-Bed Flat, Studio, En-suite Room', bedsOfType('2-Bed Flat') === 2 && bedsOfType('Studio') === 0 && bedsOfType('En-suite Room') === 0);
check('an unknown type gives no bedrooms', bedsOfType('Maisonette') === null);

const before: EditableProperty = {
  address_line: '12 Elm Road', postcode: 'NW2 6NR', area: null, borough: 'Brent', property_type: 'Studio', bedrooms: 0,
  rent_pcm: 1000, rent_text: '£1,000 pcm', bills: null, furnished: null, available_from: null, notes: null,
};
const after: EditableProperty = { ...before, property_type: 'En-suite Studio', rent_pcm: 1100, rent_text: '£1,100 pcm', notes: 'Shared kitchen' };
const patch = changedFields(before, after);
check('only what changed is saved', JSON.stringify(Object.keys(patch).sort()) === JSON.stringify(['notes', 'property_type', 'rent_pcm', 'rent_text']), JSON.stringify(patch));
check('nothing changed, nothing saved', Object.keys(changedFields(before, { ...before })).length === 0);
const words = changeWords(before, patch);
check('the history says what changed, once each', words === 'Type Studio → En-suite Studio; Rent £1,000 pcm → £1,100 pcm; Notes changed', words);
check('no em dashes in the history', !words.includes('—'));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

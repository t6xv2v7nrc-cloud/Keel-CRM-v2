// Checks for WhatsApp links and the "best few" list. Run with: npx tsx scripts/test-share.ts
import { clientMessage, propertiesText, waLink, waNumber } from '../src/lib/whatsapp';
import { bestFew, brief } from '../src/lib/propertyMatch';
import type { Strength } from '../src/lib/propertyMatch';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

// Numbers
check('UK mobile becomes 44…', waNumber('07700 900123') === '447700900123');
check('+44 number keeps its digits', waNumber('+447988430041') === '447988430041');
check('an overseas number works', waNumber('+353 85 123 4567') === '353851234567');
check('no number, no link number', waNumber(null) === null && waNumber('n/a') === null);

// Messages
const studio = { address_line: 'Broadfield Close, London NW2 6NR', postcode: 'NW2 6NR', borough: 'Brent', property_type: 'En-suite Studio',
  bedrooms: 0, rent_pcm: 1436, rent_text: '£1,436 pcm', bills: 'Exc. Council Tax & Electricity' };
const room = { address_line: 'Room 3, 14 Bruce Grove, N17 6RA', postcode: 'N17 6RA', borough: 'Haringey', property_type: 'En-suite Room',
  bedrooms: 0, rent_pcm: null, rent_text: '1-Bed LHA' };
check('a property is bold title then rent and bills', propertiesText([studio]) === '*En-suite Studio, Broadfield Close, London NW2 6NR*\n£1,436 pcm · Bills: Exc. Council Tax & Electricity');
check('an LHA rent is given in pounds too', propertiesText([room]).includes('£1,150 pcm (1-Bed LHA)'), propertiesText([room]));
const one = clientMessage('Anna Mecani', [studio], 'Ridwan', 'Hi {first name}, {a property}:\n\n{properties}\n\n{my name}');
check('placeholders filled for one property', one.startsWith('Hi Anna, a property:') && one.endsWith('Ridwan'), one);
const two = clientMessage('Anna Mecani', [studio, room], null, 'Hi {first name}, {a property}:\n\n{properties}\n\n{my name}');
check('several properties are numbered and counted', two.includes('2 properties') && two.includes('1. *') && two.includes('2. *'), two);
check('a missing sender name leaves no gap', !two.endsWith('\n'), JSON.stringify(two.slice(-10)));
check('link to a number', waLink('447700900123', 'Hi there').startsWith('https://wa.me/447700900123?text=Hi%20there'));
check('link without a number lets you choose', waLink(null, 'x') === 'https://wa.me/?text=x');

// Best few
const L = (s: string) => s.split('').map((c) => ({ s: ({ S: 'strong', G: 'good', P: 'possible' } as Record<string, Strength>)[c] }));
const few = (s: string) => bestFew(L(s), (x) => x.s).map((x) => x.s[0].toUpperCase()).join('');
check('1 strong, 7 good: the strong one and 2 good', few('SGGGGGGGPPP') === 'SGG', few('SGGGGGGGPPP'));
check('6 strong: 5 strong', few('SSSSSSGG') === 'SSSSS', few('SSSSSSGG'));
check('only good: 3 good', few('GGGGGP') === 'GGG', few('GGGGGP'));
check('only possible: top 2', few('PPPP') === 'PP', few('PPPP'));
check('nothing: nothing', few('') === '');
check('brief drops the bracketed detail', brief('£4 under their LHA (1 bed LHA, Inner North London)') === '£4 under their LHA');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

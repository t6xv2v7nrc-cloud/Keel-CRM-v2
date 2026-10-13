// Checks for sharing a client with a landlord or agent. Run with: npx tsx scripts/test-share-client.ts
import { clientShareText } from '../src/lib/shareClient';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

setActiveSettings(DEFAULT_SETTINGS);
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const michel: Applicant = {
  id: 'a1', full_name: 'Michel Headley', phone: '+447873837902', email: 'michelheadley@hotmail.com', date_of_birth: '1980-01-01', adults: 1, children: 0,
  benefit_type: 'UC, PIP', referring_borough: 'Hackney', source: 'website', referred_by: null, stage: 'viewing', budget_pcm: 1300, lha_band: null,
  requirements: 'Self-contained only', notes: 'Looking for a studio or 1 bed in Hackney, Haringey or Islington. I have a heart condition so ground floor please.',
  on_uc: true, pip: true, lcwra: false, council_registered: true, work_status: 'not_working', household_type: 'single', urgency: 'temp_accommodation',
  council: 'Hackney', officer_name: 'Sam Officer', officer_email: 'sam@hackney.gov.uk', officer_phone: '020 7946 0000', housing_situation: 'Temporary accommodation',
  consent: true, tier: 1, created_at: '2026-09-01', updated_at: '2026-10-01',
};
const text = clientShareText(michel, 'Ridwan');
console.log(text);
check('first name only', text.includes('Michel') && !text.includes('Headley'));
check('never a phone number or email', !text.includes('7873') && !text.includes('@') && !text.includes('020 7946'));
check('nothing medical from their notes', !/heart|condition|ground floor/i.test(text));
check('household and benefits', text.includes('• Michel, single') && text.includes('• On UC and PIP'));
check('size wanted, and self-contained', text.includes('• Looking for a studio or 1 bed, self-contained only'));
check('areas they asked for', /• In or near .*Hackney/.test(text) && text.includes('Haringey') && text.includes('Islington'));
check('budget and council', text.includes('• Budget up to £1,300 pcm') && text.includes('• Council: Hackney'));
check('not urgent under the standard rules: nothing said', !text.includes('Ready to move quickly'));
const urgent = clientShareText({ ...michel, urgency: 'homeless_tonight' }, 'Ridwan');
check('urgent shows as ready to move, never why', urgent.includes('• Ready to move quickly') && !/homeless|temporary/i.test(urgent));
check('greeting and sign-off', text.startsWith('Salam,') && text.endsWith('Thanks, Ridwan, Keel Lettings'));
check('no em dashes', !text.includes('—'));
const bare = clientShareText({ ...michel, benefit_type: null, on_uc: null, pip: null, budget_pcm: null, notes: null, requirements: null, council: null, referring_borough: null, urgency: null }, null);
const noAsk = clientShareText({ ...michel, notes: null, requirements: null }, 'Ridwan');
check('no areas asked: the council says where, once', !noAsk.includes('In or near') && noAsk.includes('• Council: Hackney'));
check('a client with little filled in still reads cleanly', !bare.includes('null') && !bare.includes('undefined') && bare.endsWith('Thanks, Keel Lettings'), bare);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

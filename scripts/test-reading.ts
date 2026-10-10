// Checks for reading screenshots with Claude: the answer is cleaned before use. Run with: npx tsx scripts/test-reading.ts
import { cleanExtraction, EXTRACTION_SCHEMA, READ_ACTIONS, URGENCIES } from '../src/types/extraction';
import { tidyReading } from '../src/lib/extract';
import { URGENCY_LABEL } from '../src/lib/tiering';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

// The schema follows the structured-outputs rules: every object closed
const objects: Record<string, unknown>[] = [];
const walk = (n: unknown) => {
  if (Array.isArray(n)) n.forEach(walk);
  else if (n && typeof n === 'object') {
    const o = n as Record<string, unknown>;
    if (o.type === 'object') objects.push(o);
    Object.values(o).forEach(walk);
  }
};
walk(EXTRACTION_SCHEMA);
check('every object in the schema is closed', objects.length >= 5 && objects.every((o) => o.additionalProperties === false), `${objects.length} objects`);
check('no number limits the API rejects', !JSON.stringify(EXTRACTION_SCHEMA).match(/"(minimum|maximum|minLength|maxLength)"/));
check('urgencies match the tier rules', JSON.stringify([...URGENCIES].sort()) === JSON.stringify(Object.keys(URGENCY_LABEL).sort()));
check('Claude is never asked to create a contact', !(READ_ACTIONS as readonly string[]).includes('create_contact'));

// A good answer comes through
const good = cleanExtraction({
  doc_type: 'applicant_referral', transcription: ' Hi Ridwan, referral for Lubna Hassan ', summary: 'Referral for Lubna Hassan from Barnet.',
  confidence: 0.92,
  applicant: { full_name: 'Lubna Hassan', phone: '07700 900123', adults: 1, children: 2, household_type: 'family', on_uc: true, pip: false,
    urgency: 'at_risk_56', officer_name: 'Sam Officer', officer_email: 'Sam@Barnet.gov.uk', budget_pcm: '£1,100' },
  dates: [{ label: 'Viewing', date: '2026-10-14' }],
  suggested_actions: ['create_applicant', 'create_applicant'],
});
check('a referral is read', good?.doc_type === 'applicant_referral' && good.applicant?.full_name === 'Lubna Hassan' && good.applicant.children === 2);
check('the transcription is trimmed', good?.transcription === 'Hi Ridwan, referral for Lubna Hassan');
check('"£1,100" becomes 1100', good?.applicant?.budget_pcm === 1100);
check('actions are listed once', good?.suggested_actions?.length === 1);

// A bad answer is cleaned, never trusted
const bad = cleanExtraction({
  doc_type: 'shopping_list', confidence: 7, applicant: { full_name: '  ', adults: -2, household_type: 'commune', on_uc: 'yes', urgency: 'very', date_of_birth: '12/03/1990' },
  property: 'not an object', money: { fee_amount: 'lots' }, dates: [{ label: 'Someday' }, 'x'], suggested_actions: ['create_contact', 'delete_everything'],
  sneaky: 'dropped',
});
check('an unknown type becomes unknown', bad?.doc_type === 'unknown');
check('confidence is kept between 0 and 1', bad?.confidence === 1);
check('wrong values are left out, not guessed', bad?.applicant === undefined && bad?.property === undefined && bad?.money === undefined);
check('dates without a day are dropped', bad?.dates === undefined);
check('actions Keel does not have are dropped', bad?.suggested_actions === undefined);
check('unknown keys are dropped', bad !== null && !('sneaky' in bad));
check('a missing summary gets a default', bad?.summary === 'Read by Claude.' && bad.transcription === '');
check('not an object is no answer', cleanExtraction('hello') === null && cleanExtraction(null) === null && cleanExtraction([1]) === null);

// Tidied the way Keel stores things
const tidy = tidyReading(good!);
check('phones become +44', tidy.applicant?.phone === '+447700900123');
check('emails are lower case', tidy.applicant?.officer_email === 'sam@barnet.gov.uk');
const listing = tidyReading(cleanExtraction({ doc_type: 'property_details', transcription: 'x', summary: 'A studio.', confidence: 0.8, property: { address_line: '12 Elm Road', postcode: 'nw26nr', rent_pcm: 1100 } })!);
check('postcodes are spaced', listing.property?.postcode === 'NW2 6NR', listing.property?.postcode);
check('no actions given: the usual ones for its type', listing.suggested_actions?.join() === 'create_property');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

// Checks for Pipeline filters: housing officer and council. Run with: npx tsx scripts/test-pipeline.ts
import { applyFilters, councilOf, DEFAULT_FILTERS, hasOfficer, officerName, officerOrg, sortApplicants } from '../src/lib/search';
import type { Applicant } from '../src/lib/types';

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

// Like Christopher: the form put the officer's email in the name box too
const chris = client({ full_name: 'Christopher Agbor', officer_name: 'tdcruz@westminster.gov.uk', officer_email: 'tdcruz@westminster.gov.uk', council: 'Anywhere' });
const sierra = client({ full_name: 'Sierra Denton', council: 'Bexley', officer_name: 'Jo Smith', officer_email: 'jo.smith@bexley.gov.uk' });
const green = client({ full_name: 'Gemma Green', officer_email: 'case.worker@royalgreenwich.gov.uk' });
const phoneOnly = client({ full_name: 'Paul Phone', officer_phone: '020 8303 7777' });
const none = client({ full_name: 'Anna None', council: 'Brent' });
const all = [none, phoneOnly, green, sierra, chris];

check('any of name, email or phone counts as a housing officer', hasOfficer(chris) && hasOfficer(green) && hasOfficer(phoneOnly) && !hasOfficer(none));
check('an email in the name box is not shown as a name', officerName(chris) === null && officerName(sierra) === 'Jo Smith');
check('the officer\'s council comes from their email', officerOrg(chris) === 'Westminster' && officerOrg(sierra) === 'Bexley', `${officerOrg(chris)} / ${officerOrg(sierra)}`);
check('royalgreenwich.gov.uk is Greenwich', officerOrg(green) === 'Greenwich', String(officerOrg(green)));
check('"Anywhere" is not a council', councilOf(chris) === null && councilOf(sierra) === 'Bexley');

const f = (p: Partial<typeof DEFAULT_FILTERS>) => applyFilters(all, { ...DEFAULT_FILTERS, ...p }).map((a) => a.full_name.split(' ')[0]).sort().join(',');
check('filter: has a housing officer', f({ officer: 'yes' }) === 'Christopher,Gemma,Paul,Sierra', f({ officer: 'yes' }));
check('filter: no housing officer', f({ officer: 'no' }) === 'Anna', f({ officer: 'no' }));
check('filter: Bexley council', f({ council: 'Bexley' }) === 'Sierra', f({ council: 'Bexley' }));
check('filter: council not given', f({ council: 'none' }) === 'Christopher,Gemma,Paul', f({ council: 'none' }));

const sorted = sortApplicants(all, 'officer', 1).map((a) => a.full_name.split(' ')[0]);
check('sort: those with an officer first, by where the officer works', sorted.join(',') === 'Sierra,Gemma,Christopher,Paul,Anna', sorted.join(','));
check('sort the other way: no officer first', sortApplicants(all, 'officer', -1)[0].full_name === 'Anna None');

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

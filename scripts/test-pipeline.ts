// Checks for Pipeline filters: housing officer and council. Run with: npx tsx scripts/test-pipeline.ts
import { applyFilters, councilOf, DEFAULT_FILTERS, filtersFromParams, filtersToParams, hasOfficer, officerName, officerOrg, receivedAt, receivedWords, sortApplicants, starredFirst } from '../src/lib/search';
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

// stars: pinned to the top, each group in its own order; kept in the web address
const pinned = starredFirst(sortApplicants(all, 'name', 1), new Set([sierra.id, green.id])).map((a) => a.full_name.split(' ')[0]);
check('starred first, each group keeping its sort', pinned.join(',') === 'Gemma,Sierra,Anna,Christopher,Paul', pinned.join(','));
check('no stars: the list as it was', starredFirst(all, new Set()) === all);
check('Starred only survives in the web address', filtersFromParams(filtersToParams({ ...DEFAULT_FILTERS, starred: true })).starred === true
  && !filtersToParams(DEFAULT_FILTERS).has('starred'));

// when the referral was received
const now = new Date(2026, 9, 21, 15, 0); // Wednesday 21 October 2026, 3pm
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m, d, h, min).toISOString();
check('received: the officer\'s nomination when dated, else when they got in touch', receivedAt({ created_at: '2026-10-20T09:00:00Z', nominated_at: '2026-10-19T16:00:00Z' }) === '2026-10-19T16:00:00Z'
  && receivedAt({ created_at: '2026-10-20T09:00:00Z', nominated_at: null }) === '2026-10-20T09:00:00Z');
const words = (iso: string) => receivedWords({ created_at: iso, nominated_at: null }, now);
check('received today, with the time', words(at(2026, 9, 21, 9, 30)) === 'Received today, 9:30am', words(at(2026, 9, 21, 9, 30)));
check('received yesterday', words(at(2026, 9, 20, 16)) === 'Received yesterday, 4pm', words(at(2026, 9, 20, 16)));
check('received this week: the day and how long ago', words(at(2026, 9, 19)) === 'Received Mon 19 Oct (2 days ago)', words(at(2026, 9, 19)));
check('received weeks ago', words(at(2026, 8, 1)) === 'Received 1 Sep (7 weeks ago)', words(at(2026, 8, 1)));
check('received last year: with the year', words(at(2025, 9, 1)) === 'Received 1 Oct 2025 (12 months ago)', words(at(2025, 9, 1)));
const byReceived = sortApplicants([client({ full_name: 'Old', created_at: '2026-09-01T10:00:00Z' }), client({ full_name: 'New', created_at: '2026-10-20T10:00:00Z' }),
  client({ full_name: 'Nominated', created_at: '2026-10-21T10:00:00Z', nominated_at: '2026-10-10T10:00:00Z' })], 'received', 1).map((a) => a.full_name);
check('sort by Recently received: newest first, by the nomination date when there is one', byReceived.join(',') === 'New,Nominated,Old', byReceived.join(','));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

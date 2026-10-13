// Checks for clients on ice and the New badge. Run with: npx tsx scripts/test-ice.ts
import { applyFilters, DEFAULT_FILTERS, isFresh, isIced } from '../src/lib/search';
import { coldDays, stuckDays } from '../src/lib/progress';
import { callState } from '../src/lib/calls';
import { scoreMatch } from '../src/lib/propertyMatch';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant } from '../src/lib/types';

setActiveSettings(DEFAULT_SETTINGS);
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const now = new Date('2026-10-13T10:00:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const client = (p: Partial<Applicant>): Applicant => ({
  id: 'a1', full_name: 'Sam Single', phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: 1200, lha_band: null, requirements: null, notes: 'Studio in Brent', on_uc: null, pip: null,
  lcwra: null, council_registered: null, work_status: null, household_type: 'single', urgency: null, council: 'Brent', officer_name: null, officer_email: null,
  officer_phone: null, housing_situation: null, consent: null, tier: null, created_at: daysAgo(60), updated_at: daysAgo(40), stage_changed_at: daysAgo(45),
  iced_at: null, iced_until: null, iced_reason: null, ...p,
});

// New badge
check('got in touch 3 days ago is new', isFresh(client({ created_at: daysAgo(3) }), now));
check('8 days ago is not new', !isFresh(client({ created_at: daysAgo(8) }), now));

// On ice
const iced = client({ iced_at: daysAgo(2), iced_until: '2026-11-10' });
const icedOpen = client({ iced_at: daysAgo(2), iced_until: null });
const back = client({ iced_at: daysAgo(40), iced_until: '2026-10-13' });
check('on ice until a later date', isIced(iced, now));
check('on ice with no date stays on ice', isIced(icedOpen, now));
check('back on their return date', !isIced(back, now));
check('never iced is not iced, before 0017 too', !isIced(client({}), now) && !isIced(client({ iced_at: undefined, iced_until: undefined }), now));
check('on ice is never stuck', stuckDays(iced, [], now) === null && stuckDays(client({}), [], now) !== null);
check('on ice never goes cold', coldDays(iced, [], now) === null && coldDays(client({}), [], now) !== null);
check('on ice is not matched to properties', scoreMatch({ address_line: '1 Elm Road', postcode: 'NW2 6NR', borough: 'Brent', property_type: 'Studio', bedrooms: 0,
  rent_pcm: 1000, rent_text: null, area: null, furnished: null, notes: null }, iced) === null);
check('their next step waits while on ice', callState({ ...iced, next_call_at: '2026-10-01' } as Applicant, undefined).kind === 'none');
const list = [client({ id: 'x' }), { ...iced, id: 'y' }];
check('left out of the active list', applyFilters(list, DEFAULT_FILTERS).map((a) => a.id).join() === 'x');
check('"On ice" shows only them', applyFilters(list, { ...DEFAULT_FILTERS, progress: 'iced' }).map((a) => a.id).join() === 'y');
check('still shown under all stages', applyFilters(list, { ...DEFAULT_FILTERS, stage: 'all' }).length === 2);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

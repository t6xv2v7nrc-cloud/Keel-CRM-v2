import {
  applyFilters, DEFAULT_FILTERS, filtersFromParams, filtersToParams, parseQuery, previewText, sortApplicants,
} from '../src/lib/search';
import type { PipelineFilters } from '../src/lib/search';
import type { Applicant } from '../src/lib/types';

let n = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `id${++n}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: `2026-09-${String(10 + n).padStart(2, '0')}`, ...p,
});

const people = [
  make({ full_name: 'Amira Yusuf', phone: '+447911000001', on_uc: true, household_type: 'single', council: 'Barnet',
    notes: 'Looking for a studio in North Finchley or East Finchley, close to her GP.' }),
  make({ full_name: 'Ben Carter', on_uc: false, work_status: 'full_time', household_type: 'couple', council: 'Barnet',
    notes: 'Wants North Finchley, 1 bed, working full time.' }),
  make({ full_name: 'Chloe Dean', on_uc: true, pip: true, lcwra: true, council_registered: true, household_type: 'single',
    council: 'Haringey', urgency: 'homeless_tonight', notes: 'Anywhere in North London. Needs ground floor.' }),
  make({ full_name: 'Daniel Okafor', benefit_type: 'UC', adults: 2, children: 2, referring_borough: 'Haringey',
    notes: 'Family of 4, wants Tottenham or Wood Green.' }),
  make({ full_name: 'Eve Finch', on_uc: true, household_type: 'single', council: 'Harrow', notes: 'Harrow only.' }),
  make({ full_name: 'Old Closed', on_uc: true, stage: 'lost', notes: 'North Finchley' }),
];

const names = (list: Applicant[]) => list.map((a) => a.full_name).join(', ') || '(none)';
const run = (label: string, f: Partial<PipelineFilters>) =>
  console.log(label.padEnd(44), '→', names(applyFilters(people, { ...DEFAULT_FILTERS, ...f })));

console.log('terms:', JSON.stringify(parseQuery('uc "north finchley" O\'Neil')));
console.log('');
run('UC filter + text north finchley', { benefits: ['uc'], q: 'north finchley' });
run('text only: uc "north finchley"', { q: 'uc "north finchley"' });
run('phrase "north finchley" (any benefit)', { q: '"north finchley"' });
run('word "finch" (prefix, matches Finchley + Finch)', { q: 'finch' });
run('UC + PIP + LCWRA', { benefits: ['uc', 'pip', 'lcwra'] });
run('client type: family (inferred from 2+2)', { household: 'family' });
run('client type: single + Barnet', { household: 'single', q: 'barnet' });
run('full-time workers', { work: 'full_time' });
run('urgent only', { urgency: 'urgent' });
run('tier 1', { tier: '1' });
run('phone typed as 07911 000001', { q: '07911000001' });
run('include closed: "north finchley" stage=all', { q: '"north finchley"', stage: 'all' });
run('legacy benefit_type "UC" counts as UC', { benefits: ['uc'], q: 'tottenham' });

console.log('');
console.log('sort by benefits  →', names(sortApplicants(people.slice(0, 5), 'benefits', 1)));
console.log('sort by type      →', names(sortApplicants(people.slice(0, 5), 'household', 1)));
console.log('sort by area      →', names(sortApplicants(people.slice(0, 5), 'area', 1)));
console.log('sort by tier      →', names(sortApplicants(people.slice(0, 5), 'tier', 1)));

console.log('');
console.log('preview w/ search →', previewText(people[0], parseQuery('"east finchley"'), 40));
const url = filtersToParams({ ...DEFAULT_FILTERS, q: 'north finchley', benefits: ['uc', 'pip'], household: 'single' });
console.log('url params        →', url.toString());
console.log('round trip ok     →', JSON.stringify(filtersFromParams(url)) === JSON.stringify({ ...DEFAULT_FILTERS, q: 'north finchley', benefits: ['uc', 'pip'], household: 'single' }));
console.log('bad params ignored→', JSON.stringify(filtersFromParams(new URLSearchParams('tier=9&benefits=uc,zzz&stage=nope'))));

// Checks for finding duplicate clients. Run with: npx tsx scripts/test-duplicates.ts
import { duplicateGroups, keeperOf } from '../src/lib/duplicates';
import type { Applicant } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};

let n = 0;
const client = (p: Partial<Applicant>): Applicant => ({
  id: `a${++n}`, full_name: `Client ${n}`, phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null, officer_name: null, officer_email: null, officer_phone: null,
  housing_situation: null, consent: null, tier: null, created_at: `2026-10-0${Math.min(9, n)}T10:00:00Z`, updated_at: '', ...p,
});

const list = [
  client({ id: 'ann1', full_name: 'Anna Mecani', phone: '07700 900123', stage: 'lead' }),
  client({ id: 'ann2', full_name: 'Ana Mecani', phone: '+447700900123', stage: 'viewing' }),       // same phone, name spelt differently
  client({ id: 'ben1', full_name: 'Ben Okafor', email: 'Ben.O@example.com' }),
  client({ id: 'ben2', full_name: 'Benjamin Okafor', email: 'ben.o@example.com ' }),               // same email
  client({ id: 'mo1', full_name: 'Mohammed Ali' }),
  client({ id: 'mo2', full_name: 'ALI Mohammed', budget_pcm: 1100, notes: 'x' }),                 // same name, other order
  client({ id: 'solo', full_name: 'Cara Example', phone: '07700 900999' }),
  client({ id: 'one', full_name: 'Prince' }),                                                      // one-word names are not compared
  client({ id: 'two', full_name: 'Prince' }),
];
const groups = duplicateGroups(list);
check('three groups: phone, email, name', groups.length === 3, groups.map((g) => g.clients.map((c) => c.id).join('+')).join(' '));
check('phone and email matches are sure and come first', groups[0].sure && groups[1].sure && !groups[2].sure);
const anna = groups.find((g) => g.clients.some((c) => c.id === 'ann1'))!;
check('07700 900123 and +447700900123 are the same phone', anna.reasons.join() === 'same phone');
check('keep the one furthest along', anna.keep.id === 'ann2');
const mo = groups.find((g) => g.clients.some((c) => c.id === 'mo1'))!;
check('same name in any order, shown as a question', mo.reasons.join() === 'same name' && !mo.sure);
check('same stage: keep the one with more filled in', mo.keep.id === 'mo2');
check('lost is never kept over a live record', keeperOf([client({ id: 'l', stage: 'lost', budget_pcm: 1 }), client({ id: 'k', stage: 'lead' })]).id === 'k');
check('a client on their own is not listed', !groups.some((g) => g.clients.some((c) => c.id === 'solo')));

// A support worker's or office number on many clients is a shared contact, not one person
const shared = Array.from({ length: 6 }, (_, i) => client({ id: `s${i}`, full_name: `Shared Person${i}`, phone: '020 7946 0000' }));
const withShared = duplicateGroups([...list, ...shared]);
check('a phone on more than three clients joins nobody', withShared.length === 3 && !withShared.some((g) => g.clients.some((c) => c.id.startsWith('s'))));
const three = duplicateGroups(Array.from({ length: 3 }, (_, i) => client({ id: `t${i}`, phone: '07700 900555' })));
check('three on one phone is still a duplicate', three.length === 1 && three[0].clients.length === 3);

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

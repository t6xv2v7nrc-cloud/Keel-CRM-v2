// Checks for readNotes: real notes clients have written. Run with: npx tsx scripts/test-notes.ts
import { readNotes } from '../src/lib/readNotes';
import type { Applicant } from '../src/lib/types';

let id = 0;
const make = (p: Partial<Applicant>): Applicant => ({
  id: `a${++id}`, full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0,
  benefit_type: null, referring_borough: null, source: 'website', referred_by: null, stage: 'referred',
  budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null,
  officer_name: null, officer_email: null, officer_phone: null, housing_situation: null, consent: null,
  tier: null, created_at: '2026-09-01', updated_at: '2026-09-20', ...p,
});

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
const show = (name: string, a: Applicant) => {
  const r = readNotes(a);
  console.log(`\n── ${name}`);
  for (const s of r.suggestions) console.log(`   ${Math.round(s.confidence * 100)}%  ${s.field}: ${s.value}${s.current ? ` (now ${s.current})` : ''}${s.note ? `  [${s.note}]` : ''}  «${s.evidence.match}»`);
  for (const f of r.flags) console.log(`   flag ${Math.round(f.confidence * 100)}%  ${f.text}${f.fix ? `  → ${f.fix.label}` : ''}`);
  if (r.understood.length) console.log(`   matching reads: ${r.understood.join(' · ')}`);
  return r;
};

const claire = show('Claire Jones', make({ full_name: 'Claire Jones', council: 'Any', referring_borough: 'Any', consent: true,
  notes: 'I’m currently working with a team that are trying to find properties that are on the LHA budget main 2-4 beds.' }));
check('Claire: flagged as a professional', claire.flags.some((f) => f.id === 'professional'));
check('Claire: LHA noticed', claire.suggestions.some((s) => s.field === 'LHA band'));
check('Claire: "Any" is not a council', claire.flags.some((f) => f.id === 'council-text'));
check('Claire: matching reads 2 to 4 bed', claire.understood.includes('2 to 4 bed'), claire.understood.join(', '));

const david = show('David Lamming', make({ full_name: 'david lamming', referring_borough: 'anywhere in London or Kent',
  notes: 'Hello I am interested in properties asap, I have two options, I get the higher rate which is £1430 around that. my friend gets the lower rate but we would have a total of over £2000 for rent. or if I can find a one bed room that is also possible.' }));
const budgets = david.suggestions.filter((s) => s.field === 'Budget');
check('David: budget £1,430 is the top budget', budgets[0]?.value === '£1,430 pcm', budgets.map((b) => b.value).join(', '));
check('David: £2,000 offered as a combined amount', budgets.some((b) => b.value === '£2,000 pcm' && /combined/i.test(b.note ?? '')));
check('David: sharing with a friend', david.suggestions.some((s) => s.field === 'Household' && /sharing/.test(s.value)));
check('David: wants to move quickly', david.flags.some((f) => f.id === 'quick'));
check('David: area in the council field can be moved to notes', david.flags.some((f) => f.id === 'council-text' && !!f.fix));

const robinson = show('S Robinson', make({ full_name: 'S Robinson', referring_borough: 'Greenwich Borough', on_uc: true, pip: true,
  notes: "I am hoping to find a self-contained unit in the South East or South West of London if possible but I don't mind if it is further North to some degree. I am currently with Greenwich Homeless Project in the Borough of Greenwich and will need to find somewhere quite quickly as I have come to the end of the time that they can support me as an overnight resident." }));
check('Robinson: at risk (end of time at the project)', robinson.suggestions.some((s) => s.field === 'Urgency'));
check('Robinson: situation is a homeless project', robinson.suggestions.some((s) => s.field === 'Situation' && /Homeless project/.test(s.value)));
check('Robinson: council already Greenwich, not suggested again', !robinson.suggestions.some((s) => s.field === 'Council'));

const family = show('Family', make({ notes: 'Me and my 3 kids have been served a section 21. I work part time and get universal credit and child benefit. Registered with Enfield council. Budget up to £1,650 pcm.' }));
check('Family: 3 children', family.suggestions.some((s) => s.field === 'Children' && s.value === '3'));
check('Family: household is family', family.suggestions.some((s) => s.field === 'Household' && /Family/.test(s.value)));
check('Family: budget £1,650 with high accuracy', family.suggestions.some((s) => s.field === 'Budget' && s.value === '£1,650 pcm' && s.confidence >= 0.8));
check('Family: part-time work', family.suggestions.some((s) => s.field === 'Work' && s.value === 'Part time'));
check('Family: on UC', family.suggestions.some((s) => s.field === 'On UC' && s.value === 'Yes'));
check('Family: council-registered with Enfield', family.suggestions.some((s) => s.field === 'Council' && s.value === 'Enfield') && family.suggestions.some((s) => s.field === 'Council-registered' && s.value === 'Yes'));
check('Family: at risk (section 21)', family.suggestions.some((s) => s.field === 'Urgency' && /56 days/.test(s.value)));
check('Family: child benefit noted', family.suggestions.some((s) => s.field === 'Other benefits' && /Child benefit/.test(s.value)));

const negatives = show('Negatives', make({ notes: 'I am not on UC and I am not registered with any council. I do not have PIP.' }));
check('Negatives: not on UC', negatives.suggestions.some((s) => s.field === 'On UC' && s.value === 'No'));
check('Negatives: not registered', negatives.suggestions.some((s) => s.field === 'Council-registered' && s.value === 'No'));
check('Negatives: no PIP', negatives.suggestions.some((s) => s.field === 'PIP' && s.value === 'No'));

const weekly = show('Weekly', make({ notes: 'Single, sofa surfing at a friends. Can pay £300 a week. Full time.' }));
check('Weekly: £300 a week becomes £1,300 pcm', weekly.suggestions.some((s) => s.field === 'Budget' && s.value === '£1,300 pcm'));
check('Weekly: "Single," at the start reads as single', weekly.suggestions.some((s) => s.field === 'Household' && s.value === 'Single'));
check('Weekly: sofa surfing', weekly.suggestions.some((s) => s.field === 'Situation' && /Sofa surfing/.test(s.value)));

const filled = show('Already filled', make({ budget_pcm: 1650, household_type: 'family', children: 3, notes: 'Me and my 3 kids, budget up to £1,650 pcm.' }));
check('Already filled: nothing to suggest', filled.suggestions.length === 0, filled.suggestions.map((s) => s.field).join(', '));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

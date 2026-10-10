// Checks for the morning summary on Home. Run with: npx tsx scripts/test-digest.ts
import { morningDigest } from '../src/lib/digest';
import { DEFAULT_SETTINGS, setActiveSettings } from '../src/lib/settings';
import type { Applicant, Deal, Provider, ProviderRequest, Receivable } from '../src/lib/types';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed += 1;
};
setActiveSettings(DEFAULT_SETTINGS);

const now = new Date('2026-10-10T08:00:00');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const client = (id: string, full_name: string, p: Partial<Applicant> = {}): Applicant => ({
  id, full_name, phone: '07700 900123', email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null, lcwra: null,
  council_registered: null, work_status: null, household_type: null, urgency: null, council: null, officer_name: null, officer_email: null, officer_phone: null,
  housing_situation: null, consent: null, tier: null, created_at: daysAgo(3), updated_at: daysAgo(1), stage_changed_at: daysAgo(1), ...p,
});
const deal = (id: string, applicant_id: string, status: Deal['status'], p: Partial<Deal> = {}): Deal => ({
  id, applicant_id, property_id: null, address: '12 Elm Road, London NW2 6NR', status, viewing_at: null, move_in_on: null,
  fell_through_reason: null, notes: null, created_at: daysAgo(2), updated_at: daysAgo(1), ...p,
});
const fee = (p: Partial<Receivable>): Receivable => ({
  id: 'r', kind: 'letting_fee', applicant_id: 'a1', deal_id: null, property_address: null, payer: 'Watermint', provider_id: null, amount: 300,
  sign_up_on: '2026-09-01', due_on: '2026-10-01', claim_submitted_on: null, status: 'due', paid_on: null, notes: null, created_at: daysAgo(30), updated_at: daysAgo(30), ...p,
});

const empty = morningDigest({ applicants: [], deals: [], receivables: [], requests: [], providers: [], now });
check('a quiet day says so', empty.lines.length === 0 && empty.text === 'Keel, Saturday 10 October\nNothing due today.', JSON.stringify(empty.text));

const applicants = [
  client('a1', 'Lubna Hassan', { stage: 'viewing' }),
  client('a2', 'Ben Okafor', { next_call_at: '2026-10-09', next_step: 'Chase documents' }),
  client('a3', 'Cara Example', { next_call_at: '2026-10-10' }),
  client('a4', 'Dev Old', { stage: 'lead', stage_changed_at: daysAgo(60), created_at: daysAgo(70) }),
  client('a5', 'Ella Offer', { stage: 'offer' }),
  client('a6', 'Faye Later', { next_call_at: '2026-10-12', next_step: 'Call back' }),
];
const deals = [
  deal('d1', 'a1', 'viewing', { viewing_at: '2026-10-10T13:30:00', address: '3 Oak Lane, London N17 9LP' }),
  deal('d0', 'a2', 'viewing', { viewing_at: '2026-10-10T10:00:00' }),
  deal('d2', 'a5', 'accepted', { checklist: { 'Right to rent checked': '2026-10-09' } }),
  deal('d3', 'a1', 'viewing', { viewing_at: '2026-10-11T10:00:00' }),
];
const requests: ProviderRequest[] = [{
  id: 'q1', provider_id: 'wm', property_id: null, property_address: '7 Willow Walk, London N22 5AA', client_ids: ['a2'], type: 'availability', message: '',
  slots: [], status: 'sent', sent_at: daysAgo(2), follow_up_at: daysAgo(1), outcome_note: null, override_reason: null, created_at: daysAgo(2), updated_at: daysAgo(2),
}];
const providers = [{ id: 'wm', name: 'Watermint' } as Provider];
const receivables = [fee({ id: 'r1' }), fee({ id: 'r2', amount: 250, due_on: '2026-10-14' }), fee({ id: 'r3', status: 'paid', paid_on: '2026-10-02' })];
const d = morningDigest({ applicants, deals, receivables, requests, providers, now });
const line = (k: string) => d.lines.find((l) => l.key === k)?.text ?? '';

check('viewings today in time order, tomorrow left out', line('viewings') === '2 viewings today: 10am Ben at 12 Elm Road; 1:30pm Lubna at 3 Oak Lane', line('viewings'));
check('next steps due and overdue, later ones left out', line('steps') === '2 next steps due, 1 overdue: Ben (chase documents) and Cara', line('steps'));
check('a provider who owes an answer', line('providers') === '1 provider to chase: Watermint (7 Willow Walk)', line('providers'));
check('money overdue and due this week, paid left out', line('money') === 'Finances: £300 overdue (1), £250 due this week (1)', line('money'));
check('move-in checks still open', line('movein') === `Move-in checks open: Ella, 12 Elm Road (1 of ${DEFAULT_SETTINGS.moveInChecklist.length})`, line('movein'));
check('a cold lead is counted', line('cold') === '1 lead gone cold, ready to move to Lost', line('cold'));
check('first names only, never a phone number', !d.text.includes('Hassan') && !d.text.includes('07700') && !d.text.includes('Okafor'));
check('the text starts with the day and has one bullet a line', d.text.startsWith('Keel, Saturday 10 October\n• ') && d.text.split('\n').length === d.lines.length + 1);
check('no em dashes', !d.text.includes('—'));
const long = morningDigest({ applicants: [client('x', 'Fatima Long', { next_call_at: '2026-10-10', next_step: 'Chase documents from the housing officer at Brent Council about the deposit' })], deals: [], receivables: [], requests: [], providers: [], now });
check('a long next step is cut short', long.lines[0]?.text === '1 next step due: Fatima (chase documents from the housing…)', long.lines[0]?.text);
const done = morningDigest({ applicants, deals, receivables, requests, providers, now, checklist: ['Right to rent checked'] });
check('a finished checklist drops off', !done.lines.some((l) => l.key === 'movein'));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);

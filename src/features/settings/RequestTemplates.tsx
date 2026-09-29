import { useState } from 'react';
import { Card, CardHeader } from '../../components/ui';
import { usePeople } from '../../lib/hooks';
import { DEFAULT_REQUEST_TEMPLATES } from '../../lib/settings';
import type { AppSettings } from '../../lib/settings';
import { REQUEST_PLACEHOLDERS, requestMessage } from '../../lib/requests';
import type { Applicant } from '../../lib/types';

type Key = keyof AppSettings['requestTemplates'];
const KINDS: Array<[Key, string]> = [
  ['availability', 'Check availability'], ['viewing', 'Book viewing'], ['details', 'Send client details'], ['chase', 'Chase'],
  ['reschedule', 'Viewing moved'], ['cancel', 'Viewing cancelled'],
];

const sample = (p: Partial<Applicant>): Applicant => ({
  id: 's', full_name: 'X', phone: null, email: null, date_of_birth: null, adults: 1, children: 0, benefit_type: null, referring_borough: null,
  source: null, referred_by: null, stage: 'referred', budget_pcm: null, lha_band: null, requirements: null, notes: null, on_uc: null, pip: null,
  lcwra: null, council_registered: null, work_status: null, household_type: null, urgency: null, council: null, officer_name: null,
  officer_email: null, officer_phone: null, housing_situation: null, consent: null, tier: null, created_at: '', updated_at: '', ...p,
});
const SAMPLE_CLIENTS = [
  sample({ full_name: 'Charles Okoro', on_uc: true, household_type: 'single' }),
  sample({ full_name: 'Amira Hassan', on_uc: true, pip: true, household_type: 'couple' }),
];

/** Team settings: the wording of requests to providers, one per type. */
export function RequestTemplates({ draft, set }: { draft: AppSettings; set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void }) {
  const [kind, setKind] = useState<Key>('viewing');
  const { myName } = usePeople();
  const value = draft.requestTemplates[kind];
  const slots = [new Date(Date.now() + 86_400_000).setHours(14, 0, 0, 0), new Date(Date.now() + 2 * 86_400_000).setHours(11, 0, 0, 0)].map((t) => new Date(t).toISOString());
  const preview = requestMessage({
    type: kind, template: value, provider: { name: 'Zubair Properties', contact_first_name: 'Zubair' },
    property: { address_line: 'Broadfield Close, London NW2 6NR', rent_pcm: 1436, rent_text: null },
    clients: kind === 'reschedule' || kind === 'cancel' ? SAMPLE_CLIENTS.slice(0, 1) : SAMPLE_CLIENTS, slots, myName: myName ?? 'Ridwan',
    oldTime: slots[0], newTime: slots[1],
  });

  return (
    <Card>
      <CardHeader icon="send" title="Requests to providers" help="requests" />
      <div className="flex flex-col gap-4 p-5">
        <label className="flex flex-wrap items-center gap-3 text-[15px] text-[var(--ink)]">
          <span className="min-w-[200px] flex-1">
            Chase a provider after
            <span className="block text-[13px] text-[var(--ink-muted)]">A request with no reply by then goes to the top of Awaiting providers on Home.</span>
          </span>
          <span className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <input type="number" min={1} max={168} value={draft.requestFollowUpHours} aria-label="Hours before a chase is due"
              onChange={(e) => set('requestFollowUpHours', Math.min(168, Math.max(1, Number(e.target.value) || 24)))}
              className="h-10 w-20 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            hours
          </span>
        </label>
        <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="tablist" aria-label="Request type">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium ${kind === k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <textarea rows={6} value={value} aria-label={`Wording for ${kind}`}
              onChange={(e) => set('requestTemplates', { ...draft.requestTemplates, [kind]: e.target.value })}
              className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <p className="m-0 text-[12px] text-[var(--ink-muted)]">
              A line with a client placeholder is written once per client. There is no placeholder for phone numbers, surnames or health: they never go to providers.
            </p>
            <ul className="m-0 grid list-none gap-0.5 p-0 text-[12px] text-[var(--ink-muted)]">
              {REQUEST_PLACEHOLDERS.map(([k, v]) => <li key={k}><code className="font-mono text-[var(--ink)]">{k}</code> {v}</li>)}
            </ul>
            {value !== DEFAULT_REQUEST_TEMPLATES[kind] && (
              <button type="button" onClick={() => set('requestTemplates', { ...draft.requestTemplates, [kind]: DEFAULT_REQUEST_TEMPLATES[kind] })}
                className="self-start text-[13px] text-[var(--link)] hover:underline">Use the standard wording</button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">How it looks{kind === 'reschedule' || kind === 'cancel' ? '' : ', with two clients'}</span>
            <div className="whitespace-pre-wrap rounded-lg rounded-tr-none bg-[var(--accent-soft)] p-3 text-[14px] leading-relaxed text-[var(--ink)]">{preview}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

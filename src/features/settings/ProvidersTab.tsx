import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardHeader, Icon, UpdateNote, useToast } from '../../components/ui';
import { usePeople, useProperties, useProviders, useRequests, useSaveProvider } from '../../lib/hooks';
import type { ProviderDraft } from '../../lib/hooks';
import { providerFor, rulesSummary } from '../../lib/requests';
import { BOROUGHS, canonicalBorough } from '../../lib/london';
import { usualFeeWords } from '../../lib/money';
import type { DueFrom, DueRule, FeeBasis, Provider, ProviderRules } from '../../lib/types';

const BENEFIT_CHOICES = ['PIP', 'LCWRA', 'UC', 'HB', 'Full-time'];
const HOUSEHOLD_CHOICES = ['Single', 'Couple', 'Family'];
const EMPTY: ProviderDraft = {
  name: '', contact_first_name: '', company: '', tag: '', whatsapp: '', email: '', rules: {}, fee_terms: '', notes: '', active: true,
};
/** "447700900123" shown as "+44 7700 900123" */
const showNumber = (d: string | null) => (d ? (d.startsWith('44') && d.length === 12 ? `+44 ${d.slice(2, 6)} ${d.slice(6)}` : `+${d}`) : null);

/** Team settings: who supplies properties, how to reach them, and what they will take. */
export function ProvidersTab() {
  const { providers, ready } = useProviders();
  const { requests } = useRequests();
  const { data: properties = [] } = useProperties();
  const people = usePeople();
  const canEdit = people.canEditTeam;
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const sorted = [...providers].sort((a, b) => Number(b.active) - Number(a.active) || a.tag.localeCompare(b.tag));

  if (!ready) {
    return (
      <UpdateNote title="Providers need a one-off database update." file="0010_providers_requests.sql">
        It adds your existing tags (BP, SR, ZUB and the rest) ready to fill in.
      </UpdateNote>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-[240px] flex-1 text-[15px] text-[var(--ink-muted)]">
          Who supplies your properties, by the tag on their lists. Their WhatsApp number is where requests go; their rules warn you before you send a client who does not fit.
          {!canEdit && ` Only ${people.ownerName ?? 'the owner'} can change them.`}
        </p>
        {canEdit && editing !== 'new' && (
          <Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} />Add a provider</Button>
        )}
      </div>

      {editing === 'new' && <ProviderForm initial={EMPTY} onDone={() => setEditing(null)} />}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {sorted.map((p) => {
          const count = properties.filter((x) => (x.status === 'void' || x.status === 'under_offer') && providerFor(x, providers)?.id === p.id).length;
          const open = requests.filter((r) => r.provider_id === p.id && r.status === 'sent').length;
          if (editing === p.id) return <li key={p.id}><ProviderForm initial={p} onDone={() => setEditing(null)} /></li>;
          return (
            <li key={p.id}>
              <Card className={`flex flex-wrap items-start gap-3 p-4 ${p.active ? '' : 'opacity-60'}`}>
                <span className="grid h-10 min-w-10 place-items-center rounded-lg bg-[var(--accent-soft)] px-2 font-mono text-[14px] font-bold text-[var(--accent-ink)]">{p.tag}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-[var(--ink)]">
                    {p.name}{!p.active && <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--chip-fg)]">Switched off</span>}
                  </div>
                  <div className="text-[13px] text-[var(--ink-muted)]">
                    {[p.contact_first_name, p.company, showNumber(p.whatsapp) ?? 'No WhatsApp number', p.email].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--ink)]">{rulesSummary(p.rules)}</div>
                  <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                    {count} available {count === 1 ? 'property' : 'properties'}{open ? ` · ${open} open ${open === 1 ? 'request' : 'requests'}` : ''}
                    {usualFeeWords(p.rules) ? ` · Usual fee: ${usualFeeWords(p.rules)}` : ''}
                    {p.rules.fee_due?.from === 'first_rent' ? ' after the first month\'s rent' : ''}
                    {p.fee_terms ? ` · Fee: ${p.fee_terms}` : ''}
                  </div>
                </div>
                {canEdit && <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setEditing(p.id)}><Icon name="pencil" size={14} />Edit</Button>}
              </Card>
            </li>
          );
        })}
      </ul>
      {sorted.length === 0 && <p className="m-0 text-[15px] text-[var(--ink-muted)]">No providers yet.</p>}
    </div>
  );
}

function ProviderForm({ initial, onDone }: { initial: ProviderDraft | Provider; onDone: () => void }) {
  const save = useSaveProvider();
  const { toast } = useToast();
  const { data: properties = [] } = useProperties();
  const { providers } = useProviders();
  const [d, setD] = useState<ProviderDraft>({ ...initial, rules: { ...(initial.rules ?? {}) } });
  const [boroughText, setBoroughText] = useState((initial.rules?.boroughs ?? []).join(', '));
  const set = <K extends keyof ProviderDraft>(k: K, v: ProviderDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const rule = <K extends keyof ProviderRules>(k: K, v: ProviderRules[K]) => setD((x) => ({ ...x, rules: { ...x.rules, [k]: v } }));
  const toggle = (k: 'benefits_required' | 'household_allowed', v: string) => {
    const now = d.rules[k] ?? [];
    rule(k, now.includes(v) ? now.filter((x) => x !== v) : [...now, v]);
  };
  const isNew = !('id' in initial) || !initial.id;
  const feeBasis: FeeBasis = d.rules.fee_basis ?? 'fixed';
  const due: DueRule | null = d.rules.fee_due ?? null;
  const setDue = (p: Partial<DueRule>) => rule('fee_due', { n: due?.n ?? 1, unit: due?.unit ?? 'months', from: due?.from ?? 'sign_up', ...p });

  const submit = (active = d.active) => {
    const boroughs = boroughText.split(',').map((b) => canonicalBorough(b) ?? b.trim()).filter(Boolean);
    const rules: ProviderRules = {
      ...(d.rules.benefits_required?.length ? { benefits_required: d.rules.benefits_required } : {}),
      ...(d.rules.household_allowed?.length ? { household_allowed: d.rules.household_allowed } : {}),
      ...(d.rules.max_rent ? { max_rent: d.rules.max_rent } : {}),
      ...(boroughs.length ? { boroughs } : {}),
      ...(d.rules.furnished ? { furnished: d.rules.furnished } : {}),
      ...(feeBasis === 'fixed' && d.rules.fee_amount ? { fee_amount: d.rules.fee_amount } : {}),
      ...(feeBasis !== 'fixed' && d.rules.fee_rate ? { fee_basis: feeBasis, fee_rate: d.rules.fee_rate } : {}),
      ...(d.rules.fee_due && (d.rules.fee_due.n > 0 || d.rules.fee_due.from === 'first_rent') ? { fee_due: d.rules.fee_due } : {}),
    };
    const switchingOff = !isNew && initial.active && !active;
    if (switchingOff) {
      const id = 'id' in initial ? initial.id : undefined;
      const mine = properties.filter((x) => providerFor(x, providers)?.id === id);
      const available = mine.filter((x) => x.status === 'void').length;
      const held = mine.filter((x) => x.status === 'under_offer').length;
      const ok = window.confirm([
        `Switch off ${initial.tag}?`,
        available ? `Its ${available} available ${available === 1 ? 'property' : 'properties'} will be withdrawn too, so ${available === 1 ? 'it stops' : 'they stop'} matching and cannot be sent.` : 'It has no available properties to withdraw.',
        held ? `${held} under offer ${held === 1 ? 'stays' : 'stay'} as ${held === 1 ? 'it is' : 'they are'}, as a client may be moving in.` : '',
        'Switch it back on to bring them back.',
      ].filter(Boolean).join('\n\n'));
      if (!ok) return;
    }
    save.mutate({ ...d, active, rules }, {
      onSuccess: (p) => {
        toast(isNew ? `Added ${p.tag}`
          : switchingOff ? `${p.tag} switched off${p.withdrawn ? `. ${p.withdrawn} ${p.withdrawn === 1 ? 'property' : 'properties'} withdrawn` : ''}`
          : !initial.active && active ? `${p.tag} switched back on${p.restored ? `. ${p.restored} ${p.restored === 1 ? 'property' : 'properties'} available again` : ''}`
          : `Saved ${p.tag}`, 'success');
        onDone();
      },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const input = 'h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[13px] font-medium ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--line-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`;

  return (
    <Card>
      <CardHeader icon="building" title={isNew ? 'New provider' : `Edit ${initial.tag}`} help="providers" />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Name"><input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Zubair Properties" className={input} /></Field>
        <Field label="Tag on their lists"><input value={d.tag} onChange={(e) => set('tag', e.target.value.toUpperCase())} placeholder="e.g. ZUB" maxLength={12} className={`${input} font-mono uppercase`} /></Field>
        <Field label="Contact first name"><input value={d.contact_first_name ?? ''} onChange={(e) => set('contact_first_name', e.target.value)} placeholder="Used to start messages: Salam Zubair" className={input} /></Field>
        <Field label="Company"><input value={d.company ?? ''} onChange={(e) => set('company', e.target.value)} className={input} /></Field>
        <Field label="WhatsApp"><input value={d.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="07700 900123" inputMode="tel" className={`${input} font-mono`} /></Field>
        <Field label="Email"><input value={d.email ?? ''} onChange={(e) => set('email', e.target.value)} type="email" className={input} /></Field>

        <div className="flex flex-col gap-3 rounded-lg bg-[var(--surface-2)] p-4 sm:col-span-2">
          <div className="text-[15px] font-medium text-[var(--ink)]">What they will take</div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[var(--ink-muted)]">Benefits (any of these; none ticked means anyone)</span>
            <div className="flex flex-wrap gap-1.5">
              {BENEFIT_CHOICES.map((b) => <button key={b} type="button" aria-pressed={(d.rules.benefits_required ?? []).includes(b)} onClick={() => toggle('benefits_required', b)} className={chip((d.rules.benefits_required ?? []).includes(b))}>{b}</button>)}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[var(--ink-muted)]">Household</span>
            <div className="flex flex-wrap gap-1.5">
              {HOUSEHOLD_CHOICES.map((h) => <button key={h} type="button" aria-pressed={(d.rules.household_allowed ?? []).includes(h)} onClick={() => toggle('household_allowed', h)} className={chip((d.rules.household_allowed ?? []).includes(h))}>{h}</button>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Max rent (pcm)">
              <input type="number" min={0} step={50} value={d.rules.max_rent ?? ''} onChange={(e) => rule('max_rent', e.target.value ? Number(e.target.value) : null)} placeholder="Any" className={`${input} font-mono`} />
            </Field>
            <Field label="Councils they take clients from">
              <input value={boroughText} onChange={(e) => setBoroughText(e.target.value)} list="keel-boroughs" placeholder="Any, or e.g. Brent, Barnet" className={input} />
              <datalist id="keel-boroughs">{BOROUGHS.map((b) => <option key={b} value={b} />)}</datalist>
            </Field>
            <Field label="Furnished">
              <select value={d.rules.furnished ?? ''} onChange={(e) => rule('furnished', (e.target.value || null) as ProviderRules['furnished'])} className={input}>
                <option value="">Either</option><option value="furnished">Furnished</option><option value="unfurnished">Unfurnished</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg bg-[var(--surface-2)] p-4 sm:col-span-2">
          <div className="text-[15px] font-medium text-[var(--ink)]">Letting fee they pay Keel</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Usual fee">
              <div className="flex flex-wrap gap-2">
                <select value={feeBasis} aria-label="How the fee is worked out" className={`${input} w-auto`}
                  onChange={(e) => {
                    const b = e.target.value as FeeBasis;
                    setD((x) => ({ ...x, rules: { ...x.rules, fee_basis: b === 'fixed' ? null : b, fee_rate: b === 'fixed' ? null : x.rules.fee_rate ?? (b === 'weeks' ? 1 : 50) } }));
                  }}>
                  <option value="fixed">A set amount</option>
                  <option value="weeks">Weeks of rent</option>
                  <option value="percent">% of a month&apos;s rent</option>
                </select>
                {feeBasis === 'fixed' ? (
                  <input type="number" min={0} step={10} value={d.rules.fee_amount ?? ''} onChange={(e) => rule('fee_amount', e.target.value ? Number(e.target.value) : null)}
                    placeholder="£, if it is always the same" aria-label="Usual fee in pounds" className={`${input} w-40 font-mono`} />
                ) : (
                  <span className="flex items-center gap-2">
                    <input type="number" min={0} step={feeBasis === 'weeks' ? 0.5 : 5} value={d.rules.fee_rate ?? ''} onChange={(e) => rule('fee_rate', e.target.value ? Number(e.target.value) : null)}
                      aria-label={feeBasis === 'weeks' ? 'Weeks of rent' : 'Percentage of a month\'s rent'} className={`${input} w-20 font-mono`} />
                    <span className="text-[14px] text-[var(--ink-muted)]">{feeBasis === 'weeks' ? (d.rules.fee_rate === 1 ? 'week\'s rent' : 'weeks\' rent') : '% of a month\'s rent'}</span>
                  </span>
                )}
              </div>
            </Field>
            <Field label="When it is due">
              <div className="flex flex-wrap gap-2">
                <input type="number" min={0} value={due?.n ?? ''} placeholder="Standard" aria-label="How long"
                  onChange={(e) => (e.target.value === '' && due?.from !== 'first_rent' ? rule('fee_due', null) : setDue({ n: Math.max(0, Number(e.target.value) || 0) }))}
                  className={`${input} w-24 font-mono`} />
                <select value={due?.unit ?? 'months'} aria-label="Unit" disabled={!due} onChange={(e) => setDue({ unit: e.target.value as DueRule['unit'] })} className={`${input} w-auto`}>
                  <option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option>
                </select>
                <select value={due?.from ?? 'sign_up'} aria-label="Counted from" className={`${input} w-auto`}
                  onChange={(e) => setDue({ from: e.target.value as DueFrom, ...(e.target.value === 'first_rent' && !due ? { n: 0, unit: 'days' as const } : {}) })}>
                  <option value="sign_up">after sign up</option>
                  <option value="first_rent">after first rent is paid</option>
                </select>
              </div>
            </Field>
            <p className="m-0 text-[13px] text-[var(--ink-muted)] sm:col-span-2">
              When a client moves in to one of their properties, the fee goes on Finances worked out from the rent, with its due date. If they only pay once the
              client&apos;s first month&apos;s rent is in, the fee waits for it and the date it is expected goes on the calendar. Leave blank to use the team standard.
            </p>
          </div>
        </div>

        <Field label="Fee terms"><textarea value={d.fee_terms ?? ''} onChange={(e) => set('fee_terms', e.target.value)} rows={2} className={`${input} h-auto py-2`} /></Field>
        <Field label="Notes"><textarea value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} className={`${input} h-auto py-2`} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-5 py-3">
        {!isNew && (
          <button type="button" onClick={() => submit(!d.active)} disabled={save.isPending}
            className="mr-auto text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline">
            {d.active ? `Switch off ${initial.tag}` : `Switch ${initial.tag} back on`}
          </button>
        )}
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={() => submit()} disabled={save.isPending || !d.name.trim() || !d.tag.trim()}>
          {save.isPending ? 'Saving…' : isNew ? 'Add provider' : `Save ${d.tag || 'provider'}`}
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
    </label>
  );
}

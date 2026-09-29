import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { usePeople, useProperties, useProviders, useRequests, useSaveProvider } from '../../lib/hooks';
import type { ProviderDraft } from '../../lib/hooks';
import { providerFor, rulesSummary } from '../../lib/requests';
import { BOROUGHS, canonicalBorough } from '../../lib/london';
import type { Provider, ProviderRules } from '../../lib/types';

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
      <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
        <Icon name="alert" size={20} className="mt-0.5" />
        <div>
          <strong>Providers need a one-off database update.</strong> In Supabase, open the SQL Editor, paste in{' '}
          <code className="font-mono text-[13px]">supabase/migrations/0010_providers_requests.sql</code> and click Run. It adds your existing tags (BP, SR, ZUB and the rest) ready to fill in.
        </div>
      </div>
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
  const [d, setD] = useState<ProviderDraft>({ ...initial, rules: { ...(initial.rules ?? {}) } });
  const [boroughText, setBoroughText] = useState((initial.rules?.boroughs ?? []).join(', '));
  const set = <K extends keyof ProviderDraft>(k: K, v: ProviderDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const rule = <K extends keyof ProviderRules>(k: K, v: ProviderRules[K]) => setD((x) => ({ ...x, rules: { ...x.rules, [k]: v } }));
  const toggle = (k: 'benefits_required' | 'household_allowed', v: string) => {
    const now = d.rules[k] ?? [];
    rule(k, now.includes(v) ? now.filter((x) => x !== v) : [...now, v]);
  };
  const isNew = !('id' in initial) || !initial.id;

  const submit = (active = d.active) => {
    const boroughs = boroughText.split(',').map((b) => canonicalBorough(b) ?? b.trim()).filter(Boolean);
    const rules: ProviderRules = {
      ...(d.rules.benefits_required?.length ? { benefits_required: d.rules.benefits_required } : {}),
      ...(d.rules.household_allowed?.length ? { household_allowed: d.rules.household_allowed } : {}),
      ...(d.rules.max_rent ? { max_rent: d.rules.max_rent } : {}),
      ...(boroughs.length ? { boroughs } : {}),
      ...(d.rules.furnished ? { furnished: d.rules.furnished } : {}),
    };
    save.mutate({ ...d, active, rules }, {
      onSuccess: (p) => { toast(isNew ? `Added ${p.tag}` : active ? `Saved ${p.tag}` : `${p.tag} switched off`, 'success'); onDone(); },
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

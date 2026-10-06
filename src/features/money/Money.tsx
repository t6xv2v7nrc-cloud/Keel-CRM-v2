import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import {
  useDeals, useDeleteReceivable, usePeople, useProperties, useProviders, useReceivables, useSaveReceivable,
} from '../../lib/hooks';
import { todayIso } from '../../lib/calls';
import { money, shortDate } from '../../lib/format';
import { BOROUGHS } from '../../lib/london';
import {
  amountWords, dueDate, dueRuleFor, dueWords, feeChaseText, incentiveFor, isOpen, KIND_LABEL, LANDLORD, lettingFeeFor, overdueDays, owed,
  ruleWords, STATUS_LABEL, STATUSES, totals,
} from '../../lib/money';
import type { ReceivableDraft } from '../../lib/money';
import { shortAddress } from '../../lib/progress';
import { providerFor } from '../../lib/requests';
import { councilOf } from '../../lib/search';
import { waLink } from '../../lib/whatsapp';
import type { Applicant, Provider, Receivable, ReceivableStatus } from '../../lib/types';

const input = 'h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const small = 'min-h-0 px-3 py-1.5 text-[13px]';

export function MoneyNeedsUpdate() {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
      <Icon name="alert" size={20} className="mt-0.5" />
      <div>
        <strong>Receivables need a one-off database update.</strong> In Supabase, open the SQL Editor, paste in{' '}
        <code className="font-mono text-[13px]">supabase/migrations/0012_money.sql</code> and click Run. Then reload this page.
      </div>
    </div>
  );
}

/** "Overdue 5 days" in amber, or the due date. */
export function DueChip({ r }: { r: Receivable }) {
  const late = overdueDays(r) !== null;
  const paid = r.status === 'paid';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-semibold"
      style={late ? { background: 'var(--note-bg)', color: 'var(--note-fg)' } : paid ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
      {late && <Icon name="alert" size={11} strokeWidth={2.2} />}
      {paid ? `Paid${r.paid_on ? ` ${shortDate(r.paid_on)}` : ''}` : r.status === 'declined' ? 'Declined' : dueWords(r)}
    </span>
  );
}

// ── One fee or incentive, with its next actions ────────────────────

export function MoneyRow({ r, client, provider, showClient = true }: { r: Receivable; client: Applicant | null; provider: Provider | null; showClient?: boolean }) {
  const save = useSaveReceivable();
  const { myName } = usePeople();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const set = (status: ReceivableStatus, extra: Partial<Receivable> = {}, done = STATUS_LABEL[status]) =>
    save.mutate({ draft: { ...r, ...extra, status }, was: r }, {
      onSuccess: () => toast(`${KIND_LABEL[r.kind]} from ${r.payer}: ${done.toLowerCase()}`, 'success'),
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  const chase = r.kind === 'letting_fee' && provider?.whatsapp && client ? waLink(provider.whatsapp, feeChaseText(r, provider, client, myName)) : null;

  if (editing) return <li className="py-3"><ReceivableForm initial={r} was={r} council={client ? councilOf(client) : null} onDone={() => setEditing(false)} /></li>;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="flex min-w-[130px] flex-col items-start gap-1">
        <span className="font-mono text-[17px] font-semibold text-[var(--ink)]">{amountWords(r)}</span>
        <DueChip r={r} />
      </div>
      <div className="min-w-[200px] flex-1">
        <div className="text-[15px] font-medium text-[var(--ink)]">{KIND_LABEL[r.kind]} · {r.payer}</div>
        <div className="text-[13px] text-[var(--ink-muted)]">
          {showClient && client && <><Link to={`/applicants/${client.id}`} className="text-[var(--ink)] hover:underline">{client.full_name}</Link> · </>}
          {r.property_address ? shortAddress(r.property_address) : 'No property set'}
          {r.sign_up_on && ` · signed up ${shortDate(r.sign_up_on)}`}
          {r.kind === 'incentive' && r.claim_submitted_on && ` · claimed ${shortDate(r.claim_submitted_on)}`}
          {isOpen(r) && r.status !== 'due' && ` · ${STATUS_LABEL[r.status]}`}
        </div>
        {r.notes && <div className="text-[13px] text-[var(--ink-muted)]">{r.notes}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isOpen(r) && r.kind === 'incentive' && r.status === 'to_claim' && (
          <Button className={small} disabled={save.isPending} onClick={() => set('submitted', { claim_submitted_on: todayIso() }, 'claim submitted')}>Claim submitted</Button>
        )}
        {isOpen(r) && r.status !== 'to_claim' && (chase ? (
          <a href={chase} target="_blank" rel="noreferrer" onClick={() => set('chased')} title={`Chase ${r.payer} on WhatsApp`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
            <Icon name="chat" size={14} /> Chase
          </a>
        ) : (
          <Button className={small} disabled={save.isPending} onClick={() => set('chased')}>Chased</Button>
        ))}
        {isOpen(r) && (
          <Button variant="primary" className={small} disabled={save.isPending} onClick={() => set('paid', { paid_on: todayIso() })}><Icon name="check" size={14} />Paid</Button>
        )}
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit" title="Edit"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"><Icon name="pencil" size={15} /></button>
      </div>
    </li>
  );
}

// ── Add or edit ────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

/** A letting fee or incentive. The due date follows the sign-up date (and the payer's rule) until you change it by hand. */
export function ReceivableForm({ initial, was = null, council, onDone }: { initial: ReceivableDraft; was?: Receivable | null; council: string | null; onDone: () => void }) {
  const { providers } = useProviders();
  const save = useSaveReceivable();
  const remove = useDeleteReceivable();
  const { toast } = useToast();
  const [d, setD] = useState<ReceivableDraft>(initial);
  const [dueByHand, setDueByHand] = useState(Boolean(was)); // an existing due date is left alone unless sign up changes
  const fee = d.kind === 'letting_fee';
  const provider = providers.find((p) => p.id === d.provider_id) ?? null;
  const payerChoice = d.provider_id ?? (d.payer === LANDLORD ? 'landlord' : 'other');
  const patch = (p: Partial<ReceivableDraft>, recalc = false) => setD((x) => {
    const next = { ...x, ...p };
    if (recalc && !dueByHand) next.due_on = dueDate(next.kind, next.sign_up_on, providers.find((q) => q.id === next.provider_id) ?? null);
    return next;
  });
  const rule = dueRuleFor(d.kind, provider);

  const submit = () => save.mutate({ draft: d, was }, {
    onSuccess: () => { toast(was ? 'Saved' : `${KIND_LABEL[d.kind]} added to Receivables`, 'success'); onDone(); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4 shadow-[0_0_0_4px_var(--accent-soft)]">
      <div className="text-[15px] font-semibold text-[var(--ink)]">{was ? 'Edit' : 'Add'} {KIND_LABEL[d.kind].toLowerCase()}{d.property_address ? ` · ${shortAddress(d.property_address)}` : ''}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fee ? (
          <Field label="Who pays">
            <select value={payerChoice} className={input} onChange={(e) => {
              const v = e.target.value;
              const p = providers.find((q) => q.id === v);
              if (p) patch({ provider_id: p.id, payer: p.name, amount: d.amount ?? p.rules?.fee_amount ?? null }, true);
              else patch({ provider_id: null, payer: v === 'landlord' ? LANDLORD : '' }, true);
            }}>
              {providers.filter((p) => p.active || p.id === d.provider_id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.name !== p.tag ? ` (${p.tag})` : ''}</option>)}
              <option value="landlord">Landlord</option>
              <option value="other">Someone else</option>
            </select>
            {payerChoice === 'other' && <input value={d.payer} onChange={(e) => patch({ payer: e.target.value })} placeholder="Who pays the fee" className={input} />}
          </Field>
        ) : (
          <Field label="Council">
            <input value={d.payer.replace(/ council$/i, '')} list="keel-councils" placeholder={council ?? 'e.g. Barnet'} className={input}
              onChange={(e) => patch({ payer: e.target.value.trim() ? `${e.target.value.trim()} council` : '' })} />
            <datalist id="keel-councils">{BOROUGHS.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
        )}
        <Field label="Amount">
          <span className="flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)]">
            <span className="pl-3 font-mono text-[15px] text-[var(--ink-muted)]">£</span>
            <input type="number" min={0} step={10} value={d.amount ?? ''} placeholder="Not known yet" aria-label="Amount"
              onChange={(e) => patch({ amount: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              className="h-10 w-full bg-transparent px-2 font-mono text-[15px] text-[var(--ink)] outline-none" />
          </span>
        </Field>
        <Field label="Sign-up date">
          <input type="date" value={d.sign_up_on ?? ''} onChange={(e) => patch({ sign_up_on: e.target.value || null }, true)} className={input} />
        </Field>
        {!fee && (
          <Field label="Claim submitted">
            <input type="date" value={d.claim_submitted_on ?? ''} className={input}
              onChange={(e) => patch({ claim_submitted_on: e.target.value || null, ...(e.target.value && d.status === 'to_claim' ? { status: 'submitted' as const } : {}) })} />
          </Field>
        )}
        <Field label="Due date" hint={dueByHand ? 'Set by hand' : `${provider && fee && provider.rules?.fee_due ? `${provider.name}: ` : ''}${ruleWords(rule)}`}>
          <input type="date" value={d.due_on ?? ''} onChange={(e) => { setDueByHand(true); patch({ due_on: e.target.value || null }); }} className={input} />
        </Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => patch({ status: e.target.value as ReceivableStatus })} className={input}>
            {STATUSES[d.kind].map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <input value={d.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} placeholder="Optional" className={input} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {was && (
          <button type="button" disabled={remove.isPending} className="mr-auto text-[13px] text-[var(--danger)] hover:underline"
            onClick={() => { if (window.confirm(`Remove this ${KIND_LABEL[was.kind].toLowerCase()}? This cannot be undone.`)) remove.mutate(was, { onSuccess: () => { toast('Removed', 'success'); onDone(); } }); }}>
            Remove it
          </button>
        )}
        <span className={was ? '' : 'mr-auto'} />
        <Button className={small} onClick={onDone}>Cancel</Button>
        <Button variant="primary" className={small} disabled={save.isPending || !d.payer.trim()} onClick={submit}>
          {save.isPending ? 'Saving…' : was ? 'Save changes' : `Add ${KIND_LABEL[d.kind].toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}

// ── On a client's page ─────────────────────────────────────────────

/** The client's letting fee and incentive, once a property is accepted or they have moved in. */
export function MoneyCard({ applicant }: { applicant: Applicant }) {
  const { receivables, ready } = useReceivables();
  const { deals } = useDeals();
  const { data: properties = [] } = useProperties();
  const { providers } = useProviders();
  const [adding, setAdding] = useState<ReceivableDraft | null>(null);
  const mine = receivables.filter((r) => r.applicant_id === applicant.id);
  // the placement: where they moved in, or the offer that was accepted
  const placed = deals.find((d) => d.applicant_id === applicant.id && d.status === 'moved_in') ?? deals.find((d) => d.applicant_id === applicant.id && d.status === 'accepted') ?? null;
  if (!ready || (mine.length === 0 && !placed)) return null;

  const property = placed ? properties.find((p) => p.id === placed.property_id) ?? properties.find((p) => p.address_line === placed.address) ?? null : null;
  const base = { applicantId: applicant.id, dealId: placed?.id ?? null, address: placed?.address ?? null, signUpOn: placed?.move_in_on ?? todayIso() };
  const open = owed(mine);
  const t = totals(mine);

  return (
    <Card>
      <CardHeader icon="pound" title="Receivables" sub={open.length ? `${money(t.owed)} owed${t.overdueCount ? ` · ${t.overdueCount} overdue` : ''}` : mine.length ? 'All paid' : undefined} help="money">
        <Button className={small} onClick={() => setAdding(lettingFeeFor({ ...base, provider: property ? providerFor(property, providers) : null }))}><Icon name="plus" size={14} />Letting fee</Button>
        <Button className={small} onClick={() => setAdding(incentiveFor({ ...base, council: councilOf(applicant) }))}><Icon name="plus" size={14} />Incentive</Button>
      </CardHeader>
      <div className="flex flex-col gap-2 px-5 py-3">
        {adding && <ReceivableForm initial={adding} council={councilOf(applicant)} onDone={() => setAdding(null)} />}
        {mine.length === 0 && !adding && (
          <p className="m-0 py-1 text-[14px] text-[var(--ink-muted)]">Nothing recorded yet. A letting fee is added here by itself when they move in; add an incentive if the council pays one.</p>
        )}
        <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
          {[...open, ...mine.filter((r) => !isOpen(r))].map((r) => (
            <MoneyRow key={r.id} r={r} client={applicant} provider={providers.find((p) => p.id === r.provider_id) ?? null} showClient={false} />
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ── On Home ────────────────────────────────────────────────────────

/** Home: what is owed and what is overdue, with the most pressing few. */
export function MoneyOwedSummary({ applicants }: { applicants: Applicant[] }) {
  const { receivables, ready } = useReceivables();
  const { providers } = useProviders();
  const list = owed(receivables);
  if (!ready || list.length === 0) return null;
  const t = totals(receivables);
  const byId = new Map(applicants.map((a) => [a.id, a]));
  return (
    <Card>
      <CardHeader icon="pound" title="Receivables" sub={`${money(t.owed)} owed${t.overdueCount ? ` · ${money(t.overdue)} overdue` : ''}`} help="money">
        <Link to="/receivables" className="text-[13px] text-[var(--link)] hover:underline">See all {list.length}</Link>
      </CardHeader>
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-5 py-0">
        {list.slice(0, 4).map((r) => <MoneyRow key={r.id} r={r} client={byId.get(r.applicant_id) ?? null} provider={providers.find((p) => p.id === r.provider_id) ?? null} />)}
      </ul>
    </Card>
  );
}

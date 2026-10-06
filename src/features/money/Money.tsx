import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import {
  useDeals, useDeleteReceivable, usePeople, useProperties, useProviders, useReceivables, useSaveReceivable,
} from '../../lib/hooks';
import { todayIso } from '../../lib/calls';
import { money, moneyExact, moneyFee, shortDate } from '../../lib/format';
import { BOROUGHS } from '../../lib/london';
import {
  amountWords, awaitingFirstRent, BASIS_LABEL, basisWords, dueOn, dueWords, feeChaseText, feeFrom, firstRentExpected, firstRentLate, gapFor,
  incentiveFor, isOpen, KIND_LABEL, LANDLORD, lettingFeeFor, overdueDays, owed, placementOf, potentials, potentialTotals, ruleWords, STATUS_LABEL,
  STATUSES, totals, usualFee,
} from '../../lib/money';
import type { ReceivableDraft } from '../../lib/money';
import { DEAL_LABEL, shortAddress } from '../../lib/progress';
import { councilOf } from '../../lib/search';
import { waLink } from '../../lib/whatsapp';
import type { Applicant, DueFrom, FeeBasis, Provider, Receivable, ReceivableStatus } from '../../lib/types';

const input = 'h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
const small = 'min-h-0 px-3 py-1.5 text-[13px]';

function UpdateNote({ title, file, children }: { title: string; file: string; children?: ReactNode }) {
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
      <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
      <div>
        <strong>{title}</strong> In Supabase, open the SQL Editor, paste in{' '}
        <code className="break-all font-mono text-[13px]">supabase/migrations/{file}</code> and click Run. Then reload this page.{children}
      </div>
    </div>
  );
}

export function MoneyNeedsUpdate() {
  return <UpdateNote title="Finances need a one-off database update." file="0012_money.sql" />;
}

/** Shown once 0012 is in but 0013 is not: everything works, but fees are kept without how they were worked out, and there are no invoices. */
export function FinancesNeedsUpdate() {
  return (
    <UpdateNote title="One more database update for invoices and first-rent dates." file="0013_finances.sql">
      {' '}Until then, fees worked out from the rent save as plain amounts, and invoices cannot be raised.
    </UpdateNote>
  );
}

/** "Overdue 5 days" in amber, "Waiting for first rent", or the due date. */
export function DueChip({ r }: { r: Receivable }) {
  const late = overdueDays(r) !== null || firstRentLate(r) !== null;
  const paid = r.status === 'paid';
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold"
      style={late ? { background: 'var(--note-bg)', color: 'var(--note-fg)' } : paid ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
      {late && <Icon name="alert" size={11} strokeWidth={2.2} />}
      {!late && awaitingFirstRent(r) && <Icon name="clock" size={11} strokeWidth={2.2} />}
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
  const waiting = awaitingFirstRent(r);
  const rentIn = () => {
    const next = { ...r, first_rent_paid_on: todayIso() };
    const due = dueOn(next, provider);
    save.mutate({ draft: { ...next, due_on: due }, was: r }, {
      onSuccess: () => toast(`First month's rent in. ${KIND_LABEL[r.kind]} from ${r.payer} ${due ? `now due ${shortDate(due)}` : 'now due'}`, 'success'),
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const chase = r.kind === 'letting_fee' && provider?.whatsapp && client ? waLink(provider.whatsapp, feeChaseText(r, provider, client, myName)) : null;
  const how = basisWords(r);

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
        {(how || r.invoice_number || (r.due_after === 'first_rent' && r.first_rent_paid_on)) && (
          <div className="text-[13px] text-[var(--ink-muted)]">
            {[how, r.due_after === 'first_rent' && r.first_rent_paid_on ? `first rent paid ${shortDate(r.first_rent_paid_on)}` : null,
              r.invoice_number ? `invoice ${r.invoice_number}${r.invoiced_on ? ` raised ${shortDate(r.invoiced_on)}` : ''}` : null].filter(Boolean).join(' · ')}
          </div>
        )}
        {r.notes && <div className="text-[13px] text-[var(--ink-muted)]">{r.notes}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {waiting && (
          <Button className={small} disabled={save.isPending} onClick={rentIn} title="The client's first month's rent has been paid, so the fee falls due">First rent paid</Button>
        )}
        {isOpen(r) && r.kind === 'incentive' && r.status === 'to_claim' && (
          <Button className={small} disabled={save.isPending} onClick={() => set('submitted', { claim_submitted_on: todayIso() }, 'claim submitted')}>Claim submitted</Button>
        )}
        {isOpen(r) && !waiting && r.status !== 'to_claim' && (chase ? (
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
        <Link to={`/finances/invoice/${r.id}`} title={r.invoice_number ? `Open invoice ${r.invoice_number}` : 'Raise an invoice for this'}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
          <Icon name="file" size={14} />{r.invoice_number ?? 'Invoice'}
        </Link>
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit" title="Edit"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"><Icon name="pencil" size={15} /></button>
      </div>
    </li>
  );
}

// ── Add or edit ────────────────────────────────────────────────────

function Field({ label, hint, className = '', children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

/** "£" in front of a number box. */
function Pounds({ value, onChange, placeholder, label, className = '' }: {
  value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; label: string; className?: string;
}) {
  return (
    <span className={`flex items-center rounded-md border border-[var(--line-strong)] bg-[var(--surface)] focus-within:border-[var(--accent)] ${className}`}>
      <span className="pl-3 font-mono text-[15px] text-[var(--ink-muted)]">£</span>
      <input type="number" min={0} step="any" inputMode="decimal" value={value ?? ''} placeholder={placeholder} aria-label={label}
        onChange={(e) => onChange(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
        className="h-10 w-full min-w-0 bg-transparent px-2 font-mono text-[15px] text-[var(--ink)] outline-none" />
    </span>
  );
}

const BASES: FeeBasis[] = ['fixed', 'percent', 'weeks'];

/** The amount: typed in, or worked out from the rent as a percentage of a month's rent or a number of weeks' rent. */
function FeeAmount({ d, patch, rentFromListing }: { d: ReceivableDraft; patch: (p: Partial<ReceivableDraft>) => void; rentFromListing: boolean }) {
  const basis: FeeBasis = d.fee_basis ?? 'fixed';
  const pick = (b: FeeBasis) => {
    if (b === 'fixed') { patch({ fee_basis: null, fee_rate: null }); return; }
    const rate = d.fee_basis === b && d.fee_rate != null ? d.fee_rate : b === 'weeks' ? 1 : 50;
    patch({ fee_basis: b, fee_rate: rate, amount: feeFrom(b, rate, d.rent_pcm) ?? d.amount });
  };
  const setRate = (rate: number | null) => patch({ fee_rate: rate, amount: feeFrom(basis, rate, d.rent_pcm) });
  const setRent = (rent: number | null) => patch({ rent_pcm: rent, amount: feeFrom(basis, d.fee_rate, rent) ?? (basis === 'fixed' ? d.amount : null) });
  const worked = basis !== 'fixed';
  return (
    <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">Amount</span>
      <div role="group" aria-label="How the amount is worked out" className="grid w-full grid-cols-3 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] p-0.5 sm:flex sm:w-fit">
        {BASES.map((b) => (
          <button key={b} type="button" aria-pressed={basis === b} onClick={() => pick(b)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium ${basis === b ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            {BASIS_LABEL[b]}
          </button>
        ))}
      </div>
      {!worked ? (
        <Pounds value={d.amount} onChange={(v) => patch({ amount: v })} placeholder="Not known yet" label="Amount" className="max-w-[260px]" />
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[15px] text-[var(--ink)]">
          <input type="number" min={0} step={basis === 'weeks' ? 0.5 : 5} inputMode="decimal" value={d.fee_rate ?? ''} aria-label={basis === 'weeks' ? 'Weeks of rent' : 'Percentage of a month\'s rent'}
            onChange={(e) => setRate(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            className="h-10 w-20 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
          <span>{basis === 'percent' ? '% of' : d.fee_rate === 1 ? 'week of' : 'weeks of'}</span>
          <Pounds value={d.rent_pcm} onChange={setRent} placeholder="Rent" label="Monthly rent" className="w-36" />
          <span>pcm</span>
          <span className="font-mono text-[17px] font-semibold">= {d.amount != null ? moneyExact(d.amount) : '·'}</span>
        </div>
      )}
      {worked && (
        <span className="text-[12px] text-[var(--ink-muted)]">
          {d.rent_pcm == null ? 'Add the monthly rent to work it out.' : rentFromListing ? 'Rent from the property listing; change it if the rent agreed was different.' : 'Monthly rent as agreed.'}
          {basis === 'weeks' && ' A week\'s rent is the monthly rent × 12 ÷ 52.'}
        </span>
      )}
    </div>
  );
}

/** A letting fee or incentive. The due date follows the sign-up date, the first rent and the payer's rule, until you change it by hand. */
export function ReceivableForm({ initial, was = null, council, onDone }: { initial: ReceivableDraft; was?: Receivable | null; council: string | null; onDone: () => void }) {
  const { providers } = useProviders();
  const save = useSaveReceivable();
  const remove = useDeleteReceivable();
  const { toast } = useToast();
  const [d, setD] = useState<ReceivableDraft>(initial);
  const [dueByHand, setDueByHand] = useState(Boolean(was)); // an existing due date is left alone unless what it counts from changes
  const fee = d.kind === 'letting_fee';
  const provider = providers.find((p) => p.id === d.provider_id) ?? null;
  const payerChoice = d.provider_id ?? (d.payer === LANDLORD ? 'landlord' : 'other');
  const waits = d.due_after === 'first_rent';
  /** Change fields; `recalc` works the due date out again (unless set by hand), 'force' even then. */
  const patch = (p: Partial<ReceivableDraft>, recalc: boolean | 'force' = false) => {
    if (recalc === 'force') setDueByHand(false);
    setD((x) => {
      const next = { ...x, ...p };
      if (recalc === 'force' || (recalc && !dueByHand)) next.due_on = dueOn(next, providers.find((q) => q.id === next.provider_id) ?? null);
      return next;
    });
  };
  const gap = gapFor(d.kind, d.due_after ?? 'sign_up', provider);

  const pickPayer = (v: string) => {
    const p = providers.find((q) => q.id === v);
    if (!p) { patch({ provider_id: null, payer: v === 'landlord' ? LANDLORD : '' }, true); return; }
    const usual = usualFee(p.rules);
    const priced = d.amount != null ? {} : usual ? { fee_basis: usual.basis === 'fixed' ? null : usual.basis, fee_rate: usual.basis === 'fixed' ? null : usual.rate, amount: feeFrom(usual.basis, usual.rate, d.rent_pcm) } : {};
    const from: DueFrom = p.rules?.fee_due?.from ?? 'sign_up';
    const timing = was ? {} : { due_after: from, first_rent_due_on: from === 'first_rent' ? d.first_rent_due_on ?? firstRentExpected(d.sign_up_on) : d.first_rent_due_on };
    patch({ provider_id: p.id, payer: p.name, ...priced, ...timing }, true);
  };

  const submit = () => save.mutate({ draft: d, was }, {
    onSuccess: () => { toast(was ? 'Saved' : `${KIND_LABEL[d.kind]} added to Finances`, 'success'); onDone(); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4 shadow-[0_0_0_4px_var(--accent-soft)]">
      <div className="text-[15px] font-semibold text-[var(--ink)]">{was ? 'Edit' : 'Add'} {KIND_LABEL[d.kind].toLowerCase()}{d.property_address ? ` · ${shortAddress(d.property_address)}` : ''}</div>
      {was?.invoice_number && (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">Invoiced as {was.invoice_number}{was.invoiced_on ? ` on ${shortDate(was.invoiced_on)}` : ''}. If the amount changes, print the invoice again.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fee ? (
          <Field label="Who pays">
            <select value={payerChoice} className={input} onChange={(e) => pickPayer(e.target.value)}>
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
        <Field label="Sign-up date">
          <input type="date" value={d.sign_up_on ?? ''} className={input}
            onChange={(e) => {
              const signUp = e.target.value || null;
              patch({ sign_up_on: signUp, ...(waits && !d.first_rent_paid_on ? { first_rent_due_on: firstRentExpected(signUp) } : {}) }, true);
            }} />
        </Field>
        {fee ? (
          <Field label="Due date counts from">
            <select value={d.due_after ?? 'sign_up'} className={input} onChange={(e) => {
              const from = e.target.value as DueFrom;
              patch({ due_after: from, first_rent_due_on: from === 'first_rent' ? d.first_rent_due_on ?? firstRentExpected(d.sign_up_on) : d.first_rent_due_on }, 'force');
            }}>
              <option value="sign_up">Sign up</option>
              <option value="first_rent">First month&apos;s rent being paid</option>
            </select>
          </Field>
        ) : (
          <Field label="Claim submitted">
            <input type="date" value={d.claim_submitted_on ?? ''} className={input}
              onChange={(e) => patch({ claim_submitted_on: e.target.value || null, ...(e.target.value && d.status === 'to_claim' ? { status: 'submitted' as const } : {}) })} />
          </Field>
        )}

        <FeeAmount d={d} patch={(p) => patch(p)} rentFromListing={initial.rent_pcm != null && d.rent_pcm === initial.rent_pcm} />

        {fee && waits && (
          <>
            <Field label="First month's rent expected" hint="On the calendar, so you can check it came in">
              <input type="date" value={d.first_rent_due_on ?? ''} onChange={(e) => patch({ first_rent_due_on: e.target.value || null }, 'force')} className={input} />
            </Field>
            <Field label="First month's rent paid" hint="Leave empty until it is in">
              <input type="date" value={d.first_rent_paid_on ?? ''} onChange={(e) => patch({ first_rent_paid_on: e.target.value || null }, 'force')} className={input} />
            </Field>
          </>
        )}
        <Field label="Due date" hint={dueByHand ? 'Set by hand' : `${provider && fee && provider.rules?.fee_due && (provider.rules.fee_due.from ?? 'sign_up') === (d.due_after ?? 'sign_up') ? `${provider.name}: ` : ''}${ruleWords(gap)}${waits && !d.first_rent_paid_on ? ' (expected)' : ''}`}>
          <input type="date" value={d.due_on ?? ''} onChange={(e) => { setDueByHand(true); patch({ due_on: e.target.value || null }); }} className={input} />
        </Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => patch({ status: e.target.value as ReceivableStatus })} className={input}>
            {STATUSES[d.kind].map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <input value={d.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} placeholder="Optional" className={input} />
        </Field>
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

/** The client's letting fee and incentive, once a property is accepted or they have moved in; before that, the fee they could bring in. */
export function MoneyCard({ applicant }: { applicant: Applicant }) {
  const { receivables, ready } = useReceivables();
  const { deals } = useDeals();
  const { data: properties = [] } = useProperties();
  const { providers } = useProviders();
  const [adding, setAdding] = useState<ReceivableDraft | null>(null);
  const mine = receivables.filter((r) => r.applicant_id === applicant.id);
  const potential = useMemo(() => potentials(deals, receivables, properties, providers).find((p) => p.deal.applicant_id === applicant.id) ?? null,
    [deals, receivables, properties, providers, applicant.id]);
  const { placed, base, provider, rentPcm } = placementOf(applicant.id, deals, properties, providers);
  if (!ready || (mine.length === 0 && !placed && !potential)) return null;

  const open = owed(mine);
  const t = totals(mine);

  return (
    <Card>
      <CardHeader icon="pound" title="Finances" sub={open.length ? `${money(t.owed)} owed${t.overdueCount ? ` · ${t.overdueCount} overdue` : ''}` : mine.length ? 'All paid' : undefined} help="money">
        <Button className={small} onClick={() => setAdding(lettingFeeFor({ ...base, provider, rentPcm }))}><Icon name="plus" size={14} />Letting fee</Button>
        <Button className={small} onClick={() => setAdding(incentiveFor({ ...base, council: councilOf(applicant) }))}><Icon name="plus" size={14} />Incentive</Button>
      </CardHeader>
      <div className="flex flex-col gap-2 px-5 py-3">
        {adding && <ReceivableForm initial={adding} council={councilOf(applicant)} onDone={() => setAdding(null)} />}
        {potential && (
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)]">
            <Icon name="trend" size={15} className="text-[var(--accent)]" />
            <span>Potential <strong className="font-mono">{potential.amount != null ? moneyFee(potential.amount) : 'fee not known'}</strong> from {potential.payer} if {shortAddress(potential.deal.address)} goes ahead</span>
            <span className="text-[var(--ink-muted)]">({DEAL_LABEL[potential.deal.status].toLowerCase()})</span>
          </p>
        )}
        {mine.length === 0 && !adding && placed && (
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

/** Home: what is owed, what is overdue and what could come in, with the most pressing few. */
export function MoneyOwedSummary({ applicants }: { applicants: Applicant[] }) {
  const { receivables, ready } = useReceivables();
  const { providers } = useProviders();
  const { deals } = useDeals();
  const { data: properties = [] } = useProperties();
  const pt = useMemo(() => potentialTotals(potentials(deals, receivables, properties, providers)), [deals, receivables, properties, providers]);
  const list = owed(receivables);
  if (!ready || list.length === 0) return null;
  const t = totals(receivables);
  const byId = new Map(applicants.map((a) => [a.id, a]));
  return (
    <Card>
      <CardHeader icon="pound" title="Finances" help="money"
        sub={`${money(t.owed)} owed${t.overdueCount ? ` · ${money(t.overdue)} overdue` : ''}${pt.total ? ` · ${money(pt.total)} potential` : ''}`}>
        <Link to="/finances" className="text-[13px] text-[var(--link)] hover:underline">See all {list.length}</Link>
      </CardHeader>
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-5 py-0">
        {list.slice(0, 4).map((r) => <MoneyRow key={r.id} r={r} client={byId.get(r.applicant_id) ?? null} provider={providers.find((p) => p.id === r.provider_id) ?? null} />)}
      </ul>
    </Card>
  );
}

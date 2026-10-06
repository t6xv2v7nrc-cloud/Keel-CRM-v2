import { useMemo, useState } from 'react';
import { Button, Card, Empty, Icon, PageHeader } from '../../components/ui';
import { useApplicants, useDeals, useProperties, useProviders, useReceivables } from '../../lib/hooks';
import { todayIso } from '../../lib/calls';
import { money } from '../../lib/format';
import { incentiveFor, isOpen, lettingFeeFor, owed, totals } from '../../lib/money';
import type { ReceivableDraft } from '../../lib/money';
import { providerFor } from '../../lib/requests';
import { councilOf } from '../../lib/search';
import type { ReceivableKind } from '../../lib/types';
import { MoneyNeedsUpdate, MoneyRow, ReceivableForm } from './Money';

const select = 'min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]';

/** Money owed: every letting fee and incentive still to come in, soonest due first, overdue flagged. */
export function MoneyPage() {
  const { receivables, ready } = useReceivables();
  const { data: applicants = [] } = useApplicants();
  const { providers } = useProviders();
  const { deals } = useDeals();
  const { data: properties = [] } = useProperties();
  const [show, setShow] = useState<'owed' | 'paid' | 'all'>('owed');
  const [kind, setKind] = useState<'all' | ReceivableKind>('all');
  const [payer, setPayer] = useState('any');
  const [adding, setAdding] = useState<ReceivableDraft | null>(null);
  const [addKind, setAddKind] = useState<ReceivableKind>('letting_fee');
  const [clientName, setClientName] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const byId = useMemo(() => new Map(applicants.map((a) => [a.id, a])), [applicants]);
  const t = totals(receivables);
  const payers = [...new Set(receivables.map((r) => r.payer))].sort();
  const list = useMemo(() => {
    const base = show === 'owed' ? owed(receivables)
      : show === 'paid' ? receivables.filter((r) => !isOpen(r)).sort((a, b) => (b.paid_on ?? b.updated_at).localeCompare(a.paid_on ?? a.updated_at))
      : [...owed(receivables), ...receivables.filter((r) => !isOpen(r))];
    return base.filter((r) => (kind === 'all' || r.kind === kind) && (payer === 'any' || r.payer === payer));
  }, [receivables, show, kind, payer]);

  /** Start a fee or incentive for a client, filled in from where they were placed. */
  const start = () => {
    const client = applicants.find((a) => a.full_name.toLowerCase() === clientName.trim().toLowerCase());
    if (!client) return;
    const placed = deals.find((d) => d.applicant_id === client.id && d.status === 'moved_in') ?? deals.find((d) => d.applicant_id === client.id && d.status === 'accepted') ?? null;
    const property = placed ? properties.find((p) => p.id === placed.property_id) ?? properties.find((p) => p.address_line === placed.address) ?? null : null;
    const base = { applicantId: client.id, dealId: placed?.id ?? null, address: placed?.address ?? null, signUpOn: placed?.move_in_on ?? todayIso() };
    setAdding(addKind === 'letting_fee' ? lettingFeeFor({ ...base, provider: property ? providerFor(property, providers) : null }) : incentiveFor({ ...base, council: councilOf(client) }));
    setAddOpen(false);
  };
  const addingFor = adding ? byId.get(adding.applicant_id) ?? null : null;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-6 pb-24">
      <PageHeader icon="pound" title="Money owed" help="money"
        sub={ready ? <>{money(t.owed)} owed across {t.owedCount}{t.overdueCount > 0 && <> · <strong className="text-[var(--note-fg)]">{money(t.overdue)} overdue</strong></>}</> : undefined}>
        {ready && <Button variant="primary" onClick={() => setAddOpen((v) => !v)}><Icon name="plus" size={16} />Add a fee or incentive</Button>}
      </PageHeader>

      {!ready && <MoneyNeedsUpdate />}

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Owed" value={money(t.owed)} hint={`${t.owedCount} ${t.owedCount === 1 ? 'item' : 'items'}${t.unpriced ? `, ${t.unpriced} with no amount yet` : ''}`} />
            <Tile label="Overdue" value={money(t.overdue)} hint={t.overdueCount ? `${t.overdueCount} to chase` : 'Nothing overdue'} warn={t.overdueCount > 0} />
            <Tile label="Due in 7 days" value={money(t.soon)} hint={`${t.soonCount} ${t.soonCount === 1 ? 'item' : 'items'}`} />
            <Tile label="Paid, last 30 days" value={money(t.paid30)} hint="Letting fees and incentives" />
          </div>

          {addOpen && (
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">Client</span>
                <input list="keel-money-clients" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Type their name" className={`${select} px-3`} />
                <datalist id="keel-money-clients">{[...applicants].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((a) => <option key={a.id} value={a.full_name} />)}</datalist>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">What</span>
                <select value={addKind} onChange={(e) => setAddKind(e.target.value as ReceivableKind)} className={select}>
                  <option value="letting_fee">Letting fee</option>
                  <option value="incentive">Council incentive</option>
                </select>
              </label>
              <Button variant="primary" disabled={!applicants.some((a) => a.full_name.toLowerCase() === clientName.trim().toLowerCase())} onClick={start}>Continue</Button>
            </Card>
          )}
          {adding && (
            <div className="flex flex-col gap-2">
              {addingFor && <div className="text-[13px] text-[var(--ink-muted)]">For {addingFor.full_name}</div>}
              <ReceivableForm initial={adding} council={addingFor ? councilOf(addingFor) : null} onDone={() => { setAdding(null); setClientName(''); }} />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Show</span>
              <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={select}>
                <option value="owed">Still owed ({t.owedCount})</option>
                <option value="paid">Paid or declined</option>
                <option value="all">Everything ({receivables.length})</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={select}>
                <option value="all">Fees and incentives</option>
                <option value="letting_fee">Letting fees</option>
                <option value="incentive">Incentives</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">From</span>
              <select value={payer} onChange={(e) => setPayer(e.target.value)} className={select}>
                <option value="any">Anyone</option>
                {payers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>

          <Card>
            {list.length === 0 ? (
              <Empty icon="check" title={receivables.length === 0 ? 'Nothing recorded yet' : 'Nothing in this view'}>
                {receivables.length === 0
                  ? 'When a client is marked as moved in on their Progress, the letting fee is added here by itself, with its due date. Add incentives from the client\'s page.'
                  : 'Change the filters above to see more.'}
              </Empty>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-5 py-0">
                {list.map((r) => <MoneyRow key={r.id} r={r} client={byId.get(r.applicant_id) ?? null} provider={providers.find((p) => p.id === r.provider_id) ?? null} />)}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, warn = false }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 p-4" style={warn ? { background: 'var(--note-bg)' } : undefined}>
      <span className={`text-[13px] font-medium ${warn ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>{label}</span>
      <span className="font-mono text-[24px] font-semibold text-[var(--ink)]">{value}</span>
      <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>
    </Card>
  );
}

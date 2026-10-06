import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, CardHeader, Empty, Icon, PageHeader } from '../../components/ui';
import { useApplicants, useDeals, useProperties, useProviders, useReceivables } from '../../lib/hooks';
import { money, moneyFee, moneyShort } from '../../lib/format';
import { byMonth, incentiveFor, isOpen, lettingFeeFor, owed, placementOf, potentials, potentialTotals, totals } from '../../lib/money';
import type { MonthTotal, ReceivableDraft } from '../../lib/money';
import { councilOf } from '../../lib/search';
import type { ReceivableKind } from '../../lib/types';
import { FinancesNeedsUpdate, MoneyNeedsUpdate, MoneyRow, ReceivableForm } from './Money';
import { PotentialList } from './Potential';
import { MoneyCalendar } from './Calendar';

const select = 'min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]';

type View = 'owed' | 'potential' | 'calendar' | 'paid';
const VIEWS: Array<{ key: View; label: string }> = [
  { key: 'owed', label: 'Owed' }, { key: 'potential', label: 'Potential' }, { key: 'calendar', label: 'Calendar' }, { key: 'paid', label: 'Paid' },
];

/** Finances: what is owed (soonest due first, overdue flagged), what could come in, when it all falls due, and what has been paid. */
export function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const view: View = VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'owed';
  const setView = (v: View) => setParams(v === 'owed' ? {} : { view: v }, { replace: true });
  const { receivables, ready, full } = useReceivables();
  const { data: applicants = [] } = useApplicants();
  const { providers } = useProviders();
  const { deals } = useDeals();
  const { data: properties = [] } = useProperties();
  const [kind, setKind] = useState<'all' | ReceivableKind>('all');
  const [payer, setPayer] = useState('any');
  const [adding, setAdding] = useState<ReceivableDraft | null>(null);
  const [addKind, setAddKind] = useState<ReceivableKind>('letting_fee');
  const [clientName, setClientName] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const byId = useMemo(() => new Map(applicants.map((a) => [a.id, a])), [applicants]);
  const t = totals(receivables);
  const pots = useMemo(() => potentials(deals, receivables, properties, providers), [deals, receivables, properties, providers]);
  const pt = potentialTotals(pots);
  const months = useMemo(() => byMonth(receivables), [receivables]);
  const payers = [...new Set(receivables.map((r) => r.payer))].sort();
  const done = receivables.filter((r) => !isOpen(r));
  const list = useMemo(() => {
    const base = view === 'paid'
      ? receivables.filter((r) => !isOpen(r)).sort((a, b) => (b.paid_on ?? b.updated_at).localeCompare(a.paid_on ?? a.updated_at))
      : owed(receivables);
    return base.filter((r) => (kind === 'all' || r.kind === kind) && (payer === 'any' || r.payer === payer));
  }, [receivables, view, kind, payer]);

  /** Start a fee or incentive for a client, filled in from where they were placed. */
  const start = () => {
    const client = applicants.find((a) => a.full_name.toLowerCase() === clientName.trim().toLowerCase());
    if (!client) return;
    const { base, provider, rentPcm } = placementOf(client.id, deals, properties, providers);
    setAdding(addKind === 'letting_fee' ? lettingFeeFor({ ...base, provider, rentPcm }) : incentiveFor({ ...base, council: councilOf(client) }));
    setAddOpen(false);
  };
  const addingFor = adding ? byId.get(adding.applicant_id) ?? null : null;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="pound" title="Finances" help="money"
        sub={ready ? <>{money(t.owed)} owed{t.overdueCount > 0 && <> · <strong className="text-[var(--note-fg)]">{money(t.overdue)} overdue</strong></>}{pt.total > 0 && <> · {money(pt.total)} potential</>}</> : undefined}>
        {ready && <Button variant="primary" onClick={() => setAddOpen((v) => !v)}><Icon name="plus" size={16} />Add a fee or incentive</Button>}
      </PageHeader>

      {!ready && <MoneyNeedsUpdate />}
      {ready && !full && <FinancesNeedsUpdate />}

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Tile label="Owed" value={money(t.owed)} onClick={() => setView('owed')}
              hint={`${t.owedCount} ${t.owedCount === 1 ? 'item' : 'items'}${t.unpriced ? `, ${t.unpriced} with no amount yet` : ''}${t.waitingCount ? `, ${t.waitingCount} waiting for first rent` : ''}`} />
            <Tile label="Overdue" value={money(t.overdue)} warn={t.overdueCount > 0 || t.checkRent > 0} onClick={() => setView('owed')}
              hint={[t.overdueCount ? `${t.overdueCount} to chase` : 'Nothing overdue', t.checkRent ? `${t.checkRent} first rent to check` : null].filter(Boolean).join(', ')} />
            <Tile label="Due in 7 days" value={money(t.soon)} onClick={() => setView('calendar')}
              hint={`${t.soonCount} ${t.soonCount === 1 ? 'item' : 'items'}`} />
            <Tile label="Potential" value={money(pt.total)} onClick={() => setView('potential')}
              hint={pt.count ? `${pt.count} ${pt.count === 1 ? 'client' : 'clients'}${pt.likelyCount ? `, ${money(pt.likely)} likely` : ''}` : 'No viewings or offers yet'} />
            <Tile label="Paid, last 30 days" value={money(t.paid30)} onClick={() => setView('paid')} hint="Letting fees and incentives" className="col-span-2 sm:col-span-1" />
          </div>

          <Card>
            <CardHeader icon="trend" title="By month" />
            <div className="px-4 pb-3 pt-4 sm:px-5">
              <MonthBars months={months} />
            </div>
          </Card>

          {addOpen && (
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1">
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

          <div role="tablist" aria-label="Finances" className="flex w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-1 sm:w-fit">
            {VIEWS.map((v) => {
              const count = v.key === 'owed' ? t.owedCount : v.key === 'potential' ? pt.count : v.key === 'paid' ? done.length : null;
              return (
                <button key={v.key} role="tab" type="button" aria-selected={view === v.key} onClick={() => setView(v.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[14px] font-medium sm:flex-none sm:px-4 ${
                    view === v.key ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                  {v.label}
                  {count ? <span className="rounded-full bg-[var(--chip-bg)] px-1.5 font-mono text-[11px] text-[var(--chip-fg)]">{count}</span> : null}
                </button>
              );
            })}
          </div>

          {view === 'potential' && <PotentialList pots={pots} byId={byId} totals={pt} />}
          {view === 'calendar' && <MoneyCalendar receivables={receivables} byId={byId} providers={providers} />}

          {(view === 'owed' || view === 'paid') && (
            <>
              <div className="flex flex-wrap items-end gap-3">
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
                {view === 'paid' && list.length > 0 && (
                  <span className="pb-2 text-[13px] text-[var(--ink-muted)]">{moneyFee(list.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.amount ?? 0), 0))} paid in this list</span>
                )}
              </div>

              <Card>
                {list.length === 0 ? (
                  <Empty icon="check" title={receivables.length === 0 ? 'Nothing recorded yet' : view === 'paid' ? 'Nothing paid yet' : 'Nothing owed in this view'}>
                    {receivables.length === 0
                      ? 'When a client is marked as moved in on their Progress, the letting fee is added here by itself, with its due date. Add incentives from the client\'s page.'
                      : 'Change the filters above to see more.'}
                  </Empty>
                ) : (
                  <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-4 py-0 sm:px-5">
                    {list.map((r) => <MoneyRow key={r.id} r={r} client={byId.get(r.applicant_id) ?? null} provider={providers.find((p) => p.id === r.provider_id) ?? null} />)}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, warn = false, onClick, className = '' }: { label: string; value: string; hint: ReactNode; warn?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)] ${className}`}
      style={warn ? { background: 'var(--note-bg)' } : undefined}>
      <span className={`text-[13px] font-medium ${warn ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>{label}</span>
      <span className="font-mono text-[22px] font-semibold text-[var(--ink)] sm:text-[24px]">{value}</span>
      <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>
    </button>
  );
}

/** Paid (green) and still owed (grey) for each month; this month is marked. */
function MonthBars({ months, height = 110 }: { months: MonthTotal[]; height?: number }) {
  const max = Math.max(1, ...months.map((m) => m.paid + m.owed));
  const empty = months.every((m) => m.paid + m.owed === 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: height + 34 }}>
        {months.map((m) => {
          const total = m.paid + m.owed;
          return (
            <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${m.label}: ${money(m.paid)} paid${m.owed ? `, ${money(m.owed)} still owed` : ''}`}>
              <span className="font-mono text-[10px] text-[var(--ink-muted)] sm:text-[11px]">{total ? moneyShort(total) : ''}</span>
              <div className="flex w-full max-w-[44px] flex-col justify-end border-b-2 border-[var(--paper-2)]" style={{ height }}>
                <div className="w-full overflow-hidden rounded-t-[5px]">
                  <div className="w-full bg-[var(--ink-faint)] opacity-50" style={{ height: (m.owed / max) * height }} />
                  <div className="w-full bg-[var(--accent)]" style={{ height: (m.paid / max) * height }} />
                </div>
              </div>
              <span className={`text-[11px] ${m.current ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--ink-muted)]'}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-[var(--ink-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent)]" />Paid</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--ink-faint)] opacity-50" />Still owed</span>
        {empty && <span>Nothing paid or due in these months yet.</span>}
      </div>
    </div>
  );
}

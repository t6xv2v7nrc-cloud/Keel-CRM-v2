import { useMemo } from 'react';
import { Button, Card, CardHeader, useToast } from '../../components/ui';
import { useApplicants, usePlacements, useUpdatePlacement } from '../../lib/hooks';
import { money } from '../../lib/format';
import type { Placement } from '../../lib/types';

const FEE_STYLE: Record<Placement['fee_status'], { bg: string; fg: string; label: string }> = {
  pending:  { bg: 'var(--stage-lead-bg)',  fg: 'var(--stage-lead-fg)',  label: 'Pending' },
  invoiced: { bg: 'var(--stage-offer-bg)', fg: 'var(--stage-offer-fg)', label: 'Invoiced' },
  paid:     { bg: 'var(--stage-placed-bg)',fg: 'var(--stage-placed-fg)',label: 'Paid' },
};

/** Fees (§8.6): placements with fee status, splits, monthly totals;
 *  mark invoiced / paid (which also advances the applicant's stage). */
export function FeesPage() {
  const { data: placements = [], isLoading } = usePlacements();
  const { data: applicants = [] } = useApplicants();
  const updatePlacement = useUpdatePlacement();
  const { toast } = useToast();

  const nameOf = useMemo(() => {
    const m = new Map(applicants.map((a) => [a.id, a.full_name]));
    return (id: string) => m.get(id) ?? 'Unknown applicant';
  }, [applicants]);

  // Our net fee = total fee minus partner split percentages.
  const netOf = (p: Placement) => {
    const total = p.fee_amount ?? 0;
    const splitPct = (p.fee_splits ?? []).reduce((s, x) => s + (x.pct || 0), 0);
    return Math.round(total * (1 - splitPct / 100));
  };

  const totals = useMemo(() => {
    let pending = 0, invoiced = 0, paid = 0;
    for (const p of placements) {
      const net = netOf(p);
      if (p.fee_status === 'paid') paid += net;
      else if (p.fee_status === 'invoiced') invoiced += net;
      else pending += net;
    }
    return { pending, invoiced, paid, pipeline: pending + invoiced };
  }, [placements]);

  const setStatus = (p: Placement, fee_status: Placement['fee_status']) => {
    updatePlacement.mutate(
      { id: p.id, fee_status },
      { onSuccess: () => toast(`${nameOf(p.applicant_id).split(' ')[0]} — fee ${fee_status}`, 'success') },
    );
  };

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Fees</h1>
        <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
          {placements.length} placements · net of partner splits
        </p>
      </header>

      {/* Money summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Pending" value={money(totals.pending)} />
        <Stat label="Invoiced" value={money(totals.invoiced)} tone="var(--stage-offer-fg)" />
        <Stat label="Paid" value={money(totals.paid)} tone="var(--success)" />
        <Stat label="In pipeline" value={money(totals.pipeline)} />
      </div>

      <Card>
        <CardHeader title="Placements" sub={`${placements.length}`} />
        {placements.length === 0 ? (
          <p className="m-0 p-5 text-[15px] text-[var(--ink-muted)]">No placements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-[var(--ink-muted)]">
                  <th className="px-5 py-2 font-medium">Applicant</th>
                  <th className="px-3 py-2 text-right font-medium">Fee</th>
                  <th className="px-3 py-2 font-medium">Split</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((p) => {
                  const s = FEE_STYLE[p.fee_status];
                  return (
                    <tr key={p.id} className="border-t border-[var(--line)]">
                      <td className="px-5 py-3 text-[var(--ink)]">{nameOf(p.applicant_id)}</td>
                      <td className="px-3 py-3 text-right font-mono text-[var(--ink)]">{p.fee_amount ? money(p.fee_amount) : '—'}</td>
                      <td className="px-3 py-3 text-[13px] text-[var(--ink-muted)]">
                        {p.fee_splits?.length ? p.fee_splits.map((x) => `${x.partner} ${x.pct}%`).join(', ') : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[var(--ink)]">{money(netOf(p))}</td>
                      <td className="px-3 py-3">
                        <span className="rounded px-2 py-0.5 text-[13px]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                      </td>
                      <td className="px-5 py-3">
                        {p.fee_status === 'pending' && (
                          <Button variant="secondary" className="min-h-0 px-3 py-1 text-[13px]" onClick={() => setStatus(p, 'invoiced')}>
                            Mark invoiced
                          </Button>
                        )}
                        {p.fee_status === 'invoiced' && (
                          <Button variant="primary" className="min-h-0 px-3 py-1 text-[13px]" onClick={() => setStatus(p, 'paid')}>
                            Mark paid
                          </Button>
                        )}
                        {p.fee_status === 'paid' && <span className="text-[13px] text-[var(--ink-muted)]">✓ complete</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[13px] text-[var(--ink-muted)]">{label}</div>
      <div className="mt-1 font-mono text-[22px] font-semibold" style={{ color: tone ?? 'var(--ink)' }}>{value}</div>
    </Card>
  );
}

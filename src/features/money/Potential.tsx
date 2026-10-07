import { Link } from 'react-router-dom';
import { Card, CardHeader, Empty, Help } from '../../components/ui';
import { money, moneyFee } from '../../lib/format';
import { basisRule, isEarly, LANDLORD, PIPELINE_STEPS } from '../../lib/money';
import type { Potential, PotentialTotals } from '../../lib/money';
import { DEAL_LABEL, shortAddress, viewingShort } from '../../lib/progress';
import type { Applicant, DealStatus } from '../../lib/types';

/** Fees that could come in, furthest along first: accepted, offer made, viewed, viewing booked, then the early ones (interested, sent). */
export function PotentialList({ pots, byId, totals }: { pots: Potential[]; byId: Map<string, Applicant>; totals: PotentialTotals }) {
  if (pots.length === 0) {
    return (
      <Card>
        <Empty icon="trend" title="No potential fees yet">
          When a property is sent to a client, the letting fee they could bring in shows here. Track properties for a client on their Progress.
        </Empty>
      </Card>
    );
  }
  const steps = [...PIPELINE_STEPS].reverse() as DealStatus[];
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px] text-[var(--ink-muted)]">
        {money(totals.total)} could come in from {totals.count} {totals.count === 1 ? 'client' : 'clients'} with a viewing booked or further
        {totals.likelyCount ? `, ${money(totals.likely)} of it from offers made or accepted` : ''}
        {totals.unpriced ? `. ${totals.unpriced} ${totals.unpriced === 1 ? 'fee is' : 'fees are'} not known yet (no usual fee for the payer, or no rent)` : ''}
        {totals.earlyCount ? `. Early ones (sent or interested) add ${money(totals.early)} to the ghost total` : ''}.{' '}
        <Help topic="potential" />
      </p>
      {steps.map((step) => {
        const group = pots.filter((p) => p.deal.status === step);
        if (!group.length) return null;
        const sum = group.reduce((s, p) => s + (p.amount ?? 0), 0);
        const unknown = group.filter((p) => p.amount == null).length;
        return (
          <Card key={step}>
            <CardHeader title={`${DEAL_LABEL[step]}${isEarly(group[0]) ? ', early' : ''}`} sub={`${unknown === group.length ? 'fee not known' : `${money(sum)}${unknown ? ` + ${unknown} not known` : ''}`} · ${group.length}`} />
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-4 py-0 sm:px-5">
              {group.map((p) => {
                const client = byId.get(p.deal.applicant_id);
                return (
                  <li key={p.deal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                    <span className="min-w-[110px] font-mono text-[17px] font-semibold text-[var(--ink)]">{p.amount != null ? moneyFee(p.amount) : 'Not known'}</span>
                    <div className="min-w-[200px] flex-1">
                      <div className="text-[15px] font-medium text-[var(--ink)]">
                        {client ? <Link to={`/applicants/${client.id}`} className="hover:underline">{client.full_name}</Link> : 'Client'} · {shortAddress(p.deal.address)}
                      </div>
                      <div className="text-[13px] text-[var(--ink-muted)]">
                        {[p.payer === LANDLORD ? 'from the landlord' : `from ${p.payer}`,
                          p.basis && p.rate != null ? `${p.basis === 'fixed' ? 'usual fee' : basisRule(p.basis, p.rate)}${p.basis !== 'fixed' && p.rent ? ` at ${money(p.rent)} pcm` : ''}` : 'no usual fee set',
                          p.deal.status === 'viewing' && p.deal.viewing_at ? `viewing ${viewingShort(p.deal.viewing_at)}` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

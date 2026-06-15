import { useProperties } from '../../lib/hooks';
import { Card } from '../../components/ui';
import { money } from '../../lib/format';
import type { Property } from '../../lib/types';

const STATUS_STYLE: Record<Property['status'], { bg: string; fg: string; label: string }> = {
  void:        { bg: 'var(--stage-lead-bg)',  fg: 'var(--stage-lead-fg)',  label: 'Void' },
  under_offer: { bg: 'var(--stage-offer-bg)', fg: 'var(--stage-offer-fg)', label: 'Under offer' },
  let:         { bg: 'var(--stage-placed-bg)',fg: 'var(--stage-placed-fg)',label: 'Let' },
  withdrawn:   { bg: 'var(--stage-lost-bg)',  fg: 'var(--stage-lost-fg)',  label: 'Withdrawn' },
};

/** Properties (§8.4): grouped by borough; rent vs LHA delta per row. */
export function PropertiesPage() {
  const { data: properties = [], isLoading } = useProperties();

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  const boroughs = [...new Set(properties.map((p) => p.borough ?? 'Unknown'))].sort();
  const voids = properties.filter((p) => p.status === 'void').length;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-6 pb-24">
      <header>
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Properties</h1>
        <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
          {properties.length} properties · {voids} void
        </p>
      </header>

      {properties.length === 0 && (
        <p className="text-[15px] text-[var(--ink-muted)]">No properties yet. File a property screenshot in the Bin.</p>
      )}

      {boroughs.map((borough) => {
        const rows = properties.filter((p) => (p.borough ?? 'Unknown') === borough);
        return (
          <Card key={borough}>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <h3 className="m-0 text-[18px] font-semibold text-[var(--ink)]">{borough}</h3>
              <span className="font-mono text-[13px] text-[var(--ink-muted)]">{rows.length}</span>
            </div>
            <table className="w-full border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-[var(--ink-muted)]">
                  <th className="px-5 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Rent</th>
                  <th className="px-3 py-2 text-right font-medium">LHA</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const delta = p.rent_pcm != null && p.lha_rate_pcm != null ? p.rent_pcm - p.lha_rate_pcm : null;
                  const s = STATUS_STYLE[p.status];
                  return (
                    <tr key={p.id} className="border-t border-[var(--line)]">
                      <td className="px-5 py-3 text-[var(--ink)]">
                        {p.address_line}
                        {p.postcode && <span className="ml-2 font-mono text-[13px] text-[var(--ink-muted)]">{p.postcode}</span>}
                      </td>
                      <td className="px-3 py-3 text-[var(--ink-muted)]">{p.property_type ?? '—'}</td>
                      <td className="px-3 py-3 text-right font-mono text-[var(--ink)]">{p.rent_pcm ? money(p.rent_pcm) : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono text-[var(--ink-muted)]">{p.lha_rate_pcm ? money(p.lha_rate_pcm) : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono" style={{ color: delta == null ? 'var(--ink-muted)' : delta > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {delta == null ? '—' : `${delta > 0 ? '+' : ''}${money(delta)}`}
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded px-2 py-0.5 text-[13px]" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}

import { tierCount, tierLabel, tierStyle } from '../../lib/tiering';

/** Priority badge with the tier's name from Team settings. Tier 1 = highest priority. */
export function TierBadge({ tier, title }: { tier: number | null | undefined; title?: string }) {
  if (typeof tier !== 'number' || tier < 1 || tier > tierCount()) {
    return <span className="text-[13px] text-[var(--ink-muted)]">·</span>;
  }
  const m = tierStyle(tier);
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[13px] font-semibold"
      style={{ background: m.bg, color: m.fg }}
      title={title}
    >
      {tierLabel(tier)}
    </span>
  );
}

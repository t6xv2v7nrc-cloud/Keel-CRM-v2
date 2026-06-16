import { TIER_META } from '../../lib/tiering';
import type { Tier } from '../../lib/tiering';

/** Tier 1/2/3 priority badge. Tier 1 = highest priority (red). */
export function TierBadge({ tier, title }: { tier: number | null | undefined; title?: string }) {
  if (tier !== 1 && tier !== 2 && tier !== 3) {
    return <span className="text-[13px] text-[var(--ink-muted)]">—</span>;
  }
  const m = TIER_META[tier as Tier];
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[13px] font-semibold"
      style={{ background: m.bg, color: m.fg }}
      title={title}
    >
      {m.label}
    </span>
  );
}

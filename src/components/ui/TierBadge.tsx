import { tierCount, tierLabel, tierStyle } from '../../lib/tiering';

/** Priority badge with the tier's name from Team settings. Tier 1 = highest priority. A client in the last tier
 *  ("everyone else") because answers are missing shows "Needs info" and what is missing (`needs`, from tierNeeds). */
export function TierBadge({ tier, title, needs }: { tier: number | null | undefined; title?: string; needs?: string[] }) {
  if (typeof tier !== 'number' || tier < 1 || tier > tierCount()) {
    return <span className="text-[13px] text-[var(--ink-muted)]">·</span>;
  }
  if (needs?.length) {
    const words = `Needs info: ${needs.join(', ')}`;
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[13px] font-semibold"
        style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }} title={`${words}. ${tierLabel(tier)} until then.`} aria-label={words}>
        Needs info
      </span>
    );
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

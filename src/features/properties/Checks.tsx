import { Icon } from '../../components/ui';
import { money } from '../../lib/format';
import { ACCOMMODATION_LABEL, BILLS_LABEL, checksFor, floorWords, SUITS_LABEL } from '../../lib/propertyChecks';
import type { Flag } from '../../lib/propertyChecks';
import type { Property } from '../../lib/types';

const TONE: Record<Flag['tone'], { bg: string; fg: string; icon: 'alert' | 'clock' | 'x' }> = {
  red: { bg: 'var(--danger-soft)', fg: 'var(--danger)', icon: 'x' },
  amber: { bg: 'var(--note-bg)', fg: 'var(--note-fg)', icon: 'alert' },
  grey: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)', icon: 'clock' },
};

/** A flag in words, never colour alone: "£36 over LHA", "Not ready to send: no EICR, 1 of 3 photos". */
export function FlagChip({ flag, full = false }: { flag: Flag; full?: boolean }) {
  const t = TONE[flag.tone];
  return (
    <span className="inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: t.bg, color: t.fg }} title={flag.detail}>
      <Icon name={t.icon} size={12} className="mt-[2px] shrink-0" />
      <span className="min-w-0">{flag.words}{full && flag.detail ? <span className="font-normal">: {flag.detail}</span> : null}</span>
    </span>
  );
}

/** Under the LHA line on a property card: the flags, then what kind of place it is, who it suits, and its papers. */
export function PropertyChecks({ property }: { property: Property }) {
  const c = checksFor(property);
  const facts = [
    c.accommodation ? `${ACCOMMODATION_LABEL[c.accommodation.type]}${c.accommodation.estimated ? ' (from its type)' : ''}` : null,
    c.suits.length ? `Suits ${c.suits.map((s) => SUITS_LABEL[s]).join(', ')}` : c.papers.known && !c.flags.some((f) => f.key === 'suits_not_set') ? 'Suits: not set' : null,
    c.sar !== null ? `Shared rate ${money(c.sar)}${c.sarGap !== null ? ` (${Math.abs(c.sarGap) < 0.005 ? 'at it' : `${money(Math.abs(c.sarGap))} ${c.sarGap > 0 ? 'over' : 'under'}`})` : ''}` : null,
    floorWords(property.floor, property.lift),
    property.bills_included?.length ? `Bills: ${property.bills_included.map((b) => BILLS_LABEL[b as keyof typeof BILLS_LABEL] ?? b).join(', ')}` : null,
  ].filter(Boolean);
  const ready = c.papers.known && c.papers.complete && !c.flags.some((f) => f.key === 'not_ready');
  // over LHA is already the red badge on the LHA line above
  const shown = c.flags.filter((f) => f.key !== 'over_lha');
  if (shown.length === 0 && facts.length === 0 && !c.papers.known) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{shown.map((f) => <FlagChip key={f.key} flag={f} full />)}</div>
      )}
      {facts.length > 0 && <div className="text-[13px] text-[var(--ink-muted)]">{facts.join(' · ')}</div>}
      {ready && (
        <div className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent-ink)]">
          <Icon name="check" size={13} /> Safety papers complete, {c.photos} photos
        </div>
      )}
    </div>
  );
}

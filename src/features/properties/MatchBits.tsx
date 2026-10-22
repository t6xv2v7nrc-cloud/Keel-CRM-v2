import { Icon } from '../../components/ui';
import { money } from '../../lib/format';
import { hiddenWords } from '../../lib/matchRules';
import type { HiddenCounts, Income, Warning } from '../../lib/matchRules';
import { chanceWords, whyWords } from '../../lib/prospects';
import type { Ease, Prospect, ProspectContext } from '../../lib/prospects';
import type { Strength } from '../../lib/propertyMatch';

/** The rules' warnings on a match: red over LHA (shown on request), amber outside London, age not known, benefit cap. */
export function RuleWarnings({ warnings, first = false }: { warnings: Warning[]; first?: boolean }) {
  const list = first ? warnings.slice(0, 1) : warnings;
  if (!list.length) return null;
  return (
    <>
      {list.map((w) => (
        <span key={w.words} className="inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold"
          style={w.tone === 'red' ? { background: 'var(--danger-soft)', color: 'var(--danger)' } : { background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
          <Icon name={w.tone === 'red' ? 'x' : 'alert'} size={12} className="mt-[2px] shrink-0" />{w.words}
        </span>
      ))}
    </>
  );
}

/** What Keel could expect from a match: "£4,250" (an incentive marks it), the parts on hover. */
export function IncomeTag({ income }: { income: Income }) {
  if (!income.words) return null;
  const strong = income.incentive !== null || income.likely;
  const label = income.total !== null ? `${income.upTo ? 'up to ' : ''}${money(income.total)}` : 'Incentive likely';
  return (
    <span title={`Keel could expect: ${income.words}`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-semibold"
      style={strong ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
      <Icon name="pound" size={11} />{label}
    </span>
  );
}

/** "3 more hidden by the rules: 2 over their LHA, 1 outside the areas they want", with the switches that show them. */
export function HiddenNote({ counts, overLha, onOverLha, outside, onOutside }: {
  counts: HiddenCounts; overLha: boolean; onOverLha: (v: boolean) => void; outside: boolean; onOutside: (v: boolean) => void;
}) {
  const canShow = (counts.over_lha ?? 0) > 0 || overLha || (counts.outside_london ?? 0) > 0 || outside;
  if (counts.total === 0 && !overLha && !outside) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-[var(--ink-muted)]">
      {counts.total > 0 && <span className="min-w-0">{counts.total} more hidden by the rules: {hiddenWords(counts)}.</span>}
      {canShow && (
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {((counts.over_lha ?? 0) > 0 || overLha) && (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={overLha} onChange={(e) => onOverLha(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Show over LHA
            </label>
          )}
          {((counts.outside_london ?? 0) > 0 || outside) && (
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={outside} onChange={(e) => onOutside(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Show outside London
            </label>
          )}
        </span>
      )}
    </div>
  );
}

const STRENGTH_STYLE: Record<Strength, { label: string; bg: string; fg: string }> = {
  strong: { label: 'Strong', bg: 'var(--strong-bg)', fg: 'var(--strong-fg)' },
  good: { label: 'Good', bg: 'var(--good-bg)', fg: 'var(--good-fg)' },
  possible: { label: 'Possible', bg: 'var(--possible-bg)', fg: 'var(--possible-fg)' },
};

/** "Strong 86": how well they fit, as a word and a score out of 100. */
export function FitBadge({ strength, fit }: { strength: Strength; fit: number | null }) {
  const x = STRENGTH_STYLE[strength];
  return (
    <span title={fit !== null ? `Fit ${fit} out of 100` : undefined} className="inline-flex w-[84px] shrink-0 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: x.bg, color: x.fg }}>
      {x.label}{fit !== null && <span className="tabular-nums opacity-80">{fit}</span>}
    </span>
  );
}

const EASE_STYLE: Record<Ease, { bg: string; fg: string }> = {
  easy: { bg: 'var(--accent)', fg: 'var(--on-accent)' },
  fair: { bg: 'var(--good-bg)', fg: 'var(--good-fg)' },
  hard: { bg: 'var(--note-bg)', fg: 'var(--note-fg)' },
  long_shot: { bg: 'var(--note-bg)', fg: 'var(--note-fg)' },
};

/** "Easy money · 70%", "45% to place", "Hard work · 15%": tap for why. */
export function ProspectTag({ prospect, open, onToggle }: { prospect: Prospect; open: boolean; onToggle: () => void }) {
  const s = EASE_STYLE[prospect.ease];
  const words = prospect.label ? `${prospect.label} · ${chanceWords(prospect)}` : `${chanceWords(prospect)} to place`;
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} title="Chance this ends in a placement: tap for why"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      <Icon name="trend" size={11} />{words}
      {prospect.expected !== null && prospect.expected > 0 && <span className="font-medium opacity-90">· ≈{money(prospect.expected)}</span>}
    </button>
  );
}

/** Why the chance is what it is, under a match. */
export function ProspectWhy({ prospect, ctx }: { prospect: Prospect; ctx: Pick<ProspectContext, 'base' | 'closed'> }) {
  return <p className="keel-rise m-0 mt-1 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--ink-muted)]">{whyWords(prospect, ctx)}</p>;
}

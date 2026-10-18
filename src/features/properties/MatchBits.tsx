import { Icon } from '../../components/ui';
import { money } from '../../lib/format';
import { hiddenWords } from '../../lib/matchRules';
import type { HiddenCounts, Income, Warning } from '../../lib/matchRules';

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

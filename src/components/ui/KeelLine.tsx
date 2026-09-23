import type { ApplicantStage } from '../../types/extraction';

// Fee stages are no longer used; a client at one of them shows as placed.
const VISIBLE_STAGES: readonly ApplicantStage[] = ['lead', 'referred', 'viewing', 'offer', 'placed'];
const LABEL: Record<string, string> = { lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer', placed: 'Placed' };

/** The Keel Line: a green spine with a tick per stage, filled once reached. */
export function KeelLine({ current }: { current: ApplicantStage }) {
  const shown = current === 'fee_invoiced' || current === 'fee_paid' ? 'placed' : current;
  const currentIdx = VISIBLE_STAGES.indexOf(shown);
  const lost = current === 'lost';
  const reachedPct = lost || currentIdx < 0 ? 0 : (currentIdx / (VISIBLE_STAGES.length - 1)) * 100;

  return (
    <ol className="relative m-0 flex list-none flex-col gap-5 py-1 pl-7">
      {/* the spine: grey track, green up to the current stage */}
      <span aria-hidden className="absolute bottom-2 left-[6px] top-2 w-[3px] rounded-full bg-[var(--paper-2)]" />
      <span aria-hidden className="absolute left-[6px] top-2 w-[3px] rounded-full bg-[var(--accent)]"
        style={{ height: `calc(${reachedPct}% - ${reachedPct ? 8 : 0}px)` }} />
      {VISIBLE_STAGES.map((stage, i) => {
        const reached = !lost && i <= currentIdx;
        const here = i === currentIdx && !lost;
        return (
          <li key={stage} className="relative flex items-center gap-3">
            <span
              aria-hidden
              className="absolute -left-7 grid h-[15px] w-[15px] place-items-center rounded-full border-2"
              style={{
                background: reached ? 'var(--accent)' : 'var(--surface)',
                borderColor: reached ? 'var(--accent)' : 'var(--line-strong)',
                boxShadow: here ? '0 0 0 4px var(--accent-soft)' : undefined,
              }}
            />
            <span className="text-[15px]" style={{ color: reached ? 'var(--ink)' : 'var(--ink-muted)', fontWeight: here ? 600 : 400 }}>
              {LABEL[stage]}
            </span>
          </li>
        );
      })}
      {lost && (
        <li className="relative flex items-center gap-3">
          <span aria-hidden className="absolute -left-7 h-[15px] w-[15px] rounded-full bg-[var(--ink-faint)]" />
          <span className="text-[15px] font-semibold text-[var(--ink-muted)]">Lost</span>
        </li>
      )}
    </ol>
  );
}

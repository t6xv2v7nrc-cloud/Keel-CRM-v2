import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage } from '../../types/extraction';

const VISIBLE_STAGES: readonly ApplicantStage[] = APPLICANT_STAGES.filter((s) => s !== 'lost');

/** The Keel Line (§7.3) — the app's one flourish.
 *  A 3px brass spine with depth-gauge ticks: filled brass when reached, hollow ahead. */
export function KeelLine({ current }: { current: ApplicantStage }) {
  const currentIdx = VISIBLE_STAGES.indexOf(current);
  const lost = current === 'lost';

  return (
    <ol className="relative m-0 flex list-none flex-col gap-5 py-1 pl-6">
      {/* the spine */}
      <span
        aria-hidden
        className="absolute bottom-1 left-[5px] top-1 w-[3px] rounded-full"
        style={{ background: lost ? 'var(--line-strong)' : 'var(--brass)' }}
      />
      {VISIBLE_STAGES.map((stage, i) => {
        const reached = !lost && i <= currentIdx;
        return (
          <li key={stage} className="relative flex items-center gap-3">
            {/* depth-gauge tick */}
            <span
              aria-hidden
              className="absolute -left-6 h-[13px] w-[13px] rounded-full border-2"
              style={{
                background: reached ? 'var(--brass)' : 'var(--surface)',
                borderColor: reached ? 'var(--brass)' : 'var(--line-strong)',
              }}
            />
            <span
              className="text-[15px]"
              style={{
                color: reached ? 'var(--ink)' : 'var(--ink-muted)',
                fontWeight: i === currentIdx ? 600 : 400,
              }}
            >
              {stage.replace('_', ' ')}
            </span>
          </li>
        );
      })}
      {lost && (
        <li className="relative flex items-center gap-3">
          <span
            aria-hidden
            className="absolute -left-6 h-[13px] w-[13px] rounded-full"
            style={{ background: 'var(--danger)' }}
          />
          <span className="text-[15px] font-semibold" style={{ color: 'var(--danger)' }}>
            lost
          </span>
        </li>
      )}
    </ol>
  );
}

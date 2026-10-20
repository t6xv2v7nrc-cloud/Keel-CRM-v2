import type { ApplicantStage } from '../../types/extraction';

const STAGE_LABELS: Record<ApplicantStage, string> = {
  lead: 'Lead',
  referred: 'Referred',
  viewing: 'Viewing',
  offer: 'Offer',
  placed: 'Placed',
  fee_invoiced: 'Fee invoiced',
  fee_paid: 'Fee paid',
  lost: 'Lost',
};

/** Stage badge — tinted background + dark text per token table (§7.1). */
export function StageBadge({ stage }: { stage: ApplicantStage }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[13px] font-medium"
      style={{
        background: `var(--stage-${stage}-bg)`,
        color: `var(--stage-${stage}-fg)`,
      }}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

/** "New": a client who got in touch in the last 7 days. */
export function NewBadge() {
  return (
    <span title="Got in touch in the last 7 days"
      className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--on-accent)]">
      <span aria-hidden className="keel-ping h-1.5 w-1.5 rounded-full bg-current" />New
    </span>
  );
}

/** "On ice", with the return date when there is one. */
export function IceBadge({ until }: { until?: string | null }) {
  return (
    <span title="Paused until they are ready: not matched, not flagged as stuck"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-semibold"
      style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
      On ice{until ? ` until ${until}` : ''}
    </span>
  );
}

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

/** Generic neutral badge for everything that is not a stage. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--ink-muted)]">
      {children}
    </span>
  );
}

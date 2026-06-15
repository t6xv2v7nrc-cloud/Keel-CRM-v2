import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApplicants, useMoveStage } from '../../lib/hooks';
import { useToast } from '../../components/ui';
import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage } from '../../types/extraction';
import type { Applicant } from '../../lib/types';
import { money, timeAgo } from '../../lib/format';

const BOARD_STAGES = APPLICANT_STAGES.filter((s) => s !== 'lost') as ApplicantStage[];

const STAGE_LABEL: Record<ApplicantStage, string> = {
  lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer',
  placed: 'Placed', fee_invoiced: 'Fee invoiced', fee_paid: 'Fee paid', lost: 'Lost',
};

/** Pipeline kanban (§8.2). Drag a card to a later column to advance the stage;
 *  each move logs an activity. Backwards moves are blocked (monotonic). */
export function PipelinePage() {
  const { data: applicants = [], isLoading } = useApplicants();
  const moveStage = useMoveStage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ApplicantStage | null>(null);

  const byStage = (stage: ApplicantStage) => applicants.filter((a) => a.stage === stage);

  const handleDrop = (to: ApplicantStage) => {
    setOverStage(null);
    const a = applicants.find((x) => x.id === dragId);
    setDragId(null);
    if (!a || a.stage === to) return;
    const fromIdx = BOARD_STAGES.indexOf(a.stage);
    const toIdx = BOARD_STAGES.indexOf(to);
    if (toIdx < fromIdx) {
      toast('Stages only move forward. Open the record to move it back.', 'danger');
      return;
    }
    moveStage.mutate(
      { id: a.id, from: a.stage, to },
      { onSuccess: () => toast(`${a.full_name.split(' ')[0]} → ${STAGE_LABEL[to]}`, 'success') },
    );
  };

  const lost = byStage('lost');

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col p-6">
      <header className="mb-4">
        <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Pipeline</h1>
        <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
          {applicants.length} applicants · drag a card forward to advance
        </p>
      </header>

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {BOARD_STAGES.map((stage) => {
          const cards = byStage(stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => handleDrop(stage)}
              className="flex w-[260px] shrink-0 flex-col rounded-lg border transition-colors"
              style={{
                borderColor: overStage === stage ? 'var(--brass)' : 'var(--line)',
                background: overStage === stage ? 'var(--stage-offer-bg)' : 'var(--surface)',
              }}
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
                <span className="text-[15px] font-semibold text-[var(--ink)]">{STAGE_LABEL[stage]}</span>
                <span className="font-mono text-[13px] text-[var(--ink-muted)]">{cards.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {cards.map((a) => (
                  <ApplicantCard
                    key={a.id}
                    a={a}
                    onDragStart={() => setDragId(a.id)}
                    onClick={() => navigate(`/applicants/${a.id}`)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="grid h-16 place-items-center text-[13px] text-[var(--ink-muted)]">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {lost.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
          <span className="rounded bg-[var(--stage-lost-bg)] px-2 py-0.5 text-[var(--stage-lost-fg)]">Lost</span>
          {lost.map((a) => (
            <button key={a.id} onClick={() => navigate(`/applicants/${a.id}`)} className="hover:text-[var(--ink)] hover:underline">
              {a.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicantCard({ a, onDragStart, onClick }: { a: Applicant; onDragStart: () => void; onClick: () => void }) {
  const lhaGap = a.budget_pcm; // budget shown; LHA delta added in property context
  const days = Math.floor((Date.now() - new Date(a.updated_at).getTime()) / 86_400_000);
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="cursor-pointer rounded-md border border-[var(--line)] bg-[var(--paper)] p-3 transition-shadow hover:shadow-[var(--shadow-card)]"
    >
      <div className="text-[15px] font-medium text-[var(--ink)]">{a.full_name}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] text-[var(--ink-muted)]">
        {a.referring_borough && <span>{a.referring_borough}</span>}
        {a.benefit_type && <span>· {a.benefit_type}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {lhaGap != null ? (
          <span className="rounded bg-[var(--stage-offer-bg)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--stage-offer-fg)]">
            {money(lhaGap)}
          </span>
        ) : <span />}
        <span className="font-mono text-[13px] text-[var(--ink-muted)]" title={`Updated ${timeAgo(a.updated_at)}`}>
          {days === 0 ? 'today' : `${days}d`}
        </span>
      </div>
    </article>
  );
}

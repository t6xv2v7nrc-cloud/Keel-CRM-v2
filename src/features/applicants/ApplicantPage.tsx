import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, KeelLine, StageBadge } from '../../components/ui';
import {
  useActivities,
  useApplicant,
  usePlacementForApplicant,
} from '../../lib/hooks';
import { money, shortDate, timeAgo } from '../../lib/format';
import type { Activity } from '../../lib/types';

export function ApplicantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: applicant, isLoading } = useApplicant(id);
  const { data: activities = [] } = useActivities('applicant', id);
  const { data: placement } = usePlacementForApplicant(id);

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;
  if (!applicant) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Applicant not found.</div>;

  const household = [
    applicant.adults ? `${applicant.adults} adult${applicant.adults > 1 ? 's' : ''}` : null,
    applicant.children ? `${applicant.children} child${applicant.children > 1 ? 'ren' : ''}` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 p-6 pb-24">
      <button onClick={() => navigate('/pipeline')} className="self-start text-[15px] text-[var(--link)] hover:underline">
        ← Pipeline
      </button>

      {/* Hero */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">{applicant.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[15px] text-[var(--ink-muted)]">
              {applicant.phone && <span>{applicant.phone}</span>}
              {applicant.referring_borough && <span>{applicant.referring_borough}</span>}
              {applicant.benefit_type && <span>{applicant.benefit_type}</span>}
            </div>
          </div>
          <StageBadge stage={applicant.stage} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-4">
          <Meta label="Household" value={household || '—'} />
          <Meta label="Budget" value={applicant.budget_pcm ? money(applicant.budget_pcm) : '—'} mono />
          <Meta label="LHA band" value={applicant.lha_band || '—'} />
          <Meta label="Source" value={applicant.source || '—'} />
        </dl>

        {applicant.requirements && (
          <p className="mt-4 mb-0 text-[15px] text-[var(--ink)]">{applicant.requirements}</p>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Timeline with screenshot provenance */}
        <Card>
          <CardHeader title="Timeline" sub={`${activities.length} events`} />
          <div className="p-5">
            {activities.length === 0 ? (
              <p className="m-0 text-[15px] text-[var(--ink-muted)]">No activity yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {activities.map((act) => <TimelineRow key={act.id} act={act} />)}
              </ul>
            )}
          </div>
        </Card>

        {/* Right column: stage progress + placement */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Progress" />
            <div className="p-5">
              <KeelLine current={applicant.stage} />
            </div>
          </Card>

          {placement && (
            <Card>
              <CardHeader title="Placement" />
              <div className="flex flex-col gap-2 p-5 text-[15px]">
                <Row label="Move-in" value={shortDate(placement.move_in_date)} />
                <Row label="Rent" value={placement.rent_pcm ? money(placement.rent_pcm) : '—'} />
                <Row label="Incentive" value={placement.incentive_amount ? money(placement.incentive_amount) : '—'} />
                <Row label="Fee" value={placement.fee_amount ? money(placement.fee_amount) : '—'} />
                <Row
                  label="Fee status"
                  value={placement.fee_status}
                />
                {placement.fee_splits?.length > 0 && (
                  <div className="mt-1 text-[13px] text-[var(--ink-muted)]">
                    Split: {placement.fee_splits.map((s) => `${s.partner} ${s.pct}%`).join(', ')}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ act }: { act: Activity }) {
  const fromScreenshot = act.body.includes('screenshot') || act.inbox_item_id != null;
  return (
    <li className="relative flex gap-3 pl-5">
      <span
        aria-hidden
        className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full"
        style={{ background: fromScreenshot ? 'var(--brass)' : 'var(--line-strong)' }}
      />
      <div className="flex-1">
        <div className="text-[15px] text-[var(--ink)]">{act.body}</div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[13px] text-[var(--ink-muted)]">
          <span>{act.kind.replace('_', ' ')}</span>
          <span>·</span>
          <span>{timeAgo(act.created_at)}</span>
          {fromScreenshot && (
            <span className="rounded bg-[var(--stage-offer-bg)] px-1.5 py-0.5 text-[var(--stage-offer-fg)]">from screenshot</span>
          )}
        </div>
      </div>
    </li>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-[var(--ink-muted)]">{label}</dt>
      <dd className={`m-0 mt-1 text-[15px] text-[var(--ink)] ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--ink-muted)]">{label}</span>
      <span className="font-mono text-[var(--ink)]">{value}</span>
    </div>
  );
}

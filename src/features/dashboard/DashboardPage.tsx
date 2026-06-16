import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, TierBadge } from '../../components/ui';
import {
  useApplicants,
  usePlacements,
  useProperties,
  useRecentActivity,
} from '../../lib/hooks';
import { useAuth } from '../auth/useAuth';
import { money, timeAgo } from '../../lib/format';
import { computeTier, TIER_META, URGENCY_RANK } from '../../lib/tiering';
import type { Tier } from '../../lib/tiering';
import { APPLICANT_STAGES } from '../../types/extraction';
import type { ApplicantStage } from '../../types/extraction';
import type { Applicant } from '../../lib/types';

const effTier = (a: Applicant): Tier => ((a.tier as Tier) || computeTier(a));
const isActive = (a: Applicant) => a.stage !== 'lost' && a.stage !== 'fee_paid';

const STAGE_LABEL: Record<ApplicantStage, string> = {
  lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer',
  placed: 'Placed', fee_invoiced: 'Fee invoiced', fee_paid: 'Fee paid', lost: 'Lost',
};

const ACTIVE_STAGES = APPLICANT_STAGES.filter((s) => s !== 'lost' && s !== 'fee_paid');

export function DashboardPage() {
  const { displayName } = useAuth();
  const navigate = useNavigate();
  const { data: applicants = [] } = useApplicants();
  const { data: placements = [] } = usePlacements();
  const { data: properties = [] } = useProperties();
  const { data: recent = [] } = useRecentActivity(10);

  const nameOf = useMemo(() => {
    const m = new Map(applicants.map((a) => [a.id, a.full_name]));
    return (id: string) => m.get(id) ?? null;
  }, [applicants]);

  const stats = useMemo(() => {
    const active = applicants.filter((a) => a.stage !== 'lost' && a.stage !== 'fee_paid').length;
    const voids = properties.filter((p) => p.status === 'void').length;
    let feePending = 0, feePaid = 0;
    for (const p of placements) {
      const splitPct = (p.fee_splits ?? []).reduce((s, x) => s + (x.pct || 0), 0);
      const net = Math.round((p.fee_amount ?? 0) * (1 - splitPct / 100));
      if (p.fee_status === 'paid') feePaid += net;
      else feePending += net;
    }
    return { active, voids, feePending, feePaid };
  }, [applicants, placements, properties]);

  // Tier triage over the active pipeline only (closed/placed don't need triage).
  const tiers = useMemo(() => {
    const active = applicants.filter(isActive);
    const counts: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
    let urgent = 0;
    for (const a of active) {
      counts[effTier(a)] += 1;
      if ((URGENCY_RANK[a.urgency ?? 'none'] ?? 0) >= 3) urgent += 1; // homeless / at-risk-56
    }
    return { counts, urgent, total: active.length };
  }, [applicants]);

  const byStage = (stage: ApplicantStage) => applicants.filter((a) => a.stage === stage).length;
  const greeting = getGreeting();

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6 p-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">
            {greeting}{displayName ? `, ${displayName}` : ''}
          </h1>
          <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">Here is where things stand today.</p>
        </div>
        <Button variant="brass" onClick={() => navigate('/bin')}>Paste a screenshot</Button>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active applicants" value={String(stats.active)} to="/pipeline" />
        <StatCard label="Void properties" value={String(stats.voids)} to="/properties" />
        <StatCard label="Fees pending" value={money(stats.feePending)} to="/fees" tone="var(--stage-offer-fg)" />
        <StatCard label="Fees paid" value={money(stats.feePaid)} to="/fees" tone="var(--success)" />
      </div>

      {/* Tier triage */}
      <Card>
        <CardHeader title="Referral triage" sub={`${tiers.total} active`}>
          {tiers.urgent > 0 && (
            <span className="rounded px-2 py-0.5 text-[13px] font-semibold" style={{ background: 'var(--stage-lost-bg)', color: 'var(--stage-lost-fg)' }}>
              {tiers.urgent} urgent
            </span>
          )}
          <Link to="/pipeline" className="text-[13px] text-[var(--link)] hover:underline">Open</Link>
        </CardHeader>
        <div className="grid grid-cols-3 divide-x divide-[var(--line)]">
          {([1, 2, 3] as Tier[]).map((t) => {
            const count = tiers.counts[t];
            const pct = tiers.total ? Math.round((count / tiers.total) * 100) : 0;
            return (
              <button
                key={t}
                onClick={() => navigate('/pipeline')}
                className="flex flex-col items-center gap-2 p-5 text-center transition-colors hover:bg-[var(--paper)]"
              >
                <TierBadge tier={t} />
                <div className="font-mono text-[28px] font-bold" style={{ color: TIER_META[t].fg }}>{count}</div>
                <div className="text-[13px] text-[var(--ink-muted)]">{pct}% of active</div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        {/* Pipeline breakdown */}
        <Card>
          <CardHeader title="Pipeline" sub={`${applicants.length} total`}>
            <Link to="/pipeline" className="text-[13px] text-[var(--link)] hover:underline">Open</Link>
          </CardHeader>
          <ul className="m-0 list-none p-0">
            {ACTIVE_STAGES.map((stage) => {
              const count = byStage(stage);
              const pct = applicants.length ? (count / applicants.length) * 100 : 0;
              return (
                <li key={stage} className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-2.5 last:border-b-0">
                  <span className="w-28 text-[15px] text-[var(--ink)]">{STAGE_LABEL[stage]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--paper)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--hull)' }} />
                  </div>
                  <span className="w-6 text-right font-mono text-[15px] text-[var(--ink-muted)]">{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader title="Recent activity" />
          <div className="p-5">
            {recent.length === 0 ? (
              <p className="m-0 text-[15px] text-[var(--ink-muted)]">Nothing yet. Paste a screenshot to begin.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {recent.map((act) => {
                  const name = act.entity_type === 'applicant' ? nameOf(act.entity_id) : null;
                  const fromShot = act.body.includes('screenshot') || act.inbox_item_id != null;
                  return (
                    <li key={act.id} className="flex gap-2.5">
                      <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: fromShot ? 'var(--brass)' : 'var(--line-strong)' }} />
                      <div className="min-w-0">
                        {name ? (
                          <button onClick={() => navigate(`/applicants/${act.entity_id}`)} className="text-left text-[15px] text-[var(--ink)] hover:underline">
                            {act.body}
                          </button>
                        ) : (
                          <div className="text-[15px] text-[var(--ink)]">{act.body}</div>
                        )}
                        <div className="font-mono text-[13px] text-[var(--ink-muted)]">{timeAgo(act.created_at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, to, tone }: { label: string; value: string; to: string; tone?: string }) {
  return (
    <Link to={to} className="block">
      <Card className="p-4 transition-shadow hover:shadow-[var(--shadow-pop)]">
        <div className="text-[13px] text-[var(--ink-muted)]">{label}</div>
        <div className="mt-1 font-mono text-[22px] font-semibold" style={{ color: tone ?? 'var(--ink)' }}>{value}</div>
      </Card>
    </Link>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

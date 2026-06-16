import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardHeader, Field, KeelLine, StageBadge, TierBadge, useToast } from '../../components/ui';
import {
  useActivities,
  useApplicant,
  usePlacementForApplicant,
  useUpdateApplicant,
} from '../../lib/hooks';
import { money, shortDate, timeAgo } from '../../lib/format';
import {
  computeTier, tierReason, HOUSEHOLD_LABEL, WORK_STATUS_LABEL, URGENCY_LABEL,
} from '../../lib/tiering';
import type { Activity, Applicant } from '../../lib/types';

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

      <HeroCard applicant={applicant} household={household} />

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

        {/* Right column: triage + stage progress + placement */}
        <div className="flex flex-col gap-6">
          <ReferralCard applicant={applicant} />

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

/** Referral triage card: tier (auto + manual override) and the answers. */
function ReferralCard({ applicant }: { applicant: Applicant }) {
  const update = useUpdateApplicant();
  const { toast } = useToast();

  const auto = computeTier(applicant);
  const effective = (applicant.tier as 1 | 2 | 3) || auto;
  const overridden = applicant.tier != null && applicant.tier !== auto;

  const setTier = (t: number) => {
    update.mutate(
      { id: applicant.id, tier: t },
      { onSuccess: () => toast(`Set to Tier ${t}`, 'success') },
    );
  };

  const yn = (b: boolean | null) => (b === true ? 'Yes' : b === false ? 'No' : '—');
  const rows: Array<[string, string]> = [
    ['Household', applicant.household_type ? HOUSEHOLD_LABEL[applicant.household_type] ?? applicant.household_type : '—'],
    ['On UC', yn(applicant.on_uc)],
    ['PIP', yn(applicant.pip)],
    ['LCWRA', yn(applicant.lcwra)],
    ['Council-registered', yn(applicant.council_registered)],
    ['Work', applicant.work_status ? WORK_STATUS_LABEL[applicant.work_status] ?? applicant.work_status : '—'],
    ['Urgency', applicant.urgency ? URGENCY_LABEL[applicant.urgency] ?? applicant.urgency : '—'],
    ['Council', applicant.council || '—'],
  ];

  return (
    <Card>
      <CardHeader title="Referral triage">
        <TierBadge tier={effective} />
      </CardHeader>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-[var(--ink-muted)]">Tier</span>
          <select
            value={effective}
            onChange={(e) => setTier(Number(e.target.value))}
            className="min-h-[36px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]"
          >
            <option value={1}>Tier 1</option>
            <option value={2}>Tier 2</option>
            <option value={3}>Tier 3</option>
          </select>
          {overridden && (
            <button onClick={() => setTier(auto)} className="text-[13px] text-[var(--link)] hover:underline">
              reset to auto (Tier {auto})
            </button>
          )}
        </div>
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">
          {overridden ? `Manually set. Auto-suggestion: Tier ${auto} — ${tierReason(applicant)}` : `Auto: ${tierReason(applicant)}`}
        </p>

        <dl className="m-0 mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 border-b border-[var(--line)] pb-1">
              <dt className="text-[13px] text-[var(--ink-muted)]">{k}</dt>
              <dd className="m-0 text-[15px] text-[var(--ink)]">{v}</dd>
            </div>
          ))}
        </dl>

        {(applicant.officer_name || applicant.officer_email || applicant.officer_phone) && (
          <div className="mt-1 rounded-md border border-[var(--line)] bg-[var(--paper)] p-3">
            <div className="text-[13px] text-[var(--ink-muted)]">Housing officer</div>
            <div className="text-[15px] text-[var(--ink)]">{applicant.officer_name || '—'}</div>
            <div className="font-mono text-[13px] text-[var(--ink-muted)]">
              {[applicant.officer_email, applicant.officer_phone].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        )}

        {applicant.consent != null && (
          <div className="text-[13px] text-[var(--ink-muted)]">
            Consent to contact / data sharing: <strong className="text-[var(--ink)]">{yn(applicant.consent)}</strong>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Applicant hero with an inline edit mode. */
function HeroCard({ applicant, household }: { applicant: Applicant; household: string }) {
  const update = useUpdateApplicant();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Applicant>>({});

  const start = () => {
    setDraft({
      full_name: applicant.full_name,
      phone: applicant.phone ?? '',
      email: applicant.email ?? '',
      referring_borough: applicant.referring_borough ?? '',
      benefit_type: applicant.benefit_type ?? '',
      budget_pcm: applicant.budget_pcm ?? undefined,
      lha_band: applicant.lha_band ?? '',
      adults: applicant.adults ?? 1,
      children: applicant.children ?? 0,
      requirements: applicant.requirements ?? '',
      notes: applicant.notes ?? '',
    });
    setEditing(true);
  };

  const set = (k: keyof Applicant, v: string | number) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.full_name?.trim()) { toast('Name is required', 'danger'); return; }
    try {
      await update.mutateAsync({
        id: applicant.id,
        full_name: draft.full_name,
        phone: draft.phone || null,
        email: draft.email || null,
        referring_borough: draft.referring_borough || null,
        benefit_type: draft.benefit_type || null,
        budget_pcm: draft.budget_pcm ? Number(draft.budget_pcm) : null,
        lha_band: draft.lha_band || null,
        adults: draft.adults != null ? Number(draft.adults) : null,
        children: draft.children != null ? Number(draft.children) : null,
        requirements: draft.requirements || null,
        notes: draft.notes || null,
      });
      toast('Applicant updated', 'success');
      setEditing(false);
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'danger');
    }
  };

  if (editing) {
    return (
      <Card className="p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" value={draft.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
          <Field label="Phone" mono value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
          <Field label="Email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
          <Field label="Borough" value={draft.referring_borough ?? ''} onChange={(e) => set('referring_borough', e.target.value)} />
          <Field label="Benefit (UC/HB)" value={draft.benefit_type ?? ''} onChange={(e) => set('benefit_type', e.target.value)} />
          <Field label="Budget pcm" mono type="number" value={String(draft.budget_pcm ?? '')} onChange={(e) => set('budget_pcm', e.target.value)} />
          <Field label="Adults" type="number" value={String(draft.adults ?? '')} onChange={(e) => set('adults', e.target.value)} />
          <Field label="Children" type="number" value={String(draft.children ?? '')} onChange={(e) => set('children', e.target.value)} />
          <Field label="LHA band" value={draft.lha_band ?? ''} onChange={(e) => set('lha_band', e.target.value)} />
        </div>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">Requirements</span>
          <textarea
            value={draft.requirements ?? ''}
            onChange={(e) => set('requirements', e.target.value)}
            rows={2}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]"
          />
        </label>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">Notes</span>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setEditing(false)} disabled={update.isPending}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">{applicant.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[15px] text-[var(--ink-muted)]">
            {applicant.phone && <span>{applicant.phone}</span>}
            {applicant.email && <span>{applicant.email}</span>}
            {applicant.referring_borough && <span>{applicant.referring_borough}</span>}
            {applicant.benefit_type && <span>{applicant.benefit_type}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StageBadge stage={applicant.stage} />
          <Button onClick={start} className="min-h-0 px-3 py-1.5 text-[13px]">Edit</Button>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-4">
        <Meta label="Household" value={household || '—'} />
        <Meta label="Budget" value={applicant.budget_pcm ? money(applicant.budget_pcm) : '—'} mono />
        <Meta label="LHA band" value={applicant.lha_band || '—'} />
        <Meta label="Source" value={applicant.source || '—'} />
      </dl>

      {applicant.requirements && <p className="mt-4 mb-0 text-[15px] text-[var(--ink)]">{applicant.requirements}</p>}
      {applicant.notes && <p className="mt-2 mb-0 text-[15px] text-[var(--ink-muted)]">{applicant.notes}</p>}
    </Card>
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

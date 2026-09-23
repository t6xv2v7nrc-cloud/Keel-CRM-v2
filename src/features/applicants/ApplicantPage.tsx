import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Avatar, Button, Card, CardHeader, Empty, Field, Icon, KeelLine, StageBadge, TierBadge, UrgentChip, useToast,
} from '../../components/ui';
import {
  useActivities, useApplicant, useCalls, useDeleteApplicant, useProperties, useSetNextCall, useUpdateApplicant, useUpdateTriage,
} from '../../lib/hooks';
import { matchesForApplicant } from '../../lib/propertyMatch';
import { money, timeAgo } from '../../lib/format';
import { computeTier, tierReason, HOUSEHOLD_LABEL, WORK_STATUS_LABEL, URGENCY_LABEL } from '../../lib/tiering';
import type { Tier } from '../../lib/tiering';
import { effectiveTier, isUrgent } from '../../lib/search';
import { addDays, dayLabel, OUTCOME_LABEL, todayIso } from '../../lib/calls';
import type { Activity, Applicant, Call } from '../../lib/types';
import { CallHistory, CallLogger } from '../calls/CallLogger';
import { CallsNeedUpdate } from '../calls/CallsPage';

export function ApplicantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: applicant, isLoading } = useApplicant(id);
  const { data: activities = [] } = useActivities('applicant', id);
  const { calls, ready: callsReady } = useCalls();
  const deleteApplicant = useDeleteApplicant();
  const { toast } = useToast();
  const [logging, setLogging] = useState(false);
  const callsRef = useRef<HTMLDivElement>(null);

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;
  if (!applicant) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Client not found.</div>;

  const mine = calls.filter((c) => c.applicant_id === applicant.id);

  const handleDelete = () => {
    if (!window.confirm(`Delete ${applicant.full_name}? This removes their record, calls and activity. This cannot be undone.`)) return;
    deleteApplicant.mutate(applicant.id, {
      onSuccess: () => { toast(`Deleted ${applicant.full_name}`, 'success'); navigate('/pipeline'); },
      onError: (e) => toast(`Delete failed: ${(e as Error).message}`, 'danger'),
    });
  };

  const startCall = () => {
    setLogging(true);
    setTimeout(() => callsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <div className="mx-auto flex max-w-[1060px] flex-col gap-6 p-6 pb-24">
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => navigate('/pipeline')} className="inline-flex items-center gap-1.5 text-[15px] text-[var(--link)] hover:underline">
          <Icon name="arrowRight" size={16} className="rotate-180" /> Pipeline
        </button>
        <Button variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={handleDelete} disabled={deleteApplicant.isPending}>
          <Icon name="trash" size={14} />{deleteApplicant.isPending ? 'Deleting…' : 'Delete'}
        </Button>
      </div>

      <HeroCard applicant={applicant} lastCall={mine[0]} onLogCall={startCall} />

      <SuitablePropertiesCard applicant={applicant} />

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div ref={callsRef} className="scroll-mt-20">
            <CallsCard applicant={applicant} calls={mine} ready={callsReady} open={logging} setOpen={setLogging} />
          </div>

          <Card>
            <CardHeader icon="clock" title="Timeline" sub={`${activities.length} events`} />
            <div className="p-5">
              {activities.length === 0 ? (
                <p className="m-0 text-[15px] text-[var(--ink-muted)]">No activity yet.</p>
              ) : (
                <ul className="relative m-0 flex list-none flex-col gap-4 p-0">
                  <span aria-hidden className="absolute bottom-1 left-[4px] top-1 w-px bg-[var(--line-strong)]" />
                  {activities.map((act) => <TimelineRow key={act.id} act={act} />)}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <ReferralCard applicant={applicant} />
          <Card>
            <CardHeader icon="flag" title="Progress" />
            <div className="p-5"><KeelLine current={applicant.stage} /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ act }: { act: Activity }) {
  const fromScreenshot = act.body.includes('screenshot') || act.inbox_item_id != null;
  const isCall = act.kind === 'call';
  return (
    <li className="relative flex gap-3 pl-5">
      <span aria-hidden className="absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-[var(--surface)]"
        style={{ background: isCall ? 'var(--accent)' : fromScreenshot ? 'var(--ink-muted)' : 'var(--line-strong)' }} />
      <div className="flex-1">
        <div className="text-[15px] text-[var(--ink)]">{act.body}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
          <span>{isCall ? 'Call' : act.kind.replace('_', ' ')}</span>
          <span>·</span>
          <span>{timeAgo(act.created_at)}</span>
          {fromScreenshot && <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[12px] text-[var(--chip-fg)]">from the Bin</span>}
        </div>
      </div>
    </li>
  );
}

// ── Calls ──────────────────────────────────────────────────────────

function CallsCard({ applicant, calls, ready, open, setOpen }: {
  applicant: Applicant; calls: Call[]; ready: boolean; open: boolean; setOpen: (v: boolean) => void;
}) {
  const setNext = useSetNextCall();
  const { toast } = useToast();
  const next = applicant.next_call_at ?? null;
  const overdue = next !== null && next < todayIso();
  const changeNext = (date: string | null) => setNext.mutate({ applicant, date }, {
    onSuccess: () => toast(date ? `Next call ${dayLabel(date).toLowerCase()}` : 'Next call cleared', 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <Card>
      <CardHeader icon="phone" title="Calls" sub={`${calls.length} logged`}>
        {!open && ready && (
          <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setOpen(true)}>
            <Icon name="phoneOut" size={14} /> Log a call
          </Button>
        )}
      </CardHeader>
      <div className="flex flex-col gap-4 p-5">
        {!ready && <CallsNeedUpdate />}

        {ready && (
          <div className={`flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 ${overdue ? 'bg-[var(--note-bg)]' : 'bg-[var(--surface-2)]'}`}>
            <Icon name="calendar" size={18} className={overdue ? 'text-[var(--note-fg)]' : 'text-[var(--accent)]'} />
            <div className="min-w-0 flex-1 text-[15px] text-[var(--ink)]">
              {next ? <>Next call <strong>{dayLabel(next)}</strong>{overdue && <span className="text-[var(--note-fg)]">, overdue</span>}</>
                : calls.length ? 'No follow-up set' : 'Not called yet'}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 3, 7].map((d) => (
                <button key={d} onClick={() => changeNext(addDays(d))} disabled={setNext.isPending}
                  className="rounded-full border border-[var(--line-strong)] px-2.5 py-0.5 text-[13px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]">
                  {d === 1 ? 'Tomorrow' : d === 7 ? 'Next week' : `In ${d} days`}
                </button>
              ))}
              <input type="date" value={next ?? ''} min={todayIso()} aria-label="Next call date" onChange={(e) => changeNext(e.target.value || null)}
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--ink)]" />
              {next && (
                <button onClick={() => changeNext(null)} title="Clear next call" aria-label="Clear next call"
                  className="grid h-6 w-6 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {open && ready && (
          <div className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4 shadow-[0_0_0_4px_var(--accent-soft)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-semibold text-[var(--ink)]">Log a call</span>
              <button onClick={() => setOpen(false)} className="text-[13px] text-[var(--link)] hover:underline">Cancel</button>
            </div>
            <CallLogger applicant={applicant} onDone={() => setOpen(false)} autoFocus />
          </div>
        )}

        {ready && <CallHistory calls={calls} />}
      </div>
    </Card>
  );
}

// ── Suitable properties ────────────────────────────────────────────

const SHOW_PROPERTIES = 6;
const STRENGTH = {
  strong: { label: 'Strong', bg: 'var(--strong-bg)', fg: 'var(--strong-fg)' },
  good: { label: 'Good', bg: 'var(--good-bg)', fg: 'var(--good-fg)' },
  possible: { label: 'Possible', bg: 'var(--possible-bg)', fg: 'var(--possible-fg)' },
} as const;

/** Every available property this client could suit, best first, from the matching engine. */
function SuitablePropertiesCard({ applicant }: { applicant: Applicant }) {
  const { data: properties = [] } = useProperties();
  const [showAll, setShowAll] = useState(false);
  const available = properties.filter((p) => p.status === 'void' || p.status === 'under_offer');
  const all = matchesForApplicant(applicant, available);
  const matches = showAll ? all : all.slice(0, SHOW_PROPERTIES);
  return (
    <Card>
      <CardHeader icon="building" title="Suitable properties" sub={available.length ? `${all.length} of ${available.length} available` : undefined} />
      {available.length === 0 ? (
        <Empty icon="building" title="No properties saved yet">
          <Link to="/properties" className="text-[var(--link)] hover:underline">Paste your list on the Properties tab</Link> to see what suits this client.
        </Empty>
      ) : matches.length === 0 ? (
        <Empty icon="search" title="Nothing fits yet">
          None of the {available.length} available {available.length === 1 ? 'property fits' : 'properties fit'}. Check their area, household and budget are filled in.
        </Empty>
      ) : (
        <div className="p-5">
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {matches.map(({ property: p, match: m }) => (
              <li key={p.id} className="flex gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--ink-muted)]" style={{ background: STRENGTH[m.strength].bg, color: STRENGTH[m.strength].fg }}>
                  <Icon name="building" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: STRENGTH[m.strength].bg, color: STRENGTH[m.strength].fg }}>
                      {STRENGTH[m.strength].label}
                    </span>
                    <span className="truncate text-[15px] font-medium text-[var(--ink)]">{p.address_line}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                    {[p.property_type, p.rent_text ?? (p.rent_pcm ? `${money(p.rent_pcm)} pcm` : null), p.area, p.borough !== p.area ? p.borough : null,
                      p.source_tag ? `Source: ${p.source_tag}` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--ink)]">{m.reasons.join(' · ')}</div>
                  {m.cautions.length > 0 && <div className="mt-0.5 text-[13px] text-[var(--note-fg)]">! {m.cautions.join(' · ')}</div>}
                </div>
              </li>
            ))}
          </ul>
          {all.length > SHOW_PROPERTIES && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] text-[var(--link)] hover:underline">
              {showAll ? 'Show fewer' : `Show all ${all.length} properties`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Referral triage (editable) ─────────────────────────────────────

const yesNo = (b: boolean | null | undefined) => (b === true ? 'Yes' : b === false ? 'No' : 'Not known');

/** Referral triage: every answer can be changed here, and the tier follows the
 *  rules in Settings unless you set it by hand. */
function ReferralCard({ applicant }: { applicant: Applicant }) {
  const triage = useUpdateTriage();
  const { toast } = useToast();
  const effective = effectiveTier(applicant);
  const auto = computeTier(applicant);
  const locked = applicant.tier_locked === true || (applicant.tier_locked === undefined && applicant.tier != null && applicant.tier !== auto);

  const change = (patch: Partial<Applicant>, note: string) => {
    const before = effective;
    const merged = { ...applicant, ...patch };
    const after = 'tier' in patch ? (patch.tier as Tier) : locked ? before : computeTier(merged);
    triage.mutate({ applicant, patch, note }, {
      onSuccess: () => toast(after !== before ? `${note}. Now Tier ${after}` : note, 'success'),
      onError: (e) => toast(`Could not save: ${(e as Error).message}`, 'danger'),
    });
  };

  const setTierByHand = (t: Tier) => {
    if (t === effective && locked) return;
    change({ tier: t, tier_locked: true }, `Tier set to ${t} by hand`);
  };
  const useRules = () => change({ tier: auto, tier_locked: false }, `Tier back to the rules (Tier ${auto})`);

  const field = (label: string, key: keyof Applicant) => (v: string) => {
    const value = v.trim() || null;
    if ((applicant[key] ?? null) === value) return;
    change({ [key]: value } as Partial<Applicant>, value ? `${label} set to ${value}` : `${label} cleared`);
  };

  return (
    <Card>
      <CardHeader icon="layers" title="Referral triage">
        {isUrgent(applicant) && <UrgentChip />}
        <TierBadge tier={effective} />
      </CardHeader>
      <div className="flex flex-col gap-4 p-5">
        {/* Tier */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--paper-2)] p-1" role="group" aria-label="Tier">
            {([1, 2, 3] as Tier[]).map((t) => {
              const on = t === effective;
              return (
                <button key={t} onClick={() => setTierByHand(t)} aria-pressed={on} disabled={triage.isPending}
                  className={`rounded-md py-1.5 text-[13px] font-semibold transition-colors ${
                    on ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                  Tier {t}
                </button>
              );
            })}
          </div>
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">
            {locked ? (
              <>Set by hand. The rules would give Tier {auto}: {tierReason(applicant)}{' '}
                <button onClick={useRules} className="text-[var(--link)] hover:underline">Use the rules</button></>
            ) : (
              <>From the answers below: {tierReason(applicant)} <Link to="/settings" className="text-[var(--link)] hover:underline">Change the rules</Link></>
            )}
          </p>
        </div>

        {/* Answers */}
        <div className="flex flex-col divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
          <TriageRow label="Household">
            <Choice value={applicant.household_type ?? ''} onChange={(v) => change({ household_type: v || null }, `Household set to ${v ? HOUSEHOLD_LABEL[v].toLowerCase() : 'not known'}`)}
              options={[['', 'Not known'], ...Object.entries(HOUSEHOLD_LABEL)]} />
          </TriageRow>
          {([['on_uc', 'On UC'], ['pip', 'PIP'], ['lcwra', 'LCWRA'], ['council_registered', 'Council-registered']] as const).map(([key, label]) => (
            <TriageRow key={key} label={label}>
              <YesNo value={applicant[key]} onChange={(v) => change({ [key]: v } as Partial<Applicant>, `${label} set to ${yesNo(v).toLowerCase()}`)} />
            </TriageRow>
          ))}
          <TriageRow label="Work">
            <Choice value={applicant.work_status ?? ''} onChange={(v) => change({ work_status: v || null }, `Work set to ${v ? WORK_STATUS_LABEL[v].toLowerCase() : 'not known'}`)}
              options={[['', 'Not known'], ...Object.entries(WORK_STATUS_LABEL)]} />
          </TriageRow>
          <TriageRow label="Urgency">
            <Choice value={applicant.urgency ?? ''} onChange={(v) => change({ urgency: v || null }, `Urgency set to ${v ? URGENCY_LABEL[v].toLowerCase() : 'not known'}`)}
              options={[['', 'Not known'], ...Object.entries(URGENCY_LABEL)]} />
          </TriageRow>
          <TriageRow label="Council">
            <InlineText value={applicant.council ?? ''} placeholder="e.g. Barnet" onSave={field('Council', 'council')} />
          </TriageRow>
          <TriageRow label="Situation">
            <InlineText value={applicant.housing_situation ?? ''} placeholder="e.g. sofa surfing" onSave={field('Housing situation', 'housing_situation')} />
          </TriageRow>
          <TriageRow label="Consent">
            <YesNo value={applicant.consent} onChange={(v) => change({ consent: v }, `Consent set to ${yesNo(v).toLowerCase()}`)} />
          </TriageRow>
        </div>

        {/* Housing officer */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]"><Icon name="user" size={14} /> Housing officer</span>
          <div className="flex flex-col divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            <TriageRow label="Name"><InlineText value={applicant.officer_name ?? ''} placeholder="Not given" onSave={field('Officer name', 'officer_name')} /></TriageRow>
            <TriageRow label="Email"><InlineText value={applicant.officer_email ?? ''} placeholder="Not given" onSave={field('Officer email', 'officer_email')} /></TriageRow>
            <TriageRow label="Phone"><InlineText value={applicant.officer_phone ?? ''} placeholder="Not given" mono onSave={field('Officer phone', 'officer_phone')} /></TriageRow>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TriageRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-1.5">
      <span className="shrink-0 text-[13px] text-[var(--ink-muted)]">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** Yes / No / Not known. */
function YesNo({ value, onChange }: { value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const opts: Array<[boolean | null, string]> = [[true, 'Yes'], [false, 'No'], [null, '?']];
  return (
    <div className="inline-flex rounded-md border border-[var(--line-strong)] p-0.5">
      {opts.map(([v, label]) => {
        const on = (value ?? null) === v;
        return (
          <button key={label} onClick={() => !on && onChange(v)} aria-pressed={on} title={v === null ? 'Not known' : label}
            className={`min-w-[38px] rounded px-2 py-0.5 text-[13px] font-medium transition-colors ${
              on ? (v === true ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--ink)] text-[var(--surface)]') : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="max-w-[190px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1 text-[13px] text-[var(--ink)]">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Text that saves when you leave the box or press Enter. */
function InlineText({ value, placeholder, onSave, mono = false }: { value: string; placeholder: string; onSave: (v: string) => void; mono?: boolean }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) { setWas(value); setV(value); }
  return (
    <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => onSave(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setV(value); }}
      className={`w-[190px] rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-[13px] text-[var(--ink)] outline-none hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:text-left ${mono ? 'font-mono' : ''}`} />
  );
}

// ── Hero ───────────────────────────────────────────────────────────

/** Client header with an inline edit mode. */
function HeroCard({ applicant, lastCall, onLogCall }: { applicant: Applicant; lastCall?: Call; onLogCall: () => void }) {
  const update = useUpdateApplicant();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Applicant>>({});
  const tier = effectiveTier(applicant);

  const household = [
    applicant.adults ? `${applicant.adults} adult${applicant.adults > 1 ? 's' : ''}` : null,
    applicant.children ? `${applicant.children} child${applicant.children > 1 ? 'ren' : ''}` : null,
  ].filter(Boolean).join(', ');

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
      toast('Client updated', 'success');
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
          <textarea value={draft.requirements ?? ''} onChange={(e) => set('requirements', e.target.value)} rows={2}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[var(--ink-muted)]">Looking for / notes</span>
          <textarea value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={4}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setEditing(false)} disabled={update.isPending}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </Card>
    );
  }

  const next = applicant.next_call_at;
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ background: tier === 1 ? 'var(--accent)' : tier === 2 ? 'var(--accent-soft)' : 'var(--paper-2)' }} />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={applicant.full_name} size={60} accent={tier === 1} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-[28px] font-bold leading-tight text-[var(--ink)]">{applicant.full_name}</h1>
                <TierBadge tier={tier} />
                {isUrgent(applicant) && <UrgentChip />}
                <StageBadge stage={applicant.stage} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-[var(--ink-muted)]">
                {applicant.phone && <a href={`tel:${applicant.phone}`} className="inline-flex items-center gap-1.5 font-mono hover:text-[var(--link)]"><Icon name="phone" size={15} />{applicant.phone}</a>}
                {applicant.email && <a href={`mailto:${applicant.email}`} className="inline-flex items-center gap-1.5 hover:text-[var(--link)]"><Icon name="inbox" size={15} />{applicant.email}</a>}
                {(applicant.council || applicant.referring_borough) && <span className="inline-flex items-center gap-1.5"><Icon name="pin" size={15} />{applicant.council || applicant.referring_borough}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={start} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="pencil" size={14} />Edit</Button>
            <Button variant="primary" onClick={onLogCall} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="phoneOut" size={14} />Log call</Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Meta icon="users" label="Household" value={household || 'Not known'} />
          <Meta icon="flag" label="Budget" value={applicant.budget_pcm ? money(applicant.budget_pcm) : 'Not given'} mono />
          <Meta icon="phone" label="Last call" value={lastCall ? `${OUTCOME_LABEL[lastCall.outcome]}, ${timeAgo(lastCall.created_at)}` : 'Not called yet'} />
          <Meta icon="calendar" label="Next call" value={next ? dayLabel(next) : 'Not set'} strong={!!next && next <= todayIso()} />
        </dl>

        {applicant.requirements && <p className="mt-4 mb-0 text-[15px] text-[var(--ink)]">{applicant.requirements}</p>}
        {applicant.notes && (
          <div className="mt-4 rounded-lg border-l-4 border-[var(--accent)] bg-[var(--surface-2)] p-3.5">
            <div className="text-[13px] font-medium text-[var(--ink-muted)]">Looking for / notes</div>
            <p className="m-0 mt-1 whitespace-pre-wrap text-[15px] text-[var(--ink)]">{applicant.notes}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Meta({ icon, label, value, mono, strong }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
      <Icon name={icon} size={16} className="mt-0.5 text-[var(--ink-muted)]" />
      <div className="min-w-0">
        <dt className="text-[12px] text-[var(--ink-muted)]">{label}</dt>
        <dd className={`m-0 truncate text-[15px] ${strong ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--ink)]'} ${mono ? 'font-mono' : ''}`}>{value}</dd>
      </div>
    </div>
  );
}

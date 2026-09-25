import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Avatar, Button, Card, CardHeader, Empty, Help, Icon, KeelLine, StageBadge, TierBadge, UrgentChip, useToast,
} from '../../components/ui';
import {
  sentKey, useActivities, useApplicant, useAssign, useCalls, useDeleteApplicant, usePeople, useProperties, useSentOnWhatsApp, useSetNextCall,
} from '../../lib/hooks';
import { bestFew, brief, matchesForApplicant } from '../../lib/propertyMatch';
import { money, timeAgo } from '../../lib/format';
import { effectiveTier, isUrgent } from '../../lib/search';
import { addDays, dayLabel, OUTCOME_LABEL, todayIso } from '../../lib/calls';
import type { Activity, Applicant, Call } from '../../lib/types';
import { CallHistory, CallLogger } from '../calls/CallLogger';
import { CallsNeedUpdate } from '../calls/CallsPage';
import { ClientDetails } from './ClientDetails';
import { LhaChip } from '../properties/Lha';
import { SentTag, WhatsAppLink } from '../properties/WhatsApp';

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
  const { hash } = useLocation();
  const loaded = !!applicant;
  // Arriving from "found in notes" in the Pipeline: go straight to the details
  useEffect(() => {
    if (loaded && hash === '#details') setTimeout(() => document.getElementById('details')?.scrollIntoView({ block: 'start' }), 50);
  }, [loaded, hash]);

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

      <ClientDetails applicant={applicant} />

      <SuitablePropertiesCard applicant={applicant} />

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div ref={callsRef} className="scroll-mt-20">
            <CallsCard applicant={applicant} calls={mine} ready={callsReady} open={logging} setOpen={setLogging} />
          </div>

          <Card>
            <CardHeader icon="clock" title="Timeline" sub={`${activities.length} events`} help="timeline" />
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
          <Card>
            <CardHeader icon="flag" title="Progress" help="progress" />
            <div className="p-5"><KeelLine current={applicant.stage} /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ act }: { act: Activity }) {
  const { whoOf } = usePeople();
  const who = whoOf(act.actor);
  const fromScreenshot = act.body.includes('screenshot') || act.inbox_item_id != null;
  const isCall = act.kind === 'call';
  const isWhatsApp = act.kind === 'whatsapp';
  return (
    <li className="relative flex gap-3 pl-5">
      <span aria-hidden className="absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-[var(--surface)]"
        style={{ background: isCall || isWhatsApp ? 'var(--accent)' : fromScreenshot ? 'var(--ink-muted)' : 'var(--line-strong)' }} />
      <div className="flex-1">
        <div className="text-[15px] text-[var(--ink)]">{act.body}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
          <span>{isCall ? 'Call' : isWhatsApp ? 'WhatsApp' : act.kind.replace('_', ' ')}</span>
          <span>·</span>
          <span>{timeAgo(act.created_at)}</span>
          {who && <><span>·</span><span>by {who}</span></>}
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
      <CardHeader icon="phone" title="Calls" sub={`${calls.length} logged`} help="logCall">
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
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-[var(--ink)]">
              <span>{next ? <>Next call <strong>{dayLabel(next)}</strong>{overdue && <span className="text-[var(--note-fg)]">, overdue</span>}</>
                : calls.length ? 'No follow-up set' : 'Not called yet'}</span>
              <Help topic="nextCall" />
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

const STRENGTH = {
  strong: { label: 'Strong', bg: 'var(--strong-bg)', fg: 'var(--strong-fg)' },
  good: { label: 'Good', bg: 'var(--good-bg)', fg: 'var(--good-fg)' },
  possible: { label: 'Possible', bg: 'var(--possible-bg)', fg: 'var(--possible-fg)' },
} as const;

/** The available properties this client could suit: the best few first, the rest on request. */
function SuitablePropertiesCard({ applicant }: { applicant: Applicant }) {
  const { data: properties = [] } = useProperties();
  const sent = useSentOnWhatsApp();
  const [showAll, setShowAll] = useState(false);
  const available = properties.filter((p) => p.status === 'void' || p.status === 'under_offer');
  const all = matchesForApplicant(applicant, available);
  const best = bestFew(all, (x) => x.match.strength);
  const matches = showAll ? all : best;
  return (
    <Card>
      <CardHeader icon="building" title="Suitable properties" sub={available.length ? `${all.length} of ${available.length} available` : undefined} help="suitable">
        {best.length > 0 && (
          <WhatsAppLink to={applicant} properties={best.map((x) => x.property)}
            label={best.length === 1 ? 'Send it on WhatsApp' : `Send the best ${best.length} on WhatsApp`} />
        )}
      </CardHeader>
      {available.length === 0 ? (
        <Empty icon="building" title="No properties saved yet">
          <Link to="/properties" className="text-[var(--link)] hover:underline">Paste your list on the Properties tab</Link> to see what suits this client.
        </Empty>
      ) : matches.length === 0 ? (
        <Empty icon="search" title="Nothing fits yet">
          None of the {available.length} available {available.length === 1 ? 'property fits' : 'properties fit'}. Check their area, household and budget are filled in.
        </Empty>
      ) : (
        <div className="px-5 pb-3 pt-1">
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {matches.map(({ property: p, match: m }) => {
              const st = STRENGTH[m.strength];
              return (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-[68px] shrink-0 rounded px-2 py-0.5 text-center text-[12px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                  <div className="min-w-0 flex-1" title={[...m.reasons, ...m.cautions.map((c) => `Check: ${c}`)].join('\n')}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-medium text-[var(--ink)]">{p.address_line}</span>
                      <LhaChip property={p} />
                      <SentTag sent={sent.get(sentKey(applicant.id, p.address_line))} />
                    </div>
                    <div className="text-[13px] text-[var(--ink-muted)] sm:truncate">
                      {[p.property_type, p.rent_text ?? (p.rent_pcm ? `${money(p.rent_pcm)} pcm` : null), p.area && !/^london$/i.test(p.area) ? p.area : p.borough]
                        .filter(Boolean).join(' · ')}
                      {m.cautions[0] && <span className="text-[var(--note-fg)]"> · {brief(m.cautions[0])}</span>}
                    </div>
                  </div>
                  <WhatsAppLink to={applicant} properties={[p]} icon />
                </li>
              );
            })}
          </ul>
          {all.length > best.length && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-[13px] text-[var(--link)] hover:underline">
              {showAll ? 'Show only the best' : `Show all ${all.length} properties`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Hero ───────────────────────────────────────────────────────────

/** Client header: who they are, where they are, and the quick actions. */
function HeroCard({ applicant, lastCall, onLogCall }: { applicant: Applicant; lastCall?: Call; onLogCall: () => void }) {
  const tier = effectiveTier(applicant);
  const household = [
    applicant.adults ? `${applicant.adults} adult${applicant.adults > 1 ? 's' : ''}` : null,
    applicant.children ? `${applicant.children} child${applicant.children > 1 ? 'ren' : ''}` : null,
  ].filter(Boolean).join(', ');

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
          <div className="flex flex-wrap items-center gap-2">
            <AssignPicker applicant={applicant} />
            <Button onClick={() => document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="pencil" size={14} />Edit details</Button>
            <Button variant="primary" onClick={onLogCall} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="phoneOut" size={14} />Log call</Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Meta icon="users" label="Household" value={household || 'Not known'} />
          <Meta icon="flag" label="Budget" value={applicant.budget_pcm ? money(applicant.budget_pcm) : 'Not given'} mono />
          <Meta icon="phone" label="Last call" value={lastCall ? `${OUTCOME_LABEL[lastCall.outcome]}, ${timeAgo(lastCall.created_at)}` : 'Not called yet'} />
          <Meta icon="calendar" label="Next call" value={next ? dayLabel(next) : 'Not set'} strong={!!next && next <= todayIso()} />
        </dl>

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

/** Who is looking after this client. */
function AssignPicker({ applicant }: { applicant: Applicant }) {
  const people = usePeople();
  const assign = useAssign();
  const { toast } = useToast();
  if (!people.ready || people.members.length === 0) return null;
  const change = (userId: string | null) => {
    const name = people.nameOf(userId);
    assign.mutate({ applicant, userId, name }, {
      onSuccess: () => toast(userId ? `Assigned to ${userId === people.meId ? 'you' : name}` : 'No longer assigned', 'success'),
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] py-1 pl-2.5 pr-1.5">
      <Icon name="user" size={14} className="text-[var(--ink-muted)]" />
      <select value={applicant.assigned_to ?? ''} onChange={(e) => change(e.target.value || null)} disabled={assign.isPending}
        aria-label="Assigned to" className="bg-transparent text-[13px] text-[var(--ink)] outline-none">
        <option value="">Not assigned</option>
        {people.members.map((m) => (
          <option key={m.id} value={m.id}>{people.nameOf(m.id)}{m.id === people.meId ? ' (you)' : ''}</option>
        ))}
      </select>
      <Help topic="assign" />
    </span>
  );
}

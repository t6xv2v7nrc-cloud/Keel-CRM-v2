import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Help, Icon, useToast } from '../../components/ui';
import {
  useAddDeals, useDeals, useMoveDeal, usePeople, useProperties, useRemoveDeal, useSetNextStep,
} from '../../lib/hooks';
import { addDays, dayLabel, dayWord, todayIso } from '../../lib/calls';
import { timeAgo, shortDate } from '../../lib/format';
import { matchesForApplicant } from '../../lib/propertyMatch';
import {
  DEAL_LABEL, DEAL_STEPS, FELL_THROUGH_REASONS, isLive, nextMove, shortAddress, stuckDays, viewingShort, viewingWords,
} from '../../lib/progress';
import { reminderMessage, waLink, waNumber } from '../../lib/whatsapp';
import type { ApplicantStage } from '../../types/extraction';
import type { Applicant, Deal, DealStatus, Property } from '../../lib/types';

export const STAGE_NAME: Record<ApplicantStage, string> = {
  lead: 'Lead', referred: 'Referred', viewing: 'Viewing', offer: 'Offer', placed: 'Placed',
  fee_invoiced: 'Placed', fee_paid: 'Placed', lost: 'Lost',
};
const STRIP: ApplicantStage[] = ['lead', 'referred', 'viewing', 'offer', 'placed'];
const first = (name: string) => name.split(' ')[0];
const short = shortAddress;

/** Lead · Referred · Viewing · Offer · Placed, filled up to where the client is. */
export function StageStrip({ stage }: { stage: ApplicantStage }) {
  const at = STRIP.indexOf(stage === 'fee_invoiced' || stage === 'fee_paid' ? 'placed' : stage);
  return (
    <ol className="m-0 grid list-none grid-cols-5 gap-1 p-0" aria-label={`Stage: ${STAGE_NAME[stage]}`}>
      {STRIP.map((s, i) => (
        <li key={s} className="flex flex-col gap-1">
          <span className={`h-1.5 rounded-full ${stage !== 'lost' && i <= at ? 'bg-[var(--accent)]' : 'bg-[var(--paper-2)]'}`} />
          <span className={`text-[12px] ${i === at ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{STAGE_NAME[s]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Seven small segments: how far a deal has got. */
function DealSteps({ status }: { status: DealStatus }) {
  const at = DEAL_STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-1" role="img" aria-label={status === 'fell_through' ? 'Fell through' : `Step ${at + 1} of ${DEAL_STEPS.length}: ${DEAL_LABEL[status]}`}>
      {DEAL_STEPS.map((s, i) => (
        <span key={s.key} title={s.label} className={`h-1.5 flex-1 rounded-full ${status !== 'fell_through' && i <= at ? 'bg-[var(--accent)]' : 'bg-[var(--paper-2)]'}`} />
      ))}
    </div>
  );
}

/** "Viewing Thu 2 Oct, 2pm", "Offer made", "Moved in". */
export function dealWords(d: Deal): string {
  if (d.status === 'viewing' && d.viewing_at) return `Viewing ${viewingShort(d.viewing_at)}`;
  if (d.status === 'moved_in' && d.move_in_on) return `Moved in ${shortDate(d.move_in_on)}`;
  if (d.status === 'fell_through') return `Fell through${d.fell_through_reason ? `: ${d.fell_through_reason}` : ''}`;
  return DEAL_LABEL[d.status];
}

export function DealChip({ deal }: { deal: Deal }) {
  const strong = deal.status === 'offered' || deal.status === 'accepted' || deal.status === 'moved_in' || deal.status === 'viewing';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-medium ${
      deal.status === 'fell_through' ? 'bg-[var(--chip-bg)] text-[var(--chip-fg)] line-through decoration-1' : strong ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'}`}>
      {deal.status === 'viewing' && <Icon name="calendar" size={12} />}{dealWords(deal)}
    </span>
  );
}

export function StuckChip({ days }: { days: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-semibold"
      style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }} title={`Nothing has moved for ${days} days`}>
      <Icon name="clock" size={12} strokeWidth={2.2} /> Stuck {days}d
    </span>
  );
}

/** WhatsApp the client a reminder of their viewing. */
export function ReminderLink({ applicant, deal, label = false }: { applicant: Pick<Applicant, 'full_name' | 'phone'>; deal: Deal; label?: boolean }) {
  const { myName } = usePeople();
  if (!deal.viewing_at) return null;
  const text = reminderMessage(applicant.full_name, deal.address, viewingWords(deal.viewing_at), myName);
  const title = `Remind ${first(applicant.full_name)} on WhatsApp`;
  return (
    <a href={waLink(waNumber(applicant.phone), text)} target="_blank" rel="noreferrer" title={title} aria-label={title}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-[13px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
      <Icon name="chat" size={15} />{label && <span className="hidden sm:inline">Remind</span>}
    </a>
  );
}

/** "YYYY-MM-DDTHH:mm" for tomorrow at 11am, the default viewing time. */
const tomorrowAt11 = () => `${addDays(1)}T11:00`;

// ── The client page card ───────────────────────────────────────────

/** Where the client is: their stage, each property they are going for and how far it has got. */
export function ProgressCard({ applicant }: { applicant: Applicant }) {
  const { deals: all, ready } = useDeals();
  const [adding, setAdding] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const mine = all.filter((d) => d.applicant_id === applicant.id);
  const order = (d: Deal) => DEAL_STEPS.findIndex((s) => s.key === d.status);
  const live = mine.filter((d) => d.status !== 'fell_through').sort((a, b) => order(b) - order(a) || b.updated_at.localeCompare(a.updated_at));
  const gone = mine.filter((d) => d.status === 'fell_through');
  const stuck = ready ? stuckDays(applicant, all) : null;
  const { data: properties = [] } = useProperties();
  const byId = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const propertyOf = (d: Deal) => (d.property_id ? byId.get(d.property_id) : properties.find((p) => p.address_line === d.address)) ?? null;

  return (
    <Card>
      <CardHeader icon="flag" title="Progress" sub={live.filter(isLive).length ? `${live.filter(isLive).length} in play` : undefined} help="progress">
        {stuck !== null && <StuckChip days={stuck} />}
        {ready && (
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" size={14} />{adding ? 'Cancel' : 'Add a property'}
          </Button>
        )}
      </CardHeader>
      <div className="flex flex-col gap-4 p-5">
        <StageStrip stage={applicant.stage} />

        {!ready && (
          <div role="alert" className="flex gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
            <Icon name="alert" size={20} className="mt-0.5" />
            <div>
              <strong>Tracking each property needs a one-off database update.</strong> In Supabase, open the SQL Editor, paste in{' '}
              <code className="font-mono text-[13px]">supabase/migrations/0009_progress.sql</code> and click Run. Then reload this page.
            </div>
          </div>
        )}

        {stuck !== null && (
          <p className="m-0 rounded-md bg-[var(--note-bg)] px-3 py-2 text-[13px] text-[var(--note-fg)]">
            Nothing has moved for {stuck} days at {STAGE_NAME[applicant.stage]}.
            {live.filter(isLive).length ? ' Chase the property they are going for, or set a next step.' : ' Send them a property from Suitable properties below.'}
          </p>
        )}

        {adding && <AddDeal applicant={applicant} tracked={mine} onDone={() => setAdding(false)} />}

        {ready && live.length === 0 && !adding && (
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">
            No properties in play yet. Sending one on WhatsApp adds it here, or use Add a property.
          </p>
        )}

        {live.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {live.map((d) => <DealRow key={d.id} applicant={applicant} deal={d} all={all} property={propertyOf(d)} />)}
          </ul>
        )}

        {gone.length > 0 && (
          <div className="text-[13px]">
            <button type="button" onClick={() => setShowGone((v) => !v)} className="text-[var(--link)] hover:underline">
              {showGone ? 'Hide' : 'Show'} {gone.length} that fell through
            </button>
            {showGone && (
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[var(--ink-muted)]">
                {gone.map((d) => (
                  <li key={d.id}><span className="text-[var(--ink)]">{d.address}</span> · {d.fell_through_reason ?? 'no reason given'} · {timeAgo(d.updated_at)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DealRow({ applicant, deal, all, property }: { applicant: Applicant; deal: Deal; all: Deal[]; property: Property | null }) {
  const move = useMoveDeal();
  const remove = useRemoveDeal();
  const { whoOf } = usePeople();
  const { toast } = useToast();
  const [mode, setMode] = useState<null | 'viewing' | 'moved_in' | 'fell_through'>(null);
  const [when, setWhen] = useState(deal.viewing_at ? toLocalInput(deal.viewing_at) : tomorrowAt11());
  const [moveIn, setMoveIn] = useState(todayIso());
  const [reason, setReason] = useState<string>(FELL_THROUGH_REASONS[0]);
  const next = nextMove(deal.status);
  const busy = move.isPending || remove.isPending;

  const go = (to: DealStatus, extra: { viewingAt?: string; moveInOn?: string; reason?: string } = {}) =>
    move.mutate({ applicant, deal, to, allDeals: all, property, ...extra }, {
      onSuccess: (r) => {
        setMode(null);
        toast([`${short(deal.address)}: ${DEAL_LABEL[to]}`, r.stage ? `${first(applicant.full_name)} is now at ${STAGE_NAME[r.stage]}` : null,
          r.step ? `Next step: ${r.step}` : null].filter(Boolean).join(' · '), 'success');
      },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  const onNext = () => {
    if (!next) return;
    if (next.to === 'viewing') setMode('viewing');
    else if (next.to === 'moved_in') setMode('moved_in');
    else go(next.to);
  };
  const onPick = (v: string) => {
    if (v === 'remove') {
      if (window.confirm(`Stop tracking ${deal.address} for ${first(applicant.full_name)}?`)) remove.mutate(deal, { onSuccess: () => toast('Stopped tracking it', 'success') });
    } else if (v === 'fell_through') setMode('fell_through');
    else if (v === 'viewing') setMode('viewing');
    else if (v === 'moved_in') setMode('moved_in');
    else if (v) go(v as DealStatus);
  };
  const who = whoOf(deal.created_by);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-[var(--ink)]">{deal.address}</div>
          <div className="text-[13px] text-[var(--ink-muted)]">
            <span className={deal.status === 'viewing' || deal.status === 'offered' || deal.status === 'accepted' ? 'font-semibold text-[var(--accent-ink)]' : ''}>{dealWords(deal)}</span>
            {' · '}added {timeAgo(deal.created_at)}{who ? ` by ${who}` : ''}
            {property && property.status !== 'void' && ` · property ${property.status === 'under_offer' ? 'under offer' : property.status}`}
          </div>
        </div>
        {deal.status === 'viewing' && <ReminderLink applicant={applicant} deal={deal} label />}
        {next && deal.status !== 'moved_in' && (
          <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={onNext} disabled={busy}>{next.label}</Button>
        )}
        <select value="" onChange={(e) => onPick(e.target.value)} aria-label={`More for ${deal.address}`} disabled={busy}
          className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink-muted)]">
          <option value="">More…</option>
          <optgroup label="Set the step">
            {DEAL_STEPS.filter((s) => s.key !== deal.status).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </optgroup>
          <option value="fell_through">It fell through…</option>
          <option value="remove">Stop tracking</option>
        </select>
      </div>
      <DealSteps status={deal.status} />

      {mode === 'viewing' && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2">Viewing on
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]" />
          </label>
          <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={!when || busy}
            onClick={() => go('viewing', { viewingAt: new Date(when).toISOString() })}>Book the viewing</Button>
          <button type="button" onClick={() => setMode(null)} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
        </div>
      )}
      {mode === 'moved_in' && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2">Moved in on
            <input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)}
              className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]" />
          </label>
          <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={!moveIn || busy} onClick={() => go('moved_in', { moveInOn: moveIn })}>
            Confirm {first(applicant.full_name)} moved in
          </Button>
          <button type="button" onClick={() => setMode(null)} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
          <span className="w-full text-[12px] text-[var(--ink-muted)]">The property is marked as let, and anyone else going for it is told it was let.</span>
        </div>
      )}
      {mode === 'fell_through' && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why it fell through"
            className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]">
            {FELL_THROUGH_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={busy} onClick={() => go('fell_through', { reason })}>Mark as fell through</Button>
          <button type="button" onClick={() => setMode(null)} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
        </div>
      )}
    </li>
  );
}

/** "2026-10-02T14:00" from an ISO time, for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Pick an available property to track for this client: the ones that suit them first. */
function AddDeal({ applicant, tracked, onDone }: { applicant: Applicant; tracked: Deal[]; onDone: () => void }) {
  const { data: properties = [] } = useProperties();
  const add = useAddDeals();
  const { toast } = useToast();
  const [pick, setPick] = useState('');
  const [status, setStatus] = useState<DealStatus>('interested');
  const have = new Set(tracked.map((d) => d.address));
  const available = properties.filter((p) => (p.status === 'void' || p.status === 'under_offer') && !have.has(p.address_line));
  const suited = matchesForApplicant(applicant, available);
  const suitedIds = new Set(suited.map((x) => x.property.id));
  const others = available.filter((p) => !suitedIds.has(p.id)).sort((a, b) => a.address_line.localeCompare(b.address_line));
  const chosen = available.find((p) => p.id === pick);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-3 text-[13px] shadow-[0_0_0_4px_var(--accent-soft)]">
      <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Property"
        className="h-9 min-w-[240px] flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]">
        <option value="">Choose a property…</option>
        {suited.length > 0 && (
          <optgroup label="Suits them">
            {suited.map(({ property: p, match: m }) => <option key={p.id} value={p.id}>{p.address_line} ({m.strength})</option>)}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Other available properties">
            {others.map((p) => <option key={p.id} value={p.id}>{p.address_line}</option>)}
          </optgroup>
        )}
      </select>
      <select value={status} onChange={(e) => setStatus(e.target.value as DealStatus)} aria-label="How far it has got"
        className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]">
        <option value="sent">Sent to them</option>
        <option value="interested">They are interested</option>
      </select>
      <Button variant="primary" className="min-h-0 px-3 py-2 text-[13px]" disabled={!chosen || add.isPending}
        onClick={() => chosen && add.mutate({ applicantId: applicant.id, properties: [chosen], status }, {
          onSuccess: () => { toast(`Tracking ${short(chosen.address_line)} for ${first(applicant.full_name)}`, 'success'); onDone(); },
          onError: (e) => toast((e as Error).message, 'danger'),
        })}>
        Add it
      </Button>
      {available.length === 0 && <span className="w-full text-[var(--ink-muted)]">No other available properties. <Link to="/properties" className="text-[var(--link)] hover:underline">Paste a list</Link> first.</span>}
    </div>
  );
}

// ── Next step (on the Calls card) ──────────────────────────────────

const STEP_IDEAS = ['Call', 'Chase documents', 'Send more properties', 'Book a viewing', 'Chase the landlord', 'Chase the council', 'Check in after move-in'];

/** What to do next for a client, and when. The date is the one the Calls page works from. */
export function NextStepRow({ applicant, hasCalls }: { applicant: Applicant; hasCalls: boolean }) {
  const { ready } = useDeals();
  const setStep = useSetNextStep();
  const { toast } = useToast();
  const [text, setText] = useState(applicant.next_step ?? '');
  const date = applicant.next_call_at ?? null;
  const overdue = date !== null && date < todayIso();
  const save = (step: string | null, on: string | null) => setStep.mutate({ applicant, step, date: on }, {
    onSuccess: () => toast(on ? `Next step ${dayWord(on)}: ${step?.trim() || 'Call'}` : 'Next step cleared', 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  const saveText = () => { if (text.trim() !== (applicant.next_step ?? '')) save(text, date ?? addDays(1)); };

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 ${overdue ? 'bg-[var(--note-bg)]' : 'bg-[var(--surface-2)]'}`}>
      <Icon name="calendar" size={18} className={overdue ? 'text-[var(--note-fg)]' : 'text-[var(--accent)]'} />
      <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2 text-[15px] text-[var(--ink)]">
        <span className="whitespace-nowrap">Next step</span>
        {ready ? (
          <>
            <input value={text} onChange={(e) => setText(e.target.value)} onBlur={saveText} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              list="keel-step-ideas" placeholder="Call" aria-label="Next step"
              className="h-8 min-w-[160px] flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <datalist id="keel-step-ideas">{STEP_IDEAS.map((s) => <option key={s} value={s} />)}</datalist>
          </>
        ) : null}
        <strong className="whitespace-nowrap">{date ? dayLabel(date) : hasCalls ? 'Not set' : 'Not called yet'}</strong>
        {overdue && <span className="text-[var(--note-fg)]">overdue</span>}
        <Help topic="nextCall" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 3, 7].map((d) => (
          <button key={d} type="button" onClick={() => save(text || applicant.next_step || null, addDays(d))} disabled={setStep.isPending}
            className="rounded-full border border-[var(--line-strong)] px-2.5 py-0.5 text-[13px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]">
            {d === 1 ? 'Tomorrow' : d === 7 ? 'Next week' : `In ${d} days`}
          </button>
        ))}
        <input type="date" value={date ?? ''} min={todayIso()} aria-label="Next step date" onChange={(e) => save(text || applicant.next_step || null, e.target.value || null)}
          className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-0.5 text-[13px] text-[var(--ink)]" />
        {date && (
          <button type="button" onClick={() => { setText(''); save(null, null); }} title="Clear next step" aria-label="Clear next step"
            className="grid h-6 w-6 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]">
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

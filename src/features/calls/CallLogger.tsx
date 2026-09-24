import { useState } from 'react';
import { Button, Icon, useToast } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useLogCall, usePeople } from '../../lib/hooks';
import { addDays, dayLabel, OUTCOMES, OUTCOME_LABEL, suggestedGap } from '../../lib/calls';
import { timeAgo } from '../../lib/format';
import type { Applicant, Call, CallOutcome } from '../../lib/types';

export const OUTCOME_ICON: Record<CallOutcome, IconName> = {
  answered: 'check', no_answer: 'phoneMissed', voicemail: 'voicemail', busy: 'clock', wrong_number: 'x',
};

const NEXT_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: 'No follow-up', days: null },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 2 days', days: 2 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

/** Log a call in a few taps: outcome, a note, when to call next. */
export function CallLogger({ applicant, onDone, autoFocus = false }: { applicant: Applicant; onDone?: () => void; autoFocus?: boolean }) {
  const log = useLogCall();
  const { toast } = useToast();
  const [direction, setDirection] = useState<Call['direction']>('outgoing');
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [nextTouched, setNextTouched] = useState(false);
  const firstWord = applicant.full_name.split(' ')[0];
  const first = firstWord.length > 1 ? firstWord : applicant.full_name; // "S Robinson", not "S"

  const pickOutcome = (o: CallOutcome) => {
    setOutcome(o);
    if (!nextTouched) { const gap = suggestedGap(o); setNext(gap === null ? null : addDays(gap)); }
  };
  const pickNext = (date: string | null) => { setNext(date); setNextTouched(true); };

  const save = () => {
    if (!outcome) return;
    log.mutate({ applicant, outcome, direction, notes, nextCallAt: next }, {
      onSuccess: () => {
        toast(`Call logged${next ? `. Next call ${dayLabel(next).toLowerCase()}` : ''}`, 'success');
        setOutcome(null); setNotes(''); setNext(null); setNextTouched(false);
        onDone?.();
      },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-[var(--line-strong)] p-0.5" role="group" aria-label="Direction">
          {(['outgoing', 'incoming'] as const).map((d) => (
            <button key={d} onClick={() => setDirection(d)} aria-pressed={direction === d}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium transition-colors ${
                direction === d ? 'bg-[var(--ink)] text-[var(--surface)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
              <Icon name={d === 'outgoing' ? 'phoneOut' : 'phoneIn'} size={14} />
              {d === 'outgoing' ? 'I called' : 'They called'}
            </button>
          ))}
        </div>
        {applicant.phone && (
          <a href={`tel:${applicant.phone}`} className="inline-flex items-center gap-1.5 font-mono text-[13px] text-[var(--link)] hover:underline">
            <Icon name="phone" size={14} /> {applicant.phone}
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" role="group" aria-label="Outcome">
        {OUTCOMES.map((o, i) => {
          const on = outcome === o.key;
          return (
            <button key={o.key} onClick={() => pickOutcome(o.key)} aria-pressed={on} autoFocus={autoFocus && i === 0}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[13px] font-medium transition-colors ${
                on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)]'}`}>
              <Icon name={OUTCOME_ICON[o.key]} size={18} />
              {o.label}
            </button>
          );
        })}
      </div>

      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        placeholder={outcome === 'answered' ? `What did ${first} say? e.g. can view Friday, needs ground floor` : 'Notes (optional)'}
        className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-2.5 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">Call again</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {NEXT_OPTIONS.map((o) => {
            const date = o.days === null ? null : addDays(o.days);
            const on = next === date;
            return (
              <button key={o.label} onClick={() => pickNext(date)} aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                  on ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent-ink)]'
                    : 'border-[var(--line-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                {o.label}
              </button>
            );
          })}
          <label className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)]">
            <Icon name="calendar" size={15} />
            <input type="date" value={next ?? ''} min={addDays(0)} onChange={(e) => pickNext(e.target.value || null)}
              aria-label="Pick a date" className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1 text-[13px] text-[var(--ink)]" />
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[var(--ink-muted)]">
          {next ? <>Next call <strong className="text-[var(--ink)]">{dayLabel(next)}</strong></> : 'No follow-up set'}
        </span>
        <Button variant="primary" onClick={save} disabled={!outcome || log.isPending}>
          <Icon name="check" size={16} />
          {log.isPending ? 'Saving…' : `Log call with ${first}`}
        </Button>
      </div>
    </div>
  );
}

/** "You called", "Sam called", "They called (logged by Sam)". */
export function useCallWho() {
  const { whoOf } = usePeople();
  return (c: Call) => {
    const who = whoOf(c.created_by);
    if (c.direction === 'incoming') return who ? `They called, logged by ${who}` : 'They called';
    if (!who) return 'Called';
    return who === 'you' ? 'You called' : `${who} called`;
  };
}

/** A client's calls, newest first, with who made each one. */
export function CallHistory({ calls }: { calls: Call[] }) {
  const callWho = useCallWho();
  if (calls.length === 0) return <p className="m-0 text-[15px] text-[var(--ink-muted)]">No calls logged yet.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {calls.map((c) => {
        const reached = c.outcome === 'answered';
        return (
          <li key={c.id} className="flex gap-3">
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${reached ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'bg-[var(--paper-2)] text-[var(--ink-muted)]'}`}>
              <Icon name={OUTCOME_ICON[c.outcome]} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-medium text-[var(--ink)]">{OUTCOME_LABEL[c.outcome]}</span>
                <span className="text-[13px] text-[var(--ink-muted)]">{callWho(c)} · {timeAgo(c.created_at)}</span>
              </div>
              {c.notes && <p className="m-0 mt-0.5 whitespace-pre-wrap text-[15px] text-[var(--ink)]">{c.notes}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

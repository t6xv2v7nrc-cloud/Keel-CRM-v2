import { useState } from 'react';
import { Button, Help, Icon, UpdateNote, useToast } from '../../components/ui';
import { useDeals, useOfficerReply, useOfficers, useOutcomeSent, usePeople } from '../../lib/hooks';
import { clockTime, shortDay } from '../../lib/format';
import { shortAddress } from '../../lib/progress';
import {
  caseworkAddress, dueWords, LOST_REASONS, mailtoLink, OUTCOME_WORDS, outcomeBack, outcomeEmail, REASON_WORDS, replyState, tookWords,
} from '../../lib/viewings';
import { activeSettings } from '../../lib/settings';
import type { Applicant, Deal } from '../../lib/types';
import { OutlookSendButton } from '../outlook/Outlook';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const officerOf = (a: Pick<Applicant, 'officer_name'>) => a.officer_name?.trim() || 'the officer';
const firstOf = (name: string) => name.split(/\s+/)[0];

/** "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const when = (iso: string) => `${shortDay(iso)}, ${clockTime(iso)}`;

/** One list of why a property was lost, grouped by the reason that is counted. */
export function LostReasonSelect({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Why it was lost"
      className={`h-8 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)] ${className}`}>
      {LOST_REASONS.map((g) => (
        <optgroup key={g.code} label={REASON_WORDS[g.code]}>
          {g.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** On an officer client's Progress: when the nomination arrived, and the first reply (due within the working hours set). */
export function OfficerReply({ applicant }: { applicant: Applicant }) {
  const reply = useOfficerReply();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const r = replyState(applicant);
  const [arrived, setArrived] = useState(() => toLocalInput(r?.nominatedAt ?? applicant.created_at));
  const [replied, setReplied] = useState(() => (r?.repliedAt ? toLocalInput(r.repliedAt) : ''));
  if (!r) return null;
  if (!r.repliedAt && !r.waiting) return null; // an old nomination with nothing recorded: nothing to chase, and now would be the wrong time
  if (!('officer_replied_at' in applicant)) {
    return <UpdateNote title="Keeping track of replies to housing officers needs a one-off database update." file="0022_viewings.sql" />;
  }
  const officer = officerOf(applicant);
  const hours = activeSettings().responses.replyHours;
  const save = (patch: { officer_replied_at?: string | null; nominated_at?: string | null }, done?: string) =>
    reply.mutate({ applicant, patch, officer }, {
      onSuccess: () => { toast(done ?? 'Saved', 'success'); setEditing(false); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  const tone = r.overdue ? 'bg-[var(--note-bg)] text-[var(--note-fg)]' : 'bg-[var(--surface-2)] text-[var(--ink)]';

  return (
    <div className={`flex flex-col gap-2 rounded-lg px-3 py-2.5 text-[13px] ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon name={r.repliedAt ? 'check' : 'clock'} size={15} className={r.repliedAt && !r.late ? 'text-[var(--accent)]' : ''} />
        <span className="min-w-0 flex-1 basis-[220px]">
          Nomination from {officer} arrived {when(r.nominatedAt)}.{' '}
          {r.repliedAt
            ? <>First reply {when(r.repliedAt)}{(r.took ?? 0) >= 1 / 60 ? `, ${tookWords(r.took ?? 0)} after it arrived` : ''}{r.late ? `: over the ${hours}-hour target` : ''}.</>
            : r.waiting
              ? <strong>{r.overdue ? `First reply was due ${dueWords(r.due).replace(/^by /, '')}` : `First reply ${dueWords(r.due)}`}</strong>
              : 'No first reply recorded.'}
        </span>
        {!r.repliedAt && (
          <Button busy={reply.isPending} variant="primary" className={small} disabled={reply.isPending}
            onClick={() => save({ officer_replied_at: new Date().toISOString() }, `First reply to ${officer} recorded`)}>
            I've replied to {firstOf(officer)}
          </Button>
        )}
        <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="text-[var(--link)] hover:underline">
          {editing ? 'Cancel' : 'Change the times'}
        </button>
        <Help topic="responses" />
      </div>
      {editing && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-muted)]">Nomination arrived
            <input type="datetime-local" value={arrived} onChange={(e) => setArrived(e.target.value)}
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-muted)]">First reply
            <input type="datetime-local" value={replied} onChange={(e) => setReplied(e.target.value)}
              className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[14px] text-[var(--ink)]" />
          </label>
          <Button busy={reply.isPending} variant="primary" className={small} disabled={!arrived || reply.isPending}
            onClick={() => {
              const patch: { officer_replied_at?: string | null; nominated_at?: string | null } = {};
              const a = new Date(arrived).toISOString();
              if (a !== new Date(r.nominatedAt).toISOString()) patch.nominated_at = a;
              const b = replied ? new Date(replied).toISOString() : null;
              if (b !== (r.repliedAt ? new Date(r.repliedAt).toISOString() : null)) patch.officer_replied_at = b;
              if (Object.keys(patch).length === 0) { setEditing(false); return; }
              save(patch, 'Times saved');
            }}>
            Save the times
          </Button>
        </div>
      )}
    </div>
  );
}

/** On a deal of an officer client: tell the officer how the viewing went, the same day. */
export function OutcomeBackRow({ applicant, deal, showAddress = false, compact = false }: { applicant: Applicant; deal: Deal; showAddress?: boolean; compact?: boolean }) {
  const { officers } = useOfficers();
  const { myName } = usePeople();
  const { outcomes } = useDeals();
  const sent = useOutcomeSent();
  const { toast } = useToast();
  const o = outcomeBack(deal, applicant);
  if (!o || !outcomes) return null;
  const officer = officerOf(applicant);
  const mark = (how: 'email' | 'other') => sent.mutate({ deal, sent: true, how, officer }, {
    onSuccess: () => toast(`Recorded: ${officer} told how ${shortAddress(deal.address)} went`, 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  const where = showAddress ? `${shortAddress(deal.address)}: ` : '';

  if (o.sentAt) {
    if (compact) return null;
    return (
      <p className="m-0 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-muted)]">
        <Icon name="check" size={13} className={o.late ? '' : 'text-[var(--accent)]'} />
        {where}Outcome ({OUTCOME_WORDS[o.outcome].toLowerCase()}) sent to {officer} {when(o.sentAt)}{o.late ? ', after the same-day target' : ''}.
        <button type="button" className="text-[var(--link)] hover:underline" disabled={sent.isPending}
          onClick={() => sent.mutate({ deal, sent: false, officer }, { onError: (e) => toast((e as Error).message, 'danger') })}>Undo</button>
      </p>
    );
  }
  if (!o.waiting) return null;
  const to = caseworkAddress(applicant, officers);
  const email = outcomeEmail(applicant, deal, myName);
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[13px] ${o.overdue ? 'bg-[var(--note-bg)] text-[var(--note-fg)]' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]'}`}>
      <Icon name="mail" size={15} />
      <span className="min-w-0 flex-1 basis-[200px]">
        {where}Tell {officer} how the viewing went ({OUTCOME_WORDS[o.outcome].toLowerCase()}): <strong>{o.overdue ? `was due ${shortDay(o.due)}` : `due ${dueWords(o.due)}`}</strong>.
        {to.note && <span className="block text-[12px] opacity-90">{to.note}</span>}
      </span>
      {to.address && (
        <a href={mailtoLink(to.address, email)} onClick={() => mark('email')}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[15px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)]">
          <Icon name="mail" size={14} />Email {firstOf(officer)}
        </a>
      )}
      {to.address && <OutlookSendButton to={[to.address]} subject={email.subject} body={email.body} what={`how the viewing went to ${officer}`} onSent={() => mark('email')} disabled={sent.isPending} />}
      <Button busy={sent.isPending} className={small} disabled={sent.isPending} onClick={() => mark('other')}>Told them another way</Button>
    </div>
  );
}

import { useState } from 'react';
import { Button, Help, Icon, UpdateNote, useToast } from '../../components/ui';
import { useSetIce } from '../../lib/hooks';
import { addDays, todayIso } from '../../lib/calls';
import { shortDate } from '../../lib/format';
import type { Applicant } from '../../lib/types';

const QUICK: Array<[string, number]> = [['2 weeks', 14], ['1 month', 30], ['3 months', 91]];
const chip = (on: boolean) => `inline-flex min-h-[36px] items-center rounded-full border px-3 text-[13px] font-medium ${on
  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`;

/** Put a client on ice: paused until they are ready, or until a date when they come back by themselves. */
export function IcePanel({ applicant, onClose }: { applicant: Applicant; onClose: () => void }) {
  const ice = useSetIce();
  const { toast } = useToast();
  const [until, setUntil] = useState<string>(addDays(30));
  const [reason, setReason] = useState('');
  const first = applicant.full_name.split(' ')[0];
  const missing = applicant.iced_at === undefined; // before 0017

  const go = () => ice.mutate({ applicant, on: true, until: until || null, reason }, {
    onSuccess: () => { toast(until ? `${first} is on ice until ${shortDate(until)}` : `${first} is on ice`, 'success'); onClose(); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-[var(--ink)]">Put {first} on ice</span>
        <Help topic="ice" />
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]">
          <Icon name="x" size={16} />
        </button>
      </div>
      {missing && <UpdateNote title="Putting clients on ice needs a one-off database update." file="0017_on_ice.sql" />}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">Bring them back</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK.map(([label, days]) => (
            <button key={label} type="button" className={chip(until === addDays(days))} onClick={() => setUntil(addDays(days))}>In {label}</button>
          ))}
          <button type="button" className={chip(!until)} onClick={() => setUntil('')}>When I take them off</button>
          <input type="date" value={until} min={addDays(1)} onChange={(e) => setUntil(e.target.value)} aria-label="Return date"
            className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--ink-muted)]">Why (optional)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wants to think about it, waiting on a job offer"
          className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
      </label>
      <p className="m-0 text-[13px] text-[var(--ink-muted)]">
        While on ice, {first} is not matched to properties, not flagged as stuck or gone cold, and is left out of the Pipeline's main list.
        {until ? ` On ${shortDate(until)} they come back with a next step to check in.` : ' They stay on ice until someone takes them off.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button busy={ice.isPending} variant="primary" disabled={ice.isPending || missing || (!!until && until <= todayIso())} onClick={go}>
          {ice.isPending ? 'Saving…' : `Put ${first} on ice`}
        </Button>
        <Button busy={ice.isPending} disabled={ice.isPending} onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

/** Shown on a client who is on ice: until when, why, and a way to bring them back now. */
export function IceBand({ applicant }: { applicant: Applicant }) {
  const ice = useSetIce();
  const { toast } = useToast();
  const first = applicant.full_name.split(' ')[0];
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3 text-[14px]" style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
      <Icon name="clock" size={16} />
      <span className="min-w-0 flex-1 basis-[220px]">
        <strong>On ice</strong>{applicant.iced_until ? ` until ${shortDate(applicant.iced_until)}` : ' until someone takes them off'}
        {applicant.iced_reason ? `: ${applicant.iced_reason}` : ''}
        {applicant.iced_at ? <span className="opacity-80"> (since {shortDate(applicant.iced_at)})</span> : null}
      </span>
      <Button busy={ice.isPending} className="min-h-0 px-3 py-1.5 text-[13px]" disabled={ice.isPending}
        onClick={() => ice.mutate({ applicant, on: false }, {
          onSuccess: () => toast(`${first} is back: next step is to check in today`, 'success'),
          onError: (e) => toast((e as Error).message, 'danger'),
        })}>
        Take {first} off ice
      </Button>
    </div>
  );
}

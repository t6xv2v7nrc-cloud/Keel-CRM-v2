import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { useDeals, useOfficerReply, useOfficers, useOutcomeSent, usePeople } from '../../lib/hooks';
import { shortDay } from '../../lib/format';
import { shortAddress } from '../../lib/progress';
import { caseworkAddress, dueWords, mailtoLink, outcomeEmail, responsesDue } from '../../lib/viewings';
import type { DueItem } from '../../lib/viewings';
import type { Applicant } from '../../lib/types';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const linkButton = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[15px] font-medium hover:border-[var(--accent)]';
const officerOf = (a: Applicant) => a.officer_name?.trim() || 'the officer';
const firstOf = (name: string) => name.split(/\s+/)[0];

/** Home: what Keel owes people now. First replies to officers' nominations, viewings to record, outcomes to send back. */
export function WaitingOnUs({ applicants }: { applicants: Applicant[] }) {
  const { deals, ready, outcomes } = useDeals();
  const [all, setAll] = useState(false);
  const items = useMemo(() => responsesDue(applicants, deals), [applicants, deals]);
  // before 0022 nothing can be recorded, so only viewings to record are listed
  const shown = (outcomes ? items : items.filter((i) => i.kind === 'record'));
  if (!ready || shown.length === 0) return null;
  const overdue = shown.filter((i) => i.overdue).length;
  const list = all ? shown : shown.slice(0, 6);

  return (
    <Card fold="home.waiting">
      <CardHeader icon="clock" title="Waiting on us" sub={`${shown.length} due${overdue ? ` · ${overdue} overdue` : ''}`} help="responses" />
      <ul className="m-0 flex list-none flex-col gap-1 p-3 sm:p-4">
        {list.map((i) => <Row key={`${i.kind}-${i.kind === 'reply' ? i.applicant.id : i.deal.id}`} item={i} />)}
      </ul>
      {shown.length > 6 && (
        <div className="border-t border-[var(--line)] px-5 py-2.5 text-[13px]">
          <button type="button" onClick={() => setAll((v) => !v)} className="text-[var(--link)] hover:underline">{all ? 'Show fewer' : `Show all ${shown.length}`}</button>
        </div>
      )}
    </Card>
  );
}

function Row({ item }: { item: DueItem }) {
  const reply = useOfficerReply();
  const sent = useOutcomeSent();
  const { officers } = useOfficers();
  const { myName } = usePeople();
  const { toast } = useToast();
  const a = item.applicant;
  const officer = officerOf(a);
  const due = item.overdue ? `was due ${item.kind === 'reply' ? dueWords(item.due).replace(/^by /, '') : shortDay(item.due)}` : `due ${dueWords(item.due)}`;
  const fail = (e: unknown) => toast((e as Error).message, 'danger');

  const what = item.kind === 'reply' ? `Reply to ${officer} about the nomination`
    : item.kind === 'record' ? `How did the viewing at ${shortAddress(item.deal.address)} go?`
    : `Tell ${officer} how ${shortAddress(item.deal.address)} went`;

  let action = null;
  if (item.kind === 'reply') {
    action = (
      <Button className={small} disabled={reply.isPending}
        onClick={() => reply.mutate({ applicant: a, patch: { officer_replied_at: new Date().toISOString() }, officer }, {
          onSuccess: () => toast(`First reply to ${officer} recorded`, 'success'), onError: fail,
        })}>
        I've replied
      </Button>
    );
  } else if (item.kind === 'record') {
    action = <Link to={`/applicants/${a.id}`} className={`${linkButton} text-[var(--ink)]`}>Record it</Link>;
  } else {
    const deal = item.deal;
    const to = caseworkAddress(a, officers);
    const mark = (how: 'email' | 'other') => sent.mutate({ deal, sent: true, how, officer }, {
      onSuccess: () => toast(`Recorded: ${officer} told how ${shortAddress(deal.address)} went`, 'success'), onError: fail,
    });
    action = (
      <span className="flex flex-wrap gap-1.5">
        {to.address && (
          <a href={mailtoLink(to.address, outcomeEmail(a, deal, myName))} onClick={() => mark('email')} title={to.note ?? undefined}
            className={`${linkButton} text-[var(--accent-ink)]`}>
            <Icon name="mail" size={14} />Email {firstOf(officer)}
          </a>
        )}
        <Button className={small} disabled={sent.isPending} onClick={() => mark('other')}>{to.address ? 'Told them' : 'Told them another way'}</Button>
      </span>
    );
  }

  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2 ${item.overdue ? 'bg-[var(--note-bg)]' : 'bg-[var(--surface-2)]'}`}>
      <div className="min-w-0 flex-1 basis-[200px]">
        <Link to={`/applicants/${a.id}`} className="block truncate text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
        <div className={`text-[13px] ${item.overdue ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>
          {what} · <span className={item.overdue ? 'font-semibold' : ''}>{due}</span>
        </div>
      </div>
      {action}
    </li>
  );
}

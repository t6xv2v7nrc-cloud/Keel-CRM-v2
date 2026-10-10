import { useMemo, useState } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { useAddNote, usePeople } from '../../lib/hooks';
import { CHANNEL_LABEL, CHANNELS, lastContacts, readNote } from '../../lib/contacts';
import type { Channel } from '../../lib/contacts';
import { clockTime, shortDay, timeAgo } from '../../lib/format';
import type { Activity, Applicant, Call } from '../../lib/types';
import { CHANNEL_ICON } from './channelIcon';

const LAST_KEY = 'keel.noteChannel';
const firstChannel = (): Channel => {
  try { const c = localStorage.getItem(LAST_KEY) as Channel | null; return c && c in CHANNEL_LABEL ? c : 'call'; } catch { return 'call'; }
};
const SHOWN = 5;

/** Notes on a client: how you last spoke to them and what about, newest first, with who wrote each. */
export function NotesCard({ applicant, activities, calls }: { applicant: Applicant; activities: Activity[]; calls: Call[] }) {
  const add = useAddNote();
  const { whoOf } = usePeople();
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>(firstChannel);
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const first = applicant.full_name.split(' ')[0];

  // notes and logged calls (properties sent on WhatsApp stay on the timeline, but count as contact)
  const notes = useMemo(() => activities.filter((a) => a.kind === 'contact' || a.kind === 'note' || a.kind === 'call'), [activities]);
  const last = useMemo(() => lastContacts(activities, calls).get(applicant.id) ?? null, [activities, calls, applicant.id]);

  const save = () => {
    if (!text.trim()) return;
    add.mutate({ applicantId: applicant.id, channel, text }, {
      onSuccess: () => {
        setText('');
        try { localStorage.setItem(LAST_KEY, channel); } catch { /* fine */ }
        toast(channel === 'note' ? 'Note saved' : `Saved: ${CHANNEL_LABEL[channel]} with ${first}`, 'success');
      },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  const shown = all ? notes : notes.slice(0, SHOWN);
  return (
    <Card>
      <CardHeader icon="pencil" title="Notes and contact" help="notes"
        sub={last ? `Last contact ${timeAgo(last.at)}, ${CHANNEL_LABEL[last.channel].toLowerCase()}` : 'Not contacted yet'} />
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="How you were in touch" className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => {
              const on = c.key === channel;
              return (
                <button key={c.key} type="button" role="radio" aria-checked={on} onClick={() => setChannel(c.key)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${on
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                    : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                  <Icon name={CHANNEL_ICON[c.key]} size={13} />{c.label}
                </button>
              );
            })}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
            placeholder={channel === 'note' ? `A note about ${first}` : `What did you talk about with ${first}?`}
            aria-label="Note"
            className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" className="min-h-0 px-4 py-2 text-[14px]" disabled={!text.trim() || add.isPending} onClick={save}>
              {add.isPending ? 'Saving…' : channel === 'note' ? 'Save note' : `Save ${CHANNEL_LABEL[channel].toLowerCase()} note`}
            </Button>
            <span className="text-[12px] text-[var(--ink-muted)]">Dated and signed with your name. Both of you can see it.</span>
          </div>
        </div>

        {notes.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] border-t border-[var(--line)] p-0">
            {shown.map((a) => {
              const n = readNote(a);
              if (!n) return null;
              const who = whoOf(a.actor);
              return (
                <li key={a.id} className="flex gap-3 py-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink-muted)]">
                    <Icon name={CHANNEL_ICON[n.channel]} size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-wrap break-words text-[15px] text-[var(--ink)]">{n.text}</div>
                    <div className="mt-0.5 text-[13px] text-[var(--ink-muted)]">
                      {[n.channel === 'note' ? 'Note' : CHANNEL_LABEL[n.channel], `${shortDay(a.created_at)}, ${clockTime(a.created_at)}`, who ? `by ${who}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {notes.length > SHOWN && (
          <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-[13px] text-[var(--link)] hover:underline">
            {all ? 'Show fewer' : `Show all ${notes.length} notes`}
          </button>
        )}
      </div>
    </Card>
  );
}

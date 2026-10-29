import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Icon } from '../../components/ui';
import { awaitingReply, waitWords } from '../../lib/followUp';
import { useAddNote } from '../../lib/hooks';
import { waLink, waNumber } from '../../lib/whatsapp';
import type { LastContact } from '../../lib/contacts';
import type { Applicant } from '../../lib/types';

/** At the top of the Pipeline (brief C1): everyone who messaged Keel, or was handed over by the WhatsApp AI, and has
 *  had no reply. Waiting 24 hours or more is in red. A note of contact, a call or a WhatsApp send takes them off. */
export function AwaitingReply({ applicants, contacts }: { applicants: Applicant[]; contacts: Map<string, LastContact> }) {
  const [more, setMore] = useState(false);
  const note = useAddNote();
  const list = useMemo(() => awaitingReply(applicants, (id) => contacts.get(id)?.at ?? null), [applicants, contacts]);
  if (!list.length) return null;
  const late = list.filter((w) => w.late).length;
  const shown = more ? list : list.slice(0, 6);
  return (
    <Card fold="pipeline.awaiting">
      <CardHeader icon="chat" title={`Awaiting reply (${list.length})`} help="awaitingReply"
        sub={late ? `${late} waiting over 24 hours` : 'All within 24 hours'} />
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
        {shown.map((w) => {
          const a = w.applicant;
          const first = a.full_name.trim().split(/\s+/)[0];
          const number = waNumber(a.phone);
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5"
              style={w.late ? { background: 'var(--danger-soft)' } : undefined}>
              <Link to={`/applicants/${a.id}`} className="min-w-0 flex-1 basis-[180px] text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: w.late ? 'var(--danger)' : 'var(--ink-muted)' }}>
                <Icon name={w.late ? 'alert' : 'clock'} size={13} />{waitWords(w)}
              </span>
              {number && (
                <a href={waLink(number, `Hi ${first}, `)} target="_blank" rel="noreferrer" aria-label={`Reply to ${first} on WhatsApp`}
                  // replying is logged, like every WhatsApp send, and takes them off this list
                  onClick={() => note.mutate({ applicantId: a.id, channel: 'whatsapp', text: 'Replied to their message' })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--line)] px-2 text-[13px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                  <Icon name="chat" size={14} />Reply
                </a>
              )}
            </li>
          );
        })}
        {list.length > 6 && (
          <li className="px-4 py-2 sm:px-5">
            <button type="button" onClick={() => setMore((v) => !v)} className="text-[13px] font-medium text-[var(--link)] hover:underline">
              {more ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          </li>
        )}
      </ul>
    </Card>
  );
}

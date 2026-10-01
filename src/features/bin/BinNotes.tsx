import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { timeAgo, shortDate } from '../../lib/format';
import { useFiledLinks, useUpdateInboxItem } from './useInbox';
import type { InboxItem } from './useInbox';

/**
 * What happened to everything filed from the Bin. Notes ("Just log a note")
 * are kept here in full, searchable, and can go back to the review list to
 * become a client or be added to one. Items filed to a client link to them.
 */
export function BinFiled({ inbox }: { inbox: InboxItem[] }) {
  const { data: links, isSuccess } = useFiledLinks();
  const update = useUpdateInboxItem();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const clientOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of links ?? []) if (l.entity_type === 'applicant' && !m.has(l.inbox_item_id)) m.set(l.inbox_item_id, l.entity_id);
    return m;
  }, [links]);
  if (!isSuccess) return null;

  const confirmed = inbox.filter((i) => i.status === 'confirmed');
  const notes = confirmed.filter((i) => !clientOf.has(i.id));
  const toClients = confirmed.filter((i) => clientOf.has(i.id)).slice(0, 8);
  const needle = q.trim().toLowerCase();
  const found = needle ? notes.filter((i) => `${i.extraction?.summary ?? ''} ${i.raw_text ?? ''}`.toLowerCase().includes(needle)) : notes;
  const shown = showAll || needle ? found : found.slice(0, 5);

  const reopen = (item: InboxItem) => update.mutate({ id: item.id, status: 'review', confirmed_at: null }, {
    onSuccess: () => { toast('Back in the review list above: choose Create new client or Update', 'success'); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <>
      {notes.length > 0 && (
        <Card>
          <CardHeader icon="pencil" title="Notes" sub={String(notes.length)} help="binNotes" />
          <div className="flex flex-col gap-3 p-5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes: a name, phone, area" aria-label="Search notes"
              className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
              {shown.map((item) => {
                const a = item.extraction?.applicant;
                const isOpen = open === item.id;
                return (
                  <li key={item.id} className="flex flex-col gap-2 py-3">
                    <button type="button" onClick={() => setOpen(isOpen ? null : item.id)} aria-expanded={isOpen} className="flex items-start gap-3 text-left">
                      <Icon name="arrowRight" size={14} className={`mt-1 shrink-0 text-[var(--ink-muted)] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] text-[var(--ink)]">{item.extraction?.summary ?? 'Note'}</span>
                        <span className="block text-[12px] text-[var(--ink-muted)]">
                          Filed {shortDate(item.confirmed_at ?? item.created_at)} ({timeAgo(item.confirmed_at ?? item.created_at)})
                          {a?.full_name ? ` · ${a.full_name}` : ''}{a?.phone ? ` · ${a.phone}` : ''}
                        </span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="ml-[26px] flex flex-col gap-2">
                        <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md bg-[var(--surface-2)] p-3 font-mono text-[13px] text-[var(--ink)]">
                          {item.raw_text || 'No text was kept for this item.'}
                        </pre>
                        <div className="flex flex-wrap gap-2">
                          <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={update.isPending} onClick={() => reopen(item)}>
                            <Icon name="plus" size={14} />Make a client from it, or add it to one
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {found.length === 0 && <li className="py-3 text-[14px] text-[var(--ink-muted)]">No notes match "{q.trim()}".</li>}
            </ul>
            {!needle && found.length > 5 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="self-start text-[13px] text-[var(--link)] hover:underline">
                {showAll ? 'Show fewer' : `Show all ${found.length} notes`}
              </button>
            )}
          </div>
        </Card>
      )}

      {toClients.length > 0 && (
        <Card>
          <CardHeader title="Recently filed to clients" sub={String(toClients.length)} />
          <ul className="m-0 list-none p-0">
            {toClients.map((item) => (
              <li key={item.id} className="border-b border-[var(--line)] last:border-b-0">
                <Link to={`/applicants/${clientOf.get(item.id)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface-2)]">
                  <span className="rounded bg-[var(--stage-placed-bg)] px-2 py-0.5 text-[13px] text-[var(--stage-placed-fg)]">
                    {item.detected_type?.replace(/_/g, ' ') ?? 'filed'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--ink)]">{item.extraction?.summary ?? '·'}</span>
                  <span className="font-mono text-[13px] text-[var(--ink-muted)]">{timeAgo(item.confirmed_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

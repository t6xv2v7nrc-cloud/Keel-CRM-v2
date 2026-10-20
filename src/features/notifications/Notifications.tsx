import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApplicants, useCalls, useDeals, useOutlookMessages, usePeople, useReceivables } from '../../lib/hooks';
import { callQueue, lastCallMap } from '../../lib/calls';
import { noticesFor, unreadOf } from '../../lib/notifications';
import type { Notice, NoticeKind } from '../../lib/notifications';
import { timeAgo } from '../../lib/format';
import type { Activity } from '../../lib/types';
import type { InboxItem } from '../bin/useInbox';

const ICON: Record<NoticeKind, IconName> = {
  bin: 'inbox', reply: 'mail', outcome: 'mail', record: 'clock', viewing: 'calendar', steps: 'flag', overdue: 'pound',
  officer_email: 'mail', email: 'chat', ice: 'sparkle',
};

// read on this device, per person
const readKey = (uid: string | null) => `keel.notices.read.${uid ?? 'me'}`;
function loadRead(uid: string | null): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(readKey(uid)) ?? '[]') as string[]); } catch { return new Set(); }
}
function saveRead(uid: string | null, read: Set<string>, keep: Notice[]) {
  // only ids still showing are kept, so the list never grows
  const ids = new Set(keep.map((n) => n.id));
  try { localStorage.setItem(readKey(uid), JSON.stringify([...read].filter((id) => ids.has(id)))); } catch { /* fine */ }
}

/** Everything the bell needs, refreshed every minute while Keel is open. */
function useNotices(): Notice[] {
  const { data: applicants = [] } = useApplicants();
  const { deals } = useDeals();
  const { receivables } = useReceivables();
  const { pending } = useOutlookMessages();
  const { calls } = useCalls();
  const inbox = useQuery({
    queryKey: ['inbox'], refetchInterval: 60_000,
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase.from('inbox_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as InboxItem[];
    },
  });
  const emails = useQuery({
    queryKey: ['activities', 'emails'], refetchInterval: 120_000,
    queryFn: async (): Promise<Activity[]> => {
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const { data, error } = await supabase.from('activities').select('*').eq('kind', 'email').gte('created_at', since).order('created_at', { ascending: false }).limit(30);
      if (error) return [];
      return data as Activity[];
    },
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const stepsDue = useMemo(() => callQueue(applicants, lastCallMap(calls)).filter((q) => q.state.kind === 'due').length, [applicants, calls]);
  return useMemo(() => noticesFor({
    applicants, deals, receivables, inbox: inbox.data ?? [], officerEmails: pending, emails: emails.data ?? [], stepsDue, now,
  }), [applicants, deals, receivables, inbox.data, pending, emails.data, stepsDue, now]);
}

/** The bell in the top bar: how many things need you, and the list. New ones pop up briefly while you work. */
export function Notifications() {
  const navigate = useNavigate();
  const { meId } = usePeople();
  const notices = useNotices();
  const [read, setRead] = useState<Set<string>>(() => loadRead(meId));
  useEffect(() => setRead(loadRead(meId)), [meId]);
  const unread = unreadOf(notices, read);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // the bell rings and the count bumps when something new arrives
  const [ring, setRing] = useState(0);
  const lastCount = useRef(unread.length);
  useEffect(() => { if (unread.length > lastCount.current) setRing((r) => r + 1); lastCount.current = unread.length; }, [unread.length]);

  // pop-ups: only for what turns up while Keel is open, not what was there when it opened
  const seen = useRef<Set<string> | null>(null);
  const [pops, setPops] = useState<Notice[]>([]);
  useEffect(() => {
    if (!notices.length && seen.current === null) return;
    if (seen.current === null) { seen.current = new Set(notices.map((n) => n.id)); return; }
    const fresh = notices.filter((n) => !seen.current!.has(n.id) && !read.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (fresh.length) setPops((p) => [...p, ...fresh].slice(-3));
  }, [notices, read]);
  useEffect(() => {
    if (!pops.length) return;
    const t = setTimeout(() => setPops((p) => p.slice(1)), 6500);
    return () => clearTimeout(t);
  }, [pops]);

  const markRead = (ids: string[]) => setRead((r) => { const n = new Set(r); ids.forEach((id) => n.add(id)); saveRead(meId, n, notices); return n; });
  const go = (n: Notice) => { markRead([n.id]); setOpen(false); setPops((p) => p.filter((x) => x.id !== n.id)); navigate(n.href); };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread.length ? `Notifications: ${unread.length} new` : 'Notifications'} title="Notifications"
        className={`relative grid h-9 w-9 place-items-center rounded-md border transition-colors ${open ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
        <span key={`ring-${ring}`} className={ring ? 'keel-ring' : ''}><Icon name="bell" size={17} /></span>
        {unread.length > 0 && (
          <span key={`n-${unread.length}`} className="keel-bump absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          className="keel-pop fixed left-2 right-2 top-14 z-[900] flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-pop)] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
            <span className="text-[15px] font-semibold text-[var(--ink)]">Notifications</span>
            {unread.length > 0 && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--accent-ink)]">{unread.length} new</span>}
            {unread.length > 0 && (
              <button type="button" onClick={() => markRead(unread.map((n) => n.id))} className="ml-auto text-[13px] text-[var(--link)] hover:underline">Mark all as read</button>
            )}
          </div>
          {notices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)]"><Icon name="check" size={22} strokeWidth={2.4} /></span>
              <span className="text-[15px] font-semibold text-[var(--ink)]">All clear</span>
              <span className="text-[13px] text-[var(--ink-muted)]">Nothing needs you right now. Replies due, viewings coming up and new things in the Bin show here.</span>
            </div>
          ) : (
            <ul className="keel-stagger m-0 flex list-none flex-col overflow-y-auto p-1.5">
              {notices.map((n) => {
                const isNew = !read.has(n.id);
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => go(n)}
                      className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-[var(--surface-2)] ${isNew ? '' : 'opacity-70'}`}>
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.urgent ? 'bg-[var(--note-bg)] text-[var(--note-fg)]' : 'bg-[var(--paper-2)] text-[var(--ink-muted)]'}`}>
                        <Icon name={ICON[n.kind]} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] leading-snug text-[var(--ink)] ${isNew ? 'font-semibold' : 'font-medium'}`}>{n.title}</span>
                        {n.detail && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--ink-muted)] [overflow-wrap:anywhere]">{n.detail}</span>}
                        <span className="mt-0.5 block text-[12px] text-[var(--ink-muted)]">{n.urgent ? 'Needs you soon · ' : ''}{timeAgo(n.at)}</span>
                      </span>
                      {isNew && <span aria-label="New" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-[var(--line)] px-4 py-2.5 text-[12px] text-[var(--ink-muted)]">
            Want these on your phone when Keel is closed? <button type="button" onClick={() => { setOpen(false); navigate('/settings#notifications'); }} className="text-[var(--link)] hover:underline">Turn on notifications</button>
          </div>
        </div>
      )}

      {/* new while you work: a card slides in at the top right for a few seconds */}
      {pops.length > 0 && !open && (
        <div aria-live="polite" className="pointer-events-none fixed right-3 top-16 z-[950] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2">
          {pops.map((n) => (
            <div key={n.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[var(--shadow-pop)]"
              style={{ animation: 'keel-slide-in var(--dur-slow) var(--ease-spring) both' }}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.urgent ? 'bg-[var(--note-bg)] text-[var(--note-fg)]' : 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'}`}>
                <Icon name={ICON[n.kind]} size={15} />
              </span>
              <button type="button" onClick={() => go(n)} className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold leading-snug text-[var(--ink)]">{n.title}</span>
                {n.detail && <span className="mt-0.5 block truncate text-[13px] text-[var(--ink-muted)]">{n.detail}</span>}
              </button>
              <button type="button" onClick={() => setPops((p) => p.filter((x) => x.id !== n.id))} aria-label="Close"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

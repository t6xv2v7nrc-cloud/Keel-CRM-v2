import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Empty, Icon, PageHeader, UpdateNote, useToast } from '../../components/ui';
import { copyText } from '../../lib/clipboard';
import { shortDate } from '../../lib/format';
import { todayIso } from '../../lib/calls';
import { nominationsFrom } from '../../lib/mailer';
import {
  addressBox, boroughOf, bulkSendsIn30, byFocus, focusRank, hasSendStatus, listHealth, mailingList, nominatedAt, optedIn, needsOptIn,
  ROUTE_WORDS, sendAddress, statusOf, STATUS_WORDS, whyNotSendable,
} from '../../lib/councils';
import type { HealthKey, OfficerRecord, OfficerSend, OfficerStatus, RouteType } from '../../lib/councils';
import { useApplicants, useLogOfficerSends, useOfficerSends, useOfficers, useSaveOfficer, useSetOfficerStatus } from '../../lib/hooks';
import { SchemesView } from './Schemes';
import { OutlookImport } from '../outlook/Outlook';
import { PasteOfficers } from './PasteOfficers';
import { Tip } from '../guide/Guide';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';

type Tab = 'officers' | 'schemes';

/** Councils: the officer list with who may be emailed (Step 3), and each council's procurement or landlord scheme. */
export function CouncilsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'schemes' ? 'schemes' : 'officers';
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="users" title="Councils" help="councils" sub="Who may be emailed, and each council's scheme" />
      <Tip id="councils" />
      <div role="tablist" aria-label="Councils" className="flex w-full rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-1 sm:w-fit">
        {([['officers', 'Officers'], ['schemes', 'Schemes']] as const).map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setParams(k === 'officers' ? {} : { tab: k }, { replace: true })}
            className={`flex-1 rounded-md px-4 py-2 text-[14px] font-medium sm:flex-none ${tab === k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'officers' ? <OfficersView /> : <SchemesView />}
    </div>
  );
}

const HEALTH: Array<{ key: HealthKey; label: string; warn: boolean; hint: string }> = [
  { key: 'sendable', label: 'Can be emailed', warn: false, hint: 'Active, with an address, opted in or nominated a client' },
  { key: 'notOptedIn', label: 'Not opted in', warn: true, hint: 'Housing officers who have not opted in or sent a client' },
  { key: 'bounced', label: 'Bounced', warn: true, hint: 'An email to them came back' },
  { key: 'left', label: 'Left', warn: false, hint: 'No longer there' },
  { key: 'onLeave', label: 'On leave', warn: false, hint: 'Back on their return date' },
  { key: 'optedOut', label: 'Opted out', warn: false, hint: 'Asked not to be emailed' },
  { key: 'overSent', label: 'Sent to twice in 30 days', warn: true, hint: 'More than one bulk email or digest' },
  { key: 'noAddress', label: 'No email', warn: false, hint: 'Nothing to send to' },
];

function OfficersView() {
  const { officers, ready, sendStatus, loading } = useOfficers();
  const sends = useOfficerSends();
  const { data: applicants = [] } = useApplicants();
  const logSends = useLogOfficerSends();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [council, setCouncil] = useState('any');
  const [health, setHealth] = useState<HealthKey | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const today = todayIso();

  // officers named on clients have nominated a client: when their newest client arrived
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);

  const sorted = useMemo(() => byFocus(officers), [officers]);
  const h = useMemo(() => listHealth(officers, sends, { nominatedFromClients: fromClients }), [officers, sends, fromClients]);
  const councils = useMemo(() => {
    const names = new Map<string, number>();
    for (const o of sorted) { const b = boroughOf(o) ?? o.council?.trim() ?? ''; names.set(b, (names.get(b) ?? 0) + 1); }
    return [...names.entries()];
  }, [sorted]);
  const terms = q.trim().toLowerCase();
  const inHealth = health === 'all' ? null : new Set(h[health].map((o) => String(o.id)));
  const shown = sorted.filter((o) => (council === 'any' || (boroughOf(o) ?? o.council?.trim() ?? '') === council)
    && (!inHealth || inHealth.has(String(o.id)))
    && (!terms || [o.name, o.email, o.send_to_mailbox, o.council, o.borough, o.title].some((x) => x?.toLowerCase().includes(terms))));
  const list = mailingList(shown, { nominatedFromClients: fromClients });
  const twice = list.to.filter(({ officer }) => bulkSendsIn30(officer, sends, today) >= 1);

  const copy = async () => {
    const ok = await copyText(addressBox(list));
    toast(ok ? `Copied ${list.addresses.length} ${list.addresses.length === 1 ? 'address' : 'addresses'} for the Bcc box` : 'Could not copy. Press and hold to copy instead.', ok ? 'success' : 'danger');
  };
  const record = () => {
    if (twice.length && !window.confirm(`${twice.length} of them already had a bulk email or digest in the last 30 days. Record this send anyway?`)) return;
    logSends.mutate({ to: list.to, kind: 'bulk' }, {
      onSuccess: () => toast(`Bulk email recorded to ${list.to.length} ${list.to.length === 1 ? 'officer' : 'officers'}`, 'success'),
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };

  if (loading) return null;
  if (!ready) return <Empty icon="users" title="No officer list yet">The officers table is missing from the database.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <PasteOfficers />
      <OutlookImport />
      {!sendStatus && <UpdateNote title="Send status (opted out, left, bounces) needs a one-off database update." file="0020_council_contacts.sql">
        Until then nobody can be marked, and no mailing list can be copied from here.</UpdateNote>}

      {/* List health */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {HEALTH.map((t) => {
          const n = h[t.key].length;
          const on = health === t.key;
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => setHealth(on ? 'all' : t.key)} title={t.hint}
              className={`flex min-w-0 flex-col items-start gap-0.5 rounded-lg border p-3 text-left shadow-[var(--shadow-card)] ${on ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--line)]'}`}
              style={{ background: t.warn && n > 0 && !on ? 'var(--note-bg)' : 'var(--surface)' }}>
              <span className={`text-[13px] font-medium ${t.warn && n > 0 ? 'text-[var(--note-fg)]' : 'text-[var(--ink-muted)]'}`}>{t.label}</span>
              <span className="font-mono text-[20px] font-semibold text-[var(--ink)]">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or council" aria-label="Search officers" className={`${box} flex-1 basis-[200px]`} />
        <select value={council} onChange={(e) => setCouncil(e.target.value)} aria-label="Council" className={`${box} w-auto max-w-full px-2`}>
          <option value="any">Every council ({officers.length})</option>
          {councils.map(([c, n]) => <option key={c || 'none'} value={c}>{focusRank(c || null) === 0 ? '★ ' : ''}{c || 'Not known'} ({n})</option>)}
        </select>
        {health !== 'all' && <Button className={small} onClick={() => setHealth('all')}><Icon name="x" size={14} />{HEALTH.find((t) => t.key === health)?.label}</Button>}
        <Button className={small} onClick={() => setAdding((v) => !v)}><Icon name="plus" size={14} />Add a contact or mailbox</Button>
      </div>
      {adding && <OfficerEditor officer={null} onDone={() => setAdding(false)} />}

      {/* The mailing list: only ever from mailingList (the hard rule) */}
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className={small} disabled={!sendStatus || !list.to.length} onClick={copy}>
            <Icon name="mail" size={14} />Copy the mailing list ({list.addresses.length})
          </Button>
          <Button busy={logSends.isPending} className={small} disabled={!sendStatus || !list.to.length || logSends.isPending} onClick={record}>
            <Icon name="send" size={14} />Record a bulk email to them
          </Button>
        </div>
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">
          {list.to.length} of the {shown.length} shown can be emailed{list.addresses.length !== list.to.length ? `, at ${list.addresses.length} addresses (shared mailboxes are used where set)` : ''}.
          {list.left.length > 0 && ` Left out: ${summarise(list.left.map((l) => l.why))}.`}
        </p>
        {twice.length > 0 && (
          <p className="m-0 flex gap-1.5 text-[13px]" style={{ color: 'var(--note-fg)' }}>
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {twice.length} of them already had a bulk email or digest in the last 30 days: another would be their second.
          </p>
        )}
      </Card>

      <Card>
        {shown.length === 0 ? <Empty icon="users" title="Nobody matches that">Change the search or the council.</Empty> : (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {shown.map((o) => <OfficerRow key={String(o.id)} o={o} sends={sends} nominatedFromClients={fromClients(o)} canMark={sendStatus} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** "3 opted out, 2 left, 1 not opted in yet" */
function summarise(whys: string[]): string {
  const counts = new Map<string, number>();
  for (const w of whys) { const k = w.startsWith('On leave') ? 'On leave' : w; counts.set(k, (counts.get(k) ?? 0) + 1); }
  return [...counts.entries()].map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ');
}

const STATUS_TONE: Record<OfficerStatus, { bg: string; fg: string }> = {
  active: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
  on_leave: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' },
  left: { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' },
  opted_out: { bg: 'var(--note-bg)', fg: 'var(--note-fg)' },
  bounced: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
};

function OfficerRow({ o, sends, nominatedFromClients, canMark }: { o: OfficerRecord; sends: OfficerSend[]; nominatedFromClients: string | null; canMark: boolean }) {
  const setStatus = useSetOfficerStatus();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const status = statusOf(o);
  const why = whyNotSendable(o, { nominatedFromClients });
  const borough = boroughOf(o);
  const rank = focusRank(borough);
  const bulk = bulkSendsIn30(o, sends);
  const nominated = nominatedAt(o, nominatedFromClients);
  const last = sends.find((s) => s.officer_id === String(o.id));
  const mark = (s: OfficerStatus, extra: { leaveUntil?: string | null } = {}) => setStatus.mutate({ officer: o, status: s, ...extra }, {
    onSuccess: () => toast(`${o.name ?? 'Officer'}: ${STATUS_WORDS[s].toLowerCase()}`, 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  const t = STATUS_TONE[status];
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-medium text-[var(--ink)]">{o.name ?? 'Name not given'}</span>
            {o.title && <span className="text-[13px] text-[var(--ink-muted)]">{o.title}</span>}
            {hasSendStatus(o) && <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: t.bg, color: t.fg }}>{STATUS_WORDS[status]}{status === 'on_leave' && o.leave_until ? ` until ${shortDate(o.leave_until)}` : ''}</span>}
            {(borough || o.council) && <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>{rank === 0 ? '★ ' : ''}{borough ?? o.council}</span>}
            {rank === 0 && <span className="sr-only">Focus borough</span>}
            {o.route_type && o.route_type !== 'housing_officer' && <span className="text-[12px] text-[var(--ink-muted)]">{ROUTE_WORDS[o.route_type]}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[13px]">
            {o.send_to_mailbox ? <span className="break-all text-[var(--ink)]">Sends to {o.send_to_mailbox}{o.email ? <span className="text-[var(--ink-muted)]"> (not {o.email})</span> : null}</span>
              : o.email ? <span className="break-all text-[var(--ink)]">{o.email}</span> : <span className="text-[var(--ink-muted)]">No email</span>}
            {o.phone && <span className="font-mono text-[var(--ink)]">{o.phone}</span>}
          </div>
          <div className="text-[13px] text-[var(--ink-muted)]">
            {[
              why ? <span key="why" style={{ color: why === 'Not opted in yet' || why === 'Email bounced' ? 'var(--note-fg)' : undefined }}>Not emailed: {why.charAt(0).toLowerCase() + why.slice(1)}</span> : <span key="ok" className="text-[var(--accent-ink)]">Can be emailed</span>,
              needsOptIn(o) && optedIn(o, nominatedFromClients) ? (o.opt_in_source ? `opted in: ${o.opt_in_source}` : o.opted_in_at ? `opted in ${shortDate(o.opted_in_at)}` : null) : null,
              nominated ? `last sent a client ${shortDate(nominated)}` : null,
              last ? `last sent to ${shortDate(last.sent_at)}` : o.last_sent_at ? `last sent to ${shortDate(o.last_sent_at)}` : null,
              bulk > 1 ? <span key="bulk" style={{ color: 'var(--note-fg)' }}>{bulk} bulk sends in 30 days</span> : null,
              (o.bounce_count ?? 0) > 0 ? `${o.bounce_count} ${o.bounce_count === 1 ? 'bounce' : 'bounces'}` : null,
              o.opt_out_note ? `"${o.opt_out_note}"` : null,
            ].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}
          </div>
        </div>
        {canMark && (
          <div className="flex flex-wrap items-center gap-1.5">
            {status !== 'opted_out' && <Button busy={setStatus.isPending} className={small} disabled={setStatus.isPending} onClick={() => mark('opted_out')}>Mark as opted out</Button>}
            {status !== 'left' && <Button busy={setStatus.isPending} className={small} disabled={setStatus.isPending} onClick={() => mark('left')}>Mark as left</Button>}
            {status !== 'active' && <Button busy={setStatus.isPending} className={small} disabled={setStatus.isPending} onClick={() => mark('active')}>Back to active</Button>}
            <Button className={small} aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Icon name="pencil" size={14} />More</Button>
          </div>
        )}
      </div>
      {editing && <OfficerEditor officer={o} onDone={() => setEditing(false)} />}
    </li>
  );
}

const ROUTES = Object.keys(ROUTE_WORDS) as RouteType[];

/** Add a contact or mailbox, or change one: route, shared mailbox, opt-in, leave, bounce, details. */
function OfficerEditor({ officer, onDone }: { officer: OfficerRecord | null; onDone: () => void }) {
  const save = useSaveOfficer();
  const setStatus = useSetOfficerStatus();
  const { toast } = useToast();
  const [f, setF] = useState({
    name: officer?.name ?? '', title: officer?.title ?? '', council: officer?.council ?? '', borough: officer?.borough ?? '', email: officer?.email ?? '',
    phone: officer?.phone ?? '', route_type: (officer?.route_type ?? 'housing_officer') as RouteType, send_to_mailbox: officer?.send_to_mailbox ?? '',
    opt_in_source: officer?.opt_in_source ?? '', opted_in_at: officer?.opted_in_at?.slice(0, 10) ?? '', opt_out_note: officer?.opt_out_note ?? '', notes: officer?.notes ?? '',
  });
  const [leave, setLeave] = useState(officer?.leave_until ?? '');
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const valid = (f.name.trim() || f.email.trim() || f.send_to_mailbox.trim()) && emailOk(f.email) && emailOk(f.send_to_mailbox);
  const go = () => {
    const patch: Partial<OfficerRecord> = {
      name: f.name.trim() || null, title: f.title.trim() || null, council: f.council.trim() || null, borough: f.borough.trim() || null,
      email: f.email.trim() || null, phone: f.phone.trim() || null, route_type: f.route_type, send_to_mailbox: f.send_to_mailbox.trim() || null,
      opt_in_source: f.opt_in_source.trim() || null, opted_in_at: f.opted_in_at ? new Date(`${f.opted_in_at}T12:00:00`).toISOString() : null,
      opt_out_note: f.opt_out_note.trim() || null, notes: f.notes.trim() || null,
    };
    if (officer) for (const k of Object.keys(patch) as Array<keyof OfficerRecord>) if ((officer[k] ?? null) === (patch[k] ?? null)) delete patch[k];
    if (officer && Object.keys(patch).length === 0) { onDone(); return; }
    save.mutate({ before: officer, patch }, {
      onSuccess: () => { toast(officer ? 'Saved' : 'Added to the list', 'success'); onDone(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const status = (s: OfficerStatus, leaveUntil?: string) => officer && setStatus.mutate({ officer, status: s, leaveUntil }, {
    onSuccess: () => toast(`${officer.name ?? 'Officer'}: ${STATUS_WORDS[s].toLowerCase()}`, 'success'),
    onError: (e) => toast((e as Error).message, 'danger'),
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
      {officer && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">On leave until</span>
            <input type="date" value={leave} min={todayIso()} onChange={(e) => setLeave(e.target.value)} className={`${box} w-auto`} />
          </label>
          <Button busy={setStatus.isPending} className={small} disabled={!leave || setStatus.isPending} onClick={() => status('on_leave', leave)}>Mark as on leave</Button>
          <Button busy={setStatus.isPending} className={small} disabled={setStatus.isPending} onClick={() => status('bounced')}>Mark as bounced</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input value={f.name} onChange={(e) => set('name')(e.target.value)} className={box} /></Field>
        <Field label="Job title"><input value={f.title} onChange={(e) => set('title')(e.target.value)} className={box} /></Field>
        <Field label="Council"><input value={f.council} onChange={(e) => set('council')(e.target.value)} placeholder="e.g. Harrow" className={box} /></Field>
        <Field label="Route">
          <select value={f.route_type} onChange={(e) => set('route_type')(e.target.value)} className={box}>
            {ROUTES.map((r) => <option key={r} value={r}>{ROUTE_WORDS[r]}</option>)}
          </select>
        </Field>
        <Field label="Their email" hint={emailOk(f.email) ? undefined : 'That does not look like an email address'}><input type="email" value={f.email} onChange={(e) => set('email')(e.target.value)} className={box} /></Field>
        <Field label="Send to this mailbox instead" hint={emailOk(f.send_to_mailbox) ? 'When set, the only address used, e.g. rental.alert@islington.gov.uk' : 'That does not look like an email address'}>
          <input type="email" value={f.send_to_mailbox} onChange={(e) => set('send_to_mailbox')(e.target.value)} className={box} />
        </Field>
        <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone')(e.target.value)} className={box} /></Field>
        <Field label="How they came to be on the list" hint={f.route_type === 'housing_officer' ? 'A housing officer is only emailed once they have opted in or sent a client' : undefined}>
          <input value={f.opt_in_source} onChange={(e) => set('opt_in_source')(e.target.value)} placeholder="e.g. asked for listings at a forum" className={box} />
        </Field>
        <Field label="Opted in on"><input type="date" value={f.opted_in_at} onChange={(e) => set('opted_in_at')(e.target.value)} className={box} /></Field>
        <Field label="Opt-out note"><input value={f.opt_out_note} onChange={(e) => set('opt_out_note')(e.target.value)} placeholder="What they said, if they opted out" className={box} /></Field>
        <Field label="Notes" wide><input value={f.notes} onChange={(e) => set('notes')(e.target.value)} className={box} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button busy={save.isPending} variant="primary" className={small} disabled={!valid || save.isPending} onClick={go}>{save.isPending ? 'Saving…' : officer ? 'Save changes' : 'Add to the list'}</Button>
        <Button className={small} onClick={onDone}>Cancel</Button>
        {officer && sendAddress(officer) && <span className="text-[12px] text-[var(--ink-muted)]">Mail goes to {sendAddress({ email: f.email, send_to_mailbox: f.send_to_mailbox }) ?? 'nobody'}.</span>}
      </div>
    </div>
  );
}

function Field({ label, hint, wide = false, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

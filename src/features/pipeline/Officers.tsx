import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, CardHeader, Empty, Icon, useToast } from '../../components/ui';
import { copyText } from '../../lib/clipboard';
import { addressLine, bareEmails, emailList, officersFrom, officersText, officerText } from '../../lib/officers';
import type { Officer } from '../../lib/officers';
import type { Applicant } from '../../lib/types';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
/** Above this, a mail app may not open a link with everyone in it: copy the list instead. */
const MAILTO_LIMIT = 1800;

/** Every housing officer on a client's details, once each, ready to copy into an email. */
export function HousingOfficersBox({ applicants, onClose }: { applicants: Applicant[]; onClose: () => void }) {
  const { toast } = useToast();
  const officers = useMemo(() => officersFrom(applicants), [applicants]);
  const [q, setQ] = useState('');
  const [org, setOrg] = useState('any');
  const [activeOnly, setActiveOnly] = useState(false);

  const orgs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of officers) counts.set(o.org ?? '', (counts.get(o.org ?? '') ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => (!a !== !b ? (a ? -1 : 1) : a.localeCompare(b)));
  }, [officers]);

  const terms = q.trim().toLowerCase();
  const shown = officers.filter((o) => (org === 'any' || (o.org ?? '') === org) && (!activeOnly || o.active > 0)
    && (!terms || [o.name, o.email, o.phone, o.org].some((x) => x?.toLowerCase().includes(terms))));
  const emails = bareEmails(shown);
  const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}`;

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    toast(ok ? `Copied ${what}` : 'Could not copy. Press and hold the text to copy it instead.', ok ? 'success' : 'danger');
  };

  return (
    <Card>
      <CardHeader icon="users" title="Housing officers" sub={`${officers.length}`} help="officers">
        <button type="button" onClick={onClose} aria-label="Close housing officers" title="Close"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
          <Icon name="x" size={16} />
        </button>
      </CardHeader>
      {officers.length === 0 ? (
        <Empty icon="users" title="No housing officers yet">When a client's details name their housing officer, they are collected here.</Empty>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or council" aria-label="Search housing officers"
              className={`${box} min-w-0 flex-1 basis-[200px]`} />
            <select value={org} onChange={(e) => setOrg(e.target.value)} aria-label="Council or organisation" className={`${box} min-w-0 max-w-full px-2`}>
              <option value="any">Everywhere ({officers.length})</option>
              {orgs.map(([o, n]) => <option key={o || 'none'} value={o}>{o || 'Not known'} ({n})</option>)}
            </select>
            <label className="flex items-center gap-2 text-[14px] text-[var(--ink)]">
              <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Only with active clients
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" className={small} disabled={!emails.length} onClick={() => copy(emailList(shown), `${emails.length} ${emails.length === 1 ? 'email' : 'emails'}`)}>
              <Icon name="mail" size={14} />Copy {emails.length} {emails.length === 1 ? 'email' : 'emails'}
            </Button>
            {emails.length > 0 && mailto.length <= MAILTO_LIMIT && (
              <a href={mailto} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-[13px] font-medium text-[var(--ink)] hover:border-[var(--accent)]">
                <Icon name="send" size={14} />Email them (Bcc)
              </a>
            )}
            <Button className={small} disabled={!shown.length} onClick={() => copy(officersText(shown), `${shown.length} ${shown.length === 1 ? 'officer' : 'officers'} as text`)}>
              <Icon name="file" size={14} />Copy details as text
            </Button>
            <span className="text-[13px] text-[var(--ink-muted)]">
              {shown.length === officers.length ? `${shown.length} ${shown.length === 1 ? 'officer' : 'officers'}` : `${shown.length} of ${officers.length} shown`}
              {shown.length - emails.length > 0 ? `, ${shown.length - emails.length} with no email` : ''}
            </span>
          </div>

          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] p-0">
            {shown.map((o) => <OfficerRow key={o.key} o={o} onCopy={copy} />)}
            {shown.length === 0 && <li className="p-4 text-[14px] text-[var(--ink-muted)]">Nobody matches that.</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

function OfficerRow({ o, onCopy }: { o: Officer; onCopy: (text: string, what: string) => void }) {
  const [open, setOpen] = useState(false);
  const line = addressLine(o);
  const who = o.name ?? o.email ?? o.phone ?? 'Officer';
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-medium text-[var(--ink)]">{o.name ?? 'Name not given'}</span>
          {o.org && <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>{o.org}</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 text-[13px]">
          {o.email ? <a href={`mailto:${o.email}`} className="break-all text-[var(--link)] hover:underline">{o.email}</a> : <span className="text-[var(--ink-muted)]">No email</span>}
          {o.phone && <a href={`tel:${o.phone.replace(/[^\d+]/g, '')}`} className="font-mono text-[var(--ink)] hover:text-[var(--link)]">{o.phone}</a>}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:underline">
          {o.clients.length} {o.clients.length === 1 ? 'client' : 'clients'}{o.active !== o.clients.length ? `, ${o.active} active` : ''}
        </button>
        {open && (
          <div className="flex flex-wrap gap-x-3 text-[13px]">
            {o.clients.map((c) => <Link key={c.id} to={`/applicants/${c.id}`} className="text-[var(--link)] hover:underline">{c.full_name}</Link>)}
          </div>
        )}
      </div>
      <Button className={small} onClick={() => onCopy(line ?? officerText(o), line ? `${who}'s email` : `${who}'s details`)}
        title={line ? `Copy ${line}` : 'Copy their details'}>
        <Icon name="file" size={14} />Copy
      </Button>
    </li>
  );
}

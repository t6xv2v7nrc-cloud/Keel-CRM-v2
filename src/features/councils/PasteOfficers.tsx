import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Card, CardHeader, Icon, useToast } from '../../components/ui';
import { useAddPastedOfficers, useOfficers, usePeople } from '../../lib/hooks';
import { fillWords, PASTE_HANDOFF, readOfficerPaste } from '../../lib/officerPaste';
import type { PastedOfficer } from '../../lib/officerPaste';
import { ROUTE_WORDS } from '../../lib/councils';
import type { RouteType } from '../../lib/councils';
import { openCard } from '../../lib/collapse';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
const box = 'h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';

/** Paste officers: a spreadsheet, an email's To line, signatures, or one a line; look them over, then add the ones ticked. */
export function PasteOfficers() {
  const { officers, loading } = useOfficers();
  const people = usePeople();
  const add = useAddPastedOfficers();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [read, setRead] = useState<PastedOfficer[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, Partial<PastedOfficer>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);
  const [how, setHow] = useState('');
  const card = useRef<HTMLDivElement>(null);

  const own = useMemo(() => people.members.map((m) => m.email ?? '').filter(Boolean), [people.members]);
  const readIt = (t = text) => {
    const r = readOfficerPaste(t, officers, own);
    setRead(r.officers);
    setSkipped(r.skipped);
    setEdits({});
    setEditing(null);
    // nothing to add for someone already on the list with nothing new; anyone without a name or email cannot be added
    setOff(new Set(r.officers.filter((o) => !o.ok || (o.existing && !Object.keys(o.fills).length)).map((o) => o.key)));
    if (!r.officers.length) toast('No officers found in that. Paste names with their emails, a spreadsheet with headings, or signatures.', 'danger');
  };

  // handed over from the Bin: read once the officer list has loaded, so who is already on it is known
  useEffect(() => {
    if (loading) return;
    let handed: string | null = null;
    try { handed = sessionStorage.getItem(PASTE_HANDOFF); sessionStorage.removeItem(PASTE_HANDOFF); } catch { /* fine */ }
    if (!handed) return;
    const t = handed;
    openCard('councils.paste');
    window.setTimeout(() => { setText(t); readIt(t); card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const rows = (read ?? []).map((o): PastedOfficer => {
    const x = { ...o, ...edits[o.key] };
    return { ...x, ok: !!(x.name?.trim() || x.email) };
  });
  const chosen = rows.filter((o) => !off.has(o.key) && o.ok);
  const toAdd = chosen.filter((o) => !o.existing);
  const toFill = chosen.filter((o) => o.existing && Object.keys(o.fills).length);
  const newOnes = rows.filter((o) => !o.existing && o.ok).length;
  const onList = rows.filter((o) => o.existing).length;
  const cannot = rows.filter((o) => !o.ok).length;
  const needsHow = asked && toAdd.some((o) => o.route === 'housing_officer') && !how.trim();

  const pick = (key: string, on: boolean) => setOff((s) => { const n = new Set(s); if (on) n.delete(key); else n.add(key); return n; });
  const edit = (key: string, patch: Partial<PastedOfficer>) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));
  const clear = () => { setText(''); setRead(null); setSkipped(0); setOff(new Set()); setEdits({}); setAsked(false); setHow(''); };

  const go = () => add.mutate({ add: toAdd, fill: toFill, optIn: asked ? how.trim() : null }, {
    onSuccess: () => {
      toast([toAdd.length ? `Added ${toAdd.length} to the officer list` : null, toFill.length ? `filled in ${toFill.length}` : null].filter(Boolean).join(', '), 'success');
      clear();
    },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  const label = toAdd.length && toFill.length ? `Add ${toAdd.length} and fill in ${toFill.length}`
    : toFill.length ? `Fill in ${toFill.length} already on the list` : `Add ${toAdd.length} to the officer list`;

  return (
    <div ref={card} className="scroll-mt-20">
      <Card fold="councils.paste">
        <CardHeader icon="list" title="Paste officers" help="pasteOfficers"
          sub={read ? `${rows.length} read: ${newOnes} new${onList ? `, ${onList} on the list` : ''}` : 'From a spreadsheet, an email or signatures'} />
        <div className="flex flex-col gap-3 px-5 py-4">
          {!read ? (
            <>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label="Officers to paste"
                placeholder={'Paste them here, for example:\n\nJo Brennan <jo.brennan@hounslow.gov.uk>; Ann Smith <ann.smith@croydon.gov.uk>\n\nor a spreadsheet copied with its headings (Name, Email, Council, Phone), or email signatures one after another.'}
                className="w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[14px] leading-snug text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" className={small} disabled={!text.trim()} onClick={() => readIt()}><Icon name="search" size={14} />Read the list</Button>
                {text && <Button className={small} onClick={clear}>Clear</Button>}
                <span className="text-[12px] text-[var(--ink-muted)]">Nothing is added until you have looked them over.</span>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-[14px] text-[var(--ink)]">
                {newOnes} new{onList ? `, ${onList} already on the list` : ''}{cannot ? `, ${cannot} without a name or email` : ''}.
                {skipped > 0 && <span className="text-[var(--ink-muted)]"> {skipped} {skipped === 1 ? 'bit' : 'bits'} of the paste had no one in it.</span>}
              </p>
              <ul className="m-0 flex max-h-[520px] list-none flex-col divide-y divide-[var(--line)] overflow-y-auto rounded-md border border-[var(--line)] p-0">
                {rows.map((o) => (
                  <PastedRow key={o.key} o={o} on={!off.has(o.key) && o.ok} onPick={(v) => pick(o.key, v)}
                    editing={editing === o.key} onEdit={() => setEditing(editing === o.key ? null : o.key)} onChange={(p) => edit(o.key, p)} />
                ))}
              </ul>

              <div className="flex flex-col gap-2 rounded-md bg-[var(--surface-2)] p-3">
                <label className="flex items-start gap-2 text-[14px] text-[var(--ink)]">
                  <input type="checkbox" checked={asked} onChange={(e) => setAsked(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                  <span>They asked for property emails
                    <span className="block text-[12px] text-[var(--ink-muted)]">Only tick this if they did: they are then on the mailing list straight away.</span>
                  </span>
                </label>
                {asked && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[var(--ink-muted)]">How they asked, for the record</span>
                    <input value={how} onChange={(e) => setHow(e.target.value)} placeholder="e.g. signed up at the Hounslow landlord forum, 14 October" className={box} />
                  </label>
                )}
                {!asked && <span className="text-[12px] text-[var(--ink-muted)]">Housing officers are added as not opted in: never sent property emails until they opt in or refer a client. Team mailboxes for properties can be written to.</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button busy={add.isPending} variant="primary" className={small} disabled={!chosen.length || needsHow || add.isPending} onClick={go}>
                  <Icon name="plus" size={14} />{add.isPending ? 'Adding…' : label}
                </Button>
                <Button className={small} onClick={() => { setRead(null); }}>Change the paste</Button>
                <Button className={small} onClick={clear}>Clear</Button>
                {needsHow && <span className="text-[12px]" style={{ color: 'var(--note-fg)' }}>Say how they asked first.</span>}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

const ROUTES = Object.keys(ROUTE_WORDS) as RouteType[];

function PastedRow({ o, on, onPick, editing, onEdit, onChange }: {
  o: PastedOfficer; on: boolean; onPick: (on: boolean) => void; editing: boolean; onEdit: () => void; onChange: (p: Partial<PastedOfficer>) => void;
}) {
  const fills = o.existing ? fillWords(o.fills) : '';
  const status = o.existing ? (fills ? `On the list: ${fills}` : 'Already on the list') : null;
  const warn = o.notes.filter((n) => !/^A team mailbox for properties/.test(n));
  return (
    <li className={`flex flex-col gap-2 px-3 py-2.5 ${!on ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2.5">
        <input type="checkbox" checked={on} disabled={!o.ok || (!!o.existing && !fills)} onChange={(e) => onPick(e.target.checked)}
          aria-label={`Add ${o.name ?? o.email ?? 'this officer'}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <div className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="font-medium">{o.name ?? (!o.email ? 'Nobody' : o.route !== 'housing_officer' || o.notes.some((n) => /team mailbox/.test(n)) ? 'Team mailbox' : 'No name')}</span>
            {o.council && <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>{o.council}</span>}
            {o.route !== 'housing_officer' && <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{ROUTE_WORDS[o.route]}</span>}
            {status && <span className="text-[12px] text-[var(--ink-muted)]">{status}</span>}
          </div>
          {o.title && <div className="text-[13px] text-[var(--ink-muted)]">{o.title}</div>}
          <div className="flex flex-wrap gap-x-3 text-[13px]">
            {o.email && <span className="break-all">{o.email}</span>}
            {o.phone && <span className="font-mono">{o.phone}</span>}
          </div>
          {warn.length > 0 && <div className="text-[12px]" style={{ color: 'var(--note-fg)' }}>{warn.join(' · ')}</div>}
        </div>
        {!o.existing && o.ok && <button type="button" onClick={onEdit} aria-expanded={editing} className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-[var(--link)] hover:bg-[var(--surface-2)]">{editing ? 'Done' : 'Edit'}</button>}
      </div>
      {editing && (
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <Small label="Name"><input value={o.name ?? ''} onChange={(e) => onChange({ name: e.target.value || null })} className={box} /></Small>
          <Small label="Council"><input value={o.council ?? ''} onChange={(e) => onChange({ council: e.target.value || null })} className={box} /></Small>
          <Small label="Job title"><input value={o.title ?? ''} onChange={(e) => onChange({ title: e.target.value || null })} className={box} /></Small>
          <Small label="Phone"><input value={o.phone ?? ''} onChange={(e) => onChange({ phone: e.target.value || null })} className={box} /></Small>
          <Small label="Route">
            <select value={o.route} onChange={(e) => onChange({ route: e.target.value as RouteType })} className={box}>
              {ROUTES.map((r) => <option key={r} value={r}>{ROUTE_WORDS[r]}</option>)}
            </select>
          </Small>
        </div>
      )}
    </li>
  );
}

function Small({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
    </label>
  );
}

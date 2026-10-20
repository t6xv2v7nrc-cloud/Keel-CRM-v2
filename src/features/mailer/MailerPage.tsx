import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, Empty, Icon, PageHeader, UpdateNote, useToast } from '../../components/ui';
import { copyText } from '../../lib/clipboard';
import { clockTime, money, shortDate } from '../../lib/format';
import { todayIso } from '../../lib/calls';
import { saveFile } from '../../lib/files';
import { activeSettings } from '../../lib/settings';
import { missingBusiness } from '../../lib/business';
import { addressBox, boroughOf, byFocus, focusRank, mailingList } from '../../lib/councils';
import type { OfficerRecord, OfficerSend, SendKind } from '../../lib/councils';
import { matchesForProperty } from '../../lib/matchRules';
import {
  alertBody, alertRecipients, alertSubject, DIGEST_MAX, DIGEST_MIN, digestBody, digestBoroughs, digestPicks, digestRecipients, digestSubject,
  fullList, fullListBody, fullListCsv, mailerReady, mailtoFor, nominationsFrom, oldMailerBackup, sendables,
} from '../../lib/mailer';
import type { Sendable } from '../../lib/mailer';
import { alertWhatsApp, digestWhatsApp, fullListWhatsApp, whatsappRecipients } from '../../lib/shareWhatsApp';
import { waLink } from '../../lib/whatsapp';
import { OutlookSendButton } from '../outlook/Outlook';
import { useApplicants, useMatchOptions, useOfficerSends, useOfficers, usePeople, useProperties, useRecordMailerSend } from '../../lib/hooks';
import { LONDON_BOROUGHS } from '../../lib/london';
import type { Applicant, Property } from '../../lib/types';
import { Tip } from '../guide/Guide';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
// "On leave until 20 Nov 2026" reads "on leave until 20 Nov 2026" mid-sentence: only the first letter drops
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const box = 'w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';
type Tab = 'alerts' | 'digest' | 'all' | 'who' | 'old';
const TABS: Array<[Tab, string]> = [['alerts', 'Alerts'], ['digest', 'Monthly digest'], ['all', 'All properties'], ['who', 'Who can be emailed'], ['old', 'Old Keel Mailer']];

/** The Mailer (Step 7): property alerts and borough digests to housing officers, that only ever carry what passes the checks. */
export function MailerPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'alerts') as Tab;
  const { data: properties = [] } = useProperties();
  const list = useMemo(() => sendables(properties), [properties]);
  const ok = list.filter((s) => s.blockers.length === 0);
  const ready = mailerReady();
  const missing = missingBusiness(activeSettings().business);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="mail" title="Mailer" help="mailer"
        sub={`${ok.length} of ${list.length} available ${list.length === 1 ? 'property' : 'properties'} ready to send`} />
      <Tip id="mailer" />

      {!ready.ok && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-[14px]" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <Icon name="alert" size={16} />
          <span className="min-w-0 flex-1 basis-[240px]">Nothing can be sent yet. {ready.why}</span>
          <Link to="/settings?tab=team" className="font-semibold underline">Open Team settings</Link>
        </div>
      )}
      {missing.length > 0 && (
        <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
          Not in the footer yet: {missing.join(', ')}. Add them in <Link to="/settings?tab=team" className="underline">Team settings, Business details</Link> once Keel has joined.
        </p>
      )}

      <div role="tablist" aria-label="Mailer" className="grid w-full grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-1 sm:flex sm:w-fit">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setParams(k === 'alerts' ? {} : { tab: k }, { replace: true })}
            className={`rounded-md px-3 py-2 text-[14px] font-medium ${tab === k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'alerts' && <AlertsView list={list} canSend={ready.ok} />}
      {tab === 'digest' && <DigestView list={list} canSend={ready.ok} />}
      {tab === 'all' && <FullListView list={list} canSend={ready.ok} />}
      {tab === 'who' && <WhoView />}
      {tab === 'old' && <OldMailerView list={list} canSend={ready.ok} />}
    </div>
  );
}

// ── Alerts: one property each, to the officers of clients it fits ──

function AlertsView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const ok = list.filter((s) => s.blockers.length === 0);
  const held = list.filter((s) => s.blockers.length > 0);
  return (
    <div className="flex flex-col gap-4">
      {ok.length === 0 ? (
        <Empty icon="building" title="Nothing ready to send" action={<Link to="/properties" className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"><Icon name="building" size={16} />Go to Properties</Link>}>
          Every available property can go unless it is marked not ready; Keel only needs to know its LHA area and its rent. See what each one needs under Held back, or paste a property list.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {ok.map((s) => (
              <li key={s.property.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <div className="text-[15px] font-medium text-[var(--ink)]">{s.property.address_line}</div>
                    <div className="break-words font-mono text-[12px] text-[var(--ink-muted)]">{alertSubject(s)}</div>
                    {s.over && <div className="mt-1"><OverChip s={s} /></div>}
                  </div>
                  <Button variant={open === s.property.id ? 'secondary' : 'primary'} className={small} disabled={!canSend}
                    onClick={() => setOpen((v) => (v === s.property.id ? null : s.property.id))} aria-expanded={open === s.property.id}>
                    <Icon name="mail" size={14} />{open === s.property.id ? 'Close' : 'Write the alert'}
                  </Button>
                </div>
                {open === s.property.id && <AlertComposer s={s} />}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {held.length > 0 && (
        <Card className="overflow-hidden">
          <button type="button" onClick={() => setShowHeld((v) => !v)} aria-expanded={showHeld}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] font-medium text-[var(--ink)] sm:px-5">
            <Icon name="clock" size={15} />Held back: {held.length} {held.length === 1 ? 'property' : 'properties'}
            <span className="ml-auto text-[13px] font-normal text-[var(--link)]">{showHeld ? 'Hide' : 'Show what each needs'}</span>
          </button>
          {showHeld && (
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] border-t border-[var(--line)] p-0">
              {held.map((s) => (
                <li key={s.property.id} className="px-4 py-2.5 sm:px-5">
                  <Link to="/properties" className="text-[14px] font-medium text-[var(--ink)] hover:underline">{s.property.address_line}</Link>
                  <ul className="m-0 mt-1 list-disc pl-5 text-[13px] text-[var(--ink-muted)]">
                    {s.blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function AlertComposer({ s }: { s: Sendable }) {
  const { data: applicants = [] } = useApplicants();
  const { officers } = useOfficers();
  const opts = useMatchOptions();
  const [includeLondon, setIncludeLondon] = useState(false);
  const matches = useMemo(() => matchesForProperty(s.property, applicants, { ...opts, showOutsideLondon: includeLondon }), [s.property, applicants, opts, includeLondon]);
  const r = useMemo(() => alertRecipients(s, matches, officers, { includeLondon }), [s, matches, officers, includeLondon]);
  const outside = s.checks.london === false;
  const warn = outside && includeLondon ? 'Outside Greater London: going to London officers by your choice' : null;
  const red = s.over && s.checks.lha ? `${money(s.checks.gap ?? 0)} over the ${s.checks.lha.size === 'shared' ? 'shared' : `${s.checks.lha.size} bed`} LHA of ${money(s.checks.lha.rate)}: the email says so, so the officer sees the shortfall` : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <p className="m-0 text-[13px] text-[var(--ink-muted)]">
        It fits {r.clients} {r.clients === 1 ? 'client' : 'clients'} sent by a housing officer.
        {r.notListed.length > 0 && <> Not on the officer list, so left out: {r.notListed.join(', ')} (<Link to="/councils" className="text-[var(--link)] hover:underline">add them on Councils</Link>).</>}
      </p>
      {outside && (
        <label className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
          <input type="checkbox" checked={includeLondon} onChange={(e) => setIncludeLondon(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Outside Greater London: not sent to London officers as standard{r.londonHeld ? ` (${r.londonHeld} held back)` : ''}. Include them
        </label>
      )}
      <Composer kind="alert" to={r.list} properties={[s.property]} warn={warn} red={red}
        subject={alertSubject(s)} body={(greeting, myName) => alertBody(s, { greeting, myName })}
        whatsapp={(greeting, myName) => alertWhatsApp(s, alertSubject(s), { greeting, myName })} />
    </div>
  );
}

// ── The monthly digest: one borough, 5 to 8 properties ─────────────

function DigestView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const { officers } = useOfficers();
  const sends = useOfficerSends();
  const { data: applicants = [] } = useApplicants();
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const boroughs = useMemo(() => {
    const s = activeSettings();
    return [...new Set([...s.focusBoroughs, ...s.wishlistBoroughs, ...digestBoroughs(officers)])].sort((a, b) => focusRank(a) - focusRank(b) || a.localeCompare(b));
  }, [officers]);
  // open on the first borough (focus first) with something ready to send
  const [borough, setBorough] = useState(() => boroughs.find((b) => digestPicks(b, list).length > 0) ?? boroughs[0] ?? '');
  const [includeOutside, setIncludeOutside] = useState(false);
  const [includeOver, setIncludeOver] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const picks = useMemo(() => digestPicks(borough, list, { includeOutside, includeOver }), [borough, list, includeOutside, includeOver]);
  const chosen = picks.filter((s) => !dropped.has(s.property.id));
  const rec = useMemo(() => digestRecipients(borough, officers, sends, { nominatedFromClients: fromClients }), [borough, officers, sends, fromClients]);
  const lastDigest = lastSendTo(rec.list.to.map((t) => t.officer), sends, 'digest');
  const london = LONDON_BOROUGHS.has(borough);

  if (!borough) return <Empty icon="users" title="No boroughs yet">Add officers on Councils, or focus boroughs in Team settings.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[14px] text-[var(--ink)]">Borough
            <select value={borough} onChange={(e) => { setBorough(e.target.value); setDropped(new Set()); }}
              className="h-10 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
              {boroughs.map((b) => <option key={b} value={b}>{focusRank(b) === 0 ? '★ ' : ''}{b}</option>)}
            </select>
          </label>
          {london && (
            <label className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
              <input type="checkbox" checked={includeOutside} onChange={(e) => setIncludeOutside(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Include properties outside Greater London
            </label>
          )}
          <label className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <input type="checkbox" checked={includeOver} onChange={(e) => setIncludeOver(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Include properties over LHA (marked red)
          </label>
          {lastDigest && <span className="text-[13px] text-[var(--ink-muted)]">Last digest to these officers: {shortDate(lastDigest)}</span>}
        </div>
        {chosen.length < DIGEST_MIN && (
          <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            {chosen.length === 0 ? `Nothing ready to send in or around ${borough}.` : `Only ${chosen.length} ready in and around ${borough}: a digest should have ${DIGEST_MIN} to ${DIGEST_MAX}.`} Send alerts instead, or wait until more are ready.
          </p>
        )}
        {picks.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {picks.map((s) => (
              <li key={s.property.id}>
                <label className="flex items-start gap-2 text-[14px] text-[var(--ink)]">
                  <input type="checkbox" checked={!dropped.has(s.property.id)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    onChange={(e) => setDropped((d) => { const n = new Set(d); if (e.target.checked) n.delete(s.property.id); else n.add(s.property.id); return n; })} />
                  <span className="min-w-0">
                    {s.property.address_line}
                    <span className="block break-words font-mono text-[12px] text-[var(--ink-muted)]">{alertSubject(s)}</span>
                    {s.checks.london === false && <span className="text-[12px]" style={{ color: 'var(--note-fg)' }}>Outside Greater London</span>}
                    {s.over && <span className="mt-0.5 block"><OverChip s={s} /></span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {chosen.length > 0 && (
        <Composer key={borough} kind="digest" to={rec.list} recent={rec.recent} sends={sends} properties={chosen.map((s) => s.property)} disabled={!canSend}
          warn={includeOutside && chosen.some((s) => s.checks.london === false) ? 'Includes properties outside Greater London, by your choice' : null}
          red={chosen.some((s) => s.over) ? `${chosen.filter((s) => s.over).length} over LHA, marked in the email with how far over` : null}
          subject={digestSubject(borough, chosen.length, undefined, !chosen.some((s) => s.over))} body={(greeting, myName) => digestBody(borough, chosen, { greeting, myName })}
          whatsapp={(greeting, myName) => digestWhatsApp(borough, chosen, digestSubject(borough, chosen.length, undefined, !chosen.some((s) => s.over)), { greeting, myName })} />
      )}
    </div>
  );
}

// ── The full list: every property ready to send, at once ───────────

function FullListView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const { officers } = useOfficers();
  const sends = useOfficerSends();
  const { data: applicants = [] } = useApplicants();
  const { toast } = useToast();
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const boroughs = useMemo(() => [...new Set(list.filter((s) => s.blockers.length === 0 && s.borough).map((s) => s.borough!))]
    .sort((a, b) => focusRank(a) - focusRank(b) || a.localeCompare(b)), [list]);
  const [borough, setBorough] = useState('');
  const [includeOver, setIncludeOver] = useState(false);
  const [includeOutside, setIncludeOutside] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const all = useMemo(() => fullList(list, { borough: borough || null, includeOver, includeOutside }), [list, borough, includeOver, includeOutside]);
  const groups = all.groups.map((g) => ({ ...g, items: g.items.filter((s) => !dropped.has(s.property.id)) })).filter((g) => g.items.length > 0);
  const chosen = groups.flatMap((g) => g.items);
  const rec = useMemo(() => digestRecipients(borough || null, officers, sends, { nominatedFromClients: fromClients }), [borough, officers, sends, fromClients]);
  const lastFull = lastSendTo(rec.list.to.map((t) => t.officer), sends, 'bulk');
  const subject = digestSubject(borough || 'All areas', chosen.length, undefined, !chosen.some((s) => s.over));
  const over = chosen.filter((s) => s.over).length;
  const outside = chosen.filter((s) => s.checks.london === false).length;
  const toLondon = rec.list.to.some(({ officer }) => LONDON_BOROUGHS.has(boroughOf(officer) ?? ''));
  const areas = (n: number) => `${n} ${n === 1 ? 'area' : 'areas'}`;
  const save = () => {
    saveFile(`keel-properties-${borough ? `${borough.toLowerCase().replace(/[^a-z]+/g, '-')}-` : ''}${todayIso()}.csv`, fullListCsv(chosen), 'text/csv;charset=utf-8');
    toast('Spreadsheet saved', 'success');
  };
  const pick = (id: string, on: boolean) => setDropped((d) => { const n = new Set(d); if (on) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <p className="m-0 text-[14px] text-[var(--ink-muted)]">
          Every property ready to send, by area: as one email, one WhatsApp or a spreadsheet. Anything marked not ready stays out.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[14px] text-[var(--ink)]">Area
            <select value={borough} onChange={(e) => { setBorough(e.target.value); setDropped(new Set()); }}
              className="h-10 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
              <option value="">All areas</option>
              {boroughs.map((b) => <option key={b} value={b}>{focusRank(b) === 0 ? '★ ' : ''}{b}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
            <input type="checkbox" checked={includeOver} onChange={(e) => setIncludeOver(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Include properties over LHA (marked red){all.leftOver ? `: ${all.leftOver} left out` : ''}
          </label>
          {!borough && (
            <label className="flex items-center gap-2 text-[13px] text-[var(--ink-muted)]">
              <input type="checkbox" checked={includeOutside} onChange={(e) => setIncludeOutside(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Include properties outside Greater London{all.leftOutside ? `: ${all.leftOutside} left out` : ''}
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[14px] text-[var(--ink)]">
            <strong>{chosen.length}</strong> {chosen.length === 1 ? 'property' : 'properties'} in {areas(groups.length)}{dropped.size ? `, ${dropped.size} taken out` : ''}
          </span>
          {all.items.length > 0 && (
            <button type="button" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} className="text-[14px] text-[var(--link)] hover:underline">
              {choosing ? 'Hide the list' : 'Choose which go'}
            </button>
          )}
          {lastFull && <span className="text-[13px] text-[var(--ink-muted)]">Last full list to these officers: {shortDate(lastFull)}</span>}
          <Button className={`${small} sm:ml-auto`} disabled={!canSend || !chosen.length} onClick={save}><Icon name="download" size={14} />Save as a spreadsheet</Button>
        </div>
        {choosing && (
          <div className="flex flex-col gap-3">
            {all.groups.map((g) => (
              <div key={g.place} className="flex flex-col gap-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{g.place} ({g.items.length})</div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {g.items.map((s) => (
                    <li key={s.property.id}>
                      <label className="flex items-start gap-2 text-[14px] text-[var(--ink)]">
                        <input type="checkbox" checked={!dropped.has(s.property.id)} onChange={(e) => pick(s.property.id, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                        <span className="min-w-0">
                          {s.property.address_line}
                          <span className="block break-words font-mono text-[12px] text-[var(--ink-muted)]">{alertSubject(s)}</span>
                          {s.checks.london === false && <span className="text-[12px]" style={{ color: 'var(--note-fg)' }}>Outside Greater London</span>}
                          {s.over && <span className="mt-0.5 block"><OverChip s={s} /></span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {chosen.length === 0 && (
          <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
            Nothing ready to send{borough ? ` in ${borough}` : ''}{all.leftOver + all.leftOutside ? ': tick a box above to include the ones left out' : ''}.
          </p>
        )}
      </Card>
      {chosen.length > 0 && (
        <Composer key={borough || 'all'} kind="bulk" to={rec.list} recent={rec.recent} sends={sends} properties={chosen.map((s) => s.property)} disabled={!canSend}
          warn={outside && toLondon ? `Includes ${outside} outside Greater London, by your choice: London officers do not get these as standard` : null}
          red={over ? `${over} over LHA, marked in the email with how far over` : null}
          subject={subject} body={(greeting, myName) => fullListBody(groups, { borough: borough || null, greeting, myName })}
          whatsapp={(greeting, myName) => fullListWhatsApp(groups, subject, { borough: borough || null, greeting, myName })} />
      )}
    </div>
  );
}

const lastSendTo = (officers: OfficerRecord[], sends: OfficerSend[], kind: OfficerSend['kind']) => {
  const ids = new Set(officers.map((o) => String(o.id)));
  return sends.filter((x) => x.kind === kind && ids.has(x.officer_id)).map((x) => x.sent_at).sort().pop() ?? null;
};

// ── The email: who, subject, body, then send and record ────────────

/** "£300 over LHA" in red, never colour alone. */
function OverChip({ s }: { s: Sendable }) {
  return (
    <span className="inline-flex max-w-full items-start gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
      <Icon name="x" size={12} className="mt-[2px] shrink-0" />{money(s.checks.gap ?? 0)} over LHA
    </span>
  );
}

function Composer({ kind, to, recent, sends = [], properties, subject, body, whatsapp, warn, red, disabled = false }: {
  kind: SendKind; to: ReturnType<typeof mailingList>; recent?: Set<string>; sends?: OfficerSend[]; properties: Property[];
  subject: string; body: (greeting: string | null, myName: string | null) => string; whatsapp: (greeting: string | null, myName: string | null) => string;
  warn?: string | null; red?: string | null; disabled?: boolean;
}) {
  const { myName } = usePeople();
  const record = useRecordMailerSend();
  const { toast } = useToast();
  // anyone who had a bulk email or digest in the last 30 days starts unticked, including once the sends log arrives
  // after the list (a tick put back by hand stays)
  const [off, setOff] = useState<Set<string>>(() => new Set(recent ?? []));
  const flagged = useRef(new Set(recent ?? []));
  const recentKey = [...(recent ?? [])].sort().join();
  useEffect(() => {
    const fresh = [...(recent ?? [])].filter((id) => !flagged.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => flagged.current.add(id));
    setOff((d) => new Set([...d, ...fresh]));
  }, [recentKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sentAt, setSentAt] = useState<string | null>(null);
  // a long list of officers folds to a line; a short one shows
  const [showTo, setShowTo] = useState(to.to.length <= 4);
  const chosen = to.to.filter((t) => !off.has(String(t.officer.id)));
  const recentOff = to.to.filter((t) => off.has(String(t.officer.id)) && recent?.has(String(t.officer.id))).length;
  const addresses = [...new Map(chosen.map((t) => [t.address.toLowerCase(), t.address])).values()];
  const greeting = chosen.length === 1 ? chosen[0].officer.send_to_mailbox?.trim() ? null : chosen[0].officer.name : null;
  const text = body(greeting, myName);
  const mail = { subject, body: text };
  const href = mailtoFor(addresses, mail);
  const copy = async (what: string, value: string) => {
    const ok = await copyText(value);
    toast(ok ? `${what} copied` : 'Could not copy. Press and hold to copy instead.', ok ? 'success' : 'danger');
  };
  const save = () => {
    if (sentAt) return;
    record.mutate({ to: chosen, kind, subject, properties }, {
      onSuccess: () => { setSentAt(new Date().toISOString()); toast(`Recorded: ${kind === 'alert' ? 'alert' : kind === 'digest' ? 'digest' : 'full list'} to ${chosen.length} ${chosen.length === 1 ? 'officer' : 'officers'}`, 'success'); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const lastBulk = (o: OfficerRecord) => sends.filter((x) => x.officer_id === String(o.id) && x.kind !== 'alert').map((x) => x.sent_at).sort().pop();

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <Section title={`To (${addresses.length} ${addresses.length === 1 ? 'address' : 'addresses'}${addresses.length > 1 ? ', in Bcc' : ''})`}>
        {to.to.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">Nobody on the mailing list for this one.</p>
        ) : !showTo ? (
          <p className="m-0 text-[14px] text-[var(--ink)]">
            {chosen.length} of {to.to.length} officers ticked{recentOff ? `, ${recentOff} left unticked as they had a bulk email in the last 30 days` : ''}{to.left.length ? `; ${to.left.length} left out by the rules` : ''}.{' '}
            <button type="button" onClick={() => setShowTo(true)} className="text-[var(--link)] hover:underline">Show who</button>
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {to.to.map(({ officer, address }) => {
              const id = String(officer.id);
              const isRecent = recent?.has(id);
              return (
                <li key={id}>
                  <label className="flex items-start gap-2 text-[14px] text-[var(--ink)]">
                    <input type="checkbox" checked={!off.has(id)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      onChange={(e) => setOff((d) => { const n = new Set(d); if (e.target.checked) n.delete(id); else n.add(id); return n; })} />
                    <span className="min-w-0 break-words">
                      {officer.name ?? 'Officer'}{boroughOf(officer) ? `, ${boroughOf(officer)}` : ''}
                      <span className="block text-[12px] text-[var(--ink-muted)]">{address}{officer.send_to_mailbox?.trim() ? ' (team mailbox)' : ''}</span>
                      {isRecent && <span className="block text-[12px]" style={{ color: 'var(--note-fg)' }}>Had a bulk email or digest {lastBulk(officer) ? `on ${shortDate(lastBulk(officer)!)}` : 'in the last 30 days'}: this would be another</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {showTo && to.left.length > 0 && (
          <p className="m-0 text-[12px] text-[var(--ink-muted)]">Left out by the rules: {to.left.map(({ officer, why }) => `${officer.name ?? 'Officer'} (${lower(why)})`).join(', ')}.</p>
        )}
        {showTo && to.to.length > 4 && (
          <button type="button" onClick={() => setShowTo(false)} className="self-start text-[13px] text-[var(--link)] hover:underline">Hide the list</button>
        )}
      </Section>

      {red && <p className="m-0 rounded-md px-3 py-2 text-[13px] font-semibold" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>{red}</p>}
      {warn && <p className="m-0 rounded-md px-3 py-2 text-[13px] font-semibold" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>{warn}</p>}

      <Section title="Subject">
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={subject} aria-label="Subject" className={`${box} flex-1 basis-[240px] font-mono text-[13px]`} />
          <Button className={small} onClick={() => copy('Subject', subject)}>Copy</Button>
        </div>
      </Section>
      <Section title="Email">
        <textarea readOnly value={text} rows={kind === 'alert' ? 14 : 18} aria-label="Email" className={`${box} font-mono text-[13px] leading-relaxed`} />
      </Section>

      <div className="flex flex-wrap items-center gap-2">
        {href ? (
          <a href={disabled || !chosen.length ? undefined : href} onClick={() => !disabled && chosen.length && save()} aria-disabled={disabled || !chosen.length}
            className={`inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[15px] font-medium text-[var(--on-accent)] ${disabled || !chosen.length ? 'pointer-events-none opacity-40' : 'hover:bg-[var(--accent-strong)]'}`}>
            <Icon name="mail" size={15} />Open in my email
          </a>
        ) : (
          <span className="text-[13px] text-[var(--ink-muted)]">Too long to open in one go: copy the addresses, subject and email instead.</span>
        )}
        <OutlookSendButton to={addresses} subject={subject} body={text} disabled={disabled || !chosen.length || !!sentAt}
          what={`${kind === 'alert' ? 'this alert' : kind === 'digest' ? 'this digest' : 'the full list'} to ${chosen.length} ${chosen.length === 1 ? 'officer' : 'officers'}`} onSent={save} />
        <Button className={small} disabled={!addresses.length} onClick={() => copy(addresses.length > 1 ? 'Addresses for the Bcc box' : 'Address', addressBox({ to: chosen }))}>Copy addresses</Button>
        <Button className={small} onClick={() => copy('Email', text)}>Copy the email</Button>
        <Button busy={record.isPending} className={small} disabled={disabled || !chosen.length || !!sentAt || record.isPending} onClick={save}>{sentAt ? `Recorded at ${clockTime(sentAt)}` : "I've sent it"}</Button>
      </div>
      <p className="m-0 text-[12px] text-[var(--ink-muted)]">Sending from Outlook, or opening it in your email, records the send. If you copied it instead, press I've sent it once it has gone.</p>

      <WhatsAppVersion kind={kind} to={to} off={off} subject={subject} text={whatsapp} properties={properties} disabled={disabled} />
    </Card>
  );
}

/** The same alert or digest for WhatsApp: to each officer allowed to receive it who has a mobile (each recorded), or
 *  to a chat or group picked in WhatsApp. Same rules as the email: the ticks above, nobody left out by the list. */
function WhatsAppVersion({ kind, to, off, subject, text, properties, disabled }: {
  kind: SendKind; to: ReturnType<typeof mailingList>; off: Set<string>; subject: string; properties: Property[];
  text: (greeting: string | null, myName: string | null) => string; disabled: boolean;
}) {
  const { myName } = usePeople();
  const record = useRecordMailerSend();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const wa = useMemo(() => whatsappRecipients(to), [to]);
  const people = wa.to.filter(({ officer }) => !off.has(String(officer.id)));
  const group = text(null, myName);
  const log = (who: Array<{ officer: OfficerRecord; number: string }>, key: string) => record.mutate(
    { to: who.map(({ officer, number }) => ({ officer, address: `+${number}` })), kind, subject, properties, channel: 'whatsapp' },
    { onSuccess: () => setDone((d) => new Set(d).add(key)), onError: (e) => toast((e as Error).message, 'danger') },
  );
  const link = 'inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[14px] font-medium text-[var(--accent-ink)] hover:border-[var(--accent)]';
  // copied to paste into a chat or group: noted on the properties like Pick a chat or group
  const copy = async () => {
    const ok = await copyText(group);
    if (!ok) { toast('Could not copy. Press and hold to copy instead.', 'danger'); return; }
    toast('WhatsApp message copied', 'success');
    if (!disabled && !done.has('copy')) log([], 'copy');
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 text-left text-[14px] font-medium text-[var(--ink)]">
        <Icon name="chat" size={15} />Send it on WhatsApp instead
        <span className="ml-auto text-[13px] font-normal text-[var(--link)]">{open ? 'Hide' : `${people.length} with a mobile`}</span>
      </button>
      {open && (
        <>
          <textarea readOnly value={group} rows={10} aria-label="WhatsApp message" className={`${box} font-mono text-[13px] leading-relaxed`} />
          <div className="flex flex-wrap gap-2">
            {people.map(({ officer, number }) => {
              const key = String(officer.id);
              return (
                <a key={key} href={disabled ? undefined : waLink(number, text(officer.name, myName))} target="_blank" rel="noreferrer" aria-disabled={disabled}
                  onClick={() => !disabled && !done.has(key) && log([{ officer, number }], key)} className={`${link} ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
                  <Icon name={done.has(key) ? 'check' : 'chat'} size={14} />{officer.name ?? 'Officer'}
                </a>
              );
            })}
            <a href={disabled ? undefined : waLink(null, group)} target="_blank" rel="noreferrer" aria-disabled={disabled}
              onClick={() => !disabled && !done.has('group') && log([], 'group')} className={`${link} ${disabled ? 'pointer-events-none opacity-40' : ''}`}
              title="Opens WhatsApp to pick a chat or group">
              <Icon name={done.has('group') ? 'check' : 'share'} size={14} />Pick a chat or group
            </a>
            <Button className={small} onClick={copy}><Icon name={done.has('copy') ? 'check' : 'file'} size={14} />Copy the message</Button>
          </div>
          {group.length > 3000 && (
            <p className="m-0 text-[12px] text-[var(--ink-muted)]">A long message: if WhatsApp opens without it, copy it and paste it into the chat.</p>
          )}
          {wa.left.length > 0 && <p className="m-0 text-[12px] text-[var(--ink-muted)]">Not on WhatsApp from here: {wa.left.map(({ officer, why }) => `${officer.name ?? 'Officer'} (${lower(why)})`).join(', ')}.</p>}
          <p className="m-0 text-[12px] text-[var(--ink-muted)]">Each officer you open it for is recorded as sent to, like the email. A chat or group you pick, or a copy, is noted on the properties.</p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{title}</div>
      {children}
    </div>
  );
}

// ── Who can be emailed: the mailing list, from Councils ────────────

function WhoView() {
  const { officers, ready } = useOfficers();
  const { data: applicants = [] } = useApplicants();
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const list = useMemo(() => mailingList(byFocus(officers), { nominatedFromClients: fromClients }), [officers, fromClients]);
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const { why } of list.left) { const k = why.startsWith('On leave') ? 'On leave' : why; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  if (!ready) return <UpdateNote title="The officer list needs a one-off database update." file="0020_council_contacts.sql" />;
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <p className="m-0 text-[15px] text-[var(--ink)]">
        <strong>{list.to.length}</strong> {list.to.length === 1 ? 'officer' : 'officers'} can be emailed, at {list.addresses.length} {list.addresses.length === 1 ? 'address' : 'addresses'}.
        {list.left.length > 0 && <> {list.left.length} left out: {reasons.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}.</>}
      </p>
      <p className="m-0 text-[13px] text-[var(--ink-muted)]">Mark leavers, opt-outs and bounces on <Link to="/councils" className="text-[var(--link)] hover:underline">Councils</Link>; the Mailer follows straight away.</p>
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
        {list.to.map(({ officer, address }) => (
          <li key={String(officer.id)} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-[14px]">
            <span className="text-[var(--ink)]">{focusRank(boroughOf(officer)) === 0 ? '★ ' : ''}{officer.name ?? 'Officer'}</span>
            <span className="text-[13px] text-[var(--ink-muted)]">{boroughOf(officer) ?? officer.council ?? 'Council not known'}</span>
            <span className="min-w-0 break-all text-[13px] text-[var(--ink-muted)]">{address}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── The old Keel Mailer ────────────────────────────────────────────

function OldMailerView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const { officers } = useOfficers();
  const { data: applicants = [] } = useApplicants();
  const { toast } = useToast();
  const fromClients = useMemo(() => nominationsFrom(applicants as Applicant[]), [applicants]);
  const ok = list.filter((s) => s.blockers.length === 0);
  const mailing = useMemo(() => mailingList(officers, { nominatedFromClients: fromClients }), [officers, fromClients]);
  const copy = async () => {
    const done = await copyText(oldMailerBackup(ok, mailing));
    toast(done ? `Copied ${ok.length} properties and ${mailing.addresses.length} addresses. Paste them into Restore data in the Keel Mailer` : 'Could not copy', done ? 'success' : 'danger');
  };
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <p className="m-0 text-[15px] text-[var(--ink)]">
        Sending from here is the safe way: Keel checks every property and every address as it writes the email. If you still use the separate Keel Mailer, this copies only the properties ready to send and the officers who can be emailed, for its Restore data box.
      </p>
      <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
        The Keel Mailer keeps everyone already on its own list when you restore, so leavers and opt-outs already there stay until you remove them by hand (the × on each officer). It also uses its own LHA figures. Keel cannot change that tool.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" className={small} disabled={!canSend || ok.length === 0} onClick={copy}><Icon name="file" size={14} />Copy for the Keel Mailer</Button>
        <span className="text-[13px] text-[var(--ink-muted)]">{ok.length} properties, {mailing.addresses.length} addresses</span>
      </div>
    </Card>
  );
}

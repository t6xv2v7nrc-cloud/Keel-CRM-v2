import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, CardHeader, Empty, Icon, PageHeader, UpdateNote, useToast } from '../../components/ui';
import { copyText } from '../../lib/clipboard';
import { clockTime, money, shortDate } from '../../lib/format';
import { todayIso } from '../../lib/calls';
import { saveFile } from '../../lib/files';
import { activeSettings } from '../../lib/settings';
import { missingBusiness } from '../../lib/business';
import { openCard } from '../../lib/collapse';
import { addressBox, boroughOf, byFocus, focusRank, mailingList } from '../../lib/councils';
import type { OfficerRecord, OfficerSend, SendKind } from '../../lib/councils';
import { matchesForProperty } from '../../lib/matchRules';
import {
  alertBody, alertRecipients, alertSubject, availableWords, DIGEST_MAX, DIGEST_MIN, digestBody, digestBoroughs, digestPicks, digestRecipients, digestSubject,
  fullList, fullListBody, fullListCsv, mailerReady, mailtoFor, nominationsFrom, oldMailerBackup, sendables, typeWords,
} from '../../lib/mailer';
import type { Sendable } from '../../lib/mailer';
import { alertWhatsApp, digestWhatsApp, fullListWhatsApp, whatsappRecipients } from '../../lib/shareWhatsApp';
import { waLink } from '../../lib/whatsapp';
import { OutlookSendButton } from '../outlook/Outlook';
import { useApplicants, useMatchOptions, useOfficerSends, useOfficers, useOutlook, usePeople, useProperties, useRecordMailerSend } from '../../lib/hooks';
import { LONDON_BOROUGHS } from '../../lib/london';
import type { Property } from '../../lib/types';
import { Tip } from '../guide/Guide';

const small = 'min-h-0 px-3 py-1.5 text-[13px]';
// "On leave until 20 Nov 2026" reads "on leave until 20 Nov 2026" mid-sentence: only the first letter drops
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const select = 'h-10 max-w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]';
const tick = 'mt-[3px] h-4 w-4 shrink-0 accent-[var(--accent)]';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tab = 'alerts' | 'digest' | 'all' | 'who';
const TABS: Array<{ k: Tab; label: string; short: string; blurb: string }> = [
  { k: 'alerts', label: 'Alerts', short: 'Alerts', blurb: 'One property at a time, to the officers whose clients it suits.' },
  { k: 'digest', label: 'Monthly digest', short: 'Digest', blurb: `The best ${DIGEST_MIN} to ${DIGEST_MAX} in one borough, to its officers, once a month.` },
  { k: 'all', label: 'All properties', short: 'All', blurb: 'Every property ready to send, by area: as one email, one WhatsApp or a spreadsheet.' },
  { k: 'who', label: 'Officers', short: 'Officers', blurb: 'Who the Mailer may email, from the officer list on Councils.' },
];

/** The Mailer (Step 7): property alerts and borough digests to housing officers, that only ever carry what passes the checks. */
export function MailerPage() {
  const [params, setParams] = useSearchParams();
  // the old Keel Mailer now lives under Officers
  const asked = params.get('tab');
  const tab = (asked === 'old' ? 'who' : TABS.find((t) => t.k === asked)?.k ?? 'alerts') as Tab;
  useEffect(() => { if (asked === 'old') openCard('mailer.old'); }, [asked]);
  const { data: properties = [] } = useProperties();
  const { officers } = useOfficers();
  const { data: applicants = [] } = useApplicants();
  const list = useMemo(() => sendables(properties), [properties]);
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const mailing = useMemo(() => mailingList(officers, { nominatedFromClients: fromClients }), [officers, fromClients]);
  const ok = list.filter((s) => s.blockers.length === 0);
  const ready = mailerReady();
  const missing = missingBusiness(activeSettings().business);
  const blurb = TABS.find((t) => t.k === tab)!.blurb;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 pb-24 sm:p-6">
      <PageHeader icon="mail" title="Mailer" help="mailer"
        sub={`${plural(ok.length, 'property', 'properties')} ready to send · ${plural(mailing.to.length, 'officer')} can be emailed`} />
      <Tip id="mailer" />
      <BeforeYouSend why={ready.ok ? null : ready.why} missing={missing} />

      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label="Mailer" className="grid w-full grid-cols-4 gap-1 rounded-lg border border-[var(--line)] bg-[var(--paper-2)] p-1 sm:flex sm:w-fit">
          {TABS.map((t) => (
            <button key={t.k} role="tab" type="button" aria-selected={tab === t.k} onClick={() => setParams(t.k === 'alerts' ? {} : { tab: t.k }, { replace: true })}
              className={`rounded-md px-2 py-2 text-[14px] font-medium sm:px-4 ${tab === t.k ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-card)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
              <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <p className="m-0 text-[14px] text-[var(--ink-muted)]">{blurb}</p>
      </div>

      {tab === 'alerts' && <AlertsView list={list} canSend={ready.ok} />}
      {tab === 'digest' && <DigestView list={list} canSend={ready.ok} />}
      {tab === 'all' && <FullListView list={list} canSend={ready.ok} />}
      {tab === 'who' && <WhoView list={list} canSend={ready.ok} />}
    </div>
  );
}

/** What stands between Keel and sending: the gov.uk LHA rates (nothing goes without them) and the footer's business
 *  details (left out of the email until added). Gone once both are done. */
function BeforeYouSend({ why, missing }: { why: string | null; missing: string[] }) {
  if (!why && !missing.length) return null;
  const items = (
    <ul className="m-0 flex list-none flex-col gap-2 px-5 py-3">
      {why && (
        <li className="flex items-start gap-2.5 text-[14px]">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Icon name="x" size={12} strokeWidth={3} /></span>
          <span className="min-w-0 text-[var(--ink)]">
            <strong className="font-semibold">Load the gov.uk LHA rates.</strong> Nothing can be sent until then, so an email never quotes the built-in figures.{' '}
            <Link to="/settings?tab=team#lha" className="font-medium text-[var(--link)] hover:underline">Team settings, LHA rates</Link>
          </span>
        </li>
      )}
      {missing.length > 0 && (
        <li className="flex items-start gap-2.5 text-[14px]">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}><Icon name="alert" size={12} /></span>
          <span className="min-w-0 text-[var(--ink)]">
            <strong className="font-semibold">Business details for the footer.</strong> Still to add: {missing.join(', ')}. Emails go without them until then.{' '}
            <Link to="/settings?tab=team#business" className="font-medium text-[var(--link)] hover:underline">Business details</Link>
          </span>
        </li>
      )}
    </ul>
  );
  const sub = why ? 'Nothing can be sent yet' : `${plural(missing.length, 'detail')} to add`;
  // the LHA rates hold everything back, so that card stays open; the footer alone can be folded away
  return why ? (
    <Card><CardHeader icon="flag" title="Before you send" sub={sub} />{items}</Card>
  ) : (
    <Card fold="mailer.before"><CardHeader icon="flag" title="Before you send" sub={sub} />{items}</Card>
  );
}

// ── A property, the way the Mailer shows it ────────────────────────

/** "£50 under the £1,100 LHA", "At the £1,100 LHA", or red "£80 over the £1,100 LHA" (never colour alone). */
function LhaChip({ s }: { s: Sendable }) {
  const lha = s.checks.lha;
  const gap = s.checks.gap;
  if (!lha || gap === null || gap === undefined) return <Chip tone="chip">LHA to confirm</Chip>;
  const rate = money(lha.rate);
  if (s.over) return <Chip tone="danger" icon="x">{money(gap)} over the {rate} LHA</Chip>;
  if (Math.abs(gap) < 1) return <Chip tone="good" icon="check">At the {rate} LHA</Chip>;
  return <Chip tone="good" icon="check">{money(-gap)} under the {rate} LHA</Chip>;
}

const TONES = {
  chip: { background: 'var(--chip-bg)', color: 'var(--chip-fg)' },
  good: { background: 'var(--good-bg)', color: 'var(--good-fg)' },
  note: { background: 'var(--note-bg)', color: 'var(--note-fg)' },
  danger: { background: 'var(--danger-soft)', color: 'var(--danger)' },
} as const;

function Chip({ tone, icon, children }: { tone: keyof typeof TONES; icon?: 'x' | 'check' | 'pin'; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold" style={TONES[tone]}>
      {icon && <Icon name={icon} size={12} strokeWidth={icon === 'pin' ? 2 : 3} className="shrink-0" />}{children}
    </span>
  );
}

/** Address, then its place, type, rent against the LHA, and when it is free. */
function PropertyLine({ s }: { s: Sendable }) {
  const rent = s.checks.lha?.rent ?? s.property.rent_pcm;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="break-words text-[15px] font-medium text-[var(--ink)]">{s.property.address_line}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ink-muted)]">
        <Chip tone="chip">{s.place}</Chip>
        <span>{typeWords(s.property, s.checks)}</span>
        <span className="font-medium text-[var(--ink)]">{rent != null ? `${money(rent)} pcm` : 'Rent to confirm'}</span>
        <LhaChip s={s} />
        <span>{upper(availableWords(s.property))}</span>
        {s.checks.london === false && <Chip tone="note" icon="pin">Outside Greater London</Chip>}
      </span>
    </span>
  );
}

/** A property to tick in or out (digests and the full list). */
function PickRow({ s, on, onChange }: { s: Sendable; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <li>
      <label className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-[var(--surface-2)] ${on ? '' : 'opacity-60'}`}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className={tick} />
        <PropertyLine s={s} />
      </label>
    </li>
  );
}

// ── Alerts: one property each, to the officers of clients it fits ──

function AlertsView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const ok = list.filter((s) => s.blockers.length === 0);
  const held = list.filter((s) => s.blockers.length > 0);
  return (
    <div className="flex flex-col gap-4">
      {ok.length === 0 ? (
        <Card>
          <Empty icon="building" title="Nothing ready to send" action={<Link to="/properties" className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"><Icon name="building" size={16} />Go to Properties</Link>}>
            Every available property can go unless it is marked not ready; Keel only needs to know its LHA area and its rent. See what each one needs under Held back, or paste a property list.
          </Empty>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="keel-stagger m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {ok.map((s) => {
              const isOpen = open === s.property.id;
              return (
                <li key={s.property.id} className={isOpen ? 'bg-[var(--surface-2)]' : ''}>
                  <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1"><PropertyLine s={s} /></div>
                    <Button variant={isOpen ? 'ghost' : 'secondary'} className={`${small} shrink-0`} disabled={!canSend} aria-expanded={isOpen}
                      aria-label={isOpen ? 'Close the alert' : `Write the alert for ${s.property.address_line}`}
                      onClick={() => setOpen((v) => (v === s.property.id ? null : s.property.id))}>
                      {isOpen ? <><Icon name="x" size={14} />Close</> : <><Icon name="mail" size={14} /><span>Write<span className="hidden sm:inline"> the alert</span></span></>}
                    </Button>
                  </div>
                  {isOpen && <div className="keel-rise border-t border-[var(--line)] px-4 py-4 sm:px-5"><AlertComposer s={s} /></div>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {held.length > 0 && (
        <Card fold="mailer.held" startsFolded>
          <CardHeader icon="clock" title="Held back" sub={`${plural(held.length, 'property', 'properties')}: what each needs`} />
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {held.map((s) => (
              <li key={s.property.id} className="px-5 py-2.5">
                <Link to="/properties" className="text-[14px] font-medium text-[var(--ink)] hover:underline">{s.property.address_line}</Link>
                <ul className="m-0 mt-1 list-disc pl-5 text-[13px] text-[var(--ink-muted)]">
                  {s.blockers.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </li>
            ))}
          </ul>
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
  const red = s.over && s.checks.lha ? `${money(s.checks.gap ?? 0)} over the ${s.checks.lha.size === 'shared' ? 'shared' : `${s.checks.lha.size} bed`} LHA of ${money(s.checks.lha.rate)}. The email says so, so the officer sees the shortfall.` : null;
  const who = (
    <>
      <p className="m-0 text-[13px] text-[var(--ink-muted)]">
        It suits {plural(r.clients, 'client')} referred by a housing officer.
        {r.notListed.length > 0 && <> Not on the officer list, so left out: {r.notListed.join(', ')} (<Link to="/councils" className="text-[var(--link)] hover:underline">add them on Councils</Link>).</>}
      </p>
      {outside && (
        <label className="flex items-start gap-2 rounded-md px-3 py-2 text-[13px]" style={{ background: 'var(--note-bg)', color: 'var(--note-fg)' }}>
          <input type="checkbox" checked={includeLondon} onChange={(e) => setIncludeLondon(e.target.checked)} className={tick} />
          <span>Outside Greater London, so not sent to London officers as standard{r.londonHeld ? ` (${r.londonHeld} held back)` : ''}. Include them</span>
        </label>
      )}
    </>
  );
  return (
    <Composer kind="alert" to={r.list} properties={[s.property]} warn={warn} red={red} who={who}
      subject={alertSubject(s)} body={(greeting, myName) => alertBody(s, { greeting, myName })}
      whatsapp={(greeting, myName) => alertWhatsApp(s, alertSubject(s), { greeting, myName })} />
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
  const pick = (id: string, on: boolean) => setDropped((d) => { const n = new Set(d); if (on) n.delete(id); else n.add(id); return n; });

  if (!borough) return <Card><Empty icon="users" title="No boroughs yet">Add officers on Councils, or focus boroughs in Team settings.</Empty></Card>;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">Borough</span>
            <select value={borough} onChange={(e) => { setBorough(e.target.value); setDropped(new Set()); }} className={select}>
              {boroughs.map((b) => <option key={b} value={b}>{focusRank(b) === 0 ? '★ ' : ''}{b}</option>)}
            </select>
          </label>
          <span className="pb-2 text-[14px] text-[var(--ink)]">
            <strong>{chosen.length}</strong> of {picks.length} picked{lastDigest ? <span className="text-[var(--ink-muted)]"> · last digest to these officers {shortDate(lastDigest)}</span> : null}
          </span>
        </div>
        <Options>
          {london && <Option checked={includeOutside} onChange={setIncludeOutside}>Include properties outside Greater London</Option>}
          <Option checked={includeOver} onChange={setIncludeOver}>Include properties over LHA (marked red)</Option>
        </Options>
        {chosen.length < DIGEST_MIN && (
          <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={TONES.note}>
            {chosen.length === 0 ? `Nothing ready to send in or around ${borough}.` : `Only ${chosen.length} ready in and around ${borough}: a digest should have ${DIGEST_MIN} to ${DIGEST_MAX}.`} Send alerts instead, or wait until more are ready.
          </p>
        )}
        {picks.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] p-0">
            {picks.map((s) => <PickRow key={s.property.id} s={s} on={!dropped.has(s.property.id)} onChange={(on) => pick(s.property.id, on)} />)}
          </ul>
        )}
      </Card>
      {chosen.length > 0 && (
        <Card className="p-4 sm:p-5">
          <Composer key={borough} kind="digest" to={rec.list} recent={rec.recent} sends={sends} properties={chosen.map((s) => s.property)} disabled={!canSend}
            warn={includeOutside && chosen.some((s) => s.checks.london === false) ? 'Includes properties outside Greater London, by your choice' : null}
            red={chosen.some((s) => s.over) ? `${chosen.filter((s) => s.over).length} over LHA, marked in the email with how far over` : null}
            subject={digestSubject(borough, chosen.length, undefined, !chosen.some((s) => s.over))} body={(greeting, myName) => digestBody(borough, chosen, { greeting, myName })}
            whatsapp={(greeting, myName) => digestWhatsApp(borough, chosen, digestSubject(borough, chosen.length, undefined, !chosen.some((s) => s.over)), { greeting, myName })} />
        </Card>
      )}
    </div>
  );
}

function Options({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5">{children}</div>;
}

function Option({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[14px] text-[var(--ink)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={tick} />
      <span>{children}</span>
    </label>
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
  const save = () => {
    saveFile(`keel-properties-${borough ? `${borough.toLowerCase().replace(/[^a-z]+/g, '-')}-` : ''}${todayIso()}.csv`, fullListCsv(chosen), 'text/csv;charset=utf-8');
    toast('Spreadsheet saved', 'success');
  };
  const pick = (id: string, on: boolean) => setDropped((d) => { const n = new Set(d); if (on) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">Area</span>
            <select value={borough} onChange={(e) => { setBorough(e.target.value); setDropped(new Set()); }} className={select}>
              <option value="">All areas</option>
              {boroughs.map((b) => <option key={b} value={b}>{focusRank(b) === 0 ? '★ ' : ''}{b}</option>)}
            </select>
          </label>
          <span className="pb-2 text-[14px] text-[var(--ink)]">
            <strong>{chosen.length}</strong> {chosen.length === 1 ? 'property' : 'properties'} in {plural(groups.length, 'area')}{dropped.size ? `, ${dropped.size} taken out` : ''}
            {lastFull ? <span className="text-[var(--ink-muted)]"> · last full list to these officers {shortDate(lastFull)}</span> : null}
          </span>
        </div>
        <Options>
          <Option checked={includeOver} onChange={setIncludeOver}>Include properties over LHA (marked red){all.leftOver ? `: ${all.leftOver} left out` : ''}</Option>
          {!borough && <Option checked={includeOutside} onChange={setIncludeOutside}>Include properties outside Greater London{all.leftOutside ? `: ${all.leftOutside} left out` : ''}</Option>}
        </Options>
        <div className="flex flex-wrap items-center gap-2">
          {all.items.length > 0 && (
            <Button className={small} onClick={() => setChoosing((v) => !v)} aria-expanded={choosing}>
              <Icon name="list" size={14} />{choosing ? 'Hide the list' : 'Choose which go'}
            </Button>
          )}
          <Button className={small} disabled={!canSend || !chosen.length} onClick={save}><Icon name="download" size={14} />Save as a spreadsheet</Button>
        </div>
        {choosing && (
          <div className="flex flex-col gap-3">
            {all.groups.map((g) => (
              <div key={g.place} className="flex flex-col gap-1.5">
                <div className="text-[13px] font-semibold text-[var(--ink-muted)]">{g.place} ({g.items.length})</div>
                <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] p-0">
                  {g.items.map((s) => <PickRow key={s.property.id} s={s} on={!dropped.has(s.property.id)} onChange={(on) => pick(s.property.id, on)} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
        {chosen.length === 0 && (
          <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={TONES.note}>
            Nothing ready to send{borough ? ` in ${borough}` : ''}{all.leftOver + all.leftOutside ? ': tick a box above to include the ones left out' : ''}.
          </p>
        )}
      </Card>
      {chosen.length > 0 && (
        <Card className="p-4 sm:p-5">
          <Composer key={borough || 'all'} kind="bulk" to={rec.list} recent={rec.recent} sends={sends} properties={chosen.map((s) => s.property)} disabled={!canSend}
            warn={outside && toLondon ? `Includes ${outside} outside Greater London, by your choice: London officers do not get these as standard` : null}
            red={over ? `${over} over LHA, marked in the email with how far over` : null}
            subject={subject} body={(greeting, myName) => fullListBody(groups, { borough: borough || null, greeting, myName })}
            whatsapp={(greeting, myName) => fullListWhatsApp(groups, subject, { borough: borough || null, greeting, myName })} />
        </Card>
      )}
    </div>
  );
}

const lastSendTo = (officers: OfficerRecord[], sends: OfficerSend[], kind: OfficerSend['kind']) => {
  const ids = new Set(officers.map((o) => String(o.id)));
  return sends.filter((x) => x.kind === kind && ids.has(x.officer_id)).map((x) => x.sent_at).sort().pop() ?? null;
};

// ── The email, in three steps: who it goes to, the email, send it ──

function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent-ink)]">{n}</span>
        <h3 className="m-0 text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
        {aside && <span className="ml-auto flex flex-wrap items-center gap-2">{aside}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:pl-[34px]">{children}</div>
    </section>
  );
}

function Composer({ kind, to, recent, sends = [], properties, subject, body, whatsapp, warn, red, who, disabled = false }: {
  kind: SendKind; to: ReturnType<typeof mailingList>; recent?: Set<string>; sends?: OfficerSend[]; properties: Property[];
  subject: string; body: (greeting: string | null, myName: string | null) => string; whatsapp: (greeting: string | null, myName: string | null) => string;
  warn?: string | null; red?: string | null; who?: ReactNode; disabled?: boolean;
}) {
  const { myName } = usePeople();
  const { account } = useOutlook();
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
  // a few officers show to tick; one is named in the summary, and a long list folds to a line
  const [showTo, setShowTo] = useState(to.to.length > 1 && to.to.length <= 4);
  const [whole, setWhole] = useState(false);
  const chosen = to.to.filter((t) => !off.has(String(t.officer.id)));
  const recentOff = to.to.filter((t) => off.has(String(t.officer.id)) && recent?.has(String(t.officer.id))).length;
  const addresses = [...new Map(chosen.map((t) => [t.address.toLowerCase(), t.address])).values()];
  const greeting = chosen.length === 1 ? chosen[0].officer.send_to_mailbox?.trim() ? null : chosen[0].officer.name : null;
  const text = body(greeting, myName);
  const href = mailtoFor(addresses, { subject, body: text });
  const long = text.length > 700 || text.split('\n').length > 14;
  const blocked = disabled || !chosen.length;
  const copy = async (what: string, value: string) => {
    const ok = await copyText(value);
    toast(ok ? `${what} copied` : 'Could not copy. Press and hold to copy instead.', ok ? 'success' : 'danger');
  };
  const save = () => {
    if (sentAt) return;
    record.mutate({ to: chosen, kind, subject, properties }, {
      onSuccess: () => { setSentAt(new Date().toISOString()); toast(`Recorded: ${kind === 'alert' ? 'alert' : kind === 'digest' ? 'digest' : 'full list'} to ${plural(chosen.length, 'officer')}`, 'success'); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const lastBulk = (o: OfficerRecord) => sends.filter((x) => x.officer_id === String(o.id) && x.kind !== 'alert').map((x) => x.sent_at).sort().pop();
  const one = chosen.length === 1 ? chosen[0] : null;
  const what = `${kind === 'alert' ? 'this alert' : kind === 'digest' ? 'this digest' : 'the full list'} to ${plural(chosen.length, 'officer')}`;

  return (
    <div className="flex flex-col gap-5">
      <Step n={1} title="Who it goes to"
        aside={addresses.length > 0 && <button type="button" onClick={() => copy(addresses.length > 1 ? 'Addresses for the Bcc box' : 'Address', addressBox({ to: chosen }))} className="text-[13px] font-medium text-[var(--link)] hover:underline">Copy {addresses.length > 1 ? 'addresses' : 'address'}</button>}>
        {who}
        {to.to.length === 0 ? (
          <p className="m-0 text-[14px] text-[var(--ink)]">Nobody on the mailing list for this one.</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="min-w-0 text-[14px] text-[var(--ink)]">
              {one ? <>
                <strong className="font-semibold">{one.officer.name ?? 'Officer'}</strong>{boroughOf(one.officer) ? `, ${boroughOf(one.officer)}` : ''}
                <span className="break-all text-[var(--ink-muted)]"> · {one.address}{one.officer.send_to_mailbox?.trim() ? ' (team mailbox)' : ''}</span>
              </> : <>
                <strong className="font-semibold">{plural(chosen.length, 'officer')}</strong>{addresses.length > 1 ? `, at ${plural(addresses.length, 'address', 'addresses')} in Bcc` : ''}
                {chosen.length < to.to.length && <span className="text-[var(--ink-muted)]"> (of {to.to.length}{recentOff ? `; ${recentOff} unticked, as they had a bulk email in the last 30 days` : ''})</span>}
              </>}
            </span>
            {(to.to.length > 1 || to.left.length > 0) && (
              <button type="button" onClick={() => setShowTo((v) => !v)} aria-expanded={showTo} className="text-[13px] text-[var(--link)] hover:underline">
                {showTo ? 'Hide' : to.to.length > 1 ? 'Show who' : `${to.left.length} left out by the rules`}
              </button>
            )}
          </div>
        )}
        {showTo && to.to.length > 1 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] p-0">
            {to.to.map(({ officer, address }) => {
              const id = String(officer.id);
              const isRecent = recent?.has(id);
              return (
                <li key={id}>
                  <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-[14px] text-[var(--ink)] hover:bg-[var(--surface-2)]">
                    <input type="checkbox" checked={!off.has(id)} className={tick}
                      onChange={(e) => setOff((d) => { const n = new Set(d); if (e.target.checked) n.delete(id); else n.add(id); return n; })} />
                    <span className="min-w-0 break-words">
                      {officer.name ?? 'Officer'}{boroughOf(officer) ? <span className="text-[var(--ink-muted)]">, {boroughOf(officer)}</span> : ''}
                      <span className="block break-all text-[12px] text-[var(--ink-muted)]">{address}{officer.send_to_mailbox?.trim() ? ' (team mailbox)' : ''}</span>
                      {isRecent && <span className="block text-[12px]" style={{ color: 'var(--note-fg)' }}>Had a bulk email or digest {lastBulk(officer) ? `on ${shortDate(lastBulk(officer)!)}` : 'in the last 30 days'}: this would be another</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {showTo && to.left.length > 0 && (
          <p className="m-0 text-[13px] text-[var(--ink-muted)]">Left out by the rules: {to.left.map(({ officer, why }) => `${officer.name ?? 'Officer'} (${lower(why)})`).join(', ')}.</p>
        )}
      </Step>

      <Step n={2} title="The email" aside={<button type="button" onClick={() => copy('Email', text)} className="text-[13px] font-medium text-[var(--link)] hover:underline">Copy the email</button>}>
        {red && <p className="m-0 flex items-start gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold" style={TONES.danger}><Icon name="x" size={14} strokeWidth={3} className="mt-[2px] shrink-0" />{red}</p>}
        {warn && <p className="m-0 flex items-start gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold" style={TONES.note}><Icon name="alert" size={14} className="mt-[2px] shrink-0" />{warn}</p>}
        <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-b border-[var(--line)] px-4 py-2.5">
            <span className="text-[13px] text-[var(--ink-muted)]">Subject</span>
            <span className="min-w-0 flex-1 basis-[200px] break-words text-[14px] font-medium text-[var(--ink)]">{subject}</span>
            <button type="button" onClick={() => copy('Subject', subject)} className="ml-auto text-[13px] text-[var(--link)] hover:underline">Copy</button>
          </div>
          <div className="relative">
            <div className={`whitespace-pre-wrap break-words px-4 py-3 text-[14px] leading-relaxed text-[var(--ink)] ${long && !whole ? 'max-h-[260px] overflow-hidden' : ''}`}>{text}</div>
            {long && !whole && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(to top, var(--surface), transparent)' }} />}
          </div>
          {long && (
            <button type="button" onClick={() => setWhole((v) => !v)} aria-expanded={whole}
              className="flex w-full items-center justify-center gap-1 border-t border-[var(--line)] px-4 py-2 text-[13px] font-medium text-[var(--link)] hover:bg-[var(--surface-2)]">
              <Icon name="chevronDown" size={14} className={whole ? 'rotate-180' : ''} />{whole ? 'Show less' : 'Show the whole email'}
            </button>
          )}
        </div>
      </Step>

      <Step n={3} title="Send it">
        {sentAt ? (
          <p className="keel-rise m-0 flex items-center gap-2 rounded-md px-3 py-2 text-[14px] font-medium" style={TONES.good}>
            <Icon name="check" size={16} strokeWidth={3} />Sent and recorded at {clockTime(sentAt)}, to {plural(chosen.length, 'officer')}.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <OutlookSendButton to={addresses} subject={subject} body={text} disabled={blocked} what={what} onSent={save} />
              {href ? (
                <a href={blocked ? undefined : href} onClick={() => !blocked && save()} aria-disabled={blocked}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-medium ${account
                    ? 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)]'
                    : 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)]'} ${blocked ? 'pointer-events-none opacity-40' : ''}`}>
                  <Icon name="mail" size={15} />Open in my email
                </a>
              ) : (
                <>
                  <Button variant={account ? 'secondary' : 'primary'} className={small} disabled={blocked} onClick={() => copy('Email', text)}><Icon name="file" size={14} />Copy the email</Button>
                  <Button className={small} disabled={blocked} onClick={() => copy(addresses.length > 1 ? 'Addresses for the Bcc box' : 'Address', addressBox({ to: chosen }))}><Icon name="users" size={14} />Copy {addresses.length > 1 ? 'addresses' : 'address'}</Button>
                </>
              )}
              <Button busy={record.isPending} variant="ghost" className={small} disabled={blocked || record.isPending} onClick={save}>
                <Icon name="check" size={14} />I've sent it
              </Button>
            </div>
            <p className="m-0 text-[12px] text-[var(--ink-muted)]">
              {account ? 'Send from Outlook asks first, then sends and records it. ' : ''}{href
                ? 'Opening it in your email records the send too. Sent it another way? Press I\'ve sent it once it has gone.'
                : 'Too long to open in your email app in one go: paste the addresses into Bcc and the email into a new message, then press I\'ve sent it.'}
            </p>
          </>
        )}
        <WhatsAppVersion kind={kind} to={to} off={off} subject={subject} text={whatsapp} properties={properties} disabled={disabled} />
      </Step>
    </div>
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
    <div className="mt-1 flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 px-3 py-2.5 text-left text-[14px] font-medium text-[var(--ink)]">
        <Icon name="chat" size={15} className="text-[var(--accent)]" />Or send it on WhatsApp
        <span className="ml-auto flex items-center gap-1 text-[13px] font-normal text-[var(--ink-muted)]">
          {people.length > 0 && <span className="hidden sm:inline">{people.length} with a mobile</span>}<Icon name="chevronDown" size={14} className={open ? 'rotate-180' : ''} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] px-3 pb-3 pt-2">
          <div className="max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-[var(--surface-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink)]">{group}</div>
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
        </div>
      )}
    </div>
  );
}

// ── Officers: who can be emailed, from Councils; and the old Keel Mailer ──

function WhoView({ list, canSend }: { list: Sendable[]; canSend: boolean }) {
  const { officers, ready } = useOfficers();
  const { data: applicants = [] } = useApplicants();
  const [all, setAll] = useState(false);
  const fromClients = useMemo(() => nominationsFrom(applicants), [applicants]);
  const mailing = useMemo(() => mailingList(byFocus(officers), { nominatedFromClients: fromClients }), [officers, fromClients]);
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const { why } of mailing.left) { const k = why.startsWith('On leave') ? 'On leave' : why; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [mailing]);
  if (!ready) return <UpdateNote title="The officer list needs a one-off database update." file="0020_council_contacts.sql" />;
  const shown = all ? mailing.to : mailing.to.slice(0, 12);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader icon="users" title="Who can be emailed" sub={`${plural(mailing.to.length, 'officer')}, at ${plural(mailing.addresses.length, 'address', 'addresses')}`}>
          <Link to="/councils" className="text-[13px] font-medium text-[var(--link)] hover:underline">Add or change officers</Link>
        </CardHeader>
        <div className="flex flex-col gap-2 px-5 py-3">
          {mailing.left.length > 0 && (
            <p className="m-0 text-[14px] text-[var(--ink-muted)]">
              {plural(mailing.left.length, 'officer')} left out: {reasons.map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}. Mark leavers, opt-outs and bounces on Councils, or paste new officers there; the Mailer follows straight away.
            </p>
          )}
          {mailing.to.length === 0 ? (
            <p className="m-0 text-[14px] text-[var(--ink)]">Nobody yet. <Link to="/councils" className="text-[var(--link)] hover:underline">Paste your officers on Councils</Link>: they can be emailed once they opt in or refer a client.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
              {shown.map(({ officer, address }) => (
                <li key={String(officer.id)} className="flex flex-wrap items-baseline gap-x-2 py-2 text-[14px]">
                  <span className="font-medium text-[var(--ink)]">{focusRank(boroughOf(officer)) === 0 ? '★ ' : ''}{officer.name ?? 'Officer'}</span>
                  <span className="text-[13px] text-[var(--ink-muted)]">{boroughOf(officer) ?? officer.council ?? 'Council not known'}</span>
                  <span className="min-w-0 break-all text-[13px] text-[var(--ink-muted)] sm:ml-auto">{address}</span>
                </li>
              ))}
            </ul>
          )}
          {mailing.to.length > 12 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-[13px] font-medium text-[var(--link)] hover:underline">
              {all ? 'Show fewer' : `Show all ${mailing.to.length}`}
            </button>
          )}
        </div>
      </Card>
      <OldMailer list={list} canSend={canSend} mailing={mailing} />
    </div>
  );
}

function OldMailer({ list, canSend, mailing }: { list: Sendable[]; canSend: boolean; mailing: ReturnType<typeof mailingList> }) {
  const { toast } = useToast();
  const ok = list.filter((s) => s.blockers.length === 0);
  const copy = async () => {
    const done = await copyText(oldMailerBackup(ok, mailing));
    toast(done ? `Copied ${ok.length} properties and ${mailing.addresses.length} addresses. Paste them into Restore data in the Keel Mailer` : 'Could not copy', done ? 'success' : 'danger');
  };
  return (
    <Card fold="mailer.old" startsFolded>
      <CardHeader icon="file" title="Still using the old Keel Mailer?" sub="Copy a clean list for its Restore box" />
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="m-0 text-[14px] text-[var(--ink)]">
          Sending from here is the safe way: Keel checks every property and every address as it writes the email. If you still use the separate Keel Mailer, this copies only the properties ready to send and the officers who can be emailed, for its Restore data box.
        </p>
        <p className="m-0 rounded-md px-3 py-2 text-[13px]" style={TONES.note}>
          The Keel Mailer keeps everyone already on its own list when you restore, so leavers and opt-outs already there stay until you remove them by hand (the × on each officer). It also uses its own LHA figures. Keel cannot change that tool.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button className={small} disabled={!canSend || ok.length === 0} onClick={copy}><Icon name="file" size={14} />Copy for the Keel Mailer</Button>
          <span className="text-[13px] text-[var(--ink-muted)]">{plural(ok.length, 'property', 'properties')}, {plural(mailing.addresses.length, 'address', 'addresses')}</span>
        </div>
      </div>
    </Card>
  );
}

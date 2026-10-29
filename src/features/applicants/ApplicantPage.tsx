import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Avatar, Button, Card, CardHeader, Empty, Help, IceBadge, Icon, NewBadge, PageSkeleton, StageBadge, TierBadge, UrgentChip, useToast } from '../../components/ui';
import {
  sentKey, useActivities, useApplicant, useApplicants, useAssign, useCalls, useDeals, useDeleteApplicant, usePeople, useProperties, useProviders, useRequests,
  useLocated, useMatchOptions, useProspectContext, useSaveSettings, useSentOnWhatsApp, useSettings,
} from '../../lib/hooks';
import { tierNeeds } from '../../lib/clientProfile';
import { bestFew, brief } from '../../lib/propertyMatch';
import { hiddenForApplicant, matchesForApplicant } from '../../lib/matchRules';
import { FitBadge, HiddenNote, IncomeTag, ProspectTag, ProspectWhy, RuleWarnings } from '../properties/MatchBits';
import { prospectFor } from '../../lib/prospects';
import { billsWords } from '../../lib/whatsapp';
import type { Prospect, ProspectContext } from '../../lib/prospects';
import type { RuledPropertyMatch } from '../../lib/matchRules';
import { OfficerMatchesLink } from '../properties/ShareLinks';
import { activeSettings } from '../../lib/settings';
import { money, shortDate, timeAgo } from '../../lib/format';
import { effectiveTier, isActive, isFresh, isIced, isUrgent, receivedWords } from '../../lib/search';
import { URGENCY_LABEL } from '../../lib/tiering';
import { dayWord, todayIso } from '../../lib/calls';
import type { Activity, Applicant, Property } from '../../lib/types';
import { CallsNeedUpdate } from '../calls/CallsPage';
import { ClientDetails } from './ClientDetails';
import { ProfileCard } from './ProfileCard';
import { NotesCard } from './NotesCard';
import { ShareClient } from './ShareClient';
import { StarButton } from '../pipeline/Star';
import { IceBand, IcePanel } from './IceClient';
import { CHANNEL_ICON } from './channelIcon';
import { CHANNEL_LABEL, readNote } from '../../lib/contacts';
import { LhaChip } from '../properties/Lha';
import { rentShown } from '../../lib/lha';
import { SentTag, WhatsAppLink } from '../properties/WhatsApp';
import { LazyMap, MapKey } from '../map/MapView';
import { NextStepRow, ProgressCard, StuckChip } from '../progress/Progress';
import { RequestButton, RequestChip } from '../requests/RequestSheet';
import { MoneyCard } from '../money/Money';
import { stuckDays } from '../../lib/progress';
import { openGroups } from '../../lib/duplicates';
import { openCard, useFold } from '../../lib/collapse';
import { CLIENT_CARDS, cardOrder, isStandardOrder, moveCard } from '../../lib/clientLayout';
import type { ClientCard } from '../../lib/clientLayout';
import { anchorKey, clientAreas, placeKey } from '../../lib/geo';
import { Tip } from '../guide/Guide';

export function ApplicantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: applicant, isLoading } = useApplicant(id);
  const { data: activities = [] } = useActivities('applicant', id);
  const { calls, ready: callsReady } = useCalls();
  const deleteApplicant = useDeleteApplicant();
  const { settings } = useSettings();
  const save = useSaveSettings();
  const { toast } = useToast();
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState<ClientCard[] | null>(null); // while arranging, ahead of the saved setting
  const { hash } = useLocation();
  const loaded = !!applicant;
  // Arriving from "found in notes" in the Pipeline: open the details and go straight to them
  useEffect(() => {
    if (!loaded || hash !== '#details') return;
    openCard('client.details');
    setTimeout(() => document.getElementById('details')?.scrollIntoView({ block: 'start' }), 50);
  }, [loaded, hash]);

  if (isLoading) return <PageSkeleton />;
  if (!applicant) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Client not found.</div>;

  const mine = calls.filter((c) => c.applicant_id === applicant.id);
  const cards = order ?? cardOrder(settings.clientPageOrder);
  const arrange = (next: ClientCard[]) => {
    setOrder(next);
    save.mutate({ scope: 'me', value: { ...settings, clientPageOrder: next } }, {
      onError: (e) => toast(`Could not save the order: ${(e as Error).message}`, 'danger'),
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${applicant.full_name}? This removes their record, calls and activity. This cannot be undone.`)) return;
    deleteApplicant.mutate(applicant.id, {
      onSuccess: () => { toast(`Deleted ${applicant.full_name}`, 'success'); navigate('/pipeline'); },
      onError: (e) => toast(`Delete failed: ${(e as Error).message}`, 'danger'),
    });
  };

  const card: Record<ClientCard, ReactNode> = {
    profile: <ProfileCard applicant={applicant} />,
    notes: <NotesCard applicant={applicant} activities={activities} calls={mine} />,
    progress: <ProgressCard applicant={applicant} />,
    finances: <MoneyCard applicant={applicant} />,
    suitable: <SuitablePropertiesCard applicant={applicant} />,
    details: <ClientDetails applicant={applicant} />,
    nextstep: <NextStepCard applicant={applicant} ready={callsReady} />,
    timeline: <TimelineCard activities={activities} />,
  };

  return (
    <div className="mx-auto flex max-w-[1060px] flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => navigate('/pipeline')} className="inline-flex items-center gap-1.5 text-[15px] text-[var(--link)] hover:underline">
          <Icon name="arrowRight" size={16} className="rotate-180" /> Pipeline
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => setArranging((v) => !v)} aria-expanded={arranging}>
            <Icon name="layers" size={14} />{arranging ? 'Done arranging' : 'Arrange'}
          </Button>
          <Button busy={deleteApplicant.isPending} variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={handleDelete} disabled={deleteApplicant.isPending}>
            <Icon name="trash" size={14} />{deleteApplicant.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>

      <Tip id="client" />
      {arranging && <ArrangePanel order={cards} onChange={arrange} onDone={() => setArranging(false)} />}

      <HeroCard applicant={applicant} />

      <DuplicateNote applicant={applicant} />

      {cards.map((k) => <Fragment key={k}>{card[k]}</Fragment>)}
    </div>
  );
}

/** Move the client page's cards up and down; the order is this person's own and follows them between devices. */
function ArrangePanel({ order, onChange, onDone }: { order: ClientCard[]; onChange: (next: ClientCard[]) => void; onDone: () => void }) {
  const label = (k: ClientCard) => CLIENT_CARDS.find((c) => c.key === k)?.label ?? k;
  const arrow = 'grid h-9 w-9 place-items-center rounded-md border border-[var(--line-strong)] text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-30';
  return (
    <Card>
      <CardHeader icon="layers" title="Arrange this page" help="arrange">
        <Button variant="primary" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={onDone}>Done</Button>
      </CardHeader>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-4">
        {order.map((k, i) => (
          <li key={k} className="flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 py-1.5">
            <span className="w-5 text-right font-mono text-[13px] text-[var(--ink-muted)]">{i + 1}</span>
            <span className="min-w-0 flex-1 text-[15px] text-[var(--ink)]">{label(k)}</span>
            <button type="button" className={arrow} disabled={i === 0} onClick={() => onChange(moveCard(order, k, -1))} aria-label={`Move ${label(k)} up`}>
              <Icon name="chevronDown" size={16} className="rotate-180" />
            </button>
            <button type="button" className={arrow} disabled={i === order.length - 1} onClick={() => onChange(moveCard(order, k, 1))} aria-label={`Move ${label(k)} down`}>
              <Icon name="chevronDown" size={16} />
            </button>
          </li>
        ))}
      </ol>
      {!isStandardOrder(order) && (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => onChange(cardOrder([]))} className="text-[13px] text-[var(--link)] hover:underline">Use the standard order</button>
        </div>
      )}
    </Card>
  );
}

/** Everything that has happened with the client, newest first. */
function TimelineCard({ activities }: { activities: Activity[] }) {
  const fold = useFold('client.timeline');
  return (
    <Card>
      <CardHeader icon="clock" title="Timeline" sub={`${activities.length} events`} help="timeline" open={fold.open} onToggle={fold.toggle} />
      {fold.open && (
        <div className="p-5">
          {activities.length === 0 ? (
            <p className="m-0 text-[15px] text-[var(--ink-muted)]">No activity yet.</p>
          ) : (
            <ul className="relative m-0 flex list-none flex-col gap-4 p-0">
              <span aria-hidden className="absolute bottom-1 left-[4px] top-1 w-px bg-[var(--line-strong)]" />
              {activities.map((act) => <TimelineRow key={act.id} act={act} />)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function TimelineRow({ act }: { act: Activity }) {
  const { whoOf } = usePeople();
  const who = whoOf(act.actor);
  const fromScreenshot = act.body.includes('screenshot') || act.inbox_item_id != null;
  const isCall = act.kind === 'call';
  const isWhatsApp = act.kind === 'whatsapp';
  const isProgress = act.kind === 'progress' || act.kind === 'request' || act.kind === 'money';
  const note = act.kind === 'contact' || act.kind === 'note' ? readNote(act) : null;
  return (
    <li className="relative flex gap-3 pl-5">
      <span aria-hidden className="absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full ring-2 ring-[var(--surface)]"
        style={{ background: isCall || isWhatsApp || isProgress || note ? 'var(--accent)' : fromScreenshot ? 'var(--ink-muted)' : 'var(--line-strong)' }} />
      <div className="min-w-0 flex-1">
        <LongText text={note ? note.text : act.body} />
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--ink-muted)]">
          {note && <Icon name={CHANNEL_ICON[note.channel]} size={12} />}
          <span>{note ? (note.channel === 'note' ? 'Note' : CHANNEL_LABEL[note.channel]) : isCall ? 'Call' : isWhatsApp ? 'WhatsApp' : act.kind === 'request' ? 'Request' : act.kind === 'shared' ? 'Shared' : act.kind === 'money' ? 'Finances' : isProgress ? 'Progress' : act.kind.replace('_', ' ')}</span>
          <span>·</span>
          <span>{timeAgo(act.created_at)}</span>
          {who && <><span>·</span><span>by {who}</span></>}
          {fromScreenshot && <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[12px] text-[var(--chip-fg)]">from the Bin</span>}
        </div>
      </div>
    </li>
  );
}

/** A timeline line, cut short when it is long (a whole pasted message), with Show more. */
function LongText({ text, max = 220 }: { text: string; max?: number }) {
  const [all, setAll] = useState(false);
  const long = text.length > max;
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] text-[var(--ink)]">
      {long && !all ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text}
      {long && (
        <button type="button" onClick={() => setAll((v) => !v)} className="ml-1.5 whitespace-nowrap text-[13px] text-[var(--link)] hover:underline">
          {all ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// ── Possibly the same person as another client ─────────────────────

function DuplicateNote({ applicant }: { applicant: Applicant }) {
  const { data: all = [] } = useApplicants();
  const group = useMemo(() => openGroups(all).find((g) => g.clients.some((c) => c.id === applicant.id)), [all, applicant.id]);
  if (!group) return null;
  const others = group.clients.filter((c) => c.id !== applicant.id);
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--line-strong)] bg-[var(--note-bg)] px-4 py-3 text-[14px] text-[var(--note-fg)]">
      <Icon name="layers" size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 basis-[220px]">
        {group.sure ? 'Looks like the same person as ' : 'May be the same person as '}
        {others.map((c, i) => (
          <span key={c.id}>{i ? ' and ' : ''}<Link to={`/applicants/${c.id}`} className="font-medium underline">{c.full_name}</Link></span>
        ))}
        {' '}({group.reasons.join(', ')}).
      </span>
      <Link to="/pipeline?duplicates=1" className="font-medium underline">Review and merge</Link>
    </div>
  );
}

// ── Next step, and calls kept quietly underneath ───────────────────

function NextStepCard({ applicant, ready }: { applicant: Applicant; ready: boolean }) {
  const fold = useFold('client.nextstep');
  const next = applicant.next_call_at;
  const summary = !fold.open ? (next ? `${applicant.next_step ? `${applicant.next_step}, ` : ''}${dayWord(next)}` : 'Not set') : undefined;
  return (
    <Card>
      <CardHeader icon="calendar" title="Next step" sub={summary} help="nextCall" open={fold.open} onToggle={fold.toggle} />
      {fold.open && (
        <div className="flex flex-col gap-4 p-5">
          {!ready && <CallsNeedUpdate />}
          {ready && <NextStepRow key={`${applicant.next_step ?? ''}|${applicant.next_call_at ?? ''}`} applicant={applicant} />}
        </div>
      )}
    </Card>
  );
}

// ── Suitable properties ────────────────────────────────────────────


/** The available properties this client could suit: the best few first, the rest on request. */
function SuitablePropertiesCard({ applicant }: { applicant: Applicant }) {
  const { data: properties = [] } = useProperties();
  const sent = useSentOnWhatsApp();
  const [showAll, setShowAll] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const available = useMemo(() => properties.filter((p) => p.status === 'void' || p.status === 'under_offer'), [properties]);
  const base = useMatchOptions();
  const [overLha, setOverLha] = useState(() => activeSettings().showOverLha);
  const [outside, setOutside] = useState(() => activeSettings().showOutsideLondon);
  const opts = useMemo(() => ({ ...base, showOverLha: overLha, showOutsideLondon: outside }), [base, overLha, outside]);
  const pctx = useProspectContext();
  // who or what they must live near: its district and the properties' places, for how far each is (B6)
  const anchored = !!(applicant.anchor || applicant.anchor_postcode);
  const located = useLocated(anchored ? [anchorKey(applicant), ...available.map((p) => placeKey(p))] : []);
  // in the order of the matching rules (B10: self-contained first, nearest, with photos, most room under their LHA),
  // each with its fit, chance of placing and expected money
  const scored = useMemo(() => matchesForApplicant(applicant, available, opts).map((item) => ({ item, prospect: prospectFor(item.match, item.property, pctx) })),
    [applicant, available, opts, pctx, located]);
  const all = scored.map((x) => x.item);
  const prospectOf = new Map(scored.map((x) => [x.item.property.id, x.prospect]));
  const hidden = useMemo(() => hiddenForApplicant(applicant, available, opts), [applicant, available, opts]);
  // the suggestion is the best 1 to 3, never the whole list (B11)
  const best = bestFew(all, (x) => x.match.strength, 3);
  const atPin = pinned ? available.filter((p) => placeKey(p) === pinned) : [];
  const matches = pinned ? all.filter((x) => placeKey(x.property) === pinned) : showAll ? all : best;
  const first = applicant.full_name.split(' ')[0];
  const fold = useFold('client.suitable');
  return (
    <Card>
      <CardHeader icon="building" title="Suitable properties" sub={available.length ? `${all.length} of ${available.length} available` : undefined} help="suitable"
        open={fold.open} onToggle={fold.toggle}>
        {available.length > 0 && (
          <button type="button" onClick={() => { setMapOpen((v) => !v); setPinned(null); }} aria-pressed={mapOpen}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors ${
              mapOpen ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)] hover:border-[var(--accent)]'}`}>
            <Icon name="pin" size={15} />{mapOpen ? 'Hide the map' : 'Map'}
          </button>
        )}
        {best.length > 0 && (
          <WhatsAppLink to={applicant} properties={best.map((x) => x.property)}
            label={best.length === 1 ? 'Send it on WhatsApp' : `Send the best ${best.length} on WhatsApp`} />
        )}
        {best.length > 0 && <OfficerMatchesLink applicant={applicant} items={best} />}
      </CardHeader>
      {fold.open && (<>
      {mapOpen && available.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-[var(--accent-ink)]">{clientAreas(applicant).label}</span>
            <MapKey client />
          </div>
          <LazyMap properties={available} focus={applicant} selected={pinned} onSelect={setPinned} height={380} />
          {pinned && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-muted)]">
              <span>{atPin.map((p) => p.address_line).join(' · ')}</span>
              {matches.length === 0 && <span className="text-[var(--note-fg)]">Not a fit for {first}.</span>}
              <button type="button" onClick={() => setPinned(null)} className="text-[var(--link)] hover:underline">Show the list again</button>
            </div>
          )}
        </div>
      )}
      {available.length === 0 ? (
        <Empty icon="building" title="No properties saved yet" action={<Link to="/properties" className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"><Icon name="plus" size={16} />Paste a property list</Link>}>
          Paste a supplier's list on Properties and Keel shows here which ones suit this client, best first.
        </Empty>
      ) : pinned && matches.length === 0 ? (
        <div className="pb-2" />
      ) : matches.length === 0 ? (
        <>
          <Empty icon="search" title="Nothing fits yet">
            None of the {available.length} available {available.length === 1 ? 'property fits' : 'properties fit'}. Check their area, household and budget are filled in.
          </Empty>
          <div className="px-5 pb-4"><HiddenNote counts={hidden} overLha={overLha} onOverLha={setOverLha} outside={outside} onOutside={setOutside} /></div>
        </>
      ) : (
        <div className="px-5 pb-3 pt-1">
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
            {matches.map((x) => <SuitableRow key={x.property.id} x={x} applicant={applicant} prospect={prospectOf.get(x.property.id) ?? null} ctx={pctx}
              sent={sent.get(sentKey(applicant.id, x.property.address_line))} />)}
          </ul>
          {!pinned && all.length > best.length && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-[13px] text-[var(--link)] hover:underline">
              {showAll ? 'Show only the best' : `Show all ${all.length} properties`}
            </button>
          )}
          {!pinned && <div className="mt-2"><HiddenNote counts={hidden} overLha={overLha} onOverLha={setOverLha} outside={outside} onOutside={setOutside} /></div>}
        </div>
      )}
      </>)}
    </Card>
  );
}

/** One property for this client: fit, the chance it ends in a placement (tap for why), what it could bring. */
function SuitableRow({ x, applicant, prospect, ctx, sent }: {
  x: RuledPropertyMatch<Property>; applicant: Applicant; prospect: Prospect | null; ctx: ProspectContext; sent: ReturnType<ReturnType<typeof useSentOnWhatsApp>['get']>;
}) {
  const [why, setWhy] = useState(false);
  const { property: p, match: m } = x;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="hidden sm:inline-flex"><FitBadge strength={m.strength} fit={prospect?.fit ?? null} /></span>
      <div className="min-w-0 flex-1 basis-[260px]" title={[m.line, ...m.warnings.map((w) => w.words), ...m.cautions.map((c) => `Check: ${c}`), m.income.words ? `Keel could expect: ${m.income.words}` : null].filter(Boolean).join('\n')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sm:hidden"><FitBadge strength={m.strength} fit={prospect?.fit ?? null} /></span>
          <span className="text-[15px] font-medium text-[var(--ink)]">{p.address_line}</span>
          <LhaChip property={p} />
          <IncomeTag income={m.income} />
          {prospect && <ProspectTag prospect={prospect} open={why} onToggle={() => setWhy((v) => !v)} />}
          <SentTag sent={sent} />
        </div>
        <div className="text-[13px] text-[var(--ink-muted)] sm:truncate">
          {[p.property_type, rentShown(p), billsWords(p)].filter(Boolean).join(' · ')}
          {m.line && <> · <span className="text-[var(--ink)]">{m.line}</span></>}
          {!m.warnings.length && m.cautions[0] && <span className="text-[var(--note-fg)]"> · {brief(m.cautions[0])}</span>}
        </div>
        {m.warnings.length > 0 && <div className="mt-1 flex flex-wrap gap-1"><RuleWarnings warnings={m.warnings} /></div>}
        {why && prospect && <ProspectWhy prospect={prospect} ctx={ctx} />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RequestButton property={p} client={applicant} compact />
        <WhatsAppLink to={applicant} properties={[p]} icon />
      </div>
    </li>
  );
}

// ── Hero ───────────────────────────────────────────────────────────

/** Client header: who they are, where they are, and the quick actions. */
function HeroCard({ applicant }: { applicant: Applicant }) {
  const tier = effectiveTier(applicant);
  const household = [
    applicant.adults ? `${applicant.adults} adult${applicant.adults > 1 ? 's' : ''}` : null,
    applicant.children ? `${applicant.children} child${applicant.children > 1 ? 'ren' : ''}` : null,
  ].filter(Boolean).join(', ');

  const next = applicant.next_call_at;
  const { deals } = useDeals();
  const stuck = stuckDays(applicant, deals);
  const { requests } = useRequests();
  const { providers } = useProviders();
  const latestRequest = requests.find((r) => r.status === 'sent' && r.client_ids.includes(applicant.id)) ?? null;
  const [sharing, setSharing] = useState(false);
  const [icing, setIcing] = useState(false);
  const iced = isIced(applicant);
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ background: tier === 1 ? 'var(--accent)' : tier === 2 ? 'var(--accent-soft)' : 'var(--paper-2)' }} />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={applicant.full_name} size={60} accent={tier === 1} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-[28px] font-bold leading-tight text-[var(--ink)]">{applicant.full_name}</h1>
                <StarButton applicant={applicant} size={20} className="-ml-1" />
                <TierBadge tier={tier} needs={tierNeeds(applicant)} />
                {isUrgent(applicant) && <UrgentChip reason={URGENCY_LABEL[applicant.urgency ?? '']} showReason />}
                <StageBadge stage={applicant.stage} />
                {isFresh(applicant) && <NewBadge />}
                {iced && <IceBadge until={applicant.iced_until ? shortDate(applicant.iced_until) : null} />}
                {stuck !== null && <StuckChip days={stuck} />}
                {latestRequest && <RequestChip request={latestRequest} providers={providers} />}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-[var(--ink-muted)]">
                {applicant.phone && <a href={`tel:${applicant.phone}`} className="inline-flex items-center gap-1.5 font-mono hover:text-[var(--link)]"><Icon name="phone" size={15} />{applicant.phone}</a>}
                {applicant.email && <a href={`mailto:${applicant.email}`} className="inline-flex items-center gap-1.5 hover:text-[var(--link)]"><Icon name="inbox" size={15} />{applicant.email}</a>}
                {(applicant.council || applicant.referring_borough) && <span className="inline-flex items-center gap-1.5"><Icon name="pin" size={15} />{applicant.council || applicant.referring_borough}</span>}
                <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={15} />{receivedWords(applicant)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AssignPicker applicant={applicant} />
            <Button onClick={() => setSharing((v) => !v)} aria-expanded={sharing} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="share" size={14} />Share</Button>
            {!iced && isActive(applicant) && (
              <Button onClick={() => setIcing((v) => !v)} aria-expanded={icing} className="min-h-0 px-3 py-2 text-[13px]"><Icon name="clock" size={14} />Put on ice</Button>
            )}
            <Button onClick={() => { openCard('client.details'); setTimeout(() => document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }}
              className="min-h-0 px-3 py-2 text-[13px]"><Icon name="pencil" size={14} />Edit details</Button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Meta icon="users" label="Household" value={household || 'Not known'} />
          <Meta icon="flag" label="Budget" value={applicant.budget_pcm ? money(applicant.budget_pcm) : 'Not given'} mono />
          <Meta icon="calendar" label="Next step" wide value={next ? `${applicant.next_step ? `${applicant.next_step}, ` : ''}${dayWord(next)}` : 'Not set'}
            strong={!!next && next <= todayIso()} />
        </dl>

        {iced && <IceBand applicant={applicant} />}
        {icing && !iced && <IcePanel applicant={applicant} onClose={() => setIcing(false)} />}
        {sharing && <ShareClient applicant={applicant} onClose={() => setSharing(false)} />}

      </div>
    </Card>
  );
}

function Meta({ icon, label, value, mono, strong, wide }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; mono?: boolean; strong?: boolean; wide?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <Icon name={icon} size={16} className="mt-0.5 text-[var(--ink-muted)]" />
      <div className="min-w-0">
        <dt className="text-[12px] text-[var(--ink-muted)]">{label}</dt>
        <dd className={`m-0 truncate text-[15px] ${strong ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--ink)]'} ${mono ? 'font-mono' : ''}`}>{value}</dd>
      </div>
    </div>
  );
}

/** Who is looking after this client. */
function AssignPicker({ applicant }: { applicant: Applicant }) {
  const people = usePeople();
  const assign = useAssign();
  const { toast } = useToast();
  if (!people.ready || people.members.length === 0) return null;
  const change = (userId: string | null) => {
    const name = people.nameOf(userId);
    assign.mutate({ applicant, userId, name }, {
      onSuccess: () => toast(userId ? `Assigned to ${userId === people.meId ? 'you' : name}` : 'No longer assigned', 'success'),
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] py-1 pl-2.5 pr-1.5">
      <Icon name="user" size={14} className="text-[var(--ink-muted)]" />
      <select value={applicant.assigned_to ?? ''} onChange={(e) => change(e.target.value || null)} disabled={assign.isPending}
        aria-label="Assigned to" className="bg-transparent text-[13px] text-[var(--ink)] outline-none">
        <option value="">Not assigned</option>
        {people.members.map((m) => (
          <option key={m.id} value={m.id}>{people.nameOf(m.id)}{m.id === people.meId ? ' (you)' : ''}</option>
        ))}
      </select>
      <Help topic="assign" />
    </span>
  );
}

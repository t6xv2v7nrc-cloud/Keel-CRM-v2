import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Help, Icon, NewBadge, PageHeader, PageSkeleton, TierBadge, UrgentChip, useShowMore, useToast } from '../../components/ui';
import {
  NeedsDatabaseUpdate, PROPERTY_STATUS_LABEL, sentKey, useAddProperties, useApplicants, useDeleteProperties, useProperties,
  useDeals, useMatchOptions, useProspectContext, useProviders, useRequests, useSentOnWhatsApp, useSetPropertyProvider, useSetPropertyStatus,
} from '../../lib/hooks';
import { tierNeeds } from '../../lib/clientProfile';
import { isLocalProperty, localProperties } from '../../lib/localProperties';
import type { NewProperty, SavedProperty, SentOnWhatsApp } from '../../lib/hooks';
import type { Applicant, Deal, Property } from '../../lib/types';
import { parsePropertyList } from '../../lib/parseProperties';
import type { ParsedProperty } from '../../lib/parseProperties';
import { bestFew, brief } from '../../lib/propertyMatch';
import type { Strength } from '../../lib/propertyMatch';
import { matchesForProperty } from '../../lib/matchRules';
import type { RuledMatch } from '../../lib/matchRules';
import { FitBadge, IncomeTag, ProspectTag, ProspectWhy, RuleWarnings } from './MatchBits';
import { chanceWords, prospectFor, ranked } from '../../lib/prospects';
import type { Prospect, ProspectContext } from '../../lib/prospects';
import { LandlordShareLink } from './ShareLinks';
import { BOROUGHS } from '../../lib/london';
import { activeSettings } from '../../lib/settings';
import { lhaCheck, rentShown } from '../../lib/lha';
import { LhaChip, LhaLine } from './Lha';
import { SentTag, WhatsAppLink } from './WhatsApp';
import { MapView } from '../map/MapView';
import { DealChip } from '../progress/Progress';
import { RequestButton } from '../requests/RequestSheet';
import { providerFor } from '../../lib/requests';
import { effectiveTier, isFresh, isStaleReferral, isUrgent, receivedAt, referralAgeDays } from '../../lib/search';
import { tierLabel } from '../../lib/tiering';
import { dayWords, money, shortDate } from '../../lib/format';
import { bedsOfType, TYPE_OPTIONS } from '../../lib/propertyEdit';
import { EditProperty } from './EditProperty';
import { FlagChip, PropertyChecks } from './Checks';
import { checksFor } from '../../lib/propertyChecks';
import { Tip } from '../guide/Guide';

const normAddr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const STRENGTH: Record<Strength, { label: string; bg: string; fg: string }> = {
  strong: { label: 'Strong', bg: 'var(--strong-bg)', fg: 'var(--strong-fg)' },
  good: { label: 'Good', bg: 'var(--good-bg)', fg: 'var(--good-fg)' },
  possible: { label: 'Possible', bg: 'var(--possible-bg)', fg: 'var(--possible-fg)' },
};

const isAvailable = (p: Property) => p.status === 'void' || p.status === 'under_offer';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A property saved on this device, ready to move to the account (keeps its status and save time). */
const toSaved = (p: Property): SavedProperty => ({
  address_line: p.address_line, postcode: p.postcode, area: p.area, borough: p.borough, property_type: p.property_type,
  bedrooms: p.bedrooms, rent_pcm: p.rent_pcm, rent_text: p.rent_text, bills: p.bills, furnished: p.furnished,
  available_from: p.available_from, notes: p.notes, source_tag: p.source_tag, status: p.status, created_at: p.created_at,
});

/** Properties (§8.4): paste a stock list, see every property matched to clients. */
export function PropertiesPage() {
  const { data: properties = [], isLoading } = useProperties();
  const { data: applicants = [] } = useApplicants();
  const setStatus = useSetPropertyStatus();
  const del = useDeleteProperties();
  const add = useAddProperties();
  const sent = useSentOnWhatsApp();
  const { deals } = useDeals();
  const { requests } = useRequests();
  const names = useMemo(() => new Map(applicants.map((a) => [a.id, a.full_name])), [applicants]);
  // each property's deals, by id (or address for properties only on this device)
  const dealsOf = useMemo(() => {
    const m = new Map<string, Deal[]>();
    for (const d of deals) {
      const k = d.property_id ?? `addr:${d.address}`;
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return (p: Property) => [...(m.get(p.id) ?? []), ...(m.get(`addr:${p.address_line}`) ?? [])];
  }, [deals]);
  const { toast } = useToast();
  const [needsUpdate, setNeedsUpdate] = useState(false);

  // Lists saved before syncing existed live only in this browser: move them to the account once.
  const deviceOnly = properties.filter((p) => isLocalProperty(p.id));
  const moveToAccount = async (ps: Property[]) => {
    try {
      await add.mutateAsync({ rows: ps.map(toSaved), source: '' });
      localProperties.remove(ps.map((p) => p.id));
      setNeedsUpdate(false);
      toast(`Moved ${plural(ps.length, 'property', 'properties')} from this device to your account. They now show on your phone too.`, 'success');
    } catch (e) {
      if (e instanceof NeedsDatabaseUpdate) setNeedsUpdate(true);
      else toast(`Could not move saved properties to your account: ${(e as Error).message}`, 'danger');
    }
  };
  const moveTried = useRef(false);
  useEffect(() => {
    if (moveTried.current || isLoading || deviceOnly.length === 0) return;
    moveTried.current = true;
    void moveToAccount(deviceOnly);
  });

  const [pasteOpen, setPasteOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [status, setStatusFilter] = useState<'available' | Property['status'] | 'all'>('available');
  // on a phone the filters sit behind one button, so the list starts on the first screen
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [borough, setBorough] = useState('all');
  const [q, setQ] = useState('');
  const [lhaFilter, setLhaFilter] = useState<'any' | 'within' | 'over' | 'unknown'>('any');
  const [providerFilter, setProviderFilter] = useState<string>('any'); // 'any', 'none' or a provider id
  const { providers, ready: providersReady } = useProviders();
  const setProvider = useSetPropertyProvider();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // List or map; remembered on this device
  const [view, setViewState] = useState<'list' | 'map'>(() => {
    try { return localStorage.getItem('keel-properties-view') === 'map' ? 'map' : 'list'; } catch { return 'list'; }
  });
  const setView = (v: 'list' | 'map') => { setViewState(v); try { localStorage.setItem('keel-properties-view', v); } catch { /* fine */ } };
  // Cards open or folded to a line or two; the choice for all is remembered on this device, one card's for now
  const [foldAll, setFoldAllState] = useState(() => {
    try { return localStorage.getItem('keel-properties-folded') === '1'; } catch { return false; }
  });
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const setFoldAll = (v: boolean) => { setFoldAllState(v); setFlipped(new Set()); try { localStorage.setItem('keel-properties-folded', v ? '1' : '0'); } catch { /* fine */ } };
  const flip = (id: string) => setFlipped((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const matchOptions = useMatchOptions();
  const matches = useMemo(
    () => new Map(properties.map((p) => [p.id, isAvailable(p) ? matchesForProperty(p, applicants, matchOptions) : []])),
    [properties, applicants, matchOptions],
  );

  // each match's fit, chance of placing and expected money; best bets first
  const pctx = useProspectContext();
  const scored = useMemo(
    () => new Map(properties.map((p) => [p.id, ranked(matches.get(p.id) ?? [], (m) => m, (m) => prospectFor(m, p, pctx))] as const)),
    [properties, matches, pctx],
  );
  // a property marked not ready cannot go out yet, so it is nobody's best bet today
  const notReady = useMemo(() => new Set(properties.filter((p) => p.not_ready_at).map((p) => p.id)), [properties]);
  const bestBet = (id: string) => (notReady.has(id) ? null : scored.get(id)?.[0]?.prospect ?? null);
  // the order of the list, remembered on this device: most money likely first, as standard
  const [order, setOrderState] = useState<'money' | 'clients' | 'newest'>(() => {
    try { const v = localStorage.getItem('keel-properties-order'); return v === 'clients' || v === 'newest' ? v : 'money'; } catch { return 'money'; }
  });
  const setOrder = (v: typeof order) => { setOrderState(v); try { localStorage.setItem('keel-properties-order', v); } catch { /* fine */ } };

  const counts = {
    available: properties.filter((p) => p.status === 'void').length,
    under_offer: properties.filter((p) => p.status === 'under_offer').length,
    let: properties.filter((p) => p.status === 'let').length,
  };
  const totalMatches = [...matches.values()].reduce((s, m) => s + m.length, 0);
  const boroughs = [...new Set(properties.map((p) => p.borough).filter((b): b is string => Boolean(b)))].sort();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return properties
      .filter((p) => status === 'all' || (status === 'available' ? isAvailable(p) : p.status === status))
      .filter((p) => borough === 'all' || p.borough === borough)
      .filter((p) => {
        if (lhaFilter === 'any') return true;
        const c = lhaCheck(p);
        if (lhaFilter === 'unknown') return !c || c.status === 'unknown';
        if (!c || c.status === 'unknown') return false;
        return lhaFilter === 'over' ? c.status === 'over' : c.status !== 'over';
      })
      .filter((p) => {
        if (providerFilter === 'any') return true;
        const who = providerFor(p, providers);
        return providerFilter === 'none' ? !who : who?.id === providerFilter;
      })
      .filter((p) => !needle || [p.address_line, p.area, p.borough, p.postcode, p.property_type, p.source_tag]
        .some((x) => x?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(justAdded.has(b.id)) - Number(justAdded.has(a.id))
        || (order === 'money' ? (bestBet(b.id)?.expected ?? 0) - (bestBet(a.id)?.expected ?? 0) || (bestBet(b.id)?.chance ?? 0) - (bestBet(a.id)?.chance ?? 0) : 0)
        || (order !== 'newest' ? (matches.get(b.id)?.length ?? 0) - (matches.get(a.id)?.length ?? 0) : 0)
        || b.created_at.localeCompare(a.created_at));
  }, [properties, status, borough, q, justAdded, matches, lhaFilter, providerFilter, providers, order, scored]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = [status !== 'available', borough !== 'all', lhaFilter !== 'any', providerFilter !== 'any'].filter(Boolean).length;
  // the first cards straight away, the rest as you scroll
  const more = useShowMore(rows.length, 12, 20);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedRows = rows.filter((p) => selected.has(p.id));

  const bulkDelete = () => {
    if (!window.confirm(`Delete ${selectedRows.length} ${selectedRows.length === 1 ? 'property' : 'properties'}? This cannot be undone.`)) return;
    del.mutate(selectedRows.map((p) => p.id), {
      onSuccess: () => { toast(`Deleted ${selectedRows.length}`, 'success'); setSelected(new Set()); },
      onError: (e) => toast(`Delete failed: ${(e as Error).message}`, 'danger'),
    });
  };
  const bulkLet = async () => {
    for (const p of selectedRows) if (p.status !== 'let') await setStatus.mutateAsync({ p, status: 'let' });
    toast(`Marked ${selectedRows.length} as let`, 'success');
    setSelected(new Set());
  };

  if (isLoading) return <PageSkeleton />;

  const showPaste = pasteOpen || properties.length === 0;
  const card = (p: Property) => (
    <PropertyCard
      p={p}
      scored={scored.get(p.id) ?? []}
      ctx={pctx}
      deals={dealsOf(p)}
      names={names}
      openRequests={requests.filter((r) => r.status === 'sent' && (r.property_id === p.id || r.property_address === p.address_line)).length}
      sent={sent}
      isNew={justAdded.has(p.id)}
      folded={!justAdded.has(p.id) && foldAll !== flipped.has(p.id)}
      onFold={() => flip(p.id)}
      selected={selected.has(p.id)}
      onToggle={() => toggle(p.id)}
      onStatus={(s) => setStatus.mutate({ p, status: s }, { onSuccess: () => toast(`${PROPERTY_STATUS_LABEL[s]}: ${p.address_line}`, 'success') })}
      onDelete={() => {
        if (!window.confirm(`Delete ${p.address_line}? This cannot be undone.`)) return;
        del.mutate([p.id], { onSuccess: () => toast('Property deleted', 'success') });
      }}
    />
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-4 pb-24 sm:p-6 sm:pb-24">
      <PageHeader icon="building" title="Properties" help="properties" sub={<>
        {counts.available} available · {counts.under_offer} under offer · {counts.let} let
        {totalMatches > 0 && <> · <strong className="text-[var(--ink)]">{totalMatches}</strong> client matches <span className="ml-0.5 inline-flex align-middle"><Help topic="matchStrength" /></span></>}
      </>}>
          {counts.available > 0 && (
            <Link to="/mailer?tab=all" title="Every property ready to send, by area, as one email, one WhatsApp or a spreadsheet (the Mailer)"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-2 text-[15px] font-medium text-[var(--ink)] transition-all duration-150 hover:border-[var(--accent)]">
              <Icon name="send" size={16} />Send all properties
            </Link>
          )}
          {properties.length > 0 && (
            <Button onClick={() => setListsOpen((v) => !v)}>{listsOpen ? 'Hide saved lists' : 'Saved lists'}</Button>
          )}
          {!showPaste && <Button variant="primary" onClick={() => setPasteOpen(true)}><Icon name="plus" size={16} />Paste properties</Button>}
      </PageHeader>
      <Tip id="properties" />

      {needsUpdate && (
        <div role="alert" className="rounded-md border border-[var(--line-strong)] bg-[var(--note-bg)] p-4 text-[15px] text-[var(--note-fg)]">
          <strong>Lists cannot sync to your phone yet.</strong> The database needs a one-off update: in Supabase, open the SQL Editor,
          paste in <code className="font-mono text-[13px]">supabase/migrations/0004_properties_import.sql</code> and click Run. Then reload this page.
          {deviceOnly.length > 0 && <> Your {plural(deviceOnly.length, 'property', 'properties')} saved on this device will move across then.</>}
        </div>
      )}

      {listsOpen && (
        <SavedLists properties={properties} onClose={() => setListsOpen(false)}
          onMove={(ps) => void moveToAccount(ps)} moving={add.isPending} />
      )}

      {showPaste && (
        <PasteImport
          existing={properties}
          applicants={applicants}
          canClose={properties.length > 0}
          onClose={() => setPasteOpen(false)}
          onNeedsUpdate={() => setNeedsUpdate(true)}
          onAdded={(added, where) => {
            setJustAdded(new Set(added.map((p) => p.id)));
            setPasteOpen(false);
            setStatusFilter('available');
            const found = added.reduce((s, p) => s + matchesForProperty(p, applicants).length, 0);
            toast(`Saved ${plural(added.length, 'property', 'properties')} ${where === 'account' ? 'to your account, so they show on your phone too' : 'on this device only'} · ${plural(found, 'client match', 'client matches')}`, 'success');
          }}
        />
      )}

      {properties.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md border px-3 text-[14px] font-medium sm:hidden ${filtersOpen || activeFilters ? 'border-[var(--accent)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)]'} bg-[var(--surface)]`}>
              <Icon name="sliders" size={15} />Filters{activeFilters ? ` (${activeFilters})` : ''}
            </button>
            <div className={`${filtersOpen ? 'flex' : 'hidden'} w-full flex-wrap items-end gap-3 sm:contents`}>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Show</span>
              <select value={status} onChange={(e) => setStatusFilter(e.target.value as typeof status)}
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
                <option value="available">Available and under offer ({counts.available + counts.under_offer})</option>
                <option value="void">Available ({counts.available})</option>
                <option value="under_offer">Under offer ({counts.under_offer})</option>
                <option value="let">Let ({counts.let})</option>
                <option value="all">All ({properties.length})</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Borough</span>
              <select value={borough} onChange={(e) => setBorough(e.target.value)}
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
                <option value="all">All boroughs</option>
                {boroughs.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">LHA <Help topic="lha" /></span>
              <select value={lhaFilter} onChange={(e) => setLhaFilter(e.target.value as typeof lhaFilter)}
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
                <option value="any">Any rent</option>
                <option value="within">At or under LHA</option>
                <option value="over">Over LHA</option>
                <option value="unknown">LHA not worked out</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">Order <Help topic="prospects" /></span>
              <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)}
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
                <option value="money">Most money likely</option>
                <option value="clients">Most clients</option>
                <option value="newest">Newest</option>
              </select>
            </label>
            {providersReady && providers.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-muted)]">Provider <Help topic="providers" /></span>
                <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
                  className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]">
                  <option value="any">Any provider</option>
                  {providers.map((pr) => <option key={pr.id} value={pr.id}>{pr.tag}{pr.name !== pr.tag ? ` · ${pr.name}` : ''}</option>)}
                  <option value="none">No provider set</option>
                </select>
              </label>
            )}
            </div>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address, area, postcode, source"
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]" />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">View</span>
              <div className="flex min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-0.5" role="group" aria-label="View">
                {([['list', 'list', 'List'], ['map', 'pin', 'Map']] as const).map(([v, icon, label]) => (
                  <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                    className={`inline-flex items-center gap-1.5 rounded px-3 text-[13px] font-medium transition-colors ${
                      view === v ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                    <Icon name={icon} size={14} />{label}
                  </button>
                ))}
              </div>
            </div>
            {view === 'list' && (
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">Cards</span>
                <div className="flex min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-0.5" role="group" aria-label="Cards">
                  {([[false, 'Open'], [true, 'Folded']] as const).map(([v, label]) => (
                    <button key={label} type="button" onClick={() => setFoldAll(v)} aria-pressed={foldAll === v}
                      className={`inline-flex items-center gap-1.5 rounded px-3 text-[13px] font-medium transition-colors ${
                        foldAll === v ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-2">
              <span className="text-[15px] text-[var(--ink)]">{selectedRows.length} selected</span>
              {providersReady && (
                <select value="" aria-label="Set the provider for the selected properties"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const pr = v === 'none' ? null : providers.find((x) => x.id === v) ?? null;
                    setProvider.mutate({ properties: selectedRows, provider: pr }, {
                      onSuccess: () => toast(`${selectedRows.length} ${selectedRows.length === 1 ? 'property' : 'properties'} now ${pr ? `from ${pr.tag}` : 'with no provider'}`, 'success'),
                      onError: (err) => toast((err as Error).message, 'danger'),
                    });
                  }}
                  className="h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]">
                  <option value="">Set provider…</option>
                  {providers.filter((x) => x.active).map((pr) => <option key={pr.id} value={pr.id}>{pr.tag}{pr.name !== pr.tag ? ` · ${pr.name}` : ''}</option>)}
                  <option value="none">No provider</option>
                </select>
              )}
              <WhatsAppLink properties={selectedRows} label={`Share ${selectedRows.length === 1 ? 'it' : `all ${selectedRows.length}`} on WhatsApp`} />
              <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={bulkLet}>Mark as let</Button>
              <Button variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={bulkDelete}>Delete</Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-[13px] text-[var(--link)] hover:underline">Clear selection</button>
            </div>
          )}

          {view === 'map' ? (
            <MapView properties={rows} matches={matches} applicants={applicants} renderCard={card} />
          ) : (
            <div className="keel-stagger flex flex-col gap-4">
              {rows.slice(0, more.limit).map((p) => <div key={p.id}>{card(p)}</div>)}
              {more.more && (
                <p ref={more.ref} className="m-0 py-2 text-center text-[13px] text-[var(--ink-muted)]">
                  Showing {more.limit} of {rows.length}.{' '}
                  <button type="button" onClick={more.showAll} className="font-medium text-[var(--link)] hover:underline">Show all {rows.length}</button>
                </p>
              )}
              {rows.length === 0 && <p className="m-0 text-[15px] text-[var(--ink-muted)]">No properties in this view.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Saved lists and purging ────────────────────────────────────────


function SavedLists({ properties, onClose, onMove, moving }: {
  properties: Property[]; onClose: () => void; onMove: (ps: Property[]) => void; moving: boolean;
}) {
  const { toast } = useToast();
  const del = useDeleteProperties();
  // one list opened to pick single properties out of it
  const [openList, setOpenList] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const pick = (id: string, on: boolean) => setPicked((x) => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; });
  // Each paste is saved in one go, so a list is the properties sharing a save time and source.
  const lists = useMemo(() => {
    const by = new Map<string, Property[]>();
    for (const p of properties) {
      const key = `${p.created_at}|${p.source_tag ?? ''}|${isLocalProperty(p.id)}`;
      by.set(key, [...(by.get(key) ?? []), p]);
    }
    return [...by.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
  }, [properties]);
  const purgeDays = activeSettings().purgeAfterDays;
  const cutoff = new Date(Date.now() - purgeDays * 86_400_000).toISOString();
  const old = properties.filter((p) => p.created_at < cutoff);
  const done = properties.filter((p) => p.status === 'let' || p.status === 'withdrawn');

  const purge = (ps: Property[], what: string, after?: () => void, verb: 'Purge' | 'Remove' = 'Purge') => {
    if (ps.length === 0) return;
    if (!window.confirm(`${verb} ${what} (${plural(ps.length, 'property', 'properties')})? This removes them from every device and cannot be undone.`)) return;
    del.mutate(ps.map((p) => p.id), {
      onSuccess: () => { toast(`${verb === 'Purge' ? 'Purged' : 'Removed'} ${plural(ps.length, 'property', 'properties')}`, 'success'); after?.(); },
      onError: (e) => toast(`Purge failed: ${(e as Error).message}`, 'danger'),
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-[18px] font-semibold text-[var(--ink)]">Saved lists <Help topic="savedLists" /></h2>
          <p className="m-0 mt-1 max-w-[720px] text-[15px] text-[var(--ink-muted)]">
            Lists are saved to your account, so they show on your phone and any other device you sign in on. Purge them when they go out of date.
          </p>
        </div>
        <button onClick={onClose} className="text-[15px] text-[var(--link)] hover:underline">Close</button>
      </div>

      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)] p-0">
        {lists.map((ps) => {
          const available = ps.filter((p) => p.status === 'void' || p.status === 'under_offer').length;
          const onDevice = ps.filter((p) => isLocalProperty(p.id));
          const key = `${ps[0].created_at}|${ps[0].source_tag ?? ''}|${onDevice.length > 0}`;
          const isOpen = openList === key;
          const chosen = ps.filter((p) => picked.has(p.id));
          const allOn = chosen.length === ps.length;
          return (
            <li key={key} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-[var(--ink)]">
                    {ps[0].source_tag ? `From ${ps[0].source_tag}` : 'List'}, saved {shortDate(ps[0].created_at)}
                    {onDevice.length > 0 && <DeviceOnlyTag />}
                  </div>
                  <div className="text-[13px] text-[var(--ink-muted)]">
                    {ps.length} {ps.length === 1 ? 'property' : 'properties'} · {available} still available
                  </div>
                </div>
                {onDevice.length > 0 && (
                  <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={moving} onClick={() => onMove(onDevice)}>
                    Move to your account
                  </Button>
                )}
                <Button className="min-h-0 px-3 py-1.5 text-[13px]" aria-expanded={isOpen}
                  onClick={() => { setOpenList(isOpen ? null : key); setPicked(new Set()); }}>
                  <Icon name="list" size={14} />{isOpen ? 'Done choosing' : 'Choose properties'}
                </Button>
                <Button busy={del.isPending} variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={del.isPending}
                  onClick={() => purge(ps, ps[0].source_tag ? `the list from ${ps[0].source_tag}` : 'this list')}>
                  Purge this list
                </Button>
              </div>
              {isOpen && (
                <div className="keel-rise flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
                  <label className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
                    <input type="checkbox" checked={allOn} onChange={(e) => setPicked(e.target.checked ? new Set(ps.map((p) => p.id)) : new Set())}
                      className="h-4 w-4 accent-[var(--accent)]" />
                    Tick all {ps.length}
                  </label>
                  <ul className="m-0 flex max-h-[360px] list-none flex-col divide-y divide-[var(--line)] overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--surface)] p-0">
                    {ps.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-[14px] hover:bg-[var(--surface-2)]">
                          <input type="checkbox" checked={picked.has(p.id)} onChange={(e) => pick(p.id, e.target.checked)} className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--accent)]" />
                          <span className="min-w-0">
                            <span className="block break-words text-[var(--ink)]">{p.address_line}</span>
                            <span className="block text-[12px] text-[var(--ink-muted)]">
                              {[p.property_type, rentShown(p), PROPERTY_STATUS_LABEL[p.status]].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button busy={del.isPending} variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={!chosen.length || del.isPending}
                      onClick={() => purge(chosen, chosen.length === 1 ? chosen[0].address_line : 'the ticked properties', () => setPicked(new Set()), 'Remove')}>
                      <Icon name="trash" size={14} />{chosen.length ? `Remove ${plural(chosen.length, 'property', 'properties')}` : 'Tick the ones to remove'}
                    </Button>
                    <span className="text-[12px] text-[var(--ink-muted)]">The rest of the list stays.</span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={done.length === 0} onClick={() => purge(done, 'let and withdrawn properties')}>
          Purge let and withdrawn ({done.length})
        </Button>
        <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={old.length === 0} onClick={() => purge(old, `properties saved over ${purgeDays} days ago`)}>
          Purge saved over {purgeDays} days ago ({old.length})
        </Button>
        <Button variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={() => purge(properties, 'every saved property')}>
          Purge everything ({properties.length})
        </Button>
      </div>
    </Card>
  );
}

// ── Paste + preview ────────────────────────────────────────────────

type Draft = ParsedProperty & { key: string; include: boolean; duplicate: boolean };

function PasteImport({ existing, applicants, canClose, onClose, onAdded, onNeedsUpdate }: {
  existing: Property[];
  applicants: Applicant[];
  canClose: boolean;
  onClose: () => void;
  onAdded: (added: Property[], where: 'account' | 'device') => void;
  onNeedsUpdate: () => void;
}) {
  const { toast } = useToast();
  const add = useAddProperties();
  const [blocked, setBlocked] = useState(false); // the database is not ready for lists yet
  const [text, setText] = useState('');
  const [source, setSource] = useState('');
  const { providers, ready: providersReady } = useProviders();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [shared, setShared] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);

  const read = () => {
    const r = parsePropertyList(text);
    const have = new Set(existing.map((p) => normAddr(p.address_line)));
    setDrafts(r.properties.map((p, i) => {
      const duplicate = have.has(normAddr(p.address_line));
      return { ...p, key: `${i}-${p.address_line}`, include: !duplicate, duplicate };
    }));
    setShared(r.sharedNotes);
    setSkipped(r.skipped);
  };

  const edit = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const chosen = (drafts ?? []).filter((d) => d.include);

  const rows = (): NewProperty[] => chosen.map((d) => ({
    address_line: d.address_line, postcode: d.postcode, area: d.area, borough: d.borough,
    property_type: d.property_type, bedrooms: d.bedrooms, rent_pcm: d.rent_pcm, rent_text: d.rent_text,
    bills: d.bills, furnished: d.furnished, available_from: d.available_from, notes: d.notes,
    source_tag: source.trim() || null,
  }));
  const save = () => add.mutate({ rows: rows(), source: source.trim() }, {
    onSuccess: (added) => { setText(''); setDrafts(null); onAdded(added, 'account'); },
    onError: (e) => {
      if (e instanceof NeedsDatabaseUpdate) { setBlocked(true); onNeedsUpdate(); }
      else toast(`Could not save the list: ${(e as Error).message}`, 'danger');
    },
  });
  const saveOnDevice = () => {
    const { added, saved } = localProperties.add(rows());
    if (!saved) toast('This browser would not save the list, so it will be gone when you close the tab. Check you are not in a private window.', 'danger');
    setText(''); setDrafts(null); onAdded(added, 'device');
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-[18px] font-semibold text-[var(--ink)]">Paste your available properties <Help topic="properties" /></h2>
          <p className="m-0 mt-1 max-w-[720px] text-[15px] text-[var(--ink-muted)]">
            One property per line or per block, or rows copied from a spreadsheet. Notes that apply to every property,
            like "They are all en-suite rooms" or "Rent is 1-bed LHA", are applied to each one. Lines marked let,
            taken or under offer are skipped. Lists are saved to your account, so they show on your phone too.
          </p>
        </div>
        {canClose && <button onClick={onClose} className="text-[15px] text-[var(--link)] hover:underline">Close</button>}
      </div>

      {!drafts && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={'Flat 2, 14 Bruce Grove, Tottenham, N17 6RA - Studio - £950 pcm bills inc\n45 Ballards Lane, North Finchley, N12 0DA - 1 bed flat - £1,300 pcm - available now\nUnits 1 & 2, 10 Kings Road, Edmonton N18 2AB - en-suite rooms - 1-bed LHA'}
            className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 font-mono text-[13px] text-[var(--ink)] outline-none focus:border-[var(--hull)]"
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Who is this list from? (optional)</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. BP, SR, ZUB" list="keel-provider-tags"
                className="min-h-[40px] w-[260px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]" />
              <datalist id="keel-provider-tags">{providers.filter((x) => x.active).map((pr) => <option key={pr.id} value={pr.tag}>{pr.name}</option>)}</datalist>
              {source.trim() && providersReady && (
                <span className="text-[12px] text-[var(--ink-muted)]">
                  {providerFor({ source_tag: source }, providers) ? `Properties will be from ${providerFor({ source_tag: source }, providers)!.tag} (${providerFor({ source_tag: source }, providers)!.name})` : 'No provider with this tag yet: add one in Settings, Providers'}
                </span>
              )}
            </label>
            <Button variant="primary" onClick={read} disabled={!text.trim()}>Read list and find matches</Button>
          </div>
        </>
      )}

      {drafts && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
            <span className="text-[var(--ink)]">Found <strong>{drafts.length}</strong> {drafts.length === 1 ? 'property' : 'properties'}</span>
            {drafts.some((d) => d.duplicate) && <span className="text-[var(--ink-muted)]">{drafts.filter((d) => d.duplicate).length} already on your list (unticked)</span>}
            {skipped.length > 0 && <span className="text-[var(--ink-muted)]" title={skipped.join('\n')}>{skipped.length} skipped as let or taken</span>}
            <button onClick={() => setDrafts(null)} className="ml-auto text-[15px] text-[var(--link)] hover:underline">Back to edit the text</button>
          </div>

          {shared.length > 0 && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--paper)] p-3 text-[13px] text-[var(--ink-muted)]">
              <strong className="text-[var(--ink)]">Applied to every property: </strong>{shared.join(' · ')}
            </div>
          )}

          {drafts.length === 0 && (
            <p className="m-0 text-[15px] text-[var(--ink-muted)]">
              No properties found. Each property needs an address with a postcode or street, or a type and rent with an area.
            </p>
          )}

          <div className="flex flex-col divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
            {drafts.map((d) => {
              const top = matchesForProperty(d, applicants);
              return (
                <div key={d.key} className={`flex flex-col gap-2 p-3 ${d.include ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="checkbox" checked={d.include} onChange={(e) => edit(d.key, { include: e.target.checked })}
                      aria-label={`Include ${d.address_line}`} className="h-5 w-5 accent-[var(--hull)]" />
                    <input value={d.address_line} onChange={(e) => edit(d.key, { address_line: e.target.value })}
                      aria-label="Address"
                      className="min-h-[36px] min-w-[260px] flex-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
                    {d.duplicate && <span className="rounded bg-[var(--note-bg)] px-2 py-0.5 text-[13px] text-[var(--note-fg)]">Already on your list</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-8 text-[13px]">
                    <select value={d.property_type ?? ''} aria-label="Type"
                      onChange={(e) => edit(d.key, { property_type: e.target.value || null, bedrooms: e.target.value ? bedsOfType(e.target.value) : null })}
                      className="min-h-[32px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]">
                      <option value="">Type not found</option>
                      {[...new Set([...(d.property_type ? [d.property_type] : []), ...TYPE_OPTIONS])].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      value={d.rent_text ?? ''}
                      aria-label="Rent"
                      placeholder="Rent, e.g. £950 pcm or 1-Bed LHA"
                      onChange={(e) => {
                        const v = e.target.value;
                        const pounds = /£?\s?([\d,]+)/.exec(v);
                        const weekly = /\bp\/?w\b|week/i.test(v);
                        const pcm = /lha/i.test(v) || !pounds ? null : Math.round(Number(pounds[1].replace(/,/g, '')) * (weekly ? 52 / 12 : 1));
                        edit(d.key, { rent_text: v || null, rent_pcm: pcm });
                      }}
                      className="min-h-[32px] w-[190px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 font-mono text-[13px] text-[var(--ink)]"
                    />
                    <LhaChip property={d} />
                    <select value={d.borough ?? ''} aria-label="Borough" onChange={(e) => edit(d.key, { borough: e.target.value || null })}
                      className="min-h-[32px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]">
                      <option value="">Borough not found</option>
                      {BOROUGHS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                    {d.area && <span className="text-[var(--ink-muted)]">{d.area}</span>}
                    {d.bills && <span className="text-[var(--ink-muted)]">Bills: {d.bills}</span>}
                    {d.furnished && <span className="text-[var(--ink-muted)]">{d.furnished}</span>}
                    {d.available_from && <span className="text-[var(--ink-muted)]">From {shortDate(d.available_from)}</span>}
                    {d.warnings.map((w) => (
                      <span key={w} className="rounded bg-[var(--note-bg)] px-1.5 py-0.5 text-[var(--note-fg)]">{w}</span>
                    ))}
                  </div>
                  <div className="pl-8 text-[13px]">
                    {top.length === 0 ? (
                      <span className="text-[var(--ink-muted)]">No matching clients yet</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--ink)]">
                        {top.slice(0, 3).map((m) => (
                          <span key={m.applicant.id} className="inline-flex items-center gap-1.5">
                            <StrengthBadge s={m.strength} /> {m.applicant.full_name}
                          </span>
                        ))}
                        {top.length > 3 && <span className="text-[var(--ink-muted)]">and {top.length - 3} more</span>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stays on screen while scrolling a long list, so Save is always in reach */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-lg border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
            <span className="mr-auto text-[15px] text-[var(--ink)]">
              {blocked ? <span className="text-[var(--danger)]">Cannot sync yet: see the note at the top of the page.</span>
                : <><strong>{chosen.length}</strong> of {plural(drafts.length, 'property', 'properties')} ticked</>}
            </span>
            <Button onClick={() => setDrafts(null)}>Back</Button>
            {blocked && <Button onClick={saveOnDevice} disabled={chosen.length === 0}>Save on this device for now</Button>}
            <Button busy={add.isPending} variant="primary" onClick={save} disabled={chosen.length === 0 || add.isPending}>
              {add.isPending ? 'Saving…' : `Save ${plural(chosen.length, 'property', 'properties')}`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Property card with its matches ────────────────────────────────

function PropertyCard({ p, scored, ctx, deals, names, sent, openRequests, isNew, folded, onFold, selected, onToggle, onStatus, onDelete }: {
  p: Property; scored: Array<{ item: RuledMatch; prospect: Prospect }>; ctx: ProspectContext; deals: Deal[]; names: Map<string, string>; sent: Map<string, SentOnWhatsApp>; openRequests: number; isNew: boolean;
  folded: boolean; onFold: () => void; selected: boolean;
  onToggle: () => void; onStatus: (s: Property['status']) => void; onDelete: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const matches = scored.map((x) => x.item);
  const prospectOf = new Map(scored.map((x) => [x.item.applicant.id, x.prospect]));
  const top = scored[0];
  // the best few, and the best bet with them when it is not already one of them
  const few = bestFew(matches, (m) => m.strength);
  const best = top && !few.includes(top.item) ? [top.item, ...few] : few;
  const shown = showAll ? matches : best;
  const hidden = matches.length - best.length;
  const counts = (['strong', 'good', 'possible'] as const)
    .map((st) => [st, matches.filter((m) => m.strength === st).length] as const)
    .filter(([, c]) => c > 0)
    .map(([st, c]) => `${c} ${st}`)
    .join(' · ');
  const facts = [
    p.property_type,
    rentShown(p),
    p.area && !/^london$/i.test(p.area) ? p.area : null,
    p.borough && p.borough.toLowerCase() !== p.area?.toLowerCase() ? p.borough : null,
    p.bills ? `Bills: ${p.bills}` : null, p.furnished,
    p.available_from ? `From ${shortDate(p.available_from)}` : null,
    p.source_tag ? `Source: ${p.source_tag}` : null,
  ].filter(Boolean);
  const added = dayWords(p.created_at);

  return (
    <Card className={`overflow-hidden ${isNew ? 'ring-2 ring-[var(--accent)]' : ''}`}>
      <div className="flex flex-wrap items-start gap-3 px-5 py-4">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.address_line}`}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex items-start gap-1.5">
            <button type="button" onClick={onFold} aria-expanded={!folded} title={folded ? 'Open this card' : 'Fold this card'} aria-label={`${folded ? 'Open' : 'Fold'} ${p.address_line}`}
              className="-ml-1 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]">
              <Icon name="chevronDown" size={16} className={`transition-transform ${folded ? '-rotate-90' : ''}`} />
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="m-0 text-[17px] font-semibold text-[var(--ink)]">{p.address_line}</h3>
              {isNew && <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--on-accent)]">New</span>}
              {isLocalProperty(p.id) && <DeviceOnlyTag />}
            </div>
          </div>
          <div className="mt-0.5 text-[14px] text-[var(--ink-muted)]">
            {facts.join(' · ') || 'No details'}
            <span className="whitespace-nowrap" title={`Added ${shortDate(p.created_at)}`}>{facts.length ? ' · ' : ' '}<Icon name="clock" size={12} className="mr-1 inline align-[-1px]" />Added {added}</span>
          </div>
          {folded ? <FoldedSummary p={p} matches={matches} deals={deals} top={top} /> : (
            <>
              <div className="mt-1.5"><LhaLine property={p} /></div>
              <PropertyChecks property={p} />
              <InPlay deals={deals} names={names} />
              <ProviderPicker property={p} />
            </>
          )}
        </div>
        {/* folded on a phone, the buttons wait until the card is opened */}
        <div className={`${folded ? 'hidden sm:flex' : 'flex'} w-full flex-wrap items-center gap-2 pl-7 sm:w-auto sm:justify-end sm:pl-0`}>
          {openRequests > 0 && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--chip-fg)]"
              title="Requests to the provider still waiting on a reply">
              <Icon name="send" size={11} /> {openRequests} open
            </span>
          )}
          <RequestButton property={p} />
          <WhatsAppLink properties={[p]} />
          <select value={p.status} onChange={(e) => onStatus(e.target.value as Property['status'])} aria-label={`Status of ${p.address_line}`}
            className="min-h-[36px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]">
            {(Object.keys(PROPERTY_STATUS_LABEL) as Property['status'][]).map((s) => <option key={s} value={s}>{PROPERTY_STATUS_LABEL[s]}</option>)}
          </select>
          <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} aria-label={`Edit ${p.address_line}`}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium ${editing ? 'border-[var(--accent)] text-[var(--accent-ink)]' : 'border-[var(--line-strong)] text-[var(--ink)] hover:border-[var(--accent)]'}`}>
            <Icon name="pencil" size={14} />Edit
          </button>
          <button onClick={onDelete} aria-label={`Delete ${p.address_line}`} title="Delete property"
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {editing && <EditProperty p={p} onDone={() => setEditing(false)} />}

      {isAvailable(p) && !folded && (
        <div className="border-t border-[var(--line)] px-5 pb-3 pt-2">
          {matches.length === 0 ? (
            <p className="m-0 py-1 text-[14px] text-[var(--ink-muted)]">No matching clients yet.</p>
          ) : (
            <>
              {top && <BestBet top={top} />}
              <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] p-0">
                {shown.map((m) => <MatchRow key={m.applicant.id} m={m} p={p} sent={sent.get(sentKey(m.applicant.id, p.address_line))}
                  deal={deals.find((d) => d.applicant_id === m.applicant.id)} prospect={prospectOf.get(m.applicant.id) ?? null} ctx={ctx} />)}
              </ul>
              {hidden > 0 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-1 text-[13px] text-[var(--link)] hover:underline">
                  {showAll ? 'Show only the best' : `Show all ${matches.length} (${counts})`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** A folded card in a line: its LHA, anything red or held back, and how many clients fit or are in play. */
function FoldedSummary({ p, matches, deals, top }: { p: Property; matches: RuledMatch[]; deals: Deal[]; top?: { item: RuledMatch; prospect: Prospect } }) {
  const flags = checksFor(p).flags.filter((f) => f.tone === 'grey' || (f.tone === 'red' && f.key !== 'over_lha'));
  const strong = matches.filter((m) => m.strength === 'strong').length;
  const going = deals.filter((d) => d.status !== 'sent' && d.status !== 'fell_through').length;
  const words = [
    isAvailable(p) ? (matches.length ? `${matches.length} ${matches.length === 1 ? 'client fits' : 'clients fit'}${strong ? `, ${strong} strong` : ''}` : 'No matching clients yet') : null,
    going ? `${going} in play` : null,
    isAvailable(p) && top ? `best bet ${top.item.applicant.full_name.split(' ')[0]}, ${chanceWords(top.prospect)}${top.prospect.expected ? `, ≈${money(top.prospect.expected)}` : ''}` : null,
  ].filter(Boolean);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ink-muted)]">
      <LhaChip property={p} />
      {flags.map((f) => <FlagChip key={f.key} flag={f} />)}
      {words.length > 0 && <span>{words.join(' · ')}</span>}
    </div>
  );
}

/** Who supplies this property: picked from the providers, or worked out from the list's tag. */
function ProviderPicker({ property }: { property: Property }) {
  const { providers, ready } = useProviders();
  const setProvider = useSetPropertyProvider();
  const { toast } = useToast();
  if (!ready || providers.length === 0) return null;
  const who = providerFor(property, providers);
  const byTagOnly = who && !property.provider_id;
  return (
    <label className="mt-1.5 inline-flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--ink-muted)]">
      Provider
      <select value={who?.id ?? ''} disabled={setProvider.isPending} aria-label={`Provider of ${property.address_line}`}
        onChange={(e) => {
          const pr = providers.find((x) => x.id === e.target.value) ?? null;
          setProvider.mutate({ properties: [property], provider: pr }, {
            onSuccess: () => toast(pr ? `${property.address_line.split(',')[0]} is from ${pr.tag}` : 'Provider cleared', 'success'),
            onError: (err) => toast((err as Error).message, 'danger'),
          });
        }}
        className={`h-7 rounded border bg-[var(--surface)] px-1.5 text-[13px] ${who ? 'border-[var(--line)] font-medium text-[var(--ink)]' : 'border-[var(--note-fg)] text-[var(--note-fg)]'}`}>
        <option value="">{who ? 'No provider' : 'Not set: choose…'}</option>
        {providers.filter((x) => x.active || x.id === who?.id).map((pr) => <option key={pr.id} value={pr.id}>{pr.tag}{pr.name !== pr.tag ? ` · ${pr.name}` : ''}</option>)}
      </select>
      {byTagOnly && <span className="text-[12px]" title="Worked out from the tag on its list; pick one to set it for good">from the list tag</span>}
    </label>
  );
}

/** Who is going for this property beyond being sent it: "Anna (viewing Thu 2 Oct, 2pm) · Diana (offer made)". */
function InPlay({ deals, names }: { deals: Deal[]; names: Map<string, string> }) {
  const going = deals.filter((d) => d.status !== 'sent' && d.status !== 'fell_through');
  if (going.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="text-[var(--ink-muted)]">In play:</span>
      {going.map((d) => (
        <Link key={d.id} to={`/applicants/${d.applicant_id}`} className="inline-flex items-center gap-1.5 hover:underline">
          <span className="text-[var(--ink)]">{(names.get(d.applicant_id) ?? 'A client').split(' ')[0]}</span>
          <DealChip deal={d} />
        </Link>
      ))}
    </div>
  );
}

/** One client: strength, who, the reasons in brief (all of them on hover), and ways to reach them. */
/** The best bet on a property: who, how likely, and what it is worth. */
function BestBet({ top }: { top: { item: RuledMatch; prospect: Prospect } }) {
  const x = top.prospect;
  return (
    <p className="m-0 pb-1 pt-0.5 text-[13px] text-[var(--ink-muted)]">
      <Icon name="trend" size={13} className="mr-1.5 inline align-[-2px] text-[var(--accent)]" />
      <span>Best bet: <strong className="font-semibold text-[var(--ink)]">{top.item.applicant.full_name.split(' ')[0]}</strong>, {chanceWords(x)} likely to place{x.expected ? <>, worth about <strong className="font-semibold text-[var(--ink)]">{money(x.expected)}</strong></> : ''}.</span>
    </p>
  );
}

function MatchRow({ m, p, sent, deal, prospect, ctx }: { m: RuledMatch; p: Property; sent: SentOnWhatsApp | undefined; deal: Deal | undefined; prospect: Prospect | null; ctx: ProspectContext }) {
  const [why, setWhy] = useState(false);
  const a = m.applicant;
  const tier = effectiveTier(a);
  // tier and urgency already show as badges; the one line says why it fits
  const reasons = m.line ? [m.line] : m.reasons.filter((r) => r !== tierLabel(1) && !r.startsWith('Urgent:')).map(brief);
  const urgentWhy = m.reasons.find((r) => r.startsWith('Urgent:'));
  const detail = [...m.reasons, ...m.warnings.map((w) => w.words), ...m.cautions.map((c) => `Check: ${c}`), m.income.words ? `Keel could expect: ${m.income.words}` : null].filter(Boolean).join('\n');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <span className="hidden sm:inline-flex"><FitBadge strength={m.strength} fit={prospect?.fit ?? null} /></span>
      <div className="min-w-0 flex-1 basis-[260px]" title={detail}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sm:hidden"><FitBadge strength={m.strength} fit={prospect?.fit ?? null} /></span>
          <Link to={`/applicants/${a.id}`} className="text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
          <TierBadge tier={tier} needs={tierNeeds(a)} />
          {isFresh(a) && <NewBadge />}
          {isStaleReferral(a) && (
            <span title={`Referral received ${shortDate(receivedAt(a))}: older than ${activeSettings().staleReferralDays} days, so it sits lower unless it is a good match`}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
              <Icon name="clock" size={11} />{referralAgeDays(a)} days old
            </span>
          )}
          {isUrgent(a) && <UrgentChip reason={urgentWhy?.replace(/^Urgent:\s*/, '')} />}
          <IncomeTag income={m.income} />
          {prospect && <ProspectTag prospect={prospect} open={why} onToggle={() => setWhy((v) => !v)} />}
          {deal && deal.status !== 'sent' ? <DealChip deal={deal} /> : <SentTag sent={sent} />}
        </div>
        <div className="text-[13px] text-[var(--ink-muted)] sm:truncate">
          {reasons.join(' · ')}
          {!m.warnings.length && m.cautions[0] && <span className="text-[var(--note-fg)]">{reasons.length ? ' · ' : ''}{brief(m.cautions[0])}</span>}
        </div>
        {m.warnings.length > 0 && <div className="mt-1 flex flex-wrap gap-1"><RuleWarnings warnings={m.warnings} /></div>}
        {why && prospect && <ProspectWhy prospect={prospect} ctx={ctx} />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LandlordShareLink applicant={a} property={p} />
        <WhatsAppLink to={a} properties={[p]} icon />
        {a.phone && (
          <a href={`tel:${a.phone}`} title={`Call ${a.full_name} (${a.phone})`} aria-label={`Call ${a.full_name}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]">
            <Icon name="phone" size={15} />
          </a>
        )}
      </div>
    </li>
  );
}

function DeviceOnlyTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[var(--note-fg)]" title="Saved only in this browser, so it is not on your phone yet. See the note at the top of the page.">
      <Icon name="monitor" size={13} /> This device only
    </span>
  );
}

function StrengthBadge({ s }: { s: Strength }) {
  const x = STRENGTH[s];
  return (
    <span className="w-[68px] shrink-0 rounded px-2 py-0.5 text-center text-[12px] font-semibold" style={{ background: x.bg, color: x.fg }}>{x.label}</span>
  );
}

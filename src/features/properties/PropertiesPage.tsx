import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, TierBadge, useToast } from '../../components/ui';
import {
  NeedsDatabaseUpdate, PROPERTY_STATUS_LABEL, useAddProperties, useApplicants, useDeleteProperties, useProperties, useSetPropertyStatus,
} from '../../lib/hooks';
import { isLocalProperty, localProperties } from '../../lib/localProperties';
import type { NewProperty, SavedProperty } from '../../lib/hooks';
import type { Applicant, Property } from '../../lib/types';
import { parsePropertyList } from '../../lib/parseProperties';
import type { ParsedProperty } from '../../lib/parseProperties';
import { matchesForProperty } from '../../lib/propertyMatch';
import type { Match, Strength } from '../../lib/propertyMatch';
import { BOROUGHS } from '../../lib/london';
import { effectiveTier, isUrgent } from '../../lib/search';
import { money, shortDate } from '../../lib/format';

const TYPE_OPTIONS = ['Room', 'En-suite Room', 'Studio', 'En-suite Studio', 'Self-Contained Studio', '1-Bed Flat', '2-Bed Flat', '3-Bed Flat', '3-Bed House', '4-Bed House'];
const bedsOfType = (t: string) => (/(\d)-Bed/.exec(t) ? Number(/(\d)-Bed/.exec(t)![1]) : 0);
const normAddr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const STRENGTH: Record<Strength, { label: string; bg: string; fg: string }> = {
  strong: { label: 'Strong', bg: 'var(--stage-placed-bg)', fg: 'var(--stage-placed-fg)' },
  good: { label: 'Good', bg: 'var(--stage-referred-bg)', fg: 'var(--stage-referred-fg)' },
  possible: { label: 'Possible', bg: 'var(--stage-lead-bg)', fg: 'var(--stage-lead-fg)' },
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
  const [borough, setBorough] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const matches = useMemo(
    () => new Map(properties.map((p) => [p.id, isAvailable(p) ? matchesForProperty(p, applicants) : []])),
    [properties, applicants],
  );

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
      .filter((p) => !needle || [p.address_line, p.area, p.borough, p.postcode, p.property_type, p.source_tag]
        .some((x) => x?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(justAdded.has(b.id)) - Number(justAdded.has(a.id))
        || (matches.get(b.id)?.length ?? 0) - (matches.get(a.id)?.length ?? 0)
        || b.created_at.localeCompare(a.created_at));
  }, [properties, status, borough, q, justAdded, matches]);

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

  if (isLoading) return <div className="grid min-h-[50vh] place-items-center text-[var(--ink-muted)]">Loading…</div>;

  const showPaste = pasteOpen || properties.length === 0;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 p-6 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[28px] font-bold text-[var(--ink)]">Properties</h1>
          <p className="m-0 mt-1 text-[15px] text-[var(--ink-muted)]">
            {counts.available} available · {counts.under_offer} under offer · {counts.let} let
            {totalMatches > 0 && <> · <strong className="text-[var(--ink)]">{totalMatches}</strong> client matches</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {properties.length > 0 && (
            <Button onClick={() => setListsOpen((v) => !v)}>{listsOpen ? 'Hide saved lists' : 'Saved lists'}</Button>
          )}
          {!showPaste && <Button variant="brass" onClick={() => setPasteOpen(true)}>Paste properties</Button>}
        </div>
      </header>

      {needsUpdate && (
        <div role="alert" className="rounded-md border border-[var(--stage-offer-fg)] bg-[var(--stage-offer-bg)] p-4 text-[15px] text-[var(--ink)]">
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
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Address, area, postcode, source"
                className="min-h-[40px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]" />
            </label>
          </div>

          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-2">
              <span className="text-[15px] text-[var(--ink)]">{selectedRows.length} selected</span>
              <Button className="min-h-0 px-3 py-1.5 text-[13px]" onClick={bulkLet}>Mark as let</Button>
              <Button variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" onClick={bulkDelete}>Delete</Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-[13px] text-[var(--link)] hover:underline">Clear selection</button>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {rows.map((p) => (
              <PropertyCard
                key={p.id}
                p={p}
                matches={matches.get(p.id) ?? []}
                isNew={justAdded.has(p.id)}
                selected={selected.has(p.id)}
                onToggle={() => toggle(p.id)}
                onStatus={(s) => setStatus.mutate({ p, status: s }, { onSuccess: () => toast(`${PROPERTY_STATUS_LABEL[s]}: ${p.address_line}`, 'success') })}
                onDelete={() => {
                  if (!window.confirm(`Delete ${p.address_line}? This cannot be undone.`)) return;
                  del.mutate([p.id], { onSuccess: () => toast('Property deleted', 'success') });
                }}
              />
            ))}
            {rows.length === 0 && <p className="m-0 text-[15px] text-[var(--ink-muted)]">No properties in this view.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ── Saved lists and purging ────────────────────────────────────────

const PURGE_AFTER_DAYS = 14;

function SavedLists({ properties, onClose, onMove, moving }: {
  properties: Property[]; onClose: () => void; onMove: (ps: Property[]) => void; moving: boolean;
}) {
  const { toast } = useToast();
  const del = useDeleteProperties();
  // Each paste is saved in one go, so a list is the properties sharing a save time and source.
  const lists = useMemo(() => {
    const by = new Map<string, Property[]>();
    for (const p of properties) {
      const key = `${p.created_at}|${p.source_tag ?? ''}|${isLocalProperty(p.id)}`;
      by.set(key, [...(by.get(key) ?? []), p]);
    }
    return [...by.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
  }, [properties]);
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  const old = properties.filter((p) => p.created_at < cutoff);
  const done = properties.filter((p) => p.status === 'let' || p.status === 'withdrawn');

  const purge = (ps: Property[], what: string) => {
    if (ps.length === 0) return;
    if (!window.confirm(`Purge ${what} (${plural(ps.length, 'property', 'properties')})? This removes them from every device and cannot be undone.`)) return;
    del.mutate(ps.map((p) => p.id), {
      onSuccess: () => toast(`Purged ${plural(ps.length, 'property', 'properties')}`, 'success'),
      onError: (e) => toast(`Purge failed: ${(e as Error).message}`, 'danger'),
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-[18px] font-semibold text-[var(--ink)]">Saved lists</h2>
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
          return (
            <li key={`${ps[0].created_at}|${ps[0].source_tag ?? ''}|${onDevice.length > 0}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
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
              <Button variant="danger" className="min-h-0 px-3 py-1.5 text-[13px]" disabled={del.isPending}
                onClick={() => purge(ps, ps[0].source_tag ? `the list from ${ps[0].source_tag}` : 'this list')}>
                Purge this list
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={done.length === 0} onClick={() => purge(done, 'let and withdrawn properties')}>
          Purge let and withdrawn ({done.length})
        </Button>
        <Button className="min-h-0 px-3 py-1.5 text-[13px]" disabled={old.length === 0} onClick={() => purge(old, `properties saved over ${PURGE_AFTER_DAYS} days ago`)}>
          Purge saved over {PURGE_AFTER_DAYS} days ago ({old.length})
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
          <h2 className="m-0 text-[18px] font-semibold text-[var(--ink)]">Paste your available properties</h2>
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
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">Where is this list from? (optional)</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. BP, SR, landlord name"
                className="min-h-[40px] w-[260px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--hull)]" />
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
                    {d.duplicate && <span className="rounded bg-[var(--stage-offer-bg)] px-2 py-0.5 text-[13px] text-[var(--stage-offer-fg)]">Already on your list</span>}
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
                      <span key={w} className="rounded bg-[var(--stage-offer-bg)] px-1.5 py-0.5 text-[var(--stage-offer-fg)]">{w}</span>
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
            <Button variant="primary" onClick={save} disabled={chosen.length === 0 || add.isPending}>
              {add.isPending ? 'Saving…' : `Save ${plural(chosen.length, 'property', 'properties')}`}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Property card with its matches ────────────────────────────────

const SHOW_MATCHES = 8;

function PropertyCard({ p, matches, isNew, selected, onToggle, onStatus, onDelete }: {
  p: Property; matches: Match[]; isNew: boolean; selected: boolean;
  onToggle: () => void; onStatus: (s: Property['status']) => void; onDelete: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? matches : matches.slice(0, SHOW_MATCHES);
  const breakdown = (['strong', 'good', 'possible'] as const)
    .map((st) => [st, matches.filter((m) => m.strength === st).length] as const)
    .filter(([, c]) => c > 0)
    .map(([st, c]) => `${c} ${st}`)
    .join(', ');
  const facts = [
    p.area, p.borough && p.borough.toLowerCase() !== p.area?.toLowerCase() ? p.borough : null, p.property_type,
    p.rent_text ?? (p.rent_pcm ? `${money(p.rent_pcm)} pcm` : null),
    p.bills ? `Bills: ${p.bills}` : null, p.furnished,
    p.available_from ? `From ${shortDate(p.available_from)}` : null,
    p.source_tag ? `Source: ${p.source_tag}` : null,
  ].filter(Boolean);

  return (
    <Card className={`overflow-hidden ${isNew ? 'ring-2 ring-[var(--brass)]' : ''}`}>
      <div className="flex flex-wrap items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.address_line}`}
          className="mt-1 h-5 w-5 accent-[var(--hull)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[18px] font-semibold text-[var(--ink)]">{p.address_line}</h3>
            {isNew && <span className="rounded bg-[var(--brass)] px-2 py-0.5 text-[13px] font-semibold text-[var(--brass-text)]">New</span>}
            {isLocalProperty(p.id) && <DeviceOnlyTag />}
          </div>
          <div className="mt-1 text-[15px] text-[var(--ink-muted)]">{facts.join(' · ') || 'No details'}</div>
        </div>
        <select value={p.status} onChange={(e) => onStatus(e.target.value as Property['status'])} aria-label={`Status of ${p.address_line}`}
          className="min-h-[36px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[13px] text-[var(--ink)]">
          {(Object.keys(PROPERTY_STATUS_LABEL) as Property['status'][]).map((s) => <option key={s} value={s}>{PROPERTY_STATUS_LABEL[s]}</option>)}
        </select>
        <button onClick={onDelete} aria-label={`Delete ${p.address_line}`} title="Delete property"
          className="rounded px-2 py-1 text-[15px] text-[var(--ink-muted)] hover:bg-[var(--stage-lost-bg)] hover:text-[var(--danger)]">✕</button>
      </div>

      {isAvailable(p) && (
        <div className="px-5 py-3">
          {matches.length === 0 ? (
            <p className="m-0 text-[15px] text-[var(--ink-muted)]">No matching clients yet.</p>
          ) : (
            <>
              <div className="mb-2 text-[13px] font-medium text-[var(--ink-muted)]">
                {matches.length} matching {matches.length === 1 ? 'client' : 'clients'}
                {matches.length > 1 && <span className="font-normal">: {breakdown}</span>}
              </div>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {shown.map((m) => <MatchRow key={m.applicant.id} m={m} />)}
              </ul>
              {matches.length > SHOW_MATCHES && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] text-[var(--link)] hover:underline">
                  {showAll ? 'Show fewer' : `Show all ${matches.length} clients`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function MatchRow({ m }: { m: Match }) {
  const a = m.applicant;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <StrengthBadge s={m.strength} />
        <Link to={`/applicants/${a.id}`} className="text-[15px] font-medium text-[var(--ink)] hover:underline">{a.full_name}</Link>
        <TierBadge tier={effectiveTier(a)} />
        {isUrgent(a) && <span className="text-[13px] font-semibold text-[var(--danger)]">Urgent</span>}
        {a.phone && <a href={`tel:${a.phone}`} className="font-mono text-[13px] text-[var(--link)] hover:underline">{a.phone}</a>}
      </div>
      <div className="text-[13px] text-[var(--ink)]">{m.reasons.join(' · ')}</div>
      {m.cautions.length > 0 && (
        <div className="text-[13px] text-[var(--stage-offer-fg)]">! {m.cautions.join(' · ')}</div>
      )}
    </li>
  );
}

function DeviceOnlyTag() {
  return <span className="rounded bg-[var(--stage-offer-bg)] px-2 py-0.5 text-[13px] font-normal text-[var(--stage-offer-fg)]">Only on this device</span>;
}

function StrengthBadge({ s }: { s: Strength }) {
  const x = STRENGTH[s];
  return <span className="rounded px-2 py-0.5 text-[13px] font-semibold" style={{ background: x.bg, color: x.fg }}>{x.label}</span>;
}


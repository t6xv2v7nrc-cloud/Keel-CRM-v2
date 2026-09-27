import { lazy, Suspense, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Help, Icon } from '../../components/ui';
import { clientAreas, placeKey } from '../../lib/geo';
import { scoreMatch } from '../../lib/propertyMatch';
import type { Match, Strength } from '../../lib/propertyMatch';
import { isActive } from '../../lib/search';
import type { Applicant, Property } from '../../lib/types';
import type { PropertyMapProps } from './PropertyMap';

// Leaflet only loads when a map is opened
const PropertyMap = lazy(() => import('./PropertyMap'));

export function LazyMap(props: PropertyMapProps) {
  return (
    <Suspense fallback={<div className="grid place-items-center rounded-[10px] bg-[var(--paper-2)] text-[13px] text-[var(--ink-muted)]" style={{ height: props.height ?? 480 }}>Loading the map…</div>}>
      <PropertyMap {...props} />
    </Suspense>
  );
}

/** What the pin colours and shading mean. */
export function MapKey({ client }: { client: boolean }) {
  const dot = (cls: string) => <span className={`inline-block h-3 w-3 rounded-full border-2 ${cls}`} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--ink-muted)]">
      <span className="inline-flex items-center gap-1.5">{dot('border-[var(--surface)] bg-[var(--accent)]')} Strong</span>
      <span className="inline-flex items-center gap-1.5">{dot('border-[var(--accent)] bg-[var(--accent-soft)]')} Good</span>
      <span className="inline-flex items-center gap-1.5">{dot('border-[var(--ink-muted)] bg-[var(--surface)]')} Possible</span>
      <span className="inline-flex items-center gap-1.5">{dot('border-[var(--line-strong)] bg-[var(--paper-2)]')} {client ? 'Not a fit' : 'No clients yet'}</span>
      {client && <>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-[var(--accent)] opacity-40" /> Places they named</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm bg-[var(--accent)] opacity-15" /> Wider area</span>
      </>}
    </div>
  );
}

/** Properties page, map view: every property in the list on a map; pick a client to see their areas. */
export function MapView({ properties, matches, applicants, renderCard }: {
  properties: Property[];
  matches: Map<string, Match[]>;
  applicants: Applicant[];
  renderCard: (p: Property) => ReactNode;
}) {
  const [clientName, setClientName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const active = useMemo(() => applicants.filter(isActive).sort((a, b) => a.full_name.localeCompare(b.full_name)), [applicants]);
  const focus = active.find((a) => a.full_name.toLowerCase() === clientName.trim().toLowerCase()) ?? null;
  const best = useMemo(() => new Map(properties.map((p) => [p.id, (matches.get(p.id)?.[0]?.strength ?? null) as Strength | null])), [properties, matches]);
  const unplaced = properties.filter((p) => !placeKey(p));
  const here = selected ? properties.filter((p) => placeKey(p) === selected) : [];
  const fits = useMemo(() => {
    if (!focus) return null;
    const c = { strong: 0, good: 0, possible: 0 };
    for (const p of properties) { const s = scoreMatch(p, focus)?.strength; if (s) c[s] += 1; }
    return c;
  }, [focus, properties]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)] sm:max-w-[360px]">
          <Icon name="user" size={16} className="text-[var(--ink-muted)]" />
          <input list="keel-map-clients" value={clientName} onChange={(e) => { setClientName(e.target.value); setSelected(null); }}
            placeholder="Show a client's areas: type their name" aria-label="Show a client's areas"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none" />
          {clientName && <button type="button" onClick={() => setClientName('')} aria-label="Clear client" className="text-[var(--ink-muted)] hover:text-[var(--ink)]"><Icon name="x" size={14} /></button>}
          <datalist id="keel-map-clients">{active.map((a) => <option key={a.id} value={a.full_name} />)}</datalist>
        </span>
        <Help topic="map" />
        <div className="ml-auto"><MapKey client={!!focus} /></div>
      </div>

      {focus && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-[13px] text-[var(--accent-ink)]">
          <strong>{focus.full_name}</strong>
          <span>{clientAreas(focus).label}</span>
          {fits && <span className="text-[var(--ink)]">· {fits.strong} strong, {fits.good} good, {fits.possible} possible here</span>}
        </div>
      )}

      <LazyMap properties={properties} focus={focus} bestStrength={best} selected={selected} onSelect={setSelected} height={520} />

      {here.length > 0 ? (
        <div className="flex flex-col gap-4">{here.map((p) => <div key={p.id}>{renderCard(p)}</div>)}</div>
      ) : (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">Click a pin to see the property and its best clients. A number on a pin means several properties at one address.</p>
      )}
      {unplaced.length > 0 && (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]" title={unplaced.map((p) => p.address_line).join('\n')}>
          {unplaced.length} {unplaced.length === 1 ? 'property has' : 'properties have'} no postcode, so {unplaced.length === 1 ? 'it is' : 'they are'} not on the map. Switch to the list to see {unplaced.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}

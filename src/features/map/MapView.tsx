import { lazy, Suspense, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, Help, Icon } from '../../components/ui';
import { useOfficers } from '../../lib/hooks';
import { officerPlaces } from '../../lib/officerMap';
import type { OfficerPlace } from '../../lib/officerMap';
import { shortDate } from '../../lib/format';
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
export function MapKey({ client, officers = false }: { client: boolean; officers?: boolean }) {
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
      {officers && <>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-[3px] bg-[var(--ink)]" /> Housing officers (number), some can be emailed</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-[3px] border-2 border-[var(--ink-muted)] bg-[var(--surface)]" /> None can be emailed</span>
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
  // housing officers by council, on or off (remembered on this device)
  const { officers: records } = useOfficers();
  const [showOfficers, setShowOfficersState] = useState(() => {
    try { return localStorage.getItem('keel-map-officers') !== '0'; } catch { return true; }
  });
  const setShowOfficers = (v: boolean) => { setShowOfficersState(v); if (!v) setCouncil(null); try { localStorage.setItem('keel-map-officers', v ? '1' : '0'); } catch { /* fine */ } };
  const [council, setCouncil] = useState<string | null>(null);
  const officers = useMemo(() => officerPlaces(records, applicants), [records, applicants]);
  const officerCount = officers.places.reduce((s, p) => s + p.officers.length, 0);
  const picked = council ? officers.places.find((p) => p.council === council) ?? null : null;
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
        {officerCount > 0 && (
          <label className="flex items-center gap-2 text-[14px] text-[var(--ink)]">
            <input type="checkbox" checked={showOfficers} onChange={(e) => setShowOfficers(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Housing officers ({officerCount})
          </label>
        )}
        <Help topic="map" />
        <div className="ml-auto"><MapKey client={!!focus} officers={showOfficers && officerCount > 0} /></div>
      </div>

      {focus && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-[13px] text-[var(--accent-ink)]">
          <strong>{focus.full_name}</strong>
          <span>{clientAreas(focus).label}</span>
          {fits && <span className="text-[var(--ink)]">· {fits.strong} strong, {fits.good} good, {fits.possible} possible here</span>}
        </div>
      )}

      <LazyMap properties={properties} focus={focus} bestStrength={best} selected={selected} onSelect={(k) => { setSelected(k); if (k) setCouncil(null); }} height={520}
        officers={showOfficers ? officers.places : []} selectedCouncil={council} onSelectCouncil={setCouncil} />

      {picked ? <CouncilOfficers place={picked} /> : here.length > 0 ? (
        <div className="flex flex-col gap-4">{here.map((p) => <div key={p.id}>{renderCard(p)}</div>)}</div>
      ) : (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">
          Click a pin to see the property and its best clients. A number on a pin means several properties at one address.
          {showOfficers && officerCount > 0 && ' Click a square to see the housing officers at that council.'}
        </p>
      )}
      {showOfficers && officers.unplaced.length > 0 && (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]" title={officers.unplaced.map((o) => o.name).join('\n')}>
          {officers.unplaced.length} housing {officers.unplaced.length === 1 ? 'officer has' : 'officers have'} no council recorded, so {officers.unplaced.length === 1 ? 'is' : 'are'} not on the map (add it on Councils).
        </p>
      )}
      {unplaced.length > 0 && (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]" title={unplaced.map((p) => p.address_line).join('\n')}>
          {unplaced.length} {unplaced.length === 1 ? 'property has' : 'properties have'} no postcode, so {unplaced.length === 1 ? 'it is' : 'they are'} not on the map. Switch to the list to see {unplaced.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}

/** Under the map: the housing officers at the council picked, how each stands, their clients, and how to reach them. */
function CouncilOfficers({ place }: { place: OfficerPlace }) {
  const n = place.officers.length;
  return (
    <Card>
      <CardHeader icon="users" title={`${place.focus === 0 ? '★ ' : ''}${place.council}`} help="officers"
        sub={`${n} housing ${n === 1 ? 'officer' : 'officers'}, ${place.sendable} can be emailed`}>
        <Link to="/councils" className="text-[13px] text-[var(--link)] hover:underline">Open Councils</Link>
      </CardHeader>
      <ul className="m-0 flex list-none flex-col divide-y divide-[var(--line)] px-5 py-0">
        {place.officers.map((o) => (
          <li key={o.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1 basis-[220px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium text-[var(--ink)]">{o.name}</span>
                <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold"
                  style={o.sendable ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : { background: 'var(--chip-bg)', color: 'var(--chip-fg)' }}>
                  {o.words}
                </span>
              </div>
              <div className="text-[13px] text-[var(--ink-muted)]">
                {[
                  o.clients ? `${o.clients} ${o.clients === 1 ? 'client' : 'clients'} referred${o.active ? `, ${o.active} still being housed` : ''}` : 'No clients referred yet',
                  o.lastSent ? `last sent ${shortDate(o.lastSent)}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            {/* nobody who left is called or written to; nor is a bounced address */}
            {o.phone && o.status !== 'left' && (
              <a href={`tel:${o.phone}`} aria-label={`Call ${o.name}`} title={`Call ${o.name} (${o.phone})`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]">
                <Icon name="phone" size={15} />
              </a>
            )}
            {o.email && o.status !== 'left' && o.status !== 'bounced' && (
              <a href={`mailto:${o.email}`} aria-label={`Email ${o.name}`} title={`Email ${o.name} (${o.email})`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]">
                <Icon name="mail" size={15} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

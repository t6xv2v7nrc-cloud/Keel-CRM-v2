import { useState } from 'react';
import { Icon, useToast } from '../../components/ui';
import { usePeople, useSaveSettings, useSetLhaArea, useSettings } from '../../lib/hooks';
import { activeSettings } from '../../lib/settings';
import {
  areaSource, brmaGroups, districtFor, LHA_DIRECT_URL, lhaCheck, lhaTable, lhaWords, lookupPostcode, searchPlaces, sizeWords,
} from '../../lib/lha';
import type { LhaCheck, PostcodeLookup, PropertyForLha } from '../../lib/lha';
import type { Property } from '../../lib/types';

const pounds = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function tone(c: LhaCheck): { bg: string; fg: string } {
  if (c.status === 'under' || c.status === 'at') return { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' };
  if (c.status === 'over') return { bg: 'var(--note-bg)', fg: 'var(--note-fg)' };
  return { bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' };
}

/** "£36 over LHA" / "£120 under LHA" / "At LHA", coloured, with the detail on hover. */
export function LhaChip({ property }: { property: PropertyForLha }) {
  const c = lhaCheck(property);
  if (!c) return null;
  const t = tone(c);
  const overLeeway = c.status === 'over' && (c.diff ?? 0) > activeSettings().lhaLeeway;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[12px] ${overLeeway ? 'font-semibold' : 'font-medium'}`}
      style={{ background: t.bg, color: t.fg }}
      title={`${sizeWords(c.size)} LHA in ${c.area.brma}: ${pounds(c.rate)} pcm${c.area.how === 'estimated' ? ' (area estimated)' : ''}`}>
      {lhaWords(c)}
    </span>
  );
}

/** The full LHA line for a property card, with a way to correct its area. */
export function LhaLine({ property }: { property: Property }) {
  const c = lhaCheck(property);
  const [editing, setEditing] = useState(false);
  const district = districtFor(property);

  if (!c) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-muted)]">
        <Icon name="pound" size={14} /> LHA: {property.postcode || property.borough ? 'size not known' : 'area not known (no postcode)'}
        <button type="button" onClick={() => setEditing(true)} className="text-[var(--link)] hover:underline">Set the LHA area</button>
        {editing && <AreaEditor property={property} district={district} current={null} onClose={() => setEditing(false)} />}
      </div>
    );
  }

  const t = tone(c);
  const source = c.area.how === 'set' ? 'Set by hand' : c.area.how === 'team' ? `Team setting for ${c.area.basis}` : `Estimated from ${c.area.basis}: check on LHA Direct if unsure`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ink-muted)]">
        <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: t.bg, color: t.fg }}>{lhaWords(c)}</span>
        <span>{sizeWords(c.size)} rate <span className="font-mono text-[var(--ink)]">{pounds(c.rate)}</span></span>
        <span>·</span>
        <span title={source} className={c.area.how === 'estimated' ? 'cursor-help underline decoration-dotted underline-offset-2' : undefined}>{c.area.brma}</span>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--link)] hover:underline">Change</button>}
      </div>
      {editing && <AreaEditor property={property} district={district} current={c.area.brma} onClose={() => setEditing(false)} />}
    </div>
  );
}

function AreaEditor({ property, district, current, onClose }: { property: Property; district: string | null; current: string | null; onClose: () => void }) {
  const [area, setArea] = useState(current ?? '');
  const [everywhere, setEverywhere] = useState(false);
  const setLha = useSetLhaArea();
  const save = useSaveSettings();
  const { settings } = useSettings();
  const people = usePeople();
  const { toast } = useToast();
  const busy = setLha.isPending || save.isPending;

  const apply = () => {
    if (!area) return;
    if (everywhere && district) {
      save.mutate({ scope: 'team', value: { ...settings, lhaAreaOverrides: { ...settings.lhaAreaOverrides, [district]: area } } }, {
        onSuccess: () => { toast(`Every ${district} property now uses ${area}`, 'success'); onClose(); },
        onError: (e) => toast((e as Error).message, 'danger'),
      });
      return;
    }
    setLha.mutate({ properties: [property], area }, {
      onSuccess: () => { toast(`LHA area set to ${area}`, 'success'); onClose(); },
      onError: (e) => toast((e as Error).message, 'danger'),
    });
  };
  const useEstimate = () => setLha.mutate({ properties: [property], area: null }, {
    onSuccess: () => { toast('Back to the estimated LHA area', 'success'); onClose(); },
    onError: (e) => toast((e as Error).message, 'danger'),
  });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[13px]">
      <BrmaSelect value={area} onChange={setArea} placeholder="Choose the LHA area…"
        className="h-8 max-w-[240px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 text-[13px] text-[var(--ink)]" />
      {district && people.canEditTeam && (
        <label className="inline-flex items-center gap-1.5 text-[var(--ink)]">
          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} className="accent-[var(--accent)]" />
          Use for every {district} property
        </label>
      )}
      <button type="button" onClick={apply} disabled={!area || busy}
        className="rounded-md bg-[var(--accent)] px-2.5 py-1 font-medium text-[var(--on-accent)] disabled:opacity-40">Save area</button>
      {property.lha_area && <button type="button" onClick={useEstimate} disabled={busy} className="text-[var(--link)] hover:underline">Use the estimate</button>}
      <button type="button" onClick={onClose} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">Cancel</button>
      <a href={LHA_DIRECT_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[var(--link)] hover:underline">
        Check on LHA Direct <Icon name="arrowRight" size={12} className="-rotate-45" />
      </a>
      <span className="w-full text-[12px] text-[var(--ink-muted)]">Rates: {lhaTable().year}.</span>
    </div>
  );
}

const SHOW_ALL = '__all';

/** LHA areas: London and the home counties first; the rest of England only when asked for. */
export function BrmaSelect({ value, onChange, placeholder, className, label = 'LHA area' }: {
  value: string; onChange: (brma: string) => void; placeholder?: string; className?: string; label?: string;
}) {
  const [all, setAll] = useState(false);
  return (
    <select value={value} aria-label={label} className={className}
      onChange={(e) => (e.target.value === SHOW_ALL ? setAll(true) : onChange(e.target.value))}>
      {placeholder && <option value="">{placeholder}</option>}
      {brmaGroups(all, value).map(([group, names]) => (
        <optgroup key={group} label={group}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </optgroup>
      ))}
      {!all && <option value={SHOW_ALL}>Show the rest of England…</option>}
    </select>
  );
}

/** "Golders Green, Hampstead Garden Suburb · Barnet" */
export const whereWords = (l: PostcodeLookup) => [l.places, l.borough && !l.places?.includes(l.borough) ? l.borough : null].filter(Boolean).join(' · ');

/** Type a postcode or a place and see where it is, its LHA area and the rates; or pick an area. */
export function LhaLookup() {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('Outer North London');
  const hit = lookupPostcode(q);
  const places = hit ? [] : searchPlaces(q);
  const shown = hit?.area?.brma ?? (places.length === 1 ? places[0].area?.brma : null) ?? (q.trim() ? null : pick);
  const rates = shown ? lhaTable().rates[shown] ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 focus-within:border-[var(--accent)]">
          <Icon name="search" size={16} className="text-[var(--ink-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Postcode or place, e.g. NW11 or Golders Green"
            aria-label="Postcode or place" className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Clear" className="text-[var(--ink-muted)] hover:text-[var(--ink)]"><Icon name="x" size={14} /></button>}
        </span>
        <span className="text-[13px] text-[var(--ink-muted)]">or</span>
        <BrmaSelect value={pick} onChange={(v) => { setPick(v); setQ(''); }} label="Look up an LHA area"
          className="h-10 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-[15px] text-[var(--ink)]" />
      </div>

      {hit && (
        <div className="text-[15px] text-[var(--ink)]">
          <strong className="font-mono">{hit.district}</strong>
          {whereWords(hit) && <span className="text-[var(--ink-muted)]"> · {whereWords(hit)}</span>}
          {hit.area ? (
            <> <Icon name="arrowRight" size={14} className="mx-1 inline align-[-2px] text-[var(--ink-muted)]" />
              <strong>{hit.area.brma}</strong> <span className="text-[13px] text-[var(--ink-muted)]">({areaSource(hit.area)})</span></>
          ) : (
            <span className="block text-[13px] text-[var(--note-fg)]">
              Keel does not know this district's LHA area. Check it on LHA Direct, then add it under Area corrections in Team settings.
            </span>
          )}
        </div>
      )}
      {!hit && places.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[15px]">
          {places.map((l) => (
            <li key={l.district}>
              <button type="button" onClick={() => setQ(l.district)} className="text-left hover:underline">
                <strong className="font-mono text-[var(--ink)]">{l.district}</strong>
                <span className="text-[var(--ink-muted)]"> · {whereWords(l)}{l.area ? ` · ${l.area.brma}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!hit && places.length === 0 && q.trim().length > 0 && (
        <p className="m-0 text-[13px] text-[var(--ink-muted)]">No postcode or place matches "{q.trim()}". Try the start of a postcode, like NW11 or HA8.</p>
      )}

      {shown && (
        <div className="grid grid-cols-5 gap-2 text-center">
          {['Shared room', '1 bed', '2 bed', '3 bed', '4 bed'].map((label, i) => (
            <div key={label} className="rounded-md bg-[var(--surface)] px-2 py-2">
              <div className="text-[12px] text-[var(--ink-muted)]">{label}</div>
              <div className="font-mono text-[15px] font-semibold text-[var(--ink)]">{rates[i] != null ? pounds(rates[i]) : '·'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--ink-muted)]">
        <span>{shown ? `${shown}, monthly, ${lhaTable().year}.` : ''} Studios and en-suite rooms use the 1 bed rate; other rooms the shared rate.</span>
        <a href={LHA_DIRECT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--link)] hover:underline">
          Check an exact address on LHA Direct <Icon name="arrowRight" size={12} className="-rotate-45" />
        </a>
      </div>
    </div>
  );
}

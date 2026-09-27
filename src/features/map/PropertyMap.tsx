import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { POSTCODE_PLACES } from '../../data/postcode-places';
import { clientAreas, isLocated, locate, placeKey, pointOf } from '../../lib/geo';
import { scoreMatch } from '../../lib/propertyMatch';
import type { Strength } from '../../lib/propertyMatch';
import type { Applicant, Property } from '../../lib/types';
import { money } from '../../lib/format';

const RANK: Record<Strength, number> = { strong: 0, good: 1, possible: 2 };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface PropertyMapProps {
  properties: Property[];
  /** Shade this client's areas and colour each pin by how well it fits them. */
  focus?: Applicant | null;
  /** Without a client: the best match strength per property id, for the pin colour. */
  bestStrength?: Map<string, Strength | null>;
  /** The place (postcode) picked, and what happens on a click. */
  selected?: string | null;
  onSelect?: (placeKey: string | null) => void;
  height?: number;
}

/** Available properties on a map of London and around, placed by postcode. */
export default function PropertyMap({ properties, focus = null, bestStrength, selected = null, onSelect, height = 480 }: PropertyMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ areas: L.LayerGroup; pins: L.LayerGroup } | null>(null);
  const [version, setVersion] = useState(0); // bumps when new places arrive
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const select = useRef(onSelect);
  const framed = useRef<[number, number][]>([]); // what the view was last fitted to
  select.current = onSelect;

  const areas = useMemo(() => (focus ? clientAreas(focus) : null), [focus]);
  const groups = useMemo(() => {
    const g = new Map<string, Property[]>();
    for (const p of properties) {
      const k = placeKey(p);
      if (k) g.set(k, [...(g.get(k) ?? []), p]);
    }
    return g;
  }, [properties]);
  const fit = useMemo(() => new Map(properties.map((p) => [p.id,
    focus ? scoreMatch(p, focus)?.strength ?? null : bestStrength?.get(p.id) ?? null])), [properties, focus, bestStrength]);

  // Look up any places not known yet
  const missing = [...groups.keys(), ...(areas ? [...areas.exact, ...areas.broad] : [])].filter((k) => !isLocated(k)).sort().join('|');
  useEffect(() => {
    if (!missing) return;
    let live = true;
    setStatus('loading');
    locate(missing.split('|')).then(
      () => { if (live) { setStatus('idle'); setVersion((v) => v + 1); } },
      () => { if (live) setStatus('error'); },
    );
    return () => { live = false; };
  }, [missing]);

  // The map itself, once
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).setView([51.51, -0.12], 10);
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    layers.current = { areas: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    map.current = m;
    m.on('click', () => select.current?.(null));
    // A map drawn while hidden or mid-resize measures 0 pixels and zooms out to the world: re-measure and re-frame
    let last = '';
    const ro = new ResizeObserver(() => {
      const size = `${el.current?.clientWidth}x${el.current?.clientHeight}`;
      if (size === last) return;
      last = size;
      m.invalidateSize({ animate: false });
      if (framed.current.length && el.current?.clientWidth) m.fitBounds(L.latLngBounds(framed.current).pad(0.12), { maxZoom: 14, animate: false });
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layers.current = null; };
  }, []);

  // Areas and pins
  useEffect(() => {
    const ly = layers.current;
    if (!ly) return;
    ly.areas.clearLayers();
    ly.pins.clearLayers();
    if (areas) {
      const draw = (ds: string[], cls: string) => ds.forEach((d) => {
        const pt = pointOf(d);
        if (!pt) return;
        L.circle(pt, { radius: cls === 'keel-area-exact' ? 1200 : 1600, className: `keel-area ${cls}` })
          .bindTooltip(`<strong>${esc(d)}</strong>${POSTCODE_PLACES[d] ? ` ${esc(POSTCODE_PLACES[d])}` : ''}`, { sticky: true })
          .addTo(ly.areas);
      });
      draw(areas.broad, 'keel-area-broad');
      draw(areas.exact, 'keel-area-exact');
    }
    for (const [key, ps] of groups) {
      const pt = pointOf(key);
      if (!pt) continue;
      const strengths = ps.map((p) => fit.get(p.id)).filter((s): s is Strength => !!s);
      const best = strengths.sort((a, b) => RANK[a] - RANK[b])[0] ?? null;
      const cls = `keel-pin keel-pin-${best ?? 'none'}${key === selected ? ' is-selected' : ''}`;
      const icon = L.divIcon({ className: '', html: `<span class="${cls}">${ps.length > 1 ? ps.length : ''}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] });
      const lines = ps.slice(0, 4).map((p) =>
        `<div><strong>${esc(p.address_line)}</strong><br>${esc([p.property_type, p.rent_pcm ? `${money(p.rent_pcm)} pcm` : p.rent_text].filter(Boolean).join(' · '))}</div>`);
      if (ps.length > 4) lines.push(`<div>and ${ps.length - 4} more</div>`);
      L.marker(pt, { icon, title: ps.map((p) => p.address_line).join('; '), zIndexOffset: best ? 300 - RANK[best] * 100 : 0, riseOnHover: true })
        .bindTooltip(lines.join('<hr style="border:0;border-top:1px solid var(--line);margin:4px 0">'), { direction: 'top', offset: [0, -12] })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); select.current?.(key); })
        .addTo(ly.pins);
    }
  }, [groups, areas, fit, selected, version]);

  // Frame the pins and the client's areas when they change (not when a pin is picked)
  const frame = `${[...groups.keys()].sort().join('|')}#${areas ? `${areas.exact.join(',')}/${areas.broad.length}` : ''}#${version}`;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [
      ...[...groups.keys()].map(pointOf),
      ...(areas ? areas.exact.map(pointOf) : []),
      ...(areas && areas.exact.length === 0 ? areas.broad.map(pointOf) : []),
    ].filter((x): x is [number, number] => !!x);
    framed.current = pts;
    if (pts.length && el.current?.clientWidth) m.fitBounds(L.latLngBounds(pts).pad(0.12), { maxZoom: 14, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  return (
    <div className="relative">
      <div ref={el} className="keel-map w-full" style={{ height }} role="region" aria-label="Map of properties" />
      {status !== 'idle' && (
        <div className="pointer-events-none absolute left-14 top-3 z-[500] rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] text-[var(--ink-muted)] shadow-[var(--shadow-card)]">
          {status === 'loading' ? 'Placing properties on the map…' : 'Could not reach the postcode lookup. Check your connection and reopen the map.'}
        </div>
      )}
    </div>
  );
}

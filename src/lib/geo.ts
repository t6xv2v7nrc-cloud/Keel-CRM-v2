// Where properties and client areas are, for the map.
//
// Postcodes are placed with postcodes.io (free, open data from the ONS and
// Ordnance Survey). Only property postcodes and postcode districts are sent,
// never anything about a client. Each answer is remembered on this device,
// so a postcode is looked up once.

import { POSTCODE_PLACES } from '../data/postcode-places';
import {
  areasIn, boroughOfArea, boroughsIn, boroughsOfRegion, canonicalBorough, CENTRAL_DISTRICTS, districtOf, districtsIn, districtsOfBorough, POSTCODE_RE,
  regionsIn, titleCase,
} from './london';
import type { Applicant } from './types';

export type LatLng = [number, number];

const STORE = 'keel-geo-v1';
const API = 'https://api.postcodes.io';
const known = new Map<string, LatLng | null>();
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, LatLng | null>;
  for (const [k, v] of Object.entries(saved)) known.set(k, v);
} catch { /* no storage: look up again next time */ }
const remember = () => {
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(known))); } catch { /* fine */ }
};

/** What a property is placed by: its full postcode ("NW2 6NR"), else its district ("NW2"). */
export function placeKey(p: { postcode: string | null; address_line: string }): string | null {
  const full = (p.postcode ?? '').match(POSTCODE_RE) ?? p.address_line.match(POSTCODE_RE);
  if (full) return `${full[1]} ${full[2]}`.toUpperCase();
  return districtOf(p.postcode ?? '') ?? districtOf(p.address_line);
}

export const pointOf = (key: string | null): LatLng | null => (key ? known.get(key) ?? SPLIT_DISTRICTS[key] ?? null : null);
export const isLocated = (key: string) => known.has(key);

const districtOfKey = (key: string) => key.split(' ')[0].replace(/^([A-Z]+\d)[A-Z]$/, '$1');

// Central districts split into lettered ones (W1D, SW1A, EC1V), which postcodes.io has no single entry for
const SPLIT_DISTRICTS: Record<string, LatLng> = {
  WC1: [51.5225, -0.1230], WC2: [51.5120, -0.1225], EC1: [51.5240, -0.1020], EC2: [51.5180, -0.0870],
  EC3: [51.5120, -0.0800], EC4: [51.5135, -0.1030], W1: [51.5150, -0.1450], SW1: [51.4975, -0.1370],
};

async function lookUpDistrict(d: string): Promise<void> {
  if (SPLIT_DISTRICTS[d]) { known.set(d, SPLIT_DISTRICTS[d]); return; }
  const r = await fetch(`${API}/outcodes/${encodeURIComponent(d)}`);
  if (r.status === 404) { known.set(d, null); return; }
  if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
  const j = await r.json() as { result?: { latitude: number | null; longitude: number | null } };
  const la = j.result?.latitude, lo = j.result?.longitude;
  known.set(d, la != null && lo != null ? [la, lo] : null);
}

/** Look up any keys not known yet. Postcodes that have gone (redeveloped) fall back to their district. */
export async function locate(keys: string[]): Promise<void> {
  const todo = [...new Set(keys.filter((k) => !known.has(k)))];
  if (todo.length === 0) return;
  const fulls = todo.filter((k) => k.includes(' '));
  const districts = new Set(todo.filter((k) => !k.includes(' ')));
  const gone: string[] = [];

  for (let i = 0; i < fulls.length; i += 100) {
    const batch = fulls.slice(i, i + 100);
    const r = await fetch(`${API}/postcodes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postcodes: batch }),
    });
    if (!r.ok) throw new Error(`postcodes.io ${r.status}`);
    const j = await r.json() as { result: Array<{ query: string; result: { latitude: number | null; longitude: number | null } | null }> };
    j.result.forEach((x, n) => {
      const key = batch[n];
      if (x.result?.latitude != null && x.result.longitude != null) known.set(key, [x.result.latitude, x.result.longitude]);
      else { gone.push(key); districts.add(districtOfKey(key)); }
    });
  }

  const list = [...districts].filter((d) => !known.has(d));
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(lookUpDistrict));
  for (const key of gone) known.set(key, known.get(districtOfKey(key)) ?? null);
  remember();
}

// ── A client's areas ───────────────────────────────────────────────

export interface ClientAreas {
  /** "Wants Central London", "Asked for Golders Green or N12", "Their council: Barnet" */
  label: string;
  /** districts they named, or places inside them */
  exact: string[];
  /** every district in a borough or region they named (a looser fit) */
  broad: string[];
}

/** Districts for a place name: "golders green" → NW11; "finchley" → N2, N3, N12. */
function districtsOfPlace(place: string): string[] {
  const p = place.toLowerCase();
  const entries = Object.entries(POSTCODE_PLACES).map(([d, names]) => [d, names.toLowerCase().split(/,\s*/)] as const);
  const exact = entries.filter(([, names]) => names.includes(p)).map(([d]) => d);
  if (exact.length) return exact;
  return entries.filter(([, names]) => names.some((n) => n.includes(p))).map(([d]) => d);
}

/** Where a client wants to live, as postcode districts to shade on the map. */
export function clientAreas(a: Applicant): ClientAreas {
  const text = [a.notes, a.requirements].filter(Boolean).join(' \n ');
  const exact = new Set<string>(districtsIn(text));
  const broad = new Set<string>();
  const names: string[] = [...districtsIn(text)];
  for (const area of areasIn(text)) {
    names.push(titleCase(area));
    const ds = districtsOfPlace(area);
    if (ds.length) ds.forEach((d) => exact.add(d));
    else { const b = boroughOfArea(area); if (b) districtsOfBorough(b).forEach((d) => broad.add(d)); }
  }
  for (const b of boroughsIn(text)) { names.push(b); districtsOfBorough(b).forEach((d) => broad.add(d)); }
  for (const r of regionsIn(text)) {
    names.push(titleCase(r));
    if (r === 'central london') CENTRAL_DISTRICTS.forEach((d) => exact.add(d));
    else boroughsOfRegion(r).forEach((b) => districtsOfBorough(b).forEach((d) => broad.add(d)));
  }
  for (const d of exact) broad.delete(d);

  if (exact.size === 0 && broad.size === 0) {
    const council = canonicalBorough(a.council || a.referring_borough);
    if (council) return { label: `No area given. Their council: ${council}`, exact: [], broad: districtsOfBorough(council) };
    return { label: 'No area given', exact: [], broad: [] };
  }
  const uniq = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  const list = uniq.length > 1 ? `${uniq.slice(0, -1).join(', ')} or ${uniq[uniq.length - 1]}` : uniq[0];
  return { label: `Wants ${list}`, exact: [...exact], broad: [...broad] };
}

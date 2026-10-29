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
let version = 0;
const remember = () => {
  version += 1; // matches that rest on distances are worked out again
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(known))); } catch { /* fine */ }
};
/** Goes up each time new places are known, so anything worked out from distances is worked out again. */
export const geoVersion = () => version;
/** Places known without looking them up: for the checks in scripts/ and the harness only. */
export function setPointsForTest(points: Record<string, LatLng>) {
  for (const [k, v] of Object.entries(points)) known.set(k, v);
  version += 1;
}

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

// ── How far a client's anchor is (brief B6) ────────────────────────
// Who or what a client must live near (applicants.anchor, anchor_postcode) is placed by its postcode district only
// ("HA1", not "HA1 3UJ"): only districts are ever sent to postcodes.io, never a client's own address.

/** The district a client's anchor is placed by: from its postcode, else a district or postcode in its words. */
export function anchorKey(a: Pick<Applicant, 'anchor' | 'anchor_postcode'>): string | null {
  return districtOf(a.anchor_postcode ?? '') ?? (a.anchor ? districtOf(a.anchor) : null);
}

/** Kilometres between two points, as the crow flies. */
export function kmBetween(x: LatLng, y: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(y[0] - x[0]), dLng = rad(y[1] - x[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(x[0])) * Math.cos(rad(y[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** A rough journey time by bus or train for a distance: 10 minutes of walking and waiting, then about 3.5 minutes a
 *  kilometre (London's buses and trains, door to door). A guide for ranking and for "too far", not a timetable. */
export const travelMins = (km: number) => Math.round(10 + 3.5 * km);

/** About how many minutes a property is from a client's anchor, or null when either place is not known yet. */
export function minutesToAnchor(a: Pick<Applicant, 'anchor' | 'anchor_postcode'>, p: { postcode: string | null; address_line: string }): number | null {
  const from = pointOf(anchorKey(a));
  const to = pointOf(placeKey(p));
  return from && to ? travelMins(kmBetween(from, to)) : null;
}

// ── Where a council is (housing officers on the map) ───────────────

/** The key a council's place is remembered under ("council:Harrow"); read it with `pointOf`. */
export const councilKey = (council: string) => `council:${council}`;

/** The middle of some points: plain averaging is close enough across one council. */
export function middleOf(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

/** Place councils: the middle of their postcode districts, else their name looked up on postcodes.io's list of
 *  places (towns and cities first). Only council names and districts are sent, never an officer or a client. */
export async function locateCouncils(councils: Array<{ council: string; districts: string[]; query: string }>): Promise<void> {
  const todo = councils.filter((c) => !known.has(councilKey(c.council)));
  if (!todo.length) return;
  await locate(todo.flatMap((c) => c.districts));
  const byName = todo.filter((c) => !c.districts.length);
  for (const c of todo) {
    if (c.districts.length) known.set(councilKey(c.council), middleOf(c.districts.map((d) => known.get(d) ?? null).filter((x): x is LatLng => !!x)));
  }
  for (let i = 0; i < byName.length; i += 4) {
    await Promise.all(byName.slice(i, i + 4).map(async (c) => {
      const r = await fetch(`${API}/places?q=${encodeURIComponent(c.query)}&limit=10`);
      if (!r.ok) { if (r.status === 404) known.set(councilKey(c.council), null); else throw new Error(`postcodes.io ${r.status}`); return; }
      const j = await r.json() as { result: Array<{ name_1: string; local_type: string; latitude: number | null; longitude: number | null }> | null };
      const hits = (j.result ?? []).filter((x) => x.latitude != null && x.longitude != null);
      const named = hits.filter((x) => x.name_1.toLowerCase() === c.query.toLowerCase());
      const best = named.find((x) => /^(City|Town)$/.test(x.local_type)) ?? named[0] ?? hits.find((x) => /^(City|Town)$/.test(x.local_type)) ?? null;
      known.set(councilKey(c.council), best ? [best.latitude!, best.longitude!] : null);
    }));
  }
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

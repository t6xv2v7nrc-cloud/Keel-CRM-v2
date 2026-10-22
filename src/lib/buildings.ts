// Flats in one building. "Flat 2, 12 Station Road, Harrow HA1 2AA", "Ground floor flat, 12 Station Road" and "12A
// Station Road" are all 12 Station Road: once a client has turned one of them down, none of the others is offered to
// them (matchRules.ts, `turned_down`).

import type { Deal } from './types';
import { MOVED_IN_ELSEWHERE } from './viewings';

export interface Building { name: string | null; num: string | null; street: string | null; postcode: string | null }

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
// a unit within a building, at the start of an address
const UNIT = /^(?:(?:flat|apartment|apt|unit|room|studio|maisonette|suite)\.?\s*(?:no\.?\s*)?[0-9]*[a-z]?\b|(?:lower\s+ground|upper\s+ground|ground|basement|first|second|third|fourth|top|\d+(?:st|nd|rd|th))\s+floor(?:\s+(?:flat|front|rear|back|studio|apartment|room))*)[\s,.-]*/i;
const STREET_WORDS: Record<string, string> = {
  road: 'rd', street: 'st', avenue: 'ave', lane: 'ln', close: 'cl', drive: 'dr', gardens: 'gdns', court: 'ct', crescent: 'cres',
  place: 'pl', terrace: 'ter', grove: 'gr', square: 'sq', park: 'pk', mews: 'mews', way: 'way', hill: 'hill', parade: 'pde',
};
const tidy = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .split(' ').map((w) => STREET_WORDS[w] ?? w).join(' ');

/** The building an address is in: its house number and street (or its name), and its postcode when it has one. */
export function buildingOf(address: string, postcode?: string | null): Building {
  const pc = POSTCODE.exec(postcode ?? '') ?? POSTCODE.exec(address);
  let rest = address.replace(POSTCODE, ' ').replace(/\([^)]*\)/g, ' ');
  // units first: "Flat 2,", "Ground floor flat", "Flat 2 12 Station Road"
  for (let i = 0; i < 3; i++) {
    const before = rest;
    rest = rest.trim().replace(UNIT, '');
    if (rest === before.trim()) break;
  }
  const parts = rest.split(',').map((x) => x.trim()).filter(Boolean);
  let name: string | null = null, num: string | null = null, street: string | null = null;
  for (const part of parts) {
    const numbered = /^(\d+)\s*[a-z]?\b[\s,]*(.*)$/i.exec(part);
    if (numbered && numbered[2]) { num = numbered[1]; street = tidy(numbered[2]); break; }
    if (numbered && !numbered[2]) { num = numbered[1]; continue; } // "12, Station Road"
    if (num && !street) { street = tidy(part); break; }
    if (!name) { name = tidy(part); continue; }
    street = tidy(part);
    break;
  }
  return { name: num ? null : name, num, street, postcode: pc ? `${pc[1]}${pc[2]}`.toUpperCase() : null };
}

/** Whether two addresses are in the same building: the same number and street (or building name), and the same
 *  postcode when both have one. */
export function sameBuilding(a: Building, b: Building): boolean {
  if (a.postcode && b.postcode && a.postcode !== b.postcode) return false;
  if (a.num && b.num) return a.num === b.num && !!a.street && a.street === b.street;
  if (a.name && b.name) return a.name === b.name && (!a.street || !b.street || a.street === b.street);
  return false;
}

// reasons that are about the moment, not the place: the client may still want this building
const NOT_THE_PLACE = ['let to someone else', 'landlord pulled out', 'client did not turn up', 'client stopped replying', 'client found somewhere else', MOVED_IN_ELSEWHERE.toLowerCase()];

/** The client turned this one down (or it could not work for them there): they said no at a viewing, or it fell through
 *  for a reason about the place, the landlord or the money. Let to someone else, a landlord pulling out, or the client
 *  going quiet or housed elsewhere do not count. */
export function turnedDown(d: Pick<Deal, 'status' | 'fell_through_reason'> & Partial<Pick<Deal, 'viewing_outcome'>>): boolean {
  if (d.viewing_outcome === 'declined') return true;
  if (d.status !== 'fell_through') return false;
  const why = (d.fell_through_reason ?? '').trim().toLowerCase();
  return !NOT_THE_PLACE.some((x) => why.startsWith(x));
}

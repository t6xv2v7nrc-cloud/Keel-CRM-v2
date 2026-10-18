// Whether a property is fit to send: its LHA rate and gap, what kind of place it is, who it suits,
// whether its safety papers are complete and in date, and the flags that follow (Step 2 of the update brief).
//
//   Red    the rent is above the LHA rate for its size in its BRMA (gap above 0)
//   Amber  a shared-kitchen unit with nobody marked as suited to it; outside Greater London (any outreach to a
//          London council); or safety papers recorded here that have run out or fall below the minimum
//   Grey   marked Not ready by hand (0025), with the reason
//
// Ridwan's rule: the suppliers make sure their checks are done, so a property is ready to send by default. Missing
// papers or photos never hold one back; recorded ones that have lapsed are a warning. The LHA rate, the gaps and
// "papers complete" are always worked out here, never typed. Red and grey are what stop a property going out
// (`sendBlockers`).

import type { AccommodationType, Property } from './types';
import { lhaCheck, rateFor } from './lha';
import type { LhaCheck } from './lha';
import { LONDON_BOROUGHS, boroughFromDistrict, canonicalBorough, districtOf } from './london';
import { money, shortDate } from './format';
import { todayIso } from './calls';

export const ACCOMMODATION_LABEL: Record<AccommodationType, string> = {
  self_contained: 'Self-contained', shared_kitchen: 'Shared kitchen', hmo_room: 'HMO room',
};
export const SUITS = ['uc_35_plus', 'sar_exempt', 'under_35_standard', 'couples', 'families'] as const;
export type Suits = typeof SUITS[number];
export const SUITS_LABEL: Record<Suits, string> = {
  uc_35_plus: 'UC 35 plus', sar_exempt: 'SAR-exempt', under_35_standard: 'Under 35 standard', couples: 'Couples', families: 'Families',
};
export const BILLS = ['water', 'gas', 'electricity', 'council_tax', 'internet', 'tv_licence'] as const;
export const BILLS_LABEL: Record<typeof BILLS[number], string> = {
  water: 'Water', gas: 'Gas', electricity: 'Electricity', council_tax: 'Council tax', internet: 'Internet', tv_licence: 'TV licence',
};

type ForChecks = Pick<Property, 'address_line' | 'postcode' | 'borough' | 'property_type' | 'bedrooms' | 'rent_pcm' | 'rent_text' | 'notes'>
  & Partial<Pick<Property, 'lha_area' | 'accommodation_type' | 'suitable_for' | 'gas_expiry' | 'no_gas' | 'eicr_expiry' | 'epc_rating'
    | 'licence_needed' | 'licence_no' | 'licence_expiry' | 'alarms_checked' | 'photo_count' | 'photo_urls' | 'not_ready_at' | 'not_ready_note'>>;

/** What kind of place: as set, or read from its type and notes (then `estimated`). */
export function accommodationOf(p: Pick<Property, 'property_type' | 'notes'> & Partial<Pick<Property, 'accommodation_type'>>):
  { type: AccommodationType; estimated: boolean } | null {
  if (p.accommodation_type) return { type: p.accommodation_type, estimated: false };
  const t = (p.property_type ?? '').toLowerCase();
  const text = `${t} ${(p.notes ?? '').toLowerCase()}`;
  if (!t) return null;
  const ensuite = /en[- ]?suite/.test(t);
  if (/\bhmo\b/.test(t) || (/\broom\b/.test(t) && !ensuite && !/\bbed\b/.test(t))) return { type: 'hmo_room', estimated: true };
  if ((ensuite && /\b(room|studio)\b/.test(t)) || (/\b(room|studio|bedsit)\b/.test(t) && /\bshared\s+(kitchen|bathroom|facilities)\b/.test(text))) {
    return { type: 'shared_kitchen', estimated: true };
  }
  if (/\b(studio|bedsit|flat|house|maisonette|bungalow|apartment)\b|\d\s*-?\s*bed/.test(t)) return { type: 'self_contained', estimated: true };
  return null;
}

/** Inside Greater London (the 32 boroughs and the City)? null when there is no postcode or borough to tell by. */
export function inGreaterLondon(p: Pick<Property, 'postcode' | 'address_line' | 'borough'>): boolean | null {
  const district = districtOf(p.postcode ?? '') ?? districtOf(p.address_line);
  const borough = boroughFromDistrict(district) ?? canonicalBorough(p.borough);
  if (borough) return LONDON_BOROUGHS.has(borough);
  // a postcode we know nothing about is outside London: every London district is in the map
  return district ? false : null;
}

export interface Papers {
  /** false until 0019 is run (nothing is recorded yet, so nothing can be judged) */
  known: boolean;
  complete: boolean;
  missing: string[];
  /** out of date, or below the legal minimum */
  failing: string[];
}

const yearAgo = (today: string) => { const [y, m, d] = today.split('-').map(Number); return `${y - 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };

/** Whether the safety papers are all there and in date. A licence is needed for an HMO room, or when marked needed or numbered. */
export function papersFor(p: ForChecks, today = todayIso()): Papers {
  if (p.gas_expiry === undefined && p.eicr_expiry === undefined) return { known: false, complete: false, missing: [], failing: [] };
  const missing: string[] = [], failing: string[] = [];
  const dated = (v: string | null | undefined, name: string) => {
    if (!v) missing.push(name);
    else if (v < today) failing.push(`${name} ran out ${shortDate(v)}`);
  };
  if (!p.no_gas) dated(p.gas_expiry, 'gas safety certificate');
  dated(p.eicr_expiry, 'electrical report (EICR)');
  if (!p.epc_rating) missing.push('EPC rating');
  else if (/^[FG]$/.test(p.epc_rating)) failing.push(`EPC ${p.epc_rating}, below the legal minimum E`);
  const licence = p.licence_needed === true || p.accommodation_type === 'hmo_room' || !!p.licence_no?.trim();
  if (licence) {
    if (!p.licence_no?.trim()) missing.push('licence number');
    dated(p.licence_expiry, 'licence');
  }
  if (!p.alarms_checked) missing.push('alarms check');
  else if (p.alarms_checked < yearAgo(today)) failing.push(`alarms last checked ${shortDate(p.alarms_checked)}`);
  return { known: true, complete: missing.length === 0 && failing.length === 0, missing, failing };
}

export interface Flag { tone: 'red' | 'amber' | 'grey'; key: 'over_lha' | 'suits_not_set' | 'outside_london' | 'papers_lapsed' | 'not_ready'; words: string; detail?: string }

export interface Checks {
  lha: LhaCheck | null;
  /** rent minus the LHA rate for its size (positive is over) */
  gap: number | null;
  /** rent minus the shared accommodation rate, for shared-kitchen units and HMO rooms only */
  sarGap: number | null;
  sar: number | null;
  accommodation: { type: AccommodationType; estimated: boolean } | null;
  suits: Suits[];
  london: boolean | null;
  papers: Papers;
  photos: number;
  flags: Flag[];
}

const gapWords = (g: number) => (Math.abs(g) < 0.005 ? 'at' : `${money(Math.abs(g))} ${g > 0 ? 'over' : 'under'}`);

/** Everything worked out about a property, and its flags. */
export function checksFor(p: ForChecks, today = todayIso()): Checks {
  const lha = lhaCheck(p);
  const gap = lha?.diff ?? null;
  const accommodation = accommodationOf(p);
  const sharedUnit = accommodation?.type === 'shared_kitchen' || accommodation?.type === 'hmo_room';
  const sar = sharedUnit && lha ? rateFor(lha.area.brma, 'shared') : null;
  const rent = lha?.rent ?? p.rent_pcm ?? null;
  const sarGap = sar !== null && rent !== null ? Math.round((rent - sar) * 100) / 100 : null;
  const suits = (p.suitable_for ?? []).filter((s): s is Suits => (SUITS as readonly string[]).includes(s));
  const london = inGreaterLondon(p);
  const papers = papersFor(p, today);
  // photos ready to send: as counted, or the links saved for alerts (0024), whichever is more
  const photos = Math.max(p.photo_count ?? 0, (p.photo_urls ?? []).filter(Boolean).length);

  const flags: Flag[] = [];
  if (gap !== null && gap > 0.005) flags.push({ tone: 'red', key: 'over_lha', words: `${money(gap)} over LHA`, detail: `The rent is above the ${lha!.size === 'shared' ? 'shared' : `${lha!.size} bed`} LHA rate of ${money(lha!.rate)} in ${lha!.area.brma}.` });
  if (accommodation?.type === 'shared_kitchen' && suits.length === 0) flags.push({ tone: 'amber', key: 'suits_not_set', words: 'Suits not set', detail: 'mark who a shared-kitchen unit suits, so it goes to the right clients' });
  if (london === false) flags.push({ tone: 'amber', key: 'outside_london', words: 'Outside Greater London', detail: 'not offered to London councils by default' });
  // papers recorded here that have run out are worth a word with the supplier; missing ones are theirs to hold
  if (papers.failing.length) flags.push({ tone: 'amber', key: 'papers_lapsed', words: 'Check the papers', detail: `${papers.failing.join(', ')}: ask the supplier` });
  if (p.not_ready_at) {
    flags.push({ tone: 'grey', key: 'not_ready', words: 'Marked not ready', detail: p.not_ready_note?.trim() || `since ${shortDate(p.not_ready_at)}` });
  }
  return { lha, gap, sarGap, sar, accommodation, suits, london, papers, photos, flags };
}

/** Why a property cannot be sent: over LHA, or marked not ready by hand. Empty means it can go: a property is
 *  ready by default, as the suppliers see to its checks. */
export function sendBlockers(c: Pick<Checks, 'flags'>): string[] {
  return c.flags.filter((f) => f.tone === 'red' || f.tone === 'grey').map((f) => (f.detail ? `${f.words}: ${f.detail}` : f.words));
}

/** "BRMA Outer North London · 1 bed LHA £1,150 · £50 under · shared rate £595 (£55 over)" */
export function lhaLine(c: Checks): string | null {
  if (!c.lha) return null;
  const size = c.lha.size === 'shared' ? 'shared' : `${c.lha.size} bed`;
  const parts = [`${c.lha.area.brma}`, `${size} LHA ${money(c.lha.rate)}`];
  if (c.gap !== null) parts.push(`${gapWords(c.gap)}${Math.abs(c.gap) < 0.005 ? ' LHA' : ''}`);
  if (c.sar !== null) parts.push(`shared rate ${money(c.sar)}${c.sarGap !== null ? ` (${gapWords(c.sarGap)})` : ''}`);
  return parts.join(' · ');
}

/** "Ground floor, no lift", "Floor 3, lift", "Basement" */
export function floorWords(floor: number | null | undefined, lift: boolean | null | undefined): string | null {
  if (floor == null) return lift == null ? null : lift ? 'Lift' : 'No lift';
  const f = floor === 0 ? 'Ground floor' : floor < 0 ? 'Basement' : `Floor ${floor}`;
  return lift == null ? f : `${f}, ${lift ? 'lift' : 'no lift'}`;
}

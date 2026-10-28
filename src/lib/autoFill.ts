// Filling in a client's empty answers from their own words (brief A4): who is moving in (household, adults,
// children), their age band and the bedrooms they need. Used when a client arrives from the Bin, when their notes
// or must-haves are saved, and by the one-off backfill on Settings (A9, which shows every change before writing).
//
// Only empty answers are filled. A typed value is never changed, and an answer that disagrees with what their words
// say is left for a person: the Profile card says "Check household: notes say ..." instead.
//   empty   household and age band: not set; bedrooms needed: not set; adults: not set, or the standard 1 while the
//           household is not set; children: not set, or 0 while the household is not set or is a family
//   sure    a household reading of 70% or more; an age or age band they or their officer gave; bedrooms they asked for

import type { Applicant } from './types';
import { readAgeText, readHouseholdText } from './readNotes';
import { readBeds } from './propertyMatch';
import { HOUSEHOLD_LABEL } from './tiering';

export type FillField = 'household_type' | 'adults' | 'children' | 'age_band' | 'bedrooms_needed';
export const FILL_LABEL: Record<FillField, string> = {
  household_type: 'Household', adults: 'Adults', children: 'Children', age_band: 'Age band', bedrooms_needed: 'Bedrooms needed',
};

export interface Fill {
  field: FillField;
  from: string | number | null;
  to: string | number;
  /** the new value in words: "Family with children", "Under 35", "2" */
  words: string;
  /** the words it was read from */
  source: string;
}

export type FillInput = Pick<Applicant, 'notes' | 'requirements' | 'household_type' | 'adults' | 'children' | 'date_of_birth'>
  & Partial<Pick<Applicant, 'age_band' | 'bedrooms_needed'>>;

const AGE_WORDS = { under_35: 'Under 35', '35_plus': '35 or over' } as const;
export const bedsWords = (n: number) => (n === 0 ? 'Studio' : `${n} ${n === 1 ? 'bedroom' : 'bedrooms'}`);
const quote = (text: string, at: number, length: number) => text.slice(at, at + length).trim();
// where they said the size, for the source words: "2/3 bed", "studio or 1 bed", "Three-bed"
const BEDS_SAID = /\b(?:studio|bedsit)s?\b(?:\s*(?:or|\/)\s*(?:an?\s+)?(?:\d|one|two)\s*[- ]?\s*bed(?:room)?s?)?|\b(?:\d|one|two|three|four|five)(?:\s*(?:-|–|to|or|\/)\s*(?:\d|one|two|three|four|five))?\s*[- ]?\s*bed(?:room)?s?\b/i;

/** What can be filled in from a client's own words, and the patch that does it. Pass `has` to leave out columns the
 *  database does not have yet (age_band before 0023, bedrooms_needed before 0028). */
export function autoFill(a: FillInput, has: { ageBand?: boolean; bedrooms?: boolean } = {}): { patch: Partial<Applicant>; fills: Fill[] } {
  const text = [a.notes, a.requirements].filter(Boolean).join('\n');
  const fills: Fill[] = [];
  if (!text.trim()) return { patch: {}, fills };
  const typedHousehold = a.household_type === 'single' || a.household_type === 'couple' || a.household_type === 'family' || a.household_type === 'other';

  // Who is moving in
  const h = readHouseholdText(text);
  if (h && h.confidence >= 0.7) {
    const source = quote(text, h.at, h.length);
    const household = typedHousehold ? a.household_type : h.type;
    if (!typedHousehold) fills.push({ field: 'household_type', from: a.household_type || null, to: h.type, words: HOUSEHOLD_LABEL[h.type], source });
    // head counts only when they agree with the household (a typed single is not given children: that is a check)
    if (household === h.type) {
      const adultsEmpty = a.adults == null || (a.adults === 1 && !typedHousehold);
      if (adultsEmpty && h.adults !== undefined && h.adults !== (a.adults ?? null)) {
        fills.push({ field: 'adults', from: a.adults ?? null, to: h.adults, words: String(h.adults), source });
      }
      const childrenEmpty = a.children == null || (a.children === 0 && (!typedHousehold || a.household_type === 'family'));
      if (childrenEmpty && h.type === 'family' && h.children !== undefined && h.children > 0) {
        fills.push({ field: 'children', from: a.children ?? null, to: h.children, words: String(h.children), source });
      }
    }
  }

  // Age band (a date of birth already says it)
  if (has.ageBand !== false && !a.age_band && !a.date_of_birth) {
    const age = readAgeText(text);
    if (age?.band) fills.push({ field: 'age_band', from: null, to: age.band, words: AGE_WORDS[age.band], source: quote(text, age.at, age.length) });
  }

  // Bedrooms they need: the smallest they asked for ("2/3 bed" is 2; "studio or 1 bed" is a studio)
  if (has.bedrooms !== false && a.bedrooms_needed == null) {
    const beds = readBeds(text);
    if (beds) {
      const m = BEDS_SAID.exec(text);
      fills.push({ field: 'bedrooms_needed', from: null, to: beds.min, words: bedsWords(beds.min), source: m ? m[0].trim() : '' });
    }
  }

  const patch = Object.fromEntries(fills.map((f) => [f.field, f.to])) as Partial<Applicant>;
  return { patch, fills };
}

/** "household family with children, children 3, bedrooms needed 2" for the timeline. */
export const fillWords = (fills: Fill[]) => fills.map((f) => `${FILL_LABEL[f.field].toLowerCase()} ${f.words.toLowerCase()}`).join(', ');

// ── The one-off backfill (A9) ──────────────────────────────────────
// Every client still being housed or housed (not lost), with what their own words would fill in. Shown in full on
// Settings before anything is written; Apply writes exactly these rows.

export interface BackfillRow { id: string; name: string; stage: Applicant['stage']; fills: Fill[] }

export function backfillPlan(applicants: Applicant[]): BackfillRow[] {
  return applicants
    .filter((a) => a.stage !== 'lost')
    .map((a) => ({ id: a.id, name: a.full_name, stage: a.stage, fills: autoFill(a, { ageBand: 'age_band' in a, bedrooms: 'bedrooms_needed' in a }).fills }))
    .filter((r) => r.fills.length > 0)
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** The dry run as plain text, one line per change: "Lubna Hassan | Bedrooms needed | (empty) → Studio | “Studio or HMO room”". */
export function backfillText(rows: BackfillRow[]): string {
  const old = (v: string | number | null) => (v === null || v === '' ? '(empty)' : String(v));
  return rows.flatMap((r) => r.fills.map((f) => `${r.name} | ${FILL_LABEL[f.field]} | ${old(f.from)} → ${f.words} | “${f.source}”`)).join('\n');
}

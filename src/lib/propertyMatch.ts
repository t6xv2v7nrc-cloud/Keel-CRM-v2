// Matches available properties to active clients.
//
// Each client is scored on area (did they ask for this place / borough /
// postcode, or are they registered with that council), size (does it fit the
// household), rent (within budget, or LHA rent for someone on benefits) and
// priority (tier, urgency). Hard mismatches (a room for a family, a flat far
// too small) are left out entirely. Every match carries plain-English reasons
// and cautions so the decision stays with you.

import type { Applicant } from './types';
import { benefitsOf, effectiveTier, householdOf, isUrgent } from './search';
import type { HouseholdKey } from './search';
import { URGENCY_LABEL } from './tiering';
import {
  areasIn, boroughFromDistrict, boroughOfArea, boroughsIn, canonicalBorough, districtOf, districtsIn,
  regionBoroughs, titleCase,
} from './london';

export interface PropertyLike {
  address_line: string;
  postcode: string | null;
  area: string | null;
  borough: string | null;
  property_type: string | null;
  bedrooms: number | null;
  rent_pcm: number | null;
  rent_text: string | null;
  furnished: string | null;
  notes: string | null;
}

export type Strength = 'strong' | 'good' | 'possible';

export interface Match {
  applicant: Applicant;
  score: number;
  strength: Strength;
  reasons: string[];
  cautions: string[];
}

const MATCHABLE_STAGES = new Set(['lead', 'referred', 'viewing', 'offer']);
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const n = (s: string) => NUM[s.toLowerCase()] ?? Number(s);
const money = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;

// ── What a client needs ────────────────────────────────────────────

interface Needs {
  wantedAreas: string[];
  wantedDistricts: string[];
  wantedBoroughs: Map<string, string>; // borough → why ("Asked for Tottenham")
  councilBorough: string | null;
  flexible: boolean;
  beds: { min: number; max: number; asked: boolean } | null;
  household: HouseholdKey | null;
  children: number;
  needsStepFree: boolean;
  furnished: 'yes' | 'no' | null;
  budget: number | null;
  onBenefits: boolean;
}

export function clientNeeds(a: Applicant): Needs {
  const text = [a.notes, a.requirements].filter(Boolean).join(' \n ');
  const household = householdOf(a);
  const children = Math.max(a.children ?? 0, household === 'family' && !a.children ? 1 : 0);

  const wantedAreas = areasIn(text);
  const wantedBoroughs = new Map<string, string>();
  for (const area of wantedAreas) {
    const b = boroughOfArea(area);
    if (b && !wantedBoroughs.has(b)) wantedBoroughs.set(b, `Asked for ${titleCase(area)}, same borough (${b})`);
  }
  for (const b of boroughsIn(text)) if (!wantedBoroughs.has(b)) wantedBoroughs.set(b, `Asked for ${b}`);
  const regionText = text.match(/\b(north|south|east|west)(\s+(east|west))?\s+london\b/i)?.[0];
  for (const b of regionBoroughs(text)) if (!wantedBoroughs.has(b)) wantedBoroughs.set(b, `Wants ${titleCase(regionText ?? 'the area')}`);

  // Bedrooms: what they asked for, else what the household needs
  let beds: Needs['beds'] = null;
  const range = text.match(/\b(\d|one|two|three|four)\s*(?:-|–|to|or)\s*(\d|one|two|three|four)\s*[- ]?\s*bed/i);
  const single = text.match(/\b(\d|one|two|three|four|five)\s*[- ]?\s*bed(?:room)?s?\b/i);
  if (range) beds = { min: n(range[1]), max: n(range[2]), asked: true };
  else if (single) beds = { min: n(single[1]), max: n(single[1]), asked: true };
  else if (/\bstudio|bedsit\b/i.test(text)) beds = { min: 0, max: 1, asked: true };
  else if (household === 'family' || children > 0) {
    const min = Math.max(2, 1 + Math.floor(children / 2));
    beds = { min, max: children >= 2 ? min + 1 : min, asked: false };
  } else if (household === 'single' || household === 'couple') beds = { min: 0, max: 1, asked: false };

  return {
    wantedAreas,
    wantedDistricts: districtsIn(text),
    wantedBoroughs,
    councilBorough: canonicalBorough(a.council || a.referring_borough),
    flexible: /\b(anywhere|any\s+area|anywhere\s+in\s+london|flexible\s+on\s+area|open\s+to\s+(?:any|all|other)\s+areas?)\b/i.test(text),
    beds,
    household,
    children,
    needsStepFree: /\b(ground\s+floor|wheelchair|step[- ]?free|no\s+stairs|can'?t\s+(?:do|manage)\s+stairs|mobility)\b/i.test(text),
    furnished: /\bunfurnished\b/i.test(text) ? 'no' : /\bfurnished\b/i.test(text) ? 'yes' : null,
    budget: a.budget_pcm ?? null,
    onBenefits: benefitsOf(a).some((b) => b.key === 'uc' || b.key === 'hb'),
  };
}

// ── What a property offers ─────────────────────────────────────────

type Kind = 'room' | 'studio' | 'flat' | 'unknown';

function propertyFacts(p: PropertyLike) {
  const type = p.property_type ?? '';
  const kind: Kind = /\b(room|hmo)\b/i.test(type) && !/bed/i.test(type) ? 'room'
    : /\bstudio|bedsit\b/i.test(type) ? 'studio'
    : p.bedrooms != null || /bed/i.test(type) ? 'flat' : 'unknown';
  const beds = kind === 'room' || kind === 'studio' ? 0 : p.bedrooms;
  const district = districtOf(p.postcode ?? '') ?? districtOf(p.address_line);
  const borough = canonicalBorough(p.borough) ?? boroughFromDistrict(district);
  const areas = new Set([
    ...areasIn(p.area),
    // a known place in the address counts only if it is in the same borough ("Harrow Road, W9" is not Harrow)
    ...areasIn(p.address_line).filter((x) => boroughOfArea(x) === borough),
  ]);
  const text = `${type} ${p.notes ?? ''}`;
  return {
    kind, beds, district, borough, areas,
    stepFree: /\b(ground\s+floor|step[- ]?free|level\s+access|lift|bungalow)\b/i.test(text),
    furnished: p.furnished ? !/^unfurnished$/i.test(p.furnished) : null,
    lha: /lha/i.test(p.rent_text ?? ''),
  };
}

const householdWords = (x: Needs) =>
  x.household === 'family' || x.children > 0 ? `family with ${x.children} ${x.children === 1 ? 'child' : 'children'}`
  : x.household === 'couple' ? 'couple' : x.household === 'single' ? 'single' : 'client';

// ── Scoring ────────────────────────────────────────────────────────

export function scoreMatch(p: PropertyLike, a: Applicant): Match | null {
  if (!MATCHABLE_STAGES.has(a.stage)) return null;
  const need = clientNeeds(a);
  const f = propertyFacts(p);
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;
  const bedLabel = (b: number) => (b === 0 ? (f.kind === 'room' ? 'Room' : 'Studio') : `${b} bed`);
  const askLabel = (min: number, max: number) =>
    min === max ? (min === 0 ? 'studio' : `${min} bed`) : min === 0 ? `studio or ${max} bed` : `${min}-${max} bed`;

  // Size
  const isFamily = need.household === 'family' || need.children > 0;
  if (f.kind === 'room' && (isFamily || need.household === 'couple')) return null;
  if (f.kind === 'studio' && isFamily) return null;
  if (f.beds == null) {
    cautions.push('Size not stated');
  } else if (need.beds) {
    const { min, max, asked } = need.beds;
    if (f.beds >= min && f.beds <= max) {
      score += 25;
      reasons.push(`${bedLabel(f.beds)} suits ${asked ? `their ask (${askLabel(min, max)})` : householdWords(need)}`);
    } else if (f.beds < min) {
      if (isFamily) return null; // too small for a family
      score += 3;
      cautions.push(`Smaller than asked (${askLabel(min, max)})`);
    } else if (f.beds - max === 1) {
      score += 6;
      cautions.push('Bigger than needed');
    } else {
      return null; // far too big to be affordable or suitable
    }
  }

  // Rent
  if (p.rent_pcm != null && need.budget) {
    const over = p.rent_pcm - need.budget;
    if (over <= 0) { score += 15; reasons.push(`${money(p.rent_pcm)} within ${money(need.budget)} budget`); }
    else if (over <= need.budget * 0.1) { score += 3; cautions.push(`${money(over)} over budget`); }
    else { score -= 20; cautions.push(`${money(over)} over budget`); }
  } else if (f.lha) {
    if (need.onBenefits) { score += 15; reasons.push(`${p.rent_text} rent, on benefits`); }
    else score += 5;
  }

  // Area
  const askedArea = need.wantedAreas.find((x) => f.areas.has(x));
  const askedDistrict = f.district && need.wantedDistricts.includes(f.district) ? f.district : null;
  const boroughWhy = f.borough ? need.wantedBoroughs.get(f.borough) : undefined;
  const hasWants = need.wantedAreas.length > 0 || need.wantedDistricts.length > 0 || need.wantedBoroughs.size > 0;
  if (askedArea) { score += 45; reasons.push(`Asked for ${titleCase(askedArea)}`); }
  else if (askedDistrict) { score += 40; reasons.push(`Asked for ${askedDistrict}`); }
  else if (boroughWhy) { score += 32; reasons.push(boroughWhy); }
  else if (f.borough && need.councilBorough === f.borough) { score += 22; reasons.push(`Registered with ${f.borough} council`); }
  else if (need.flexible && !hasWants) { score += 8; reasons.push('Open to any area'); }
  else if (hasWants && f.borough) {
    score -= 30;
    const wants = need.wantedAreas.length ? `Asked for ${titleCase(need.wantedAreas[0])}`
      : need.wantedDistricts.length ? `Asked for ${need.wantedDistricts[0]}`
      : [...need.wantedBoroughs.values()][0];
    cautions.push(`${wants}, this is ${f.borough}`);
  }
  if (need.councilBorough && f.borough === need.councilBorough && (askedArea || askedDistrict || boroughWhy)) {
    score += 5; // their own council's area as well as their ask
  }

  // Needs
  if (need.needsStepFree) {
    if (f.stepFree) { score += 10; reasons.push('Ground floor / step-free'); }
    else cautions.push('Needs ground floor or step-free: check');
  }
  if (need.furnished === 'yes' && f.furnished === true) { score += 5; reasons.push(p.furnished ?? 'Furnished'); }
  if (need.furnished === 'no' && f.furnished === true) cautions.push('Wants unfurnished');

  // Priority
  const tier = effectiveTier(a);
  if (tier === 1) { score += 10; reasons.push('Tier 1'); } else if (tier === 2) { score += 4; }
  if (isUrgent(a)) { score += 10; reasons.push(`Urgent: ${URGENCY_LABEL[a.urgency ?? ''] ?? a.urgency}`); }

  const areaFit = Boolean(askedArea || askedDistrict || boroughWhy || (f.borough && need.councilBorough === f.borough) || (need.flexible && !hasWants));
  const rentFit = reasons.some((r) => /within|rent, on benefits/.test(r));
  if (!areaFit && !rentFit && !isUrgent(a)) return null;
  if (score < 30) return null;
  return { applicant: a, score, strength: score >= 70 ? 'strong' : score >= 45 ? 'good' : 'possible', reasons, cautions };
}

const byBest = (x: Match, y: Match) =>
  y.score - x.score || effectiveTier(x.applicant) - effectiveTier(y.applicant);

export function matchesForProperty(p: PropertyLike, applicants: Applicant[]): Match[] {
  return applicants.map((a) => scoreMatch(p, a)).filter((m): m is Match => m !== null).sort(byBest);
}

export interface PropertyMatch<P extends PropertyLike> { property: P; match: Match }

export function matchesForApplicant<P extends PropertyLike>(a: Applicant, properties: P[]): PropertyMatch<P>[] {
  return properties
    .map((property) => ({ property, match: scoreMatch(property, a) }))
    .filter((x): x is PropertyMatch<P> => x.match !== null)
    .sort((x, y) => y.match.score - x.match.score);
}

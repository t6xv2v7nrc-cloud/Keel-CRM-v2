// Matches available properties to active clients.
//
// Each client is scored on area (did they ask for this place / borough /
// postcode, or are they registered with that council), size (does it fit the
// household), rent (within budget, or LHA rent for someone on benefits) and
// priority (tier, urgency). Hard mismatches (a room for a family, a flat far
// too small) are left out entirely. The net is deliberately wide: the borough
// next door to an ask, next door to their council, or a client who never said
// where they want to live all count, ranked below a direct fit. Every match
// carries plain-English reasons and cautions so the decision stays with you.
//
// House rule (Settings): anything over the premium rent (standard £1,300 pcm)
// is always offered to clients on PIP (alone or with UC / LCWRA) or in
// full-time work, whatever their stated budget or area, unless the property
// physically cannot work for them.

import type { Applicant } from './types';
import { benefitsOf, effectiveTier, householdOf, isUrgent } from './search';
import type { HouseholdKey } from './search';
import { tierCount, tierLabel, URGENCY_LABEL } from './tiering';
import { activeSettings } from './settings';
import { clientLhaSize, lhaCheck, rateFor, sizeWords } from './lha';
import {
  areNeighbours, areasIn, boroughFromDistrict, boroughOfArea, boroughsIn, canonicalBorough, districtOf, districtsIn,
  boroughsOfRegion, regionsIn, titleCase,
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
  lha_area?: string | null;
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
  wantedBoroughs: Map<string, { why: string; ask: string }>; // borough → why it counts, and what they asked for
  askNames: string[]; // every place they named, for "Wants X or Y, this is Z"
  councilBorough: string | null;
  flexible: boolean;
  strictArea: boolean; // "Harrow only", "nowhere else": no next-door suggestions
  openToOthers: boolean; // "I don't mind if it is further north": other areas are a caution, not a no
  selfContained: boolean; // asked for self-contained: no rooms
  premiumOk: string | null; // why they can take a property over the premium rent: "PIP", "full-time"...
  beds: { min: number; max: number; asked: boolean } | null;
  household: HouseholdKey | null;
  children: number;
  needsStepFree: boolean;
  furnished: 'yes' | 'no' | null;
  budget: number | null;
  onBenefits: boolean;
}

/** Why a client is always offered premium properties, per Settings, or null. */
function premiumReason(a: Applicant): string | null {
  const f = activeSettings().premiumFor;
  const has = (k: string) => benefitsOf(a).some((b) => b.key === k);
  if (f.pip && has('pip')) return 'PIP';
  if (f.lcwra && has('lcwra')) return 'LCWRA';
  if (f.fullTime && a.work_status === 'full_time') return 'full-time';
  if (f.partTime && a.work_status === 'part_time') return 'part-time';
  return null;
}

export function clientNeeds(a: Applicant): Needs {
  const text = [a.notes, a.requirements].filter(Boolean).join(' \n ');
  const household = householdOf(a);
  const children = Math.max(a.children ?? 0, household === 'family' && !a.children ? 1 : 0);

  const wantedAreas = areasIn(text);
  const wantedDistricts = districtsIn(text);
  const wantedBoroughs: Needs['wantedBoroughs'] = new Map();
  const want = (b: string | null, why: string, ask: string) => { if (b && !wantedBoroughs.has(b)) wantedBoroughs.set(b, { why, ask }); };
  for (const area of wantedAreas) {
    const b = boroughOfArea(area);
    want(b, `Asked for ${titleCase(area)}, same borough (${b})`, `Asked for ${titleCase(area)} (${b})`);
  }
  for (const d of wantedDistricts) {
    const b = boroughFromDistrict(d);
    want(b, `Asked for ${d}, same borough (${b})`, `Asked for ${d} (${b})`);
  }
  const askedBoroughs = boroughsIn(text);
  for (const b of askedBoroughs) want(b, `Asked for ${b}`, `Asked for ${b}`);
  const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const strictArea = /\b(nowhere\s+else|must\s+be\s+in)\b/i.test(text)
    || [...wantedAreas, ...wantedDistricts, ...askedBoroughs].some((name) =>
      new RegExp(`\\b${escape(name)}\\s+only\\b|\\bonly\\s+(?:in\\s+|around\\s+)?${escape(name)}\\b`, 'i').test(text));
  const regions = regionsIn(text);
  for (const r of regions) {
    const label = `Wants ${titleCase(r)}`;
    for (const b of boroughsOfRegion(r)) want(b, label, label);
  }
  const askNames = [...new Map(
    [...wantedAreas.map(titleCase), ...wantedDistricts, ...askedBoroughs, ...regions.map(titleCase)].map((x) => [x.toLowerCase(), x]),
  ).values()];
  const selfContained = /\bself[- ]?contained\b|\bown\s+(?:kitchen|bathroom|front\s+door)\b/i.test(text);

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
  else if (selfContained) beds = { min: 0, max: 1, asked: true }; // "a self-contained unit", household not recorded

  return {
    wantedAreas,
    wantedDistricts,
    wantedBoroughs,
    askNames,
    councilBorough: canonicalBorough(a.council || a.referring_borough),
    strictArea,
    openToOthers: /\b(?:don'?t|do\s+not|wouldn'?t|would\s+not)\s+mind\b|\bopen\s+to\b|\bnot\s+fussy\b/i.test(text),
    selfContained,
    premiumOk: premiumReason(a),
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

  const premiumRent = activeSettings().premiumRent;
  const premium = p.rent_pcm != null && p.rent_pcm > premiumRent;
  const premiumFit = premium && need.premiumOk !== null;

  // Size (a room for a family or a couple, or a studio for a family, never works)
  const isFamily = need.household === 'family' || need.children > 0;
  if (f.kind === 'room' && (isFamily || need.household === 'couple')) return null;
  if (f.kind === 'studio' && isFamily) return null;
  if (f.kind === 'room' && need.selfContained) return null;
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
    } else if (premiumFit) {
      cautions.push('Much bigger than needed');
    } else {
      return null; // far too big to be affordable or suitable
    }
  }

  // Rent: against their budget if they gave one, otherwise against their LHA
  const lha = lhaCheck(p);
  const rent = p.rent_pcm ?? lha?.rent ?? null;
  let judgedOnLha = false;
  if (premiumFit) {
    score += 15;
    reasons.push(`Over ${money(premiumRent)}, open to ${need.premiumOk} clients`);
  } else if (rent != null && need.budget) {
    const over = rent - need.budget;
    if (over <= 0) { score += 15; reasons.push(`${money(rent)} within ${money(need.budget)} budget`); }
    else if (over <= need.budget * 0.1) { score += 3; cautions.push(`${money(over)} over budget`); }
    else { score -= 20; cautions.push(`${money(over)} over budget`); }
  } else if (need.onBenefits && lha && rent != null) {
    // what they are entitled to (by household), in this property's LHA area
    const size = clientLhaSize(need.household, need.beds?.min ?? null) ?? lha.size;
    const entitled = rateFor(lha.area.brma, size) ?? lha.rate;
    const diff = Math.round(rent - entitled);
    const where = `${sizeWords(size)} LHA, ${lha.area.brma}`;
    judgedOnLha = true;
    if (diff <= 0) { score += 15; reasons.push(diff === 0 ? `At their LHA (${where})` : `${money(-diff)} under their LHA (${where})`); }
    else if (diff <= activeSettings().lhaLeeway) { score += 5; cautions.push(`${money(diff)} over their LHA (${where}): a small top-up`); }
    else { score -= 15; cautions.push(`${money(diff)} over their LHA (${where})`); }
  } else if (f.lha) {
    if (need.onBenefits) { score += 15; reasons.push(`${p.rent_text} rent, on benefits`); }
    else score += 5;
  }
  if (premium && !premiumFit && !judgedOnLha && !(need.budget && p.rent_pcm! <= need.budget)) {
    score -= 5;
    cautions.push(`Over ${money(premiumRent)}: check they can afford it`);
  }

  // Area, best fit first
  const askedArea = need.wantedAreas.find((x) => f.areas.has(x));
  const askedDistrict = f.district && need.wantedDistricts.includes(f.district) ? f.district : null;
  const boroughWant = f.borough ? need.wantedBoroughs.get(f.borough) : undefined;
  const ownCouncil = Boolean(f.borough && need.councilBorough === f.borough);
  const nextToWant = f.borough && !need.strictArea ? [...need.wantedBoroughs].find(([b]) => areNeighbours(b, f.borough!))?.[1] : undefined;
  const hasWants = need.wantedAreas.length > 0 || need.wantedDistricts.length > 0 || need.wantedBoroughs.size > 0;
  const nextToCouncil = Boolean(f.borough && need.councilBorough && areNeighbours(need.councilBorough, f.borough));
  const areaUnknown = !hasWants && !need.councilBorough && !need.flexible;
  let areaFit = true;
  if (askedArea) { score += 45; reasons.push(`Asked for ${titleCase(askedArea)}`); }
  else if (askedDistrict) { score += 40; reasons.push(`Asked for ${askedDistrict}`); }
  else if (boroughWant) { score += 32; reasons.push(boroughWant.why); }
  else if (ownCouncil) { score += 22; reasons.push(`Registered with ${f.borough} council`); }
  else if (nextToWant) { score += 15; reasons.push(`${nextToWant.ask}, ${f.borough} is next door`); }
  else if (nextToCouncil && !hasWants) { score += 12; reasons.push(`${f.borough} is next door to their council (${need.councilBorough})`); }
  else if (need.flexible && !hasWants) { score += 8; reasons.push('Open to any area'); }
  else if (areaUnknown) { score += 5; cautions.push('Area not stated: ask them'); }
  else if (hasWants && f.borough) {
    const names = need.askNames.slice(0, 3);
    const wants = `Wants ${names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0] ?? 'another area'}`;
    if (need.openToOthers && !need.strictArea) {
      score += 3;
      cautions.push(`${wants}, this is ${f.borough} (says they are open to other areas)`);
    } else {
      areaFit = false;
      score -= 30;
      cautions.push(`${wants}, this is ${f.borough}`);
    }
  } else {
    areaFit = false;
  }
  if (ownCouncil && (askedArea || askedDistrict || boroughWant)) {
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
  if (tier === 1) { score += 10; reasons.push(tierLabel(1)); } else if (tier === 2 && tierCount() > 2) { score += 4; }
  if (isUrgent(a)) { score += 10; reasons.push(`Urgent: ${URGENCY_LABEL[a.urgency ?? ''] ?? a.urgency}`); }

  const rentFit = reasons.some((r) => /within|rent, on benefits|under their LHA|At their LHA/.test(r));
  if (!premiumFit) { // the premium rule always offers it
    if (!areaFit && !rentFit && !isUrgent(a)) return null;
    if (score < 30) return null;
  }
  // Good and strong mean the area fits: an unknown or different area is never better than possible
  const areaOff = areaUnknown || !areaFit || cautions.some((c) => /open to other areas/.test(c));
  const strength: Strength = areaOff ? 'possible' : score >= 70 ? 'strong' : score >= 45 ? 'good' : 'possible';
  return { applicant: a, score, strength, reasons, cautions };
}

const RANK: Record<Strength, number> = { strong: 0, good: 1, possible: 2 };
const byBest = (x: Match, y: Match) =>
  RANK[x.strength] - RANK[y.strength] || y.score - x.score || effectiveTier(x.applicant) - effectiveTier(y.applicant);

/** Settings can hide "Possible" matches. */
const shown = (m: Match) => m.strength !== 'possible' || activeSettings().showPossibleMatches;

/**
 * The few to act on first, sized to how many qualify: every strong match (up
 * to 5), topped up with good ones to make 3, or the top 2 possibles when
 * nothing better fits. The list must already be sorted best first.
 */
export function bestFew<T>(sorted: T[], strength: (t: T) => Strength): T[] {
  const strong = sorted.filter((t) => strength(t) === 'strong').slice(0, 5);
  const good = sorted.filter((t) => strength(t) === 'good').slice(0, Math.max(0, 3 - strong.length));
  const best = [...strong, ...good];
  return best.length ? best : sorted.slice(0, 2);
}

/** A reason or caution without its detail in brackets, for one-line lists: "£4 under their LHA". */
export const brief = (s: string) => s.replace(/\s*\([^)]*\)/g, '');

export function matchesForProperty(p: PropertyLike, applicants: Applicant[]): Match[] {
  return applicants.map((a) => scoreMatch(p, a)).filter((m): m is Match => m !== null && shown(m)).sort(byBest);
}

export interface PropertyMatch<P extends PropertyLike> { property: P; match: Match }

export function matchesForApplicant<P extends PropertyLike>(a: Applicant, properties: P[]): PropertyMatch<P>[] {
  return properties
    .map((property) => ({ property, match: scoreMatch(property, a) }))
    .filter((x): x is PropertyMatch<P> => x.match !== null && shown(x.match))
    .sort((x, y) => byBest(x.match, y.match));
}

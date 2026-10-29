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
//
// House rule (Settings): a client on UC alone (no PIP or LCWRA, not working)
// can afford at most the UC-only limit (standard £1,100 pcm), whatever budget
// they gave. Anything dearer is not a match for them at all.

import type { Applicant } from './types';
import { benefitsOf, effectiveTier, householdOf, isIced, isUrgent } from './search';
import type { HouseholdKey } from './search';
import { tierCount, tierLabel, URGENCY_LABEL } from './tiering';
import { activeSettings } from './settings';
import { clientLhaSize, lhaCheck, rateFor, sizeWords } from './lha';
import { readHouseholdText } from './readNotes';
import {
  areNeighbours, areasIn, boroughFromDistrict, boroughOfArea, boroughsIn, canonicalBorough, CENTRAL_DISTRICTS, districtOf, districtsIn, districtsOfArea,
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
  /** 0019: 0 is the ground floor, below 0 a basement; and whether there is a lift */
  floor?: number | null;
  lift?: boolean | null;
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
  selfContained: boolean; // asked for nothing shared: no rooms, en-suites, HMOs or house shares
  premiumOk: string | null; // why they can take a property over the premium rent: "PIP", "full-time"...
  rentCap: number | null; // on UC alone: the most they can afford, or null if the limit does not apply
  beds: BedsAsk | null;
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

/** The most a client can afford if they are on UC alone (no PIP or LCWRA, not working), per Settings; otherwise null. */
function ucOnlyCap(a: Applicant): number | null {
  const cap = activeSettings().ucOnlyRentCap;
  if (!cap) return null;
  const has = (k: string) => benefitsOf(a).some((b) => b.key === k);
  if (!has('uc') || has('pip') || has('lcwra')) return null;
  if (a.work_status === 'full_time' || a.work_status === 'part_time') return null;
  return cap;
}

// ── Shared accommodation ───────────────────────────────────────────
// Some clients want nothing shared: no rooms, no en-suites (a room with its own
// bathroom still shares a kitchen), no HMOs or house shares. Plain studios and
// flats are fine. The client page's switch writes "Self-contained only" into
// their must-haves; the same words in their own notes count too.

export const SELF_CONTAINED_ONLY = 'Self-contained only';
const ASKS_SELF_CONTAINED = /\bself[- ]?contained\b|\bown\s+(?:kitchen|bathroom|front\s+door)\b|\b(?:no|not|nothing|never|without|don'?t\s+want(?:\s+(?:a|an|to))?)\s+(?:a\s+|an\s+)?(?:shared?|sharing|house\s*share|flat\s*share|hmo|en[- ]?suites?)\b/i;

/** Whether a client asked for nothing shared, and where: their must-haves (the switch), or their own words. */
export function selfContainedFrom(a: Pick<Applicant, 'notes' | 'requirements'>): 'must-haves' | 'notes' | null {
  if (a.requirements && ASKS_SELF_CONTAINED.test(a.requirements)) return 'must-haves';
  if (a.notes && ASKS_SELF_CONTAINED.test(a.notes)) return 'notes';
  return null;
}

/** Must-haves with "Self-contained only" added, or with every self-contained phrase taken out. */
export function withSelfContained(requirements: string | null, on: boolean): string | null {
  const parts = (requirements ?? '').split(/\s*[;,]\s*|\n+/).map((x) => x.trim()).filter(Boolean);
  const rest = parts.filter((x) => !ASKS_SELF_CONTAINED.test(x));
  const next = on ? [SELF_CONTAINED_ONLY, ...rest] : rest;
  return next.length ? next.join(', ') : null;
}

// ── Bedrooms they asked for ────────────────────────────────────────
// "2/3 bed", "2 or 3 bedroom", "1 bed, 2 bed" (every size they name: the smallest to the biggest), "studio or 1 bed",
// and "preferably a 2 bed" (the size they would most like, inside that range). Where they live now is not an ask:
// "currently in a 1 bed with 3 kids" says nothing about what they want.

export interface BedsAsk { min: number; max: number; asked: boolean; preferred?: number }

const BED_N = '(\\d|one|two|three|four|five)';
const BED_WORD = '\\s*[- ]?\\s*bed(?:room)?s?\\b';
const BED_RANGE = new RegExp(`\\b${BED_N}\\s*(?:-|–|to|or|\\/)\\s*${BED_N}${BED_WORD}`, 'gi');
const BED_ONE = new RegExp(`\\b${BED_N}${BED_WORD}`, 'gi');
const STUDIO_OR = [
  /\b(?:studio|bedsit)\s*(?:or|\/|to|-)\s*(?:an?\s+)?(\d|one|two)\s*[- ]?\s*bed/gi,
  /\b(\d|one|two)\s*[- ]?\s*bed(?:room)?(?:\s+(?:flat|place))?\s*(?:or|\/)\s*(?:an?\s+)?(?:studio|bedsit)\b/gi,
];
const PREFERRED = new RegExp(`\\b(?:preferably|ideally|prefer(?:ably|red)?|would\\s+prefer|rather)\\s+(?:a\\s+|an\\s+)?${BED_N}${BED_WORD}|\\b${BED_N}${BED_WORD}\\s*(?:\\(|,)?\\s*(?:preferably|ideally|preferred)\\b`, 'i');
// where they live now: "currently in a 1 bed", "we live in a 2 bedroom flat", "overcrowded in a one bed"
const NOW_IN = /\b(?:currently|live|living|lives|staying|stay|overcrowded|sharing|share|from)\b[^.\n]{0,20}$/i;
const NOT_WANTED = /\b(?:no|not|never|without|don'?t\s+want|doesn'?t\s+want)\s+(?:an?\s+)?$/i;
const skip = (text: string, at: number) => NOW_IN.test(text.slice(Math.max(0, at - 30), at)) || NOT_WANTED.test(text.slice(Math.max(0, at - 20), at));

export function readBeds(text: string): BedsAsk | null {
  const found: Array<{ at: number; end: number; min: number; max: number }> = [];
  const taken = (at: number, end: number) => found.some((f) => at < f.end && f.at < end);
  const add = (m: RegExpMatchArray, min: number, max: number) => {
    const at = m.index ?? 0;
    if (taken(at, at + m[0].length) || skip(text, at)) return;
    found.push({ at, end: at + m[0].length, min: Math.min(min, max), max: Math.max(min, max) });
  };
  for (const re of STUDIO_OR) for (const m of text.matchAll(re)) add(m, 0, n(m[1]));
  for (const m of text.matchAll(BED_RANGE)) add(m, n(m[1]), n(m[2]));
  for (const m of text.matchAll(BED_ONE)) add(m, n(m[1]), n(m[1]));
  // a studio named on its own: "studio or HMO room", "studio, 1 bed or 2 bed"
  const studio = [...text.matchAll(/\b(?:studio|bedsit)s?\b/gi)].find((m) => !taken(m.index ?? 0, (m.index ?? 0) + m[0].length) && !skip(text, m.index ?? 0));
  if (!found.length) return studio ? { min: 0, max: 1, asked: true } : null;
  if (studio) found.push({ at: studio.index ?? 0, end: (studio.index ?? 0) + studio[0].length, min: 0, max: 0 });
  const min = Math.min(...found.map((f) => f.min));
  const max = Math.max(...found.map((f) => f.max));
  const pref = PREFERRED.exec(text);
  const preferred = pref ? n(pref[1] ?? pref[2]) : undefined;
  return { min, max, asked: true, ...(preferred !== undefined && preferred >= min && preferred <= max ? { preferred } : {}) };
}

// worked out once per client (and again when settings change): reading their notes is the slow part of matching
const needsCache = new WeakMap<Applicant, { settings: unknown; needs: Needs }>();

export function clientNeeds(a: Applicant): Needs {
  const settings = activeSettings();
  const hit = needsCache.get(a);
  if (hit && hit.settings === settings) return hit.needs;
  const needs = readNeeds(a);
  needsCache.set(a, { settings, needs });
  return needs;
}

function readNeeds(a: Applicant): Needs {
  const text = [a.notes, a.requirements, a.postcode_area].filter(Boolean).join(' \n ');
  // who is moving in: as recorded, else as their own words say ("3 kids", "me and my partner")
  const read = readHouseholdText([a.notes, a.requirements].filter(Boolean).join('\n'));
  const household = householdOf(a) ?? read?.type ?? null;
  const readKids = household === 'family' && read?.type === 'family' ? read.children ?? 0 : 0;
  const children = (a.children ?? 0) > 0 ? a.children! : readKids > 0 ? readKids : household === 'family' ? 1 : 0;

  const wantedAreas = areasIn(text);
  // the postcode area they want (0023): districts ("HA1") or whole postcode areas ("HA", "UB")
  const areaCodes = (a.postcode_area ?? '').split(/[\s,;/]+/).flatMap(districtsOfArea);
  const wantedDistricts = [...new Set([...districtsIn(text), ...areaCodes])];
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
  const selfContained = ASKS_SELF_CONTAINED.test(text);

  // Bedrooms: what was recorded (0028), else what they asked for, else what the household needs
  let beds: Needs['beds'] = readBeds(text);
  const typed = a.bedrooms_needed;
  if (typed != null && typed >= 0) {
    // a typed number wins; a range read from their words is kept when it starts there ("2/3 bed", recorded 2)
    beds = beds && typed >= beds.min && typed <= beds.max ? { ...beds, min: typed } : { min: typed, max: typed, asked: true };
  } else if (beds) {
    // asked for
  } else if (household === 'family' || children > 0) {
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
    rentCap: ucOnlyCap(a),
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

// worked out once per property
const factsCache = new WeakMap<PropertyLike, ReturnType<typeof readFacts>>();
function propertyFacts(p: PropertyLike) {
  let f = factsCache.get(p);
  if (!f) { f = readFacts(p); factsCache.set(p, f); }
  return f;
}

function readFacts(p: PropertyLike) {
  const type = (p.property_type ?? '').replace(/_/g, ' '); // "hmo_room" is an HMO room
  // an HMO studio is a studio, not a room
  const kind: Kind = /\b(studio|bedsit)\b/i.test(type) ? 'studio'
    : /\b(room|hmo)\b/i.test(type) && !/bed/i.test(type) ? 'room'
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
  // shared: a room (en-suite or not), or a studio-sized place that says en-suite, HMO room or shared
  // (a 2 bed flat with an en-suite bathroom is not shared; an HMO studio is a studio)
  const small = kind === 'room' || kind === 'studio' || beds === 0 || beds == null;
  const shared = kind === 'room'
    || /\bhmo\s+rooms?\b|\bshared\s+(?:house|flat|kitchen|bathroom|facilities|accommodation)\b|\b(?:house|flat)\s*share\b|\broom\s+in\s+a\b/i.test(text)
    || (small && /\ben[- ]?suite\b/i.test(text));
  return {
    kind, beds, district, borough, areas, shared,
    floor: p.floor ?? null, lift: p.lift ?? null,
    stepFree: p.floor === 0 || p.lift === true || (p.lift !== false && /\b(ground\s+floor|step[- ]?free|level\s+access|lift|bungalow)\b/i.test(text) && !/\b(?:no|without\s+a?)\s*lift\b/i.test(text)),
    furnished: p.furnished ? !/^unfurnished$/i.test(p.furnished) : null,
    lha: /lha/i.test(p.rent_text ?? ''),
  };
}

/** What kind of place a property is, for the rules: a room, a studio or a flat, its bedrooms, and whether anything is
 *  shared (a room, an HMO room, a shared kitchen or bathroom) or it is an en-suite room. */
export function placeFacts(p: PropertyLike) {
  const f = propertyFacts(p);
  const ensuite = f.shared && /\ben[- ]?suite\b/i.test(`${p.property_type ?? ''} ${p.notes ?? ''}`);
  return { kind: f.kind, beds: f.beds, shared: f.shared, ensuite };
}

/** Whether someone who cannot do stairs can get in: the ground floor or a lift (recorded, or said in its notes), stairs
 *  (an upper floor or basement with no lift), or not known. "No lift" in the notes is not a lift. */
export function accessOf(p: PropertyLike): 'step_free' | 'stairs' | 'unknown' {
  const text = `${p.property_type ?? ''} ${p.notes ?? ''}`;
  const noLift = /\b(?:no|without\s+a?)\s*lift\b/i.test(text);
  if (p.floor === 0 || p.lift === true) return 'step_free';
  if (p.floor != null && p.lift === false) return 'stairs';
  if (/\b(?:ground\s+floor|step[- ]?free|level\s+access|bungalow|wheelchair\s+accessible)\b/i.test(text) && !/\b(?:no|not)\s+(?:on\s+the\s+)?ground\s+floor\b/i.test(text)) return 'step_free';
  if (!noLift && /\blift\b/i.test(text)) return 'step_free';
  if (p.floor != null && p.floor !== 0 && noLift) return 'stairs';
  return 'unknown';
}

const householdWords = (x: Needs) =>
  x.household === 'family' || x.children > 0 ? `family with ${x.children} ${x.children === 1 ? 'child' : 'children'}`
  : x.household === 'couple' ? 'couple' : x.household === 'single' ? 'single' : 'client';

// ── Scoring ────────────────────────────────────────────────────────

export function scoreMatch(p: PropertyLike, a: Applicant): Match | null {
  if (!MATCHABLE_STAGES.has(a.stage) || isIced(a)) return null; // on ice: nothing offered until they are back
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
  if (f.shared && need.selfContained) return null; // they want nothing shared
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
  // On UC alone: over the limit is not affordable, so not a match
  if (need.rentCap !== null && rent != null && rent > need.rentCap) return null;
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
  if (need.rentCap !== null) {
    if (rent == null) cautions.push(`On UC alone: check the rent is ${money(need.rentCap)} or less`);
    else if (!reasons.some((r) => /within|under their LHA|At their LHA|rent, on benefits/.test(r))) {
      score += 10;
      reasons.push(`${money(rent)} is within the ${money(need.rentCap)} limit for UC alone`);
    }
  }
  if (premium && !premiumFit && !judgedOnLha && !(need.budget && p.rent_pcm! <= need.budget)) {
    score -= 5;
    cautions.push(`Over ${money(premiumRent)}: check they can afford it`);
  }

  // Area, best fit first
  const askedArea = need.wantedAreas.find((x) => f.areas.has(x));
  const askedDistrict = f.district && need.wantedDistricts.includes(f.district) ? f.district : null;
  let boroughWant = f.borough ? need.wantedBoroughs.get(f.borough) : undefined;
  // "Central" covers central districts, not all of Lambeth or Camden: outside them it is only next door
  const offCentre = boroughWant?.ask === 'Wants Central London' && f.district !== null && !CENTRAL_DISTRICTS.has(f.district) ? boroughWant : undefined;
  if (offCentre) boroughWant = undefined;
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
  else if (offCentre) { score += 15; reasons.push(`Wants Central London, ${f.district} is just outside`); }
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

  // Needs: step-free, and for families the lower floors (a pram up three flights is no fun)
  if (need.needsStepFree) {
    if (f.stepFree) { score += 10; reasons.push(f.floor === 0 ? 'Ground floor, as they need' : f.lift ? 'Has a lift, as they need step-free' : 'Ground floor / step-free'); }
    else if (f.floor != null && f.floor !== 0) cautions.push(`Needs step-free, this is ${f.floor < 0 ? 'a basement' : `floor ${f.floor}`}: check for a lift`);
    else cautions.push('Needs ground floor or step-free: check');
  } else if (isFamily && f.floor != null) {
    if (f.floor === 0) { score += 4; reasons.push('Ground floor, easy with children'); }
    else if (f.lift) score += 2;
    else if (f.floor >= 3) { score -= 4; cautions.push(`Floor ${f.floor} with no lift: hard with children`); }
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
 * nothing better fits. The list must already be sorted best first. `most` caps
 * it (a client's page suggests the best 1 to 3).
 */
export function bestFew<T>(sorted: T[], strength: (t: T) => Strength, most = 5): T[] {
  const strong = sorted.filter((t) => strength(t) === 'strong').slice(0, Math.min(5, most));
  const good = sorted.filter((t) => strength(t) === 'good').slice(0, Math.max(0, Math.min(3, most) - strong.length));
  const best = [...strong, ...good];
  return best.length ? best : sorted.slice(0, Math.min(2, most));
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

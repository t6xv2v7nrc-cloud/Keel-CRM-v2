// Matching rules (Step 6 of the update brief), on top of the scores in propertyMatch.ts. A property is offered to a
// client only when:
//   LHA       the rent is within the LHA the client is paid in the property's LHA area (BRMA): under-35s on the shared
//             rate, couples, 35 plus and SAR-exempt on the 1 bed rate, families by bedrooms. This wins for everyone,
//             premium properties included; the "Show over LHA" switch shows the rest with a red warning.
//   UC alone  the limit for clients on UC alone (Team settings, £1,100), applied in propertyMatch.ts.
//   kind      a shared kitchen or HMO room never goes to a couple or a family; for an under-35 on the shared rate the
//             LHA rule keeps it within that rate. A property marked as suiting some clients goes only to those.
//   size      a family is never offered fewer bedrooms than they are paid for.
//   area      its LHA area is one the client wants (the areas, districts or postcode areas they gave; "London" is every
//             London area; with nothing given, their council's and the councils next door). Clients open to anywhere,
//             or who never said, are not held to it (it says so instead).
//   London    a client sent by a London housing officer is never offered anything outside Greater London; the "Show
//             outside London" switch shows it with an amber warning.
//   turned down  once a client has turned a place down, nothing else in that building is offered to them ("Flat 2" at
//             the same address as the "Flat 1" they said no to), unless they are already going for it.
//   stairs    a client who needs ground floor or step-free is never offered an upper floor with no lift, nor a place
//             whose floor or lift is not known (`access_unknown`).
//   1 bed     a single person or couple who asked for a 1 bed (not "studio or 1 bed") is never offered a studio or room.
//   top-up    over their LHA is hidden only when it is more than they said they can top up (applicants.max_top_up, 0030).
//   too far   a client who must live near someone or something (anchor, 0033) is never offered a place further than the
//             journey they said they can make; the rest are ranked by how near they are.
//   women     a client who needs a women-only place is only offered one (female_only, 0034).
//   landlord  a landlord's own rules (landlord_criteria, 0035: ages, benefits they take) are kept to.
// Warnings that do not hide: red when the property has not been confirmed available for over 7 days (0031), amber when
// there are no photos or video to send (0032).
// A client's list is ranked: self-contained, then en-suite, then rooms; exempt housing association places first for
// PIP and ESA clients; nearest to their anchor (else their areas); with photos; the most room under their LHA.
// Every match then carries one line saying why it fits, and what Keel could expect from it: the letting fee from the
// provider's usual terms, and the council incentive (on Finances already, else the most the council's scheme pays, else
// "likely" for an officer referral). On a property, clients with an incentive come first.

import type { Applicant, Deal, Property, Provider, Receivable } from './types';
import type { CouncilScheme } from './councils';
import { boroughOf } from './councils';
import { accessOf, brief, clientNeeds, placeFacts, scoreMatch } from './propertyMatch';
import type { Match, PropertyLike, Strength } from './propertyMatch';
import { rateOf } from './clientProfile';
import { accommodationOf, inGreaterLondon } from './propertyChecks';
import { brmaOfDistrict, brmasOfBorough, lhaCheck, lhaSizeOf, lhaTable, lhaVersion, londonBrmas, overLha, rateFor, sizeWords } from './lha';
import type { LhaSize, LhaTable, PropertyForLha } from './lha';
import { feeFrom, fromHousingOfficer, rentOf, usualFee } from './money';
import { providerFor } from './requests';
import { benefitCapOf, benefitsOf, councilOf, effectiveTier, isStaleReferral, sharedRateExempt } from './search';
import { geoVersion, minutesToAnchor } from './geo';
import { areNeighbours, BOROUGHS, LONDON_BOROUGHS } from './london';
import { activeSettings } from './settings';
import { money } from './format';
import { todayIso } from './calls';
import { buildingOf, sameBuilding, turnedDown } from './buildings';
import { floorWords } from './propertyChecks';
import { shortAddress, isLive } from './progress';

export type RuleProperty = PropertyLike & {
  id?: string;
  accommodation_type?: Property['accommodation_type'];
  suitable_for?: string[] | null;
  provider_id?: string | null;
  source_tag?: string | null;
} & Partial<Pick<Property, 'created_at' | 'availability_confirmed_at' | 'has_media' | 'media_url' | 'photo_urls' | 'photo_count' | 'female_only'
  | 'landlord_criteria' | 'bills_status' | 'bills' | 'bills_included'>>;

export type Hidden = 'turned_down' | 'stairs' | 'access_unknown' | 'wants_1bed' | 'size' | 'kind' | 'suits' | 'female_only' | 'landlord_criteria'
  | 'area' | 'outside_london' | 'too_far' | 'over_lha';
export const HIDDEN_WORDS: Record<Hidden, string> = {
  turned_down: 'in a building they turned down', stairs: 'upstairs with no lift', access_unknown: 'floor or lift not known',
  wants_1bed: 'a studio or room, they asked for a bedroom', size: 'too small', kind: 'shared, not for their household',
  suits: 'marked for other clients', female_only: 'not women only', landlord_criteria: "outside the landlord's rules",
  area: 'outside the areas they want', outside_london: 'outside London', too_far: 'too far from who they must live near',
  over_lha: 'over their LHA',
};

export interface Warning { tone: 'red' | 'amber'; words: string }
export interface RuleOptions {
  /** show properties over the client's LHA, with a red warning (My settings `showOverLha` as standard) */
  showOverLha?: boolean;
  /** show properties outside Greater London to London officers' clients, with an amber warning */
  showOutsideLondon?: boolean;
  providers?: Provider[];
  schemes?: CouncilScheme[];
  receivables?: Array<Pick<Receivable, 'applicant_id' | 'kind' | 'status' | 'amount'>>;
  /** every client's deals: a building they turned down is not offered again */
  deals?: RuleDeal[];
  today?: string;
}
export type RuleDeal = Pick<Deal, 'applicant_id' | 'property_id' | 'address' | 'status' | 'fell_through_reason'> & Partial<Pick<Deal, 'viewing_outcome'>>;

export interface LhaFit {
  brma: string;
  size: LhaSize;
  rate: number;
  rent: number;
  /** rent minus rate: positive is over */
  gap: number;
  /** true when the rate is the client's own (their size), false when it is the property's size (the client's not known) */
  theirs: boolean;
  /** the most they said they can add each month (0030), and whether the gap is within it */
  topUp: number;
  withinTopUp: boolean;
}

export interface RuleResult {
  hidden: Hidden | null; why: string | null; warnings: Warning[]; lha: LhaFit | null;
  /** about how many minutes from who or what they must live near, when both places are known */
  travel: number | null;
}

// ── Where a client wants to be, as LHA areas ───────────────────────

interface Targets { brmas: Set<string> | null; how: 'asked' | 'london' | 'council' | null }
const targetCache = new WeakMap<Applicant, { table: LhaTable; targets: Targets }>();

/** The LHA areas a client can be placed in, or null when they are not held to any. */
export function targetsOf(a: Applicant): Targets {
  const table = lhaTable();
  const hit = targetCache.get(a);
  if (hit && hit.table === table) return hit.targets;
  const need = clientNeeds(a);
  const text = [a.notes, a.requirements, a.postcode_area].filter(Boolean).join('\n');
  let targets: Targets = { brmas: null, how: null };
  if (!need.flexible && !need.openToOthers) {
    const asked = new Set<string>();
    for (const d of need.wantedDistricts) { const b = brmaOfDistrict(d); if (b) asked.add(b); }
    for (const b of need.wantedBoroughs.keys()) for (const x of brmasOfBorough(b)) asked.add(x);
    if (asked.size) targets = { brmas: asked, how: 'asked' };
    else if (/\blondon\b/i.test(text)) targets = { brmas: new Set(londonBrmas()), how: 'london' };
    else if (need.councilBorough) {
      const near = new Set<string>(brmasOfBorough(need.councilBorough));
      for (const b of BOROUGHS) if (areNeighbours(need.councilBorough, b)) for (const x of brmasOfBorough(b)) near.add(x);
      targets = { brmas: near, how: 'council' };
    }
  }
  targetCache.set(a, { table, targets });
  return targets;
}

// each client's deals, worked out once per list of deals
const dealsCache = new WeakMap<RuleDeal[], Map<string, RuleDeal[]>>();
function dealsOf(all: RuleDeal[], applicantId: string): RuleDeal[] {
  let by = dealsCache.get(all);
  if (!by) {
    by = new Map();
    for (const d of all) by.set(d.applicant_id, [...(by.get(d.applicant_id) ?? []), d]);
    dealsCache.set(all, by);
  }
  return by.get(applicantId) ?? [];
}

/** The deal at this building the client turned down, unless they are going for this very place now. */
export function turnedDownHere(p: RuleProperty, a: Pick<Applicant, 'id'>, deals: RuleDeal[] | undefined): RuleDeal | null {
  if (!deals?.length) return null;
  const mine = dealsOf(deals, a.id);
  if (!mine.length) return null;
  const isThis = (d: RuleDeal) => (p.id && d.property_id === p.id) || d.address.trim().toLowerCase() === p.address_line.trim().toLowerCase();
  if (mine.some((d) => isThis(d) && isLive(d) && !turnedDown(d))) return null;
  const here = buildingOf(p.address_line, p.postcode);
  return mine.find((d) => turnedDown(d) && (isThis(d) || sameBuilding(buildingOf(d.address), here))) ?? null;
}

const sizeRank = (s: LhaSize) => (s === 'shared' ? 0 : s);
const round2 = (n: number) => Math.round(n * 100) / 100;
const londonOfficer = (a: Applicant) => {
  const c = councilOf(a);
  return fromHousingOfficer(a) && c !== null && LONDON_BOROUGHS.has(c);
};

/** Whether the rules let a property go to a client, and the warnings it carries if they do. */
export function rulesFor(p: RuleProperty, a: Applicant, opts: RuleOptions = {}): RuleResult {
  const s = activeSettings();
  const showOverLha = opts.showOverLha ?? s.showOverLha;
  const showOutsideLondon = opts.showOutsideLondon ?? s.showOutsideLondon;
  const facts = rateOf(a, opts.today ?? todayIso());
  const rt = facts.rateType.value;
  const warnings: Warning[] = [];
  const need = clientNeeds(a);
  let travel: number | null = null;
  const hide = (hidden: Hidden, why: string, lha: LhaFit | null = null): RuleResult => ({ hidden, why, warnings, lha, travel });

  // a building they turned down: nothing else there
  const no = turnedDownHere(p, a, opts.deals);
  if (no) return hide('turned_down', `Turned down ${shortAddress(no.address)}${no.fell_through_reason ? ` (${no.fell_through_reason})` : ''}: same building`);
  // a single person or couple who asked for a bedroom is not offered a studio or a room
  const place = placeFacts(p);
  const household = facts.household.value;
  if (household !== 'family' && need.beds?.asked && need.beds.min >= 1 && (place.kind === 'room' || place.kind === 'studio' || place.beds === 0)) {
    return hide('wants_1bed', `${place.kind === 'room' ? 'A room' : 'A studio'}: they asked for a ${need.beds.min} bed`);
  }

  // size: a family is never offered fewer bedrooms than they are paid for
  const own = lhaSizeOf(p);
  if (rt === 'families' && facts.size.value && own !== null && sizeRank(own) < sizeRank(facts.size.value)) {
    return hide('size', `${own === 'shared' ? 'A room' : `${sizeWords(own)}`}: they are paid for ${sizeWords(facts.size.value)}`);
  }
  // kind of place
  const kind = accommodationOf(p);
  if (kind && kind.type !== 'self_contained' && (rt === 'couples' || rt === 'families')) {
    return hide('kind', `${kind.type === 'hmo_room' ? 'An HMO room' : 'A shared kitchen'} is not for a ${rt === 'couples' ? 'couple' : 'family'}`);
  }
  const suits = (p.suitable_for ?? []).filter(Boolean);
  // a single on PIP whose age is not known is paid the 1 bed rate either way: 35 plus or exempt both suit them
  const theirTags: string[] = rt === 'sar_exempt' && sharedRateExempt(a) && !facts.ageBand.value ? ['sar_exempt', 'uc_35_plus'] : rt ? [rt] : [];
  if (suits.length && theirTags.length && !theirTags.some((x) => suits.includes(x))) return hide('suits', 'Marked as suiting other clients');

  // stairs: an upper floor with no lift is no good to someone who needs step-free, and nor is a place nobody has checked
  if (need.needsStepFree) {
    const access = accessOf(p);
    if (access === 'stairs') return hide('stairs', `${p.floor != null ? floorWords(p.floor, p.lift) : 'Upstairs with no lift'}: they need ground floor or step-free`);
    if (access === 'unknown') return hide('access_unknown', 'Floor or lift not known: they need ground floor or step-free');
  }

  // women only: a client who needs it is only offered a women-only place
  if (a.female_only === true && p.female_only !== true) return hide('female_only', 'Not a women-only place: they need one');
  if (p.female_only === true && a.female_only !== true) warnings.push({ tone: 'amber', words: 'Women only: check it suits them' });

  // the landlord's own rules: the ages and benefits they take
  const rules = landlordFit(p, a, facts);
  if (rules.no) return hide('landlord_criteria', rules.no);
  if (rules.check) warnings.push({ tone: 'amber', words: rules.check });

  // area
  const check = lhaCheck(p);
  const t = targetsOf(a);
  if (t.brmas && check && !t.brmas.has(check.area.brma)) return hide('area', `In ${check.area.brma}, not an area they want`);
  if (t.brmas && !check) warnings.push({ tone: 'amber', words: 'LHA area not known: check it is where they want' });

  // out of London for a London officer's client
  if (londonOfficer(a) && inGreaterLondon(p) === false) {
    if (!showOutsideLondon) return hide('outside_london', 'Outside Greater London: not offered to London officers');
    warnings.push({ tone: 'amber', words: 'Outside Greater London: not offered to London officers as standard' });
  }

  // who or what they must live near: too far is hidden, the rest are ranked by how near
  if (a.anchor || a.anchor_postcode) {
    travel = minutesToAnchor(a, p);
    if (travel !== null && a.max_travel_mins && travel > a.max_travel_mins) {
      return hide('too_far', `About ${travel} minutes from ${anchorWords(a)}: they said ${a.max_travel_mins} at most`);
    }
  }

  // LHA: the rate they are paid in this area, for their size (the property's size when theirs is not known)
  const lha = lhaFitOf(p, a, facts);
  if (lha) {
    const { size, rate, topUp } = lha;
    // over their LHA by more than they can top up
    if (overLha(lha.gap) && !lha.withinTopUp) {
      const words = `${money(lha.gap)} over ${lha.theirs ? 'their' : 'the'} ${sizeWords(size)} LHA (${money(rate)})${topUp > 0 ? `, more than their ${money(topUp)} top-up` : ''}`;
      if (!showOverLha) return hide('over_lha', words, lha);
      warnings.unshift({ tone: 'red', words });
    }
    if (!lha.theirs && (facts.household.value === 'single' || facts.household.value === 'other') && !facts.ageBand.value) {
      warnings.push({ tone: 'amber', words: 'Age not known: ask it, it sets their LHA' });
    }
  }
  if (benefitCapOf(a).status === 'capped') warnings.push({ tone: 'amber', words: 'The benefit cap applies: check the rent is covered' });

  // still free? a property not confirmed in the last 7 days is checked before it is offered (0031)
  const stale = staleAvailability(p, opts.today ?? todayIso());
  if (stale) warnings.unshift({ tone: 'red', words: stale });
  // photos or a video to send with it (0032)
  if (!hasMedia(p) && ('has_media' in p || 'photo_urls' in p)) warnings.push({ tone: 'amber', words: 'No photos or video: get them before sending' });
  return { hidden: null, why: null, warnings, lha, travel };
}

// ── Helpers for the rules ──────────────────────────────────────────

/** The client's LHA against a property's rent: the rate they are paid in its LHA area for their size (the property's
 *  size when theirs is not known), how far under or over, and whether over is within the top-up they can pay. */
export function lhaFitOf(p: PropertyForLha, a: Applicant, facts = rateOf(a)): LhaFit | null {
  const check = lhaCheck(p);
  if (!check || check.rent === null) return null;
  const theirs = facts.size.value ? rateFor(check.area.brma, facts.size.value) : null;
  const size = theirs !== null ? facts.size.value! : check.size;
  const rate = theirs ?? check.rate;
  const topUp = Math.max(0, a.max_top_up ?? 0);
  const gap = round2(check.rent - rate);
  return { brma: check.area.brma, size, rate, rent: check.rent, gap, theirs: theirs !== null, topUp, withinTopUp: overLha(gap) && gap <= topUp };
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to.slice(0, 10)}T12:00:00Z`) - Date.parse(`${from.slice(0, 10)}T12:00:00Z`)) / 86_400_000);

/** "Check still available (last confirmed 12 days ago)" when a property was last confirmed free (or added) over 7
 *  days ago; null when it is recent, or before 0031 is run. */
export function staleAvailability(p: RuleProperty, today = todayIso()): string | null {
  if (!('availability_confirmed_at' in p)) return null;
  const since = p.availability_confirmed_at ?? p.created_at ?? null;
  if (!since) return null;
  const days = daysBetween(since, today);
  if (days <= 7) return null;
  return p.availability_confirmed_at ? `Check still available (last confirmed ${days} days ago)` : `Check still available (not confirmed since it was added ${days} days ago)`;
}

/** Photos or a video are in hand to send: marked so (0032), or photo links or a count recorded. */
export const hasMedia = (p: RuleProperty) =>
  p.has_media === true || (p.photo_count ?? 0) > 0 || (p.photo_urls ?? []).some((x) => x?.trim()) || !!p.media_url?.trim();

/** An exempt (supported) housing association place: said in its type, notes or the list it came from. */
export const isExemptHa = (p: RuleProperty) => /\bexempt\b|\bhousing\s+association\b|\bsupported\s+(?:exempt\s+)?(?:housing|accommodation)\b/i
  .test(`${p.property_type ?? ''} ${p.notes ?? ''} ${p.source_tag ?? ''}`);

/** The benefits and work a client has, in the words a landlord's rules use: uc, pip, lcwra, hb, esa, working. */
export function clientIncomes(a: Applicant): string[] {
  const out = benefitsOf(a).map((b) => b.key as string);
  if (/\besa\b|employment and support allowance/i.test(a.benefit_type ?? '')) out.push('esa');
  if (a.work_status === 'full_time' || a.work_status === 'part_time') out.push('working');
  return out;
}

export const INCOME_WORDS: Record<string, string> = { uc: 'UC', pip: 'PIP', lcwra: 'LCWRA', hb: 'housing benefit', esa: 'ESA', working: 'working' };
const orWords = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');

/** Whether a client is within the landlord's rules (0035): `no` hides it with why, `check` is an amber to check. */
export function landlordFit(p: RuleProperty, a: Applicant, facts = rateOf(a)): { no: string | null; check: string | null } {
  const lc = p.landlord_criteria;
  if (!lc) return { no: null, check: null };
  const checks: string[] = [];
  const min = lc.min_age ?? null, max = lc.max_age ?? null;
  if (min !== null || max !== null) {
    const range = min !== null && max !== null ? `ages ${min} to ${max}` : min !== null ? `${min} and over` : `up to ${max}`;
    const age = facts.age.value, band = facts.ageBand.value;
    if (age !== null) {
      if ((min !== null && age < min) || (max !== null && age > max)) return { no: `The landlord takes ${range}: they are ${age}`, check: null };
    } else if (band === 'under_35' && min !== null && min >= 35) return { no: `The landlord takes ${range}: they are under 35`, check: null };
    else if (band === '35_plus' && max !== null && max < 35) return { no: `The landlord takes ${range}: they are 35 or over`, check: null };
    else checks.push(`The landlord takes ${range}: check their age`);
  }
  const takes = (lc.benefits ?? []).filter(Boolean);
  if (takes.length) {
    const theirs = clientIncomes(a);
    const words = orWords(takes.map((x) => INCOME_WORDS[x] ?? x));
    if (theirs.length && !theirs.some((x) => takes.includes(x))) return { no: `The landlord takes ${words}: they are on ${orWords(theirs.map((x) => INCOME_WORDS[x] ?? x)).replace(/ or /, ' and ')}`, check: null };
    if (!theirs.length) checks.push(`The landlord takes ${words}: check their benefits`);
  }
  return { no: null, check: checks.length ? checks.join('. ') : null };
}

/** Who or what a client must live near, in a few words: "mum", "Northwick Park Hospital", else its postcode. */
export function anchorWords(a: Pick<Applicant, 'anchor' | 'anchor_postcode'>): string {
  const w = (a.anchor ?? '').replace(/\s*\([^)]*\)/g, '').split(/[,.;]|\s+(?:as|because|so|who|where)\s+/i)[0].trim();
  const short = w.split(/\s+/).slice(0, 4).join(' ');
  if (!short) return a.anchor_postcode?.trim() || 'where they must be';
  // everyday words read in the middle of a line ("about 20 min from mum"); names keep their capitals
  return /^(Mum|Mother|Dad|Father|Family|Parents?|Sister|Brother|Nan|Gran|Work|Job|School|College|Uni|University|Children|Kids|The|Their|Her|His)\b/.test(short)
    ? short.charAt(0).toLowerCase() + short.slice(1) : short;
}

// ── What Keel could expect ─────────────────────────────────────────

export interface Income {
  fee: number | null;
  incentive: number | null;
  /** the incentive is the most the council's scheme pays, not an agreed amount */
  upTo: boolean;
  /** an officer referral with no amount known yet */
  likely: boolean;
  total: number | null;
  words: string | null;
}

export function incomeFor(p: RuleProperty, a: Applicant, opts: RuleOptions = {}): Income {
  const provider = opts.providers ? providerFor(p, opts.providers) : null;
  const usual = usualFee(provider?.rules);
  const fee = usual ? feeFrom(usual.basis, usual.rate, rentOf({ ...p, lha_area: p.lha_area ?? null })) : null;
  const onFile = (opts.receivables ?? []).filter((r) => r.applicant_id === a.id && r.kind === 'incentive' && r.status !== 'declined' && r.amount != null)
    .sort((x, y) => (y.amount ?? 0) - (x.amount ?? 0))[0];
  const council = councilOf(a);
  const scheme = council ? (opts.schemes ?? []).find((x) => boroughOf({ council: x.council }) === council && (x.max_incentive ?? 0) > 0) : undefined;
  let incentive: number | null = null, upTo = false, likely = false;
  if (onFile) incentive = onFile.amount;
  else if (scheme) { incentive = scheme.max_incentive; upTo = true; }
  else if (fromHousingOfficer(a)) likely = true;
  const total = fee !== null || incentive !== null ? (fee ?? 0) + (incentive ?? 0) : null;
  const parts = [
    incentive !== null ? `${upTo ? 'up to ' : ''}${money(incentive)} incentive` : likely ? 'incentive likely' : null,
    fee !== null ? `${money(fee)} fee` : null,
  ].filter(Boolean);
  return { fee, incentive, upTo, likely, total, words: parts.length ? parts.join(' + ') : null };
}

export const withIncentive = (i: Income) => i.incentive !== null || i.likely;

// ── Matches with the rules applied ─────────────────────────────────

export interface RuledMatch extends Match {
  warnings: Warning[];
  lha: LhaFit | null;
  income: Income;
  incentive: boolean;
  /** why it fits, in one line: "Asked for Harrow · 1 bed suits single · £20 under their 1 bed LHA" */
  line: string;
  /** about how many minutes from who or what they must live near, when known */
  travel: number | null;
  /** where it sits on the client's list (B10): kind of place, exempt housing association, nearness, photos, LHA room */
  order: number[];
}

const LHA_TALK = /their LHA|At their LHA/;

function lineFor(m: Match, lha: LhaFit | null, near: string | null): string {
  const area = m.reasons.find((x) => /^(Asked for|Wants|Registered with|Open to any)|next door/.test(x));
  const size = m.reasons.find((x) => / suits /.test(x));
  const whose = lha?.theirs ? 'their' : 'the';
  // over the LHA is said by its red warning, not here; within their top-up it is said here
  const money_ = lha ? (lha.withinTopUp ? `${money(lha.gap)} over LHA, within their ${money(lha.topUp)} top-up`
    : overLha(lha.gap) ? null : Math.abs(lha.gap) < 1 ? `at ${whose} ${sizeWords(lha.size)} LHA`
    : `${money(-lha.gap)} under ${whose} ${sizeWords(lha.size)} LHA`) : m.reasons.find((x) => /within|limit|rent, on benefits|open to/.test(x));
  const parts = [area, near, size].filter(Boolean).map((x) => brief(x!));
  if (money_) parts.push(lha?.withinTopUp ? money_ : brief(money_));
  return parts.length ? parts.join(' · ') : brief(m.reasons[0] ?? 'Could suit them');
}

// how directly the area fits, from the match's reasons: asked for there, their borough or region, their council, next door
const areaRank = (reasons: string[]) => {
  const r = reasons.find((x) => /^(Asked for|Wants|Registered with|Open to any)|next door|just outside/.test(x)) ?? '';
  if (/next door|just outside/.test(r)) return 3;
  if (/^Asked for [^,(]+$/.test(r)) return 0;
  if (/^Asked for|^Wants/.test(r)) return 1;
  if (/^Registered with/.test(r)) return 2;
  return 4;
};

/** Where a property sits on a client's list (B10), compared key by key: self-contained, then en-suite, then a room;
 *  for PIP and ESA clients, exempt housing association places first; nearest to who or what they must live near (in
 *  10-minute steps), else the most direct area; photos or video in hand; then the most room under their LHA. */
export function placeOrder(p: RuleProperty, a: Applicant, reasons: string[], lha: LhaFit | null, travel: number | null): number[] {
  const f = placeFacts(p);
  const kind = f.ensuite ? 1 : f.kind === 'room' || f.shared ? 2 : 0;
  const pipOrEsa = clientIncomes(a).some((x) => x === 'pip' || x === 'esa');
  const exempt = pipOrEsa && !isExemptHa(p) ? 1 : 0;
  const near = travel !== null ? Math.floor(travel / 10) : 20 + areaRank(reasons);
  return [kind, exempt, near, hasMedia(p) ? 0 : 1, lha ? lha.gap : 0];
}

const byOrder = (x: number[], y: number[]) => {
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

type Ruled = { match: RuledMatch | null; hidden: Hidden | null; why: string | null };

// Every pair is kept once worked out, until something it rests on changes: the property or client (a new copy when
// either is edited), the deals, providers, schemes, receivables, the switches, the day, the settings or the LHA rates.
// So moving between pages, or opening a property again, does not work every match out afresh.
const pairCache = new WeakMap<RuleProperty, WeakMap<Applicant, { sig: unknown[]; result: Ruled }>>();
const signature = (opts: RuleOptions): unknown[] => [
  opts.deals, opts.providers, opts.schemes, opts.receivables, opts.showOverLha, opts.showOutsideLondon, opts.today ?? todayIso(),
  activeSettings(), lhaTable(), lhaVersion(), geoVersion(),
];
const sameSig = (x: unknown[], y: unknown[]) => x.length === y.length && x.every((v, i) => v === y[i]);

/** A property and a client with the rules applied: the match (or null) and, when the rules hid it, why. */
export function ruledMatch(p: RuleProperty, a: Applicant, opts: RuleOptions = {}): Ruled {
  const sig = signature(opts);
  let byClient = pairCache.get(p);
  const hit = byClient?.get(a);
  if (hit && sameSig(hit.sig, sig)) return hit.result;
  const result = ruledMatchNow(p, a, opts);
  if (!byClient) { byClient = new WeakMap(); pairCache.set(p, byClient); }
  byClient.set(a, { sig, result });
  return result;
}

function ruledMatchNow(p: RuleProperty, a: Applicant, opts: RuleOptions): Ruled {
  const m = scoreMatch(p, a);
  if (!m) return { match: null, hidden: null, why: null };
  const r = rulesFor(p, a, opts);
  if (r.hidden) return { match: null, hidden: r.hidden, why: r.why };
  const income = incomeFor(p, a, opts);
  const near = r.travel !== null ? `about ${r.travel} min from ${anchorWords(a)}` : null;
  const match: RuledMatch = {
    ...m,
    // the LHA is judged here, at the rate they are actually paid
    reasons: m.reasons.filter((x) => !LHA_TALK.test(x)),
    cautions: m.cautions.filter((x) => !LHA_TALK.test(x) && !/^Needs (?:ground floor|step-free)/.test(x)),
    warnings: r.warnings, lha: r.lha, income, incentive: withIncentive(income), line: lineFor(m, r.lha, near),
    travel: r.travel, order: placeOrder(p, a, m.reasons, r.lha, r.travel),
  };
  return { match, hidden: null, why: null };
}

const RANK: Record<Strength, number> = { strong: 0, good: 1, possible: 2 };
const shown = (m: Match) => m.strength !== 'possible' || activeSettings().showPossibleMatches;
/** Where a match sits in a list: Good and Strong first, then Possible, then a Possible whose referral has gone old
 *  (Team settings `staleReferralDays`): an old referral only keeps its place when it is a good match. */
export const sinkOf = (m: Pick<Match, 'strength' | 'applicant'>, now = new Date()) =>
  m.strength !== 'possible' ? 0 : isStaleReferral(m.applicant, now) ? 2 : 1;
const looser = (m: Match) => sinkOf(m);

export interface RuledPropertyMatch<P extends RuleProperty> { property: P; match: RuledMatch }

/** The properties a client can be offered, best first: Good and Strong before Possible, then in the order of
 *  `placeOrder` (B10), then the biggest income and the highest score. */
export function matchesForApplicant<P extends RuleProperty>(a: Applicant, properties: P[], opts: RuleOptions = {}): RuledPropertyMatch<P>[] {
  return properties
    .map((property) => ({ property, match: ruledMatch(property, a, opts).match }))
    .filter((x): x is RuledPropertyMatch<P> => x.match !== null && shown(x.match))
    .sort((x, y) => sinkOf(x.match) - sinkOf(y.match) || byOrder(x.match.order, y.match.order) || RANK[x.match.strength] - RANK[y.match.strength]
      || (y.match.income.total ?? 0) - (x.match.income.total ?? 0) || y.match.score - x.match.score);
}

/** The clients a property can go to: looser fits last, and among the rest, clients with an incentive first. */
export function matchesForProperty(p: RuleProperty, applicants: Applicant[], opts: RuleOptions = {}): RuledMatch[] {
  return applicants.map((a) => ruledMatch(p, a, opts).match)
    .filter((m): m is RuledMatch => m !== null && shown(m))
    .sort((x, y) => looser(x) - looser(y) || Number(y.incentive) - Number(x.incentive) || RANK[x.strength] - RANK[y.strength]
      || y.score - x.score || (y.income.total ?? 0) - (x.income.total ?? 0) || effectiveTier(x.applicant) - effectiveTier(y.applicant));
}

export type HiddenCounts = Partial<Record<Hidden, number>> & { total: number };

const count = (hs: Array<Hidden | null>): HiddenCounts => {
  const out: HiddenCounts = { total: 0 };
  for (const h of hs) if (h) { out[h] = (out[h] ?? 0) + 1; out.total += 1; }
  return out;
};

/** How many properties the scores would have offered a client, but the rules hide, and why. */
export const hiddenForApplicant = (a: Applicant, properties: RuleProperty[], opts: RuleOptions = {}) =>
  count(properties.map((p) => ruledMatch(p, a, opts).hidden));

/** How many clients the scores would have offered a property to, but the rules hide, and why. */
export const hiddenForProperty = (p: RuleProperty, applicants: Applicant[], opts: RuleOptions = {}) =>
  count(applicants.map((a) => ruledMatch(p, a, opts).hidden));

/** "2 over their LHA, 1 outside the areas they want" */
export function hiddenWords(c: HiddenCounts): string {
  return (Object.keys(HIDDEN_WORDS) as Hidden[]).filter((k) => c[k]).map((k) => `${c[k]} ${HIDDEN_WORDS[k]}`).join(', ');
}

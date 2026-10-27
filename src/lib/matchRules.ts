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
//   stairs    a client who needs ground floor or step-free is never offered an upper floor with no lift.
// Every match then carries one line saying why it fits, and what Keel could expect from it: the letting fee from the
// provider's usual terms, and the council incentive (on Finances already, else the most the council's scheme pays, else
// "likely" for an officer referral). On a property, clients with an incentive come first.

import type { Applicant, Deal, Property, Provider, Receivable } from './types';
import type { CouncilScheme } from './councils';
import { boroughOf } from './councils';
import { brief, clientNeeds, scoreMatch } from './propertyMatch';
import type { Match, PropertyLike, Strength } from './propertyMatch';
import { rateOf } from './clientProfile';
import { accommodationOf, inGreaterLondon } from './propertyChecks';
import { brmaOfDistrict, brmasOfBorough, lhaCheck, lhaSizeOf, lhaTable, lhaVersion, londonBrmas, overLha, rateFor, sizeWords } from './lha';
import type { LhaSize, LhaTable } from './lha';
import { feeFrom, fromHousingOfficer, rentOf, usualFee } from './money';
import { providerFor } from './requests';
import { benefitCapOf, councilOf, effectiveTier, isStaleReferral, sharedRateExempt } from './search';
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
};

export type Hidden = 'turned_down' | 'stairs' | 'size' | 'kind' | 'suits' | 'area' | 'outside_london' | 'over_lha';
export const HIDDEN_WORDS: Record<Hidden, string> = {
  turned_down: 'in a building they turned down', stairs: 'upstairs with no lift', size: 'too small', kind: 'shared, not for their household',
  suits: 'marked for other clients', area: 'outside the areas they want', outside_london: 'outside London', over_lha: 'over their LHA',
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
}

export interface RuleResult { hidden: Hidden | null; why: string | null; warnings: Warning[]; lha: LhaFit | null }

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
  const hide = (hidden: Hidden, why: string, lha: LhaFit | null = null): RuleResult => ({ hidden, why, warnings, lha });

  // a building they turned down: nothing else there
  const no = turnedDownHere(p, a, opts.deals);
  if (no) return hide('turned_down', `Turned down ${shortAddress(no.address)}${no.fell_through_reason ? ` (${no.fell_through_reason})` : ''}: same building`);
  // stairs: an upper floor with no lift is no good to someone who needs step-free
  if (p.floor != null && p.floor !== 0 && p.lift === false && clientNeeds(a).needsStepFree) {
    return hide('stairs', `${floorWords(p.floor, p.lift)}: they need ground floor or step-free`);
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

  // LHA: the rate they are paid in this area, for their size (the property's size when theirs is not known)
  let lha: LhaFit | null = null;
  if (check && check.rent !== null) {
    const theirs = facts.size.value ? rateFor(check.area.brma, facts.size.value) : null;
    const size = theirs !== null ? facts.size.value! : check.size;
    const rate = theirs ?? check.rate;
    lha = { brma: check.area.brma, size, rate, rent: check.rent, gap: round2(check.rent - rate), theirs: theirs !== null };
    if (overLha(lha.gap)) {
      const words = `${money(lha.gap)} over ${lha.theirs ? 'their' : 'the'} ${sizeWords(size)} LHA (${money(rate)})`;
      if (!showOverLha) return hide('over_lha', words, lha);
      warnings.unshift({ tone: 'red', words });
    }
    if (!lha.theirs && (facts.household.value === 'single' || facts.household.value === 'other') && !facts.ageBand.value) {
      warnings.push({ tone: 'amber', words: 'Age not known: ask it, it sets their LHA' });
    }
  }
  if (benefitCapOf(a).status === 'capped') warnings.push({ tone: 'amber', words: 'The benefit cap applies: check the rent is covered' });
  return { hidden: null, why: null, warnings, lha };
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
}

const LHA_TALK = /their LHA|At their LHA/;

function lineFor(m: Match, lha: LhaFit | null): string {
  const area = m.reasons.find((x) => /^(Asked for|Wants|Registered with|Open to any)|next door/.test(x));
  const size = m.reasons.find((x) => / suits /.test(x));
  const whose = lha?.theirs ? 'their' : 'the';
  // over the LHA is said by its red warning, not here
  const money_ = lha ? (overLha(lha.gap) ? null : Math.abs(lha.gap) < 1 ? `at ${whose} ${sizeWords(lha.size)} LHA`
    : `${money(-lha.gap)} under ${whose} ${sizeWords(lha.size)} LHA`) : m.reasons.find((x) => /within|limit|rent, on benefits|open to/.test(x));
  const parts = [area, size, money_].filter(Boolean).map((x) => brief(x!));
  return parts.length ? parts.join(' · ') : brief(m.reasons[0] ?? 'Could suit them');
}

type Ruled = { match: RuledMatch | null; hidden: Hidden | null; why: string | null };

// Every pair is kept once worked out, until something it rests on changes: the property or client (a new copy when
// either is edited), the deals, providers, schemes, receivables, the switches, the day, the settings or the LHA rates.
// So moving between pages, or opening a property again, does not work every match out afresh.
const pairCache = new WeakMap<RuleProperty, WeakMap<Applicant, { sig: unknown[]; result: Ruled }>>();
const signature = (opts: RuleOptions): unknown[] => [
  opts.deals, opts.providers, opts.schemes, opts.receivables, opts.showOverLha, opts.showOutsideLondon, opts.today ?? todayIso(),
  activeSettings(), lhaTable(), lhaVersion(),
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
  const match: RuledMatch = {
    ...m,
    // the LHA is judged here, at the rate they are actually paid
    reasons: m.reasons.filter((x) => !LHA_TALK.test(x)),
    cautions: m.cautions.filter((x) => !LHA_TALK.test(x)),
    warnings: r.warnings, lha: r.lha, income, incentive: withIncentive(income), line: lineFor(m, r.lha),
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

/** The properties a client can be offered, best first (the biggest income breaks a tie). */
export function matchesForApplicant<P extends RuleProperty>(a: Applicant, properties: P[], opts: RuleOptions = {}): RuledPropertyMatch<P>[] {
  return properties
    .map((property) => ({ property, match: ruledMatch(property, a, opts).match }))
    .filter((x): x is RuledPropertyMatch<P> => x.match !== null && shown(x.match))
    .sort((x, y) => RANK[x.match.strength] - RANK[y.match.strength] || (y.match.income.total ?? 0) - (x.match.income.total ?? 0) || y.match.score - x.match.score);
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

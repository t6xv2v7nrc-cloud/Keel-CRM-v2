// For every client and property that match: how well they fit (0 to 100), how likely sending it is to end in a
// placement, and what that is worth to Keel. So it is plain which ones are easy money and which are hard work.
//
//   fit       the match score (area, size, rent, needs, priority), with the rules' warnings taken off
//   chance    Keel's own rate (of the properties sent that have ended, how many became a placement; 20% until there is
//             enough history), moved up or down by what makes a placement more or less likely:
//               the fit, the room under their LHA, how far they have got with this place, being referred by a housing
//               officer, new or urgent, recent contact, missing details, places they turned down or viewings missed,
//               an offer already elsewhere, the provider's own record, and when the place is free
//   expected  what it could bring (fee plus incentive; a typical incentive for "incentive likely") times the chance
//
// Every step up or down is kept in words, so the number can be explained ("Why 45%").

import type { Applicant, Deal, Property, Receivable } from './types';
import type { RuledMatch, RuleProperty } from './matchRules';
import { sinkOf } from './matchRules';
import { matchingGaps } from './clientProfile';
import { fromHousingOfficer } from './money';
import { isStaleReferral, isUrgent, receivedAt, referralAgeDays } from './search';
import { buildingOf, sameBuilding, turnedDown } from './buildings';
import { isLive, shortAddress } from './progress';
import { money, shortDate } from './format';

export type Ease = 'easy' | 'fair' | 'hard' | 'long_shot';
export interface Factor { words: string; up: boolean; weight: number }

export interface Prospect {
  /** how well they fit, 0 to 100 */
  fit: number;
  /** the chance that sending it ends in a placement, 0 to 1 */
  chance: number;
  /** what it could bring Keel, with a typical incentive where one is likely but not known */
  value: number | null;
  /** value times chance */
  expected: number | null;
  ease: Ease;
  /** "Easy money" (likely, and worth it) or "Hard work" (unlikely) */
  label: 'Easy money' | 'Hard work' | null;
  /** the steps up and down, biggest first */
  factors: Factor[];
}

export interface ProspectContext {
  /** of the properties sent that have ended, the share that became a placement (smoothed) */
  base: number;
  /** how many ended deals that rests on */
  closed: number;
  byClient: Map<string, Deal[]>;
  /** each provider's own record: placements of their properties against ended deals */
  providerRecord: Map<string, { placed: number; closed: number }>;
  /** the middle council incentive Keel has recorded, for "incentive likely" */
  typicalIncentive: number | null;
  lastContact: (applicantId: string) => string | null;
  now: Date;
}

const PRIOR = 0.2;
const PRIOR_WEIGHT = 10;
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const DAY = 86_400_000;

/** What the chances rest on: Keel's own deals, each provider's record, and the incentives on Finances. */
export function prospectContext(x: {
  deals: Deal[];
  properties?: Array<Pick<Property, 'id' | 'provider_id'>>;
  receivables?: Array<Pick<Receivable, 'kind' | 'amount' | 'status'>>;
  lastContact?: (applicantId: string) => string | null;
  now?: Date;
}): ProspectContext {
  const ended = x.deals.filter((d) => d.status === 'moved_in' || d.status === 'fell_through');
  const placed = ended.filter((d) => d.status === 'moved_in').length;
  const byClient = new Map<string, Deal[]>();
  for (const d of x.deals) byClient.set(d.applicant_id, [...(byClient.get(d.applicant_id) ?? []), d]);
  const providerOf = new Map((x.properties ?? []).map((p) => [p.id, p.provider_id ?? null]));
  const providerRecord = new Map<string, { placed: number; closed: number }>();
  for (const d of ended) {
    const pr = d.property_id ? providerOf.get(d.property_id) : null;
    if (!pr) continue;
    const r = providerRecord.get(pr) ?? { placed: 0, closed: 0 };
    r.closed += 1;
    if (d.status === 'moved_in') r.placed += 1;
    providerRecord.set(pr, r);
  }
  const incentives = (x.receivables ?? []).filter((r) => r.kind === 'incentive' && r.status !== 'declined' && (r.amount ?? 0) > 0).map((r) => r.amount!).sort((a, b) => a - b);
  return {
    base: (placed + PRIOR * PRIOR_WEIGHT) / (ended.length + PRIOR_WEIGHT),
    closed: ended.length,
    byClient,
    providerRecord,
    typicalIncentive: incentives.length ? incentives[Math.floor(incentives.length / 2)] : null,
    lastContact: x.lastContact ?? (() => null),
    now: x.now ?? new Date(),
  };
}

/** The match score as 0 to 100: it rises quickly at first and levels off; each red warning takes 12 off, amber 4. */
export function fitOf(m: Pick<RuledMatch, 'score' | 'warnings'>): number {
  const raw = 100 * (1 - Math.exp(-Math.max(0, m.score) / 50));
  const off = m.warnings.reduce((s, w) => s + (w.tone === 'red' ? 12 : 4), 0);
  return Math.max(5, Math.min(99, Math.round(raw - off)));
}

const STEP_WEIGHT: Partial<Record<Deal['status'], number>> = { interested: 0.5, viewing: 0.9, viewed: 1.2, offered: 1.8, accepted: 2.6 };
const STEP_WORDS: Partial<Record<Deal['status'], string>> = {
  interested: 'They said they are interested', viewing: 'Viewing booked', viewed: 'They have viewed it', offered: 'Offer made', accepted: 'Offer accepted',
};

// kept per match (matches themselves are kept, see ruledMatch) until the context changes
const prospectCache = new WeakMap<RuledMatch, { p: unknown; ctx: ProspectContext; prospect: Prospect }>();
const gapsCache = new WeakMap<Applicant, string[]>();
const gapsOf = (a: Applicant) => { let g = gapsCache.get(a); if (!g) { g = matchingGaps(a); gapsCache.set(a, g); } return g; };

/** How likely sending this property to this client is to end in a placement, and what that is worth. */
export function prospectFor(m: RuledMatch, p: RuleProperty & Partial<Pick<Property, 'available_from' | 'status'>>, ctx: ProspectContext): Prospect {
  const hit = prospectCache.get(m);
  if (hit && hit.p === p && hit.ctx === ctx) return hit.prospect;
  const prospect = prospectNow(m, p, ctx);
  prospectCache.set(m, { p, ctx, prospect });
  return prospect;
}

function prospectNow(m: RuledMatch, p: RuleProperty & Partial<Pick<Property, 'available_from' | 'status'>>, ctx: ProspectContext): Prospect {
  const a: Applicant = m.applicant;
  const factors: Factor[] = [];
  const add = (weight: number, words: string) => { if (weight) factors.push({ words, up: weight > 0, weight }); };
  const now = ctx.now;
  const mine = ctx.byClient.get(a.id) ?? [];
  const here = buildingOf(p.address_line, p.postcode);
  const isThis = (d: Deal) => (p.id && d.property_id === p.id) || d.address.trim().toLowerCase() === p.address_line.trim().toLowerCase();

  // the fit
  add(m.strength === 'strong' ? 0.7 : m.strength === 'good' ? 0.2 : -0.8, m.strength === 'strong' ? 'Strong fit' : m.strength === 'good' ? 'Good fit' : 'Loose fit');
  // the money: room under the LHA they are paid there
  if (m.lha) {
    if (m.lha.gap >= 1) add(-1.3, `${money(m.lha.gap)} over their LHA`);
    else if (m.lha.gap <= -50) add(0.4, `${money(-m.lha.gap)} under their LHA`);
    else add(0.15, 'Within their LHA');
  } else add(-0.25, 'LHA not known');
  const ambers = m.warnings.filter((w) => w.tone === 'amber' && !/benefit cap/i.test(w.words)).length;
  if (ambers) add(-Math.min(0.6, 0.2 * ambers), ambers === 1 ? m.warnings.find((w) => w.tone === 'amber' && !/benefit cap/i.test(w.words))!.words : `${ambers} things to check`);
  if (m.warnings.some((w) => /benefit cap/i.test(w.words))) add(-0.5, 'Benefit cap applies');

  // how far they have got with this very place
  const live = mine.filter((d) => isThis(d) && isLive(d)).sort((x, y) => (STEP_WEIGHT[y.status] ?? 0) - (STEP_WEIGHT[x.status] ?? 0))[0];
  if (live && STEP_WEIGHT[live.status]) add(STEP_WEIGHT[live.status]!, STEP_WORDS[live.status]!);
  // an offer already somewhere else
  const elsewhere = mine.find((d) => !isThis(d) && !sameBuilding(buildingOf(d.address), here) && (d.status === 'offered' || d.status === 'accepted'));
  if (elsewhere) add(-1.2, `Already has an offer at ${shortAddress(elsewhere.address)}`);

  // who they are
  if (fromHousingOfficer(a)) add(0.35, 'Referred by a housing officer');
  const ageDays = (now.getTime() - new Date(receivedAt(a)).getTime()) / DAY;
  if (ageDays <= 7) add(0.2, 'New referral');
  else if (isStaleReferral(a, now)) add(-0.4, `Referral ${referralAgeDays(a, now)} days old`);
  if (isUrgent(a)) add(0.3, 'Urgent need');
  const last = ctx.lastContact(a.id);
  const quiet = last ? (now.getTime() - new Date(last).getTime()) / DAY : null;
  if (quiet !== null && quiet <= 7) add(0.25, 'In touch this week');
  else if (quiet !== null && quiet > 30) add(-0.35, `Quiet since ${shortDate(last)}`);
  else if (quiet === null && ageDays > 14) add(-0.4, 'Never contacted');
  const gaps = gapsOf(a);
  if (gaps.length) {
    const named = gaps.slice(0, 2).map((g) => g.toLowerCase());
    add(-Math.min(0.6, 0.15 * gaps.length), `${gaps.length} ${gaps.length === 1 ? 'detail' : 'details'} missing (${named.join(gaps.length === 2 ? ' and ' : ', ')}${gaps.length > 2 ? ` and ${gaps.length - 2} more` : ''})`);
  }

  // their history
  const noes = mine.filter((d) => turnedDown(d) && !sameBuilding(buildingOf(d.address), here)).length;
  if (noes) add(-Math.min(0.9, 0.3 * noes), `Turned down ${noes} ${noes === 1 ? 'place' : 'places'} before`);
  const missed = mine.filter((d) => d.viewing_outcome === 'no_show' || /did not turn up/i.test(d.fell_through_reason ?? '')).length;
  if (missed) add(-Math.min(1, 0.5 * missed), `Missed ${missed} ${missed === 1 ? 'viewing' : 'viewings'}`);

  // the place
  if (p.status === 'under_offer') add(-0.6, 'Already under offer');
  if (p.available_from) {
    const wait = (new Date(`${p.available_from}T12:00:00`).getTime() - now.getTime()) / DAY;
    if (wait > 30) add(-0.3, `Free from ${shortDate(p.available_from)}`);
  }
  const rec = p.provider_id ? ctx.providerRecord.get(p.provider_id) : undefined;
  if (rec && rec.closed >= 3) {
    const rate = (rec.placed + ctx.base * 2) / (rec.closed + 2);
    const w = Math.max(-0.8, Math.min(0.8, 0.6 * (logit(rate) - logit(ctx.base))));
    if (Math.abs(w) >= 0.1) add(w, `Provider's record: ${rec.placed} of ${rec.closed} placed`);
  }

  const total = factors.reduce((s, f) => s + f.weight, logit(ctx.base));
  const chance = Math.max(0.03, Math.min(0.95, sigmoid(total)));
  const shownChance = Math.round(chance * 20) / 20 || 0.05;
  const i = m.income;
  const incentive = i.incentive ?? (i.likely ? ctx.typicalIncentive : null);
  const value = i.fee !== null || incentive !== null ? (i.fee ?? 0) + (incentive ?? 0) : null;
  const expected = value !== null ? Math.round((value * shownChance) / 50) * 50 : null;
  const ease: Ease = shownChance >= 0.55 ? 'easy' : shownChance >= 0.35 ? 'fair' : shownChance >= 0.15 ? 'hard' : 'long_shot';
  const label = shownChance >= 0.55 && (value ?? 0) >= 1000 ? 'Easy money' : shownChance < 0.2 ? 'Hard work' : null;
  return { fit: fitOf(m), chance: shownChance, value, expected, ease, label, factors: factors.sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)) };
}

/** "45%" */
export const chanceWords = (x: Pick<Prospect, 'chance'>) => `${Math.round(x.chance * 100)}%`;

/** Why the chance is what it is, in a line: "Up: strong fit, referred by a housing officer. Down: 2 details missing." */
export function whyWords(x: Prospect, ctx: Pick<ProspectContext, 'base' | 'closed'>): string {
  const up = x.factors.filter((f) => f.up).slice(0, 4).map((f) => f.words.charAt(0).toLowerCase() + f.words.slice(1));
  const down = x.factors.filter((f) => !f.up).slice(0, 4).map((f) => f.words.charAt(0).toLowerCase() + f.words.slice(1));
  const start = ctx.closed >= 5
    ? `Starts from Keel's own rate: ${Math.round(ctx.base * 100)}% of properties sent end in a placement (${ctx.closed} so far).`
    : `Starts from about ${Math.round(ctx.base * 100)}% of properties sent ending in a placement, until Keel has more of its own history.`;
  return [start, up.length ? `Up: ${up.join(', ')}.` : null, down.length ? `Down: ${down.join(', ')}.` : null,
    x.value !== null ? `Could bring ${money(x.value)}; at ${chanceWords(x)} that is worth about ${money(x.expected ?? 0)}.` : null].filter(Boolean).join(' ');
}

/** Best bets first: the most money likely, then the surest. */
export const byExpected = (x: Prospect, y: Prospect) => (y.expected ?? 0) - (x.expected ?? 0) || y.chance - x.chance || y.fit - x.fit;

/** A list of matches with their prospects, best bets first: Good and Strong, then Possible, then a Possible whose
 *  referral has gone old (see `sinkOf`). */
export function ranked<T>(items: T[], matchOf: (t: T) => RuledMatch, prospectOf: (t: T) => Prospect, now = new Date()): Array<{ item: T; prospect: Prospect }> {
  return items.map((item) => ({ item, prospect: prospectOf(item), sink: sinkOf(matchOf(item), now) }))
    .sort((x, y) => x.sink - y.sink || byExpected(x.prospect, y.prospect))
    .map(({ item, prospect }) => ({ item, prospect }));
}

// The same context for every page while nothing it rests on has changed (and for ten minutes at most), so the chances
// worked out on one page are still there on the next.
let keptContext: { deals: unknown; properties: unknown; receivables: unknown; contacts: unknown; at: number; ctx: ProspectContext } | null = null;
export function keptProspectContext(deals: Deal[], properties: Array<Pick<Property, 'id' | 'provider_id'>>,
  receivables: Array<Pick<Receivable, 'kind' | 'amount' | 'status'>>, contacts: Map<string, { at: string }>): ProspectContext {
  const now = Date.now();
  const k = keptContext;
  if (k && k.deals === deals && k.properties === properties && k.receivables === receivables && k.contacts === contacts && now - k.at < 10 * 60_000) return k.ctx;
  const ctx = prospectContext({ deals, properties, receivables, lastContact: (id) => contacts.get(id)?.at ?? null });
  keptContext = { deals, properties, receivables, contacts, at: now, ctx };
  return ctx;
}

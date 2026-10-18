// Weekly numbers (Step 8 of the update brief): how Keel is doing on what matters, for a week (Monday to Sunday) or a
// month. Everything is read from what Keel already holds; nothing is typed in.
//   placements          clients who moved in during the period, by borough (focus boroughs first) and by route
//   viewings            viewings that took place in the period (no-shows left out), and how many per placement
//   reasons lost        deals lost in the period, by reason group (closed because the client moved in with Keel: no loss)
//   incentives          incentive £ per placement, and the share of incentive placements with the split in writing
//   sign-up to cash     days from sign up to paid, for fees and incentives paid in the period (the middle value)
//   within LHA          of the properties sent in the period (to clients, or in the Mailer), how many were within LHA
//   replies, outcomes   first replies to officers within the target; viewing outcomes back the same day
// The month's goal (Team settings, `monthlyGoal`): a range of placements, and how many should carry an incentive.

import type { Applicant, Deal, Property, Provider, Receivable, ReasonLost } from './types';
import type { OfficerSend } from './councils';
import { boroughOf, focusRank } from './councils';
import type { Placement, PlacementRoute } from './placements';
import { placementView, ROUTE_WORDS } from './placements';
import { checksFor } from './propertyChecks';
import { fromHousingOfficer } from './money';
import { councilOf } from './search';
import { MOVED_IN_ELSEWHERE, outcomeBack, outcomeOf, reasonLostOf, REASON_WORDS, replyState } from './viewings';
import type { ResponseRules, MonthlyGoal } from './settings';
import { activeSettings } from './settings';
import { periodOf } from './targets';
import type { Period, TargetLine } from './targets';
import { isoDay } from './calls';
import { shortDay } from './format';

export interface KpiData {
  deals: Deal[];
  applicants: Applicant[];
  placements: Placement[];
  receivables: Receivable[];
  providers: Array<Pick<Provider, 'id' | 'name'>>;
  properties: Property[];
  sends: OfficerSend[];
}

export interface Count { key: string; label: string; n: number; focus?: 0 | 1 | 2 }

export interface Kpis {
  placements: number;
  byBorough: Count[];
  byRoute: Count[];
  viewings: number;
  viewingsPerPlacement: number | null;
  lost: Count[];
  lostTotal: number;
  incentive: { total: number; placements: number; perPlacement: number | null; inWriting: number; inWritingShare: number | null };
  signUpToCash: { days: number | null; count: number };
  withinLha: { sent: number; within: number; over: number; unknown: number; share: number | null };
  replies: { onTime: number; late: number; share: number | null };
  outcomes: { onTime: number; late: number; share: number | null };
}

const within = (iso: string | null | undefined, p: Pick<Period, 'from' | 'to'>) => !!iso && iso.slice(0, 10) >= p.from && iso.slice(0, 10) <= p.to;
const share = (a: number, b: number) => (b > 0 ? a / b : null);
const middle = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b.slice(0, 10)}T12:00:00`).getTime() - new Date(`${a.slice(0, 10)}T12:00:00`).getTime()) / 86_400_000);

/** A week back from this one (0 this week, 1 last week...), or a month (0 this month, 1 last month). */
export function kpiPeriod(kind: 'week' | 'month', back = 0, now = new Date()): Period {
  if (kind === 'week') {
    const then = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * back, 12);
    const p = periodOf('week', then);
    return back === 0 ? p : { ...p, label: back === 1 ? `Last week, ${shortDay(p.from)} to ${shortDay(p.to)}` : `${shortDay(p.from)} to ${shortDay(p.to)}`, gone: 1 };
  }
  const then = new Date(now.getFullYear(), now.getMonth() - back, 1, 12);
  const p = periodOf('month', then);
  return back === 0 ? periodOf('month', now) : { ...p, gone: 1 };
}

/** The placements (moved-in deals) in a period, each with its record and money. */
export function placementsIn(p: Pick<Period, 'from' | 'to'>, data: KpiData) {
  return data.deals.filter((d) => d.status === 'moved_in' && within(d.move_in_on ?? d.updated_at, p))
    .map((d) => placementView(d, data.placements.find((x) => x.deal_id === d.id) ?? null, data.receivables, data.providers));
}

/** Every number for one period. */
export function kpisFor(p: Pick<Period, 'from' | 'to'>, data: KpiData, now = new Date(), rules: ResponseRules = activeSettings().responses): Kpis {
  const byId = new Map(data.applicants.map((a) => [a.id, a]));
  const placed = placementsIn(p, data);

  // placements by borough and route
  const boroughs = new Map<string, number>(), routes = new Map<string, number>();
  for (const v of placed) {
    const a = byId.get(v.deal.applicant_id);
    const borough = boroughOf({ council: v.placement?.council ?? null }) ?? (a ? councilOf(a) : null) ?? 'Not known';
    boroughs.set(borough, (boroughs.get(borough) ?? 0) + 1);
    const route: PlacementRoute | null = v.placement?.route ?? (a && fromHousingOfficer(a) ? 'officer' : null);
    const label = route ? ROUTE_WORDS[route] : 'Not set';
    routes.set(label, (routes.get(label) ?? 0) + 1);
  }
  const byBorough = [...boroughs].map(([label, n]) => ({ key: label, label, n, focus: focusRank(label === 'Not known' ? null : label) }))
    .sort((x, y) => (x.focus ?? 2) - (y.focus ?? 2) || y.n - x.n || x.label.localeCompare(y.label));
  const byRoute = [...routes].map(([label, n]) => ({ key: label, label, n })).sort((x, y) => y.n - x.n);

  // viewings that took place
  const viewings = data.deals.filter((d) => d.viewing_at && within(d.viewing_at, p) && new Date(d.viewing_at) <= now && outcomeOf(d) !== 'no_show').length;

  // reasons lost: a client who moved in with Keel lost nothing when their other properties closed
  const housed = new Set(data.deals.filter((d) => d.status === 'moved_in').map((d) => d.applicant_id));
  const lostCounts = new Map<ReasonLost, number>();
  for (const d of data.deals) {
    if (d.status !== 'fell_through' || !within(d.outcome_at ?? d.updated_at, p)) continue;
    if (d.fell_through_reason === MOVED_IN_ELSEWHERE || (d.fell_through_reason === 'Client found somewhere else' && housed.has(d.applicant_id))) continue;
    const code = reasonLostOf(d);
    if (code) lostCounts.set(code, (lostCounts.get(code) ?? 0) + 1);
  }
  const lost = [...lostCounts].map(([key, n]) => ({ key, label: REASON_WORDS[key], n })).sort((x, y) => y.n - x.n);

  // incentives, and whether the split is in writing
  const withIncentive = placed.filter((v) => v.incentive !== null);
  const total = withIncentive.reduce((s, v) => s + (v.incentive?.amount ?? 0), 0);
  const inWriting = withIncentive.filter((v) => v.placement?.split_agreed_in_writing).length;

  // sign up to cash
  const paid = data.receivables.filter((r) => r.paid_on && r.sign_up_on && within(r.paid_on, p)).map((r) => Math.max(0, daysBetween(r.sign_up_on!, r.paid_on!)));

  // properties sent in the period, to clients or in the Mailer, and how many were within LHA
  const sentIds = new Set<string>();
  const byAddress = new Map(data.properties.map((x) => [x.address_line, x.id]));
  for (const d of data.deals) if (within(d.created_at, p)) { const id = d.property_id ?? byAddress.get(d.address); if (id) sentIds.add(id); }
  for (const s of data.sends) if (within(s.sent_at, p)) for (const id of s.property_ids ?? []) sentIds.add(id);
  let w = 0, over = 0, unknown = 0;
  for (const id of sentIds) {
    const prop = data.properties.find((x) => x.id === id);
    const gap = prop ? checksFor(prop).gap : null;
    if (gap === null) unknown += 1; else if (gap > 0.005) over += 1; else w += 1;
  }

  // response discipline
  let rOn = 0, rLate = 0, oOn = 0, oLate = 0;
  for (const a of data.applicants) {
    const r = replyState(a, now, rules);
    if (!r || !within(isoDay(new Date(r.nominatedAt)), p)) continue;
    if (r.repliedAt && !r.late) rOn += 1; else if (r.late) rLate += 1;
  }
  for (const d of data.deals) {
    const a = byId.get(d.applicant_id);
    const o = a ? outcomeBack(d, a, now, rules) : null;
    if (!o || !within(o.day, p)) continue;
    if (o.sentAt && !o.late) oOn += 1; else if (o.late) oLate += 1;
  }

  return {
    placements: placed.length, byBorough, byRoute,
    viewings, viewingsPerPlacement: placed.length ? Math.round((viewings / placed.length) * 10) / 10 : null,
    lost, lostTotal: lost.reduce((s, x) => s + x.n, 0),
    incentive: { total, placements: withIncentive.length, perPlacement: withIncentive.length ? Math.round(total / withIncentive.length) : null, inWriting, inWritingShare: share(inWriting, withIncentive.length) },
    signUpToCash: { days: middle(paid), count: paid.length },
    withinLha: { sent: sentIds.size, within: w, over, unknown, share: share(w, w + over + unknown) },
    replies: { onTime: rOn, late: rLate, share: share(rOn, rOn + rLate) },
    outcomes: { onTime: oOn, late: oLate, share: share(oOn, oOn + oLate) },
  };
}

/** The month's goal as progress bars: placements against the bottom of the range (the top as a stretch), and those
 *  with an incentive. */
export function goalLines(month: Period, data: KpiData, goal: MonthlyGoal = activeSettings().monthlyGoal): TargetLine[] {
  const placed = placementsIn(month, data);
  const withIncentive = placed.filter((v) => v.incentive !== null || v.placement?.fee_type === 'incentive' || v.placement?.fee_type === 'mixed').length;
  const line = (key: string, label: string, done: number, want: number, stretch?: number): TargetLine | null => {
    if (want <= 0) return null;
    const left = Math.max(0, want - done);
    return {
      key, label, done, target: want, share: Math.min(1, done / want), pace: month.gone, onTrack: done >= want * month.gone - 1e-9,
      words: left === 0 ? (stretch && done < stretch ? `Goal reached; ${stretch - done} more to the top of the range` : 'Goal reached') : `${left} to go`,
      amount: `${done} of ${stretch && stretch > want ? `${want} to ${stretch}` : want}`,
    };
  };
  return [
    line('placements', 'Placements', placed.length, goal.placementsMin, goal.placementsMax),
    line('incentive', 'With an incentive', withIncentive, goal.withIncentive),
  ].filter((x): x is TargetLine => x !== null);
}

/** "Mon 12 Oct" for each of the last few weeks, for the picker. */
export const recentWeeks = (n = 6, now = new Date()) => Array.from({ length: n }, (_, i) => ({ back: i, period: kpiPeriod('week', i, now) }));

export const percent = (x: number | null) => (x === null ? '·' : `${Math.round(x * 100)}%`);

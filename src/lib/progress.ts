// Client progress: the properties each client is going for ("deals"), how far
// each has got, what that means for the client's stage, what to do next, and
// who has stopped moving.
//
// A deal moves sent → interested → viewing booked → viewed → offer made →
// accepted → moved in, or falls through with a reason. The client's stage
// follows their furthest live deal, forwards only: a viewing booked makes
// them "Viewing", an offer "Offer", a move-in "Placed". Nobody has to
// remember to change it.

import type { ApplicantStage } from '../types/extraction';
import type { Applicant, Deal, DealStatus } from './types';
import { activeSettings } from './settings';
import { isActive } from './search';
import { addDays, dayLabel, isoDay } from './calls';
import { clockTime, longDay, shortDay } from './format';

export const DEAL_STEPS: ReadonlyArray<{ key: Exclude<DealStatus, 'fell_through'>; label: string }> = [
  { key: 'sent', label: 'Sent' },
  { key: 'interested', label: 'Interested' },
  { key: 'viewing', label: 'Viewing booked' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'offered', label: 'Offer made' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'moved_in', label: 'Moved in' },
];
export const DEAL_LABEL: Record<DealStatus, string> = {
  ...Object.fromEntries(DEAL_STEPS.map((s) => [s.key, s.label])) as Record<Exclude<DealStatus, 'fell_through'>, string>,
  fell_through: 'Fell through',
};
const stepIndex = (s: DealStatus) => DEAL_STEPS.findIndex((x) => x.key === s);
export const isLive = (d: Pick<Deal, 'status'>) => d.status !== 'fell_through' && d.status !== 'moved_in';

export const FELL_THROUGH_REASONS = [
  'Landlord would not take UC or benefits',
  'Client did not turn up',
  'Client said no',
  'Failed referencing or affordability',
  'Council did not approve',
  'Let to someone else',
  'Client found somewhere else',
  'Other',
] as const;

/** "Broadfield Close" from "Broadfield Close, London NW2 6NR"; "Flat 2, 10 Marchmont Street" keeps the street. */
export function shortAddress(address: string): string {
  const parts = address.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1 && /^(flat|room|unit|apartment|apt|studio|house)\b/i.test(parts[0])) return `${parts[0]}, ${parts[1]}`;
  return parts[0] ?? address;
}

/** The usual next move for a deal, as a button: "Book a viewing". */
export function nextMove(status: DealStatus): { to: DealStatus; label: string } | null {
  switch (status) {
    case 'sent': return { to: 'interested', label: 'They are interested' };
    case 'interested': return { to: 'viewing', label: 'Book a viewing' };
    case 'viewing': return { to: 'viewed', label: 'They viewed it' };
    case 'viewed': return { to: 'offered', label: 'Offer made' };
    case 'offered': return { to: 'accepted', label: 'Accepted' };
    case 'accepted': return { to: 'moved_in', label: 'Moved in' };
    default: return null;
  }
}

// ── Stage ──────────────────────────────────────────────────────────

/** Stages in order, for moving forwards only. The fee stages are from before Finances; a client at one counts as placed. */
export const STAGE_ORDER: ApplicantStage[] = ['lead', 'referred', 'viewing', 'offer', 'placed', 'fee_invoiced', 'fee_paid'];
export const isPlaced = (s: ApplicantStage) => s === 'placed' || s === 'fee_invoiced' || s === 'fee_paid';
const DEAL_STAGE: Partial<Record<DealStatus, ApplicantStage>> = {
  viewing: 'viewing', viewed: 'viewing', offered: 'offer', accepted: 'offer', moved_in: 'placed',
};

/** The stage a client's deals point to (their furthest deal that has not fallen through), or null. */
export function stageFromDeals(deals: Pick<Deal, 'status'>[]): ApplicantStage | null {
  const furthest = deals.filter((d) => d.status !== 'fell_through').sort((a, b) => stepIndex(b.status) - stepIndex(a.status))[0];
  return furthest ? DEAL_STAGE[furthest.status] ?? null : null;
}

/** Stages only move forwards on their own; a lost client stays lost until someone changes it. */
export function shouldAdvance(current: ApplicantStage, target: ApplicantStage | null): target is ApplicantStage {
  if (!target || current === 'lost') return false;
  return STAGE_ORDER.indexOf(target) > STAGE_ORDER.indexOf(current);
}

// ── Next step ──────────────────────────────────────────────────────

const time = clockTime;

/** "Thursday 2 October, 2pm" */
export function viewingWords(iso: string): string {
  return `${longDay(new Date(iso))}, ${time(iso)}`;
}

/** "Thu 2 Oct, 2pm" (or "Today, 2pm") */
export function viewingShort(iso: string): string {
  const day = isoDay(new Date(iso));
  const label = dayLabel(day);
  const named = /^(Today|Tomorrow|Yesterday)$/.test(label) ? label
    : shortDay(iso);
  return `${named}, ${time(iso)}`;
}

/** What to do after a deal moves, and when (a YYYY-MM-DD date), or null to leave the next step alone. */
export function stepAfter(to: DealStatus, address: string, viewingAt?: string | null): { step: string | null; on: string | null } | null {
  const short = shortAddress(address);
  switch (to) {
    case 'interested': return { step: `Book a viewing at ${short}`, on: addDays(1) };
    case 'viewing': return viewingAt ? { step: `Viewing at ${short}, ${time(viewingAt)}`, on: isoDay(new Date(viewingAt)) } : null;
    case 'viewed': return { step: `Ask the landlord about ${short}`, on: addDays(1) };
    case 'offered': return { step: `Chase an answer on ${short}`, on: addDays(2) };
    case 'accepted': return { step: `Move-in paperwork for ${short}`, on: addDays(1) };
    case 'moved_in': return { step: null, on: null };
    default: return null;
  }
}

/** Replace the client's next step with an automatic one only if it is sooner, about the same property, or there is none. */
export function takesOver(a: Pick<Applicant, 'next_call_at' | 'next_step'>, next: { on: string | null }, address: string): boolean {
  if (!a.next_call_at || next.on === null) return true;
  if ((a.next_step ?? '').includes(shortAddress(address))) return true;
  return next.on <= a.next_call_at;
}

// ── Stuck ──────────────────────────────────────────────────────────

/** When anything last moved for a client: their stage, or any of their deals. */
export function lastMoved(a: Applicant, deals: Deal[]): string {
  const times = [a.stage_changed_at ?? a.created_at, ...deals.filter((d) => d.applicant_id === a.id).map((d) => d.updated_at)];
  return times.reduce((x, y) => (y > x ? y : x));
}

/** Days a client has been stuck, or null if they are moving (or it does not apply at their stage). */
export function stuckDays(a: Applicant, deals: Deal[], now = new Date()): number | null {
  if (!isActive(a)) return null;
  const limits = activeSettings().stuckAfterDays as Record<string, number>;
  const limit = limits[a.stage];
  if (!limit) return null;
  const mine = deals.filter((d) => d.applicant_id === a.id);
  if (mine.some((d) => isLive(d) && d.viewing_at && new Date(d.viewing_at) > now)) return null; // a viewing is coming up
  const days = Math.floor((now.getTime() - new Date(lastMoved(a, mine)).getTime()) / 86_400_000);
  return days >= limit ? days : null;
}

/**
 * Days a client has gone cold, or null: a lead or referral with no property in play, no next step booked for
 * today or later, and nothing moving for at least the team's cold limit. These can be moved to Lost in one go.
 */
export function coldDays(a: Applicant, deals: Deal[], now = new Date()): number | null {
  const limit = activeSettings().coldAfterDays;
  if (!limit || (a.stage !== 'lead' && a.stage !== 'referred')) return null;
  const mine = deals.filter((d) => d.applicant_id === a.id);
  if (mine.some(isLive)) return null;
  if (a.next_call_at && a.next_call_at >= isoDay(now)) return null;
  const days = Math.floor((now.getTime() - new Date(lastMoved(a, mine)).getTime()) / 86_400_000);
  return days >= limit ? days : null;
}

/** Viewings between two dates, soonest first. */
export function viewingsBetween(deals: Deal[], from: Date, to: Date): Deal[] {
  return deals
    .filter((d) => d.status === 'viewing' && d.viewing_at && new Date(d.viewing_at) >= from && new Date(d.viewing_at) < to)
    .sort((a, b) => a.viewing_at!.localeCompare(b.viewing_at!));
}

// ── Move-in checklist (0015) ────────────────────────────────────────

/** Deals the move-in checklist applies to: accepted, or moved in. */
export const needsChecklist = (d: Pick<Deal, 'status'>) => d.status === 'accepted' || d.status === 'moved_in';

/** How far a deal's move-in checklist has got against the team's current list (checks since removed are ignored). */
export function checklistProgress(d: Pick<Deal, 'checklist'>, items: string[]): { done: number; total: number; left: string[] } {
  const ticked = d.checklist ?? {};
  const left = items.filter((i) => !ticked[i]);
  return { done: items.length - left.length, total: items.length, left };
}

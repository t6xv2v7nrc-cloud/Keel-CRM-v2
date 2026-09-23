// Referral triage tiering. The rules are set on the Settings page; the
// standard ones are:
//   Tier 1: single + UC + PIP + LCWRA + council-registered
//   Tier 2: council-registered + (UC OR full-time worker)
//   Tier 3: everyone else (families, all others)
// Tier is worked out automatically but can be set by hand on the client page,
// which locks it so a change to the rules never overrides it.

import { activeSettings } from './settings';
import type { TierRules } from './settings';

export type Tier = 1 | 2 | 3;

export interface TierInputs {
  household_type?: string | null;     // 'single'|'couple'|'family'|'other'
  on_uc?: boolean | null;
  pip?: boolean | null;
  lcwra?: boolean | null;
  council_registered?: boolean | null;
  work_status?: string | null;        // 'not_working'|'part_time'|'full_time'
}

type Check = { ok: boolean; label: string };

function tier1Checks(i: TierInputs, r: TierRules): Check[] {
  const t = r.tier1;
  const all: Array<Check & { on: boolean }> = [
    { on: t.single, ok: i.household_type === 'single', label: 'single' },
    { on: t.uc, ok: !!i.on_uc, label: 'UC' },
    { on: t.pip, ok: !!i.pip, label: 'PIP' },
    { on: t.lcwra, ok: !!i.lcwra, label: 'LCWRA' },
    { on: t.councilRegistered, ok: !!i.council_registered, label: 'council-registered' },
  ];
  return all.filter((c) => c.on);
}

function tier2AnyOf(i: TierInputs, r: TierRules): Check[] {
  const t = r.tier2;
  const all: Array<Check & { on: boolean }> = [
    { on: t.uc, ok: !!i.on_uc, label: 'UC' },
    { on: t.fullTime, ok: i.work_status === 'full_time', label: 'full-time work' },
    { on: t.partTime, ok: i.work_status === 'part_time', label: 'part-time work' },
    { on: t.pip, ok: !!i.pip, label: 'PIP' },
  ];
  return all.filter((c) => c.on);
}

export function computeTier(i: TierInputs, rules: TierRules = activeSettings().tiers): Tier {
  const t1 = tier1Checks(i, rules);
  if (t1.length > 0 && t1.every((c) => c.ok)) return 1;
  const any = tier2AnyOf(i, rules);
  const regOk = !rules.tier2.councilRegistered || !!i.council_registered;
  const anyOk = any.length === 0 || any.some((c) => c.ok);
  if ((rules.tier2.councilRegistered || any.length > 0) && regOk && anyOk) return 2;
  return 3;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Short explanation of why the rules give this tier. */
export function tierReason(i: TierInputs, rules: TierRules = activeSettings().tiers): string {
  const t = computeTier(i, rules);
  if (t === 1) return `${sentence(tier1Checks(i, rules).map((c) => c.label).join(', '))}.`;
  if (t === 2) {
    const met = tier2AnyOf(i, rules).filter((c) => c.ok).map((c) => c.label);
    return `${sentence([rules.tier2.councilRegistered ? 'council-registered' : '', ...met].filter(Boolean).join(', '))}.`;
  }
  if (rules.tier2.councilRegistered && !i.council_registered) return 'Not council-registered, so not Tier 1 or 2.';
  const missing = tier1Checks(i, rules).filter((c) => !c.ok).map((c) => c.label);
  return missing.length ? `Not Tier 1 (not ${missing.join(', ')}) and no Tier 2 reason.` : 'Does not meet Tier 1 or Tier 2.';
}

/** The rules in plain English, for the Settings page. */
export function describeRules(r: TierRules): { tier1: string; tier2: string } {
  const t1 = [r.tier1.single && 'single', r.tier1.uc && 'UC', r.tier1.pip && 'PIP', r.tier1.lcwra && 'LCWRA',
    r.tier1.councilRegistered && 'council-registered'].filter(Boolean) as string[];
  const any = [r.tier2.uc && 'UC', r.tier2.fullTime && 'full-time work', r.tier2.partTime && 'part-time work',
    r.tier2.pip && 'PIP'].filter(Boolean) as string[];
  const t2 = [r.tier2.councilRegistered ? 'council-registered' : '', any.length > 1 ? `(${any.join(' or ')})` : any[0] ?? ''].filter(Boolean);
  return {
    tier1: t1.length ? sentence(t1.join(' + ')) : 'Nobody (nothing ticked)',
    tier2: t2.length ? sentence(t2.join(' + ')) : 'Nobody (nothing ticked)',
  };
}

export const TIER_META: Record<Tier, { label: string; bg: string; fg: string }> = {
  1: { label: 'Tier 1', bg: 'var(--tier-1-bg)', fg: 'var(--tier-1-fg)' },  // highest priority: the accent
  2: { label: 'Tier 2', bg: 'var(--tier-2-bg)', fg: 'var(--tier-2-fg)' },
  3: { label: 'Tier 3', bg: 'var(--tier-3-bg)', fg: 'var(--tier-3-fg)' },
};

export const WORK_STATUS_LABEL: Record<string, string> = {
  not_working: 'Not working',
  part_time: 'Part time',
  full_time: 'Full time',
};

export const HOUSEHOLD_LABEL: Record<string, string> = {
  single: 'Single',
  couple: 'Couple',
  family: 'Family with children',
  other: 'Other',
};

export const URGENCY_LABEL: Record<string, string> = {
  homeless_tonight: 'Homeless tonight',
  at_risk_56: 'At risk within 56 days',
  temp_accommodation: 'In temporary accommodation',
  overcrowding: 'Overcrowded or unsafe',
  none: 'No immediate risk',
};

/** Urgency ordering for sorting within a tier (higher = more urgent). */
export const URGENCY_RANK: Record<string, number> = {
  homeless_tonight: 4,
  at_risk_56: 3,
  temp_accommodation: 2,
  overcrowding: 1,
  none: 0,
};

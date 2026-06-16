// Referral triage tiering (agreed rules).
//   Tier 1: single + UC + PIP + LCWRA + council-registered
//   Tier 2: council-registered + (UC OR full-time worker)
//   Tier 3: everyone else (families, all others)
// Tier is auto-computed but may be overridden by staff on the applicant page.

export type Tier = 1 | 2 | 3;

export interface TierInputs {
  household_type?: string | null;     // 'single'|'couple'|'family'|'other'
  on_uc?: boolean | null;
  pip?: boolean | null;
  lcwra?: boolean | null;
  council_registered?: boolean | null;
  work_status?: string | null;        // 'not_working'|'part_time'|'full_time'
}

export function computeTier(i: TierInputs): Tier {
  if (i.household_type === 'single' && i.on_uc && i.pip && i.lcwra && i.council_registered) return 1;
  if (i.council_registered && (i.on_uc || i.work_status === 'full_time')) return 2;
  return 3;
}

/** Short human explanation of why a given tier was computed. */
export function tierReason(i: TierInputs): string {
  const t = computeTier(i);
  if (t === 1) return 'Single, UC, PIP, LCWRA, council-registered.';
  if (t === 2) return i.on_uc ? 'Council-registered UC recipient.' : 'Council-registered, full-time worker.';
  if (i.household_type === 'family') return 'Family household.';
  return 'Does not meet Tier 1 or Tier 2 criteria.';
}

export const TIER_META: Record<Tier, { label: string; bg: string; fg: string }> = {
  1: { label: 'Tier 1', bg: '#F9E2DF', fg: '#8C2B23' },  // highest priority — red
  2: { label: 'Tier 2', bg: '#FBEED3', fg: '#7A4D04' },  // amber
  3: { label: 'Tier 3', bg: '#E4E9EE', fg: '#3D4B5C' },  // neutral
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
  overcrowding: 'Overcrowding / unsafe',
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

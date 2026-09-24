// Referral triage tiering, driven entirely by the tier logic in Team settings
// (see settings.ts): any number of tiers, checked in order, each with its own
// conditions; the last tier is "everyone else". The standard logic is:
//   Tier 1: single + UC + PIP + LCWRA + council-registered
//   Tier 2: council-registered + (UC OR full-time worker)
//   Tier 3: everyone else
// Tier is worked out automatically but can be set by hand on the client page,
// which locks it so a change to the logic never overrides it.

import { activeSettings } from './settings';
import type { CondField, Condition, TierDef, TierLogic } from './settings';
import { BOROUGHS, canonicalBorough } from './london';

/** 1 is the highest priority; the last tier is "everyone else". */
export type Tier = number;

export interface TierInputs {
  household_type?: string | null;     // 'single'|'couple'|'family'|'other'
  on_uc?: boolean | null;
  pip?: boolean | null;
  lcwra?: boolean | null;
  council_registered?: boolean | null;
  work_status?: string | null;        // 'not_working'|'part_time'|'full_time'
  urgency?: string | null;
  consent?: boolean | null;
  benefit_type?: string | null;
  adults?: number | null;
  children?: number | null;
  budget_pcm?: number | null;
  council?: string | null;
  referring_borough?: string | null;
}

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

// ── What a condition can test ──────────────────────────────────────

type Value = boolean | string | number | null;
export type FieldKind = 'yesno' | 'choice' | 'number';

const benefitText = (i: TierInputs, re: RegExp) => re.test(i.benefit_type ?? '');

export const FIELDS: Record<CondField, {
  label: string; kind: FieldKind; options?: Record<string, string>; unit?: string; get: (i: TierInputs) => Value;
}> = {
  household: {
    label: 'Household', kind: 'choice', options: HOUSEHOLD_LABEL,
    get: (i) => i.household_type || ((i.children ?? 0) > 0 ? 'family' : (i.adults ?? 0) >= 2 ? 'couple' : null),
  },
  uc: { label: 'On UC', kind: 'yesno', get: (i) => (i.on_uc === true || benefitText(i, /\b(uc|universal credit)\b/i) ? true : i.on_uc ?? null) },
  pip: { label: 'PIP', kind: 'yesno', get: (i) => (i.pip === true || benefitText(i, /\bpip\b/i) ? true : i.pip ?? null) },
  lcwra: { label: 'LCWRA', kind: 'yesno', get: (i) => (i.lcwra === true || benefitText(i, /\blcwra\b/i) ? true : i.lcwra ?? null) },
  hb: { label: 'Housing benefit', kind: 'yesno', get: (i) => (benefitText(i, /\b(hb|housing benefit)\b/i) ? true : null) },
  councilRegistered: { label: 'Council-registered', kind: 'yesno', get: (i) => i.council_registered ?? null },
  consent: { label: 'Consent given', kind: 'yesno', get: (i) => i.consent ?? null },
  work: { label: 'Work', kind: 'choice', options: WORK_STATUS_LABEL, get: (i) => i.work_status || null },
  urgency: { label: 'Urgency', kind: 'choice', options: URGENCY_LABEL, get: (i) => i.urgency || null },
  council: {
    label: 'Council', kind: 'choice', options: Object.fromEntries(BOROUGHS.map((b) => [b, b])),
    get: (i) => canonicalBorough(i.council || i.referring_borough),
  },
  children: { label: 'Children', kind: 'number', get: (i) => i.children ?? null },
  adults: { label: 'Adults', kind: 'number', get: (i) => i.adults ?? null },
  budget: { label: 'Budget', kind: 'number', unit: '£', get: (i) => i.budget_pcm ?? null },
};

/** The operators that make sense for a field, with their wording. */
export function opsFor(field: CondField): Array<[Condition['op'], string]> {
  switch (FIELDS[field].kind) {
    case 'yesno': return [['yes', 'is yes'], ['no', 'is no'], ['unknown', 'is not known']];
    case 'choice': return [['oneOf', 'is one of'], ['noneOf', 'is not one of'], ['unknown', 'is not known']];
    default: return [['atLeast', 'is at least'], ['atMost', 'is at most'], ['unknown', 'is not known']];
  }
}

export function conditionHolds(c: Condition, i: TierInputs): boolean {
  const v = FIELDS[c.field].get(i);
  switch (c.op) {
    case 'yes': return v === true;
    case 'no': return v === false;
    case 'unknown': return v === null || v === '';
    case 'oneOf': return v !== null && (c.values ?? []).includes(String(v));
    case 'noneOf': return !(c.values ?? []).includes(String(v));
    case 'atLeast': return typeof v === 'number' && v >= (c.n ?? 0);
    case 'atMost': return typeof v === 'number' && v <= (c.n ?? 0);
  }
}

const money = (n: number) => `£${n.toLocaleString('en-GB')}`;
const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? 'nothing chosen');

/** A condition in plain English: "on UC", "household is single or couple", "budget at least £1,300". */
export function describeCondition(c: Condition): string {
  const f = FIELDS[c.field];
  const name = f.label.toLowerCase();
  if (c.op === 'unknown') return `${name} not known`;
  if (f.kind === 'yesno') {
    const yesWords: Record<string, [string, string]> = {
      uc: ['on UC', 'not on UC'], pip: ['PIP', 'no PIP'], lcwra: ['LCWRA', 'no LCWRA'], hb: ['housing benefit', 'no housing benefit'],
      councilRegistered: ['council-registered', 'not council-registered'], consent: ['consent given', 'no consent'],
    };
    const [yes, no] = yesWords[c.field] ?? [name, `not ${name}`];
    return c.op === 'yes' ? yes : no;
  }
  if (f.kind === 'choice') {
    const labels = (c.values ?? []).map((v) => (f.options?.[v] ?? v).toLowerCase().replace(/^(.)/, (m) => (c.field === 'council' ? m.toUpperCase() : m)));
    return `${name} ${c.op === 'noneOf' ? 'is not' : 'is'} ${orList(labels)}`;
  }
  const n = c.n ?? 0;
  return `${name} ${c.op === 'atLeast' ? 'at least' : 'at most'} ${f.unit === '£' ? money(n) : n}`;
}

// ── Working out a tier ─────────────────────────────────────────────

const logicNow = () => activeSettings().tierLogic;

/** A tier with no conditions at all matches nobody (so an unfinished tier never catches everyone). */
function tierMatches(t: TierDef, i: TierInputs): boolean {
  if (t.all.length === 0 && t.any.length === 0) return false;
  return t.all.every((c) => conditionHolds(c, i)) && (t.any.length === 0 || t.any.some((c) => conditionHolds(c, i)));
}

export function computeTier(i: TierInputs, logic: TierLogic = logicNow()): Tier {
  const n = logic.tiers.length;
  for (let k = 0; k < n - 1; k++) if (tierMatches(logic.tiers[k], i)) return k + 1;
  return Math.max(1, n);
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Why the logic gives this tier, in a sentence. */
export function tierReason(i: TierInputs, logic: TierLogic = logicNow()): string {
  const t = computeTier(i, logic);
  const def = logic.tiers[t - 1];
  if (def && t < logic.tiers.length) {
    const met = [...def.all, ...def.any.filter((c) => conditionHolds(c, i)).slice(0, 1)].map(describeCondition);
    return `${sentence(met.join(', '))}.`;
  }
  const misses = logic.tiers.slice(0, -1).map((d, k) => {
    const needs = d.all.filter((c) => !conditionHolds(c, i)).map(describeCondition);
    if (needs.length === 0 && d.any.length) needs.push(orList(d.any.map(describeCondition)));
    return needs.length ? `Not ${d.label || `Tier ${k + 1}`} (needs ${needs.slice(0, 2).join(' and ')})` : '';
  }).filter(Boolean);
  return misses.length ? `${misses.join('. ')}.` : 'Everyone else.';
}

/** A tier's rule in plain English, for Settings. */
export function describeTier(d: TierDef, isLast: boolean): string {
  if (isLast) return 'Everyone who does not match a tier above.';
  if (d.all.length === 0 && d.any.length === 0) return 'Nobody yet: add a condition.';
  const all = d.all.map(describeCondition);
  const any = d.any.map(describeCondition);
  return sentence([all.join(' and '), any.length ? `${all.length ? 'and ' : ''}${any.length > 1 ? `at least one of: ${any.join(', ')}` : any[0]}` : '']
    .filter(Boolean).join(', ')) + '.';
}

// ── Names and colours ──────────────────────────────────────────────

export const tierCount = (logic: TierLogic = logicNow()) => Math.max(1, logic.tiers.length);
export const tierNumbers = (logic: TierLogic = logicNow()) => Array.from({ length: tierCount(logic) }, (_, k) => k + 1);
export const tierLabel = (t: number, logic: TierLogic = logicNow()) => logic.tiers[t - 1]?.label?.trim() || `Tier ${t}`;

/** Tier 1 carries the accent, Tier 2 a soft accent, the rest warm grey. */
export function tierStyle(t: number): { bg: string; fg: string } {
  if (t === 1) return { bg: 'var(--tier-1-bg)', fg: 'var(--tier-1-fg)' };
  if (t === 2) return { bg: 'var(--tier-2-bg)', fg: 'var(--tier-2-fg)' };
  return { bg: 'var(--tier-3-bg)', fg: 'var(--tier-3-fg)' };
}

/** Chart colour for a tier: accent, then lighter accent, then greys. */
export function tierColor(t: number, count: number): string {
  if (t === 1) return 'var(--accent)';
  if (t === 2 && count > 2) return 'color-mix(in srgb, var(--accent) 45%, var(--paper-2))';
  const greyStep = Math.min(80, 30 + (t - 3) * 20);
  return t === count ? 'var(--ink-faint)' : `color-mix(in srgb, var(--ink-faint) ${100 - greyStep}%, var(--paper-2))`;
}

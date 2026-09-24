// Applicant search and filtering for the Pipeline (and ⌘K).
//
// Text search: every term must match the start of a word somewhere in the
// applicant's searchable text (name, phone, email, area, notes, officer,
// benefit and household labels). Quoted terms match as an exact phrase, so
// `uc "north finchley"` finds UC clients whose notes mention North Finchley.
// Structured filters (tier, client type, benefits, ...) are combined with AND.

import type { Applicant } from './types';
import { APPLICANT_STAGES } from '../types/extraction';
import type { ApplicantStage } from '../types/extraction';
import {
  computeTier, HOUSEHOLD_LABEL, WORK_STATUS_LABEL, URGENCY_LABEL, URGENCY_RANK,
} from './tiering';
import type { Tier } from './tiering';
import { activeSettings } from './settings';

// ── Derived fields ──────────────────────────────────────────────────

export type BenefitKey = 'uc' | 'pip' | 'lcwra' | 'hb';

// Website referrals store yes/no booleans; older records only have the
// free-text benefit_type ("UC", "HB"), so check both.
export const BENEFITS: ReadonlyArray<{ key: BenefitKey; label: string; words: string; has: (a: Applicant) => boolean }> = [
  { key: 'uc', label: 'UC', words: 'uc universal credit', has: (a) => a.on_uc === true || /\b(uc|universal credit)\b/i.test(a.benefit_type ?? '') },
  { key: 'pip', label: 'PIP', words: 'pip', has: (a) => a.pip === true || /\bpip\b/i.test(a.benefit_type ?? '') },
  { key: 'lcwra', label: 'LCWRA', words: 'lcwra', has: (a) => a.lcwra === true || /\blcwra\b/i.test(a.benefit_type ?? '') },
  { key: 'hb', label: 'HB', words: 'hb housing benefit', has: (a) => /\b(hb|housing benefit)\b/i.test(a.benefit_type ?? '') },
];

export const benefitsOf = (a: Applicant) => BENEFITS.filter((b) => b.has(a));

/** The tier in force: a tier set by hand (locked) wins; otherwise the current
 *  rules decide, so a change in Settings reaches every unlocked client. */
export const effectiveTier = (a: Applicant): Tier => {
  const stored = a.tier === 1 || a.tier === 2 || a.tier === 3 ? a.tier : null;
  if (a.tier_locked === undefined) return stored ?? computeTier(a); // before the 0005 update
  return a.tier_locked && stored ? stored : computeTier(a);
};

/** Urgent per Settings (by default: homeless tonight, or at risk within 56 days). */
export const isUrgent = (a: Applicant) => activeSettings().urgentLevels.includes(a.urgency ?? '');

export const isActive = (a: Applicant) => a.stage !== 'lost' && a.stage !== 'fee_paid' && a.stage !== 'fee_invoiced';

export const areaOf = (a: Applicant) => a.council || a.referring_borough || '';

export type HouseholdKey = 'single' | 'couple' | 'family' | 'other';

/** Client type. Uses the form answer; for older records infers family/couple
 *  from head counts, but never infers "single" (1 adult is just the default). */
export function householdOf(a: Applicant): HouseholdKey | null {
  const h = a.household_type;
  if (h === 'single' || h === 'couple' || h === 'family' || h === 'other') return h;
  if ((a.children ?? 0) > 0) return 'family';
  if ((a.adults ?? 0) >= 2) return 'couple';
  return null;
}

// ── Text search ─────────────────────────────────────────────────────

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Phone as typed in any common form: +447907..., 07907..., 7907... */
function phoneVariants(p: string | null): string[] {
  if (!p) return [];
  const d = p.replace(/\D/g, '');
  if (d.startsWith('44')) return [d, `0${d.slice(2)}`, d.slice(2)];
  if (d.startsWith('0')) return [d, d.slice(1)];
  return [d];
}

/** Normalised searchable text for an applicant, with a leading space so a
 *  term can be matched at a word start with a plain `includes(' ' + term)`. */
export function searchText(a: Applicant): string {
  const household = householdOf(a);
  const parts = [
    a.full_name, a.email, a.referring_borough, a.council, a.notes, a.requirements,
    a.officer_name, a.officer_email, a.source, a.housing_situation, a.lha_band,
    household ? HOUSEHOLD_LABEL[household] : '',
    a.work_status ? WORK_STATUS_LABEL[a.work_status] ?? '' : '',
    a.urgency && a.urgency !== 'none' ? URGENCY_LABEL[a.urgency] ?? '' : '',
    ...benefitsOf(a).map((b) => b.words),
    ...phoneVariants(a.phone),
  ];
  return ` ${norm(parts.filter(Boolean).join(' '))}`;
}

/** Split a query into terms; "quoted text" stays together as one phrase. */
export function parseQuery(q: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    const t = norm(m[1] ?? m[2] ?? '');
    if (t) terms.push(t);
  }
  return terms;
}

/** Every term must start at a word boundary in the searchable text. */
export const matchesTerms = (text: string, terms: string[]) => terms.every((t) => text.includes(` ${t}`));

// ── Structured filters ──────────────────────────────────────────────

export type StageFilter = 'active' | 'all' | ApplicantStage;
export type YesNoAny = 'any' | 'yes' | 'no';

export interface PipelineFilters {
  q: string;
  stage: StageFilter;
  tier: 'any' | '1' | '2' | '3';
  household: 'any' | HouseholdKey | 'unknown';
  work: 'any' | 'not_working' | 'part_time' | 'full_time';
  councilReg: YesNoAny;
  urgency: 'any' | 'urgent' | 'homeless_tonight' | 'at_risk_56' | 'temp_accommodation' | 'overcrowding';
  benefits: BenefitKey[]; // must have all of these
  calls: 'any' | 'due' | 'never' | 'scheduled'; // applied by the Pipeline, which has the call log
  owner: string; // 'any' | 'me' | 'none' | a team member's id; applied by the Pipeline, which knows who is signed in
}

export const DEFAULT_FILTERS: PipelineFilters = {
  q: '', stage: 'active', tier: 'any', household: 'any', work: 'any', councilReg: 'any', urgency: 'any', benefits: [], calls: 'any', owner: 'any',
};

export function applyFilters(
  list: Applicant[],
  f: PipelineFilters,
  textOf: (a: Applicant) => string = searchText,
): Applicant[] {
  const terms = parseQuery(f.q);
  return list.filter((a) => {
    if (f.stage === 'active' ? !isActive(a) : f.stage !== 'all' && a.stage !== f.stage) return false;
    if (f.tier !== 'any' && String(effectiveTier(a)) !== f.tier) return false;
    if (f.household !== 'any' && (householdOf(a) ?? 'unknown') !== f.household) return false;
    if (f.work !== 'any' && a.work_status !== f.work) return false;
    if (f.councilReg === 'yes' && a.council_registered !== true) return false;
    if (f.councilReg === 'no' && a.council_registered !== false) return false;
    if (f.urgency === 'urgent' ? !isUrgent(a) : f.urgency !== 'any' && a.urgency !== f.urgency) return false;
    for (const key of f.benefits) {
      if (!BENEFITS.some((b) => b.key === key && b.has(a))) return false;
    }
    return matchesTerms(textOf(a), terms);
  });
}

// ── URL <-> filters (so a search survives refresh and can be bookmarked) ─

const oneOf = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export function filtersFromParams(p: URLSearchParams): PipelineFilters {
  return {
    q: p.get('q') ?? '',
    stage: oneOf<StageFilter>(p.get('stage'), ['active', 'all', ...APPLICANT_STAGES], 'active'),
    tier: oneOf(p.get('tier'), ['any', '1', '2', '3'] as const, 'any'),
    household: oneOf(p.get('type'), ['any', 'single', 'couple', 'family', 'other', 'unknown'] as const, 'any'),
    work: oneOf(p.get('work'), ['any', 'not_working', 'part_time', 'full_time'] as const, 'any'),
    councilReg: oneOf(p.get('reg'), ['any', 'yes', 'no'] as const, 'any'),
    urgency: oneOf(p.get('urgency'), ['any', 'urgent', 'homeless_tonight', 'at_risk_56', 'temp_accommodation', 'overcrowding'] as const, 'any'),
    benefits: (p.get('benefits') ?? '').split(',').filter((b): b is BenefitKey => BENEFITS.some((x) => x.key === b)),
    calls: oneOf(p.get('calls'), ['any', 'due', 'never', 'scheduled'] as const, 'any'),
    owner: p.get('owner') || 'any',
  };
}

export function filtersToParams(f: PipelineFilters, base = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(base);
  const set = (k: string, v: string, def: string) => (v && v !== def ? p.set(k, v) : p.delete(k));
  set('q', f.q, '');
  set('stage', f.stage, 'active');
  set('tier', f.tier, 'any');
  set('type', f.household, 'any');
  set('work', f.work, 'any');
  set('reg', f.councilReg, 'any');
  set('urgency', f.urgency, 'any');
  set('benefits', f.benefits.join(','), '');
  set('calls', f.calls, 'any');
  set('owner', f.owner, 'any');
  return p;
}

// ── Sorting ─────────────────────────────────────────────────────────

export type SortKey = 'tier' | 'name' | 'household' | 'benefits' | 'area' | 'budget' | 'stage' | 'updated';

const HOUSEHOLD_ORDER: Record<string, number> = { single: 0, couple: 1, family: 2, other: 3 };
const benefitScore = (a: Applicant) => benefitsOf(a).reduce((s, b) => s + ({ lcwra: 8, pip: 4, uc: 2, hb: 1 })[b.key], 0);
const byName = (a: Applicant, b: Applicant) => a.full_name.localeCompare(b.full_name);
const time = (s: string) => new Date(s).getTime();

/** Natural order per key (dir 1): tier 1 first, A to Z, most benefits first,
 *  newest first. dir -1 reverses. Ties fall back to name. */
export function sortApplicants(list: Applicant[], key: SortKey, dir: 1 | -1): Applicant[] {
  const cmp = (a: Applicant, b: Applicant): number => {
    switch (key) {
      case 'tier': {
        const t = effectiveTier(a) - effectiveTier(b);
        if (t !== 0) return t * dir;
        // within a tier, most urgent then most recent always come first
        const u = (URGENCY_RANK[b.urgency ?? 'none'] ?? 0) - (URGENCY_RANK[a.urgency ?? 'none'] ?? 0);
        return u !== 0 ? u : time(b.updated_at) - time(a.updated_at);
      }
      case 'name': return byName(a, b) * dir;
      case 'household': {
        const d = (HOUSEHOLD_ORDER[householdOf(a) ?? ''] ?? 9) - (HOUSEHOLD_ORDER[householdOf(b) ?? ''] ?? 9);
        return (d || byName(a, b)) * dir;
      }
      case 'benefits': return ((benefitScore(b) - benefitScore(a)) || byName(a, b)) * dir;
      case 'area': {
        const x = areaOf(a), y = areaOf(b);
        if (!x !== !y) return x ? -1 : 1; // blanks always last
        return (x.localeCompare(y) || byName(a, b)) * dir;
      }
      case 'budget': return (((a.budget_pcm ?? 0) - (b.budget_pcm ?? 0)) || byName(a, b)) * dir;
      case 'stage': return ((APPLICANT_STAGES.indexOf(a.stage) - APPLICANT_STAGES.indexOf(b.stage)) || byName(a, b)) * dir;
      case 'updated': return (time(b.updated_at) - time(a.updated_at)) * dir;
    }
  };
  return [...list].sort(cmp);
}

// ── Display helpers ─────────────────────────────────────────────────

/** A one-line preview of what the client is looking for. When searching,
 *  the preview is centred on the first matching word so you can see why
 *  the row matched. */
export function previewText(a: Applicant, terms: string[], width = 110): string {
  const text = (a.notes || a.requirements || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.split(' ')[0]);
    if (i >= 0) { at = i; break; }
  }
  if (at < 0 || text.length <= width) return text.length > width ? `${text.slice(0, width).trimEnd()}…` : text;
  const start = Math.max(0, at - 30);
  const slice = text.slice(start, start + width).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + width < text.length ? '…' : ''}`;
}

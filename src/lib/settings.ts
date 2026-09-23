// App-wide rules, edited on the Settings page and shared by every device
// (one row in the settings table; loaded and saved by useSettings and
// useSaveSettings in hooks.ts). They drive triage (tiers, urgency), property
// matching and call follow-ups. Pure helpers such as computeTier read the
// active settings, which the app shell keeps up to date.

export interface TierRules {
  /** Tier 1 needs every ticked item. */
  tier1: { single: boolean; uc: boolean; pip: boolean; lcwra: boolean; councilRegistered: boolean };
  /** Tier 2 needs council registration (if ticked) and at least one of the other ticked items. */
  tier2: { councilRegistered: boolean; uc: boolean; fullTime: boolean; partTime: boolean; pip: boolean };
}

export interface AppSettings {
  tiers: TierRules;
  /** Urgency answers that count as urgent (flagged, sorted first, boost matches). */
  urgentLevels: string[];
  /** Properties above this rent are always offered to the clients below. */
  premiumRent: number;
  premiumFor: { pip: boolean; lcwra: boolean; fullTime: boolean; partTime: boolean };
  /** Show "Possible" matches as well as Good and Strong. */
  showPossibleMatches: boolean;
  /** Days until the next call, suggested after each outcome. */
  callAgainAfterNoAnswer: number;
  callAgainAfterAnswered: number;
  /** A new client not called within this many days shows as overdue. */
  firstCallWithinDays: number;
  /** Saved property lists older than this can be purged in one click. */
  purgeAfterDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  tiers: {
    tier1: { single: true, uc: true, pip: true, lcwra: true, councilRegistered: true },
    tier2: { councilRegistered: true, uc: true, fullTime: true, partTime: false, pip: false },
  },
  urgentLevels: ['homeless_tonight', 'at_risk_56'],
  premiumRent: 1300,
  premiumFor: { pip: true, lcwra: false, fullTime: true, partTime: false },
  showPossibleMatches: true,
  callAgainAfterNoAnswer: 2,
  callAgainAfterAnswered: 7,
  firstCallWithinDays: 1,
  purgeAfterDays: 14,
};

let active: AppSettings = DEFAULT_SETTINGS;
/** The settings in force right now (defaults until the saved ones load). */
export const activeSettings = () => active;
export const setActiveSettings = (s: AppSettings) => { active = s; };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Saved values over the defaults, so a setting added later still has a value. */
export function withDefaults<T>(base: T, saved: unknown): T {
  if (!isObject(base) || !isObject(saved)) {
    if (saved === undefined || saved === null) return base;
    return typeof saved === typeof base && Array.isArray(saved) === Array.isArray(base) ? (saved as T) : base;
  }
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) out[k] = withDefaults((base as Record<string, unknown>)[k], saved[k]);
  return out as T;
}

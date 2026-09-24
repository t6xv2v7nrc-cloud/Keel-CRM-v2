// Settings, edited on the Settings page and loaded by useSettings (hooks.ts).
// Two kinds:
//   • team settings: rules everyone works to (tiers, urgency, the premium rent
//     rule, first-call deadline, purging). One shared row, key "app".
//   • my settings: preferences each person sets for themselves (follow-up
//     gaps, Possible matches, start page, default call list). One row per
//     person, key "user:<id>".
// Pure helpers such as computeTier read the active settings (team rules plus
// the signed-in person's own), which the app shell keeps up to date.

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
  /** Page to open after signing in. */
  startPage: '/' | '/calls' | '/pipeline' | '/bin' | '/properties';
  /** Which clients the Calls page shows first. */
  callsView: 'everyone' | 'mine';
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
  startPage: '/',
  callsView: 'everyone',
};

/** Settings each person sets for themselves; everything else is shared by the team. */
export const PERSONAL_KEYS = ['showPossibleMatches', 'callAgainAfterNoAnswer', 'callAgainAfterAnswered', 'startPage', 'callsView'] as const;
type PersonalKey = (typeof PERSONAL_KEYS)[number];
export type MySettings = Pick<AppSettings, PersonalKey>;
export type TeamSettings = Omit<AppSettings, PersonalKey>;

const isPersonal = (k: string): k is PersonalKey => (PERSONAL_KEYS as readonly string[]).includes(k);
export const myPart = (s: AppSettings): MySettings =>
  Object.fromEntries(Object.entries(s).filter(([k]) => isPersonal(k))) as MySettings;
export const teamPart = (s: AppSettings): TeamSettings =>
  Object.fromEntries(Object.entries(s).filter(([k]) => !isPersonal(k))) as TeamSettings;

/** Team rules with this person's own preferences on top. (Before settings were
 *  split, the team row also held the personal ones; those still count until a
 *  person saves their own.) */
export function mergeSettings(team: unknown, mine: unknown): AppSettings {
  const base = withDefaults(DEFAULT_SETTINGS, team);
  const own = isObject(mine) ? Object.fromEntries(Object.entries(mine).filter(([k]) => isPersonal(k))) : {};
  return withDefaults(base, own);
}

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

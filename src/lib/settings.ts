// Settings, edited on the Settings page and loaded by useSettings (hooks.ts).
// Two kinds:
//   • team settings: rules everyone works to (tiers, urgency, the premium rent
//     rule, first-call deadline, purging). One shared row, key "app".
//   • my settings: preferences each person sets for themselves (follow-up
//     gaps, Possible matches, start page, default call list). One row per
//     person, key "user:<id>".
// Pure helpers such as computeTier read the active settings (team rules plus
// the signed-in person's own), which the app shell keeps up to date.

import type { DueRule } from './types';

// ── Tier logic ─────────────────────────────────────────────────────
// Any number of tiers, checked in order; a client gets the first tier whose
// conditions they meet, and the last tier is "everyone else". Each tier has
// conditions that must all be true, plus (optionally) a list where at least
// one must be true. Evaluated in tiering.ts.

/** Client answers a condition can test. */
export type CondField =
  | 'household' | 'uc' | 'pip' | 'lcwra' | 'hb' | 'councilRegistered' | 'consent'
  | 'work' | 'urgency' | 'children' | 'adults' | 'budget' | 'council';

export interface Condition {
  field: CondField;
  /** yes / no / unknown for yes-no answers; oneOf / noneOf for choices;
   *  atLeast / atMost for numbers; unknown works for everything. */
  op: 'yes' | 'no' | 'oneOf' | 'noneOf' | 'atLeast' | 'atMost' | 'unknown';
  values?: string[];
  n?: number;
}

export interface TierDef {
  label: string;
  /** Every one of these must be true. */
  all: Condition[];
  /** And, if any are listed, at least one of these. */
  any: Condition[];
}

export interface TierLogic { tiers: TierDef[] }

export const DEFAULT_TIER_LOGIC: TierLogic = {
  tiers: [
    { label: 'Tier 1', all: [
      { field: 'household', op: 'oneOf', values: ['single'] }, { field: 'uc', op: 'yes' }, { field: 'pip', op: 'yes' },
      { field: 'lcwra', op: 'yes' }, { field: 'councilRegistered', op: 'yes' },
    ], any: [] },
    { label: 'Tier 2', all: [{ field: 'councilRegistered', op: 'yes' }],
      any: [{ field: 'uc', op: 'yes' }, { field: 'work', op: 'oneOf', values: ['full_time'] }] },
    { label: 'Tier 3', all: [], any: [] },
  ],
};

/** Tier rules as saved before the rule builder (ticked boxes for two tiers). */
interface OldTierRules {
  tier1: { single: boolean; uc: boolean; pip: boolean; lcwra: boolean; councilRegistered: boolean };
  tier2: { councilRegistered: boolean; uc: boolean; fullTime: boolean; partTime: boolean; pip: boolean };
}

function fromOldRules(r: OldTierRules): TierLogic {
  const yes = (field: CondField): Condition => ({ field, op: 'yes' });
  const t1: Condition[] = [];
  if (r.tier1.single) t1.push({ field: 'household', op: 'oneOf', values: ['single'] });
  if (r.tier1.uc) t1.push(yes('uc'));
  if (r.tier1.pip) t1.push(yes('pip'));
  if (r.tier1.lcwra) t1.push(yes('lcwra'));
  if (r.tier1.councilRegistered) t1.push(yes('councilRegistered'));
  const t2any: Condition[] = [];
  if (r.tier2.uc) t2any.push(yes('uc'));
  if (r.tier2.pip) t2any.push(yes('pip'));
  const work = [r.tier2.fullTime && 'full_time', r.tier2.partTime && 'part_time'].filter(Boolean) as string[];
  if (work.length) t2any.push({ field: 'work', op: 'oneOf', values: work });
  return { tiers: [
    { label: 'Tier 1', all: t1, any: [] },
    { label: 'Tier 2', all: r.tier2.councilRegistered ? [yes('councilRegistered')] : [], any: t2any },
    { label: 'Tier 3', all: [], any: [] },
  ] };
}

export interface AppSettings {
  tierLogic: TierLogic;
  /** Co-workers may set a client's tier by hand (the owner always can). */
  membersCanSetTier: boolean;
  /** Urgency answers that count as urgent (flagged, sorted first, boost matches). */
  urgentLevels: string[];
  /** Properties above this rent are always offered to the clients below. */
  premiumRent: number;
  /** The most a client on UC alone (no PIP or LCWRA, not working) can afford, pcm. They are never matched above it. 0 = no limit. */
  ucOnlyRentCap: number;
  premiumFor: { pip: boolean; lcwra: boolean; fullTime: boolean; partTime: boolean };
  /** Show "Possible" matches as well as Good and Strong. */
  showPossibleMatches: boolean;
  /** Days until the next call, suggested after each outcome. */
  callAgainAfterNoAnswer: number;
  callAgainAfterAnswered: number;
  /** A new client not called within this many days shows as overdue. */
  firstCallWithinDays: number;
  /** A client counts as stuck after this many days at a stage with nothing moving (0 = never). */
  stuckAfterDays: { lead: number; referred: number; viewing: number; offer: number };
  /** Saved property lists older than this can be purged in one click. */
  purgeAfterDays: number;
  /** LHA rates loaded from a CSV (a newer year); null uses the built-in rates. */
  lhaRates: { year: string; rates: Record<string, number[]> } | null;
  /** Corrections to which LHA area (BRMA) a postcode district or borough is in. */
  lhaAreaOverrides: Record<string, string>;
  /** How far over LHA (pcm) a client might top up before a property counts as unaffordable. */
  lhaLeeway: number;
  /** Wording when sending properties to a client on WhatsApp ({first name}, {a property}, {properties}, {my name}). */
  whatsappMessage: string;
  /** Wording for a viewing reminder ({first name}, {address}, {when}, {my name}). */
  whatsappReminder: string;
  /** Wording for requests to providers, per type, plus a short chase. See lib/requests.ts for the placeholders. */
  requestTemplates: { availability: string; viewing: string; details: string; chase: string; reschedule: string; cancel: string };
  /** Wording to a client when their viewing moves or is cancelled ({first name}, {address}, {when}, {old when}, {my name}). */
  whatsappViewingMoved: string;
  whatsappViewingCancelled: string;
  /** Hours to wait for a provider's reply before a request is due a chase. */
  requestFollowUpHours: number;
  /** New clients start as OK to share their details with landlords (applied by the database, migration 0011). */
  shareWithLandlordsByDefault: boolean;
  /** When a letting fee falls due after sign up, for payers with no rule of their own (a provider's own rule wins). */
  feeDue: DueRule;
  /** When a council incentive should have been paid, counted from sign up. */
  incentiveDue: DueRule;
  /** Wording when chasing a provider for a letting fee on WhatsApp. */
  feeChaseMessage: string;
  /** When a client's first month's rent usually arrives, counted from sign up (for fees that wait for it). */
  firstRentExpected: DueRule;
  /** Keel's details printed on invoices, and how invoices are numbered. */
  invoice: InvoiceSettings;
  /** Wording when sending an invoice on WhatsApp. */
  invoiceMessage: string;
  /** Page to open after signing in. */
  startPage: '/' | '/calls' | '/pipeline' | '/bin' | '/properties';
  /** Which clients the Calls page shows first. */
  callsView: 'everyone' | 'mine';
}

export const DEFAULT_WHATSAPP_MESSAGE = [
  'Hi {first name}, I have {a property} that could suit you:',
  '',
  '{properties}',
  '',
  'Would you like to view? Reply here and I will arrange it.',
  '{my name}, Keel Lettings',
].join('\n');

export const DEFAULT_WHATSAPP_REMINDER = [
  'Hi {first name}, a reminder of your viewing at {address} on {when}.',
  'Reply here if you need to change it.',
  '{my name}, Keel Lettings',
].join('\n');

// A line with a {client_...} placeholder is repeated once per client, so one message can cover several.
export const DEFAULT_REQUEST_TEMPLATES = {
  availability: [
    'Salam {provider_first_name}, is {property_address} ({property_rent}) still available?',
    'I have a client: {client_household}, {client_benefits}',
    'Thanks, {my_name}, Keel Lettings',
  ].join('\n'),
  viewing: [
    'Salam {provider_first_name}, can I book a viewing at {property_address}?',
    'Client: {client_first_name}, {client_household}, {client_benefits}',
    'Available: {slots}',
    'Thanks, {my_name}, Keel Lettings',
  ].join('\n'),
  details: [
    'Salam {provider_first_name}, here are my client details for {property_address} ({property_rent}):',
    'Client: {client_first_name}, {client_household}, {client_benefits}',
    'Thanks, {my_name}, Keel Lettings',
  ].join('\n'),
  chase: 'Salam {provider_first_name}, just checking on my message about {property_address}. Thanks, {my_name}',
  reschedule: [
    'Salam {provider_first_name}, can we move the viewing at {property_address} from {old_time} to {new_time}?',
    'Client: {client_first_name}',
    'Thanks, {my_name}, Keel Lettings',
  ].join('\n'),
  cancel: [
    'Salam {provider_first_name}, sorry, we need to cancel the viewing at {property_address} on {old_time}.',
    'Client: {client_first_name}',
    'Thanks, {my_name}, Keel Lettings',
  ].join('\n'),
};

export const DEFAULT_FEE_CHASE = [
  'Salam {provider_first_name}, the letting fee of {amount} for {client_first_name} at {property_address} was due on {due_date}.',
  'Could you let me know when it will be paid?',
  'Thanks, {my_name}, Keel Lettings',
].join('\n');

export const DEFAULT_INVOICE_MESSAGE = [
  'Salam {provider_first_name}, here is invoice {invoice_number} for {amount}: the letting fee for {client_first_name} at {property_address}, due {due_date}.',
  'Bank: {account_name}, sort code {sort_code}, account {account_number}. Please quote {invoice_number}.',
  'Thanks, {my_name}, Keel Lettings',
].join('\n');

export interface InvoiceSettings {
  businessName: string;
  /** One line each */
  address: string;
  email: string;
  phone: string;
  companyNumber: string;
  /** Printed when VAT registered; the amount then counts as including VAT at 20%. */
  vatRegistered: boolean;
  vatNumber: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  /** The line under the bank details. */
  terms: string;
  /** Invoice numbers are the prefix and a running number: KEEL-0001. */
  prefix: string;
  /** The lowest number to use, to carry on from invoices raised before Keel did them. */
  startAt: number;
}

export const DEFAULT_INVOICE: InvoiceSettings = {
  businessName: 'Keel Lettings Ltd',
  address: '',
  email: '',
  phone: '',
  companyNumber: '',
  vatRegistered: false,
  vatNumber: '',
  bankName: '',
  accountName: 'Keel Lettings Ltd',
  sortCode: '',
  accountNumber: '',
  terms: 'Please pay by bank transfer, quoting the invoice number.',
  prefix: 'KEEL-',
  startAt: 1,
};

export const DEFAULT_VIEWING_MOVED = [
  'Hi {first name}, your viewing at {address} has moved to {when}.',
  'Reply here if that time does not work for you.',
  '{my name}, Keel Lettings',
].join('\n');

export const DEFAULT_VIEWING_CANCELLED = [
  'Hi {first name}, sorry, your viewing at {address} on {old when} is cancelled.',
  'I will be in touch about another time.',
  '{my name}, Keel Lettings',
].join('\n');

export const DEFAULT_SETTINGS: AppSettings = {
  tierLogic: DEFAULT_TIER_LOGIC,
  membersCanSetTier: true,
  urgentLevels: ['homeless_tonight', 'at_risk_56'],
  premiumRent: 1300,
  ucOnlyRentCap: 1100,
  premiumFor: { pip: true, lcwra: false, fullTime: true, partTime: false },
  showPossibleMatches: true,
  callAgainAfterNoAnswer: 2,
  callAgainAfterAnswered: 7,
  firstCallWithinDays: 1,
  stuckAfterDays: { lead: 3, referred: 7, viewing: 7, offer: 10 },
  purgeAfterDays: 14,
  lhaRates: null,
  lhaAreaOverrides: {},
  lhaLeeway: 50,
  whatsappMessage: DEFAULT_WHATSAPP_MESSAGE,
  whatsappReminder: DEFAULT_WHATSAPP_REMINDER,
  requestTemplates: DEFAULT_REQUEST_TEMPLATES,
  whatsappViewingMoved: DEFAULT_VIEWING_MOVED,
  whatsappViewingCancelled: DEFAULT_VIEWING_CANCELLED,
  requestFollowUpHours: 24,
  shareWithLandlordsByDefault: false,
  // `from` is spelt out so a saved "after the first month's rent" survives withDefaults
  feeDue: { n: 1, unit: 'months', from: 'sign_up' },
  incentiveDue: { n: 6, unit: 'weeks', from: 'sign_up' },
  feeChaseMessage: DEFAULT_FEE_CHASE,
  firstRentExpected: { n: 1, unit: 'months', from: 'sign_up' },
  invoice: DEFAULT_INVOICE,
  invoiceMessage: DEFAULT_INVOICE_MESSAGE,
  startPage: '/',
  callsView: 'everyone',
};

/** Settings each person sets for themselves; everything else is shared by the team. */
const PERSONAL_KEYS = ['showPossibleMatches', 'callAgainAfterNoAnswer', 'callAgainAfterAnswered', 'startPage', 'callsView'] as const;
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
  // tier rules saved before the rule builder
  if (isObject(team) && !('tierLogic' in team) && isObject(team.tiers)) base.tierLogic = fromOldRules(team.tiers as unknown as OldTierRules);
  const own = isObject(mine) ? Object.fromEntries(Object.entries(mine).filter(([k]) => isPersonal(k))) : {};
  return withDefaults(base, own);
}

let active: AppSettings = DEFAULT_SETTINGS;
/** The settings in force right now (defaults until the saved ones load). */
export const activeSettings = () => active;
export const setActiveSettings = (s: AppSettings) => { active = s; };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Saved values over the defaults, so a setting added later still has a value. */
function withDefaults<T>(base: T, saved: unknown): T {
  // an open-ended map (empty by default) keeps whatever was saved
  if (isObject(base) && Object.keys(base).length === 0 && isObject(saved)) return saved as T;
  if (!isObject(base) || !isObject(saved)) {
    if (saved === undefined || saved === null) return base;
    return typeof saved === typeof base && Array.isArray(saved) === Array.isArray(base) ? (saved as T) : base;
  }
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) out[k] = withDefaults((base as Record<string, unknown>)[k], saved[k]);
  return out as T;
}

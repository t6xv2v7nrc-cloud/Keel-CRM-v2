/** Shared extraction contract (§5.2 of KEEL_CRM_PLAN.md).
 *  Imported by both the client review card and the Netlify extract function.
 *  No `any` — this file is the source of truth for the tool schema. */

export const DOC_TYPES = [
  'applicant_referral',
  'property_details',
  'officer_message',
  'fee_confirmation',
  'viewing_arrangement',
  'landlord_offer',
  'tenancy_doc',
  'unknown',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const SUGGESTED_ACTIONS = [
  'create_applicant',
  'update_applicant',
  'advance_stage',
  'create_property',
  'update_property',
  'create_contact',
  'create_placement',
  'update_placement',
  'record_fee',
  'log_note_only',
] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

export const APPLICANT_STAGES = [
  'lead',
  'referred',
  'viewing',
  'offer',
  'placed',
  'fee_invoiced',
  'fee_paid',
  'lost',
] as const;
export type ApplicantStage = (typeof APPLICANT_STAGES)[number];

export interface ExtractedApplicant {
  full_name?: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  adults?: number;
  children?: number;
  benefit_type?: string;
  referring_borough?: string;
  budget_pcm?: number;
  requirements?: string;
  notes?: string;                // the client's own message: what they are looking for
  // Referral triage fields
  household_type?: string;       // 'single'|'couple'|'family'|'other'
  on_uc?: boolean;
  pip?: boolean;
  lcwra?: boolean;
  council_registered?: boolean;
  work_status?: string;          // 'not_working'|'part_time'|'full_time'
  urgency?: string;
  council?: string;
  officer_name?: string;
  officer_email?: string;
  officer_phone?: string;
  housing_situation?: string;
  consent?: boolean;
  tier?: number;                 // computed at intake; recomputed on edit
}

export interface ExtractedProperty {
  address_line?: string;
  postcode?: string;
  borough?: string;
  property_type?: string;
  rent_pcm?: number;
  available_from?: string;
}

export interface ExtractedContact {
  full_name?: string;
  organisation?: string;
  borough?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface ExtractedMoney {
  fee_amount?: number;
  incentive_amount?: number;
  rent_pcm?: number;
}

export interface ExtractedDate {
  label?: string;
  date?: string;
}

export interface Extraction {
  doc_type: DocType;
  transcription: string;
  summary: string;
  confidence: number;
  applicant?: ExtractedApplicant;
  property?: ExtractedProperty;
  contact?: ExtractedContact;
  money?: ExtractedMoney;
  dates?: ExtractedDate[];
  suggested_actions?: SuggestedAction[];
}

// ── Reading a screenshot with Claude ───────────────────────────────
// The JSON schema Claude's answer must follow (structured outputs), and a
// check that turns whatever comes back into a clean Extraction. Both the
// Netlify function and the Bin run the check: an answer is never trusted as is.

export const HOUSEHOLD_TYPES = ['single', 'couple', 'family', 'other'] as const;
export const WORK_STATUSES = ['not_working', 'part_time', 'full_time'] as const;
export const URGENCIES = ['homeless_tonight', 'at_risk_56', 'temp_accommodation', 'overcrowding', 'none'] as const;
/** Contacts were removed: the Bin never offers to create one. */
export const READ_ACTIONS = SUGGESTED_ACTIONS.filter((a) => a !== 'create_contact');

const text = (description: string) => ({ type: 'string', description });
const whole = (description: string) => ({ type: 'integer', description });
const amount = (description: string) => ({ type: 'number', description });
const yesNo = (description: string) => ({ type: 'boolean', description });
const pick = (values: readonly string[], description: string) => ({ type: 'string', enum: [...values], description });
const day = (description: string) => ({ type: 'string', format: 'date', description });
const object = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false });

export const EXTRACTION_SCHEMA = object({
  doc_type: pick(DOC_TYPES, 'What the screenshot is'),
  transcription: text('Every word in the screenshot, in reading order, one message per line'),
  summary: text('One plain sentence on what it is and who it is about'),
  confidence: amount('0 to 1: how sure you are of doc_type and the fields'),
  applicant: object({
    full_name: text('The client (the person looking for a home), as written'),
    phone: text('The client\'s phone number'),
    email: text('The client\'s email'),
    date_of_birth: day('Date of birth'),
    adults: whole('Adults moving in, the client included'),
    children: whole('Children moving in'),
    benefit_type: text('Benefits named, comma separated, e.g. "UC, PIP"'),
    referring_borough: text('The council or borough referring them'),
    budget_pcm: amount('Most they can pay a month in pounds'),
    requirements: text('What they need: beds, area, ground floor and so on'),
    notes: text('The client\'s own words on what they are looking for'),
    household_type: pick(HOUSEHOLD_TYPES, 'Single, couple, family (any children) or other'),
    on_uc: yesNo('On Universal Credit'),
    pip: yesNo('Gets PIP'),
    lcwra: yesNo('Has LCWRA (limited capability for work)'),
    council_registered: yesNo('On the council\'s housing register'),
    work_status: pick(WORK_STATUSES, 'Work'),
    urgency: pick(URGENCIES, 'How urgent the housing need is'),
    council: text('The council responsible for them'),
    officer_name: text('Their housing officer or support worker'),
    officer_email: text('That officer\'s email'),
    officer_phone: text('That officer\'s phone'),
    housing_situation: text('Where they live now, e.g. "Temporary accommodation", "Sofa surfing"'),
    consent: yesNo('They agreed to their details being shared'),
  }),
  property: object({
    address_line: text('The property address, without the postcode'),
    postcode: text('UK postcode'),
    borough: text('Borough'),
    property_type: text('e.g. "Studio", "1 bed flat", "Room"'),
    rent_pcm: amount('Rent a month in pounds (a weekly rent times 52, divided by 12)'),
    available_from: day('When it is available'),
  }),
  money: object({
    fee_amount: amount('A letting fee in pounds'),
    incentive_amount: amount('A council incentive in pounds'),
    rent_pcm: amount('Rent a month in pounds'),
  }),
  dates: { type: 'array', items: object({ label: text('What happens: "Viewing", "Move in"'), date: day('The day') }) },
  suggested_actions: { type: 'array', items: pick(READ_ACTIONS, 'What Keel should do with it') },
}, ['doc_type', 'transcription', 'summary', 'confidence']);

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[£,\s]/g, '')) : NaN;
  return Number.isFinite(n) && (typeof v === 'number' || str(v)) ? n : undefined;
};
const int = (v: unknown) => { const n = num(v); return n !== undefined && n >= 0 ? Math.round(n) : undefined; };
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined);
const isoDay = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined; };
/** Leaves out empty fields; undefined when nothing is left. */
function compact<T extends object>(o: T): T | undefined {
  const kept = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(kept).length ? (kept as T) : undefined;
}

/** A clean Extraction from Claude's answer (or null if it is not one): unknown keys dropped, wrong types left out. */
export function cleanExtraction(raw: unknown): Extraction | null {
  if (!isBag(raw)) return null;
  const a = isBag(raw.applicant) ? raw.applicant : {};
  const p = isBag(raw.property) ? raw.property : {};
  const m = isBag(raw.money) ? raw.money : {};
  const confidence = num(raw.confidence);
  const out: Extraction = {
    doc_type: oneOf(DOC_TYPES, raw.doc_type) ?? 'unknown',
    transcription: typeof raw.transcription === 'string' ? raw.transcription.trim() : '',
    summary: str(raw.summary) ?? 'Read by Claude.',
    confidence: confidence === undefined ? 0.5 : Math.min(1, Math.max(0, confidence)),
  };
  const applicant = compact<ExtractedApplicant>({
    full_name: str(a.full_name), phone: str(a.phone), email: str(a.email), date_of_birth: isoDay(a.date_of_birth),
    adults: int(a.adults), children: int(a.children), benefit_type: str(a.benefit_type), referring_borough: str(a.referring_borough),
    budget_pcm: num(a.budget_pcm), requirements: str(a.requirements), notes: str(a.notes),
    household_type: oneOf(HOUSEHOLD_TYPES, a.household_type), on_uc: bool(a.on_uc), pip: bool(a.pip), lcwra: bool(a.lcwra),
    council_registered: bool(a.council_registered), work_status: oneOf(WORK_STATUSES, a.work_status), urgency: oneOf(URGENCIES, a.urgency),
    council: str(a.council), officer_name: str(a.officer_name), officer_email: str(a.officer_email), officer_phone: str(a.officer_phone),
    housing_situation: str(a.housing_situation), consent: bool(a.consent),
  });
  if (applicant) out.applicant = applicant;
  const property = compact<ExtractedProperty>({
    address_line: str(p.address_line), postcode: str(p.postcode), borough: str(p.borough), property_type: str(p.property_type),
    rent_pcm: num(p.rent_pcm), available_from: isoDay(p.available_from),
  });
  if (property) out.property = property;
  const money = compact<ExtractedMoney>({ fee_amount: num(m.fee_amount), incentive_amount: num(m.incentive_amount), rent_pcm: num(m.rent_pcm) });
  if (money) out.money = money;
  const dates = (Array.isArray(raw.dates) ? raw.dates : []).filter(isBag)
    .map((d) => compact<ExtractedDate>({ label: str(d.label), date: isoDay(d.date) })).filter((d): d is ExtractedDate => !!d?.date);
  if (dates.length) out.dates = dates;
  const actions = (Array.isArray(raw.suggested_actions) ? raw.suggested_actions : [])
    .flatMap((x): SuggestedAction[] => { const act = oneOf(READ_ACTIONS, x); return act ? [act] : []; });
  if (actions.length) out.suggested_actions = [...new Set(actions)];
  return out;
}

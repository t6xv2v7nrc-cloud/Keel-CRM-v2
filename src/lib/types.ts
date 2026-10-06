import type { ApplicantStage } from '../types/extraction';

export interface Applicant {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  adults: number | null;
  children: number | null;
  benefit_type: string | null;
  referring_borough: string | null;
  source: string | null;
  referred_by: string | null;
  stage: ApplicantStage;
  budget_pcm: number | null;
  lha_band: string | null;
  requirements: string | null;
  notes: string | null;
  // Referral triage fields (0002_tiering.sql)
  on_uc: boolean | null;
  pip: boolean | null;
  lcwra: boolean | null;
  council_registered: boolean | null;
  work_status: string | null;
  household_type: string | null;
  urgency: string | null;
  council: string | null;
  officer_name: string | null;
  officer_email: string | null;
  officer_phone: string | null;
  housing_situation: string | null;
  consent: boolean | null;
  tier: number | null;
  // 0005_calls_settings.sql (undefined until that update is run)
  tier_locked?: boolean;      // tier set by hand; rule changes leave it alone
  next_call_at?: string | null; // YYYY-MM-DD
  // 0006_team.sql
  assigned_to?: string | null;  // user id of whoever looks after this client
  // 0009_progress.sql
  next_step?: string | null;        // what to do next; its date is next_call_at
  stage_changed_at?: string | null; // when the stage last moved
  // 0010_providers_requests.sql
  share_with_landlords?: boolean;   // OK to send their details to landlords and agents
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  type: 'housing_officer' | 'partner' | 'landlord' | 'other';
  full_name: string;
  organisation: string | null;
  borough: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  address_line: string;
  postcode: string | null;
  borough: string | null;
  property_type: string | null;
  rent_pcm: number | null;
  lha_rate_pcm: number | null;
  landlord_id: string | null;
  status: 'void' | 'under_offer' | 'let' | 'withdrawn';
  available_from: string | null;
  notes: string | null;
  // Stock list import (0004_properties_import.sql)
  bedrooms: number | null;
  bills: string | null;
  furnished: string | null;
  rent_text: string | null;
  area: string | null;
  source_tag: string | null;
  lha_area?: string | null; // 0008: LHA area (BRMA) chosen by hand
  provider_id?: string | null; // 0010: who supplied it
  created_at: string;
  updated_at: string;
}

export interface Placement {
  id: string;
  applicant_id: string;
  property_id: string | null;
  council: string | null;
  officer_id: string | null;
  move_in_date: string | null;
  rent_pcm: number | null;
  incentive_amount: number | null;
  fee_amount: number | null;
  fee_splits: Array<{ partner: string; pct: number }>;
  fee_status: 'pending' | 'invoiced' | 'paid';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  entity_type: string;
  entity_id: string;
  kind: string;
  body: string;
  inbox_item_id: string | null;
  actor?: string | null; // who did it (0006); empty for website intake
  created_at: string;
}

export type CallOutcome = 'answered' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number';

export interface Call {
  id: string;
  applicant_id: string;
  direction: 'outgoing' | 'incoming';
  outcome: CallOutcome;
  notes: string | null;
  created_by?: string | null; // who logged it (0006)
  created_at: string;
}

/** A property a client is going for, and how far it has got (0009). */
export type DealStatus = 'sent' | 'interested' | 'viewing' | 'viewed' | 'offered' | 'accepted' | 'moved_in' | 'fell_through';
export interface Deal {
  id: string;
  applicant_id: string;
  property_id: string | null;
  address: string;
  status: DealStatus;
  viewing_at: string | null;
  move_in_on: string | null;
  fell_through_reason: string | null;
  notes: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** What a provider will take (0010). All optional; an empty rule means anyone. */
export interface ProviderRules {
  benefits_required?: string[];  // any of: "PIP", "LCWRA", "UC", "HB", "Full-time"
  household_allowed?: string[];  // "Single", "Couple", "Family"
  max_rent?: number | null;
  boroughs?: string[];           // councils they take clients from
  furnished?: 'furnished' | 'unfurnished' | null;
  /** Their usual letting fee to Keel, and when it falls due after sign up (kept with the rules: no extra database column).
   *  A set amount (fee_amount), or worked out from the rent: fee_basis 'percent' or 'weeks' with fee_rate (50 for 50%, 1 for a week). */
  fee_amount?: number | null;
  fee_basis?: FeeBasis | null;
  fee_rate?: number | null;
  fee_due?: DueRule | null;
}

/** How a fee is worked out: a set amount, a percentage of the monthly rent, or a number of weeks' rent. */
export type FeeBasis = 'fixed' | 'percent' | 'weeks';

/** "1 month after sign up", or "7 days after the first month's rent is paid": when money falls due. */
export interface DueRule { n: number; unit: 'days' | 'weeks' | 'months'; from?: DueFrom }
/** What a due date counts from: the sign-up date, or the day the client's first month's rent is paid. */
export type DueFrom = 'sign_up' | 'first_rent';

export type ReceivableKind = 'letting_fee' | 'incentive';
export type ReceivableStatus = 'due' | 'chased' | 'paid' | 'to_claim' | 'submitted' | 'declined';

/** Money Keel is owed for a placement: a letting fee, or a council incentive (0012; the optional fields need 0013). */
export interface Receivable {
  id: string;
  kind: ReceivableKind;
  applicant_id: string;
  deal_id: string | null;
  property_address: string | null;
  payer: string;                 // 'Watermint', 'Zuber', 'Landlord', or the council for an incentive
  provider_id: string | null;
  amount: number | null;         // null until the amount is known
  sign_up_on: string | null;     // YYYY-MM-DD
  due_on: string | null;
  claim_submitted_on: string | null;
  status: ReceivableStatus;
  paid_on: string | null;
  notes: string | null;
  // 0013_finances.sql (undefined until that update is run)
  rent_pcm?: number | null;            // the rent a fee is worked out from
  fee_basis?: FeeBasis | null;         // how the amount was worked out; null means typed in
  fee_rate?: number | null;            // the percentage, or the number of weeks
  due_after?: DueFrom | null;          // what the due date counts from
  first_rent_due_on?: string | null;   // when the client's first month's rent is expected
  first_rent_paid_on?: string | null;  // when it was paid
  invoice_number?: string | null;      // e.g. KEEL-0007, once an invoice is raised
  invoiced_on?: string | null;
  bill_to?: string | null;             // who the invoice is addressed to, one line each
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Who supplies properties: the source tag on a stock list (0010). */
export interface Provider {
  id: string;
  name: string;
  contact_first_name: string | null;
  company: string | null;
  tag: string;
  whatsapp: string | null; // digits only, e.g. 447700900123
  email: string | null;
  rules: ProviderRules;
  fee_terms: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type RequestType = 'availability' | 'viewing' | 'details';
export type RequestStatus = 'sent' | 'confirmed' | 'declined' | 'no_reply' | 'cancelled';

/** A request sent to a provider on WhatsApp (0010). */
export interface ProviderRequest {
  id: string;
  provider_id: string | null;
  property_id: string | null;
  property_address: string;
  client_ids: string[];
  type: RequestType;
  message: string;
  slots: string[];
  status: RequestStatus;
  sent_at: string;
  follow_up_at: string | null;
  outcome_note: string | null;
  override_reason: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Someone who can sign in (0006). */
export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role?: 'owner' | 'member'; // 0007; the owner alone changes team settings
}

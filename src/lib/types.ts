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

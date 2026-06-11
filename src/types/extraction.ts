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
  date_of_birth?: string;
  adults?: number;
  children?: number;
  benefit_type?: string;
  referring_borough?: string;
  budget_pcm?: number;
  requirements?: string;
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

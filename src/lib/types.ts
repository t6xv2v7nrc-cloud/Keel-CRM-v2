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
  created_at: string;
}

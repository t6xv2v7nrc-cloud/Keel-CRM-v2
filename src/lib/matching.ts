import { supabase } from './supabase';
import type { Extraction } from '../types/extraction';

export interface MatchCandidate {
  id: string;
  label: string;        // display name
  sub?: string;         // borough / stage / org
  score: number;        // 0..1
  reason: string;       // "phone match" | "name 0.62" | ...
}

export interface MatchResult {
  applicant: MatchCandidate[];
  contact: MatchCandidate[];
  property: MatchCandidate[];
}

const STRONG = 0.95;

/** Run the matching engine for an extraction (§6).
 *  Order: exact phone, exact postcode, then trigram name via RPC. */
export async function runMatching(ex: Extraction): Promise<MatchResult> {
  const result: MatchResult = { applicant: [], contact: [], property: [] };

  // ── Applicant: phone first, then fuzzy name ──
  const appPhone = ex.applicant?.phone;
  if (appPhone) {
    const { data } = await supabase
      .from('applicants')
      .select('id, full_name, referring_borough, stage')
      .eq('phone', appPhone)
      .limit(3);
    for (const a of data ?? []) {
      result.applicant.push({
        id: a.id,
        label: a.full_name,
        sub: [a.referring_borough, a.stage].filter(Boolean).join(' · '),
        score: STRONG,
        reason: 'phone match',
      });
    }
  }
  if (result.applicant.length === 0 && ex.applicant?.full_name) {
    const { data } = await supabase.rpc('match_applicants', {
      query: ex.applicant.full_name,
      threshold: 0.45,
    });
    for (const a of (data ?? []) as Array<Record<string, unknown>>) {
      const borough = ex.applicant.referring_borough;
      const boroughBoost = borough && a.referring_borough === borough ? 0.15 : 0;
      result.applicant.push({
        id: a.id as string,
        label: a.full_name as string,
        sub: [a.referring_borough, a.stage].filter(Boolean).join(' · '),
        score: Math.min(0.99, (a.score as number) + boroughBoost),
        reason: `name ${(a.score as number).toFixed(2)}${boroughBoost ? ' + borough' : ''}`,
      });
    }
  }

  // ── Contact: phone first, then fuzzy name ──
  const conPhone = ex.contact?.phone;
  if (conPhone) {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, organisation, borough')
      .eq('phone', conPhone)
      .limit(3);
    for (const c of data ?? []) {
      result.contact.push({
        id: c.id,
        label: c.full_name,
        sub: [c.organisation, c.borough].filter(Boolean).join(' · '),
        score: STRONG,
        reason: 'phone match',
      });
    }
  }
  if (result.contact.length === 0 && ex.contact?.full_name) {
    const { data } = await supabase.rpc('match_contacts', {
      query: ex.contact.full_name,
      threshold: 0.45,
    });
    for (const c of (data ?? []) as Array<Record<string, unknown>>) {
      result.contact.push({
        id: c.id as string,
        label: c.full_name as string,
        sub: [c.organisation, c.borough].filter(Boolean).join(' · '),
        score: c.score as number,
        reason: `name ${(c.score as number).toFixed(2)}`,
      });
    }
  }

  // ── Property: postcode exact ──
  const postcode = ex.property?.postcode;
  if (postcode) {
    const { data } = await supabase
      .from('properties')
      .select('id, address_line, postcode, borough, status')
      .ilike('postcode', postcode)
      .limit(3);
    for (const p of data ?? []) {
      result.property.push({
        id: p.id,
        label: p.address_line,
        sub: [p.postcode, p.status].filter(Boolean).join(' · '),
        score: STRONG,
        reason: 'postcode match',
      });
    }
  }

  return result;
}

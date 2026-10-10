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
  property: MatchCandidate[];
}

const STRONG = 0.95;

/** Run the matching engine for an extraction (§6).
 *  Order: exact phone, exact postcode, then trigram name via RPC. Housing officers are not
 *  matched: their details are kept on the client, not in a separate contacts list. */
export async function runMatching(ex: Extraction): Promise<MatchResult> {
  const result: MatchResult = { applicant: [], property: [] };

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

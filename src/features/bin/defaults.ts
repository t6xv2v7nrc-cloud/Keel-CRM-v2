// What a Bin item does if you confirm it without changing anything. Shared by
// the review card (its starting state) and "Confirm all" (items you have not
// opened or changed), so both always agree.

import type { Extraction } from '../../types/extraction';
import type { MatchResult } from '../../lib/matching';
import type { ConfirmChoice } from './confirm';

/** Items filed before notes were captured still carry the client's message in
 *  their source text; lift it into the notes so it is not lost. */
export function withMessageNotes(ex: Extraction): Extraction {
  if (!ex.applicant || ex.applicant.notes) return ex;
  const m = ex.transcription.match(/Message:\s*([\s\S]+)$/i);
  return m && m[1].trim() ? { ...ex, applicant: { ...ex.applicant, notes: m[1].trim() } } : ex;
}

/** Best existing match if there is one, otherwise create; note only when there is no name. */
export function defaultChoice(ex: Extraction, matches: MatchResult | null): ConfirmChoice {
  const bestApplicant = matches?.applicant[0];
  const bestContact = matches?.contact[0];
  return {
    applicantTarget: bestApplicant ? bestApplicant.id : ex.applicant?.full_name ? 'create' : 'note_only',
    contactTarget: bestContact ? bestContact.id : ex.contact?.full_name ? 'create' : 'none',
    advanceStage: null,
  };
}

export interface CardState {
  extraction: Extraction;
  choice: ConfirmChoice;
}

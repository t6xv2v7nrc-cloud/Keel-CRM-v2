import { supabase } from '../../lib/supabase';
import type { Extraction, ApplicantStage } from '../../types/extraction';

/** The user's decision on the review card, per entity. */
export interface ConfirmChoice {
  applicantTarget: 'create' | 'note_only' | string; // string = existing applicant id
  contactTarget: 'create' | 'none' | string;
  advanceStage?: ApplicantStage | null;
}

interface ConfirmInput {
  inboxItemId: string;
  extraction: Extraction;
  choice: ConfirmChoice;
}

interface ConfirmOutcome {
  applicantId?: string;
  applicantName?: string;
  activityCount: number;
}

const STAGE_ORDER: ApplicantStage[] = [
  'lead', 'referred', 'viewing', 'offer', 'placed', 'fee_invoiced', 'fee_paid',
];

function logActivity(
  rows: Array<Record<string, unknown>>,
  entity_type: string,
  entity_id: string,
  kind: string,
  body: string,
  inbox_item_id: string,
) {
  rows.push({ entity_type, entity_id, kind, body, inbox_item_id });
}

/** Execute the confirmed actions. Every state change writes an activities row
 *  linking back to the source screenshot — the "what happened where" guarantee. */
export async function confirmInboxItem({
  inboxItemId,
  extraction,
  choice,
}: ConfirmInput): Promise<ConfirmOutcome> {
  const activities: Array<Record<string, unknown>> = [];
  const outcome: ConfirmOutcome = { activityCount: 0 };

  // ── Contact (officer/landlord) — resolve first so we can link the applicant ──
  let contactId: string | undefined;
  if (choice.contactTarget === 'create' && extraction.contact?.full_name) {
    const c = extraction.contact;
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        type: 'housing_officer',
        full_name: c.full_name,
        organisation: c.organisation ?? null,
        borough: c.borough ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    contactId = data.id as string;
    logActivity(activities, 'contact', contactId, 'created', `Added contact ${c.full_name} (from screenshot)`, inboxItemId);
  } else if (choice.contactTarget !== 'create' && choice.contactTarget !== 'none') {
    contactId = choice.contactTarget;
  }

  // ── Applicant ──
  if (choice.applicantTarget === 'create' && extraction.applicant?.full_name) {
    const a = extraction.applicant;
    const stage: ApplicantStage = choice.advanceStage ?? 'referred';
    const { data, error } = await supabase
      .from('applicants')
      .insert({
        full_name: a.full_name,
        phone: a.phone ?? null,
        adults: a.adults ?? 1,
        children: a.children ?? 0,
        benefit_type: a.benefit_type ?? null,
        referring_borough: a.referring_borough ?? null,
        budget_pcm: a.budget_pcm ?? null,
        requirements: a.requirements ?? null,
        source: 'officer',
        referred_by: contactId ?? null,
        stage,
      })
      .select('id, full_name')
      .single();
    if (error) throw error;
    outcome.applicantId = data.id;
    outcome.applicantName = data.full_name;
    logActivity(activities, 'applicant', data.id, 'created', `Created applicant ${data.full_name} at stage ${stage} (from screenshot)`, inboxItemId);
  } else if (
    choice.applicantTarget !== 'create' &&
    choice.applicantTarget !== 'note_only'
  ) {
    // Update existing applicant
    const id = choice.applicantTarget;
    const a = extraction.applicant ?? {};

    // Fetch current stage to enforce monotonic advance
    const { data: current } = await supabase
      .from('applicants')
      .select('full_name, stage')
      .eq('id', id)
      .single();

    const patch: Record<string, unknown> = {};
    if (a.phone) patch.phone = a.phone;
    if (a.benefit_type) patch.benefit_type = a.benefit_type;
    if (a.referring_borough) patch.referring_borough = a.referring_borough;
    if (contactId) patch.referred_by = contactId;

    let stageChanged = false;
    if (choice.advanceStage && current) {
      const fromIdx = STAGE_ORDER.indexOf(current.stage as ApplicantStage);
      const toIdx = STAGE_ORDER.indexOf(choice.advanceStage);
      if (toIdx > fromIdx) {
        patch.stage = choice.advanceStage;
        stageChanged = true;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('applicants').update(patch).eq('id', id);
      if (error) throw error;
    }

    outcome.applicantId = id;
    outcome.applicantName = current?.full_name;
    if (stageChanged) {
      logActivity(activities, 'applicant', id, 'stage_change', `Stage ${current?.stage} → ${choice.advanceStage} (from screenshot)`, inboxItemId);
    } else {
      logActivity(activities, 'applicant', id, 'updated', `Updated ${current?.full_name ?? 'applicant'} (from screenshot)`, inboxItemId);
    }
  } else if (choice.applicantTarget === 'note_only' && outcome.applicantId == null) {
    // Note-only with no specific applicant: log against the contact if we have one
    if (contactId) {
      logActivity(activities, 'contact', contactId, 'note', extraction.summary, inboxItemId);
    }
  }

  // ── Write the activity trail ──
  if (activities.length > 0) {
    const { error } = await supabase.from('activities').insert(activities);
    if (error) throw error;
    outcome.activityCount = activities.length;
  }

  // ── Mark the inbox item confirmed ──
  await supabase
    .from('inbox_items')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', inboxItemId);

  return outcome;
}

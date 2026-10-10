import { supabase } from '../../lib/supabase';
import { computeTier } from '../../lib/tiering';
import { STAGE_ORDER } from '../../lib/progress';
import { shortDate } from '../../lib/format';
import { isoDay } from '../../lib/calls';
import type { Extraction, ApplicantStage } from '../../types/extraction';

/** The user's decision on the review card, per entity. */
export interface ConfirmChoice {
  applicantTarget: 'create' | 'note_only' | string; // string = existing applicant id
  advanceStage?: ApplicantStage | null;
  /** A new client is dated from this day (YYYY-MM-DD); left out, from when the Bin received the item. */
  firstContactOn?: string | null;
}

/** When a new client first got in touch: the day chosen on the card, else when the Bin received the item, never later than now. */
async function firstContactAt(inboxItemId: string, day?: string | null): Promise<string> {
  const now = new Date().toISOString();
  const { data } = await supabase.from('inbox_items').select('created_at').eq('id', inboxItemId).maybeSingle();
  const received = (data?.created_at as string | undefined) ?? now;
  if (!day || day === isoDay(new Date(received))) return received < now ? received : now;
  const chosen = new Date(`${day}T12:00:00`).toISOString();
  return chosen < now ? chosen : now;
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

  // ── Applicant ──
  if (choice.applicantTarget === 'create' && extraction.applicant?.full_name) {
    const a = extraction.applicant;
    const stage: ApplicantStage = choice.advanceStage ?? 'referred';
    const tier = a.tier ?? computeTier(a);
    const createdAt = await firstContactAt(inboxItemId, choice.firstContactOn);
    const { data, error } = await supabase
      .from('applicants')
      .insert({
        created_at: createdAt,
        full_name: a.full_name,
        phone: a.phone ?? null,
        email: a.email ?? null,
        adults: a.adults ?? 1,
        children: a.children ?? 0,
        benefit_type: a.benefit_type ?? null,
        referring_borough: a.referring_borough ?? a.council ?? null,
        budget_pcm: a.budget_pcm != null && String(a.budget_pcm) !== '' ? Number(a.budget_pcm) || null : null,
        requirements: a.requirements ?? null,
        notes: a.notes?.trim() || null,
        source: a.officer_name ? 'officer' : 'website',
        stage,
        // Referral triage fields
        household_type: a.household_type ?? null,
        on_uc: a.on_uc ?? null,
        pip: a.pip ?? null,
        lcwra: a.lcwra ?? null,
        council_registered: a.council_registered ?? null,
        work_status: a.work_status ?? null,
        council: a.council ?? null,
        officer_name: a.officer_name ?? null,
        officer_email: a.officer_email ?? null,
        officer_phone: a.officer_phone ?? null,
        urgency: a.urgency ?? null,
        housing_situation: a.housing_situation ?? null,
        consent: a.consent ?? null,
        tier,
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

    // Fetch current stage (to enforce monotonic advance) and notes (to append to)
    const { data: current } = await supabase
      .from('applicants')
      .select('full_name, stage, notes')
      .eq('id', id)
      .single();

    const patch: Record<string, unknown> = {};
    if (a.phone) patch.phone = a.phone;
    if (a.benefit_type) patch.benefit_type = a.benefit_type;
    if (a.referring_borough) patch.referring_borough = a.referring_borough;

    // A new message from an existing client is added to their notes with the
    // date, never replacing what is already there.
    const newNote = a.notes?.trim();
    const oldNotes = (current?.notes as string | null) ?? '';
    if (newNote && !oldNotes.includes(newNote)) {
      const stamp = shortDate(new Date());
      patch.notes = oldNotes ? `${oldNotes}\n\n[${stamp}] ${newNote}` : newNote;
    }

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
    // A note changes no client. It stays in the Bin under Notes (full text kept on the item)
    // and shows in recent activity.
    logActivity(activities, 'inbox', inboxItemId, 'note', `Note filed from the Bin: ${extraction.summary}`, inboxItemId);
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

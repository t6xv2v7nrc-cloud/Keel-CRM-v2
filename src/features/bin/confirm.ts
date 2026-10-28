import { supabase } from '../../lib/supabase';
import { computeTier } from '../../lib/tiering';
import { autoFill, fillWords } from '../../lib/autoFill';
import { writeDropping } from '../../lib/columns';
import type { Applicant } from '../../lib/types';
import { STAGE_ORDER } from '../../lib/progress';
import { shortDate } from '../../lib/format';
import { isoDay, todayIso } from '../../lib/calls';
import { readWishes } from '../../lib/readWishes';
import type { Extraction, ApplicantStage } from '../../types/extraction';

/**
 * A housing officer just sent Keel a client: note when on the officer list (last_nominated_client_at, 0020), or add
 * them to it, as sending a client counts as opting in. Best effort: a list without the 0020 columns is left alone.
 */
async function noteNomination(o: { name: string | null; email: string | null; phone: string | null; council: string | null }, at: string, client: string) {
  const email = o.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  try {
    const found = await supabase.from('officers').select('id, name, last_nominated_client_at').ilike('email', email).limit(1);
    if (found.error) return;
    const first = client.split(' ')[0];
    const row = (found.data ?? [])[0] as { id: string; name: string | null; last_nominated_client_at?: string | null } | undefined;
    if (row) {
      if (row.last_nominated_client_at && row.last_nominated_client_at >= at) return;
      const up = await supabase.from('officers').update({ last_nominated_client_at: at }).eq('id', row.id);
      if (up.error) return;
      await supabase.from('activities').insert({ entity_type: 'officer', entity_id: row.id, kind: 'updated', body: `${row.name ?? email} sent a client (${first})` });
      return;
    }
    const added = await supabase.from('officers').insert({
      name: o.name?.trim() || null, email, phone: o.phone?.trim() || null, council: o.council?.trim() || null,
      route_type: 'housing_officer', opt_in_source: 'Sent a client', last_nominated_client_at: at,
    }).select('id').single();
    if (added.error) return;
    await supabase.from('activities').insert({ entity_type: 'officer', entity_id: (added.data as { id: string }).id, kind: 'created', body: `Added ${o.name?.trim() || email} to the officer list: sent a client (${first})` });
  } catch { /* the client is saved either way */ }
}

/** The user's decision on the review card, per entity. */
export interface ConfirmChoice {
  applicantTarget: 'create' | 'note_only' | string; // string = existing applicant id
  advanceStage?: ApplicantStage | null;
  /** A new client is dated from this day (YYYY-MM-DD); left out, from when the Bin received the item. */
  firstContactOn?: string | null;
  /** Their age was asked for on the card and is not given yet (it stays a gap on their Profile). */
  ageNotGiven?: boolean;
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
    const createdAt = await firstContactAt(inboxItemId, choice.firstContactOn);
    // empty answers their own words give: household, head counts, age band, bedrooms needed (A4); typed ones stand
    const fill = autoFill({
      notes: a.notes?.trim() || null, requirements: a.requirements ?? null, household_type: a.household_type ?? null,
      adults: a.adults ?? null, children: a.children ?? null, date_of_birth: a.date_of_birth ?? null,
      age_band: (a.age_band as Applicant['age_band']) ?? null, bedrooms_needed: null,
    });
    const filled = fill.patch;
    const wishes = readWishes([a.notes, a.requirements].filter(Boolean).join('\n'), todayIso());
    const answers = {
      ...a, household_type: a.household_type ?? filled.household_type ?? null,
      adults: a.adults ?? filled.adults ?? 1, children: a.children ?? filled.children ?? 0,
    };
    const tier = a.tier ?? computeTier(answers);
    const { data, error, dropped } = await writeDropping({
        created_at: createdAt,
        full_name: a.full_name,
        phone: a.phone ?? null,
        email: a.email ?? null,
        date_of_birth: a.date_of_birth ?? null,
        age_band: a.age_band ?? filled.age_band ?? null,
        bedrooms_needed: a.bedrooms_needed ?? filled.bedrooms_needed ?? null,
        // what the home must be (C2), as read on the card, else from their words
        move_by: a.move_by ?? wishes.move_by ?? null,
        max_top_up: a.max_top_up ?? wishes.max_top_up ?? null,
        anchor: a.anchor ?? wishes.anchor ?? null,
        anchor_postcode: a.anchor_postcode ?? wishes.anchor_postcode ?? null,
        max_travel_mins: a.max_travel_mins ?? wishes.max_travel_mins ?? null,
        female_only: a.female_only ?? wishes.female_only ?? null,
        wants_outdoor: a.wants_outdoor ?? wishes.wants_outdoor ?? null,
        adults: answers.adults,
        children: answers.children,
        benefit_type: a.benefit_type ?? null,
        referring_borough: a.referring_borough ?? a.council ?? null,
        budget_pcm: a.budget_pcm != null && String(a.budget_pcm) !== '' ? Number(a.budget_pcm) || null : null,
        requirements: a.requirements ?? null,
        notes: a.notes?.trim() || null,
        source: a.officer_name ? 'officer' : 'website',
        stage,
        // Referral triage fields
        household_type: answers.household_type,
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
      }, (row) => supabase.from('applicants').insert(row).select('id, full_name').single());
    if (error) throw error;
    const made = data as { id: string; full_name: string };
    outcome.applicantId = made.id;
    outcome.applicantName = made.full_name;
    logActivity(activities, 'applicant', made.id, 'created', `Created applicant ${made.full_name} at stage ${stage} (from screenshot)`, inboxItemId);
    const kept = fill.fills.filter((f) => !dropped.includes(f.field) && (f.field !== 'household_type' || !a.household_type)
      && (f.field !== 'adults' || a.adults == null) && (f.field !== 'children' || a.children == null) && (f.field !== 'age_band' || !a.age_band)
      && (f.field !== 'bedrooms_needed' || a.bedrooms_needed == null));
    if (kept.length) logActivity(activities, 'applicant', made.id, 'updated', `Filled in from their notes: ${fillWords(kept)}`, inboxItemId);
    await noteNomination({ name: a.officer_name ?? null, email: a.officer_email ?? null, phone: a.officer_phone ?? null, council: a.council ?? null }, createdAt, made.full_name);
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
      .select('*')
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

    // their new words may answer something still empty on their record (never anything already answered)
    let filledWords: string | null = null;
    if (current && patch.notes) {
      const now = current as Applicant;
      const fill = autoFill({ ...now, notes: patch.notes as string }, { ageBand: 'age_band' in now, bedrooms: 'bedrooms_needed' in now });
      if (fill.fills.length) {
        Object.assign(patch, fill.patch);
        if (!now.tier_locked) patch.tier = computeTier({ ...now, ...fill.patch });
        filledWords = fillWords(fill.fills);
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await writeDropping(patch, (row) => supabase.from('applicants').update(row).eq('id', id));
      if (error) throw error;
    }
    if (filledWords) logActivity(activities, 'applicant', id, 'updated', `Filled in from their notes: ${filledWords}`, inboxItemId);

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

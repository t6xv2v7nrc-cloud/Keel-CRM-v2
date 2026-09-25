import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { isLocalProperty, localProperties, useLocalProperties } from './localProperties';
import { DEFAULT_SETTINGS, mergeSettings, myPart, teamPart } from './settings';
import type { AppSettings } from './settings';
import { OUTCOME_LABEL } from './calls';
import { computeTier } from './tiering';
import { shortDate } from './format';
import type { Activity, Applicant, Call, CallOutcome, Profile, Property } from './types';
import type { ApplicantStage } from '../types/extraction';

// ── Applicants ──────────────────────────────────────────────────────
export function useApplicants() {
  return useQuery({
    queryKey: ['applicants'],
    queryFn: async (): Promise<Applicant[]> => {
      const { data, error } = await supabase
        .from('applicants')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Applicant[];
    },
  });
}

export function useApplicant(id: string | undefined) {
  return useQuery({
    queryKey: ['applicants', id],
    enabled: !!id,
    queryFn: async (): Promise<Applicant> => {
      const { data, error } = await supabase.from('applicants').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Applicant;
    },
  });
}

export function useUpdateApplicant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Applicant> & { id: string }) => {
      const { data, error } = await supabase
        .from('applicants')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Applicant;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', data.id] });
    },
  });
}

/** Change triage answers or the tier, keep the stored tier in step with the
 *  rules (unless it was set by hand), and note the change on the timeline. */
export function useUpdateTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, patch, note }: { applicant: Applicant; patch: Partial<Applicant>; note: string }) => {
      const merged = { ...applicant, ...patch };
      const full: Partial<Applicant> = { ...patch };
      if (!('tier' in patch) && !merged.tier_locked) full.tier = computeTier(merged);
      let { error } = await supabase.from('applicants').update(full).eq('id', applicant.id);
      if (error && /tier_locked/.test(error.message)) {
        // before the 0005 update there is no lock flag: a stored tier simply stands
        const rest = { ...full };
        delete rest.tier_locked;
        ({ error } = await supabase.from('applicants').update(rest).eq('id', applicant.id));
      }
      if (error) throw error;
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: applicant.id, kind: 'updated', body: note });
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Delete an applicant and its activities. Calls and placements cascade via their FKs. */
export function useDeleteApplicant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // activities have no FK cascade — remove them explicitly first
      await supabase.from('activities').delete().eq('entity_type', 'applicant').eq('entity_id', id);
      const { error } = await supabase.from('applicants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Advance/move an applicant's stage and log the activity in one go. */
export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, from, to }: { id: string; from: ApplicantStage; to: ApplicantStage }) => {
      const { error } = await supabase.from('applicants').update({ stage: to }).eq('id', id);
      if (error) throw error;
      await supabase.from('activities').insert({
        entity_type: 'applicant',
        entity_id: id,
        kind: 'stage_change',
        body: `Stage ${from} → ${to}`,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', vars.id] });
      qc.invalidateQueries({ queryKey: ['activities', 'applicant', vars.id] });
    },
  });
}

// ── Activities (per entity) ─────────────────────────────────────────
export function useActivities(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['activities', entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Activity[];
    },
  });
}

/** Most recent activity across all entities — for the dashboard feed. */
export function useRecentActivity(limit = 12) {
  return useQuery({
    queryKey: ['activities', 'recent', limit],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Activity[];
    },
  });
}

// ── WhatsApp ────────────────────────────────────────────────────────
const SENT = /^Sent (.+) on WhatsApp$/;
/** Key for "has this client been sent this property": client id and address. */
export const sentKey = (applicantId: string, address: string) => `${applicantId}|${address.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

/** Note on a client's timeline that properties were sent to them on WhatsApp (and by whom). */
export function useLogWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicantId, properties }: { applicantId: string; properties: Pick<Property, 'address_line'>[] }) => {
      const { error } = await supabase.from('activities').insert(properties.map((p) => ({
        entity_type: 'applicant', entity_id: applicantId, kind: 'whatsapp', body: `Sent ${p.address_line} on WhatsApp`,
      })));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
}

export interface SentOnWhatsApp { at: string; actor: string | null }

/** Every property sent to a client on WhatsApp, by sentKey, most recent send kept. */
export function useSentOnWhatsApp() {
  const q = useQuery({
    queryKey: ['activities', 'whatsapp'],
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase.from('activities').select('*')
        .eq('kind', 'whatsapp').order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Activity[];
    },
  });
  return useMemo(() => {
    const sent = new Map<string, SentOnWhatsApp>();
    for (const r of q.data ?? []) {
      const address = SENT.exec(r.body)?.[1];
      const key = address ? sentKey(r.entity_id, address) : null;
      if (key && !sent.has(key)) sent.set(key, { at: r.created_at, actor: r.actor ?? null });
    }
    return sent;
  }, [q.data]);
}

// ── Properties ──────────────────────────────────────────────────────
function useDbProperties() {
  return useQuery({
    queryKey: ['properties'],
    queryFn: async (): Promise<Property[]> => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Property[];
    },
  });
}

/** Every property: saved to the account (so on every device), plus any still only on this device. */
export function useProperties() {
  const db = useDbProperties();
  const local = useLocalProperties();
  const data = useMemo(() => [...local, ...(db.data ?? [])], [local, db.data]);
  return { data, isLoading: db.isLoading && local.length === 0 };
}

export type NewProperty = Pick<Property,
  'address_line' | 'postcode' | 'area' | 'borough' | 'property_type' | 'bedrooms' | 'rent_pcm' | 'rent_text'
  | 'bills' | 'furnished' | 'available_from' | 'notes' | 'source_tag'>;

/** A property to save; status and save time are kept when moving a list from this device. */
export type SavedProperty = NewProperty & Partial<Pick<Property, 'status' | 'created_at'>>;

/** Thrown when the properties table is missing the list columns (0004 not run yet). */
export class NeedsDatabaseUpdate extends Error {
  constructor() {
    super('Your database needs a one-off update before lists can sync. Run supabase/migrations/0004_properties_import.sql in the Supabase SQL Editor.');
  }
}
const isMissingColumn = (e: { message?: string; code?: string }) =>
  e.code === 'PGRST204' || /could not find the .+ column|schema cache/i.test(e.message ?? '');

/** In chunks, so a long list of ids never makes the request URL too long. */
const chunks = <T,>(xs: T[], size = 100) => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));

/** Save a pasted list to the account, so it shows on every device, and log each property. */
export function useAddProperties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, source }: { rows: SavedProperty[]; source: string }): Promise<Property[]> => {
      // one insert, so the whole list shares a save time (that is how Saved lists groups it)
      const { data, error } = await supabase.from('properties').insert(rows.map((r) => ({ status: 'void', ...r }))).select();
      if (error) throw isMissingColumn(error) ? new NeedsDatabaseUpdate() : error;
      const added = data as Property[];
      await supabase.from('activities').insert(added.map((p) => ({
        entity_type: 'property',
        entity_id: p.id,
        kind: 'created',
        body: `Added ${p.address_line} from a pasted list${source ? ` (${source})` : ''}`,
      })));
      return added;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
}

export const PROPERTY_STATUS_LABEL: Record<Property['status'], string> = {
  void: 'Available', under_offer: 'Under offer', let: 'Let', withdrawn: 'Withdrawn',
};

export function useSetPropertyStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ p, status }: { p: Property; status: Property['status'] }) => {
      if (isLocalProperty(p.id)) { localProperties.setStatus([p.id], status); return; }
      const { error } = await supabase.from('properties').update({ status }).eq('id', p.id);
      if (error) throw error;
      await supabase.from('activities').insert({
        entity_type: 'property',
        entity_id: p.id,
        kind: 'updated',
        body: `${p.address_line}: ${PROPERTY_STATUS_LABEL[p.status]} → ${PROPERTY_STATUS_LABEL[status]}`,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
}

/** Set (or clear) the LHA area of some properties by hand, and note it on each. */
export function useSetLhaArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ properties, area }: { properties: Property[]; area: string | null }) => {
      const local = properties.filter((p) => isLocalProperty(p.id)).map((p) => p.id);
      if (local.length) localProperties.update(local, { lha_area: area });
      const ids = properties.filter((p) => !isLocalProperty(p.id)).map((p) => p.id);
      for (const part of chunks(ids)) {
        const { error } = await supabase.from('properties').update({ lha_area: area }).in('id', part);
        if (error) {
          throw /lha_area|schema cache/i.test(error.message)
            ? new Error('Setting a property\'s LHA area needs a one-off database update: run supabase/migrations/0008_lha_area.sql in the Supabase SQL Editor.')
            : error;
        }
      }
      if (ids.length) {
        await supabase.from('activities').insert(properties.filter((p) => !isLocalProperty(p.id)).map((p) => ({
          entity_type: 'property', entity_id: p.id, kind: 'updated', body: area ? `LHA area set to ${area}` : 'LHA area back to the estimate',
        })));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  });
}

/** Delete properties (and their activity, for database ones). A linked placement keeps its record. */
export function useDeleteProperties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (all: string[]) => {
      localProperties.remove(all.filter(isLocalProperty));
      for (const ids of chunks(all.filter((id) => !isLocalProperty(id)))) {
        await supabase.from('activities').delete().eq('entity_type', 'property').in('entity_id', ids);
        const { error } = await supabase.from('properties').delete().in('id', ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['placements'] });
    },
  });
}

// ── Settings (team row + one row per person; see settings.ts) ───────
const missingTable = (e: { message?: string; code?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(e.message ?? '');

const myKey = (userId: string) => `user:${userId}`;
const currentUserId = async () => (await supabase.auth.getSession()).data.session?.user.id ?? null;

/** Team rules with the signed-in person's own settings on top. `ready` is
 *  false until the 0005 update has been run. */
export function useSettings() {
  const q = useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ settings: AppSettings; ready: boolean }> => {
      const uid = await currentUserId();
      const { data, error } = await supabase.from('settings').select('key, value').in('key', uid ? ['app', myKey(uid)] : ['app']);
      if (error) {
        if (missingTable(error)) return { settings: DEFAULT_SETTINGS, ready: false };
        throw error;
      }
      const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
      const team = rows.find((r) => r.key === 'app')?.value;
      const mine = uid ? rows.find((r) => r.key === myKey(uid))?.value : undefined;
      return { settings: mergeSettings(team, mine), ready: true };
    },
  });
  return { settings: q.data?.settings ?? DEFAULT_SETTINGS, ready: q.data?.ready ?? true, isLoading: q.isLoading };
}

/** Save either my own settings or the team's. */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scope, value }: { scope: 'me' | 'team'; value: AppSettings }) => {
      const uid = await currentUserId();
      if (scope === 'me' && !uid) throw new Error('Sign in again to save your settings.');
      const row = scope === 'team'
        ? { key: 'app', value: teamPart(value) }
        : { key: myKey(uid!), value: myPart(value) };
      const { error } = await supabase.from('settings').upsert({ ...row, updated_at: new Date().toISOString() });
      if (error) {
        if (error.code === '42501' || /row-level security/i.test(error.message)) {
          throw new Error(scope === 'team' ? 'Only the owner can change team settings.' : 'You can only change your own settings.');
        }
        throw error;
      }
      return value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      // new copies so memoised tiers and matches are worked out again
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}

// ── Team (profiles, who did what, assignment) ───────────────────────
const TEAM_UPDATE =
  'Working as a team needs a one-off database update: run supabase/migrations/0006_team.sql in the Supabase SQL Editor.';

/** Everyone who can sign in. `ready` is false until the 0006 update has been run. */
export function useTeam() {
  const q = useQuery({
    queryKey: ['team'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ members: Profile[]; ready: boolean }> => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at');
      if (error) {
        if (missingTable(error)) return { members: [], ready: false };
        throw error;
      }
      return { members: data as Profile[], ready: true };
    },
  });
  return { members: q.data?.members ?? [], ready: q.data?.ready ?? true, isLoading: q.isLoading };
}

/** A friendly default name from an email address: "sam.jones@..." → "Sam". */
export const nameFromEmail = (email: string | null | undefined) => {
  const first = (email ?? '').split('@')[0].split(/[._\-+]/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'Someone';
};

/** The signed-in person, the team, and a way to name anyone by id. */
export function usePeople() {
  const { members, ready } = useTeam();
  // One look-up shared by every component that names people (rows in long lists use this too)
  const { data: session = null } = useQuery({
    queryKey: ['session-user'],
    staleTime: Infinity,
    queryFn: async () => {
      const u = (await supabase.auth.getSession()).data.session?.user;
      return u ? { id: u.id, email: u.email ?? null } : null;
    },
  });
  return useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const nameOf = (id: string | null | undefined): string | null => {
      if (!id) return null;
      const m = byId.get(id);
      return m?.display_name || nameFromEmail(m?.email) || null;
    };
    const meProfile = session ? byId.get(session.id) : undefined;
    // Roles arrive with the 0007 update; before that everyone may change team settings
    const rolesReady = members.some((m) => m.role !== undefined);
    const owner = members.find((m) => m.role === 'owner') ?? null;
    const isOwner = !!meProfile && meProfile.role === 'owner';
    return {
      rolesReady,
      owner,
      ownerName: owner ? nameOf(owner.id) : null,
      isOwner,
      /** May change team settings (tier logic, urgency, matching rules). */
      canEditTeam: !rolesReady || isOwner,
      ready,
      members,
      meId: session?.id ?? null,
      myName: meProfile?.display_name || (session ? nameFromEmail(session.email) : null),
      myProfile: meProfile ?? null,
      nameOf,
      /** "you" for the signed-in person, otherwise their name */
      whoOf: (id: string | null | undefined) => (id && id === session?.id ? 'you' : nameOf(id)),
    };
  }, [members, ready, session]);
}

/** Make sure the signed-in person has a profile, so the others see their name. */
export function useEnsureProfile() {
  const qc = useQueryClient();
  const { members, ready, isLoading } = useTeam();
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || isLoading || !ready) return;
    tried.current = true;
    (async () => {
      const u = (await supabase.auth.getSession()).data.session?.user;
      if (!u || members.some((m) => m.id === u.id)) return;
      const { error } = await supabase.from('profiles').insert({ id: u.id, email: u.email, display_name: nameFromEmail(u.email) });
      if (!error) qc.invalidateQueries({ queryKey: ['team'] });
    })();
  }, [members, ready, isLoading, qc]);
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string) => {
      const u = (await supabase.auth.getSession()).data.session?.user;
      if (!u) throw new Error('Sign in again to change your name.');
      const { error } = await supabase.from('profiles')
        .upsert({ id: u.id, email: u.email, display_name: displayName.trim() || nameFromEmail(u.email), updated_at: new Date().toISOString() });
      if (error) throw missingTable(error) ? new Error(TEAM_UPDATE) : error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

/** The owner hands ownership (and control of team settings) to someone else. */
export function useHandOver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ toId, meId }: { toId: string; meId: string }) => {
      const { error } = await supabase.from('profiles').update({ role: 'owner' }).eq('id', toId);
      if (error) throw error;
      const { error: e2 } = await supabase.from('profiles').update({ role: 'member' }).eq('id', meId);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team'] }),
  });
}

/** Give a client to one of the team (or nobody), and note it on the timeline. */
export function useAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, userId, name }: { applicant: Applicant; userId: string | null; name: string | null }) => {
      const { error } = await supabase.from('applicants').update({ assigned_to: userId }).eq('id', applicant.id);
      if (error) throw /assigned_to|schema cache/i.test(error.message) ? new Error(TEAM_UPDATE) : error;
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: applicant.id, kind: 'updated',
        body: userId ? `Assigned to ${name ?? 'a team member'}` : 'No longer assigned',
      });
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

// ── Calls ───────────────────────────────────────────────────────────
const CALLS_UPDATE =
  'Call logging needs a one-off database update: run supabase/migrations/0005_calls_settings.sql in the Supabase SQL Editor.';

/** Every call, newest first. `ready` is false until the 0005 update has been run. */
export function useCalls() {
  const q = useQuery({
    queryKey: ['calls'],
    queryFn: async (): Promise<{ calls: Call[]; ready: boolean }> => {
      const { data, error } = await supabase.from('calls').select('*').order('created_at', { ascending: false }).limit(5000);
      if (error) {
        if (missingTable(error)) return { calls: [], ready: false };
        throw error;
      }
      return { calls: data as Call[], ready: true };
    },
  });
  return { calls: q.data?.calls ?? [], ready: q.data?.ready ?? true, isLoading: q.isLoading };
}

const callBody = (direction: Call['direction'], outcome: CallOutcome, notes: string, next: string | null) =>
  [`${direction === 'incoming' ? 'Incoming' : 'Outgoing'} call: ${OUTCOME_LABEL[outcome]}`, notes.trim(),
    next ? `Next call ${shortDate(next)}` : ''].filter(Boolean).join('. ');

/** Log a call, set (or clear) when to call next, and record it on the timeline. */
export function useLogCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, outcome, direction, notes, nextCallAt }: {
      applicant: Applicant; outcome: CallOutcome; direction: Call['direction']; notes: string; nextCallAt: string | null;
    }) => {
      const { error } = await supabase.from('calls').insert({ applicant_id: applicant.id, outcome, direction, notes: notes.trim() || null });
      if (error) throw missingTable(error) ? new Error(CALLS_UPDATE) : error;
      const { error: nextError } = await supabase.from('applicants').update({ next_call_at: nextCallAt }).eq('id', applicant.id);
      if (nextError) throw nextError;
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: applicant.id, kind: 'call', body: callBody(direction, outcome, notes, nextCallAt),
      });
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['calls'] });
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
    },
  });
}

/** Set or clear when to call a client next, without logging a call. */
export function useSetNextCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, date }: { applicant: Applicant; date: string | null }) => {
      const { error } = await supabase.from('applicants').update({ next_call_at: date }).eq('id', applicant.id);
      if (error) throw /next_call_at|schema cache/i.test(error.message) ? new Error(CALLS_UPDATE) : error;
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: applicant.id, kind: 'updated',
        body: date ? `Next call set for ${shortDate(date)}` : 'Next call cleared',
      });
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
    },
  });
}

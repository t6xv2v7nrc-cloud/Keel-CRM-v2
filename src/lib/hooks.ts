import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { isLocalProperty, localProperties, useLocalProperties } from './localProperties';
import { DEFAULT_SETTINGS, mergeSettings, myPart, teamPart } from './settings';
import type { AppSettings } from './settings';
import { addDays, OUTCOME_LABEL, todayIso } from './calls';
import { DEAL_LABEL, isLive, shortAddress, shouldAdvance, stageFromDeals, stepAfter, takesOver, viewingWords } from './progress';
import { computeTier } from './tiering';
import { moneyFee, shortDate } from './format';
import type {
  Activity, Applicant, Call, CallOutcome, Deal, DealStatus, Profile, Property, Provider, ProviderRequest, Receivable, RequestStatus, RequestType,
} from './types';
import { followUpFrom, PROVIDER_OFF, PROVIDER_ON, providerFor, providerNumber, REQUEST_LABEL, tagOf, withdrawnBySwitchOff } from './requests';
import { basisWords, describe, KIND_LABEL, lettingFeeFor, rentOf, STATUS_LABEL } from './money';
import { invoiceNumber } from './invoice';
import { CONTACT_KINDS, lastContacts, noteActivity } from './contacts';
import type { Channel } from './contacts';
import type { ReceivableDraft } from './money';
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

/** Delete an applicant and its activities. Calls, deals and receivables go with it (they cascade). */
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
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Advance/move an applicant's stage and log the activity in one go. */
export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, from, to }: { id: string; from: ApplicantStage; to: ApplicantStage }) => {
      await updateApplicant(id, { stage: to, stage_changed_at: new Date().toISOString() });
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

/** Move clients who have gone cold to Lost in one go, each with a line on their timeline saying why. */
export function useMarkCold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clients: Array<{ id: string; stage: ApplicantStage; days: number }>) => {
      const now = new Date().toISOString();
      for (const ids of chunks(clients.map((c) => c.id))) {
        let res = await supabase.from('applicants').update({ stage: 'lost', stage_changed_at: now }).in('id', ids);
        if (res.error && isMissingColumn(res.error)) res = await supabase.from('applicants').update({ stage: 'lost' }).in('id', ids);
        if (res.error) throw res.error;
      }
      for (const part of chunks(clients, 200)) {
        await supabase.from('activities').insert(part.map((c) => ({
          entity_type: 'applicant', entity_id: c.id, kind: 'stage_change', body: `Stage ${c.stage} → lost (went cold: nothing for ${c.days} days)`,
        })));
      }
      return clients.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

// ── Duplicate clients (0014) ────────────────────────────────────────
const MERGE_UPDATE = 'Merging needs a one-off database update: run supabase/migrations/0014_merge_clients.sql in the Supabase SQL Editor.';
const noFunction = (e: { message?: string; code?: string }) => e.code === 'PGRST202' || /function|schema cache/i.test(e.message ?? '');
const NOBODY = '00000000-0000-0000-0000-000000000000';

/** Whether 0014 is in: merging a nobody into themselves does nothing, or fails if the function is missing. */
export function useMergeReady() {
  const q = useQuery({
    queryKey: ['merge-ready'],
    staleTime: 10 * 60_000,
    queryFn: async () => !(await supabase.rpc('merge_applicants', { keep: NOBODY, gone: NOBODY })).error,
  });
  return q.data ?? false;
}

/** Fold duplicate records into the one kept, in the database in one step each (see 0014). */
export function useMergeClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keep, gone }: { keep: string; gone: string[] }) => {
      for (const id of gone) {
        const { error } = await supabase.rpc('merge_applicants', { keep, gone: id });
        if (error) throw noFunction(error) ? new Error(MERGE_UPDATE) : error;
      }
      return gone.length;
    },
    onSuccess: () => { void qc.invalidateQueries(); },
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

/** Save a note on a client: how you spoke to them (or just a note) and what about. It goes on their timeline. */
export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicantId, channel, text }: { applicantId: string; channel: Channel; text: string }) => {
      if (!text.trim()) throw new Error('Write the note first');
      const { error } = await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: applicantId, ...noteActivity(channel, text) });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
}

/** When every client was last contacted (notes, calls, WhatsApp sends), for the Pipeline. */
export function useLastContacts() {
  const { calls } = useCalls();
  const q = useQuery({
    queryKey: ['activities', 'contacts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('entity_type, entity_id, kind, body, created_at, actor')
        .eq('entity_type', 'applicant').in('kind', [...CONTACT_KINDS]).order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return data as Array<Pick<Activity, 'entity_type' | 'entity_id' | 'kind' | 'body' | 'created_at' | 'actor'>>;
    },
  });
  const rows = q.data;
  return useMemo(() => lastContacts(rows ?? [], calls), [rows, calls]);
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
      // a list from a provider that is switched off comes in withdrawn, like the rest of its properties (before 0010 nothing is off)
      const offRes = await supabase.from('providers').select('tag').eq('active', false);
      const off = new Set(((offRes.error ? [] : offRes.data ?? []) as Array<{ tag: string }>).map((x) => tagOf(x.tag)));
      const isOff = (r: Pick<SavedProperty, 'source_tag'>) => off.has(tagOf(r.source_tag)) && tagOf(r.source_tag) !== '';
      // one insert, so the whole list shares a save time (that is how Saved lists groups it)
      const { data, error } = await supabase.from('properties').insert(rows.map((r) => ({ status: 'void', ...r, ...(isOff(r) ? { status: 'withdrawn' } : {}) }))).select();
      if (error) throw isMissingColumn(error) ? new NeedsDatabaseUpdate() : error;
      const added = data as Property[];
      await supabase.from('activities').insert(added.map((p) => ({
        entity_type: 'property',
        entity_id: p.id,
        kind: isOff(p) ? PROVIDER_OFF : 'created',
        body: `Added ${p.address_line} from a pasted list${source ? ` (${source})` : ''}${isOff(p) ? `, withdrawn: ${tagOf(p.source_tag)} is switched off` : ''}`,
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
function useTeam() {
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
const nameFromEmail = (email: string | null | undefined) => {
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
      await updateApplicant(applicant.id, { next_call_at: nextCallAt, next_step: null });
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


// ── Client progress (0009) ──────────────────────────────────────────
const PROGRESS_UPDATE =
  'Tracking properties for each client needs a one-off database update: run supabase/migrations/0009_progress.sql in the Supabase SQL Editor.';
const PROGRESS_COLUMNS = ['next_step', 'stage_changed_at'];

/** Update a client. Before the 0009 update the progress columns are left out, so the rest still saves. */
async function updateApplicant(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('applicants').update(patch).eq('id', id);
  if (!error) return;
  if (!isMissingColumn(error)) throw error;
  const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !PROGRESS_COLUMNS.includes(k)));
  if (Object.keys(rest).length === 0) return;
  const retry = await supabase.from('applicants').update(rest).eq('id', id);
  if (retry.error) throw retry.error;
}

/** Every deal (a client going for a property), most recently moved first. `ready` is false until 0009 is run. */
export async function fetchDeals(): Promise<{ deals: Deal[]; ready: boolean }> {
  const { data, error } = await supabase.from('deals').select('*').order('updated_at', { ascending: false });
  if (error) {
    if (missingTable(error)) return { deals: [], ready: false };
    throw error;
  }
  return { deals: data as Deal[], ready: true };
}

export function useDeals() {
  const q = useQuery({ queryKey: ['deals'], queryFn: fetchDeals });
  return { deals: q.data?.deals ?? [], ready: q.data?.ready ?? true, isLoading: q.isLoading };
}

type DealProperty = { id?: string; address_line: string };
const dealPropertyId = (p: DealProperty) => (p.id && !isLocalProperty(p.id) ? p.id : null);

/** Start tracking properties for a client; ones already tracked are left as they are. */
export function useAddDeals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicantId, properties, status = 'sent', quiet = false }: {
      applicantId: string; properties: DealProperty[]; status?: DealStatus; quiet?: boolean;
    }): Promise<Deal[]> => {
      const rows = properties.map((p) => ({ applicant_id: applicantId, property_id: dealPropertyId(p), address: p.address_line, status }));
      const { data, error } = await supabase.from('deals').upsert(rows, { onConflict: 'applicant_id,address', ignoreDuplicates: true }).select();
      if (error) throw missingTable(error) ? new Error(PROGRESS_UPDATE) : error;
      const added = (data ?? []) as Deal[];
      if (added.length && !quiet) {
        await supabase.from('activities').insert({
          entity_type: 'applicant', entity_id: applicantId, kind: 'progress',
          body: added.length === 1 ? `Tracking ${added[0].address} (${DEAL_LABEL[status].toLowerCase()})` : `Tracking ${added.length} properties`,
        });
      }
      return added;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/**
 * Move a deal on. The client's stage follows (forwards only), their next step
 * is set when the new one is sooner, and the property follows too: under offer
 * when accepted, let when they move in (and anyone else going for it is told
 * it was let to someone else).
 */
export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, deal, to, viewingAt, moveInOn, reason, allDeals, property, activityBody }: {
      applicant: Applicant; deal: Deal; to: DealStatus; allDeals: Deal[];
      viewingAt?: string | null; moveInOn?: string | null; reason?: string | null; activityBody?: string;
      property?: (Pick<Property, 'id' | 'status' | 'address_line'> & Partial<Omit<Property, 'id' | 'status' | 'address_line'>>) | null;
    }): Promise<{ stage: ApplicantStage | null; step: string | null; fee: string | null }> => {
      const patch: Partial<Deal> = { status: to };
      if (to === 'viewing') patch.viewing_at = viewingAt ?? deal.viewing_at;
      if (deal.status === 'viewing' && to === 'interested') patch.viewing_at = null;
      if (to === 'moved_in') patch.move_in_on = moveInOn ?? todayIso();
      if (to === 'fell_through') patch.fell_through_reason = reason ?? null;
      const { error } = await supabase.from('deals').update(patch).eq('id', deal.id);
      if (error) throw missingTable(error) ? new Error(PROGRESS_UPDATE) : error;

      const body = activityBody ?? (to === 'viewing' && patch.viewing_at ? `Viewing booked at ${deal.address}: ${viewingWords(patch.viewing_at)}`
        : to === 'fell_through' ? `${deal.address} fell through${reason ? `: ${reason}` : ''}`
        : to === 'moved_in' ? `Moved in to ${deal.address}${patch.move_in_on ? ` on ${shortDate(patch.move_in_on)}` : ''}`
        : `${deal.address}: ${DEAL_LABEL[to].toLowerCase()}`);
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: applicant.id, kind: 'progress', body });

      // The client's stage and next step
      const theirs = allDeals.filter((d) => d.applicant_id === applicant.id).map((d) => (d.id === deal.id ? { ...d, ...patch } : d));
      const target = stageFromDeals(theirs);
      const client: Record<string, unknown> = {};
      const stage = shouldAdvance(applicant.stage, target) ? target : null;
      if (stage) { client.stage = stage; client.stage_changed_at = new Date().toISOString(); }
      let next = stepAfter(to, deal.address, patch.viewing_at);
      if (to === 'fell_through' && !theirs.some(isLive)) next = { step: 'Send more properties', on: addDays(1) };
      const stepTakesOver = next !== null && takesOver(applicant, next, deal.address);
      if (next && stepTakesOver) { client.next_step = next.step; client.next_call_at = next.on; }
      if (Object.keys(client).length) await updateApplicant(applicant.id, client);
      if (stage) {
        await supabase.from('activities').insert({
          entity_type: 'applicant', entity_id: applicant.id, kind: 'stage_change', body: `Stage ${applicant.stage} → ${stage} (${DEAL_LABEL[to].toLowerCase()})`,
        });
      }

      // The property
      const isProperty = property && !isLocalProperty(property.id);
      const setProperty = async (status: Property['status'], why: string) => {
        if (!property || !isProperty || property.status === status) return;
        await supabase.from('properties').update({ status }).eq('id', property.id);
        await supabase.from('activities').insert({ entity_type: 'property', entity_id: property.id, kind: 'updated', body: `${PROPERTY_STATUS_LABEL[status]}: ${why}` });
      };
      if (to === 'accepted' && property?.status === 'void') await setProperty('under_offer', `accepted for ${applicant.full_name}`);
      if (to === 'moved_in') {
        await setProperty('let', `${applicant.full_name} moved in`);
        const others = allDeals.filter((d) => d.id !== deal.id && d.applicant_id !== applicant.id && isLive(d)
          && ((deal.property_id && d.property_id === deal.property_id) || d.address === deal.address));
        for (const o of others) {
          await supabase.from('deals').update({ status: 'fell_through', fell_through_reason: 'Let to someone else' }).eq('id', o.id);
          await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: o.applicant_id, kind: 'progress', body: `${o.address} fell through: Let to someone else` });
        }
        // and this client no longer needs their other properties
        for (const o of theirs.filter((d) => d.id !== deal.id && isLive(d))) {
          await supabase.from('deals').update({ status: 'fell_through', fell_through_reason: 'Client found somewhere else' }).eq('id', o.id);
        }
      }

      // The letting fee is owed from now, so it goes on Receivables straight away (once; before 0012 this is skipped)
      let fee: string | null = null;
      if (to === 'moved_in') {
        const had = await supabase.from('receivables').select('id').eq('deal_id', deal.id).eq('kind', 'letting_fee').limit(1);
        if (!had.error && (had.data ?? []).length === 0) {
          const provs = await supabase.from('providers').select('*');
          const provider = property && !provs.error ? providerFor(property, (provs.data ?? []) as Provider[]) : null;
          const rentPcm = property ? rentOf({
            address_line: property.address_line, postcode: property.postcode ?? null, borough: property.borough ?? null, property_type: property.property_type ?? null,
            bedrooms: property.bedrooms ?? null, rent_pcm: property.rent_pcm ?? null, rent_text: property.rent_text ?? null, lha_area: property.lha_area ?? null,
          }) : null;
          const draft = lettingFeeFor({ applicantId: applicant.id, dealId: deal.id, address: deal.address, signUpOn: patch.move_in_on ?? todayIso(), provider, rentPcm });
          const added = await writeReceivable({ ...draft });
          if (!added.error) {
            fee = describe(draft);
            await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: applicant.id, kind: 'money', body: `${fee} added to Finances` });
          }
        }
      }
      return { stage, step: stepTakesOver ? next?.step ?? null : null, fee };
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Stop tracking a property for a client (added by mistake). */
export function useRemoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deal: Deal) => {
      const { error } = await supabase.from('deals').delete().eq('id', deal.id);
      if (error) throw error;
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: deal.applicant_id, kind: 'progress', body: `Stopped tracking ${deal.address}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

const CHECKLIST_UPDATE =
  'The move-in checklist needs a one-off database update: run supabase/migrations/0015_move_in_checklist.sql in the Supabase SQL Editor.';

/** Tick or untick one move-in check on a deal ("Gas safety certificate given"). */
export function useTickMoveInCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ deal, item, done }: { deal: Deal; item: string; done: boolean }) => {
      const next = { ...(deal.checklist ?? {}) };
      if (done) next[item] = todayIso(); else delete next[item];
      const { error } = await supabase.from('deals').update({ checklist: next }).eq('id', deal.id);
      if (error) throw isMissingColumn(error) ? new Error(CHECKLIST_UPDATE) : error;
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: deal.applicant_id, kind: 'progress',
        body: `Move-in check ${done ? 'ticked' : 'unticked'} for ${shortAddress(deal.address)}: ${item}`,
      });
    },
    onMutate: async ({ deal, item, done }) => {
      // tick straight away; the refetch afterwards confirms it
      await qc.cancelQueries({ queryKey: ['deals'] });
      const before = qc.getQueryData<{ deals: Deal[]; ready: boolean }>(['deals']);
      if (before) {
        qc.setQueryData(['deals'], {
          ...before,
          deals: before.deals.map((d) => {
            if (d.id !== deal.id) return d;
            const checklist = { ...(d.checklist ?? {}) };
            if (done) checklist[item] = todayIso(); else delete checklist[item];
            return { ...d, checklist };
          }),
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => { if (ctx?.before) qc.setQueryData(['deals'], ctx.before); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Set what to do next for a client and when ("Chase documents", Thursday). */
export function useSetNextStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicant, step, date }: { applicant: Applicant; step: string | null; date: string | null }) => {
      const text = step?.trim() || null;
      await updateApplicant(applicant.id, { next_step: text, next_call_at: date });
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: applicant.id, kind: 'updated',
        body: date ? `Next step: ${text ?? 'Call'}, ${shortDate(date)}` : 'Next step cleared',
      });
    },
    onSuccess: (_d, { applicant }) => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['applicants', applicant.id] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

// ── Providers and requests (0010) ───────────────────────────────────
const PROVIDERS_UPDATE =
  'Providers and requests need a one-off database update: run supabase/migrations/0010_providers_requests.sql in the Supabase SQL Editor.';

/** Every provider, by tag. `ready` is false until 0010 is run. */
export function useProviders() {
  const q = useQuery({
    queryKey: ['providers'],
    queryFn: async (): Promise<{ providers: Provider[]; ready: boolean }> => {
      const { data, error } = await supabase.from('providers').select('*').order('tag');
      if (error) {
        if (missingTable(error)) return { providers: [], ready: false };
        throw error;
      }
      return { providers: (data as Provider[]).map((p) => ({ ...p, rules: p.rules ?? {} })), ready: true };
    },
  });
  return { providers: q.data?.providers ?? [], ready: q.data?.ready ?? false, isLoading: q.isLoading };
}

export type ProviderDraft = Omit<Provider, 'id' | 'created_at' | 'updated_at'> & { id?: string };

/** A saved provider, and how many of its properties were withdrawn (switched off) or brought back (switched on). */
export type SavedProvider = Provider & { withdrawn: number; restored: number };

/**
 * Add or change a provider, then link any properties carrying its tag.
 * Switching it off withdraws its available properties (under offer and let are left alone); switching it
 * back on brings back the ones that switching off withdrew. Each property's change goes on its activity.
 */
export function useSaveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ProviderDraft): Promise<SavedProvider> => {
      const tag = p.tag.trim().toUpperCase();
      if (!tag || !p.name.trim()) throw new Error('A provider needs a name and a tag.');
      const whatsapp = p.whatsapp?.trim() ? providerNumber(p.whatsapp) : null;
      if (p.whatsapp?.trim() && !whatsapp) throw new Error('That WhatsApp number does not look right. Use a UK mobile (07...) or +country code.');
      const row = {
        name: p.name.trim(), contact_first_name: p.contact_first_name?.trim() || null, company: p.company?.trim() || null, tag, whatsapp,
        email: p.email?.trim() || null, rules: p.rules ?? {}, fee_terms: p.fee_terms?.trim() || null, notes: p.notes?.trim() || null, active: p.active,
      };
      const before = p.id ? (await supabase.from('providers').select('active').eq('id', p.id).maybeSingle()).data as { active: boolean } | null : null;
      const res = p.id
        ? await supabase.from('providers').update(row).eq('id', p.id).select().single()
        : await supabase.from('providers').insert(row).select().single();
      if (res.error) {
        if (res.error.code === '42501') throw new Error('Only the owner can change providers.');
        if (res.error.code === '23505') throw new Error(`The tag ${tag} is already used by another provider.`);
        throw missingTable(res.error) ? new Error(PROVIDERS_UPDATE) : res.error;
      }
      const saved = res.data as Provider;
      // properties from lists tagged with it now belong to it
      await supabase.from('properties').update({ provider_id: saved.id }).is('provider_id', null).ilike('source_tag', tag);

      let withdrawn = 0;
      let restored = 0;
      if (before?.active && !saved.active) {
        // switched off: its available properties are withdrawn with it
        const off = await supabase.from('properties').update({ status: 'withdrawn' }).eq('provider_id', saved.id).eq('status', 'void').select('id, address_line');
        const rows = (off.data ?? []) as Array<{ id: string; address_line: string }>;
        withdrawn = rows.length;
        if (rows.length) {
          await supabase.from('activities').insert(rows.map((x) => ({
            entity_type: 'property', entity_id: x.id, kind: PROVIDER_OFF, body: `${x.address_line}: Available → Withdrawn (${tag} switched off)`,
          })));
        }
      } else if (before && !before.active && saved.active) {
        // switched back on: bring back what switching it off withdrew, not ones withdrawn by hand
        const gone = await supabase.from('properties').select('id, address_line').eq('provider_id', saved.id).eq('status', 'withdrawn');
        const rows = (gone.data ?? []) as Array<{ id: string; address_line: string }>;
        const history: Array<{ entity_id: string; kind: string; body: string; created_at: string }> = [];
        for (const ids of chunks(rows.map((x) => x.id))) {
          const a = await supabase.from('activities').select('entity_id, kind, body, created_at').eq('entity_type', 'property').in('entity_id', ids);
          history.push(...((a.data ?? []) as typeof history));
        }
        const back = new Set(withdrawnBySwitchOff(rows.map((x) => x.id), history));
        for (const ids of chunks([...back])) await supabase.from('properties').update({ status: 'void' }).in('id', ids).eq('status', 'withdrawn');
        const brought = rows.filter((x) => back.has(x.id));
        restored = brought.length;
        if (brought.length) {
          await supabase.from('activities').insert(brought.map((x) => ({
            entity_type: 'property', entity_id: x.id, kind: PROVIDER_ON, body: `${x.address_line}: Withdrawn → Available (${tag} switched back on)`,
          })));
        }
      }

      const what = p.id
        ? before?.active && !saved.active ? `Switched off provider ${tag} (${row.name})${withdrawn ? `; ${withdrawn} available ${withdrawn === 1 ? 'property' : 'properties'} withdrawn` : ''}`
          : before && !before.active && saved.active ? `Switched provider ${tag} (${row.name}) back on${restored ? `; ${restored} ${restored === 1 ? 'property' : 'properties'} available again` : ''}`
          : `Updated provider ${tag} (${row.name})`
        : `Added provider ${tag} (${row.name})`;
      await supabase.from('activities').insert({ entity_type: 'provider', entity_id: saved.id, kind: p.id ? 'updated' : 'created', body: what });
      return { ...saved, withdrawn, restored };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Every request to a provider, newest first. `ready` is false until 0010 is run. */
export function useRequests() {
  const q = useQuery({
    queryKey: ['requests'],
    queryFn: async (): Promise<{ requests: ProviderRequest[]; ready: boolean }> => {
      const { data, error } = await supabase.from('requests').select('*').order('sent_at', { ascending: false }).limit(1000);
      if (error) {
        if (missingTable(error)) return { requests: [], ready: false };
        throw error;
      }
      return { requests: (data as ProviderRequest[]).map((r) => ({ ...r, slots: Array.isArray(r.slots) ? r.slots : [], client_ids: r.client_ids ?? [] })), ready: true };
    },
  });
  return { requests: q.data?.requests ?? [], ready: q.data?.ready ?? false };
}

/**
 * Log a request as it is opened in WhatsApp: on the request list (to chase in
 * 24 hours), on each client's timeline and the property's. Asking for a
 * viewing or sending details also starts tracking the property for them.
 */
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, property, clients, type, message, slots, overrideReason, problemsOf }: {
      provider: Provider; property: Pick<Property, 'id' | 'address_line'>; clients: Applicant[]; type: RequestType;
      message: string; slots: string[]; overrideReason: string | null;
      /** each client's rule problems (and the property's, under ''), for the timeline when sent anyway */
      problemsOf: Record<string, string[]>;
    }) => {
      const sent = new Date();
      const inDb = property.id && !isLocalProperty(property.id);
      const { error } = await supabase.from('requests').insert({
        provider_id: provider.id, property_id: inDb ? property.id : null, property_address: property.address_line,
        client_ids: clients.map((c) => c.id), type, message, slots, status: 'sent',
        sent_at: sent.toISOString(), follow_up_at: followUpFrom(sent).toISOString(), override_reason: overrideReason,
      });
      if (error) throw missingTable(error) ? new Error(PROVIDERS_UPDATE) : error;
      const what = `${REQUEST_LABEL[type].done} from ${provider.tag} for ${property.address_line}`;
      const override = (id: string) => {
        const theirs = [...(problemsOf[''] ?? []), ...(problemsOf[id] ?? [])];
        return overrideReason && theirs.length ? `. Sent although: ${theirs.join('; ')}. Reason: ${overrideReason}` : '';
      };
      if (clients.length) {
        await supabase.from('activities').insert(clients.map((c) => ({ entity_type: 'applicant', entity_id: c.id, kind: 'request', body: `${what}${override(c.id)}` })));
      }
      if (inDb) {
        await supabase.from('activities').insert({
          entity_type: 'property', entity_id: property.id, kind: 'request',
          body: `${REQUEST_LABEL[type].done} from ${provider.tag}${clients.length ? ` for ${clients.map((c) => c.full_name.split(' ')[0]).join(', ')}` : ''}`,
        });
      }
      if (type !== 'availability' && clients.length) {
        await supabase.from('deals').upsert(
          clients.map((c) => ({ applicant_id: c.id, property_id: inDb ? property.id : null, address: property.address_line, status: 'interested' })),
          { onConflict: 'applicant_id,address', ignoreDuplicates: true },
        ); // before 0009 there is no deals table; the request still counts
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Record what a provider said (or that you chased them), on the request and each client's timeline. */
export function useUpdateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ request, tag, status, note, chased }: {
      request: ProviderRequest; tag: string; status?: RequestStatus; note?: string | null; chased?: boolean;
    }) => {
      const patch: Partial<ProviderRequest> = {};
      if (status) patch.status = status;
      if (note !== undefined) patch.outcome_note = note;
      if (chased) patch.follow_up_at = followUpFrom(new Date()).toISOString();
      const { error } = await supabase.from('requests').update(patch).eq('id', request.id);
      if (error) throw error;
      const body = chased ? `Chased ${tag} about ${request.property_address}`
        : status === 'confirmed' ? `${tag} confirmed ${request.property_address}${note ? `: ${note}` : ''}`
        : status === 'declined' ? `${tag} declined ${request.property_address}${note ? `: ${note}` : ''}`
        : status === 'no_reply' ? `No reply from ${tag} about ${request.property_address}`
        : status === 'cancelled' ? `Request to ${tag} about ${request.property_address} cancelled`
        : `Request to ${tag} updated`;
      if (request.client_ids.length) {
        await supabase.from('activities').insert(request.client_ids.map((id) => ({ entity_type: 'applicant', entity_id: id, kind: 'request', body })));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Say which provider supplies some properties (or none). */
export function useSetPropertyProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ properties, provider }: { properties: Pick<Property, 'id' | 'address_line'>[]; provider: Pick<Provider, 'id' | 'tag'> | null }) => {
      const onDevice = properties.filter((p) => isLocalProperty(p.id)).map((p) => p.id);
      if (onDevice.length) localProperties.update(onDevice, { provider_id: provider?.id ?? null, ...(provider ? { source_tag: provider.tag } : {}) });
      const inDb = properties.filter((p) => !isLocalProperty(p.id));
      for (const ids of chunks(inDb.map((p) => p.id))) {
        const { error } = await supabase.from('properties').update({ provider_id: provider?.id ?? null }).in('id', ids);
        if (error) throw isMissingColumn(error) || missingTable(error) ? new Error(PROVIDERS_UPDATE) : error;
      }
      if (inDb.length) {
        await supabase.from('activities').insert(inDb.map((p) => ({
          entity_type: 'property', entity_id: p.id, kind: 'updated', body: provider ? `Provider set to ${provider.tag}` : 'Provider cleared',
        })));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/**
 * Set "OK to share with landlords" for every active client at once: on, off,
 * or to match the consent answer on their referral form. Each client whose
 * answer changes gets a line on their timeline.
 */
export function useBulkShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clients, mode }: { clients: Applicant[]; mode: 'on' | 'off' | 'form' }): Promise<number> => {
      const want = (a: Applicant) => (mode === 'on' ? true : mode === 'off' ? false : a.consent === true);
      const changing = clients.filter((a) => (a.share_with_landlords ?? false) !== want(a));
      for (const value of [true, false]) {
        const ids = changing.filter((a) => want(a) === value).map((a) => a.id);
        for (const part of chunks(ids)) {
          const { error } = await supabase.from('applicants').update({ share_with_landlords: value }).in('id', part);
          if (error) throw isMissingColumn(error) ? new Error(PROVIDERS_UPDATE) : error;
        }
      }
      const why = mode === 'form' ? ' to match their referral form' : ' for everyone';
      for (const part of chunks(changing, 500)) {
        await supabase.from('activities').insert(part.map((a) => ({
          entity_type: 'applicant', entity_id: a.id, kind: 'updated',
          body: `${want(a) ? 'OK' : 'Not OK'} to share details with landlords (set${why})`,
        })));
      }
      return changing.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** A line on a client's timeline, e.g. "Told Anna the viewing moved". */
export function useClientNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicantId, kind = 'progress', body }: { applicantId: string; kind?: string; body: string }) => {
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: applicantId, kind, body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });
}

// ── Finances: receivables (0012, 0013; "money" in file and kind names) ──
const MONEY_UPDATE =
  'Finances need a one-off database update: run supabase/migrations/0012_money.sql in the Supabase SQL Editor.';
const FINANCES_UPDATE =
  'Invoices need a one-off database update: run supabase/migrations/0013_finances.sql in the Supabase SQL Editor.';
/** Columns added by 0013. Until it is run they are left out, so fees still save (without how they were worked out). */
const FINANCE_COLUMNS = ['rent_pcm', 'fee_basis', 'fee_rate', 'due_after', 'first_rent_due_on', 'first_rent_paid_on', 'invoice_number', 'invoiced_on', 'bill_to'];

/** Add (or, with an id, change) a receivable. Before 0013 the newer columns are dropped and it is tried again. */
async function writeReceivable(row: Record<string, unknown>, id?: string) {
  const run = (r: Record<string, unknown>) => (id ? supabase.from('receivables').update(r).eq('id', id) : supabase.from('receivables').insert(r));
  const res = await run(row);
  if (!res.error || !isMissingColumn(res.error)) return res;
  return run(Object.fromEntries(Object.entries(row).filter(([k]) => !FINANCE_COLUMNS.includes(k))));
}

const numberOrNull = (v: unknown) => (v == null ? null : Number(v));

/** Every letting fee and incentive, soonest due first. `ready` is false until 0012 is run;
 *  `full` is false until 0013 is (fees kept with how they were worked out, waiting for the first rent, invoices). */
export function useReceivables() {
  const q = useQuery({
    queryKey: ['receivables'],
    queryFn: async (): Promise<{ receivables: Receivable[]; ready: boolean; full: boolean }> => {
      const { data, error } = await supabase.from('receivables').select('*').order('due_on', { ascending: true, nullsFirst: false });
      if (error) {
        if (missingTable(error)) return { receivables: [], ready: false, full: false };
        throw error;
      }
      const rows = data as Receivable[];
      const full = rows.length ? 'due_after' in rows[0] : !(await supabase.from('receivables').select('invoice_number').limit(1)).error;
      return {
        receivables: rows.map((r) => ({ ...r, amount: numberOrNull(r.amount), rent_pcm: numberOrNull(r.rent_pcm), fee_rate: numberOrNull(r.fee_rate) })),
        ready: true,
        full,
      };
    },
  });
  return { receivables: q.data?.receivables ?? [], ready: q.data?.ready ?? false, full: q.data?.full ?? false };
}

/** Add or change a letting fee or incentive, and note it on the client's timeline. */
export function useSaveReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, was }: { draft: ReceivableDraft; was?: Receivable | null }) => {
      const payer = draft.payer.trim();
      if (!payer) throw new Error('Say who pays it.');
      const row = {
        kind: draft.kind, applicant_id: draft.applicant_id, deal_id: draft.deal_id, property_address: draft.property_address?.trim() || null,
        payer, provider_id: draft.provider_id, amount: draft.amount, sign_up_on: draft.sign_up_on || null, due_on: draft.due_on || null,
        claim_submitted_on: draft.claim_submitted_on || null, status: draft.status,
        paid_on: draft.status === 'paid' ? draft.paid_on || todayIso() : null, notes: draft.notes?.trim() || null,
        rent_pcm: draft.rent_pcm ?? null, fee_basis: draft.fee_basis ?? null, fee_rate: draft.fee_rate ?? null,
        due_after: draft.due_after ?? 'sign_up', first_rent_due_on: draft.first_rent_due_on || null, first_rent_paid_on: draft.first_rent_paid_on || null,
        bill_to: draft.bill_to?.trim() || null,
      };
      const res = await writeReceivable(row, draft.id);
      if (res.error) throw missingTable(res.error) ? new Error(MONEY_UPDATE) : res.error;

      const what = KIND_LABEL[row.kind].toLowerCase();
      const sum = row.amount != null ? ` of ${moneyFee(row.amount)}` : '';
      const how = basisWords(row);
      const body = !was ? `${describe(row)} added${how ? ` (${how})` : ''}`
        : was.status !== row.status
          ? row.status === 'paid' ? `${KIND_LABEL[row.kind]}${sum} from ${payer} paid`
            : row.status === 'chased' ? `Chased ${payer} for the ${what}${sum}`
            : row.status === 'submitted' ? `Incentive claim${sum} submitted to ${payer}`
            : row.status === 'declined' ? `${payer} declined the ${what}`
            : `${KIND_LABEL[row.kind]} from ${payer}: ${STATUS_LABEL[row.status].toLowerCase()}`
          : !was.first_rent_paid_on && row.first_rent_paid_on ? `First month's rent paid ${shortDate(row.first_rent_paid_on)}: ${describe(row)}`
          : `${describe(row)} updated`;
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: row.applicant_id, kind: 'money', body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Remove a fee or incentive added by mistake. */
export function useDeleteReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Receivable) => {
      const { error } = await supabase.from('receivables').delete().eq('id', r.id);
      if (error) throw error;
      await supabase.from('activities').insert({ entity_type: 'applicant', entity_id: r.applicant_id, kind: 'money', body: `${describe(r)} removed` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Give a fee or incentive its invoice number (from the database, so it is never shared or reused) and date. Returns the number. */
export function useRaiseInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ r, billTo, prefix, startAt }: { r: Receivable; billTo: string; prefix: string; startAt: number }): Promise<string> => {
      if (r.invoice_number) return r.invoice_number;
      const next = await supabase.rpc('next_invoice_no', { at_least: Math.max(1, Math.floor(startAt || 1)) });
      if (next.error) throw new Error(/function|schema cache|does not exist/i.test(next.error.message) ? FINANCES_UPDATE : next.error.message);
      const number = invoiceNumber(prefix, Number(next.data));
      // only if nobody raised one for it in the meantime
      const res = await supabase.from('receivables').update({ invoice_number: number, invoiced_on: todayIso(), bill_to: billTo.trim() || null })
        .eq('id', r.id).is('invoice_number', null).select('invoice_number');
      if (res.error) throw isMissingColumn(res.error) ? new Error(FINANCES_UPDATE) : res.error;
      if (!(res.data ?? []).length) {
        const theirs = await supabase.from('receivables').select('invoice_number').eq('id', r.id).single();
        return (theirs.data as { invoice_number: string | null } | null)?.invoice_number ?? number;
      }
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: r.applicant_id, kind: 'money',
        body: `Invoice ${number} raised to ${r.payer} for the ${KIND_LABEL[r.kind].toLowerCase()}${r.amount != null ? ` of ${moneyFee(r.amount)}` : ''}`,
      });
      return number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

/** Change who an invoice is addressed to. */
export function useSetBillTo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ r, billTo }: { r: Receivable; billTo: string }) => {
      const text = billTo.trim() || null;
      const { error } = await supabase.from('receivables').update({ bill_to: text }).eq('id', r.id);
      if (error) throw isMissingColumn(error) ? new Error(FINANCES_UPDATE) : error;
      await supabase.from('activities').insert({
        entity_type: 'applicant', entity_id: r.applicant_id, kind: 'money',
        body: `${r.invoice_number ? `Invoice ${r.invoice_number}` : 'Invoice'} now addressed to ${text ? text.split('\n')[0] : r.payer}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

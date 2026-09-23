import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { isLocalProperty, localProperties, useLocalProperties } from './localProperties';
import { DEFAULT_SETTINGS, setActiveSettings, withDefaults } from './settings';
import type { AppSettings } from './settings';
import { OUTCOME_LABEL } from './calls';
import { computeTier } from './tiering';
import { shortDate } from './format';
import type { Activity, Applicant, Call, CallOutcome, Property } from './types';
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

// ── Settings (one shared row; see settings.ts) ──────────────────────
const missingTable = (e: { message?: string; code?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /could not find the table|does not exist|schema cache/i.test(e.message ?? '');

/** The saved settings. `ready` is false until the 0005 update has been run. */
export function useSettings() {
  const q = useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ settings: AppSettings; ready: boolean }> => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'app').maybeSingle();
      if (error) {
        if (missingTable(error)) return { settings: DEFAULT_SETTINGS, ready: false };
        throw error;
      }
      return { settings: withDefaults(DEFAULT_SETTINGS, data?.value), ready: true };
    },
  });
  return { settings: q.data?.settings ?? DEFAULT_SETTINGS, ready: q.data?.ready ?? true, isLoading: q.isLoading };
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: AppSettings) => {
      const { error } = await supabase.from('settings').upsert({ key: 'app', value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      setActiveSettings(value);
      qc.setQueryData(['settings'], { settings: value, ready: true });
      // new copies so memoised tiers and matches are worked out again
      qc.invalidateQueries({ queryKey: ['applicants'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
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

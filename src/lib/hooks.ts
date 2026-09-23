import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Activity, Applicant, Contact, Placement, Property } from './types';
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

/** Delete an applicant and its activities. Placements cascade via the FK. */
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

// ── Contacts ────────────────────────────────────────────────────────
export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data as Contact[];
    },
  });
}

// ── Properties ──────────────────────────────────────────────────────
export function useProperties() {
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

/** Supabase says "Could not find the 'bedrooms' column" until 0004 has been run. */
const needsMigration = (e: { message?: string }) =>
  /column|schema cache/i.test(e.message ?? '')
    ? new Error('The database needs a one-off update first: run supabase/migrations/0004_properties_import.sql in the Supabase SQL Editor, then try again.')
    : e;

export type NewProperty = Pick<Property,
  'address_line' | 'postcode' | 'area' | 'borough' | 'property_type' | 'bedrooms' | 'rent_pcm' | 'rent_text'
  | 'bills' | 'furnished' | 'available_from' | 'notes' | 'source_tag'>;

/** Add a batch of properties (from a pasted list) and log each one. */
export function useAddProperties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, source }: { rows: NewProperty[]; source: string }): Promise<Property[]> => {
      const { data, error } = await supabase
        .from('properties')
        .insert(rows.map((r) => ({ ...r, status: 'void' })))
        .select();
      if (error) throw needsMigration(error);
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

/** Delete properties and their activity. A linked placement keeps its record. */
export function useDeleteProperties() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from('activities').delete().eq('entity_type', 'property').in('entity_id', ids);
      const { error } = await supabase.from('properties').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['placements'] });
    },
  });
}

// ── Placements ──────────────────────────────────────────────────────
export function usePlacements() {
  return useQuery({
    queryKey: ['placements'],
    queryFn: async (): Promise<Placement[]> => {
      const { data, error } = await supabase
        .from('placements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Placement[];
    },
  });
}

export function useUpdatePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Placement> & { id: string }) => {
      const { data, error } = await supabase
        .from('placements')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      // Mirror fee status onto the applicant stage where it makes sense.
      if (patch.fee_status && data) {
        const stage = patch.fee_status === 'paid' ? 'fee_paid' : patch.fee_status === 'invoiced' ? 'fee_invoiced' : null;
        if (stage) {
          await supabase.from('applicants').update({ stage }).eq('id', (data as Placement).applicant_id);
          await supabase.from('activities').insert({
            entity_type: 'applicant',
            entity_id: (data as Placement).applicant_id,
            kind: 'stage_change',
            body: `Fee ${patch.fee_status} — stage → ${stage}`,
          });
        }
      }
      return data as Placement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['applicants'] });
    },
  });
}

export function usePlacementForApplicant(applicantId: string | undefined) {
  return useQuery({
    queryKey: ['placements', 'applicant', applicantId],
    enabled: !!applicantId,
    queryFn: async (): Promise<Placement | null> => {
      const { data, error } = await supabase
        .from('placements')
        .select('*')
        .eq('applicant_id', applicantId)
        .maybeSingle();
      if (error) throw error;
      return data as Placement | null;
    },
  });
}

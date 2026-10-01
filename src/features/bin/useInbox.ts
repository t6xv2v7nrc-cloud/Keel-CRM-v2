import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Extraction } from '../../types/extraction';
import type { MatchResult } from '../../lib/matching';

export interface InboxItem {
  id: string;
  image_path: string | null;
  source_hint: string | null;
  status: 'queued' | 'extracting' | 'review' | 'confirmed' | 'discarded' | 'failed';
  detected_type: string | null;
  raw_text: string | null;
  extraction: Extraction | null;
  matches: MatchResult | null;
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase
        .from('inbox_items')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as InboxItem[];
    },
  });
}

export function useCreateInboxItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      image_path: string;
      source_hint?: string;
      status: InboxItem['status'];
      detected_type?: string;
      raw_text?: string;
      extraction?: Extraction;
      matches?: MatchResult;
    }): Promise<InboxItem> => {
      const { data, error } = await supabase.from('inbox_items').insert(row).select().single();
      if (error) throw error;
      return data as InboxItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

/** Which client (if any) each filed item went to, from the activity trail. Items with none were filed as notes. */
export function useFiledLinks() {
  return useQuery({
    queryKey: ['activities', 'inbox-links'],
    queryFn: async (): Promise<Array<{ inbox_item_id: string; entity_type: string; entity_id: string }>> => {
      const { data, error } = await supabase.from('activities').select('inbox_item_id, entity_type, entity_id').not('inbox_item_id', 'is', null);
      if (error) throw error;
      return data as Array<{ inbox_item_id: string; entity_type: string; entity_id: string }>;
    },
  });
}

export function useUpdateInboxItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<InboxItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('inbox_items')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as InboxItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

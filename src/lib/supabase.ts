import { createClient } from '@supabase/supabase-js';

// Fallbacks keep CI/Netlify builds alive when env vars are missing;
// the auth gate surfaces a configuration warning instead of crashing.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

export const isSupabaseConfigured = url !== 'https://placeholder.supabase.co';

export const supabase = createClient(url, anon);

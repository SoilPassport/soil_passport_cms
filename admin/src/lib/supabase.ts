import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anon && !url.includes('YOUR-PROJECT-REF'));
// The anon key is public by design; every table is protected by Row Level Security.
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'public-anon-key-not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

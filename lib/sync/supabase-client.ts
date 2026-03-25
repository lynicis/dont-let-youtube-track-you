/**
 * Supabase client singleton for the browser extension.
 *
 * The placeholder strings are replaced at build time (or via a config
 * mechanism) with real Supabase project credentials.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

/**
 * Check if Supabase is configured (placeholders have been replaced
 * with real values).
 */
export function isSupabaseConfigured(): boolean {
  return !SUPABASE_URL.startsWith('__') && !SUPABASE_ANON_KEY.startsWith('__');
}

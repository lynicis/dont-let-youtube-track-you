/**
 * Supabase client singleton for the browser extension.
 *
 * Credentials are loaded from environment variables at build time.
 * Create a `.env` file in the project root (see `.env.example`):
 *
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_ANON_KEY=your-anon-key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL: string = import.meta.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY: string = import.meta.env.SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.',
      );
    }
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

/**
 * Check if Supabase credentials have been provided via environment variables.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

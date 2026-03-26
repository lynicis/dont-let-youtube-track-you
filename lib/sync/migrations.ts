/**
 * Remote schema migration trigger.
 *
 * Calls the `setup-schema` Supabase Edge Function to ensure the Postgres
 * tables, indexes, and RLS policies exist.  The result is cached in local
 * device_config so the call only happens once per device.
 */

import * as db from '../db/client';
import { isSupabaseConfigured } from './supabase-client';

/**
 * Derive the Edge Functions base URL from the Supabase project URL.
 * e.g. "https://abc.supabase.co" → "https://abc.supabase.co/functions/v1"
 */
function getFunctionsUrl(): string {
  const supabaseUrl: string = import.meta.env.SUPABASE_URL ?? '';
  return `${supabaseUrl}/functions/v1`;
}

/**
 * Ensure the remote Supabase schema has been applied.
 *
 * - Skips if Supabase is not configured (no credentials).
 * - Skips if already applied (cached in local device_config).
 * - Calls the Edge Function; on success, caches the result.
 * - On failure, logs but does NOT throw — tables may already exist
 *   from another device or a manual migration.
 */
export async function ensureRemoteSchema(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('[migrations] Supabase not configured, skipping remote schema check');
    return;
  }

  // Check if we already ran the migration from this device
  const applied = await db.getConfig('remote_schema_applied');
  if (applied === 'true') {
    return;
  }

  const functionsUrl = getFunctionsUrl();
  const anonKey: string = import.meta.env.SUPABASE_ANON_KEY ?? '';

  try {
    console.log('[migrations] Applying remote schema via Edge Function…');

    const response = await fetch(`${functionsUrl}/setup-schema`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[migrations] Edge Function returned ${response.status}: ${body}`);
      // Don't throw — tables might already exist
      return;
    }

    const result = await response.json();
    if (result.ok) {
      console.log('[migrations] Remote schema applied successfully');
      await db.setConfig('remote_schema_applied', 'true');
    } else {
      console.warn('[migrations] Edge Function reported error:', result.error);
    }
  } catch (err) {
    // Network errors, Edge Function not deployed, etc.
    // Log and continue — don't block the user from pairing.
    console.warn('[migrations] Failed to call setup-schema Edge Function:', err);
  }
}

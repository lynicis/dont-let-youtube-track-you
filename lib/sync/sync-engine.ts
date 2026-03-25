/**
 * Supabase push/pull sync engine.
 *
 * Pushes unsynced local entries to Supabase (encrypted) and pulls
 * entries from other devices in the same sync group. All sensitive
 * fields are encrypted with AES-256-GCM before leaving the device.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client';
import { getSyncStatus } from './pairing';
import { encryptEntry, decryptEntry } from '../crypto/encrypt';
import { deriveKey } from '../crypto/key-derivation';
import * as db from '../db/client';
import type { EncryptedHistoryEntry } from '../crypto/encrypt';
import type { BrowsingHistoryInput } from '../db/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of entries to upsert per Supabase batch. */
const PUSH_BATCH_SIZE = 50;

/** Maximum entries to pull in a single request. */
const PULL_LIMIT = 200;

/** Push interval in milliseconds (30 seconds). */
const PUSH_INTERVAL_MS = 30_000;

/** Pull interval in milliseconds (60 seconds). */
const PULL_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/** Convert a unix-ms timestamp to an ISO-8601 string for Supabase TIMESTAMPTZ. */
function unixMsToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Convert an ISO-8601 string from Supabase back to unix ms. */
function isoToUnixMs(iso: string): number {
  return new Date(iso).getTime();
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/**
 * Push unsynced local entries to Supabase.
 *
 * Each entry is encrypted before upload. Entries are upserted in
 * batches of {@link PUSH_BATCH_SIZE}. Successfully pushed entries are
 * marked as synced locally.
 */
export async function pushToSupabase(): Promise<{ pushed: number; errors: number }> {
  try {
    const status = await getSyncStatus();
    if (!status.isPaired || !status.groupId || !status.pairingCode) {
      return { pushed: 0, errors: 0 };
    }

    if (!isSupabaseConfigured()) {
      return { pushed: 0, errors: 0 };
    }

    const unsynced = await db.getUnsyncedEntries();
    if (unsynced.length === 0) {
      return { pushed: 0, errors: 0 };
    }

    const key = await deriveKey(status.pairingCode);
    const supabase = getSupabaseClient();

    let pushed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < unsynced.length; i += PUSH_BATCH_SIZE) {
      const batch = unsynced.slice(i, i + PUSH_BATCH_SIZE);

      try {
        // Encrypt all entries in this batch
        const encrypted = await Promise.all(
          batch.map((entry) => encryptEntry(entry, status.groupId!, key)),
        );

        // Convert to Supabase-compatible rows (visited_at as ISO string)
        const rows = encrypted.map((e) => ({
          id: e.id,
          group_id: e.group_id,
          device_id: e.device_id,
          page_type: e.page_type,
          visited_at: unixMsToIso(e.visited_at),
          duration_seconds: e.duration_seconds,
          url: e.url,
          title: e.title,
          channel_name: e.channel_name,
          channel_id: e.channel_id,
          search_query: e.search_query,
          thumbnail_url: e.thumbnail_url,
        }));

        const { error } = await supabase
          .from('browsing_history')
          .upsert(rows, { onConflict: 'id' });

        if (error) {
          console.error('[Sync] Push batch error:', error.message);
          errors += batch.length;
          continue;
        }

        // Mark as synced locally
        const ids = batch.map((entry) => entry.id);
        await db.markSynced(ids, Date.now());
        pushed += batch.length;
      } catch (err) {
        console.error('[Sync] Push batch exception:', err);
        errors += batch.length;
      }
    }

    if (pushed > 0) {
      console.log(`[Sync] Pushed ${pushed} entries`);
    }
    if (errors > 0) {
      console.warn(`[Sync] ${errors} entries failed to push`);
    }

    return { pushed, errors };
  } catch (err) {
    console.error('[Sync] Push failed:', err);
    return { pushed: 0, errors: 0 };
  }
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

/**
 * Pull entries from other devices in the same sync group.
 *
 * Only entries created after the last pull timestamp are fetched,
 * limited to {@link PULL_LIMIT} per call. Entries are decrypted and
 * inserted locally (duplicates are skipped via INSERT OR IGNORE).
 */
export async function pullFromSupabase(): Promise<{ pulled: number; errors: number }> {
  try {
    const status = await getSyncStatus();
    if (!status.isPaired || !status.groupId || !status.pairingCode) {
      return { pulled: 0, errors: 0 };
    }

    if (!isSupabaseConfigured()) {
      return { pulled: 0, errors: 0 };
    }

    const deviceId = await db.getConfig('device_id');
    if (!deviceId) {
      console.warn('[Sync] No device_id configured, skipping pull');
      return { pulled: 0, errors: 0 };
    }

    // Determine the starting point for this pull
    const lastPullAt = await db.getConfig('last_pull_at');
    const since = lastPullAt ?? new Date(0).toISOString();

    const supabase = getSupabaseClient();

    const { data: rows, error } = await supabase
      .from('browsing_history')
      .select('*')
      .eq('group_id', status.groupId)
      .neq('device_id', deviceId)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(PULL_LIMIT);

    if (error) {
      console.error('[Sync] Pull query error:', error.message);
      return { pulled: 0, errors: 1 };
    }

    if (!rows || rows.length === 0) {
      return { pulled: 0, errors: 0 };
    }

    const key = await deriveKey(status.pairingCode);

    let pulled = 0;
    let errors = 0;
    const entriesToInsert: BrowsingHistoryInput[] = [];

    for (const row of rows) {
      try {
        // Reconstruct the encrypted entry with visited_at back as unix ms
        const encrypted: EncryptedHistoryEntry = {
          id: row.id,
          group_id: row.group_id,
          device_id: row.device_id,
          page_type: row.page_type,
          visited_at: isoToUnixMs(row.visited_at),
          duration_seconds: row.duration_seconds,
          url: row.url,
          title: row.title,
          channel_name: row.channel_name,
          channel_id: row.channel_id,
          search_query: row.search_query,
          thumbnail_url: row.thumbnail_url,
        };

        const decrypted = await decryptEntry(encrypted, key);

        // Build the input for local insert (synced_at = now to indicate it came from sync)
        const input: BrowsingHistoryInput = {
          id: decrypted.id,
          url: decrypted.url,
          page_type: decrypted.page_type,
          title: decrypted.title,
          video_id: decrypted.video_id,
          channel_name: decrypted.channel_name,
          channel_id: decrypted.channel_id,
          search_query: decrypted.search_query,
          thumbnail_url: decrypted.thumbnail_url,
          visited_at: decrypted.visited_at,
          duration_seconds: decrypted.duration_seconds,
          device_id: decrypted.device_id,
          synced_at: Date.now(),
        };

        entriesToInsert.push(input);
        pulled++;
      } catch (err) {
        console.error('[Sync] Failed to decrypt entry:', (err as Error).message);
        errors++;
      }
    }

    // Bulk insert (INSERT OR IGNORE skips duplicates)
    if (entriesToInsert.length > 0) {
      await db.insertSyncedEntries(entriesToInsert);
    }

    // Update last_pull_at to the created_at of the last row we received
    const lastRow = rows[rows.length - 1];
    if (lastRow?.created_at) {
      await db.setConfig('last_pull_at', lastRow.created_at as string);
    }

    if (pulled > 0) {
      console.log(`[Sync] Pulled ${pulled} entries`);
    }
    if (errors > 0) {
      console.warn(`[Sync] ${errors} entries failed to decrypt`);
    }

    return { pulled, errors };
  } catch (err) {
    console.error('[Sync] Pull failed:', err);
    return { pulled: 0, errors: 0 };
  }
}

// ---------------------------------------------------------------------------
// Sync loop
// ---------------------------------------------------------------------------

/**
 * Start the background sync loop.
 *
 * Runs an initial push+pull immediately, then sets up recurring
 * intervals (push every 30 s, pull every 60 s).
 *
 * @returns A cleanup function that clears both intervals.
 */
export function startSyncLoop(): () => void {
  console.log('[Sync] Starting sync loop');

  // Initial sync (fire-and-forget — errors are logged internally)
  pushToSupabase().catch(() => {});
  pullFromSupabase().catch(() => {});

  const pushInterval = setInterval(() => {
    pushToSupabase().catch(() => {});
  }, PUSH_INTERVAL_MS);

  const pullInterval = setInterval(() => {
    pullFromSupabase().catch(() => {});
  }, PULL_INTERVAL_MS);

  return () => {
    console.log('[Sync] Stopping sync loop');
    clearInterval(pushInterval);
    clearInterval(pullInterval);
  };
}

/**
 * Import browsing history from a JSON string.
 */

import { insertSyncedEntries } from '@/lib/db/client';
import { getOrCreateDeviceId } from '@/lib/background/history-handler';
import { normalizeImportEntries } from './normalize';

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import history entries from a JSON string.
 *
 * Expects an array of objects matching BrowsingHistoryEntry shape.
 * Invalid entries are skipped; device_id is rewritten to this device and
 * created_at/synced_at are dropped so the rows sync normally.
 */
export async function importFromJson(jsonString: string): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(jsonString);
  const deviceId = await getOrCreateDeviceId();
  const { entries, skipped } = normalizeImportEntries(parsed, deviceId);
  const imported = entries.length > 0 ? await insertSyncedEntries(entries) : 0;
  return { imported, skipped: skipped + (entries.length - imported) };
}

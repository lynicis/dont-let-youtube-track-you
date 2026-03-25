/**
 * Import browsing history from a JSON string.
 */

import { insertSyncedEntries } from '@/lib/db/client';
import type { BrowsingHistoryInput } from '@/lib/db/types';

/** Required fields every imported entry must have. */
const REQUIRED_FIELDS = ['id', 'url', 'page_type', 'visited_at', 'device_id'] as const;

/** Check whether a value looks like a valid entry with all required fields. */
function isValidEntry(value: unknown): value is BrowsingHistoryInput {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return REQUIRED_FIELDS.every(
    (field) => obj[field] !== undefined && obj[field] !== null,
  );
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import history entries from a JSON string.
 *
 * Expects an array of objects matching BrowsingHistoryEntry shape.
 * Invalid entries (missing required fields) are skipped.
 * Uses `insertSyncedEntries` which does INSERT OR IGNORE for dedup.
 */
export async function importFromJson(jsonString: string): Promise<ImportResult> {
  const parsed: unknown = JSON.parse(jsonString);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected a JSON array of history entries');
  }

  const valid: BrowsingHistoryInput[] = [];
  let skipped = 0;

  for (const item of parsed) {
    if (isValidEntry(item)) {
      // Strip created_at if present (insertSyncedEntries uses BrowsingHistoryInput)
      const { created_at: _ignored, ...rest } = item as Record<string, unknown>;
      valid.push(rest as unknown as BrowsingHistoryInput);
    } else {
      skipped++;
    }
  }

  if (valid.length > 0) {
    await insertSyncedEntries(valid);
  }

  return { imported: valid.length, skipped };
}

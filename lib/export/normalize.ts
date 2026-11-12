import type { BrowsingHistoryInput } from '../db/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Coerce imported JSON into insertable entries: rewrite device_id, drop
 * created_at/synced_at, skip entries with an invalid id or missing core fields.
 */
export function normalizeImportEntries(
  parsed: unknown,
  deviceId: string,
): { entries: BrowsingHistoryInput[]; skipped: number } {
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of history entries');

  const entries: BrowsingHistoryInput[] = [];
  let skipped = 0;

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) { skipped++; continue; }
    const o = item as Record<string, unknown>;
    if (
      typeof o.id !== 'string' || !UUID_RE.test(o.id) ||
      typeof o.url !== 'string' || typeof o.page_type !== 'string' ||
      typeof o.visited_at !== 'number' || !Number.isFinite(o.visited_at)
    ) { skipped++; continue; }

    entries.push({
      id: o.id,
      url: o.url,
      page_type: o.page_type,
      title: asString(o.title),
      video_id: asString(o.video_id),
      channel_name: asString(o.channel_name),
      channel_id: asString(o.channel_id),
      search_query: asString(o.search_query),
      thumbnail_url: asString(o.thumbnail_url),
      visited_at: o.visited_at,
      duration_seconds: typeof o.duration_seconds === 'number' ? o.duration_seconds : null,
      device_id: deviceId,
      synced_at: null,
    });
  }

  return { entries, skipped };
}

/**
 * Handles page-visit and update-duration messages from the content script.
 *
 * Converts PageVisit payloads into BrowsingHistoryInput records and
 * persists them via the DB client. Maintains a bounded in-memory
 * URL -> DB ID mapping so duration updates can target the correct row.
 */

import { v4 as uuidv4 } from 'uuid';
import type { PageVisit } from '../tracker/types';
import type { BrowsingHistoryInput } from '../db/types';
import * as db from '../db/client';

const MAX_URL_MAP_SIZE = 100;

/**
 * Map of URL -> most recently inserted DB ID.
 * Used by handleUpdateDuration to look up the record to update.
 */
const urlToIdMap = new Map<string, string>();

/** Device ID is cached after first resolution to avoid repeated DB lookups. */
let cachedDeviceId: string | null = null;

/**
 * Get the device ID from config, generating and persisting one if it
 * doesn't exist yet.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await db.getConfig('device_id');
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const newId = uuidv4();
  await db.setConfig('device_id', newId);
  cachedDeviceId = newId;
  return newId;
}

/**
 * Add an entry to the URL -> ID map, evicting the oldest entry when the
 * map exceeds MAX_URL_MAP_SIZE.
 */
function trackUrl(url: string, id: string): void {
  // If the map is at capacity, delete the oldest entry (first key).
  if (urlToIdMap.size >= MAX_URL_MAP_SIZE && !urlToIdMap.has(url)) {
    const oldest = urlToIdMap.keys().next().value;
    if (oldest !== undefined) {
      urlToIdMap.delete(oldest);
    }
  }
  urlToIdMap.set(url, id);
}

/**
 * Convert a PageVisit from the content script into a BrowsingHistoryInput,
 * insert it into the database, and return the generated record ID.
 */
export async function handlePageVisit(visit: PageVisit): Promise<string> {
  const id = uuidv4();
  const deviceId = await getOrCreateDeviceId();

  const entry: BrowsingHistoryInput = {
    id,
    url: visit.url,
    page_type: visit.pageType,
    title: visit.title,
    video_id: visit.videoId,
    channel_name: visit.channelName,
    channel_id: visit.channelId,
    search_query: visit.searchQuery,
    thumbnail_url: visit.thumbnailUrl,
    visited_at: visit.visitedAt,
    duration_seconds: visit.durationSeconds,
    device_id: deviceId,
    synced_at: null,
  };

  await db.insertHistory(entry);
  trackUrl(visit.url, id);

  return id;
}

/**
 * Update the duration for the most recently recorded visit matching the
 * given URL. Silently no-ops if the URL is not found in the map (e.g. the
 * entry was evicted or the background was restarted).
 */
export async function handleUpdateDuration(data: {
  url: string;
  durationSeconds: number;
}): Promise<void> {
  const id = urlToIdMap.get(data.url);
  if (!id) return;

  await db.updateDuration(id, data.durationSeconds);
}

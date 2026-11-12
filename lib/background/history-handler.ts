/**
 * Handles page-visit and update-duration messages from the content script.
 *
 * Converts PageVisit payloads into BrowsingHistoryInput records and
 * persists them via the DB client. Duration updates target the row by
 * (url, visited_at), so they survive service-worker suspension.
 */

import { v4 as uuidv4 } from 'uuid';
import type { PageVisit } from '../tracker/types';
import type { BrowsingHistoryInput } from '../db/types';
import * as db from '../db/client';

/** Single-flight device ID resolution: concurrent callers share one lookup. */
let deviceIdPromise: Promise<string> | null = null;

function loadOrCreateDeviceId(): Promise<string> {
  return (async () => {
    const existing = await db.getConfig('device_id');
    if (existing) return existing;
    const newId = uuidv4();
    await db.setConfig('device_id', newId);
    return newId;
  })();
}

/**
 * Get the device ID from config, generating and persisting one if it
 * doesn't exist yet.
 */
export function getOrCreateDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = loadOrCreateDeviceId().catch((err) => {
      deviceIdPromise = null;
      throw err;
    });
  }
  return deviceIdPromise;
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

  return id;
}

/**
 * Update the duration for the visit matching url + visited_at.
 * A missing row updates zero rows; no error.
 */
export async function handleUpdateDuration(data: {
  url: string;
  visitedAt: number;
  durationSeconds: number;
}): Promise<void> {
  await db.updateDuration(data.url, data.visitedAt, data.durationSeconds);
}

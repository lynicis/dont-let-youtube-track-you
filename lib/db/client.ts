/**
 * Background-facing DB client that communicates with the offscreen
 * document via chrome.runtime.sendMessage.
 *
 * Usage: import { db } from '@/lib/db/client' in the background script.
 */

import { browser } from 'wxt/browser';
import { v4 as uuidv4 } from 'uuid';
import type {
  DbOperation,
  DbRequest,
  DbResponse,
  BrowsingHistoryEntry,
  BrowsingHistoryInput,
} from './types';

const OFFSCREEN_DOCUMENT_PATH = '/db-offscreen.html';

let offscreenCreating: Promise<void> | null = null;

/** Ensure the offscreen document exists (create it if needed). */
async function ensureOffscreenDocument(): Promise<void> {
  // chrome.offscreen is only available in MV3 Chrome extensions
  const chromeGlobal = globalThis as unknown as { chrome?: { offscreen?: {
    hasDocument: () => Promise<boolean>;
    createDocument: (params: {
      url: string;
      reasons: string[];
      justification: string;
    }) => Promise<void>;
  } } };

  const offscreen = chromeGlobal.chrome?.offscreen;
  if (!offscreen) {
    throw new Error('chrome.offscreen API not available');
  }

  const hasDocument = await offscreen.hasDocument();
  if (hasDocument) return;

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['WORKERS'],
    justification: 'SQLite database access via wa-sqlite Web Worker',
  });

  await offscreenCreating;
  offscreenCreating = null;
}

/** Send a DB request to the offscreen document and wait for the response. */
async function sendDbRequest(operation: DbOperation, params: unknown): Promise<unknown> {
  await ensureOffscreenDocument();

  const request: DbRequest = {
    type: 'db-request',
    requestId: uuidv4(),
    operation,
    params,
  };

  const response = await browser.runtime.sendMessage(request) as DbResponse;

  if (!response) {
    throw new Error(`No response for DB operation: ${operation}`);
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

// ---- Public DB API ----

/** Insert a browsing history entry. */
export async function insertHistory(entry: BrowsingHistoryInput): Promise<void> {
  await sendDbRequest('insertHistory', { entry });
}

/** Get recent history entries, ordered by visited_at DESC. */
export async function getRecentHistory(
  limit: number,
  offset: number,
): Promise<BrowsingHistoryEntry[]> {
  return (await sendDbRequest('getRecentHistory', { limit, offset })) as BrowsingHistoryEntry[];
}

/** Get entries that haven't been synced yet. */
export async function getUnsyncedEntries(): Promise<BrowsingHistoryEntry[]> {
  return (await sendDbRequest('getUnsyncedEntries', {})) as BrowsingHistoryEntry[];
}

/** Mark entries as synced with the given timestamp. */
export async function markSynced(ids: string[], timestamp: number): Promise<void> {
  await sendDbRequest('markSynced', { ids, timestamp });
}

/** Insert entries from other devices, skipping duplicates. */
export async function insertSyncedEntries(entries: BrowsingHistoryInput[]): Promise<void> {
  await sendDbRequest('insertSyncedEntries', { entries });
}

/** Update the duration for a history entry. */
export async function updateDuration(id: string, durationSeconds: number): Promise<void> {
  await sendDbRequest('updateDuration', { id, durationSeconds });
}

/** Get a device config value by key. */
export async function getConfig(key: string): Promise<string | null> {
  return (await sendDbRequest('getConfig', { key })) as string | null;
}

/** Set a device config value. */
export async function setConfig(key: string, value: string): Promise<void> {
  await sendDbRequest('setConfig', { key, value });
}

/** Delete history entries older than N days. Returns the number deleted. */
export async function deleteOldEntries(maxAgeDays: number): Promise<number> {
  return (await sendDbRequest('deleteOldEntries', { maxAgeDays })) as number;
}

/** Get all history entries (for export). */
export async function getAllHistory(): Promise<BrowsingHistoryEntry[]> {
  return (await sendDbRequest('getAllHistory', {})) as BrowsingHistoryEntry[];
}

/** Get the total number of history entries. */
export async function getHistoryCount(): Promise<number> {
  return (await sendDbRequest('getHistoryCount', {})) as number;
}

/** Search history by title or URL. */
export async function searchHistory(query: string): Promise<BrowsingHistoryEntry[]> {
  return (await sendDbRequest('searchHistory', { query })) as BrowsingHistoryEntry[];
}

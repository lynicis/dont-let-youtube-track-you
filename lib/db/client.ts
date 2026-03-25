/**
 * Background-facing DB client.
 *
 * On Chrome: communicates with the offscreen document via chrome.runtime.sendMessage.
 * On Firefox/Safari: spawns the Web Worker directly from the background script
 * (Firefox MV3 supports Workers in background scripts; there is no offscreen API).
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

// ---- Chrome offscreen approach ----

let offscreenCreating: Promise<void> | null = null;

/** Returns true if chrome.offscreen API is available (Chrome MV3 only). */
function hasOffscreenAPI(): boolean {
  const chromeGlobal = globalThis as unknown as {
    chrome?: { offscreen?: unknown };
  };
  return !!chromeGlobal.chrome?.offscreen;
}

/** Ensure the offscreen document exists (Chrome only). */
async function ensureOffscreenDocument(): Promise<void> {
  const chromeGlobal = globalThis as unknown as {
    chrome?: {
      offscreen?: {
        hasDocument: () => Promise<boolean>;
        createDocument: (params: {
          url: string;
          reasons: string[];
          justification: string;
        }) => Promise<void>;
      };
    };
  };

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

/** Send a DB request via chrome.runtime.sendMessage to the offscreen document. */
async function sendViaOffscreen(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  await ensureOffscreenDocument();

  const request: DbRequest = {
    type: 'db-request',
    requestId: uuidv4(),
    operation,
    params,
  };

  const response = (await browser.runtime.sendMessage(request)) as DbResponse;

  if (!response) {
    throw new Error(`No response for DB operation: ${operation}`);
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

// ---- Firefox/Safari direct-worker approach ----

let directWorker: Worker | null = null;
let directWorkerReady: Promise<void> | null = null;
const pendingRequests = new Map<string, (response: DbResponse) => void>();

/**
 * Initialise a Web Worker directly (Firefox/Safari background scripts support
 * Workers, so we don't need the offscreen document dance).
 */
function ensureDirectWorker(): Promise<void> {
  if (directWorkerReady) return directWorkerReady;

  directWorkerReady = new Promise<void>((resolve, reject) => {
    try {
      directWorker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' },
      );

      directWorker.onmessage = (event: MessageEvent<DbResponse>) => {
        const response = event.data;
        if (response.type !== 'db-response') return;

        // Init signal
        if (response.requestId === '__init__') {
          if (response.ok) {
            console.log('[db-client] Direct worker initialized');
            resolve();
          } else {
            reject(
              new Error(
                `Worker init failed: ${response.ok === false ? response.error : 'unknown'}`,
              ),
            );
          }
          return;
        }

        // Route to pending request
        const resolver = pendingRequests.get(response.requestId);
        if (resolver) {
          pendingRequests.delete(response.requestId);
          resolver(response);
        }
      };

      directWorker.onerror = (event) => {
        console.error('[db-client] Direct worker error:', event.message);
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[db-client] Failed to create direct worker:', error);
      reject(error);
    }
  });

  return directWorkerReady;
}

/** Send a DB request directly to the worker via postMessage. */
async function sendViaDirect(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  await ensureDirectWorker();

  if (!directWorker) {
    throw new Error('Direct worker not initialized');
  }

  const request: DbRequest = {
    type: 'db-request',
    requestId: uuidv4(),
    operation,
    params,
  };

  return new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(request.requestId, (response) => {
      if (response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(response.ok === false ? response.error : 'Unknown error'));
      }
    });
    directWorker!.postMessage(request);
  });
}

// ---- Unified send ----

/** Send a DB request using the best available transport. */
async function sendDbRequest(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  if (hasOffscreenAPI()) {
    return sendViaOffscreen(operation, params);
  }
  // Firefox/Safari: use direct worker from background script
  return sendViaDirect(operation, params);
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

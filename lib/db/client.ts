/**
 * Background-facing DB client.
 *
 * On Chrome: communicates with the offscreen document via the Service Worker
 * clients API (postMessage). This avoids the broadcast problem with
 * chrome.runtime.sendMessage where other onMessage listeners intercept the
 * message before the offscreen document can respond.
 *
 * On Firefox/Safari: spawns the Web Worker directly from the background script
 * (Firefox MV3 supports Workers in background scripts; there is no offscreen API).
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  DbOperation,
  DbRequest,
  DbResponse,
  BrowsingHistoryEntry,
  BrowsingHistoryInput,
} from './types';

// ---- Service Worker global type helpers ----
// These types exist at runtime in the SW context but aren't in the default
// TypeScript lib.  We declare lightweight shims so the rest of the file
// type-checks without pulling in the full WebWorker lib (which conflicts
// with the DOM lib used elsewhere in the project).

declare const self: {
  location: { origin: string };
  clients: {
    matchAll(opts?: {
      type?: string;
      includeUncontrolled?: boolean;
    }): Promise<Array<{ url: string; postMessage(msg: unknown): void }>>;
  };
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
};

/** A matched SW client that we can postMessage to. */
type SwClient = { url: string; postMessage(msg: unknown): void };

const OFFSCREEN_DOCUMENT_PATH = '/db-offscreen.html';

/** How long to wait for a single DB operation response (ms). */
const REQUEST_TIMEOUT_MS = 15_000;

/** How long to wait for the offscreen document to become a SW client (ms). */
const CLIENT_DISCOVERY_TIMEOUT_MS = 5_000;
const CLIENT_DISCOVERY_INTERVAL_MS = 200;

// ---- Shared pending-request map ----

const pendingRequests = new Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: Error) => void }
>();

// ---- Chrome offscreen approach (via SW clients API) ----

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

/**
 * Find the offscreen document among the Service Worker's controlled clients.
 * The offscreen doc's URL ends with OFFSCREEN_DOCUMENT_PATH.
 */
async function findOffscreenClient(): Promise<SwClient | null> {
  const allClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  const offscreenUrl = new URL(OFFSCREEN_DOCUMENT_PATH, self.location.origin)
    .href;
  return allClients.find((c) => c.url === offscreenUrl) ?? null;
}

/**
 * Wait until the offscreen document shows up as a SW client.
 * createDocument() resolves before the document has fully loaded, so we poll.
 */
async function waitForOffscreenClient(): Promise<SwClient> {
  const deadline = Date.now() + CLIENT_DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const client = await findOffscreenClient();
    if (client) return client;
    await new Promise((r) => setTimeout(r, CLIENT_DISCOVERY_INTERVAL_MS));
  }
  throw new Error(
    'Offscreen document did not appear as a SW client within timeout',
  );
}

let offscreenListenerRegistered = false;

/**
 * Register a one-time listener on the SW global scope for messages coming back
 * from the offscreen document via navigator.serviceWorker.controller.postMessage.
 */
function ensureSwMessageListener(): void {
  if (offscreenListenerRegistered) return;
  offscreenListenerRegistered = true;

  self.addEventListener('message', (event: { data: unknown }) => {
    const data = event.data as DbResponse | undefined;
    if (!data || data.type !== 'db-response') return;

    const pending = pendingRequests.get(data.requestId);
    if (!pending) return;
    pendingRequests.delete(data.requestId);

    if (data.ok) {
      pending.resolve(data.data);
    } else {
      pending.reject(new Error(data.error));
    }
  });
}

/** Send a DB request to the offscreen document via the SW clients API. */
async function sendViaOffscreen(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  ensureSwMessageListener();
  await ensureOffscreenDocument();
  const client = await waitForOffscreenClient();

  const request: DbRequest = {
    type: 'db-request',
    requestId: uuidv4(),
    operation,
    params,
  };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(request.requestId);
      reject(
        new Error(
          `DB operation timed out: ${operation} (${REQUEST_TIMEOUT_MS}ms)`,
        ),
      );
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(request.requestId, {
      resolve: (data) => {
        clearTimeout(timer);
        resolve(data);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    client.postMessage(request);
  });
}

// ---- Firefox/Safari direct-worker approach ----

let directWorker: Worker | null = null;
let directWorkerReady: Promise<void> | null = null;

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
        const pending = pendingRequests.get(response.requestId);
        if (pending) {
          pendingRequests.delete(response.requestId);
          if (response.ok) {
            pending.resolve(response.data);
          } else {
            pending.reject(
              new Error(response.ok === false ? response.error : 'Unknown error'),
            );
          }
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
    pendingRequests.set(request.requestId, { resolve, reject });
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

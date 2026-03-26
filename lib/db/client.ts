/**
 * Background-facing DB client.
 *
 * On Chrome: communicates with the offscreen document via chrome.runtime
 * messaging (sendMessage / onMessage).  This is the standard MV3 pattern;
 * the previous approach using the SW clients API + navigator.serviceWorker
 * failed because offscreen documents are not reliably controlled by the
 * extension's service worker.
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

// ---- Chrome runtime type helpers ----
// Lightweight shims for the chrome.runtime / chrome.offscreen APIs so that
// this file type-checks without pulling in the full chrome-types package.

declare const chrome: {
  offscreen?: {
    hasDocument: () => Promise<boolean>;
    createDocument: (params: {
      url: string;
      reasons: string[];
      justification: string;
    }) => Promise<void>;
  };
  runtime: {
    sendMessage(msg: unknown): Promise<unknown>;
    onMessage: {
      addListener(
        cb: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
};

const OFFSCREEN_DOCUMENT_PATH = '/db-offscreen.html';

/** How long to wait for a single DB operation response (ms). */
const REQUEST_TIMEOUT_MS = 15_000;

/** Maximum number of retries for a failed DB operation. */
const MAX_RETRIES = 2;

/** Base delay between retries (ms); doubles each attempt. */
const RETRY_BASE_DELAY_MS = 500;

// ---- Shared pending-request map ----

const pendingRequests = new Map<
  string,
  { resolve: (data: unknown) => void; reject: (err: Error) => void }
>();

// ---- Chrome offscreen approach (via chrome.runtime messaging) ----

let offscreenCreating: Promise<void> | null = null;

/** Returns true if chrome.offscreen API is available (Chrome MV3 only). */
function hasOffscreenAPI(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.offscreen;
}

/** Ensure the offscreen document exists (Chrome only). */
async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = chrome.offscreen;
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

let offscreenListenerRegistered = false;

/**
 * Register a one-time listener on chrome.runtime.onMessage for DB responses
 * coming back from the offscreen document.
 */
function ensureRuntimeMessageListener(): void {
  if (offscreenListenerRegistered) return;
  offscreenListenerRegistered = true;

  chrome.runtime.onMessage.addListener(
    (message: unknown, _sender: unknown, _sendResponse: unknown) => {
      const data = message as DbResponse | undefined;
      if (!data || data.type !== 'db-response') return;

      const pending = pendingRequests.get(data.requestId);
      if (!pending) return;
      pendingRequests.delete(data.requestId);

      if (data.ok) {
        pending.resolve(data.data);
      } else {
        pending.reject(new Error(data.error));
      }
    },
  );
}

// ---- Readiness gate (Chrome offscreen) ----

let offscreenReady: Promise<void> | null = null;

/**
 * Perform a lightweight DB round-trip (getConfig) to prove the full
 * background → offscreen → worker → offscreen → background chain works.
 *
 * This is called once before the first real operation and cached.
 * If the probe fails the promise rejects and will be retried next call.
 */
function ensureOffscreenReady(): Promise<void> {
  if (offscreenReady) return offscreenReady;

  offscreenReady = (async () => {
    console.log('[db-client] Probing offscreen worker readiness…');
    await sendViaOffscreenOnce('getConfig', { key: '__readiness_probe__' });
    console.log('[db-client] Offscreen worker ready');
  })();

  // If the probe fails, clear so next call retries.
  offscreenReady.catch(() => {
    offscreenReady = null;
  });

  return offscreenReady;
}

/**
 * Send a single DB request to the offscreen document (no retry).
 * Uses chrome.runtime.sendMessage to deliver the request; the offscreen
 * document responds via chrome.runtime.sendMessage back.
 */
async function sendViaOffscreenOnce(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  ensureRuntimeMessageListener();
  await ensureOffscreenDocument();

  const request: DbRequest = {
    type: 'db-request',
    requestId: uuidv4(),
    operation,
    params,
  };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(request.requestId);
      console.error(
        `[db-client] Timeout: ${operation} (${REQUEST_TIMEOUT_MS}ms) reqId=${request.requestId}`,
      );
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

    // Send the request to all extension contexts — the offscreen document's
    // onMessage listener picks it up by checking type === 'db-request'.
    chrome.runtime.sendMessage(request).catch((err: unknown) => {
      // If sendMessage itself fails (e.g. no listeners), reject immediately
      // rather than waiting for the timeout.
      clearTimeout(timer);
      pendingRequests.delete(request.requestId);
      reject(
        err instanceof Error
          ? err
          : new Error(`sendMessage failed: ${String(err)}`),
      );
    });
  });
}

/**
 * Send a DB request to the offscreen document with readiness gate + retry.
 */
async function sendViaOffscreen(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  await ensureOffscreenReady();

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendViaOffscreenOnce(operation, params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `[db-client] ${operation} attempt ${attempt + 1} failed, retrying in ${delay}ms…`,
          lastError.message,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
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

/** Send a single DB request directly to the worker (no retry). */
async function sendViaDirectOnce(
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
    const timer = setTimeout(() => {
      pendingRequests.delete(request.requestId);
      console.error(
        `[db-client] Timeout (direct): ${operation} (${REQUEST_TIMEOUT_MS}ms) reqId=${request.requestId}`,
      );
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

    directWorker!.postMessage(request);
  });
}

/**
 * Send a DB request directly to the worker with retry.
 */
async function sendViaDirect(
  operation: DbOperation,
  params: unknown,
): Promise<unknown> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await sendViaDirectOnce(operation, params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `[db-client] ${operation} (direct) attempt ${attempt + 1} failed, retrying in ${delay}ms…`,
          lastError.message,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
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

// ---- Readiness API ----

/**
 * Returns a promise that resolves once the DB worker is confirmed operational.
 *
 * Callers that need the DB to be ready before proceeding (e.g. the sync loop)
 * should `await waitForReady()`.  The underlying probe is cached — subsequent
 * calls resolve immediately once the worker has responded at least once.
 */
export async function waitForReady(): Promise<void> {
  if (hasOffscreenAPI()) {
    await ensureOffscreenReady();
  } else {
    await ensureDirectWorker();
  }
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

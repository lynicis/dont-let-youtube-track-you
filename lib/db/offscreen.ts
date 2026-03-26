/**
 * Offscreen document script that hosts the wa-sqlite Web Worker.
 *
 * Communication uses chrome.runtime messaging:
 *   - Receives requests via chrome.runtime.onMessage (sent by the
 *     background service worker via chrome.runtime.sendMessage).
 *   - Sends responses back via chrome.runtime.sendMessage.
 *
 * This is the standard Chrome MV3 pattern for offscreen ↔ background
 * communication.  The previous approach (navigator.serviceWorker.controller)
 * failed because Chrome offscreen documents are not reliably controlled
 * by the extension's service worker.
 */

import type { DbRequest, DbResponse } from '@/lib/db/types';

// Chrome runtime API is available in the offscreen document at runtime.
// We declare a minimal shim to avoid pulling in the full chrome-types package.
declare const chrome: {
  runtime: {
    sendMessage(msg: unknown): Promise<void>;
    onMessage: {
      addListener(cb: (msg: unknown) => void): void;
    };
  };
};

let worker: Worker | null = null;

/** Pending responses from the worker, keyed by requestId. */
const pendingRequests = new Map<string, (response: DbResponse) => void>();

const workerReadyPromise = new Promise<void>((resolve, reject) => {
  initWorker(resolve, reject);
});

function initWorker(
  onReady: () => void,
  onError: (err: Error) => void,
): void {
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<DbResponse>) => {
      const response = event.data;
      if (response.type !== 'db-response') return;

      // Handle init signal
      if (response.requestId === '__init__') {
        if (response.ok) {
          onReady();
          console.log('[db-offscreen] Worker initialized');
        } else {
          onError(new Error(`Worker init failed: ${response.ok === false ? response.error : 'unknown'}`));
        }
        return;
      }

      // Route response to pending request
      const resolver = pendingRequests.get(response.requestId);
      if (resolver) {
        pendingRequests.delete(response.requestId);
        resolver(response);
      }
    };

    worker.onerror = (event) => {
      console.error('[db-offscreen] Worker error:', event.message);
    };
  } catch (err) {
    console.error('[db-offscreen] Failed to create worker:', err);
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function handleDbRequest(request: DbRequest): Promise<DbResponse> {
  await workerReadyPromise;

  if (!worker) {
    return {
      type: 'db-response',
      requestId: request.requestId,
      ok: false,
      error: 'Worker not initialized',
    };
  }

  return new Promise<DbResponse>((resolve) => {
    pendingRequests.set(request.requestId, resolve);
    worker!.postMessage(request);
  });
}

/**
 * Send a response back to the background service worker via
 * chrome.runtime.sendMessage.
 */
function sendToServiceWorker(response: DbResponse): void {
  chrome.runtime.sendMessage(response).catch((err: unknown) => {
    // This can happen if the SW is temporarily inactive; the timeout in
    // client.ts will handle the retry.
    console.warn(
      `[db-offscreen] Failed to send response for reqId=${response.requestId}:`,
      err,
    );
  });
}

// Listen for messages from the background service worker via chrome.runtime.
chrome.runtime.onMessage.addListener((msg: unknown) => {
  const request = msg as DbRequest | undefined;
  if (!request || request.type !== 'db-request') return;

  handleDbRequest(request).then((response) => {
    sendToServiceWorker(response);
  }).catch((err) => {
    console.error(
      `[db-offscreen] Unhandled error for ${request.operation} reqId=${request.requestId}:`,
      err,
    );
    // Still try to send an error response so the background timeout doesn't fire.
    sendToServiceWorker({
      type: 'db-response',
      requestId: request.requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

console.log('[db-offscreen] Offscreen document loaded');

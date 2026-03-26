/**
 * Offscreen document script that hosts the wa-sqlite Web Worker.
 *
 * Communication uses the Service Worker messaging API:
 *   - Receives requests via  navigator.serviceWorker  'message' events
 *     (sent by the background SW via client.postMessage).
 *   - Sends responses back via navigator.serviceWorker.controller.postMessage.
 *
 * This avoids chrome.runtime.sendMessage broadcast issues where the
 * background's own onMessage listener would intercept DB requests.
 */

import type { DbRequest, DbResponse } from '@/lib/db/types';

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
 * Send a response back to the background service worker via the
 * ServiceWorker controller postMessage channel.
 */
function sendToServiceWorker(response: DbResponse): void {
  const controller = navigator.serviceWorker?.controller;
  if (controller) {
    controller.postMessage(response);
  } else {
    console.error('[db-offscreen] No SW controller available to send response');
  }
}

// Listen for messages from the background service worker.
// The SW sends messages via client.postMessage() (from clients.matchAll()),
// which arrives as a 'message' event on navigator.serviceWorker.
navigator.serviceWorker.addEventListener('message', (event) => {
  const msg = event.data as DbRequest;
  if (!msg || msg.type !== 'db-request') return;

  handleDbRequest(msg).then((response) => {
    sendToServiceWorker(response);
  });
});

console.log('[db-offscreen] Offscreen document loaded');

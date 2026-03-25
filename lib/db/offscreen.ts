/**
 * Offscreen document script that hosts the wa-sqlite Web Worker.
 *
 * This bridges communication between the background service worker
 * (via chrome.runtime messages) and the DB Web Worker (via postMessage).
 */

import { browser, type Browser } from 'wxt/browser';
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

// Listen for messages from the background service worker
browser.runtime.onMessage.addListener(
  (message: unknown, _sender: Browser.runtime.MessageSender) => {
    const msg = message as DbRequest;
    if (msg.type !== 'db-request') return;

    // Return a promise for async response (supported by browser.runtime.onMessage)
    return handleDbRequest(msg);
  }
);

console.log('[db-offscreen] Offscreen document loaded');

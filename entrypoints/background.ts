import {
  handlePageVisit,
  handleUpdateDuration,
  getOrCreateDeviceId,
} from '@/lib/background/history-handler';
import * as db from '@/lib/db/client';

export default defineBackground(() => {
  // Ensure device_id is generated on first startup.
  getOrCreateDeviceId().catch((err) => {
    console.error('[background] failed to initialise device ID:', err);
  });

  // ---- Message router ----

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Only handle messages that have a `type` field (our protocol).
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }

    const { type, data } = message as { type: string; data?: unknown };

    switch (type) {
      // -- Content script messages --

      case 'page-visit': {
        handlePageVisit(data as Parameters<typeof handlePageVisit>[0])
          .then((id) => sendResponse({ ok: true, id }))
          .catch((err) => {
            console.error('[background] page-visit error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true; // async response
      }

      case 'update-duration': {
        handleUpdateDuration(data as Parameters<typeof handleUpdateDuration>[0])
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error('[background] update-duration error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      // -- Popup messages --

      case 'get-recent-history': {
        const { limit = 50, offset = 0 } = (data ?? {}) as {
          limit?: number;
          offset?: number;
        };
        db.getRecentHistory(limit, offset)
          .then((entries) => sendResponse({ ok: true, data: entries }))
          .catch((err) => {
            console.error('[background] get-recent-history error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'get-history-count': {
        db.getHistoryCount()
          .then((count) => sendResponse({ ok: true, data: count }))
          .catch((err) => {
            console.error('[background] get-history-count error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'search-history': {
        const { query = '' } = (data ?? {}) as { query?: string };
        db.searchHistory(query)
          .then((entries) => sendResponse({ ok: true, data: entries }))
          .catch((err) => {
            console.error('[background] search-history error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'get-sync-status': {
        // Placeholder — sync not yet implemented.
        sendResponse({ ok: true, data: null });
        return false;
      }

      default:
        // Unknown type — let other listeners handle it (e.g. db-request
        // messages handled by the offscreen document).
        return;
    }
  });
});

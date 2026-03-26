import {
  handlePageVisit,
  handleUpdateDuration,
  getOrCreateDeviceId,
} from '@/lib/background/history-handler';
import * as db from '@/lib/db/client';
import { startSyncLoop } from '@/lib/sync/sync-engine';
import {
  getSyncStatus,
  createSyncGroup,
  joinSyncGroup,
  leaveSyncGroup,
} from '@/lib/sync/pairing';
import { exportAsJson, exportAsCsv } from '@/lib/export/export';
import { importFromJson } from '@/lib/export/import';
import { runAutoCleanup, getRetentionDays, setRetentionDays } from '@/lib/db/cleanup';

export default defineBackground(() => {
  // Ensure device_id is generated on first startup.
  getOrCreateDeviceId().catch((err) => {
    console.error('[background] failed to initialise device ID:', err);
  });

  // Start the Supabase sync loop (push every 30s, pull every 60s).
  const _stopSync = startSyncLoop();

  // Run auto-cleanup on startup based on configured retention period.
  runAutoCleanup().catch((err) => {
    console.error('[background] auto-cleanup error:', err);
  });

  // ---- Message router ----

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Only handle messages that have a `type` field (our protocol).
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }

    const { type, data } = message as { type: string; data?: unknown };

    // Let db-request messages pass through to the offscreen document's listener.
    // Returning undefined (no return) tells Chrome this listener doesn't handle
    // the message, so it reaches the offscreen document.
    if (type === 'db-request') return;

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
        getSyncStatus()
          .then((syncStatus) => sendResponse({ ok: true, data: syncStatus }))
          .catch((err) => {
            console.error('[background] get-sync-status error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true; // async response
      }

      case 'create-sync-group': {
        createSyncGroup()
          .then((result) => sendResponse({ ok: true, data: result }))
          .catch((err) => {
            console.error('[background] create-sync-group error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'join-sync-group': {
        const { code } = (data ?? {}) as { code: string };
        joinSyncGroup(code)
          .then((result) => sendResponse({ ok: true, data: result }))
          .catch((err) => {
            console.error('[background] join-sync-group error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'leave-sync-group': {
        leaveSyncGroup()
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error('[background] leave-sync-group error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      // -- Export / Import / Cleanup messages --

      case 'export-json': {
        exportAsJson()
          .then((json) => sendResponse({ ok: true, data: json }))
          .catch((err) => {
            console.error('[background] export-json error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'export-csv': {
        exportAsCsv()
          .then((csv) => sendResponse({ ok: true, data: csv }))
          .catch((err) => {
            console.error('[background] export-csv error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'import-json': {
        const { json } = (data ?? {}) as { json: string };
        importFromJson(json)
          .then((result) => sendResponse({ ok: true, data: result }))
          .catch((err) => {
            console.error('[background] import-json error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'clear-history': {
        db.deleteOldEntries(0)
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error('[background] clear-history error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'get-retention': {
        getRetentionDays()
          .then((days) => sendResponse({ ok: true, data: days }))
          .catch((err) => {
            console.error('[background] get-retention error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      case 'set-retention': {
        const { days } = (data ?? {}) as { days: number };
        setRetentionDays(days)
          .then(() => sendResponse({ ok: true }))
          .catch((err) => {
            console.error('[background] set-retention error:', err);
            sendResponse({ ok: false, error: String(err) });
          });
        return true;
      }

      default:
        // Unknown type — let other listeners handle it (e.g. db-request
        // messages handled by the offscreen document).
        return;
    }
  });
});

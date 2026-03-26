/**
 * Web Worker that runs wa-sqlite with runtime VFS selection:
 *   - AccessHandlePoolVFS (OPFS) on Chrome/Edge
 *   - IDBBatchAtomicVFS (IndexedDB) on Firefox/Safari
 *
 * Communication: offscreen document (Chrome) or direct postMessage
 * from the background script (Firefox) ↔ this worker.
 */

import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import * as SQLite from 'wa-sqlite';
import { SCHEMA_STATEMENTS } from './schema';
import type {
  DbRequest,
  DbResponse,
  BrowsingHistoryEntry,
  BrowsingHistoryInput,
  InsertHistoryParams,
  GetRecentHistoryParams,
  MarkSyncedParams,
  InsertSyncedEntriesParams,
  UpdateDurationParams,
  GetConfigParams,
  SetConfigParams,
  DeleteOldEntriesParams,
  SearchHistoryParams,
} from './types';

const DB_NAME = 'youtube-history.db';

/** SQLite open flags: create + read/write. */
const OPEN_FLAGS = 0x00000006; // SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE

let sqlite3: SQLiteAPI;
let db: number;

/** Whether the database is persisted or running in-memory only. */
let persistenceMode: 'opfs' | 'indexeddb' | 'memory' = 'memory';

/** Column names from the browsing_history table in SELECT * order. */
const HISTORY_COLUMNS: (keyof BrowsingHistoryEntry)[] = [
  'id', 'url', 'page_type', 'title', 'video_id', 'channel_name',
  'channel_id', 'search_query', 'thumbnail_url', 'visited_at',
  'duration_seconds', 'device_id', 'synced_at', 'created_at',
];

// ---- Helpers ----

function rowToEntry(row: unknown[]): BrowsingHistoryEntry {
  const entry: Record<string, unknown> = {};
  for (let i = 0; i < HISTORY_COLUMNS.length; i++) {
    entry[HISTORY_COLUMNS[i]] = row[i] ?? null;
  }
  return entry as unknown as BrowsingHistoryEntry;
}

async function execQuery(sql: string, callback?: (row: Array<unknown>, columns: string[]) => void): Promise<void> {
  await sqlite3.exec(db, sql, callback as Parameters<SQLiteAPI['exec']>[2]);
}

async function collectRows(sql: string): Promise<BrowsingHistoryEntry[]> {
  const rows: BrowsingHistoryEntry[] = [];
  await execQuery(sql, (row) => {
    rows.push(rowToEntry(row));
  });
  return rows;
}

function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${escapeString(String(value))}'`;
}

// ---- DB Operations ----

async function insertHistory(params: InsertHistoryParams): Promise<void> {
  const e = params.entry;
  const sql = `INSERT OR REPLACE INTO browsing_history
    (id, url, page_type, title, video_id, channel_name, channel_id,
     search_query, thumbnail_url, visited_at, duration_seconds, device_id, synced_at)
    VALUES (
      ${sqlValue(e.id)}, ${sqlValue(e.url)}, ${sqlValue(e.page_type)},
      ${sqlValue(e.title)}, ${sqlValue(e.video_id)}, ${sqlValue(e.channel_name)},
      ${sqlValue(e.channel_id)}, ${sqlValue(e.search_query)}, ${sqlValue(e.thumbnail_url)},
      ${sqlValue(e.visited_at)}, ${sqlValue(e.duration_seconds)}, ${sqlValue(e.device_id)},
      ${sqlValue(e.synced_at)}
    );`;
  await execQuery(sql);
}

async function getRecentHistory(params: GetRecentHistoryParams): Promise<BrowsingHistoryEntry[]> {
  return collectRows(
    `SELECT * FROM browsing_history ORDER BY visited_at DESC LIMIT ${params.limit} OFFSET ${params.offset};`
  );
}

async function getUnsyncedEntries(): Promise<BrowsingHistoryEntry[]> {
  return collectRows(
    `SELECT * FROM browsing_history WHERE synced_at IS NULL ORDER BY visited_at ASC;`
  );
}

async function markSynced(params: MarkSyncedParams): Promise<void> {
  if (params.ids.length === 0) return;
  const idList = params.ids.map((id) => sqlValue(id)).join(',');
  await execQuery(
    `UPDATE browsing_history SET synced_at = ${params.timestamp} WHERE id IN (${idList});`
  );
}

async function insertSyncedEntries(params: InsertSyncedEntriesParams): Promise<void> {
  for (const e of params.entries) {
    const sql = `INSERT OR IGNORE INTO browsing_history
      (id, url, page_type, title, video_id, channel_name, channel_id,
       search_query, thumbnail_url, visited_at, duration_seconds, device_id, synced_at)
      VALUES (
        ${sqlValue(e.id)}, ${sqlValue(e.url)}, ${sqlValue(e.page_type)},
        ${sqlValue(e.title)}, ${sqlValue(e.video_id)}, ${sqlValue(e.channel_name)},
        ${sqlValue(e.channel_id)}, ${sqlValue(e.search_query)}, ${sqlValue(e.thumbnail_url)},
        ${sqlValue(e.visited_at)}, ${sqlValue(e.duration_seconds)}, ${sqlValue(e.device_id)},
        ${sqlValue(e.synced_at)}
      );`;
    await execQuery(sql);
  }
}

async function updateDuration(params: UpdateDurationParams): Promise<void> {
  await execQuery(
    `UPDATE browsing_history SET duration_seconds = ${params.durationSeconds} WHERE id = ${sqlValue(params.id)};`
  );
}

async function getConfig(params: GetConfigParams): Promise<string | null> {
  let result: string | null = null;
  await execQuery(
    `SELECT value FROM device_config WHERE key = ${sqlValue(params.key)};`,
    (row) => { result = row[0] as string; }
  );
  return result;
}

async function setConfig(params: SetConfigParams): Promise<void> {
  await execQuery(
    `INSERT OR REPLACE INTO device_config (key, value) VALUES (${sqlValue(params.key)}, ${sqlValue(params.value)});`
  );
}

async function deleteOldEntries(params: DeleteOldEntriesParams): Promise<number> {
  const cutoff = Date.now() - params.maxAgeDays * 24 * 60 * 60 * 1000;
  await execQuery(
    `DELETE FROM browsing_history WHERE visited_at < ${cutoff};`
  );
  return sqlite3.changes(db);
}

async function getAllHistory(): Promise<BrowsingHistoryEntry[]> {
  return collectRows(`SELECT * FROM browsing_history ORDER BY visited_at DESC;`);
}

async function getHistoryCount(): Promise<number> {
  let count = 0;
  await execQuery('SELECT COUNT(*) FROM browsing_history;', (row) => {
    count = row[0] as number;
  });
  return count;
}

async function searchHistory(params: SearchHistoryParams): Promise<BrowsingHistoryEntry[]> {
  const term = `%${escapeString(params.query)}%`;
  return collectRows(
    `SELECT * FROM browsing_history WHERE title LIKE '${term}' OR url LIKE '${term}' ORDER BY visited_at DESC LIMIT 100;`
  );
}

// ---- Operation dispatch ----

async function handleOperation(operation: string, params: unknown): Promise<unknown> {
  switch (operation) {
    case 'insertHistory':
      await insertHistory(params as InsertHistoryParams);
      return null;
    case 'getRecentHistory':
      return getRecentHistory(params as GetRecentHistoryParams);
    case 'getUnsyncedEntries':
      return getUnsyncedEntries();
    case 'markSynced':
      await markSynced(params as MarkSyncedParams);
      return null;
    case 'insertSyncedEntries':
      await insertSyncedEntries(params as InsertSyncedEntriesParams);
      return null;
    case 'updateDuration':
      await updateDuration(params as UpdateDurationParams);
      return null;
    case 'getConfig':
      return getConfig(params as GetConfigParams);
    case 'setConfig':
      await setConfig(params as SetConfigParams);
      return null;
    case 'deleteOldEntries':
      return deleteOldEntries(params as DeleteOldEntriesParams);
    case 'getAllHistory':
      return getAllHistory();
    case 'getHistoryCount':
      return getHistoryCount();
    case 'searchHistory':
      return searchHistory(params as SearchHistoryParams);
    case 'getPersistenceMode':
      return persistenceMode;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ---- Message handler ----

self.onmessage = async (event: MessageEvent<DbRequest>) => {
  const { requestId, operation, params } = event.data;
  let response: DbResponse;
  try {
    const data = await handleOperation(operation, params);
    response = { type: 'db-response', requestId, ok: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response = { type: 'db-response', requestId, ok: false, error: message };
  }
  self.postMessage(response);
};

// ---- Initialization ----

/**
 * Attempt to open the database and run schema migrations with a specific
 * VFS by name.  Returns true on success, false on failure.
 * Uses a local handle to avoid corrupting the module-level `db` on failure.
 *
 * @param vfsLabel Human-readable label for logging.
 * @param vfsName  The registered VFS name to pass to sqlite3_open_v2.
 *                 If omitted, the built-in default (in-memory) VFS is used.
 */
async function tryOpenAndMigrate(vfsLabel: string, vfsName?: string): Promise<boolean> {
  let handle: number | undefined;
  try {
    handle = await sqlite3.open_v2(DB_NAME, OPEN_FLAGS, vfsName);
    for (const sql of SCHEMA_STATEMENTS) {
      await sqlite3.exec(handle, sql);
    }
    db = handle; // commit to module-level db only on success
    return true;
  } catch (err) {
    console.warn(`[db-worker] open/migrate failed with ${vfsLabel}:`, err);
    if (handle !== undefined) {
      try { sqlite3.close(handle); } catch { /* ignore */ }
    }
    return false;
  }
}

async function initDatabase(): Promise<void> {
  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);

  // Try VFS options in priority order.  Each attempt registers the VFS
  // (without making it the global default), opens the database by name,
  // and runs schema migrations.  If any step fails the next VFS is tried.
  // If all persistent options fail, the built-in in-memory VFS is used.

  // 1. OPFS AccessHandlePoolVFS (Chrome/Edge — fast, synchronous file access)
  try {
    await navigator.storage.getDirectory();
    const { AccessHandlePoolVFS } = await import(
      'wa-sqlite/src/examples/AccessHandlePoolVFS.js'
    );
    const vfs = new AccessHandlePoolVFS('youtube-history-vfs');
    await vfs.isReady;
    sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
    if (await tryOpenAndMigrate('AccessHandlePoolVFS', vfs.name)) {
      persistenceMode = 'opfs';
      console.log('[db-worker] Using AccessHandlePoolVFS (OPFS)');
      return signalReady();
    }
  } catch {
    // OPFS not available — continue to next option
  }

  // 2. IDBBatchAtomicVFS (IndexedDB — batch atomic writes)
  // Skip IndexedDB-based VFS entirely if IndexedDB is unavailable
  // (e.g. Private Browsing in Firefox/Mullvad Browser).
  const idbAvailable = typeof indexedDB !== 'undefined' && indexedDB !== null;

  if (idbAvailable) {
    try {
      const { IDBBatchAtomicVFS } = await import(
        'wa-sqlite/src/examples/IDBBatchAtomicVFS.js'
      );
      const vfs = new IDBBatchAtomicVFS('youtube-history-idb');
      sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
      if (await tryOpenAndMigrate('IDBBatchAtomicVFS', vfs.name)) {
        persistenceMode = 'indexeddb';
        console.log('[db-worker] Using IDBBatchAtomicVFS (IndexedDB)');
        return signalReady();
      }
    } catch (e) {
      console.warn('[db-worker] IDBBatchAtomicVFS failed:', e);
    }

    // 3. IDBMinimalVFS (IndexedDB — simpler, avoids block0 null bug in wa-sqlite <=1.0)
    try {
      const { IDBMinimalVFS } = await import(
        'wa-sqlite/src/examples/IDBMinimalVFS.js'
      );
      const vfs = new IDBMinimalVFS('youtube-history-idb-min');
      sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
      if (await tryOpenAndMigrate('IDBMinimalVFS', vfs.name)) {
        persistenceMode = 'indexeddb';
        console.log('[db-worker] Using IDBMinimalVFS (IndexedDB)');
        return signalReady();
      }
    } catch (e) {
      console.warn('[db-worker] IDBMinimalVFS failed:', e);
    }
  } else {
    console.warn('[db-worker] IndexedDB not available — skipping IDB VFS options');
  }

  // 4. Default in-memory VFS (no persistence)
  // Open without specifying a VFS name so SQLite uses its built-in default,
  // which is always available regardless of what was registered above.
  console.warn('[db-worker] No persistent VFS available, using default memory VFS');
  persistenceMode = 'memory';
  db = await sqlite3.open_v2(DB_NAME);
  for (const sql of SCHEMA_STATEMENTS) {
    await sqlite3.exec(db, sql);
  }
  signalReady();
}

function signalReady(): void {
  console.log(`[db-worker] Database initialized (persistence: ${persistenceMode})`);
  self.postMessage({
    type: 'db-response',
    requestId: '__init__',
    ok: true,
    data: { persistenceMode },
  } satisfies DbResponse);
}

initDatabase().catch((err) => {
  console.error('[db-worker] Failed to initialize database:', err);
  self.postMessage({
    type: 'db-response',
    requestId: '__init__',
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  } satisfies DbResponse);
});

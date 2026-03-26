/** Browsing history record stored in local SQLite database. */
export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  page_type: string;
  title: string | null;
  video_id: string | null;
  channel_name: string | null;
  channel_id: string | null;
  search_query: string | null;
  thumbnail_url: string | null;
  visited_at: number;
  duration_seconds: number | null;
  device_id: string;
  synced_at: number | null;
  created_at: number;
}

/** Input for inserting a new browsing history entry (created_at is auto-set). */
export type BrowsingHistoryInput = Omit<BrowsingHistoryEntry, 'created_at'>;

/** Device configuration key-value pair. */
export interface DeviceConfig {
  key: string;
  value: string;
}

// ---- Message protocol between background ↔ offscreen ↔ worker ----

/** All supported DB operations. */
export type DbOperation =
  | 'insertHistory'
  | 'getRecentHistory'
  | 'getUnsyncedEntries'
  | 'markSynced'
  | 'insertSyncedEntries'
  | 'updateDuration'
  | 'getConfig'
  | 'setConfig'
  | 'deleteOldEntries'
  | 'getAllHistory'
  | 'getHistoryCount'
  | 'searchHistory'
  | 'getPersistenceMode';

/** A request message sent to the DB worker/offscreen document. */
export interface DbRequest {
  type: 'db-request';
  requestId: string;
  operation: DbOperation;
  params: unknown;
}

/** A successful response from the DB worker/offscreen document. */
export interface DbResponseSuccess {
  type: 'db-response';
  requestId: string;
  ok: true;
  data: unknown;
}

/** An error response from the DB worker/offscreen document. */
export interface DbResponseError {
  type: 'db-response';
  requestId: string;
  ok: false;
  error: string;
}

export type DbResponse = DbResponseSuccess | DbResponseError;

// ---- Parameter types for each operation ----

export interface InsertHistoryParams {
  entry: BrowsingHistoryInput;
}

export interface GetRecentHistoryParams {
  limit: number;
  offset: number;
}

export interface MarkSyncedParams {
  ids: string[];
  timestamp: number;
}

export interface InsertSyncedEntriesParams {
  entries: BrowsingHistoryInput[];
}

export interface UpdateDurationParams {
  id: string;
  durationSeconds: number;
}

export interface GetConfigParams {
  key: string;
}

export interface SetConfigParams {
  key: string;
  value: string;
}

export interface DeleteOldEntriesParams {
  maxAgeDays: number;
}

export interface SearchHistoryParams {
  query: string;
}

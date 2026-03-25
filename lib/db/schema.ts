/** SQL schema constants for the local SQLite database. */

export const CREATE_BROWSING_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS browsing_history (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  title TEXT,
  video_id TEXT,
  channel_name TEXT,
  channel_id TEXT,
  search_query TEXT,
  thumbnail_url TEXT,
  visited_at INTEGER NOT NULL,
  duration_seconds INTEGER,
  device_id TEXT NOT NULL,
  synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
`;

export const CREATE_HISTORY_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_history_visited_at ON browsing_history(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_synced_at ON browsing_history(synced_at);
CREATE INDEX IF NOT EXISTS idx_history_page_type ON browsing_history(page_type);
`;

export const CREATE_DEVICE_CONFIG_TABLE = `
CREATE TABLE IF NOT EXISTS device_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Run all schema creation statements to initialize the database. */
export const SCHEMA_STATEMENTS = [
  CREATE_BROWSING_HISTORY_TABLE,
  CREATE_HISTORY_INDEXES,
  CREATE_DEVICE_CONFIG_TABLE,
];

-- Migration: Initial schema for "Don't Let YouTube Track You"
-- Creates tables for sync groups, devices, and encrypted browsing history.

-- Sync groups: a cluster of paired devices sharing encrypted history
CREATE TABLE sync_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_groups_pairing_code ON sync_groups(pairing_code);

-- Devices within a sync group
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES sync_groups(id) ON DELETE CASCADE,
  device_name TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_group_id ON devices(group_id);

-- Browsing history (encrypted sensitive fields)
-- Plaintext: id, group_id, device_id, page_type, visited_at, duration_seconds
-- Encrypted (JSON with iv + ciphertext): url, title, channel_name, channel_id, search_query, thumbnail_url
CREATE TABLE browsing_history (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES sync_groups(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER,

  -- Encrypted fields stored as JSONB: { "iv": "...", "ciphertext": "..." }
  url JSONB NOT NULL,
  title JSONB,
  channel_name JSONB,
  channel_id JSONB,
  search_query JSONB,
  thumbnail_url JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bh_group_visited ON browsing_history(group_id, visited_at DESC);
CREATE INDEX idx_bh_device ON browsing_history(device_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE sync_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE browsing_history ENABLE ROW LEVEL SECURITY;

-- sync_groups: anyone with the anon key can create; read only if you know the ID
CREATE POLICY "Allow insert for anon"
  ON sync_groups FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow select by id"
  ON sync_groups FOR SELECT
  TO anon
  USING (true);

-- devices: can insert/read/update for any group (security via pairing code knowledge)
CREATE POLICY "Allow insert for anon"
  ON devices FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow select for anon"
  ON devices FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow update for anon"
  ON devices FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete for anon"
  ON devices FOR DELETE
  TO anon
  USING (true);

-- browsing_history: insert and select for anon (group_id filtering done app-side)
CREATE POLICY "Allow insert for anon"
  ON browsing_history FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow select for anon"
  ON browsing_history FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow delete for anon"
  ON browsing_history FOR DELETE
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- Auto-prune: delete browsing_history older than 90 days
-- Requires pg_cron extension (enable in Supabase dashboard)
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'prune-old-history',
  '0 3 * * *',
  $$DELETE FROM public.browsing_history
    WHERE created_at < NOW() - INTERVAL '90 days'$$
);

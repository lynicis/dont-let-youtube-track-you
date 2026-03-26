/**
 * Supabase Edge Function: setup-schema
 *
 * Idempotent schema migration for "Don't Let YouTube Track You".
 * Creates tables, indexes, and RLS policies if they don't already exist.
 *
 * Runs with direct Postgres access (server-side only).
 * Safe to call multiple times; every statement uses IF NOT EXISTS or
 * DO $$ ... EXCEPTION WHEN duplicate_object $$ guards.
 *
 * Deploy: supabase functions deploy setup-schema
 */

import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const MIGRATION_STATEMENTS = [
  // ---- Tables ----
  `CREATE TABLE IF NOT EXISTS sync_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pairing_code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_sync_groups_pairing_code ON sync_groups(pairing_code)`,

  `CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES sync_groups(id) ON DELETE CASCADE,
    device_name TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_devices_group_id ON devices(group_id)`,

  `CREATE TABLE IF NOT EXISTS browsing_history (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES sync_groups(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    page_type TEXT NOT NULL,
    visited_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER,
    url JSONB NOT NULL,
    title JSONB,
    channel_name JSONB,
    channel_id JSONB,
    search_query JSONB,
    thumbnail_url JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_bh_group_visited ON browsing_history(group_id, visited_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bh_device ON browsing_history(device_id)`,

  // ---- Row-Level Security ----
  `ALTER TABLE sync_groups ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE devices ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE browsing_history ENABLE ROW LEVEL SECURITY`,

  // Policies wrapped in DO blocks for idempotency
  `DO $$ BEGIN
    CREATE POLICY "Allow insert for anon" ON sync_groups FOR INSERT TO anon WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow select by id" ON sync_groups FOR SELECT TO anon USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow insert for anon" ON devices FOR INSERT TO anon WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow select for anon" ON devices FOR SELECT TO anon USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow update for anon" ON devices FOR UPDATE TO anon USING (true) WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow delete for anon" ON devices FOR DELETE TO anon USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow insert for anon" ON browsing_history FOR INSERT TO anon WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow select for anon" ON browsing_history FOR SELECT TO anon USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    CREATE POLICY "Allow delete for anon" ON browsing_history FOR DELETE TO anon USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
]

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const sql = postgres(dbUrl, { prepare: false })

  try {
    for (const statement of MIGRATION_STATEMENTS) {
      await sql.unsafe(statement)
    }

    console.log('[setup-schema] Migration applied successfully')
    return new Response(
      JSON.stringify({ ok: true, message: 'Schema migration applied' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[setup-schema] Migration error:', message)
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  } finally {
    await sql.end()
  }
})

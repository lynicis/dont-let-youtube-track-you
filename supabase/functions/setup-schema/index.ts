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

  // Remove every policy the old client relied on.
  `DROP POLICY IF EXISTS "Allow insert for anon" ON sync_groups`,
  `DROP POLICY IF EXISTS "Allow select by id" ON sync_groups`,
  `DROP POLICY IF EXISTS "Allow insert for anon" ON devices`,
  `DROP POLICY IF EXISTS "Allow select for anon" ON devices`,
  `DROP POLICY IF EXISTS "Allow update for anon" ON devices`,
  `DROP POLICY IF EXISTS "Allow delete for anon" ON devices`,
  `DROP POLICY IF EXISTS "Allow insert for anon" ON browsing_history`,
  `DROP POLICY IF EXISTS "Allow select for anon" ON browsing_history`,
  `DROP POLICY IF EXISTS "Allow delete for anon" ON browsing_history`,

  // Keep only what the sync engine needs directly.
  `CREATE POLICY "Allow select for anon" ON devices
    FOR SELECT TO anon USING (true)`,
  `CREATE POLICY "Allow insert for anon" ON browsing_history
    FOR INSERT TO anon WITH CHECK (true)`,
  `CREATE POLICY "Allow select for anon" ON browsing_history
    FOR SELECT TO anon USING (true)`,

  // Create a group and register the first device atomically.
  `CREATE OR REPLACE FUNCTION public.create_sync_group(
    p_code text,
    p_device_id uuid,
    p_device_name text
  ) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_group_id uuid;
  BEGIN
    p_code := upper(trim(p_code));

    BEGIN
      INSERT INTO sync_groups (pairing_code) VALUES (p_code)
      RETURNING id INTO v_group_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'code_taken');
    END;

    INSERT INTO devices (id, group_id, device_name)
    VALUES (p_device_id, v_group_id, p_device_name)
    ON CONFLICT (id) DO UPDATE
      SET group_id = EXCLUDED.group_id,
          device_name = EXCLUDED.device_name,
          last_seen_at = now();

    RETURN jsonb_build_object('ok', true, 'group_id', v_group_id);
  END;
  $$`,

  `CREATE OR REPLACE FUNCTION public.join_sync_group(
    p_code text,
    p_device_id uuid,
    p_device_name text,
    p_has_license boolean
  ) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_group_id uuid;
    v_count bigint;
  BEGIN
    p_code := upper(trim(p_code));

    SELECT id INTO v_group_id FROM sync_groups WHERE pairing_code = p_code;
    IF v_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(v_group_id::text)::bigint);

    SELECT count(*) INTO v_count
    FROM devices
    WHERE group_id = v_group_id AND id <> p_device_id;

    IF coalesce(p_has_license, false) = false AND v_count >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'device_limit');
    END IF;

    INSERT INTO devices (id, group_id, device_name)
    VALUES (p_device_id, v_group_id, p_device_name)
    ON CONFLICT (id) DO UPDATE
      SET group_id = EXCLUDED.group_id,
          device_name = EXCLUDED.device_name,
          last_seen_at = now();

    RETURN jsonb_build_object('ok', true, 'group_id', v_group_id);
  END;
  $$`,

  `CREATE OR REPLACE FUNCTION public.clear_device_history(
    p_code text,
    p_device_id uuid
  ) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_group_id uuid;
    v_deleted bigint;
  BEGIN
    p_code := upper(trim(p_code));

    SELECT id INTO v_group_id FROM sync_groups WHERE pairing_code = p_code;
    IF v_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    DELETE FROM browsing_history
    WHERE group_id = v_group_id AND device_id = p_device_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
  END;
  $$`,

  `GRANT EXECUTE ON FUNCTION public.create_sync_group(text, uuid, text) TO anon`,
  `GRANT EXECUTE ON FUNCTION public.join_sync_group(text, uuid, text, boolean) TO anon`,
  `GRANT EXECUTE ON FUNCTION public.clear_device_history(text, uuid) TO anon`,

  // Remove the old 90-day remote prune (finding 9).
  `DO $$
  BEGIN
    IF to_regclass('cron.job') IS NOT NULL THEN
      DELETE FROM cron.job WHERE jobname = 'prune-old-history';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END $$`,
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

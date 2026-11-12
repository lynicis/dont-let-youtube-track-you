-- Removes anonymous access to pairing codes and blanket deletes.
-- Keeps the existing 6-character codes and existing groups working.

ALTER TABLE sync_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE browsing_history ENABLE ROW LEVEL SECURITY;

-- Drop every policy the old client relied on.
DROP POLICY IF EXISTS "Allow insert for anon" ON sync_groups;
DROP POLICY IF EXISTS "Allow select by id" ON sync_groups;
DROP POLICY IF EXISTS "Allow insert for anon" ON devices;
DROP POLICY IF EXISTS "Allow select for anon" ON devices;
DROP POLICY IF EXISTS "Allow update for anon" ON devices;
DROP POLICY IF EXISTS "Allow delete for anon" ON devices;
DROP POLICY IF EXISTS "Allow insert for anon" ON browsing_history;
DROP POLICY IF EXISTS "Allow select for anon" ON browsing_history;
DROP POLICY IF EXISTS "Allow delete for anon" ON browsing_history;

-- Keep only what the sync engine needs directly.
CREATE POLICY "Allow select for anon" ON devices
  FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon" ON browsing_history
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow select for anon" ON browsing_history
  FOR SELECT TO anon USING (true);

-- Create a group and register the first device atomically.
CREATE OR REPLACE FUNCTION public.create_sync_group(
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
$$;

-- Look up a group by code, enforce the free cap without a race, and
-- register the device in one transaction. The cap is soft because
-- p_has_license comes from the client.
CREATE OR REPLACE FUNCTION public.join_sync_group(
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

  -- Serialize joins for this group so the cap check cannot race.
  PERFORM pg_advisory_xact_lock(hashtext(v_group_id::text)::bigint);

  SELECT count(*) INTO v_count
  FROM devices
  WHERE group_id = v_group_id AND id <> p_device_id;

  -- Keep the 3 in sync with FREE_DEVICE_LIMIT in lib/licensing/types.ts.
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
$$;

-- Delete only the rows uploaded by one device, after proving knowledge
-- of the pairing code.
CREATE OR REPLACE FUNCTION public.clear_device_history(
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
$$;

GRANT EXECUTE ON FUNCTION public.create_sync_group(text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_sync_group(text, uuid, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.clear_device_history(text, uuid) TO anon;

-- Remove the old 90-day remote prune (finding 9).
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    DELETE FROM cron.job WHERE jobname = 'prune-old-history';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

/**
 * Device pairing — create/join/leave sync groups via Supabase.
 *
 * A "sync group" is a set of devices that share encrypted browsing
 * history. The first device creates a group and receives a 6-char
 * alphanumeric pairing code; other devices join by entering that code.
 */

import { getSupabaseClient } from './supabase-client';
import { getOrCreateDeviceId } from '../background/history-handler';
import { ensureRemoteSchema } from './migrations';
import * as db from '../db/client';
import { getLicenseState, deactivateKey } from '../licensing/license-manager';
import { FREE_DEVICE_LIMIT } from '../licensing/types';

// Characters used for pairing codes.
// Ambiguous characters (0/O, 1/I/L) are excluded to avoid typos.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Result shape returned by the security-definer group RPCs. */
type GroupRpcResult = { ok: boolean; error?: string; group_id?: string };

/**
 * Generate a random 6-character alphanumeric pairing code.
 * Uses `crypto.getRandomValues` for secure randomness.
 */
export function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/**
 * Derive a human-readable device name from the current user agent string.
 * Returns something like "Chrome on macOS" or "Firefox on Windows".
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent;

  // Detect browser
  let browser = 'Unknown Browser';
  if (ua.includes('Firefox/')) {
    browser = 'Firefox';
  } else if (ua.includes('Edg/')) {
    browser = 'Edge';
  } else if (ua.includes('Chrome/')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browser = 'Safari';
  }

  // Detect OS
  let os = 'Unknown OS';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
    os = 'macOS';
  } else if (ua.includes('Windows')) {
    os = 'Windows';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
  } else if (ua.includes('CrOS')) {
    os = 'ChromeOS';
  }

  return `${browser} on ${os}`;
}

/**
 * Create a new sync group. The current device becomes the first member.
 *
 * Steps:
 * 1. Generate a unique pairing code.
 * 2. Insert a `sync_groups` row in Supabase.
 * 3. Register this device in the `devices` table.
 * 4. Persist `group_id` and `pairing_code` in local config.
 */
export async function createSyncGroup(): Promise<{
  groupId: string;
  pairingCode: string;
  deviceId: string;
}> {
  // Ensure remote Supabase tables and RPCs exist before creating rows
  await ensureRemoteSchema();

  const supabase = getSupabaseClient();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();

  for (let attempt = 0; attempt < 5; attempt++) {
    const pairingCode = generatePairingCode();

    const { data, error } = await supabase.rpc('create_sync_group', {
      p_code: pairingCode,
      p_device_id: deviceId,
      p_device_name: deviceName,
    });

    if (error) {
      throw new Error(`Failed to create sync group: ${error.message}`);
    }

    const result = data as GroupRpcResult | null;
    if (result?.ok && result.group_id) {
      const groupId = result.group_id;

      // New group → start pulling from the beginning.
      await Promise.all([
        db.setConfig('group_id', groupId),
        db.setConfig('pairing_code', pairingCode),
        db.setConfig('last_pull_at', ''),
        db.setConfig('last_pull_id', ''),
      ]);

      return { groupId, pairingCode, deviceId };
    }

    if (result?.error !== 'code_taken') {
      throw new Error(`Failed to create sync group: ${result?.error ?? 'unknown error'}`);
    }
  }

  throw new Error('Failed to create sync group: could not allocate a unique code.');
}

/**
 * Join an existing sync group using a pairing code.
 *
 * Steps:
 * 1. Look up the group by pairing code.
 * 2. Register this device in the `devices` table.
 * 3. Persist `group_id` and `pairing_code` in local config.
 */
export async function joinSyncGroup(code: string): Promise<{
  groupId: string;
  deviceId: string;
}> {
  // Ensure remote Supabase tables and RPCs exist before querying
  await ensureRemoteSchema();

  const supabase = getSupabaseClient();
  const normalizedCode = code.trim().toUpperCase();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();
  const license = await getLicenseState();

  const { data, error } = await supabase.rpc('join_sync_group', {
    p_code: normalizedCode,
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_has_license: license.status === 'active',
  });

  if (error) {
    throw new Error(`Failed to join sync group: ${error.message}`);
  }

  const result = data as GroupRpcResult | null;
  if (result?.ok && result.group_id) {
    const groupId = result.group_id;

    // New group → start pulling from the beginning.
    await Promise.all([
      db.setConfig('group_id', groupId),
      db.setConfig('pairing_code', normalizedCode),
      db.setConfig('last_pull_at', ''),
      db.setConfig('last_pull_id', ''),
    ]);

    return { groupId, deviceId };
  }

  if (result?.error === 'not_found') {
    throw new Error('Sync group not found. Check the pairing code and try again.');
  }
  if (result?.error === 'device_limit') {
    throw new Error(
      `Free plan supports up to ${FREE_DEVICE_LIMIT} devices. Upgrade to Pro Sync to add more.`,
    );
  }
  throw new Error(`Failed to join sync group: ${result?.error ?? 'unknown error'}`);
}

/**
 * Leave the current sync group.
 *
 * Keeps the remote device row and its history (other devices keep seeing
 * their own history) and clears local pairing config and pull cursors.
 */
export async function leaveSyncGroup(): Promise<void> {
  // Deactivate license if active (frees the activation slot)
  try {
    await deactivateKey();
  } catch (err) {
    console.error('[pairing] license deactivation on leave failed:', err);
  }

  // Clear local pairing state; the next group starts from the beginning.
  await Promise.all([
    db.setConfig('group_id', ''),
    db.setConfig('pairing_code', ''),
    db.setConfig('last_pull_at', ''),
    db.setConfig('last_pull_id', ''),
  ]);
}

/**
 * Get the current sync/pairing status including all devices in the group.
 */
export async function getSyncStatus(): Promise<{
  isPaired: boolean;
  groupId: string | null;
  pairingCode: string | null;
  deviceCount: number;
  devices: Array<{ id: string; name: string; lastSeen: string }>;
}> {
  const groupId = await db.getConfig('group_id');
  const pairingCode = await db.getConfig('pairing_code');

  // Not paired — return early
  if (!groupId) {
    return {
      isPaired: false,
      groupId: null,
      pairingCode: null,
      deviceCount: 0,
      devices: [],
    };
  }

  const supabase = getSupabaseClient();
  const { data: devices } = await supabase
    .from('devices')
    .select('id, device_name, last_seen_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  const deviceList = (devices ?? []).map((d) => ({
    id: d.id as string,
    name: (d.device_name ?? 'Unknown Device') as string,
    lastSeen: d.last_seen_at as string,
  }));

  return {
    isPaired: true,
    groupId: groupId || null,
    pairingCode: pairingCode || null,
    deviceCount: deviceList.length,
    devices: deviceList,
  };
}

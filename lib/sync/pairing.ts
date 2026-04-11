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
  // Ensure remote Supabase tables exist before inserting rows
  await ensureRemoteSchema();

  const supabase = getSupabaseClient();
  const pairingCode = generatePairingCode();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();

  // Create the sync group
  const { data: group, error: groupError } = await supabase
    .from('sync_groups')
    .insert({ pairing_code: pairingCode })
    .select('id')
    .single();

  if (groupError || !group) {
    throw new Error(`Failed to create sync group: ${groupError?.message ?? 'no data returned'}`);
  }

  const groupId: string = group.id;

  // Register this device in the group
  const { error: deviceError } = await supabase.from('devices').insert({
    id: deviceId,
    group_id: groupId,
    device_name: deviceName,
  });

  if (deviceError) {
    throw new Error(`Failed to register device: ${deviceError.message}`);
  }

  // Persist locally
  await db.setConfig('group_id', groupId);
  await db.setConfig('pairing_code', pairingCode);

  return { groupId, pairingCode, deviceId };
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
  // Ensure remote Supabase tables exist before querying
  await ensureRemoteSchema();

  const supabase = getSupabaseClient();
  const normalizedCode = code.trim().toUpperCase();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();

  // Look up the group
  const { data: group, error: lookupError } = await supabase
    .from('sync_groups')
    .select('id')
    .eq('pairing_code', normalizedCode)
    .single();

  if (lookupError || !group) {
    throw new Error('Sync group not found. Check the pairing code and try again.');
  }

  const groupId: string = group.id;

  // Check device count against free tier limit
  const { data: existingDevices } = await supabase
    .from('devices')
    .select('id')
    .eq('group_id', groupId);

  const currentCount = existingDevices?.length ?? 0;

  if (currentCount >= FREE_DEVICE_LIMIT) {
    const license = await getLicenseState();
    if (license.status !== 'active') {
      throw new Error(
        `Free plan supports up to ${FREE_DEVICE_LIMIT} devices. Upgrade to Pro Sync to add more.`,
      );
    }
  }

  // Register this device
  const { error: deviceError } = await supabase.from('devices').insert({
    id: deviceId,
    group_id: groupId,
    device_name: deviceName,
  });

  if (deviceError) {
    throw new Error(`Failed to register device: ${deviceError.message}`);
  }

  // Persist locally
  await db.setConfig('group_id', groupId);
  await db.setConfig('pairing_code', normalizedCode);

  return { groupId, deviceId };
}

/**
 * Leave the current sync group.
 *
 * Removes this device from Supabase and clears local pairing config.
 */
export async function leaveSyncGroup(): Promise<void> {
  const supabase = getSupabaseClient();
  const deviceId = await db.getConfig('device_id');
  const groupId = await db.getConfig('group_id');

  if (deviceId && groupId) {
    await supabase.from('devices').delete().eq('id', deviceId).eq('group_id', groupId);
  }

  // Deactivate license if active (frees the activation slot)
  try {
    await deactivateKey();
  } catch (err) {
    console.error('[pairing] license deactivation on leave failed:', err);
  }

  // Clear local pairing state
  await db.setConfig('group_id', '');
  await db.setConfig('pairing_code', '');
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

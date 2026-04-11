/**
 * License manager — business logic for Pro Sync licensing.
 *
 * Stores license state in local device_config (key-value).
 * Validates against LemonSqueezy periodically.
 */

import * as db from '../db/client';
import { activateLicense, validateLicense, deactivateLicense } from './license-client';
import type { LicenseState, LicenseTier, LicenseStatus } from './types';
import { FREE_DEVICE_LIMIT, LICENSE_VALIDATE_INTERVAL_MS } from './types';

// Config keys
const KEY_LICENSE_KEY = 'license_key';
const KEY_INSTANCE_ID = 'license_instance_id';
const KEY_LICENSE_STATUS = 'license_status';
const KEY_LICENSE_TIER = 'license_tier';
const KEY_VALIDATED_AT = 'license_validated_at';
const KEY_EXPIRES_AT = 'license_expires_at';

/**
 * Read the full license state from local storage.
 */
export async function getLicenseState(): Promise<LicenseState> {
  const [key, instanceId, status, tier, validatedAt, expiresAt] =
    await Promise.all([
      db.getConfig(KEY_LICENSE_KEY),
      db.getConfig(KEY_INSTANCE_ID),
      db.getConfig(KEY_LICENSE_STATUS),
      db.getConfig(KEY_LICENSE_TIER),
      db.getConfig(KEY_VALIDATED_AT),
      db.getConfig(KEY_EXPIRES_AT),
    ]);

  return {
    status: (status as LicenseStatus) || 'free',
    tier: (tier as LicenseTier) || 'free',
    key: key || null,
    instanceId: instanceId || null,
    expiresAt: expiresAt || null,
    validatedAt: validatedAt || null,
  };
}

/**
 * Determine the LemonSqueezy store ID from env for verification.
 */
function getExpectedStoreId(): number {
  const raw = import.meta.env.LEMONSQUEEZY_STORE_ID;
  return raw ? Number(raw) : 0;
}

/**
 * Activate a license key for this extension instance.
 * Stores the result locally on success.
 */
export async function activateKey(licenseKey: string): Promise<LicenseState> {
  const deviceId = (await db.getConfig('device_id')) ?? 'unknown';
  const response = await activateLicense(licenseKey, `device-${deviceId}`);

  // Verify the key belongs to our store
  const expectedStoreId = getExpectedStoreId();
  if (expectedStoreId && response.meta.store_id !== expectedStoreId) {
    throw new Error('This license key does not belong to this product.');
  }

  if (!response.activated) {
    throw new Error(response.error ?? 'License activation failed.');
  }

  // Determine tier from variant name or expiry
  const tier: LicenseTier = response.license_key.expires_at ? 'yearly' : 'lifetime';

  // Persist locally
  await Promise.all([
    db.setConfig(KEY_LICENSE_KEY, licenseKey),
    db.setConfig(KEY_INSTANCE_ID, response.instance!.id),
    db.setConfig(KEY_LICENSE_STATUS, 'active'),
    db.setConfig(KEY_LICENSE_TIER, tier),
    db.setConfig(KEY_VALIDATED_AT, new Date().toISOString()),
    db.setConfig(KEY_EXPIRES_AT, response.license_key.expires_at ?? ''),
  ]);

  return {
    status: 'active',
    tier,
    key: licenseKey,
    instanceId: response.instance!.id,
    expiresAt: response.license_key.expires_at,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Re-validate the stored license key.
 * Call periodically (every 24h) or on-demand.
 * Updates local status accordingly.
 */
export async function revalidateKey(): Promise<LicenseState> {
  const state = await getLicenseState();

  // Nothing to validate if no key
  if (!state.key) {
    return state;
  }

  try {
    const response = await validateLicense(state.key, state.instanceId ?? undefined);

    const isValid = response.valid === true;
    const lsStatus = response.license_key.status;

    let newStatus: LicenseStatus;
    if (isValid && (lsStatus === 'active' || lsStatus === 'inactive')) {
      newStatus = 'active';
    } else if (lsStatus === 'expired') {
      newStatus = 'expired';
    } else {
      newStatus = 'invalid';
    }

    await Promise.all([
      db.setConfig(KEY_LICENSE_STATUS, newStatus),
      db.setConfig(KEY_VALIDATED_AT, new Date().toISOString()),
      db.setConfig(KEY_EXPIRES_AT, response.license_key.expires_at ?? ''),
    ]);

    return {
      ...state,
      status: newStatus,
      validatedAt: new Date().toISOString(),
      expiresAt: response.license_key.expires_at,
    };
  } catch (err) {
    console.error('[license] revalidation failed:', err);
    // On network error, keep current status — don't lock out users
    return state;
  }
}

/**
 * Deactivate the current license and reset to free tier.
 */
export async function deactivateKey(): Promise<void> {
  const state = await getLicenseState();

  if (state.key && state.instanceId) {
    try {
      await deactivateLicense(state.key, state.instanceId);
    } catch (err) {
      console.error('[license] deactivation API call failed:', err);
      // Continue clearing locally even if API fails
    }
  }

  await Promise.all([
    db.setConfig(KEY_LICENSE_KEY, ''),
    db.setConfig(KEY_INSTANCE_ID, ''),
    db.setConfig(KEY_LICENSE_STATUS, 'free'),
    db.setConfig(KEY_LICENSE_TIER, 'free'),
    db.setConfig(KEY_VALIDATED_AT, ''),
    db.setConfig(KEY_EXPIRES_AT, ''),
  ]);
}

/**
 * Check if the license needs periodic re-validation.
 * Returns true if last validation was > 24h ago.
 */
export async function needsRevalidation(): Promise<boolean> {
  const state = await getLicenseState();
  if (state.status === 'free' || !state.key) return false;
  if (!state.validatedAt) return true;

  const lastValidated = new Date(state.validatedAt).getTime();
  return Date.now() - lastValidated > LICENSE_VALIDATE_INTERVAL_MS;
}

/**
 * Check if an upgrade is needed based on device count.
 * Returns true if deviceCount >= FREE_DEVICE_LIMIT and no active license.
 */
export function isUpgradeRequired(
  deviceCount: number,
  licenseStatus: LicenseStatus,
): boolean {
  if (licenseStatus === 'active') return false;
  return deviceCount >= FREE_DEVICE_LIMIT;
}

/**
 * Get the LemonSqueezy checkout URL.
 * Single checkout page where user can pick Yearly ($5) or Lifetime ($15).
 */
export function getCheckoutUrl(): string {
  const checkoutId = import.meta.env.LEMONSQUEEZY_CHECKOUT_ID;

  // LemonSqueezy hosted checkout URL (no media/logo for clean UX)
  return `https://lynicis.lemonsqueezy.com/checkout/buy/${checkoutId}`;
}

/**
 * LemonSqueezy License API client.
 *
 * All endpoints are public (no auth token required).
 * Docs: https://docs.lemonsqueezy.com/api/license-api
 */

import type { LemonSqueezyLicenseResponse } from './types';

const LICENSE_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

/**
 * Activate a license key, creating a new instance.
 * Call this when the user enters their license key for the first time.
 */
export async function activateLicense(
  licenseKey: string,
  instanceName: string,
): Promise<LemonSqueezyLicenseResponse> {
  const res = await fetch(`${LICENSE_API_BASE}/activate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      license_key: licenseKey,
      instance_name: instanceName,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`License activation failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Validate a license key (and optionally a specific instance).
 * Call this periodically to check the license is still valid.
 */
export async function validateLicense(
  licenseKey: string,
  instanceId?: string,
): Promise<LemonSqueezyLicenseResponse> {
  const params: Record<string, string> = { license_key: licenseKey };
  if (instanceId) {
    params.instance_id = instanceId;
  }

  const res = await fetch(`${LICENSE_API_BASE}/validate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`License validation failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Deactivate a license key instance.
 * Call this when the user removes their license or leaves the group.
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string,
): Promise<LemonSqueezyLicenseResponse> {
  const res = await fetch(`${LICENSE_API_BASE}/deactivate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      license_key: licenseKey,
      instance_id: instanceId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`License deactivation failed (${res.status}): ${text}`);
  }

  return res.json();
}

/** License tier for Pro Sync feature. */
export type LicenseTier = 'free' | 'yearly' | 'lifetime';

/** License validation status. */
export type LicenseStatus = 'free' | 'active' | 'expired' | 'invalid';

/** Full license state stored locally and returned to popup. */
export interface LicenseState {
  status: LicenseStatus;
  tier: LicenseTier;
  key: string | null;
  instanceId: string | null;
  expiresAt: string | null;
  validatedAt: string | null;
}

/** Response from LemonSqueezy License API activate/validate endpoints. */
export interface LemonSqueezyLicenseResponse {
  valid?: boolean;
  activated?: boolean;
  deactivated?: boolean;
  error: string | null;
  license_key: {
    id: number;
    status: string;
    key: string;
    activation_limit: number;
    activation_usage: number;
    created_at: string;
    expires_at: string | null;
  };
  instance: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  meta: {
    store_id: number;
    order_id: number;
    order_item_id: number;
    product_id: number;
    product_name: string;
    variant_id: number;
    variant_name: string;
    customer_id: number;
    customer_name: string;
    customer_email: string;
  };
}

/** Maximum number of devices allowed in free tier. */
export const FREE_DEVICE_LIMIT = 3;

/** How often to re-validate the license (24 hours). */
export const LICENSE_VALIDATE_INTERVAL_MS = 86_400_000;

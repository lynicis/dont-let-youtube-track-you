/**
 * Auto-cleanup / retention for browsing history.
 */

import { deleteOldEntries, getConfig, setConfig } from '@/lib/db/client';

const RETENTION_KEY = 'retention_days';
const DEFAULT_RETENTION_DAYS = 90;

/** Prune entries older than `maxAgeDays` days. */
export async function pruneOldEntries(maxAgeDays: number): Promise<void> {
  await deleteOldEntries(maxAgeDays);
}

/** Get the configured retention period in days (default 90). */
export async function getRetentionDays(): Promise<number> {
  const value = await getConfig(RETENTION_KEY);
  if (value === null) return DEFAULT_RETENTION_DAYS;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? DEFAULT_RETENTION_DAYS : parsed;
}

/** Set the retention period in days. */
export async function setRetentionDays(days: number): Promise<void> {
  await setConfig(RETENTION_KEY, String(days));
}

/**
 * Run auto-cleanup based on the configured retention period.
 * A value of 0 means "keep forever" — no pruning is performed.
 */
export async function runAutoCleanup(): Promise<void> {
  const days = await getRetentionDays();
  if (days > 0) {
    await pruneOldEntries(days);
  }
}

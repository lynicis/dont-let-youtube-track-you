/**
 * Export browsing history as JSON or CSV.
 */

import { getAllHistory } from '@/lib/db/client';
import type { BrowsingHistoryEntry } from '@/lib/db/types';

/** Export all history as pretty-printed JSON. */
export async function exportAsJson(): Promise<string> {
  const entries = await getAllHistory();
  return JSON.stringify(entries, null, 2);
}

/** CSV columns included in the export. */
const CSV_HEADERS = [
  'id',
  'url',
  'page_type',
  'title',
  'video_id',
  'channel_name',
  'visited_at',
  'duration_seconds',
] as const;

/** Escape a value for inclusion in a CSV field (RFC 4180). */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  // If the field contains a comma, double-quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert a unix-ms timestamp to an ISO date string. */
function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Export all history as CSV with headers. */
export async function exportAsCsv(): Promise<string> {
  const entries = await getAllHistory();

  const headerRow = CSV_HEADERS.join(',');

  const rows = entries.map((entry: BrowsingHistoryEntry) =>
    [
      escapeCsvField(entry.id),
      escapeCsvField(entry.url),
      escapeCsvField(entry.page_type),
      escapeCsvField(entry.title),
      escapeCsvField(entry.video_id),
      escapeCsvField(entry.channel_name),
      escapeCsvField(msToIso(entry.visited_at)),
      escapeCsvField(entry.duration_seconds),
    ].join(','),
  );

  return [headerRow, ...rows].join('\n');
}

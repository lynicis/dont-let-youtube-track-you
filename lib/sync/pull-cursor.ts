/** Key columns for the keyset pull pagination cursor. */
export interface PullCursor {
  at: string;
  id: string;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/** PostgREST filter for rows strictly after (created_at, id). */
export function pullCursorFilter(since: string | null, sinceId: string | null): string {
  // Keep the server string verbatim: parsing would truncate microseconds and
  // break the exact tie-break on the cursor row.
  const at = since || new Date(0).toISOString();
  const id = sinceId || ZERO_UUID;
  return `created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`;
}

/** Cursor for the last row of an ascending (created_at, id) page, or null. */
export function nextPullCursor(
  rows: Array<{ id: string; created_at: string }>,
): PullCursor | null {
  const last = rows[rows.length - 1];
  return last ? { at: last.created_at, id: last.id } : null;
}

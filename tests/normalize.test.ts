import { describe, expect, test } from 'bun:test';
import { normalizeImportEntries } from '../lib/export/normalize';

const VALID_ID = '11111111-1111-4111-8111-111111111111';

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_ID,
    url: 'https://www.youtube.com/watch?v=abc',
    page_type: 'video',
    title: 'A video',
    visited_at: 1_700_000_000_000,
    duration_seconds: 12,
    device_id: 'old-device',
    synced_at: 123,
    created_at: 456,
    ...overrides,
  };
}

describe('normalizeImportEntries', () => {
  test('rewrites device_id and drops sync/created timestamps', () => {
    const { entries, skipped } = normalizeImportEntries([validEntry()], 'new-device');

    expect(skipped).toBe(0);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.device_id).toBe('new-device');
    expect(entry.synced_at).toBeNull();
    expect('created_at' in entry).toBe(false);
    expect(entry.id).toBe(VALID_ID);
  });

  test('skips entries with a non-UUID id', () => {
    const { entries, skipped } = normalizeImportEntries(
      [validEntry({ id: 'not-a-uuid' })],
      'new-device',
    );

    expect(entries).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  test('coerces object-valued optional fields to null', () => {
    const { entries } = normalizeImportEntries(
      [validEntry({ title: { nested: true } })],
      'new-device',
    );

    expect(entries[0]!.title).toBeNull();
  });

  test('throws on a non-array payload', () => {
    expect(() => normalizeImportEntries({}, 'new-device')).toThrow();
  });
});

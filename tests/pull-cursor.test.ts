import { describe, expect, test } from 'bun:test';
import { pullCursorFilter, nextPullCursor } from '../lib/sync/pull-cursor';

describe('pullCursorFilter', () => {
  test('starts at the epoch for a null cursor', () => {
    expect(pullCursorFilter(null, null)).toBe(
      'created_at.gt.1970-01-01T00:00:00.000Z,and(created_at.eq.1970-01-01T00:00:00.000Z,id.gt.00000000-0000-0000-0000-000000000000)',
    );
  });

  test('uses an ISO timestamp and the stored id', () => {
    expect(
      pullCursorFilter('2024-01-02T03:04:05.000Z', '22222222-2222-4222-8222-222222222222'),
    ).toBe(
      'created_at.gt.2024-01-02T03:04:05.000Z,and(created_at.eq.2024-01-02T03:04:05.000Z,id.gt.22222222-2222-4222-8222-222222222222)',
    );
  });
});

describe('nextPullCursor', () => {
  test('returns the last row when timestamps tie', () => {
    const cursor = nextPullCursor([
      { id: 'a', created_at: '2024-01-01T00:00:00.000Z' },
      { id: 'b', created_at: '2024-01-01T00:00:00.000Z' },
    ]);

    expect(cursor).toEqual({ at: '2024-01-01T00:00:00.000Z', id: 'b' });
  });

  test('returns null for an empty page', () => {
    expect(nextPullCursor([])).toBeNull();
  });
});

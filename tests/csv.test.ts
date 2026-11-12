import { describe, expect, test } from 'bun:test';
import { escapeCsvField } from '../lib/export/csv';

describe('escapeCsvField', () => {
  test('prefixes formula-injection payloads', () => {
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('-5')).toBe("'-5");
  });

  test('quotes fields with commas', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  test('doubles embedded quotes', () => {
    expect(escapeCsvField('a"b')).toBe('"a""b"');
  });

  test('maps null and undefined to empty', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  test('leaves plain values alone', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField(42)).toBe('42');
  });
});

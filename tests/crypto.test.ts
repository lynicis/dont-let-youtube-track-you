import { describe, expect, test } from 'bun:test';
import { deriveKey } from '../lib/crypto/key-derivation';
import { encryptField, decryptField } from '../lib/crypto/encrypt';

describe('crypto', () => {
  test('the same pairing code derives a key that decrypts', async () => {
    const key = await deriveKey('ABC123');
    const sameKey = await deriveKey('ABC123');
    const encrypted = await encryptField('secret url', key);

    expect(await decryptField(encrypted, sameKey)).toBe('secret url');
  });

  test('a different pairing code cannot decrypt', async () => {
    const key = await deriveKey('ABC123');
    const otherKey = await deriveKey('XYZ789');
    const encrypted = await encryptField('secret url', key);

    await expect(decryptField(encrypted, otherKey)).rejects.toThrow();
  });
});

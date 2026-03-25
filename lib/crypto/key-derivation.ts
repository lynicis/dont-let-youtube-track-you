/**
 * PBKDF2 key derivation from a pairing code.
 *
 * All devices sharing the same 6-char pairing code derive the identical
 * AES-256-GCM key, allowing them to encrypt/decrypt each other's data
 * without ever exposing the key to Supabase.
 */

/** Fixed salt — safe because the pairing code is the shared secret. */
const SALT = new TextEncoder().encode('dont-let-youtube-track-you-v1');

const PBKDF2_ITERATIONS = 100_000;

/**
 * Derive an AES-256-GCM encryption key from a pairing code using PBKDF2.
 *
 * @param pairingCode - The 6-char alphanumeric pairing code shared by all
 *   devices in a sync group.
 * @returns A `CryptoKey` suitable for AES-256-GCM encrypt + decrypt.
 */
export async function deriveKey(pairingCode: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pairingCode),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

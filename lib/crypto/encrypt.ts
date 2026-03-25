/**
 * AES-256-GCM encryption / decryption for sync data.
 *
 * Sensitive fields (URLs, titles, etc.) are encrypted before being sent to
 * Supabase so the server never sees plaintext browsing data.
 */

import type { BrowsingHistoryEntry } from '../db/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncryptedField {
  /** Base64-encoded 12-byte initialisation vector. */
  iv: string;
  /** Base64-encoded ciphertext (includes GCM auth tag). */
  ciphertext: string;
}

export interface EncryptedHistoryEntry {
  // Plaintext — needed for server-side queries / ordering:
  id: string;
  group_id: string;
  device_id: string;
  page_type: string;
  visited_at: number;
  duration_seconds: number | null;

  // Encrypted sensitive fields:
  url: EncryptedField;
  title: EncryptedField | null;
  channel_name: EncryptedField | null;
  channel_id: EncryptedField | null;
  search_query: EncryptedField | null;
  thumbnail_url: EncryptedField | null;
}

// ---------------------------------------------------------------------------
// Base64 helpers (browser-safe, no Node.js Buffer)
// ---------------------------------------------------------------------------

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Field-level encrypt / decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a single string field using AES-256-GCM.
 *
 * A fresh 12-byte IV is generated for every call so identical plaintext
 * produces different ciphertext each time.
 */
export async function encryptField(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedField> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  return {
    iv: toBase64(iv.buffer),
    ciphertext: toBase64(ciphertext),
  };
}

/**
 * Decrypt a single encrypted field back to its plaintext string.
 */
export async function decryptField(
  encrypted: EncryptedField,
  key: CryptoKey,
): Promise<string> {
  const iv = fromBase64(encrypted.iv);
  const ciphertext = fromBase64(encrypted.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    ciphertext as Uint8Array<ArrayBuffer>,
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Entry-level encrypt / decrypt
// ---------------------------------------------------------------------------

/** Encrypt a nullable string field — returns null when the input is null. */
async function encryptNullable(
  value: string | null,
  key: CryptoKey,
): Promise<EncryptedField | null> {
  if (value === null) return null;
  return encryptField(value, key);
}

/** Decrypt a nullable encrypted field — returns null when the input is null. */
async function decryptNullable(
  encrypted: EncryptedField | null,
  key: CryptoKey,
): Promise<string | null> {
  if (encrypted === null) return null;
  return decryptField(encrypted, key);
}

/**
 * Encrypt the sensitive fields of a browsing history entry for sync.
 *
 * Non-sensitive metadata (id, device_id, page_type, visited_at,
 * duration_seconds) is passed through in plaintext so the server can
 * still sort/filter without access to the key.
 *
 * @param entry   - The local history entry to encrypt.
 * @param groupId - The sync group ID to attach.
 * @param key     - The AES-256-GCM key derived from the pairing code.
 */
export async function encryptEntry(
  entry: BrowsingHistoryEntry,
  groupId: string,
  key: CryptoKey,
): Promise<EncryptedHistoryEntry> {
  const [url, title, channelName, channelId, searchQuery, thumbnailUrl] =
    await Promise.all([
      encryptField(entry.url, key),
      encryptNullable(entry.title, key),
      encryptNullable(entry.channel_name, key),
      encryptNullable(entry.channel_id, key),
      encryptNullable(entry.search_query, key),
      encryptNullable(entry.thumbnail_url, key),
    ]);

  return {
    id: entry.id,
    group_id: groupId,
    device_id: entry.device_id,
    page_type: entry.page_type,
    visited_at: entry.visited_at,
    duration_seconds: entry.duration_seconds,
    url,
    title,
    channel_name: channelName,
    channel_id: channelId,
    search_query: searchQuery,
    thumbnail_url: thumbnailUrl,
  };
}

/**
 * Decrypt an encrypted entry back into a `BrowsingHistoryEntry`.
 *
 * Fields that don't exist in `EncryptedHistoryEntry` (video_id, synced_at,
 * created_at) are set to sensible defaults (null / 0).
 */
export async function decryptEntry(
  encrypted: EncryptedHistoryEntry,
  key: CryptoKey,
): Promise<BrowsingHistoryEntry> {
  const [url, title, channelName, channelId, searchQuery, thumbnailUrl] =
    await Promise.all([
      decryptField(encrypted.url, key),
      decryptNullable(encrypted.title, key),
      decryptNullable(encrypted.channel_name, key),
      decryptNullable(encrypted.channel_id, key),
      decryptNullable(encrypted.search_query, key),
      decryptNullable(encrypted.thumbnail_url, key),
    ]);

  return {
    id: encrypted.id,
    url,
    page_type: encrypted.page_type,
    title,
    video_id: null,
    channel_name: channelName,
    channel_id: channelId,
    search_query: searchQuery,
    thumbnail_url: thumbnailUrl,
    visited_at: encrypted.visited_at,
    duration_seconds: encrypted.duration_seconds,
    device_id: encrypted.device_id,
    synced_at: null,
    created_at: 0,
  };
}

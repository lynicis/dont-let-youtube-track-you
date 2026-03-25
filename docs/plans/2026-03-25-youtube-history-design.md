# Don't Let YouTube Track You — Design Document

## Overview

A browser extension that privately tracks YouTube browsing history in a local OPFS-backed SQLite database and syncs across devices via Supabase, using anonymous device pairing codes. No Google account required.

## Architecture

```
Content Script (youtube.com/*) 
  -> Background Service Worker 
    -> Offscreen Document + Web Worker (wa-sqlite/OPFS)
    -> Supabase (Postgres) for cross-device sync
  -> Popup (React) for UI
```

### Components

1. **Content Script** — Detects YouTube SPA navigation via `yt-navigate-finish` events, extracts page metadata (URL, title, video ID, channel, search query, page type), sends to background
2. **Background Service Worker** — Orchestrates DB writes, manages offscreen document lifecycle, runs sync engine on intervals
3. **Offscreen Document + Worker** — Hosts wa-sqlite with OPFS VFS (Chrome) or IndexedDB VFS (Firefox/Safari) for local SQLite
4. **Supabase** — Postgres source of truth for cross-device sync, with RLS policies scoped to sync groups
5. **Popup** — React UI showing recent history, device pairing, sync status

## Data Model

### Local SQLite

- `browsing_history` — All YouTube page visits (id, url, page_type, title, video_id, channel_name, channel_id, search_query, thumbnail_url, visited_at, duration_seconds, device_id, synced_at)
- `device_config` — Key-value store for device_id, pairing_code, group_id, last_sync_at

### Supabase (Postgres)

- `sync_groups` — Groups of paired devices (id, pairing_code)
- `devices` — Devices within groups (id, group_id, device_name, last_seen_at)
- `browsing_history` — Synced history with encrypted sensitive fields (url, title, channel_name, search_query, thumbnail_url encrypted with AES-256-GCM)

## Page Type Detection

| URL Pattern | Page Type |
|---|---|
| `/watch?v=...` | video |
| `/results?search_query=...` | search |
| `/shorts/...` | shorts |
| `/@.../` or `/channel/...` | channel |
| `/playlist?list=...` | playlist |
| `/` (root) | home |
| Everything else | other |

## Device Pairing

- Anonymous: no accounts, no email, no OAuth
- First device creates a sync group with a 6-char alphanumeric pairing code
- Second device enters the code to join
- Encryption key derived from pairing code via PBKDF2
- Sensitive fields encrypted with AES-256-GCM before upload to Supabase

## Sync Strategy

- **Push** (local -> Supabase): Every 30s, batch upsert unsynced rows
- **Pull** (Supabase -> local): Every 60s, fetch new rows from other devices
- **Offline**: Works fully offline, catches up when online
- **Conflict resolution**: UUID primary keys, no conflicts possible

## Browser Support

| Browser | SQLite VFS | Status |
|---|---|---|
| Chrome/Edge | OPFSCoopSyncVFS (offscreen + worker) | Primary target |
| Firefox | IDBBatchAtomicVFS (IndexedDB) | Supported |
| Safari | IDBBatchAtomicVFS (IndexedDB) | Supported |

## Privacy & Security

- AES-256-GCM encryption for sensitive fields in Supabase
- Encryption key derived from pairing code (never sent to server)
- Supabase RLS policies scope access to sync groups
- Auto-prune entries older than 90 days (configurable)
- Data export (JSON/CSV) and import supported
- No Google account involvement

## Tech Stack

- WXT (extension framework)
- React 19 (popup UI)
- wa-sqlite (OPFS/IDB SQLite)
- @supabase/supabase-js
- Web Crypto API (encryption)
- TypeScript, Bun

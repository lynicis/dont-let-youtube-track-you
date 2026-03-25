# Don't Let YouTube Track You — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser extension that privately tracks YouTube browsing history in a local OPFS-backed SQLite database and syncs across devices via Supabase, using anonymous device pairing.

**Architecture:** Content script on youtube.com captures SPA navigation events and extracts page metadata. Background service worker orchestrates DB writes via an offscreen document hosting a wa-sqlite Web Worker with OPFS VFS. Supabase Postgres serves as the cross-device sync layer with AES-256-GCM encrypted fields and anonymous pairing codes.

**Tech Stack:** WXT, React 19, wa-sqlite, @supabase/supabase-js, Web Crypto API, TypeScript, Bun

---

### Task 1: Project Setup & Dependencies

**Files:**
- Modify: `package.json`
- Modify: `wxt.config.ts`
- Modify: `.gitignore`

**Steps:**
1. Install deps: `bun add wa-sqlite @supabase/supabase-js uuid` and `bun add -d @types/uuid`
2. Configure WXT manifest permissions and content script matches in `wxt.config.ts`
3. Verify build: `bun run build`
4. Commit: `feat: add dependencies and configure extension permissions`

---

### Task 2: Database Abstraction Layer

**Files:**
- Create: `lib/db/types.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/worker.ts`
- Create: `entrypoints/db-offscreen.html`
- Create: `entrypoints/db-offscreen.ts`
- Create: `lib/db/client.ts`

**Steps:**
1. Define TypeScript types for BrowsingHistoryEntry, DeviceConfig, DbOperation messages
2. Write SQL schema constants
3. Write wa-sqlite worker with OPFS VFS (Chrome) / IDB VFS (Firefox) selection
4. Write offscreen document that hosts worker and proxies messages
5. Write DB client for background script (message-based API)
6. Test: load extension, verify DB initializes
7. Commit: `feat: add wa-sqlite database layer with OPFS VFS`

---

### Task 3: Content Script — YouTube Navigation Tracking

**Files:**
- Modify: `entrypoints/content.ts`
- Create: `lib/tracker/youtube-tracker.ts`
- Create: `lib/tracker/types.ts`

**Steps:**
1. Write URL parser for page type classification
2. Write metadata extractors (videoId, searchQuery, channelInfo, title, thumbnail)
3. Wire up yt-navigate-finish listener + initial load in content script
4. Add duration tracking (entry time -> next nav or beforeunload)
5. Send PageVisit to background via chrome.runtime.sendMessage
6. Test: browse YouTube, verify console logs
7. Commit: `feat: add YouTube SPA navigation tracking content script`

---

### Task 4: Background Script — History Recording

**Files:**
- Modify: `entrypoints/background.ts`
- Create: `lib/background/history-handler.ts`

**Steps:**
1. Set up message listener for PageVisit from content script
2. Generate UUID, create BrowsingHistoryEntry, write to SQLite via DB client
3. Manage offscreen document lifecycle
4. Test: browse YouTube, verify entries in SQLite
5. Commit: `feat: add background history recording from content script`

---

### Task 5: Encryption Layer

**Files:**
- Create: `lib/crypto/encrypt.ts`
- Create: `lib/crypto/key-derivation.ts`

**Steps:**
1. Implement deriveKey(pairingCode) using PBKDF2 + Web Crypto API
2. Implement encryptFields(entry, key) for sensitive fields
3. Implement decryptFields(encrypted, key)
4. Commit: `feat: add AES-256-GCM encryption for sync data`

---

### Task 6: Device Pairing

**Files:**
- Create: `lib/sync/pairing.ts`
- Create: `lib/sync/supabase-client.ts`

**Steps:**
1. Initialize Supabase client with anon key
2. Implement createSyncGroup() — generate code, create group + device in Supabase
3. Implement joinSyncGroup(code) — lookup group, create device
4. Implement leaveSyncGroup() — remove device, clear config
5. Commit: `feat: add device pairing with sync groups`

---

### Task 7: Supabase Sync Engine

**Files:**
- Create: `lib/sync/sync-engine.ts`
- Modify: `entrypoints/background.ts`

**Steps:**
1. Implement pushToSupabase() — query unsynced, encrypt, batch upsert
2. Implement pullFromSupabase() — fetch new from other devices, decrypt, insert local
3. Wire up intervals in background (push 30s, pull 60s)
4. Handle offline with retry
5. Commit: `feat: add Supabase push/pull sync engine`

---

### Task 8: Popup UI — History View

**Files:**
- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/popup/App.css`
- Create: `entrypoints/popup/components/HistoryList.tsx`
- Create: `entrypoints/popup/components/HistoryItem.tsx`
- Create: `entrypoints/popup/hooks/useHistory.ts`

**Steps:**
1. Create useHistory hook (fetch from background via message)
2. Build HistoryItem component (icon, title, time, thumbnail)
3. Build HistoryList (grouped by day, scrollable, filter)
4. Dark theme CSS
5. Commit: `feat: add popup history list view`

---

### Task 9: Popup UI — Device Pairing & Sync Status

**Files:**
- Create: `entrypoints/popup/components/DevicePairing.tsx`
- Create: `entrypoints/popup/components/SyncStatus.tsx`
- Create: `entrypoints/popup/components/TabNav.tsx`
- Modify: `entrypoints/popup/App.tsx`

**Steps:**
1. Build TabNav (History | Devices | Settings)
2. Build DevicePairing (create/join flow, connected devices list)
3. Build SyncStatus (indicator dot, last sync, pending count)
4. Commit: `feat: add popup device pairing and sync status views`

---

### Task 10: Data Export/Import & Cleanup

**Files:**
- Create: `lib/export/export.ts`
- Create: `lib/export/import.ts`
- Create: `lib/db/cleanup.ts`
- Create: `entrypoints/popup/components/Settings.tsx`

**Steps:**
1. Implement exportAsJson() and exportAsCsv()
2. Implement importFromJson(file) with dedup
3. Implement pruneOldEntries(maxAgeDays)
4. Wire auto-prune on startup + settings UI
5. Commit: `feat: add data export/import and auto-cleanup`

---

### Task 11: Supabase Schema Setup

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Steps:**
1. Write migration for sync_groups, devices, browsing_history
2. Write RLS policies
3. Commit: `feat: add Supabase schema and RLS policies`

---

### Task 12: Multi-Browser Build & Testing

**Files:**
- Modify: `wxt.config.ts`
- Modify: `lib/db/worker.ts`

**Steps:**
1. Add build-time VFS selection logic
2. Test Chrome: `bun run build`
3. Test Firefox: `bun run build:firefox`
4. Commit: `feat: add multi-browser VFS support`

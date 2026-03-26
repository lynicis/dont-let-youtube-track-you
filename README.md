# Don't Let YouTube Track You

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/YOUR_EXTENSION_ID?logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID)
[![Firefox Add-ons](https://img.shields.io/amo/v/YOUR_ADDON_SLUG?logo=firefox&logoColor=white&label=Firefox%20Add-ons)](https://addons.mozilla.org/firefox/addon/YOUR_ADDON_SLUG/)

A browser extension that privately tracks your YouTube browsing history in a local SQLite database and syncs it across devices via Supabase -- without needing a Google account.

## Features

- Tracks all YouTube page visits (videos, searches, channels, shorts, playlists)
- Stores history locally in an OPFS-backed SQLite database (wa-sqlite)
- Syncs across devices using encrypted Supabase storage
- Anonymous device pairing with 6-character codes (no accounts needed)
- AES-256-GCM encryption -- Supabase never sees your plaintext data
- Export history as JSON or CSV
- Import history from JSON
- Auto-prune old entries (configurable retention period)
- Dark theme popup UI

## Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- Git

## Build

```bash
# Install dependencies
bun install

# Build for Chrome/Chromium
bun run build

# Build for Firefox
bun run build:firefox
```

## Installation

### Chromium-based browsers (Chrome, Edge, Brave, Arc, Opera, Vivaldi)

1. Build the extension:
   ```bash
   bun run build
   ```

2. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
   - **Opera**: `opera://extensions`
   - **Vivaldi**: `vivaldi://extensions`

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **"Load unpacked"**.

5. Select the `.output/chrome-mv3/` folder from the project directory.

6. The extension icon will appear in your toolbar. Pin it for easy access.

> **Note:** The extension stays installed across browser restarts. You only need to re-load after rebuilding.

### Firefox

There are three ways to install on Firefox, depending on your needs.

#### Option A: Temporary install via about:debugging (simplest, removed on restart)

1. Build the extension:
   ```bash
   bun run build:firefox
   ```

2. Open Firefox and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Click **"Load Temporary Add-on..."**

4. Navigate to `.output/firefox-mv2/` and select `manifest.json`.

5. The extension is now loaded. It will be removed when you close Firefox.

#### Option B: Persistent install via Developer Edition or Nightly

This works on [Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly) only. Regular Firefox requires Mozilla signing.

1. Build and zip the extension:
   ```bash
   bun run zip:firefox
   ```

2. Rename the zip to `.xpi`:
   ```bash
   mv .output/dont-let-youtube-track-you-1.0.0-firefox.zip .output/dont-let-youtube-track-you.xpi
   ```
   > If the filename differs, check `.output/` for the actual zip name.

3. In Firefox Developer Edition or Nightly, go to `about:config` and set:
   ```
   xpinstall.signatures.required = false
   ```

4. Go to `about:addons` (or press `Ctrl+Shift+A`).

5. Click the gear icon and select **"Install Add-on From File..."**

6. Select the `.xpi` file.

#### Option C: Using web-ext (best for development)

[web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/) launches a temporary Firefox profile with your extension pre-loaded and auto-reloads on changes.

```bash
# Run with auto-reload
npx web-ext run --source-dir .output/firefox-mv2/
```

Or during development, use WXT's built-in dev mode:

```bash
bun run dev:firefox
```

## Development

```bash
# Dev mode with hot reload (Chrome)
bun run dev

# Dev mode with hot reload (Firefox)
bun run dev:firefox

# Type-check
bun run compile
```

## Supabase Setup (for cross-device sync)

Local history tracking works without Supabase. If you want cross-device sync:

1. Create a free project at [supabase.com](https://supabase.com).

2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started):
   ```bash
   brew install supabase/tap/supabase   # macOS
   # or: npm install -g supabase
   ```

3. Link your project:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

4. Deploy the schema migration Edge Function:
   ```bash
   supabase functions deploy setup-schema
   ```
   This creates a server-side function that auto-creates the database tables
   when the extension first connects. The function runs with admin privileges
   (service_role key) so the extension's anon key never needs DDL access.

5. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

6. Rebuild the extension:
   ```bash
   bun run build        # Chrome
   bun run build:firefox # Firefox
   ```

7. Open the extension popup, go to the **Devices** tab, and click **"Create Sync Group"**.
   The extension will automatically set up the database tables on first use.
   Share the pairing code with your other devices.

> **Note:** You can also apply the schema manually by running
> `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor
> instead of deploying the Edge Function.

## Project Structure

```
entrypoints/
  background.ts          # Service worker: message routing, sync loop
  content.ts             # Content script: YouTube navigation tracking
  db-offscreen.html      # Offscreen document for SQLite worker
  popup/                 # React popup UI
    App.tsx, App.css
    components/          # HistoryList, DevicePairing, Settings, etc.
    hooks/               # useHistory

lib/
  background/            # History recording handler
  crypto/                # AES-256-GCM encryption, PBKDF2 key derivation
  db/                    # wa-sqlite worker, offscreen bridge, DB client
  export/                # JSON/CSV export, JSON import
  sync/                  # Supabase client, device pairing, sync engine
  tracker/               # YouTube page detection, metadata extraction

supabase/
  functions/             # Edge Functions (deployed to Supabase)
    setup-schema/        # Auto-applies DB migrations on first use
  migrations/            # Postgres schema (reference / manual apply)
```

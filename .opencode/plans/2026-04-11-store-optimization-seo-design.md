# Web Extension Store Optimization & SEO - Design Document

**Date:** April 11, 2026
**Status:** Approved

---

## Goal

Optimize the Chrome Web Store and Firefox Add-ons listings for "Don't Let YouTube Track You" to maximize discoverability, conversion, and organic search presence. Includes keyword-optimized store copy, localization (7 languages), improved screenshots, promotional images, and a SEO-optimized landing page.

## Competitive Landscape

The extension occupies a unique niche: no direct competitor offers "private local YouTube history tracking with encrypted cross-device sync." Competitors include YouTube history cleaners, general privacy extensions (DuckDuckGo, Ghostery, uBlock Origin Lite), and YouTube history viewers. None combine local-first storage with encrypted sync.

## Keyword Strategy

### Primary Keywords
- youtube history private
- youtube browsing history
- youtube tracker
- private youtube history
- youtube watch history

### Secondary Keywords
- youtube history without google account
- youtube history sync
- youtube history export
- youtube privacy extension
- track youtube without login

### Positioning Keywords
- encrypted youtube history
- local youtube history
- cross device youtube history
- youtube history no google

### Value Proposition
"Your YouTube history, owned by you -- not Google. Stored locally, encrypted, synced across devices."

---

## Store Listing Copy

### Manifest Summary (114 chars)
> Track your YouTube history privately in a local database. Encrypted cross-device sync. No Google account needed.

### CWS Description (plain text)

Don't Let YouTube Track You keeps your YouTube browsing history private and under your control -- no Google account required. Track every video, search, channel, and playlist you visit in a local database that never leaves your device unless you choose to sync it.

FEATURES:
- Private YouTube History: Automatically tracks videos, searches, channels, shorts, and playlists you visit
- 100% Local Storage: Your history is stored in a local SQLite database on your device, not in the cloud
- Encrypted Cross-Device Sync: Optionally sync your history across multiple devices using end-to-end AES-256 encryption
- No Account Required: Pair devices with a simple 6-character code -- no sign-ups, no emails, no Google account needed
- Search & Browse: Quickly find any video or channel from your history with full-text search, organized by time
- Export & Import: Download your history as JSON or CSV. Import it back anytime. Your data, your format
- Auto-Cleanup: Set retention periods from 30 days to forever. Old entries are automatically pruned
- Works Everywhere: Chrome, Firefox, Edge, Brave, Arc, Opera, and Vivaldi

HOW IT WORKS:
Install the extension and it quietly runs in the background, detecting when you visit YouTube pages. Every video, search, and channel visit is saved to a local SQLite database using your browser's built-in storage. Open the popup to browse, search, and manage your history.

Want to sync across devices? Create a sync group, share the pairing code, and your history syncs automatically -- encrypted before it ever leaves your browser using AES-256-GCM with a key derived from your pairing code. Even the sync server can't read your data.

PRIVACY BY DESIGN:
No analytics. No telemetry. No cloud storage by default. All sync data is end-to-end encrypted. The extension only accesses youtube.com -- nothing else. Your browsing history is yours alone.

Open source: https://github.com/lynicis/dont-let-youtube-track-you

### AMO Description
Same content as CWS but formatted with HTML tags (`<b>`, `<ul>`, `<li>`, `<a>`) for richer presentation.

---

## Localization (i18n)

### Architecture
WXT `_locales` system with `browser.i18n` API.

```
public/_locales/
  en/messages.json       # English (default)
  es/messages.json       # Spanish
  de/messages.json       # German
  fr/messages.json       # French
  tr/messages.json       # Turkish
  ja/messages.json       # Japanese
  pt_BR/messages.json    # Portuguese (Brazil)
```

### Scope
- Extension name: Keep English across all locales (brand name)
- Extension description (`extDescription`): Fully translated
- Store listing descriptions: Translated versions for CWS/AMO upload
- Popup UI: NOT localized (separate future effort)

### WXT Config Changes
- Set `default_locale: 'en'` in manifest
- Reference `__MSG_extName__` and `__MSG_extDescription__` in manifest

---

## Screenshot Strategy (5 screenshots, 1280x800)

| # | Screenshot | Purpose |
|---|-----------|---------|
| 1 | Extension in browser context | Show popup on a YouTube page |
| 2 | History tab with captions | Highlight search, time grouping, thumbnails |
| 3 | Cross-device sync flow | Show pairing code + devices syncing |
| 4 | Privacy & encryption visual | Infographic: data flow with encryption |
| 5 | Settings & export | Retention, export, import with captions |

Built as HTML/CSS templates in `mockup/screenshots/`. Consistent dark navy (#1a1a2e) + red accent branding.

---

## Promotional Images

| Image | Dimensions | Design |
|-------|-----------|--------|
| Small promo tile | 440x280 | Icon centered, name below, tagline, dark navy background |
| Marquee | 1400x560 | Icon left, name+tagline center-left, faded popup mockup right |

Built as HTML/CSS templates in `mockup/promo/`.

---

## Landing Page & SEO

### GitHub Pages Structure
```
gh-pages branch:
  index.html              # Landing page
  privacy/index.html      # Privacy policy (moved)
  assets/
    style.css
    og-image.png
    icon-128.png
```

### Landing Page Sections
1. Hero: icon, tagline, CTA buttons (Chrome/Firefox store links), hero image
2. Features: 4 cards (privacy, sync, search/export, cross-browser)
3. How it works: 3-step visual
4. Privacy commitment + link to policy
5. Footer: GitHub, privacy policy, store links

### SEO Implementation
- Title: "Don't Let YouTube Track You - Private YouTube History Extension"
- Meta description with keywords
- Open Graph + Twitter Card tags
- JSON-LD SoftwareApplication structured data
- Semantic HTML, alt tags, fast load

### Backlink Loop
Landing page URL added to: CWS Homepage URL, AMO Homepage, GitHub repo Website field, README.

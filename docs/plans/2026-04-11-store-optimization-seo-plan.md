# Web Extension Store Optimization & SEO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize CWS and AMO store listings with keyword-rich copy, localized descriptions (7 languages), 5 improved screenshots, promotional images, and a SEO-optimized landing page on GitHub Pages.

**Architecture:** Store-first approach: listing copy and i18n first, then visual assets, then landing page. All mockups as HTML/CSS templates. Landing page as static HTML on gh-pages branch.

**Tech Stack:** WXT (i18n via `_locales`), HTML/CSS (mockups, landing page), JSON-LD (structured data)

---

### Task 1: Create store listing description files

**Files:**
- Create: `docs/store/chrome-description.txt`
- Create: `docs/store/firefox-description.html`
- Create: `docs/store/keywords.md`

**Step 1:** Create `docs/store/` directory.

**Step 2:** Write `docs/store/keywords.md` with the keyword research from the design doc:
- Primary, secondary, and positioning keyword clusters
- Value proposition statement
- Competitive positioning notes

**Step 3:** Write `docs/store/chrome-description.txt` with the full CWS description (plain text, no markdown):
- Opening hook with primary keywords
- 8-item feature list with secondary keywords naturally woven in
- How it works section (3-4 sentences)
- Privacy by design section
- Open source link

**Step 4:** Write `docs/store/firefox-description.html` with the same content formatted as HTML:
- Use `<b>` for section headers
- Use `<ul><li>` for feature list
- Use `<a>` for links
- AMO supports limited HTML: b, i, em, strong, ul, ol, li, a, abbr, acronym, blockquote, code, dl, dt, dd

**Step 5:** Commit.

```bash
git add docs/store/
git commit -m "docs: add store listing descriptions and keyword research"
```

---

### Task 2: Update manifest summary in wxt.config.ts

**Files:**
- Modify: `wxt.config.ts` (description field)

**Step 1:** Update the `description` field in the manifest configuration:

From:
```
"Privately track your YouTube browsing history and sync across devices without Google tracking"
```

To:
```
"Track your YouTube history privately in a local database. Encrypted cross-device sync. No Google account needed."
```

**Step 2:** Verify the build still works.

Run: `bun run compile`
Expected: No errors.

**Step 3:** Commit.

```bash
git add wxt.config.ts
git commit -m "chore: optimize manifest description for store search"
```

---

### Task 3: Set up i18n locale files

**Files:**
- Create: `public/_locales/en/messages.json`
- Create: `public/_locales/es/messages.json`
- Create: `public/_locales/de/messages.json`
- Create: `public/_locales/fr/messages.json`
- Create: `public/_locales/tr/messages.json`
- Create: `public/_locales/ja/messages.json`
- Create: `public/_locales/pt_BR/messages.json`
- Modify: `wxt.config.ts` (add default_locale, use __MSG_ references)

**Step 1:** Create the English locale file `public/_locales/en/messages.json`:

```json
{
  "extName": {
    "message": "Don't Let YouTube Track You"
  },
  "extDescription": {
    "message": "Track your YouTube history privately in a local database. Encrypted cross-device sync. No Google account needed."
  }
}
```

**Step 2:** Create locale files for each additional language (es, de, fr, tr, ja, pt_BR). Each file has the same structure with `extName` kept in English and `extDescription` translated:

- **Spanish (es):** `"Registra tu historial de YouTube de forma privada en una base de datos local. Sincronización cifrada entre dispositivos. No necesitas cuenta de Google."`
- **German (de):** `"Verfolge deinen YouTube-Verlauf privat in einer lokalen Datenbank. Verschlüsselte geräteübergreifende Synchronisierung. Kein Google-Konto nötig."`
- **French (fr):** `"Suivez votre historique YouTube en privé dans une base de données locale. Synchronisation chiffrée entre appareils. Aucun compte Google requis."`
- **Turkish (tr):** `"YouTube geçmişinizi yerel bir veritabanında gizli olarak takip edin. Şifreli cihazlar arası senkronizasyon. Google hesabı gerekmez."`
- **Japanese (ja):** `"YouTubeの閲覧履歴をローカルデータベースでプライベートに記録。暗号化されたデバイス間同期。Googleアカウント不要。"`
- **Portuguese Brazil (pt_BR):** `"Acompanhe seu histórico do YouTube de forma privada em um banco de dados local. Sincronização criptografada entre dispositivos. Sem necessidade de conta Google."`

Note: These are AI-drafted translations. Native speaker review recommended before store submission.

**Step 3:** Update `wxt.config.ts` manifest configuration:
- Add `default_locale: 'en'` to the manifest
- Change `name` to `'__MSG_extName__'`
- Change `description` to `'__MSG_extDescription__'`

**Step 4:** Verify the build still works.

Run: `bun run compile && bun run build`
Expected: No errors. The built extension should show the English name and description.

**Step 5:** Commit.

```bash
git add public/_locales/ wxt.config.ts
git commit -m "feat: add i18n localization for 7 languages"
```

---

### Task 4: Create store listing translations

**Files:**
- Create: `docs/store/locales/es.txt`
- Create: `docs/store/locales/de.txt`
- Create: `docs/store/locales/fr.txt`
- Create: `docs/store/locales/tr.txt`
- Create: `docs/store/locales/ja.txt`
- Create: `docs/store/locales/pt_BR.txt`

**Step 1:** Create `docs/store/locales/` directory.

**Step 2:** For each language, create a `.txt` file containing the full store listing description translated from the English CWS description. Each file should contain the complete translated description (opening hook, features list, how it works, privacy section, open source link).

The translations should:
- Naturally incorporate translated equivalents of the target keywords
- Maintain the same structure as the English version
- Keep proper nouns (YouTube, SQLite, AES-256, JSON, CSV) untranslated
- Keep the GitHub URL as-is

Note: AI-drafted. Native speaker review recommended.

**Step 3:** Commit.

```bash
git add docs/store/locales/
git commit -m "docs: add translated store descriptions for 6 languages"
```

---

### Task 5: Create improved screenshot mockups (5 screenshots)

**Files:**
- Create: `mockup/screenshots/01-browser-context.html`
- Create: `mockup/screenshots/02-history-captions.html`
- Create: `mockup/screenshots/03-sync-flow.html`
- Create: `mockup/screenshots/04-privacy-encryption.html`
- Create: `mockup/screenshots/05-settings-export.html`

**Step 1:** Create `mockup/screenshots/` directory.

**Step 2:** Create `01-browser-context.html` (1280x800):
- A simplified browser chrome frame (address bar showing youtube.com, tab bar)
- A YouTube-like page background (dark theme)
- The extension popup overlaid in the top-right corner (reuse existing popup HTML from `mockup/history.html`)
- Subtle shadow on the popup to make it stand out

**Step 3:** Create `02-history-captions.html` (1280x800):
- Based on existing `mockup/history.html` popup design
- Add floating caption badges pointing to key features:
  - "Full-text search" pointing to search bar
  - "Grouped by time" pointing to Today/Yesterday labels
  - "Videos, searches, channels" pointing to different entry types
- Use consistent badge style: semi-transparent dark background, white text, rounded

**Step 4:** Create `03-sync-flow.html` (1280x800):
- Split layout showing two browser windows side by side
- Left: Desktop browser showing Devices tab with pairing code "X7K2M9"
- Right: Another browser showing the same sync group connected
- Center: visual connection line with lock icon indicating encrypted sync
- Caption: "Encrypted cross-device sync with a simple code"

**Step 5:** Create `04-privacy-encryption.html` (1280x800):
- Infographic-style layout on the dark navy background
- Visual flow: Browser icon -> "Local SQLite Database" box -> (optional arrow) -> Lock icon -> "Encrypted Sync" box
- Key callouts: "No Google account", "AES-256 encryption", "Your data stays local"
- Extension icon and name at top

**Step 6:** Create `05-settings-export.html` (1280x800):
- Based on existing `mockup/settings.html` popup design
- Add floating caption badges:
  - "Set retention period" pointing to retention dropdown
  - "Export as JSON or CSV" pointing to export buttons
  - "Import your data" pointing to import section
  - "Full control" as a header badge

**Step 7:** Render all 5 HTML files to PNG at 1280x800 (manual step - open in browser and screenshot, or use a headless browser script).

**Step 8:** Commit.

```bash
git add mockup/screenshots/
git commit -m "chore: add 5 improved screenshot mockups with captions and context"
```

---

### Task 6: Create promotional image mockups

**Files:**
- Create: `mockup/promo/small-tile.html`
- Create: `mockup/promo/marquee.html`

**Step 1:** Create `mockup/promo/` directory.

**Step 2:** Create `small-tile.html` (440x280):
- Canvas exactly 440x280px
- Dark navy gradient background (#0f0f23 -> #1a1a2e)
- Extension SVG icon centered, sized ~80px
- Extension name below icon in white, 18px font
- Tagline "Your YouTube history. Your control." in muted text below
- Subtle red accent line or glow element

**Step 3:** Create `marquee.html` (1400x560):
- Canvas exactly 1400x560px
- Dark navy gradient background
- Left third: Extension icon (120px) with name and tagline
- Right half: Faded/semi-transparent mockup of the popup UI (history tab) at an angle
- Clean composition, no busy elements
- Red accent elements consistent with brand

**Step 4:** Render to PNG (manual step).

**Step 5:** Commit.

```bash
git add mockup/promo/
git commit -m "chore: add promotional image mockups (small tile + marquee)"
```

---

### Task 7: Create landing page on gh-pages branch

**Files (on gh-pages branch):**
- Modify: `index.html` (replace privacy policy with landing page)
- Create: `privacy/index.html` (move privacy policy here)
- Create: `assets/style.css`

**Step 1:** Switch to gh-pages branch.

```bash
git checkout gh-pages
```

**Step 2:** Move the current `index.html` (privacy policy) to `privacy/index.html`.

```bash
mkdir -p privacy
cp index.html privacy/index.html
```

**Step 3:** Create `assets/style.css` with shared styles:
- Dark theme matching extension branding (#0f0f23, #1a1a2e, #ff0000 accent)
- Responsive layout (mobile-first)
- Clean typography (system fonts)
- Button styles for CTA buttons
- Feature card styles
- Footer styles

**Step 4:** Create new `index.html` as the landing page:

Structure:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- SEO meta tags -->
  <title>Don't Let YouTube Track You - Private YouTube History Extension</title>
  <meta name="description" content="Track your YouTube browsing history privately without a Google account. Local storage, encrypted sync, export to JSON/CSV. Free & open source browser extension for Chrome and Firefox.">
  <!-- Open Graph -->
  <meta property="og:title" content="Don't Let YouTube Track You - Private YouTube History Extension">
  <meta property="og:description" content="...">
  <meta property="og:image" content="https://lynicis.github.io/dont-let-youtube-track-you/assets/og-image.png">
  <meta property="og:url" content="https://lynicis.github.io/dont-let-youtube-track-you/">
  <meta property="og:type" content="website">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <!-- JSON-LD structured data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Don't Let YouTube Track You",
    "applicationCategory": "BrowserExtension",
    "operatingSystem": "Chrome, Firefox, Edge, Brave",
    "offers": { "@type": "Offer", "price": "0" },
    "description": "...",
    "url": "https://lynicis.github.io/dont-let-youtube-track-you/"
  }
  </script>
  <link rel="canonical" href="https://lynicis.github.io/dont-let-youtube-track-you/">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <!-- Hero section -->
  <!-- Features section (4 cards) -->
  <!-- How it works (3 steps) -->
  <!-- Privacy section -->
  <!-- Footer -->
</body>
</html>
```

**Step 5:** Update `privacy/index.html` to link back to the main landing page and use shared styles.

**Step 6:** Commit on gh-pages branch.

```bash
git add index.html privacy/ assets/
git commit -m "feat: add SEO-optimized landing page, restructure privacy policy"
```

**Step 7:** Switch back to master.

```bash
git checkout master
```

---

### Task 8: Create Open Graph image

**Files:**
- Create: `mockup/og-image.html`

**Step 1:** Create `mockup/og-image.html` (1200x630):
- Standard OG image dimensions
- Dark navy background with extension icon, name, and tagline
- Similar composition to small promo tile but at OG dimensions
- This will be deployed to gh-pages `assets/og-image.png`

**Step 2:** Render to PNG (manual step).

**Step 3:** Deploy the PNG to gh-pages branch:

```bash
git checkout gh-pages
cp [rendered-png-path] assets/og-image.png
git add assets/og-image.png
git commit -m "chore: add Open Graph preview image"
git checkout master
```

**Step 4:** Commit the mockup HTML on master.

```bash
git add mockup/og-image.html
git commit -m "chore: add OG image mockup template"
```

---

### Task 9: Update README and backlinks

**Files:**
- Modify: `README.md`

**Step 1:** Add the landing page URL near the top of README (below badges):
- Link to `https://lynicis.github.io/dont-let-youtube-track-you/`

**Step 2:** Verify all store badge links are still correct.

**Step 3:** Commit.

```bash
git add README.md
git commit -m "docs: add landing page link to README"
```

---

### Task 10: Write the design doc to docs/plans/

**Files:**
- Create: `docs/plans/2026-04-11-store-optimization-seo-design.md`
- Create: `docs/plans/2026-04-11-store-optimization-seo-plan.md`

**Step 1:** Copy the design document and this implementation plan to `docs/plans/`.

**Step 2:** Commit.

```bash
git add docs/plans/
git commit -m "docs: add store optimization and SEO design and plan"
```

---

## Manual Steps (Not Automatable)

These require browser-based actions after the code tasks are complete:

1. **Render mockups to PNG**: Open each HTML mockup in a browser at the correct viewport size and screenshot (or use a headless browser script like Puppeteer)
2. **Upload to Chrome Web Store**: Via Developer Dashboard - update description, upload screenshots, upload promo images, set homepage URL
3. **Upload to Firefox AMO**: Via Developer Hub - update description, upload screenshots, set homepage URL
4. **Upload localized descriptions**: Via CWS Dashboard (Localization tab) and AMO Developer Hub
5. **Native speaker translation review**: Have native speakers review the translated store descriptions before publishing
6. **Set GitHub repo website field**: In repository Settings, set the Website to the landing page URL

# Release Workflow Design

## Goal

Automate extension publishing to Chrome Web Store and Mozilla AMO when a GitHub Release is published, and add store download badges to the README.

## Architecture

A single GitHub Actions workflow (`.github/workflows/release.yml`) triggered by `release: published`. One build job produces Chrome and Firefox zip artifacts. Three parallel downstream jobs handle Chrome Web Store upload, Firefox AMO sign+submit, and GitHub Release asset attachment. Uses `chrome-webstore-upload-cli@3` and `web-ext@9` CLI tools directly -- no third-party Actions for credential-sensitive operations.

## Decisions

- **Trigger:** GitHub Release published event (not tag push)
- **Version source:** Derived from release tag (`v1.2.0` -> `1.2.0`), patched into `package.json` before build
- **Supabase credentials:** Injected via GitHub Secrets at build time
- **Store uploads:** `chrome-webstore-upload-cli@3` for Chrome, `web-ext@9 sign --channel=listed` for Firefox
- **Error isolation:** `continue-on-error: true` on store submission jobs so one failure doesn't block others
- **Firefox source code:** Included via `--upload-source-code` for AMO reviewer access
- **Release assets:** Both `.zip` files attached to the GitHub Release for sideloading
- **README badges:** Chrome Web Store and Firefox Add-ons shields with placeholder URLs

## Workflow Structure

```
Trigger: on release published (tag v*)

         ┌──────────┐
         │  Build   │
         │          │
         │ checkout │
         │ bun      │
         │ version  │
         │ zip x2   │
         │ artifacts│
         └────┬─────┘
              │
    ┌─────────┼──────────┐
    │         │          │
┌───▼───┐ ┌──▼────┐ ┌───▼────────┐
│Chrome │ │Firefox│ │Attach      │
│Submit │ │Submit │ │Assets      │
│       │ │       │ │            │
│ cli@3 │ │web-ext│ │gh release  │
│upload │ │sign   │ │upload      │
└───────┘ └───────┘ └────────────┘
```

## Required GitHub Secrets

| Secret | Source |
|--------|--------|
| `SUPABASE_URL` | Supabase dashboard |
| `SUPABASE_ANON_KEY` | Supabase dashboard |
| `CHROME_EXTENSION_ID` | Chrome Web Store dashboard (after first manual upload) |
| `CHROME_CLIENT_ID` | Google Cloud Console OAuth |
| `CHROME_CLIENT_SECRET` | Google Cloud Console OAuth |
| `CHROME_REFRESH_TOKEN` | Generated via OAuth flow |
| `WEB_EXT_API_KEY` | AMO Developer Hub (JWT issuer) |
| `WEB_EXT_API_SECRET` | AMO Developer Hub (JWT secret) |

## Prerequisites

- First Chrome upload must be done manually to register the extension and obtain the `EXTENSION_ID`
- Google Cloud OAuth credentials must be created for the Chrome Web Store API
- AMO API credentials must be generated from the Developer Hub
- Firefox AMO allows first submission via API

## WXT Output Paths

WXT `zip` command outputs to `.output/`:
- Chrome: `dont-let-youtube-track-you-{version}-chrome.zip`
- Firefox: `dont-let-youtube-track-you-{version}-firefox.zip`
- Firefox sources (auto): `dont-let-youtube-track-you-{version}-sources.zip`

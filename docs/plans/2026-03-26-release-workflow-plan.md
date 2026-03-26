# Release Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a GitHub Actions workflow that builds and publishes the extension to Chrome Web Store and Mozilla AMO on each GitHub Release, and add store badges to the README.

**Architecture:** Single workflow file with 4 jobs: Build -> (Chrome + Firefox + Attach-Assets) in parallel. CLI tools for store uploads. Version derived from release tag.

**Tech Stack:** GitHub Actions, Bun, WXT, chrome-webstore-upload-cli@3, web-ext@9

---

### Task 1: Create the GitHub Actions workflow file

**Files:**
- Create: `.github/workflows/release.yml`

**Step 1:** Create `.github/workflows/` directory and write the workflow file with:
- Trigger: `on: release: types: [published]`
- Build job: checkout, setup bun, patch version from tag, install, zip chrome, zip firefox, upload artifacts
- Chrome job: download artifact, `npx chrome-webstore-upload-cli@3 upload --auto-publish`
- Firefox job: download artifact, `npx web-ext@9 sign --channel=listed --upload-source-code`
- Attach-Assets job: download artifacts, `gh release upload`

**Step 2:** Verify YAML syntax is valid.

### Task 2: Add store download badges to README.md

**Files:**
- Modify: `README.md:1-3`

**Step 1:** Add Chrome Web Store and Firefox Add-ons shield badges between the title and description, using placeholder URLs.

### Task 3: Commit all changes

```bash
git add .github/workflows/release.yml README.md docs/plans/
git commit -m "feat: add automated release workflow for Chrome and Firefox stores"
```

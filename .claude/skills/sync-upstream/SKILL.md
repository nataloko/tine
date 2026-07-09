---
name: sync-upstream
description: Pull a new upstream Tine release into the `mine` fork — review conflicts and feature overlap, merge the release tag, verify, push, and kick off a mine-v* build. Auto-proceeds when the merge is clean; stops for the maintainer only on a real conflict or a feature overlap. Use when upstream martinkoutecky/tine cuts a new release (e.g. the "newer Tine available" toast fires) and you want it merged into your fork.
---

# Sync an upstream release into `mine`

This fork (`nataloko/tine`) carries personal features on top of upstream
`martinkoutecky/tine`. This skill brings a new upstream **release** into the fork's
integration branch and ships a build — reviewing first, and only stopping for a human
when there's something to decide.

## Setup this assumes
- Remotes: **`origin`** = upstream (`martinkoutecky/tine`), **`fork`** = `nataloko/tine`.
- **`mine`** = integration branch (upstream `master` + all fork features); builds ship from here.
- **`feat/*`** = clean per-feature branches — **never touched** by this skill.
- Releases: a **`mine-v*`** tag triggers `.github/workflows/personal-build.yml` (AppImage + Windows).
- Fork feature surfaces (used by the overlap scan): query filter
  (`src/components/Macro.tsx`, `QueryBuilder.tsx`, `src/sheet/config.ts`, `src/editor/queryFilter.ts`),
  bullet threading (`src/bulletThreading.ts`, `src/components/Block.tsx`), the "mine (extras)"
  settings tab (`src/components/Settings.tsx`), the notification-only updater (`src/update.ts`).

## Policy
**Auto-proceed when clean; stop only when there's something to decide.** "Clean" = the merge
preview has **zero conflicts** AND **no upstream commit reimplements a fork feature**. Anything
else → STOP, show the maintainer what's wrong, and ask how to resolve before mutating anything.

---

## Step 1 — Identify the target (read-only)
```bash
git fetch origin --tags
gh release view --repo martinkoutecky/tine --json tagName,name --jq '.name, .tagName'
```
The **sync target is the release tag** (e.g. `v0.5.0`), NOT `origin/master` — master carries
post-release housekeeping (website/flatpak/their-CI/docs) the fork doesn't want. Confirm the tag
is newer than what `mine` already has.

## Step 2 — Review (read-only; mutate nothing yet)
```bash
TAG=v0.5.0                                   # the release tag from step 1
BASE=$(git merge-base mine "$TAG")
git log --oneline "$BASE".."$TAG"            # what's new upstream
git diff --stat "$BASE" "$TAG" | tail -1     # scope
# Conflict preview — empty output after the tree line == clean:
git merge-tree --write-tree --name-only mine "$TAG"
# Files changed by BOTH sides (the only possible conflict/interaction points):
comm -12 <(git diff --name-only "$BASE" mine | sort) <(git diff --name-only "$BASE" "$TAG" | sort)
```
Then judge two things:
- **Conflicts:** does `merge-tree` list any conflicted files?
- **Feature overlap:** do any of the new commits (subjects + diffs) touch the fork feature
  surfaces above — i.e. did upstream implement something the fork already added?
- **Dep/pin check:** did `package.json` / `Cargo.*` change (→ reinstall)? did the lsdoc pin
  (`crates/tine-core/Cargo.toml`) or `src/render/wasm/` change (→ `npm run build:wasm` + wasm-pin)?

## Step 3 — Decision gate
- **CLEAN** (no conflicts AND no overlap) → continue to Step 4 automatically. Report a one-paragraph
  summary of what's being pulled in (commit count, notable fixes, version bump).
- **DIRTY** (conflicts OR a feature overlap) → **STOP.** Present the conflicted files and/or the
  overlapping commits and ask the maintainer how to resolve. Resolution guidance:
  - `src-tauri/tauri.conf.json`: keep **upstream's `version`/`versionCode`**, keep the **fork's
    updater block** (`createUpdaterArtifacts:false`, the `nataloko/tine` endpoint).
  - Additive changes to a shared file (e.g. `app.css`, `Block.tsx`, `App.tsx`): keep both.
  - If upstream **reimplemented a fork feature**, drop the fork's now-redundant version during the
    merge (and note it for removing the corresponding `feat/*` branch).

## Step 4 — Merge + verify
```bash
git checkout mine
git merge --no-edit "$TAG"                   # clean path: a merge commit, no prompts
source scripts/env.sh
npm install                                  # if package.json changed
node scripts/check-wasm-pin.mjs
npx tsc --noEmit
npm test
nix-shell -p cargo rustc gcc pkg-config --run 'cargo test -p tine-core'
npm run build
```
Any gate failure → **STOP and report** (this is where upstream changes to shared files like
`facets.ts`/`store.ts`/`model.rs` surface a semantic break). Sanity-check the merge kept both
sides: `grep -E '"version"|createUpdaterArtifacts|nataloko/tine' src-tauri/tauri.conf.json`.

> Known non-fork noise: on this NixOS host `cargo test` runs under the nixpkgs toolchain, where the
> `derived_cache_fuzz` test can diverge (a HashMap-ordering artifact, unrelated to the fork). If the
> **192 unit tests pass** and only that fuzz test fails, treat it as green and note it; the
> maintainer's pinned toolchain is the authority.

## Step 5 — Push + build
```bash
VER=$(grep -m1 '"version"' src-tauri/tauri.conf.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
git push fork mine
git tag "mine-v$VER" -m "Personal build off mine at upstream v$VER"
git push fork "mine-v$VER"
```
Watch the run (`gh run watch <id> --repo nataloko/tine --exit-status`), then report the release
link (`https://github.com/nataloko/tine/releases/tag/mine-v$VER`) and its assets. If a `mine-v$VER`
tag already exists (a re-run of the same upstream version), suffix it: `mine-v$VER-2`, `-3`, …

## Guardrails
- Read-only until the Step 3 gate clears. Only `mine` is mutated — never the `feat/*` branches.
- Never force-push `mine`. The build fires **only** on the `mine-v*` tag push.
- Merge the **tag**, not `origin/master`. Keep the merge (not rebase) — `mine` has released tags
  in its history.

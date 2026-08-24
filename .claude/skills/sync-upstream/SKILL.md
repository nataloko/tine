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
- **Fork ADRs** live on a separate track under **`docs/adr/mine/`** (`0001+`, own README index),
  NOT interleaved with upstream's `docs/adr/` numbering — so upstream's sequential ADRs never
  collide. A synced upstream ADR just slots into the main `docs/adr/` track (auto-merges — the fork
  has no rows there to conflict); new fork ADRs go in `docs/adr/mine/`. (If an old sync ever left a
  fork ADR on an upstream-range number, move it to `mine/` and fix its cross-refs — never renumber
  into upstream's range.)
- Releases: a **`mine-v*`** tag triggers `.github/workflows/personal-build.yml` (AppImage + Windows).
- Fork feature surfaces (used by the overlap scan). **Never hand-maintain this list** — it
  went stale twice and both times a fork surface (`src/update.ts` in v0.6.91,
  `src/components/AboutTab.tsx` / `src/mock.ts` / `src/persistence.ts` in v0.6.94) was missing
  from it. Step 2 derives it. Two categories:
  - **Shared** — exists upstream AND carries fork edits on top. These are the files that can
    interact silently, so every one upstream touched must be read. Currently ~20 files, from
    the obvious (`Block.tsx`, `Settings.tsx`, `update.ts`, `app.css`) to easily-forgotten ones
    (`AboutTab.tsx`, `mock.ts`, `persistence.ts`, `backend.ts`, `ui.ts`, `App.tsx`,
    `src-tauri/src/lib.rs`, `tauri.conf.json`).
  - **Fork-only** — upstream has never seen these, so they can never conflict:
    `src/editor/queryFilter.ts`(+test), `src/bulletThreading.ts`, `src/git.ts`(+test),
    `src-tauri/src/git.rs`, `src-tauri/nsis/installer.nsi`.

## Policy
**Auto-proceed when clean; stop only when there's something to decide.** "Clean" = the merge
preview has **zero conflicts** AND **no upstream commit reimplements a fork feature** AND
**every shared-surface change was read and is compatible with what the fork does there**.
Anything else → STOP, show the maintainer what's wrong, and ask how to resolve before mutating
anything. A shared-surface change that merges cleanly but changes fork behavior is not a
blocker for the merge — report it, finish the sync, then fix it as a follow-up commit.

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
# Files changed by BOTH sides SINCE BASE (the possible *conflict* points):
comm -12 <(git diff --name-only "$BASE" mine | sort) <(git diff --name-only "$BASE" "$TAG" | sort)

# Fork SHARED surfaces upstream touched this release (the possible *interaction* points).
# DERIVED, never hand-listed: every file the fork edits that also exists upstream. `$BASE` is
# the last upstream state `mine` was synced to, so `$BASE..mine` is exactly the fork's own work.
# NOT a subset of the line above — it catches surfaces `comm` misses, so run both:
SHARED=$(git diff --name-only "$BASE" mine -- src/ src-tauri/ \
  | while read -r f; do git cat-file -e "$TAG:$f" 2>/dev/null && echo "$f"; done)
git diff --stat "$BASE" "$TAG" -- $SHARED

# Did upstream reimplement a fork feature? Any hit here needs reading in full:
git diff "$BASE" "$TAG" | grep -inE 'query-filter|queryFilter|bulletThread|thread-svg|codeHlEnabled|highlightFenced|loadHljs|updateMode|downloadAndInstall|createUpdaterArtifacts|"extras"'
```
Then judge three things:
- **Conflicts:** does `merge-tree` list any conflicted files?
- **Feature overlap:** do any of the new commits (subjects + diffs) touch the fork feature
  surfaces above — i.e. did upstream implement something the fork already added?
- **Silent interaction:** for every shared surface in the `git diff --stat` above, read
  upstream's change against what the fork does in that file — *even when it auto-merges
  and even when it is absent from the `comm` list*. **The trap:** `comm` only catches files
  both sides changed *since BASE*. A fork edit made in an earlier sync is already inside
  BASE, so a file the fork owns behavior in looks upstream-only, merges without a murmur,
  and changes fork behavior anyway. That is exactly how v0.6.91's GH #241 patch to
  `src/update.ts` — an error toast on a self-update path this build can never take —
  reached `mine` unnoticed by every mechanical check.
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
>
> Known upstream slip: a patch release sometimes bumps `version` in `tauri.conf.json` but forgets the
> Android `bundle.android.versionCode`, so `src/version-code.test.ts` fails (versionCode must equal
> `major*1_000_000 + minor*1_000 + patch`, e.g. `0.5.1` → `5001`). Fix it by bumping versionCode to the
> derived value (a 1-line correction; harmless — the fork ships AppImage + Windows, not F-Droid) and note it.
>
> Fork **backend** changes: `cargo test -p tine-core` compiles ONLY the core crate, NOT `src-tauri/`
> (the `tine` app crate). So if an upstream refactor forces a change to a fork `src-tauri/src/*.rs`
> (e.g. `git.rs` when upstream reshaped `AppState`), a compile break there is invisible to the gates
> above and only surfaces in the GitHub build. Catch it locally with a `cargo check` on the app crate
> (needs the WebKit/GTK dev libs the AppImage build uses):
> `nix-shell -p cargo rustc gcc pkg-config webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk libsoup_3 openssl --run 'cargo check -p tine'`

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

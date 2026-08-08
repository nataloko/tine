# Tine (nataloko fork) — agent working agreement

This repository is `nataloko/tine`, a personal fork of upstream
`martinkoutecky/tine`. Fork-only features are layered on upstream and ship in
separate personal builds. The upstream pointer to
`/aux/koutecky/logseq/tine-agents/AGENTS.md` refers to Martin's machine and is
not available here; do not block on it.

## Branches and releases

- `mine` is the integration branch (upstream `master` plus all fork features).
  Builds ship from this branch.
- `feat/*` branches contain clean, individual features. Never alter them during
  the upstream sync flow.
- A `mine-v*` tag triggers `.github/workflows/personal-build.yml` to build the
  AppImage and Windows artifacts.
- Ask before tagging a `mine-v*` build for small or iterative changes.

## Syncing upstream

Use the `sync-upstream` skill. Merge the upstream release tag, not
`origin/master`, because upstream master includes post-release housekeeping the
fork does not want.

When upstream reimplements a fork feature, use upstream's implementation as the
live path and retain the fork's extra behavior around it. Check for semantic
duplicates even when Git reports no conflict. Always keep the fork updater block
in `src-tauri/tauri.conf.json` (`createUpdaterArtifacts: false` and the
`nataloko/tine` endpoint) alongside upstream's version bump.

## Fork feature surfaces

- Query filter (`tine.query-filter::`): `src/editor/queryFilter.ts`,
  `src/components/Macro.tsx`, `src/components/QueryBuilder.tsx`, and
  `src/sheet/config.ts`.
- Bullet threading: `src/bulletThreading.ts` and `src/components/Block.tsx`.
- Live code-highlight overlay and language picker: `src/editor/properties.ts`
  (`fencedCodeBlock` and `isOpeningFenceLine`).
- Git integration: `src-tauri/src/git.rs` and Settings.
- "mine (extras)" settings tab: `src/components/Settings.tsx`.
- Notification-only updater: `src/update.ts` and `src/update.test.ts`. The
  divergence is one line — `updateMode()` returns `"manual"` on every desktop
  platform, where upstream returns `"self"` on Windows/Linux — so the Download
  action opens the releases page and upstream's `check()` /
  `downloadAndInstall()` block is never reached. Keep that block unedited so
  upstream's fixes to it keep merging cleanly; the fork test asserts the
  updater is never called, which conflicts whenever upstream edits its own
  GH #241 test. Both edits carry `FORK:` comments. Note `REPO` deliberately
  points at `martinkoutecky/tine`: the toast announces *upstream* releases,
  which is the signal to run this sync.
- Fork ADRs: `docs/adr/mine/` (its own numbering and README), not the upstream
  `docs/adr/` sequence.

## Build and verification

Source `scripts/env.sh` first. It configures the Rust toolchain paths, native
library paths, and persistent build cache.

Cargo commands run in `nix-shell` with `cargo rustc gcc pkg-config`. The `tine`
app crate also needs `webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk
libsoup_3 openssl`.

Run these gates before shipping:

```bash
npx tsc --noEmit
npm test
npm run build
nix-shell -p cargo rustc gcc pkg-config --run 'cargo test -p tine-core'
nix-shell -p cargo rustc gcc pkg-config webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk libsoup_3 openssl --run 'cargo check -p tine'
```

The public roadmap is `docs/BACKLOG.md`. Architecture decisions are in
`docs/adr/`, with fork-specific decisions in `docs/adr/mine/`.

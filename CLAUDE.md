# Tine (nataloko fork) — Claude Code working agreement

This repo is **nataloko/tine**, a personal fork of upstream **martinkoutecky/tine**: fork-only
features layered on upstream, shipping its own builds. Upstream keeps a separate *private* agent
agreement at `/aux/koutecky/logseq/tine-agents/AGENTS.md` — that's Martin's machine, never on this
one, so don't block on it (`AGENTS.md` here is upstream's pointer to it; Codex reads it, unused in a
Claude-only workflow). **This file is the fork's own agreement.**

## Branches & releases
- **`mine`** — integration branch (upstream `master` + all fork features). Builds ship from here.
- **`feat/*`** — clean per-feature branches; never touched by the sync flow.
- A **`mine-v*`** tag triggers `.github/workflows/personal-build.yml` (AppImage + Windows).
- **Ask before tagging a `mine-v*` build** for small/iterative changes.

## Syncing upstream — use the `/sync-upstream` skill
Merge the upstream **release tag** (not `origin/master` — master carries post-release housekeeping the
fork doesn't want). On a **feature overlap** (upstream reimplemented something the fork already did):
**adopt upstream's implementation as the live path and keep the fork's extras around it.** Watch for
overlaps that are *semantic* duplicates git auto-merges without a conflict — scan behaviourally, not
just by conflict markers. Always keep the fork's `tauri.conf.json` updater block
(`createUpdaterArtifacts:false`, `nataloko/tine` endpoint) alongside upstream's version bump.

## Fork feature surfaces
- **Query filter** (formula `tine.query-filter::`): `src/editor/queryFilter.ts`,
  `src/components/Macro.tsx`, `QueryBuilder.tsx`, `src/sheet/config.ts`
- **Bullet threading**: `src/bulletThreading.ts`, `src/components/Block.tsx`
- **Live code-highlight overlay + language picker**: `src/editor/properties.ts`
  (`fencedCodeBlock`, `isOpeningFenceLine`)
- **Git integration**: `src-tauri/src/git.rs` + Settings
- **"mine (extras)" settings tab**: `src/components/Settings.tsx`
- **Notification-only updater**: `src/update.ts`
- **Fork ADRs** live on their own track in **`docs/adr/mine/`** (0001+, own README) — NOT interleaved
  with upstream's sequential `docs/adr/` numbering, so syncs never collide.

## Build & verify
`source scripts/env.sh` first — it sets `CARGO_HOME`/`RUSTUP_HOME`/`CARGO_TARGET_DIR` + native-lib
paths, and makes `./target` a symlink to the persistent build cache (so `git clean`/new sessions stay
warm). Cargo runs under `nix-shell -p cargo rustc gcc pkg-config …` here (no pinned rustup); the app
crate (`tine`) additionally needs `webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk
libsoup_3 openssl`. Gates before shipping:
- `npx tsc --noEmit` · `npm test` · `npm run build`
- `cargo test -p tine-core` (core) · `cargo check -p tine` (**app crate — catches fork `src-tauri`
  breaks the core test can't see**)

Public roadmap: `docs/BACKLOG.md`.

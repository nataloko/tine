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
- Live code-highlight overlay and language picker. Fork-only symbols:
  `fencedCodeBlock` / `CodeFence` (`src/editor/properties.ts`),
  `highlightFencedForOverlay` (`src/render/body.tsx`), the whole of
  `src/codeHighlightSettings.ts`, and `src/render/codeOverlay.test.tsx`. It also
  wires through `src/components/Block.tsx` (the `codeEdit` memo), `src/App.tsx`,
  `src/components/Settings.tsx`, and `src/styles/app.css`. `loadHljs`
  (`src/render/body.tsx`) and `codeLanguageItems` (`src/editor/autocomplete.ts`)
  exist upstream too — use upstream's, don't re-add.
- Git integration: `src-tauri/src/git.rs` and Settings.
- "mine (extras)" settings tab: `src/components/Settings.tsx`.
- Notification-only updater: `src/update.ts`, `src/update.test.ts`, and
  `src/components/AboutTab.tsx`. One behavior drives all of it — `updateMode()`
  returns `"manual"` on every desktop platform, where upstream returns `"self"`
  on Windows/Linux — so upstream's `check()` / `downloadAndInstall()` block is
  never reached and the toast action opens the releases page instead. Keep that
  block unedited so upstream's fixes to it keep merging cleanly. Three edits
  follow from it, each carrying a `FORK:` comment:
  - `offerUpdate()` labels its action `"Open releases"`; upstream labels it
    `"Install update"`, which would be a lie here.
  - The About tab reports "available upstream … Merge it into your fork."
  - `update.test.ts` asserts the updater is never called and retargets both
    action-label assertions. It conflicts whenever upstream edits its own
    GH #241 test.

  Upstream's doc comments in `update.ts` still name the old `"Download"` label
  and the `"Install update"` action; they are deliberately left unedited, since
  correcting them buys nothing and costs merge cleanliness. Note `REPO`
  deliberately points at `martinkoutecky/tine`: the toast announces *upstream*
  releases, which is the signal to run this sync.
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

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
  `src/sheet/config.ts`. Since v0.6.982 the ƒ-filter button's field hints read
  upstream's ONE shared facets resource in `QueryBuilder` (`sharedQueryResult`,
  keyed on graphEpoch+dataRev) rather than calling `queryFacets()` again — the
  fork's own `createResource` was adopted away at that sync. In `Macro.tsx` the
  filter derives from `groups()`, which upstream's `withoutHostBlock` (GH #469)
  already strips the host block from; keep that order. The fork's
  `scripts/shot-advanced-switch.mjs` shoots the ƒ-filter button instead of
  upstream's retired Datalog switch; it MUST use
  `e2e-capabilities.mjs::waitForHttpServer` — `scripts/e2e-capabilities.test.mjs`
  (I-12/DUP-12b) fails any `scripts/*.mjs` that defines its own `waitForServer`.
- Bullet threading: `src/bulletThreading.ts` and `src/components/Block.tsx`.
- Git integration: `src-tauri/src/git.rs` and Settings. Since v0.6.981,
  upstream's producer census (`crates/tine-core/src/projection_producer_census.rs`)
  pins every `src-tauri` mutation primitive and process construction site, so it
  carries two `FORK:`-commented rows for `git.rs` (one `fs.write`, one
  `Command::new`); any change to what `git.rs` writes or spawns must update those
  pins. Since v0.6.982, upstream's typed error boundary (I-9) constrains it too.
  `src/typedErrorRatchet.test.ts` requires zero `Result<_, String>` and zero
  `map_err(|e| e.to_string())` in every `src-tauri/src/*.rs`, so `git.rs` returns
  `CommandError`. It builds the variants DIRECTLY (`CommandError::Prose`,
  `CommandError::Worker`) instead of the lowercase constructor helpers, because
  `src-tauri/src/backend_command_parity.rs` fingerprints every lowercase-helper
  mapper site and pins the count — routing through a helper would force the fork
  to re-pin an upstream constant, and re-pin it at every sync. Same wire value.
  The same ratchet forbids classifying a backend result by parsing its message,
  so `GitResult` carries `needs_pull` and `src/git.ts` reads that field instead
  of matching "Pull first" in the detail. Do not name the lowercase helper in a
  comment either — the ratchet greps its raw name.
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
    GH #241 test. Since v0.6.981 it also drops (with a `FORK:` comment)
    upstream's end-to-end "sanitizes the opt-in error chain" test, which drives
    the self-update failure path this build can't reach; upstream's pure
    `classifyUpdaterFailure` table test is kept.

  Upstream's doc comments in `update.ts` still name the old `"Download"` label
  and the `"Install update"` action; they are deliberately left unedited, since
  correcting them buys nothing and costs merge cleanliness. Note `REPO`
  deliberately points at `martinkoutecky/tine`: the toast announces *upstream*
  releases, which is the signal to run this sync.
- Line-anchored allowlists the fork drifts: `CONSOLE_ALLOWLIST` in
  `src/contentOutOfLogs.ratchet.test.ts` (six pins) and
  `ERROR_STRING_CLASSIFIER_ALLOWLIST` in `src/typedErrorRatchet.test.ts` (one)
  pin upstream sites by LINE NUMBER, and fork insertions above them shift every
  one. Each carries a `FORK:` comment. On a conflict take upstream's numbers,
  re-run the test, and re-anchor to whatever it reports — the site, method and
  class are always upstream's; only the line moves.
- Fork ADRs: `docs/adr/mine/` (its own numbering and README), not the upstream
  `docs/adr/` sequence.

### Retired

- **Live code-highlight overlay** (retired at the v0.6.95 sync). Upstream GH #357
  gave the block editor its own whole-block code-fence presentation
  (`codeFenceOnly` in `src/editor/codeFence.ts`, the `.code-edit` card,
  `wrap="off"`), which occupies the same element and state as the fork's
  highlighted overlay and cannot coexist with it — the card is opaque and
  no-wrap, the overlay needs a transparent `pre-wrap` textarea to stay aligned.
  Upstream's is now the live path. Removed: `src/codeHighlightSettings.ts`,
  `src/render/codeOverlay.test.tsx`, `fencedCodeBlock`/`CodeFence`,
  `highlightFencedForOverlay`, the extras toggle, and the `.code-editing` /
  `.code-hl-overlay` CSS. The fork's `.code-block code` wrap override was also
  reverted to upstream's `white-space: pre`, since it existed only to match the
  fork's wrapping editor. `feat/codeblock-editing` was deleted at that sync
  (tip was `fc0a73c0`; its commits remain ancestors of `mine`).
- **Page-rename navigation remap** (retired at the v0.6.97 sync). Upstream's
  DUP-2 favorites work rewrote `renamePageInNavigation` in `src/ui.ts` around a
  single identity-folded membership key (`favoriteKey`, `pageIdentityKey`) as
  part of the nested-favorites refactor (`favoritesStore`, `favoritesLayout`).
  The fork's version was adopted away wholesale rather than combined: upstream's
  function is now the live path verbatim, so the third `kind: PageKind` overload
  parameter and the case-insensitive namespace-descendant remapping are both
  gone. A rename no longer follows the renamed page's namespace children in
  favorites, recents, or the sidebar. Removed with it: the fork test
  `"renamePageInNavigation remaps favorites + recents (exact + namespace child,
  case-insensitive)"` in `src/store.test.ts`, which asserted exactly that
  behavior. No `feat/*` branch carried this — it only ever lived on `mine`.

## Build and verification

Source `scripts/env.sh` first. It configures the Rust toolchain paths, native
library paths, and persistent build cache. It activates only when
`../.toolchain/cargo/bin/rustup` exists; if that mount has been wiped it stays
silent, `CARGO_TARGET_DIR` is never exported, and the repo's `./target` symlink
dangles — cargo then fails with `failed to create directory .../target: Not a
directory`. Fix with `mkdir -p ../.toolchain/target` (the symlink resolves again
and the cache stays off the repo); `nix-shell` supplies cargo/rustc regardless.

Cargo commands run in `nix-shell` with `cargo rustc gcc pkg-config`. The `tine`
app crate also needs `webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk
libsoup_3 openssl`.

Run these gates before shipping:

```bash
npx tsc --noEmit
npm test
npm run build
# NOT `cargo test -p tine-core` — see the note below. This is upstream's release gate:
PATH="<dir with cargo-nextest 0.9.143>:$PATH" nix-shell -p cargo rustc gcc pkg-config \
  --run 'node scripts/tine-core-nextest-contract.mjs --mode linux --run-selection'
nix-shell -p cargo rustc gcc pkg-config webkitgtk_4_1 gtk3 librsvg glib cairo pango gdk-pixbuf atk libsoup_3 openssl --run 'cargo check -p tine'
```

On this host `src/conflictAuthority.guard.test.ts`'s source-scanning case sits
right on Vitest's 5s default (4.4s of real work), so `npm test` may report it as
`Test timed out in 5000ms` with no assertion failure. That is a host-speed
artifact, not a violation: re-run it with `--testTimeout=30000` and it passes
with zero findings. Upstream's test is unmodified.

**Never run bare `cargo test -p tine-core`.** The bare package still contains the
pre-0.7 adversarial actor oracle: it is deterministically red and several of its
scenarios never terminate, so the run hangs and prints no summary. Those reds are
not a regression, and neither upstream CI nor their release ever runs them. Cross-
check any failure against the exclusions before calling it broken. Since v0.6.982
those live in two places, NOT the old `PRE_07_SYNC_RUNTIME_EXCLUDED_TEST_NAMES`
(gone): `KNOWN_RED_SYNC_RUNTIME_FAILURE_FAMILIES` in
`scripts/tine-core-nextest-contract.mjs`, plus a version-keyed ledger in
`scripts/release-ci-exception.{mjs,json}` that activates for exactly the version
in `package.json` — `0.6.982` today. Any other version (including v0.6.983) gets
the strict contract, so the next sync re-measures from scratch.

The curated selection above is also stricter: one process per test, a 5-minute
per-test timeout, no retries. It needs cargo-nextest **exactly 0.9.143** (nixpkgs
has 0.9.140, and the prebuilt binary needs `patchelf` on NixOS — see the
`sync-upstream` skill for the one-time fix). At v0.6.982 it reports
`2065 tests run: 2065 passed, 137 skipped` in ~15 min.

Under full-run CPU contention on this host, `sync_runtime::tests` scaled-fixture
scenarios can fail on an ITERATION bound rather than a clock:
`drain_until_settled` polls 32 ticks and gives up, so a starved run can still be
`Recovering` at tick 32 and panic with 32 `Recovering` values. Seen once at the
v0.6.982 sync on
`startup_scan_absences_coalesce_into_one_sweep_across_a_mid_scan_crash`, which
then passed 3/3 in isolation and green on a full re-run. Re-run before treating
any such failure as real — and note the fork touches no `sync_runtime` code, so
a failure there is never a fork regression.

The public roadmap is `docs/BACKLOG.md`. Architecture decisions are in
`docs/adr/`, with fork-specific decisions in `docs/adr/mine/`.

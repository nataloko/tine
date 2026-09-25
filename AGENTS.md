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

- Bullet threading: `src/bulletThreading.ts`,
  `src/components/block/bulletThread.tsx`, and a few call sites in
  `src/components/Block.tsx`. Since v0.6.986 the fork also re-pins upstream's new
  `src/e2eLabelSelectorRatchet.test.ts`: upstream's plugin-registry fixture ships
  a community plugin whose display name is literally "Bullet threading"
  (`page.tine.bullet-threading`), and the fork's extras tab labels its toggle the
  same way, so that journey's selector reclassifies from fixture string to `src/`
  match — `scripts/e2e-plugins.mjs` is `[1, 5]` here where upstream has `[0, 6]`.
  A pure classification move; the journey still selects the plugin card, not a
  Settings tab. Same false-positive family as the `query-filter` plugin below. Since v0.6.984 the presentation lives in that
  block module rather than inline, because upstream's budget B1
  (`src/fileSizeRatchet.test.ts`) caps a production file at 4,000 lines and
  shipped `Block.tsx` at 3,995 — five lines of headroom for the whole fork. At
  v0.6.986 upstream reached 4,000 exactly, so there is now NO headroom and the
  pin is the only thing holding the file. The
  extraction cut the fork's footprint there from 94 lines to 10, which is
  irreducible (two imports, a `classList` spread, a `style`, one element, the
  calc latch, and the calc slash case), so `Block.tsx` also carries the ONLY
  entry in that test's `PINNED` map. The pin must equal the file's exact line
  count: when upstream grows the file the test fails and names the new number —
  take it. `src/components/block/calcBlock.ts` holds the fork's other two
  `Block.tsx` behaviours (the mid-session calc-fence latch and the
  `/Calculator` slash insert) for the same budget reason. `readBlockModuleSource()`
  globs `src/components/block/`, so every guard that reads `Block.tsx` still
  sees all of it — the seam hides nothing.
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
  comment either — the ratchet greps its raw name. Since v0.6.984 upstream's
  published-query export forces a third pin: `src/publishedBackend.guard.test.ts`
  requires EVERY `Backend` method to be classified, so the seven `git*` methods
  are listed (with a `FORK:` comment) in `PUBLISHED_REFUSED_METHODS` —
  `gitStatus` included, since a baked export has no working tree to read. A new
  fork backend command must be classified there or that guard goes red. Since
  v0.6.986 a fourth pin applies: upstream's `src/dataRevReads.guard.test.ts`
  (GH #543 R11-09) demands a named owner for every `dataRev` use in `src/`, so
  `src/git.ts` carries a `FORK:` row saying it owns no index read at all — its
  one use arms the 60s auto-commit debounce.
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
- Fork CSS: `src/styles/app/70-mine.css`, imported last from
  `src/styles/app.css`. Upstream split `app.css` into `src/styles/app/00..40-*.css`
  at v0.6.984 and those modules sit at their B1 budget, so fork rules appended
  into them push the file over the cap AND collide every sync. Upstream then took
  `50-conflict-overview.css` and `60-indexing-progress.css` at v0.6.986, so the
  fork's module moved from `50-mine.css` to `70-mine.css`: the import list
  conflicts EVERY sync (both sides append), and the fork's entry must end up last.
  Renumber rather than let a low number sit below a higher one. Everything the
  fork styles (`.thread-svg`, `.git-badge`, `.git-actions`) lives in this one
  file it owns outright. All new selectors, so its last position only decides
  ties. `src/testSource.ts::readAppStylesheet` expands `@import`s, so every CSS
  guard still sees these rules; `src/styles/cascadeOrder.test.ts` requires base
  declarations BEFORE any `@media`/`@container` that overrides them.
- Fork ADRs: `docs/adr/mine/` (its own numbering and README), not the upstream
  `docs/adr/` sequence.
- Fork doc notes: `docs/DEVELOPING.md` carries the `CARGO_TARGET_DIR` /
  persistent-cache paragraph. It lived in `README.md` until v0.6.986, when
  upstream's website-and-README reorg moved the whole Build-and-run section out
  to `docs/DEVELOPING.md` and `docs/RELEASE-CHECKLIST.md`. `README.md` is now
  taken from upstream verbatim; if a sync conflicts there again, check where the
  section went before re-applying anything.

### Retired

- **Query formula refinement** (`tine.query-filter::`, retired at the v0.6.984
  sync; fork ADR `mine/0001`). Upstream v0.6.983 replaced the Clause-based visual
  builder with a new query IR and removed every symbol the fork's ƒ-filter button
  was built on — `parseQuery`, `toDsl`, `Clause`, `advancedToClause`,
  `getSimpleForm`, `clearSimpleForm`, `stashSimpleForm` all left
  `src/editor/queryBuilder.ts` in a 2,428-line rewrite — along with the
  `.qb-advanced` chip bar that hosted it. `src/components/QueryBuilder.tsx` and
  `src/components/Macro.tsx` were taken upstream VERBATIM. Upstream's new inline
  Display panel (`QueryDisplay`, `.qd-panel`) owns view, grouping, sort, columns,
  totals and limit but has no formula-filter slot, so nothing replaces this; the
  engine was salvageable but its only affordance was not, so the feature went
  whole rather than becoming unreachable code. Removed: `src/editor/queryFilter.ts`
  (+test), the `queryFilter` field and `tine.query-filter` branch in
  `src/sheet/config.ts` (+ two `config.test.ts` cases), the `filterKey` field on
  `FormulaEditorTarget` in `src/ui.ts` and its use in
  `src/components/FormulaEditor.tsx` (+ its test case), the fork's
  `QueryMacro.test.tsx` cases, and the `.query-filter-error` CSS.
  `scripts/shot-advanced-switch.mjs` reverted to upstream's file, which now
  shoots a datalog query's ran/ignored note. Beware the false positives when
  grepping: upstream owns a community plugin literally named `query-filter`
  (`page.tine.query-filter`, `scripts/shot-plugin-docs.mjs`) and a
  `"query-filters"` workspace id — neither is this feature. Upstream's own
  `tine.filter::` is unrelated and still filters sheet views. `feat/query-filter`
  (tip `ede2f6db`, also on the `fork` remote) was left untouched — the sync flow never
  alters a `feat/*` branch — but it now targets an architecture that no longer
  exists, so it is historical. Deleting it is a separate, deliberate call.
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
  fork's wrapping editor. One leftover from it survived until v0.6.984, when the
  fork's removal of `overflow-x: auto` from `.code-block` was reverted too:
  upstream's new `scripts/check-code-scrollbar.mjs` asserts that block scrolls
  horizontally. `feat/codeblock-editing` was deleted at that sync
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
`../.toolchain/cargo/bin/rustup` exists. That mount gets wiped periodically, and
then env.sh stays silent and never exports `CARGO_TARGET_DIR`. That alone is
harmless — the repo's `./target` symlink still points at
`../.toolchain/target`, so cargo writes to the persistent mount anyway and the
cache stays warm. What breaks is the symlink DANGLING, i.e. the target directory
itself gone: cargo then fails with `failed to create directory .../target: Not a
directory`. Fix with `mkdir -p ../.toolchain/target`. Either way `nix-shell`
supplies cargo/rustc, so check the symlink target before assuming env.sh matters.

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

This host has **4 cores**, and Vitest's default worker count starves the
timing-sensitive suites: a default `npm test` here reported 10 failures on one
run and 19 on the next, across `store.test.ts`'s selection-move burst cases, the
source-scanning guards (`conflictAuthority`, `resourceReads`, `clipboard`,
`pagePropsEditorSurface`), `themeCheckerCli`, `systemBars`, `systemTheme` and
`clipboard.paste`. Every one passed in isolation, and the whole suite is green
at `npx vitest run --maxWorkers=2 --testTimeout=30000` (4,053 passed, 2 skipped,
~4.5 min at v0.6.986). Use that invocation as the real signal; a failure that
survives it is a real failure. None of these tests is modified by the fork.

`npm test` is more than Vitest, and upstream keeps adding steps to it — at
v0.6.986 it also runs `test:search-scaling-fixture`, `test:script-identifiers`
and `test:e2e-provenance`, and `test:e2e-harness` grew to seven files. Run the
two Vitest passes with the worker settings above, then the remaining `npm test`
scripts individually; all of them are quick. The render pass
(`vitest run --config vitest.render.config.ts`) takes ~13.5 min here on its own
(229 files, 2,040 tests).

**The known-red exclusion list is now EMPTY, and the machinery that carried it is
gone.** Every red it ever named was a Managed Storage runtime defect, and v0.6.984
removed Managed Storage (ADR 0066), so upstream deleted
`scripts/release-ci-exception.{mjs,json}` outright and
`KNOWN_RED_TINE_CORE_EXCLUDED_TEST_NAMES` in
`scripts/tine-core-nextest-contract.mjs` is `[]` — the Linux filterset is now
plain `all()`. Both `PRE_07_SYNC_RUNTIME_EXCLUDED_TEST_NAMES` and
`KNOWN_RED_SYNC_RUNTIME_FAILURE_FAMILIES` are also gone. Adding a name back is
an open-bug declaration, not a waiver.

Keep running the contract script rather than bare `cargo test -p tine-core`
anyway: it is upstream's actual release gate and it is the stricter one — four
hash shards, one process per test, and no retries, none of which plain libtest
gives you. The timeout is `slow-timeout = { period = "5m", terminate-after = 2,
on-timeout = "fail" }` in `.config/nextest.toml`: a test is MARKED slow at 5
minutes but KILLED at 10, which matters on this host (see the fuzz test below).
The old hazard (scenarios that never terminate, so the bare run hangs and prints
no summary) left with Managed Storage, but the bare command has NOT been re-tested
on this fork since; treat it as unverified, not as known-good.

It needs cargo-nextest **exactly 0.9.143** (nixpkgs has 0.9.140, and the prebuilt
binary needs `patchelf` on NixOS — see the `sync-upstream` skill for the one-time
fix). NOTE: the patched interpreter is a `/nix/store` path, so a later garbage
collection breaks the binary again with `cannot execute: required file not
found`. Re-run the same `patchelf` line; the fix is idempotent.

At v0.6.986 the gate reports `1949 tests run: 1946 passed (1 slow), 2 failed,
1 timed out, 44 skipped` in ~20 min. All three reds were triaged at that sync and
NONE is a fork regression. The proof is structural rather than comparative: the
fork's ENTIRE `crates/` delta against the release tag is 8 added lines inside two
`#[test]` pin tables in `projection_producer_census.rs`
(`git diff --stat v0.6.986 mine -- crates/`). Test-only data tables cannot change
runtime throughput or scheduling, so a slow or worker-starved core test here is
this host, not the fork. Re-run that one-line diff next sync before spending time
on a pristine-tree comparison.

- `model::tests::the_registry_build_is_measured_and_bounded` asserts
  `median < 2_000_000` µs. Measured 4,240,687 µs in the full run and 2,138,153 µs
  in isolation — so at v0.6.986 it fails even ALONE, by ~7%, where at v0.6.984 it
  still passed in isolation at 2,460,217 µs under contention. A performance bound
  on a weak CPU, not a correctness failure. Expect it to stay red.
- `model::tests::gh543_r12::a_corrupt_derived_row_asks_for_a_new_image` (new at
  this release) fails in the full run and PASSES in isolation in 0.78s. It waits
  on a background index worker (`wait_ready(10s)`, `wait_drained_test()`), and the
  failure's own state dump shows the tell: `rebuild=true building=false
  worker_available=true worker_busy=false` — the rebuild was owed and never got
  scheduled. Contention, not logic. Check it in isolation first.
- `derived_cache_fuzz::derived_cache_matches_fresh_under_random_edits` is now
  KILLED at the 600s terminate-after bound. It still PASSES in isolation, in
  798s — up from ~365s at v0.6.984 although the test file itself is byte-identical
  upstream, because the derived-cache path under it was rewritten by the GH #543
  and compact-projection work. A duration problem on this host only.

Upstream's v0.6.984 red
`direct_projection::tests::cold_open_streams_without_retaining_the_graph` is FIXED
at v0.6.986 and no longer appears; the note about reproducing it on a pristine tag
can go.

The public roadmap is `docs/BACKLOG.md`. Architecture decisions are in
`docs/adr/`, with fork-specific decisions in `docs/adr/mine/`.

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

Exception, first hit at v0.7.0: when the release tag does NOT descend from the
last release `mine` synced, merge upstream's own commit that joins that tag into
master instead. v0.7.0 was cut from a separate Beta line that split off master on
2026-07-22, so v0.6.984 to v0.6.987 are not its ancestors; upstream joined it in
`84f4de34a` ("Merge Tine 0.7.0 into master"), which keeps the release tree whole
and leaves master's 0.6.x code "superseded and left to history". Merging the bare
tag would have used the July base and silently woven superseded 0.6.98x hunks
into 0.7 code wherever they auto-merged. The join's base with `mine` was
v0.6.987, so only the fork's own changes replayed (22 conflicts). The join adds
only history and publishing paths over the tag (`website/`, `docs/releases/`,
`fastlane/`, CHANGELOG 0.6.x sections, the F-Droid monitor). The skill checks for
this in Step 1.

When upstream reimplements a fork feature, use upstream's implementation as the
live path and retain the fork's extra behavior around it. Check for semantic
duplicates even when Git reports no conflict. In `src-tauri/tauri.conf.json`,
always keep upstream's `version`/`versionCode` and updater endpoint, and the
fork's `createUpdaterArtifacts: false` and NSIS `template` (see the updater
bullet below for why the endpoint is upstream's since v0.7.0).

## Fork feature surfaces

0.7 replaced the 0.6.x guard set the fork used to pin against. Gone with the 0.6
line, so none of their old fork pins exist any more: `src/fileSizeRatchet.test.ts`
(budget B1), `src/typedErrorRatchet.test.ts` and `CommandError` (I-9),
`crates/tine-core/src/projection_producer_census.rs`,
`src/dataRevReads.guard.test.ts`, `src/e2eLabelSelectorRatchet.test.ts` and
`backend_command_parity.rs`. Do not resurrect them. 0.7's own checks that
constrain the fork are in `src/ogEnforcement.test.ts`, driven by
`scripts/lib/og-enforcement.mjs`:

- **Size ratchet.** A production file (`src/`, `src-tauri/src/`, `crates/`) may
  not exceed 1,500 lines, and a file already over that at the frozen baseline
  `2d0349368` may not grow past its baseline count. Fork code therefore lives in
  fork-only files, with only a few hook lines in upstream files. `src/backend.ts`
  is the tight one: 1,498 of 1,500 at v0.7.0, so the fork has two lines of
  headroom there.
- **Writer sites.** Every low-level file write per file is counted. The fork
  pins `src-tauri/src/git.rs` (one `fs::write`, the default `.gitignore`) with a
  `FORK:` row in `APPROVED_WRITER_SITES`. Any new write in `git.rs` must update it.

The surfaces:

- Bullet threading: `src/bulletThreading.ts` (reads the outline through
  `node`/`childIds` from `src/document`, 0.7's document boundary; `src/store.ts`
  is gone), `src/components/block/bulletThread.tsx`, and four lines in
  `src/components/Block.tsx` (an import, a `classList` spread, a `style`, one
  element). Keep the fork's SVG elbows as the live path every sync. Upstream's
  community plugin literally named "Bullet threading" (`page.tine.bullet-threading`)
  is unrelated.
- Calculator: `src/components/block/calcBlock.ts` holds the one calc behavior the
  fork adds, the mid-session calc-fence latch (two lines in `Block.tsx`: import
  and call). It switches calc mode on when a block BECOMES a ```` ```calc ````
  fence some way other than a completion. The `/Calculator` slash insert is
  upstream's GH #57 (see Retired).
- Git integration (fork ADR `mine/0002`):
  - `src-tauri/src/git.rs` plus three edits in `src-tauri/src/lib.rs` (`mod git;`,
    the `use`, seven handler names). Errors are plain `Result<_, String>`
    again, like every 0.7 command; `GitResult` still carries `needs_pull`, so
    `src/git.ts` never parses the detail text.
  - `src/gitBackend.ts` owns the frontend contract: `GitStatus`, `GitResult`, the
    `GitBackend` interface, `installGitCommands` (puts the seven methods on
    `TauriBackend.prototype`, each through the class's own `call`), and
    `mockGitCommands` (spread into `mockBackend()`). `src/backend.ts` carries
    four `FORK` lines: the import, `Backend extends GitBackend`,
    `interface TauriBackend extends GitBackend {}`, and the install call.
    `src/mock.ts` carries two. Import the git types from `./gitBackend`;
    `backend.ts` does not re-export them.
  - `src/publishedBackend.ts` lists the seven `git*` methods in
    `PUBLISHED_REFUSED_METHODS`. Its guard only sees direct `Backend` members, so
    it no longer demands them, but the refusal is still the right behavior.
  - `src/gitSaves.ts` is the auto-commit's view of saving. 0.7 no longer bumps
    `dataRev` when a save lands, so upstream's `notePublished()` in
    `src/document/save/engine.ts` (called at every landed save) carries one
    `FORK` call to `noteSavedForGit()`, plus its import. `src/git.ts` re-arms the
    60s idle debounce on `savedRev` and on `dataRev` (now in `src/graphSession.ts`,
    bumped by deletes and external reloads), and names the commit's pages from
    `drainSavedPages()`.
  - `src/App.tsx`: imports, `initGit()` on mount, the topbar badge beside
    `TopbarOverflowMenu`, and the commit-on-close inside the close handler,
    after `safeClose.prepare()` accepts (the disk is current there).
- "mine (extras)" settings tab: `src/components/ExtrasTab.tsx` (fork-only; the
  tab, the git section and its confirm dialogs). `src/components/Settings.tsx`
  carries three lines (import, `TABS` row, one `<Show>`),
  `src/components/settingsSearch.ts` two search rows, and `src/ui.ts` adds
  `"extras"` to `SettingsTabId`.
- Notification-only updater: `src/update.ts`, `src/update.test.ts`,
  `src/components/AboutTab.tsx` and `src-tauri/tauri.conf.json`. 0.7 rewrote the
  updater: it no longer fetches GitHub's API, it asks the Tauri updater plugin
  (`check()`), which reads the endpoint in `tauri.conf.json`. So since v0.7.0 the
  fork's endpoint is UPSTREAM's stable manifest
  (`martinkoutecky/tine/releases/latest/download/latest.json`; decided
  2026-10-08). That keeps the toast announcing upstream releases, which is the cue
  to run this sync, and upstream's `src/updateChannel.guard.test.ts` passes
  unedited. The old `nataloko/tine` endpoint would have made the notifier silent
  forever, because the fork publishes no manifest (`createUpdaterArtifacts:
  false`). One behavior keeps it safe: `updateMode()` returns `"manual"` on every
  desktop platform, so upstream's download, exit-gate, install and relaunch
  block is never reached. That matters more now: the endpoint and `pubkey` are
  upstream's, so `"self"` would install stock Tine over the fork. Keep that
  block unedited so upstream's fixes keep merging. The fork's edits, each
  marked `FORK:`:
  - `update.ts`: the header note, `updateMode()`'s `return "manual"` (and the
    dropped `browserPlatform` import it left unused), and the `"Open releases"`
    action label where upstream says `"Install update"`.
  - `AboutTab.tsx`: "available upstream … Merge it into your fork."
  - `update.test.ts`: a header note; two label assertions retargeted; the GH #241
    "checks without installing" test retargeted to assert the action opens the
    releases page and `check()` runs once; and 11 install-path tests marked
    `it.skip`/`it.skip.each` (stable payload refusal on the install check, the
    GH #343 failed-install report, and the whole exit-gate block except its App
    source scan). Skipped rather than deleted so upstream's edits to them keep
    merging; expect `45 passed | 11 skipped` for the updater files.
- Full highlight.js: `src/render/body.tsx` lazy-loads `highlight.js` (every
  language) where upstream loads `highlight.js/lib/common`.
- Fork CSS: `src/styles/mine.css`, imported last from `src/main.tsx`. 0.7 has no
  `src/styles/app/` split and no `@import` list in `app.css` (other stylesheets
  are imported from `main.tsx`), so the old `70-mine.css` numbering is gone.
  Everything the fork styles (`.thread-svg`, `.git-badge`, `.git-actions`) lives
  there, all new selectors, so its last position only decides ties.
- Fork ADRs: `docs/adr/mine/` (its own numbering and README), not the upstream
  `docs/adr/` sequence. `docs/adr/README.md` takes upstream's table and appends
  the fork pointer paragraph.
- Fork doc notes: the `CARGO_TARGET_DIR` / persistent-cache paragraph lives in
  `mine.md` ("Build cache"). 0.7 deleted `docs/DEVELOPING.md` and put Build & run
  back in `README.md`, which the fork takes verbatim.
- `src-tauri/tauri.conf.json` also keeps the fork's NSIS `template`
  (`nsis/installer.nsi`) beside upstream's new `installerHooks`
  (`tine-url-hooks.nsh`, tine:// links). The vendored template already includes
  `{{installer_hooks}}`; Tauri CLI was still 2.11.2 at v0.7.0, so no re-vendor.

### Retired

- **`/Calculator` slash insert** (retired at the v0.7.0 sync). The fork's
  `"calc-block"` slash action and `insertCalcBlock()` (2026-07-11) were
  reimplemented two days later by upstream's GH #57, which lets any completion
  that lands a ```` ```calc ```` fence switch the mounted editor into calc mode
  (`enteredCalc` in `Block.tsx`'s completion handler). Both lived side by side
  unnoticed until v0.7.0, the fork's action overriding upstream's. Upstream's is
  now the live path: `src/editor/autocomplete.ts` is upstream's verbatim (its
  `Calculator` entry inserts the fence), and the `calc-block` case left
  `Block.tsx`. The fork's latch for hand-typed fences stays (see Calculator
  above), with its `Block.calcBlur.test.tsx` case.
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

# External diagram editors — light integration (drawio; Excalidraw later)

Status: **drawio implemented** (2026-07-07). Generalizes the same "render + edit
externally + refresh" shape as [`excalidraw-assets-spec.md`](excalidraw-assets-spec.md).

## 1. Goal & non-goals

Let a user draw a diagram "in the middle of a note" without Tine bundling an
editor. The trick is the tool's own **editable-export format**: drawio can save an
SVG that embeds the full diagram XML in the root `content` attribute, so a
convention-named `foo.drawio.svg` is *both* the preview and the source — any
markdown app (including Logseq) renders it as an ordinary image, and drawio
re-opens it for lossless editing in place.

Workflow:

1. `/drawio` inserts a new blank `assets/…​.drawio.svg` and launches the user's
   installed drawio on it.
2. The reference is a normal image: `![](../assets/name.drawio.svg)`.
3. Tine renders it inline; the image's hover bar has an **Edit in drawio** button
   (and any `*.drawio.svg`, however it got there, gets the same button).
4. On return to Tine (window focus), the rendered image refreshes to show the
   saved edits.

**Non-goals** (same as the Excalidraw spec — this is *not* the out-of-scope
"whiteboards" feature, which is an *embedded* canvas):
- **No bundled/embedded editor.** We piggyback an installed app; nothing ships.
- **No parsing of the diagram XML.** The asset is opaque.
- **No new save path.** The editor writes the asset; Tine only reads it.

## 2. Mechanism (generic)

`src/diagramEditors.ts` holds a registry — each entry is `{ id, label, match,
settingKey, blankTemplate?, detect? }`. drawio is the first entry; Excalidraw is a
one-entry addition later (edit-only → no `blankTemplate`). `editorFor(name)` maps
a filename to its editor by the `match` suffix regex.

- **Rendering**: unchanged. `*.drawio.svg` is an image (`mediaKind` keys off the
  last extension) served as a blob-URL `<img>` (`AssetImage`), so the embedded XML
  never executes — do **not** inline SVG markup into the DOM (ADR 0019 risk class).
- **Launch**: `edit_asset_external(name, command)` (Rust) reuses `open_asset`'s
  `assets/` path guard and `opener_command`'s env-scrub + detach. The per-editor
  `command` (Settings → Files) is whitespace-split into `program [args…]`; a `{}`
  token is replaced by the asset path, else the path is appended. Empty command →
  the OS file association. `detect_drawio` autodetects a launcher (PATH / flatpak /
  macOS app / Windows path) to prefill the setting.
- **Refresh**: `launchEditor` records the rel; on `window` focus /
  `visibilitychange→visible`, `invalidateAssetBlob(rel)` evicts the cached blob and
  bumps `assetEpoch`, so `AssetImage` re-reads just that asset. This uses
  window-focus rather than the file watcher, keeping it clear of the ADR 0012
  save/watch coherency protocol (assets have no dirty/persistence state).

## 3. Known limits / risks

- **Blank template**: `BLANK_DRAWIO_SVG` must be a diagram drawio opens as an
  *editable, empty* canvas (not an imported flat image). Validate against a real
  drawio; the `*.drawio.svg` in-place round-trip is the same one the VS Code
  "Draw.io Integration" uses. Fallback if finicky: create a native `.drawio` file
  and accept "no inline preview until the first save".
- **Command with spaces**: the command template is whitespace-split (no shell, so
  no injection), so a program *path* containing spaces must instead be on `PATH` or
  use a spaceless launcher (`flatpak run …`, `open -a …`). The asset path itself is
  passed as one argument, so spaces in the asset name are fine.
- **No configured command & no OS association**: the system opener may not be
  drawio; `launchEditor` toasts a pointer to Settings in that case.

## 4. Verification

- Unit: `src/diagramEditors.test.ts` (suffix match, `newDiagramName`, blank-SVG
  shape, image classification).
- Real app (needs a desktop + installed drawio): `/drawio` writes the asset and
  launches drawio; editing + saving + returning refreshes the inline image; the
  same reference renders as a static image in Logseq (round-trip intact).

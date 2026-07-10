# mine/0004. Bundle a monochrome emoji font to survive WebKitGTK's COLRv1 crash

- **Status:** Accepted (temporary workaround — remove once upstream fixes it)
- **Date:** 2026-07-10

## Context

On WebKitGTK, rasterizing a **color-emoji** glyph through the system emoji font
(Noto Color Emoji, COLRv1) can abort inside Skia's `colrv1_configure_skpaint`
(`Assertion '__n < this->size()' failed`). The assertion is compiled in on
Fedora-family libstdc++, so a normally-silent out-of-bounds becomes a `SIGABRT`
that kills the whole webview — the window goes dead and the app must be killed.

Tine already sidesteps this for **display**: every emoji shown in rendered content
is a Twemoji `<img>` (`src/render/emoji.tsx`), never a font glyph. Upstream #29
extended that to the sidebar/tabs/switcher (v0.4.5). What remains uncovered is
every **editable** surface, which shows raw text and therefore paints a real glyph:

- the page-properties **icon `<input>`** — always holds an emoji, so it crashes
  every time the panel opens on a page with `icon::` (the reported bug);
- the block editor **`<textarea>`** and the page-title rename **input** — crash
  whenever the edited text contains an emoji.

The Twemoji-`<img>` trick can't reach these: a native `<input>`/`<textarea>` can't
contain an `<img>`. The only lever is *which font paints the code point*. The crash
lives specifically in the COLRv1 (color) path, so any **non-color** glyph avoids it.
`font-variant-emoji: text` alone is unreliable — emoji without a text presentation
variant (e.g. 🤯) can still fall back to the color font.

This is a WebKitGTK/Skia bug, reported upstream in Tine as **martinkoutecky/tine#76**
(and, underneath, a WebKitGTK issue). Until that lands, the fork needs its own guard.

## Decision

Bundle **Noto Emoji** (the *monochrome* family — plain `glyf` outlines, no
`COLR`/`CPAL`/`CBDT`/`sbix`/`SVG` tables) as `src/styles/fonts/NotoEmoji.woff2` and
add it as the last entry — before the generic family — in both `--ls-font-family`
and `--ls-font-mono` (`src/styles/theme.css`). Also set `font-variant-emoji: text`
on `body`.

Because the text fonts already cover Latin/CJK, "Noto Emoji" is only ever selected
for code points they lack — i.e. emoji — and because it has no color tables it
physically cannot enter `colrv1_configure_skpaint`. All editable surfaces inherit
the body font, so they are all covered by the single stack change. Verified
coverage of the graph's icons plus emoji through 2021+ (1489 code points).

Font chosen over the alternatives:
- **Targeted per-field rework** (no raw glyph in the icon input) — fixes only the
  reported field, leaves the editor/title crash latent.
- **Live-fetch from Google Fonts** — reintroduces the crash whenever the font isn't
  loaded yet (offline / first paint / CSP), and breaks the local-first model.

## Consequences

- +~1.0 MB (woff2) in the bundle — in line with the already-bundled Inter weights
  and Twemoji SVGs. Loaded lazily: on a page with no raw emoji in any input, the
  text fonts satisfy every glyph and WebKit never downloads it.
- Emoji shown **while editing** (in an input/textarea) now render as monochrome
  outlines; rendered/display emoji stay full-color Twemoji `<img>`. Acceptable trade
  for not crashing.
- Licensing: Noto Emoji is SIL OFL 1.1 (`src/styles/fonts/OFL.txt`), which permits
  bundling/embedding with software; no Reserved Font Name.
- **Temporary.** When upstream #76 ships a fix, re-evaluate dropping the font.
- Can't be verified headless (the crash is native WebKitGTK) — needs a real
  WebKitGTK build; verify by opening page-properties on a page with an emoji icon.

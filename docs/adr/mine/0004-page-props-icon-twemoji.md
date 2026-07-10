# mine/0004. Render the page-properties icon as a Twemoji image, never a font glyph

- **Status:** Accepted (supersedes the bundled-font attempt below)
- **Date:** 2026-07-10

## Context

On WebKitGTK, rasterizing a **color-emoji** glyph through the system emoji font
(Noto Color Emoji, COLRv1) can abort inside Skia's `colrv1_configure_skpaint`
(`Assertion '__n < this->size()' failed`; compiled in on Fedora-family libstdc++).
The abort kills the webview — the window goes dead and the app must be killed.

Tine already avoids this for **display** by rendering every emoji as a Twemoji
`<img>` (`src/render/emoji.tsx`); upstream #29 extended that to the sidebar/tabs/
switcher. What stayed exposed were the **editable** surfaces that paint raw text —
most reliably the page-properties **icon `<input>`**, which always holds an emoji, so
opening the panel on a page with `icon::` crashes every time (the reported bug).
Upstream tracked as **martinkoutecky/tine#76**.

## Decision

Take fonts out of the equation for the icon field: **never let the raw emoji glyph
enter a painted input.** The field (`IconField` in `src/components/PageProps.tsx`)
shows the current icon as a Twemoji `<img>` — the same font-independent path the page
title uses, which is known-safe — and its `<input>` is kept empty. An edit is read in
the `input` handler and the field is blanked in the **same tick**, before the browser
paints, so no font ever rasterizes the emoji. A "Clear" button removes it; Backspace
on an empty field clears too. The panel's page-name heading is also wrapped in
`EmojiText` for the same reason.

This is guaranteed to fix the crash because it does not depend on WebKit's font
selection at all — the only thing that ever renders the emoji is an `<img>`.

### Rejected: bundle a monochrome emoji font (tried in `mine-v0.5.3-3`, reverted)

The first attempt bundled Noto Emoji (monochrome, no COLR) and added it to
`--ls-font-family`/`--ls-font-mono` plus `font-variant-emoji: text`, betting WebKit
would pick the outline glyph for the input. **It didn't work** — the crash persisted
on a real WebKitGTK build. WebKitGTK ignores the author font-family order for
emoji-presentation code points and reaches for the system color font regardless
(`font-variant-emoji` appears unsupported in that WebKit version). Reverted; the
1 MB asset bought nothing. Lesson: on WebKitGTK you cannot steer emoji away from the
system color font via CSS — you have to not paint the glyph.

## Consequences

- The reported crash is fixed with certainty and no bundled asset.
- The icon shows in full color (Twemoji) instead of as an editable text glyph; editing
  is "type or paste an emoji" with a live preview. Complex multi-codepoint sequences
  entered keystroke-by-keystroke aren't supported (paste works); fine for an icon.
- **Still exposed:** the block editor `<textarea>` and the title-rename input paint raw
  text, so an emoji there can still crash WebKitGTK. Those can't use the `<img>` trick
  (a native textarea can't hold one) and, per the rejected attempt, CSS can't redirect
  them either. Left for a follow-up if hit in practice; the real cure is the upstream
  WebKitGTK/Skia fix behind #76.
- Can't be verified headless (native crash); the invariant that prevents it — no raw
  emoji in any painted input — is covered by `PageProps.icon.test.tsx`.

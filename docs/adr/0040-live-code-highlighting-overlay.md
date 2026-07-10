# 0040. Live code highlighting via a passive overlay behind the textarea

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

Fork users wanted Logseq's behavior: a fenced code block should be **syntax-highlighted
while you edit it**, not just when rendered. The obvious way to do that — swap the
`<textarea>` for CodeMirror (or a contenteditable) when editing a code block — directly
violates **ADR 0013**: every block is edited in one `<textarea>` whose five coordination
signals are written *only* by `editorController.ts`, and one uuid renders live in many
surfaces at once. A second editor implementation for code blocks would fork the
focus/caret model that ADR 0013 exists to keep single.

The same code-block work also fixed the editor's fence handling (Enter inside a fence
adds a newline instead of splitting — GH #66; Enter on a trailing blank line exits; Enter
on the opening fence drops into the body) and added a `` ```lang `` language picker and a
page-level "click to add a block" affordance. Those are ordinary editor/UI changes; the
one load-bearing decision is *how* to highlight while editing without unforking the editor.

## Decision

**We highlight with a passive overlay, never by replacing the textarea.** When the edited
block is a single fenced code block:

- The real `<textarea>` stays the **sole** focus/caret owner (ADR 0013 untouched). Its text
  is made `color: transparent` with an explicit `caret-color`.
- A `<pre class="code-hl-overlay" aria-hidden pointer-events:none>` is painted **behind** it,
  built each keystroke by `highlightFencedForOverlay()` (render/body.tsx) from `editorValue()`
  — the same committed, reactive source the calc live-view uses. Its text is
  **character-for-character** the editor value (highlight.js only inserts `<span>`s), so every
  glyph sits under the caret.
- The overlay writes **no** coordination signals, calls no `editorController` setter, and
  measures no rendered text — so it is purely visual. `editorController.contract.test.ts`
  stays green by construction.
- Metrics on the textarea and the overlay are kept byte-identical (font, size, line-height,
  padding, `white-space: pre-wrap`, `overflow-wrap: anywhere`, tab-size, …), and the edit box
  wears the rendered `.code-block` chrome, so editing is WYSIWYG with **no jump on blur**.
- It is **opt-out**: a default-on "mine (extras)" toggle (`codeHighlightSettings.ts`) that,
  when off, restores the exact plain textarea — the escape hatch for the one thing we can't
  prove off-device, a transparent-text caret on a given WebKitGTK build.
- Highlighting shares the renderer's lazy **full** `highlight.js` (`loadHljs`) and the
  hand-rolled `.hljs-*` theme, so colors match the rendered block and flip with light/dark.
  The live overlay only ever single-language-highlights (never `highlightAuto`, which would
  tokenise against ~190 grammars per keystroke); an unnamed/unknown fence stays plain.

## Consequences

- Live highlighting ships without a second editor: the textarea remains the one focus/caret
  owner, so ADR 0013 and its guard hold. A future contributor must resist "just use CodeMirror
  for code" — that would reintroduce the exact fork ADR 0013 forbids.
- The overlay depends on textarea↔overlay metric parity; any change to `.block-editor.code-editing`
  metrics must be mirrored on `.code-hl-overlay` or glyphs drift out from under the caret.
- The transparent-text technique relies on `caret-color` rendering on WebKitGTK; confirmed
  on-device, and the toggle is the fallback.
- Loading the full highlight.js (all languages highlight) adds a ~1MB **lazy** chunk (first
  code block only) — acceptable for a local desktop app; the live path avoids `highlightAuto`
  so keystroke cost stays bounded.
- Fork-local (ships on `mine`); a candidate to offer upstream as a spec.

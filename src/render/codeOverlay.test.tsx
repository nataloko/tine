import { describe, it, expect } from "vitest";
import { highlightFencedForOverlay, loadHljs } from "./body";
import { fencedCodeBlock } from "../editor/properties";

// The overlay's rendered TEXT must equal the textarea value exactly (entities
// decode, tags strip) — that's what keeps each glyph under the caret. A <div>
// avoids <pre>'s leading-newline stripping; textContent is CSS-independent.
function renderedText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

describe("highlightFencedForOverlay", () => {
  it("plain (hljs not loaded): rendered text equals the input exactly", () => {
    const full = "```js\nconst x = 1 > 0;\nconst s = a & b;\n```";
    const f = fencedCodeBlock(full)!;
    const html = highlightFencedForOverlay(undefined, f, full);
    expect(renderedText(html)).toBe(full); // alignment invariant
    expect(html).toContain("code-hl-fence"); // fence lines dimmed
    expect(html).not.toContain("hljs-"); // no token spans before hljs loads
  });

  it("highlighted: still byte-aligned, with hljs token spans", async () => {
    const full = "```js\nconst x = 1;\n```";
    const f = fencedCodeBlock(full)!;
    const h = await loadHljs();
    const html = highlightFencedForOverlay(h, f, full);
    expect(renderedText(html)).toBe(full); // alignment holds through highlighting
    expect(html).toContain("hljs-"); // has token spans
  });

  it("unterminated fence stays aligned (no closing ```)", async () => {
    const full = "```py\nprint(1)";
    const f = fencedCodeBlock(full)!;
    const h = await loadHljs();
    expect(renderedText(highlightFencedForOverlay(h, f, full))).toBe(full);
  });

  it("preserves leading and trailing blank lines exactly", () => {
    const full = "\n```js\nx\n```\n";
    const f = fencedCodeBlock(full)!;
    expect(renderedText(highlightFencedForOverlay(undefined, f, full))).toBe(full);
  });

  it("empty code body aligns (```js\\n```)", () => {
    const full = "```js\n```";
    const f = fencedCodeBlock(full)!;
    expect(renderedText(highlightFencedForOverlay(undefined, f, full))).toBe(full);
  });
});

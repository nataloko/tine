import { describe, it, expect } from "vitest";
import { editorFor, newDiagramName, BLANK_DRAWIO_SVG } from "./diagramEditors";
import { mediaKind, assetMarkdown } from "./media";

describe("editorFor", () => {
  it("matches a drawio editable SVG", () => {
    expect(editorFor("foo.drawio.svg")?.id).toBe("drawio");
    expect(editorFor("../assets/My Diagram.drawio.svg")?.id).toBe("drawio");
    expect(editorFor("/graph/assets/a.b.drawio.svg")?.id).toBe("drawio");
  });
  it("is case-insensitive on the suffix", () => {
    expect(editorFor("Foo.DRAWIO.SVG")?.id).toBe("drawio");
  });
  it("does NOT match a plain image or a non-editable svg", () => {
    expect(editorFor("foo.svg")).toBeUndefined();
    expect(editorFor("foo.png")).toBeUndefined();
    expect(editorFor("foo.drawio.png")).toBeUndefined(); // drawio editor is SVG-only for now
    expect(editorFor("drawio.svg.txt")).toBeUndefined(); // suffix must be terminal
  });
});

describe("a drawio diagram is an ordinary image to the rest of Tine", () => {
  it("classifies as an image (last-extension wins)", () => {
    expect(mediaKind("foo.drawio.svg")).toBe("image");
  });
  it("inserts with the image markdown form", () => {
    expect(assetMarkdown("foo.drawio.svg")).toBe("![](../assets/foo.drawio.svg)");
  });
});

describe("newDiagramName", () => {
  it("always ends in .drawio.svg (the suffix editorFor relies on)", () => {
    const n = newDiagramName();
    expect(n.endsWith(".drawio.svg")).toBe(true);
    expect(editorFor(n)?.id).toBe("drawio");
  });
  it("is unique across calls in the same second", () => {
    const a = newDiagramName();
    const b = newDiagramName();
    expect(a).not.toBe(b);
  });
  it("has no path separators (it's joined onto assets/ directly)", () => {
    expect(newDiagramName()).not.toMatch(/[/\\]/);
  });
});

describe("BLANK_DRAWIO_SVG", () => {
  it("is a well-formed SVG carrying the editable drawio source", () => {
    expect(BLANK_DRAWIO_SVG.trimStart().startsWith("<?xml")).toBe(true);
    expect(BLANK_DRAWIO_SVG).toContain("<svg");
    expect(BLANK_DRAWIO_SVG).toContain("</svg>");
    // The diagram XML is embedded (escaped) in the root `content` attribute.
    expect(BLANK_DRAWIO_SVG).toContain('content="');
    expect(BLANK_DRAWIO_SVG).toContain("&lt;mxfile");
    expect(BLANK_DRAWIO_SVG).toContain("&lt;/mxfile&gt;");
    // The embedded diagram is blank: the base mxGraph root cells, no shapes.
    expect(BLANK_DRAWIO_SVG).toContain("&lt;mxCell id=&quot;0&quot;/&gt;");
  });
  it("has no raw (unescaped) angle brackets inside the content attribute", () => {
    const m = BLANK_DRAWIO_SVG.match(/content="([^"]*)"/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain("<");
    expect(m![1]).not.toContain(">");
  });
});

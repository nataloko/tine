// Pure helpers for reading/editing `key:: value` property lines — a block's
// continuation lines or a page's pre-block. No store/DOM, so unit-testable.

import { transitionFence, type FenceState } from "./fences";

export const PROP_LINE = /^([A-Za-z0-9_./-]+):: ?(.*)$/;

// Fence scanning for the fork's live-highlight overlay + language-picker
// autocomplete (kept private here; upstream's fences.ts state machine drives the
// Enter handler instead). A fence line opens or closes a run of ≥3 ` or ~.
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

function fenceMarker(line: string): string | null {
  const m = FENCE_RE.exec(line);
  return m ? m[1][0] : null;
}

function fenceTransition(
  fence: string | null,
  line: string
): { opens: boolean; closes: boolean; next: string | null } {
  const ch = fenceMarker(line);
  if (ch === null) return { opens: false, closes: false, next: fence };
  if (fence === null) return { opens: true, closes: false, next: ch };
  if (ch === fence) return { opens: false, closes: true, next: null };
  return { opens: false, closes: false, next: fence };
}

// Built-in properties hidden from the editor by default (like OG): `id::`,
// `collapsed::`, and `logseq.order-list-type::` (the numbered-list marker) are
// kept in the file for persistence but never shown in the edit textarea.
// Annotation (PDF highlight) blocks instead hide ALL properties and edit only
// their text.
const BUILTIN_HIDDEN = new Set(["id", "collapsed", "logseq.order-list-type"]);
/** Hide just the built-in `id::`/`collapsed::` properties (normal blocks). */
export const isBuiltinHidden = (key: string): boolean => BUILTIN_HIDDEN.has(key);
/** Hide metadata that should not surface while editing through a sheet cell. */
export const isSheetCellHidden = (key: string): boolean =>
  isBuiltinHidden(key) || key.toLowerCase().startsWith("tine.");
/** Hide every property (annotation blocks edit only their text). */
export const hideAll = (_key: string): boolean => true;

function propLineKey(line: string): string | null {
  const m = /^\s*([A-Za-z0-9_./-]+)::/.exec(line);
  return m ? m[1].toLowerCase() : null;
}

/** For a multi-line block that keeps Enter INSIDE it — a calc block or a fenced
 *  code block — decide whether an Enter at `caret` should EXIT the block (make a
 *  new sibling) rather than insert another newline. The rule is the common
 *  "double-Enter to exit" idiom: exit only when the caret sits on a *trailing
 *  blank line*. Returns the block text with that blank line removed if it should
 *  exit, or `null` to keep editing (insert a newline).
 *
 *  `kind`:
 *   - "calc"  — no closing fence; exit when the blank line is the last line.
 *   - "fence" — exit only when the blank line is the last content line, i.e. the
 *               next line is the closing ``` / ~~~ (so blank lines mid-code stay). */
export function multilineExitTrim(
  text: string,
  caret: number,
  kind: "calc" | "fence"
): string | null {
  const c = Math.max(0, Math.min(caret, text.length));
  const lineStart = text.lastIndexOf("\n", c - 1) + 1;
  let lineEnd = text.indexOf("\n", c);
  if (lineEnd === -1) lineEnd = text.length;
  // Only exit from a blank line that has a line above it to attach after.
  if (text.slice(lineStart, lineEnd).trim() !== "") return null;
  if (lineStart === 0) return null;
  if (kind === "calc") {
    // Nothing non-blank may follow — the blank line must be the last line.
    if (text.slice(lineEnd).trim() !== "") return null;
    return text.slice(0, lineStart - 1); // drop the trailing "\n<blank>"
  }
  // Fenced: the next line must be the closing fence.
  const after = text.slice(lineEnd + 1);
  const nl = after.indexOf("\n");
  const nextLine = nl === -1 ? after : after.slice(0, nl);
  if (!FENCE_RE.test(nextLine)) return null;
  // Drop the blank line, keep the closing fence (and anything after it).
  return text.slice(0, lineStart - 1) + text.slice(lineEnd);
}

/** Whether the fence-delimiter line beginning at `lineStart` OPENS a fence rather
 *  than closing one — i.e. no fence is open just before it. Lets the language
 *  picker fire on an opening ```lang line only, never on the closing ```. */
export function isOpeningFenceLine(raw: string, lineStart: number): boolean {
  let fence: string | null = null;
  let pos = 0;
  while (pos < lineStart) {
    const nl = raw.indexOf("\n", pos);
    const end = nl === -1 ? raw.length : nl;
    if (end >= lineStart) break; // reached the target line
    fence = fenceTransition(fence, raw.slice(pos, end)).next;
    if (nl === -1) break;
    pos = end + 1;
  }
  return fence === null;
}

/** A block that is a single fenced code block, for the live-highlight overlay. */
export interface CodeFence {
  /** Language token from the opening fence (lowercased; "" if none). */
  lang: string;
  /** The inner code (lines strictly between the fences), joined with "\n". */
  codeText: string;
  /** Line index of the opening ```-fence in the split text. */
  openLine: number;
  /** Line index of the closing fence, or null while the fence is still open. */
  closeLine: number | null;
}

/** If `text` is ONE fenced code block (optionally with blank lines before/after),
 *  return its language + inner code + fence line indices; else null. Tolerates an
 *  unterminated fence (closeLine null) so it works mid-typing. Returns null for a
 *  ```calc block (the calculator keeps its own editor path) and for mixed
 *  prose+fence content — the overlay's <pre> must be a clean code block. */
export function fencedCodeBlock(text: string): CodeFence | null {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return null;
  const openLine = i;
  const open = /^(`{3,}|~{3,})([A-Za-z0-9+#._-]*)\s*$/.exec(lines[openLine]);
  if (!open) return null;
  const marker = open[1][0]; // ` or ~
  const lang = open[2].toLowerCase();
  if (lang === "calc") return null;
  let closeLine: number | null = null;
  for (let j = openLine + 1; j < lines.length; j++) {
    const m = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[j]);
    if (m && m[1][0] === marker) {
      closeLine = j;
      break;
    }
  }
  // v1 scope: nothing non-blank may sit after the closing fence.
  if (closeLine !== null) {
    for (let j = closeLine + 1; j < lines.length; j++) {
      if (lines[j].trim() !== "") return null;
    }
  }
  const bodyEnd = closeLine === null ? lines.length : closeLine;
  return { lang, codeText: lines.slice(openLine + 1, bodyEnd).join("\n"), openLine, closeLine };
}

/** Whether a textarea caret offset is inside a fenced code region. The fence
 *  delimiter lines themselves are outside; the content lines between them are
 *  inside, including an unterminated fence while the user is editing. */
export function caretInFence(raw: string, offset: number): boolean {
  const target = Math.max(0, Math.min(offset, raw.length));
  let fence: FenceState | null = null;
  let pos = 0;
  while (pos <= raw.length) {
    const nl = raw.indexOf("\n", pos);
    const end = nl === -1 ? raw.length : nl;
    const line = raw.slice(pos, end);
    const t = transitionFence(fence, line);
    if (target <= end) return fence !== null && !t.closes;
    fence = t.next;
    if (nl === -1) break;
    pos = end + 1;
  }
  return fence !== null;
}

/** The two on-disk block formats. Markdown keeps built-in props as trailing
 *  `key:: value` lines; org keeps them inside a `:PROPERTIES:`/`:END:` drawer. */
export type PropFormat = "md" | "org";

/** Key of an org drawer property line (`:id: <uuid>` → `"id"`), lowercased, or
 *  null if the line isn't a `:key: value` drawer entry. The `:PROPERTIES:` and
 *  `:END:` wrapper lines return null (they aren't `key value` pairs). */
function orgDrawerKey(line: string): string | null {
  const m = /^\s*:([A-Za-z0-9_@.-]+):(?:\s|$)/.exec(line);
  const k = m ? m[1].toLowerCase() : null;
  return k === "properties" || k === "end" ? null : k;
}

type LineClass = "v" | "h" | "d"; // visible | hidden-payload | dropped(org wrapper)

/** Classify every line as visible / hidden-property / dropped-org-wrapper.
 *  Fence-aware. For org, a block-properties `:PROPERTIES:`/`:END:` drawer whose
 *  inner lines are ALL built-in-hidden is dropped whole (wrapper marked `d`,
 *  inner marked `h`) — mirroring OG's `remove-built-in-properties`, which also
 *  strips the emptied drawer. A drawer that still holds a user property keeps its
 *  wrapper + user lines visible and hides only the built-in lines within. */
function classifyLines(
  lines: string[],
  isHidden: (key: string) => boolean,
  format: PropFormat
): LineClass[] {
  const cls: LineClass[] = new Array(lines.length).fill("v");
  let fence: FenceState | null = null;
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    const t = transitionFence(fence, l);
    if (t.opens || t.closes) {
      fence = t.next; // fence delimiter lines are always visible content
      i++;
      continue;
    }
    if (fence !== null) {
      i++; // inside a code fence — never metadata
      continue;
    }
    if (format === "org" && l.trim().toUpperCase() === ":PROPERTIES:") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim().toUpperCase() !== ":END:") j++;
      if (j < lines.length) {
        // Complete drawer spans i..j. Classify inner lines i+1..j-1.
        let anyKept = false;
        const inner: LineClass[] = [];
        for (let k = i + 1; k < j; k++) {
          const key = orgDrawerKey(lines[k]);
          const hid = key != null && isHidden(key);
          inner.push(hid ? "h" : "v");
          if (!hid) anyKept = true; // a user prop (or a non-prop line) survives
        }
        if (anyKept) {
          for (let k = i + 1; k < j; k++) cls[k] = inner[k - (i + 1)]; // wrapper stays "v"
        } else {
          cls[i] = "d"; // drop the emptied :PROPERTIES:
          cls[j] = "d"; // drop the :END:
          for (let k = i + 1; k < j; k++) cls[k] = "h";
        }
        i = j + 1;
        continue;
      }
      // No matching :END: — treat the line as ordinary content.
    }
    // Markdown `key:: value` property lines. Only in md files: org uses the
    // drawer for properties, so a `key::` line in an org block is body content,
    // never metadata (and must never be folded into a drawer on reattach).
    if (format !== "org") {
      const key = propLineKey(l);
      if (key && isHidden(key)) cls[i] = "h";
    }
    i++;
  }
  return cls;
}

/** Split a block's raw into the editor-visible text and the hidden property
 *  lines. Fence-aware: a `key:: value` line inside a ```/~~~ code fence stays
 *  visible content — it must NOT be pulled out as metadata and reattached
 *  outside the fence (which would corrupt the code on focus+blur). `isHidden`
 *  selects which property keys are hidden (e.g. {@link isBuiltinHidden} or
 *  {@link hideAll}). `format` (default `"md"`) enables org `:PROPERTIES:` drawer
 *  handling. Inverse of {@link joinProps}. */
export function splitProps(
  raw: string,
  isHidden: (key: string) => boolean,
  format: PropFormat = "md"
): { visible: string; hidden: string } {
  const { visible, hidden } = splitPropsInternal(raw, isHidden, format);
  return { visible, hidden };
}

function splitPropsInternal(
  raw: string,
  isHidden: (key: string) => boolean,
  format: PropFormat,
  rawOffset?: number
): { visible: string; hidden: string; visibleOffset?: number } {
  const lines = raw.split("\n");
  const cls = classifyLines(lines, isHidden, format);
  const vis: string[] = [];
  const hid: string[] = [];
  const target = rawOffset == null ? null : Math.max(0, Math.min(rawOffset, raw.length));
  let visibleLen = 0;
  let visibleOffset: number | null = null;
  let rawPos = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const rawStart = rawPos;
    const rawEnd = rawStart + l.length;
    if (cls[i] === "v") {
      const lineVisibleStart = visibleLen + (vis.length > 0 ? 1 : 0);
      const lineVisibleEnd = lineVisibleStart + l.length;
      if (target != null && visibleOffset == null && target >= rawStart && target <= rawEnd) {
        visibleOffset = lineVisibleStart + (target - rawStart);
      }
      vis.push(l);
      visibleLen = lineVisibleEnd;
    } else {
      // "h" (hidden payload) or "d" (dropped org wrapper): not shown. A caret
      // inside it maps to where the removed text would have appeared.
      if (target != null && visibleOffset == null && target >= rawStart && target <= rawEnd) {
        visibleOffset = visibleLen;
      }
      if (cls[i] === "h") hid.push(l);
    }
    rawPos = rawEnd + 1;
  }
  return {
    visible: vis.join("\n"),
    hidden: hid.join("\n"),
    visibleOffset: target == null ? undefined : (visibleOffset ?? visibleLen),
  };
}

/** Map a UTF-16 offset in raw block text into the textarea's visible buffer,
 *  using the same fence-aware hidden-property split as {@link splitProps}. When
 *  the raw offset falls inside a hidden property line, it maps to the edit point
 *  where that removed line would have appeared. */
export function rawOffsetToVisibleOffset(
  raw: string,
  rawOffset: number,
  isHidden: (key: string) => boolean,
  format: PropFormat = "md"
): number {
  return splitPropsInternal(raw, isHidden, format, rawOffset).visibleOffset ?? 0;
}

/** Reattach hidden property lines to the visible text — the inverse of
 *  {@link splitProps}. Markdown appends them below the body (that's where its
 *  `id::`/`collapsed::` live). Org folds them back into a `:PROPERTIES:` drawer
 *  at OG's canonical spot (into an existing drawer if the visible text still has
 *  one, else a fresh drawer right after the title + SCHEDULED/DEADLINE planning
 *  lines — matching {@link rawWithBlockId}). A metadata-only block (empty
 *  visible) is just its hidden lines — no spurious leading newline. */
export function joinProps(visible: string, hidden: string, format: PropFormat = "md"): string {
  if (!hidden) return visible;
  if (format !== "org") return visible ? `${visible}\n${hidden}` : hidden;
  const hiddenLines = hidden.split("\n").filter((l) => l.trim() !== "");
  if (hiddenLines.length === 0) return visible;
  const lines = visible ? visible.split("\n") : [];
  const start = lines.findIndex((l) => l.trim().toUpperCase() === ":PROPERTIES:");
  const end =
    start >= 0 ? lines.findIndex((l, i) => i > start && l.trim().toUpperCase() === ":END:") : -1;
  if (start >= 0 && end > start) {
    lines.splice(end, 0, ...hiddenLines); // extend the existing drawer, before :END:
    return lines.join("\n");
  }
  if (lines.length === 0) return [":PROPERTIES:", ...hiddenLines, ":END:"].join("\n");
  const [title, ...rest] = lines;
  const isSched = (l: string) => l.startsWith("SCHEDULED");
  const isDead = (l: string) => l.startsWith("DEADLINE");
  const scheduled = rest.filter(isSched);
  const deadline = rest.filter(isDead);
  const body = rest.filter((l) => !isSched(l) && !isDead(l));
  return [title, ...scheduled, ...deadline, ":PROPERTIES:", ...hiddenLines, ":END:", ...body].join(
    "\n"
  );
}

/** First value for `key` (case-insensitive) in a property block, or null. */
export function readPropertyValue(block: string | null, key: string): string | null {
  if (!block) return null;
  for (const l of block.split("\n")) {
    const m = PROP_LINE.exec(l);
    if (m && m[1].toLowerCase() === key.toLowerCase()) return m[2].trim();
  }
  return null;
}

/** Add / replace / remove a `key:: value` line. A null or empty value removes
 *  the key. Other property lines are preserved (blank lines dropped); returns
 *  null when nothing is left (so an emptied pre-block isn't written as "").  */
export function upsertPropertyLine(
  block: string | null,
  key: string,
  value: string | null
): string | null {
  const kept = (block ?? "")
    .split("\n")
    .filter((l) => {
      const m = PROP_LINE.exec(l);
      return !(m && m[1].toLowerCase() === key.toLowerCase());
    })
    .filter((l) => l.trim() !== "");
  const v = value == null ? null : value.trim();
  if (v) kept.push(`${key}:: ${v}`);
  return kept.length ? kept.join("\n") : null;
}

/** The page-level properties we surface in the page-properties panel, with a
 *  one-line description and whether the value is a boolean toggle. */
export interface PagePropSpec {
  key: string;
  label: string;
  hint: string;
  kind: "text" | "bool" | "list";
}
export const PAGE_PROP_SPECS: PagePropSpec[] = [
  { key: "alias", label: "Aliases", hint: "Other names this page answers to in [[links]] (comma-separated)", kind: "list" },
  { key: "tags", label: "Tags", hint: "Page-level tags (comma-separated)", kind: "list" },
  { key: "title", label: "Display title", hint: "Override the shown title (the file name stays the same)", kind: "text" },
  { key: "icon", label: "Icon", hint: "An emoji/character shown with the title", kind: "text" },
  { key: "public", label: "Public", hint: "Include this page when exporting/publishing public pages", kind: "bool" },
];

// External diagram editors — a "light integration" (render the asset as an
// ordinary image, edit it in an EXISTING external app, refresh on return). This
// is the drawio piggyback (and the shape the pending Excalidraw spec reuses):
// Tine bundles no editor. See docs/diagram-editors-spec.md and ADR 0019 (the
// asset is rendered via a blob-URL <img>, never inlined, so embedded XML in the
// SVG never executes).
//
// A diagram is a convention-named asset (`*.drawio.svg`) that is *both* a preview
// and the source: drawio's "editable SVG" carries the diagram XML in the root
// `content` attribute, so any markdown app renders it as an image and drawio
// re-opens it for lossless editing in place. Adding another tool later (e.g.
// Excalidraw) is one more entry in DIAGRAM_EDITORS.

import { createSignal } from "solid-js";
import { backend } from "./backend";
import { pushToast } from "./ui";
import { invalidateAssetBlob } from "./assetCache";

export interface DiagramEditor {
  /** Stable id; also the suffix of the settings key that stores its command. */
  id: string;
  /** User-facing name, e.g. "drawio". */
  label: string;
  /** Filenames/URLs this editor owns (matched against the last path segment). */
  match: RegExp;
  /** Settings key holding the user's launcher command (see edit_asset_external). */
  settingKey: string;
  /** Editable-file template for a NEW blank diagram (omit → edit-only editor). */
  blankTemplate?: string;
  /** Backend autodetect of an installed launcher, to prefill an empty command. */
  detect?: () => Promise<string | null>;
}

// A minimal blank drawio "editable SVG": a valid SVG whose `content` attribute
// holds an empty mxGraph diagram, so drawio opens it as an editable (blank)
// canvas rather than importing it as a flat image, and round-trips it in place on
// save. Same `*.drawio.svg` convention the VS Code "Draw.io Integration" edits.
// The visual body is an empty 1×1 viewport (nothing drawn yet); drawio resizes it
// as the user draws and re-saves.
const BLANK_DRAWIO_MXFILE =
  '<mxfile host="tine">' +
  '<diagram id="blank" name="Page-1">' +
  '<mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1"' +
  ' connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850"' +
  ' pageHeight="1100" math="0" shadow="0">' +
  '<root><mxCell id="0"/><mxCell id="1" parent="0"/></root>' +
  "</mxGraphModel></diagram></mxfile>";

function xmlAttrEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const BLANK_DRAWIO_SVG =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"' +
  ' version="1.1" width="1px" height="1px" viewBox="-0.5 -0.5 1 1"' +
  ' content="' +
  xmlAttrEscape(BLANK_DRAWIO_MXFILE) +
  '"><defs/></svg>\n';

export const DIAGRAM_EDITORS: DiagramEditor[] = [
  {
    id: "drawio",
    label: "drawio",
    match: /\.drawio\.svg$/i,
    settingKey: "diagram_cmd_drawio",
    blankTemplate: BLANK_DRAWIO_SVG,
    detect: () => backend().detectDrawio(),
  },
  // Excalidraw (docs/excalidraw-assets-spec.md) slots in here later:
  // { id: "excalidraw", label: "Excalidraw", match: /\.excalidraw(\.(svg|png))?$/i,
  //   settingKey: "diagram_cmd_excalidraw" }  // edit-only: no blankTemplate.
];

/** The editor that owns this filename/URL, or undefined. */
export function editorFor(nameOrUrl: string): DiagramEditor | undefined {
  const seg = nameOrUrl.split(/[\\/]/).pop() ?? nameOrUrl;
  return DIAGRAM_EDITORS.find((e) => e.match.test(seg));
}

// Configured launcher command per editor id, persisted in tine-settings.json via
// the app_string backend (WebKitGTK localStorage doesn't survive a restart). A
// reactive signal so the Settings field updates live.
const [cmds, setCmds] = createSignal<Record<string, string>>({});

/** Reactive: all configured editor commands, keyed by editor id. */
export const diagramCommands = cmds;

/** The configured command for `id` ("" if unset → the system opener is used). */
export function diagramCommand(id: string): string {
  return cmds()[id] ?? "";
}

/** Set + persist the launcher command for an editor (blank clears it). */
export function setDiagramCommand(id: string, value: string): void {
  const v = value.trim();
  setCmds((c) => ({ ...c, [id]: v }));
  const ed = DIAGRAM_EDITORS.find((e) => e.id === id);
  if (ed) void backend().setAppString(ed.settingKey, v).catch(() => {});
}

// Assets whose external editor we launched this session; on window focus we
// invalidate their blob cache so a save made in the editor shows without a
// restart. Using window-focus (not the file watcher) keeps this clear of the
// ADR 0012 save/watch coherency protocol — assets have no dirty/persistence state.
const pendingRefresh = new Set<string>();

/** Open `rel` (an assets/-relative name) in its configured external editor. */
export async function launchEditor(rel: string): Promise<void> {
  const ed = editorFor(rel);
  if (!ed) return;
  const cmd = diagramCommand(ed.id);
  try {
    await backend().editAssetExternal(rel, cmd || null);
  } catch (err) {
    pushToast(`Couldn’t open ${ed.label} (${String(err)})`, "error");
    return;
  }
  pendingRefresh.add(rel);
  if (!cmd) {
    // No explicit command: we fell back to the OS file association, which may not
    // be the editor. Nudge the user to configure it (only surfaces when autodetect
    // found nothing — i.e. exactly when the hint helps).
    pushToast(
      `Opened “${rel}” with the system default. Set a ${ed.label} command in Settings → Files for reliable editing.`,
      "info"
    );
  }
}

function refreshPending(): void {
  if (!pendingRefresh.size) return;
  for (const rel of pendingRefresh) invalidateAssetBlob(rel);
  pendingRefresh.clear();
}

let diagramSeq = 0;

/** A fresh, unique on-disk name for a new drawio diagram. NOT routed through the
 *  asset-name template (media.ts) on purpose: the `.drawio.svg` suffix is
 *  load-bearing (it's how editorFor matches), and a custom template could strip
 *  the `.drawio` infix. Backend `reserve_asset` de-dupes any residual collision. */
export function newDiagramName(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  diagramSeq += 1;
  return `diagram-${stamp}-${diagramSeq}.drawio.svg`;
}

let inited = false;

/** Load persisted editor commands (autodetecting + persisting when empty) and
 *  register the focus refresh. Call once at app boot (main.tsx / capture.tsx). */
export async function initDiagramEditors(): Promise<void> {
  if (inited) return;
  inited = true;
  const next: Record<string, string> = {};
  for (const ed of DIAGRAM_EDITORS) {
    let v = "";
    try {
      v = await backend().getAppString(ed.settingKey, "");
    } catch {
      /* keep empty */
    }
    if (!v && ed.detect) {
      try {
        const d = await ed.detect();
        if (d) {
          v = d;
          void backend().setAppString(ed.settingKey, v).catch(() => {});
        }
      } catch {
        /* leave empty; the system opener is the fallback */
      }
    }
    next[ed.id] = v;
  }
  setCmds(next);
  if (typeof window !== "undefined") {
    window.addEventListener("focus", refreshPending);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPending();
    });
  }
}

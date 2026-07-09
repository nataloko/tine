// Bullet threading: trace a rounded "elbow" thread down the active path — the
// block you're editing and each of its ancestors — so you can see where you are in
// a deep outline (like the "bullet threading" Logseq plugin). Each level curves
// into its bullet, coloured per depth (rainbow). Pure CSS draws it on reactively-
// marked blocks (see app.css .thread-elbow/.thread-spine), so it reflows with the
// outline and can never desync. OFF by default; persisted device-locally via the
// app_bool backend (WebKitGTK localStorage isn't kept across launches).

import { createMemo, createRoot, createSignal } from "solid-js";
import { backend } from "./backend";
import { editingId } from "./editorController";
import { doc } from "./store";

const KEY = "bullet_threading";
const COLOR_KEY = "bullet_threading_color";
const WEIGHT_KEY = "bullet_threading_weight";

/** Colour of the thread: a per-depth rainbow (default) or a single accent colour. */
export type ThreadColorMode = "rainbow" | "accent";
/** Line weight of the thread. */
export type ThreadWeight = "thin" | "medium" | "thick";
const WEIGHT_PX: Record<ThreadWeight, number> = { thin: 2, medium: 3, thick: 4 };

const [enabled, setEnabledSig] = createSignal(false);
const [colorMode, setColorModeSig] = createSignal<ThreadColorMode>("rainbow");
const [weight, setWeightSig] = createSignal<ThreadWeight>("medium");

/** Reactive: is bullet threading turned on? Default OFF. */
export const threadingEnabled = enabled;
/** Reactive: rainbow (per-depth) vs accent (single colour). Default rainbow. */
export const threadColorMode = colorMode;
/** Reactive: the thread's line weight (thin/medium/thick). Default medium. */
export const threadWeight = weight;
/** The current line weight in px, for the `--thread-thickness` CSS variable. */
export const threadThicknessPx = () => WEIGHT_PX[weight()];

export function setThreadingEnabled(on: boolean): void {
  setEnabledSig(on);
  void backend().setAppBool(KEY, on).catch(() => {});
}

export function setThreadColorMode(mode: ThreadColorMode): void {
  setColorModeSig(mode);
  void backend().setAppString(COLOR_KEY, mode).catch(() => {});
}

export function setThreadWeight(w: ThreadWeight): void {
  setWeightSig(w);
  void backend().setAppString(WEIGHT_KEY, w).catch(() => {});
}

/** Load the persisted preferences at startup. Defaults: OFF, rainbow, medium. */
export async function initBulletThreading(): Promise<void> {
  try {
    setEnabledSig(await backend().getAppBool(KEY, false));
    const c = await backend().getAppString(COLOR_KEY, "rainbow");
    setColorModeSig(c === "accent" ? "accent" : "rainbow");
    const w = await backend().getAppString(WEIGHT_KEY, "medium");
    setWeightSig(w === "thin" || w === "thick" ? w : "medium");
  } catch {
    /* defaults */
  }
}

/** Rainbow palette — one vivid colour per nesting depth (cycles). Theme-agnostic. */
export const THREAD_PALETTE = [
  "#e0901f", "#37b679", "#e0559b", "#4a90d9", "#9b6fd4", "#e05252", "#1aa6b7", "#c0873f",
];

/** A block's role in the thread. The value is the colour index (nesting depth of
 *  the edge). A block is at most one of elbow/spine — they never overlap. */
export type ThreadRole = { elbow?: number; spine?: number };

// For the block being edited, mark the active path root→cursor. Every path node
// gets an ELBOW that curves the thread into its bullet; the SIBLINGS *before* each
// path node get a SPINE segment so the vertical stays continuous when a path node
// isn't a first child (the gap case). Recomputed once per focus/structure change
// (createRoot → app-lifetime owner); each Block just does a Map.get for its role.
export const threadRoles = createRoot(() =>
  createMemo((): Map<string, ThreadRole> => {
    const roles = new Map<string, ThreadRole>();
    const cursor = editingId();
    if (!cursor || !doc.byId[cursor]) return roles;
    // chain = [root, …, cursor]
    const chain: string[] = [];
    for (let n: string | null = cursor; n; n = doc.byId[n]?.parent ?? null) chain.unshift(n);
    // Edge e connects chain[e] (parent, depth e) → chain[e+1] (child), coloured e.
    for (let e = 0; e < chain.length - 1; e++) {
      const parent = chain[e];
      const child = chain[e + 1];
      roles.set(child, { elbow: e });
      const sibs = doc.byId[parent]?.children ?? [];
      const idx = sibs.indexOf(child);
      for (let s = 0; s < idx; s++) roles.set(sibs[s], { spine: e });
    }
    return roles;
  })
);

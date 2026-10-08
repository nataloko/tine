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
import { loadPreference, writePreference } from "./preferenceWrites";
import { childIds, node } from "./document";

const KEY = "bullet_threading";
const COLOR_KEY = "bullet_threading_color";
const WEIGHT_KEY = "bullet_threading_weight";
const ANIM_KEY = "bullet_threading_anim";

/** Colour of the thread: a per-depth rainbow (default) or a single accent colour. */
export type ThreadColorMode = "rainbow" | "accent";
/** Line weight of the thread. */
export type ThreadWeight = "thin" | "medium" | "thick";
const WEIGHT_PX: Record<ThreadWeight, number> = { thin: 2, medium: 3, thick: 4 };
/** Thread animation: none, flowing dashes (a conveyor), or a slow pulse (beat).
 *  Mutually exclusive — never flow and beat at once. */
export type ThreadAnimation = "none" | "flow" | "beat";

const [enabled, setEnabledSig] = createSignal(false);
const [colorMode, setColorModeSig] = createSignal<ThreadColorMode>("rainbow");
const [weight, setWeightSig] = createSignal<ThreadWeight>("medium");
const [anim, setAnimSig] = createSignal<ThreadAnimation>("none");

/** Reactive: is bullet threading turned on? Default OFF. */
export const threadingEnabled = enabled;
/** Reactive: rainbow (per-depth) vs accent (single colour). Default rainbow. */
export const threadColorMode = colorMode;
/** Reactive: the thread's line weight (thin/medium/thick). Default medium. */
export const threadWeight = weight;
/** The current line weight in px, for the `--thread-thickness` CSS variable. */
export const threadThicknessPx = () => WEIGHT_PX[weight()];
/** Reactive: the thread animation — "none" (default), "flow" (dashes conveyor),
 *  or "beat" (a slow pulse). */
export const threadAnimation = anim;

// Each setter applies now and queues a device-local write through upstream's
// preference queue: a failed latest write rolls back and toasts.
export function setThreadingEnabled(on: boolean): void {
  writePreference(enabled, setEnabledSig, on, (next) => backend().setAppBool(KEY, next), "bullet threading preference");
}

export function setThreadColorMode(mode: ThreadColorMode): void {
  writePreference(colorMode, setColorModeSig, mode, (next) => backend().setAppString(COLOR_KEY, next), "thread colour");
}

export function setThreadWeight(w: ThreadWeight): void {
  writePreference(weight, setWeightSig, w, (next) => backend().setAppString(WEIGHT_KEY, next), "thread thickness");
}

export function setThreadAnimation(mode: ThreadAnimation): void {
  writePreference(anim, setAnimSig, mode, (next) => backend().setAppString(ANIM_KEY, next), "thread animation");
}

/** Load the persisted preferences at startup. Defaults: OFF, rainbow, medium, no
 *  animation. Each lands only if the user has not changed it meanwhile; a failed
 *  read toasts and keeps the default. */
export function initBulletThreading(): void {
  loadPreference(enabled, setEnabledSig, () => backend().getAppBool(KEY, false), (on) => on, "bullet threading preference");
  loadPreference(colorMode, setColorModeSig, () => backend().getAppString(COLOR_KEY, "rainbow"),
    (c): ThreadColorMode => (c === "accent" ? "accent" : "rainbow"), "thread colour");
  loadPreference(weight, setWeightSig, () => backend().getAppString(WEIGHT_KEY, "medium"),
    (w): ThreadWeight => (w === "thin" || w === "thick" ? w : "medium"), "thread thickness");
  loadPreference(anim, setAnimSig, () => backend().getAppString(ANIM_KEY, "none"),
    (a): ThreadAnimation => (a === "flow" || a === "beat" ? a : "none"), "thread animation");
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
    if (!cursor || !node(cursor)) return roles;
    // chain = [root, …, cursor]
    const chain: string[] = [];
    for (let n: string | null = cursor; n; n = node(n)?.parent ?? null) chain.unshift(n);
    // Edge e connects chain[e] (parent, depth e) → chain[e+1] (child), coloured e.
    for (let e = 0; e < chain.length - 1; e++) {
      const parent = chain[e];
      const child = chain[e + 1];
      roles.set(child, { elbow: e });
      const sibs = childIds(parent);
      const idx = sibs.indexOf(child);
      for (let s = 0; s < idx; s++) roles.set(sibs[s], { spine: e });
    }
    return roles;
  })
);

// FORK: the two calc-block editor behaviours this fork adds, extracted from
// Block.tsx so they do not spend upstream's budget-B1 headroom there
// (src/fileSizeRatchet.test.ts). readBlockModuleSource() globs this directory,
// so every guard that reads Block.tsx still sees this code.
import { createEffect, type Accessor, type Setter } from "solid-js";
import { applyCompletion } from "../../editor/autocomplete";
import { calcSource } from "../../editor/calc";

/** Latch calc mode ON once the buffer settles into a ```calc fence.
 *
 *  Upstream captures calc mode at editor mount and never re-derives it, so a
 *  block that BECOMES a calc fence mid-session (typing the fence, or the
 *  /Calculator insert below) showed no gutter and no live results until a blur
 *  and re-enter. Latching fixes that while keeping upstream's reason for not
 *  re-deriving live: an exit commit must still re-fence even when the committed
 *  raw is momentarily malformed, so this only ever sets true.
 *
 *  The newline test is what makes it safe: it waits for a SETTLED fence, so a
 *  half-typed "```calc" heading toward another word ("```calcite") never trips
 *  it. */
export function latchCalcOnFence(editorValue: Accessor<string>, setEditingCalc: Setter<boolean>): void {
  createEffect(() => {
    const value = editorValue();
    if (calcSource(value) !== null && value.includes("\n")) setEditingCalc(true);
  });
}

/** The `/Calculator` slash action: insert an empty ```calc fence and commit it,
 *  which flips the editor into calc mode through the latch above, so the gutter
 *  and live results appear at once.
 *
 *  Deliberately does NOT set `ref.value` the way replaceTrigger does: once calc
 *  mode is on, the reactive value binding owns the textarea as the
 *  fence-stripped expression buffer (empty here), so this only drops the caret
 *  onto that line. */
export function insertCalcBlock(
  ref: HTMLTextAreaElement,
  start: number,
  end: number,
  commit: (raw: string) => void,
  closeAc: () => void,
  autosize: () => void,
): void {
  commit(applyCompletion(ref.value, start, end, "```calc\n\n```").raw);
  closeAc();
  queueMicrotask(() => {
    ref.focus();
    ref.setSelectionRange(0, 0);
    autosize();
  });
}

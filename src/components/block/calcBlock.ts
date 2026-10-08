// FORK: the calc-block editor behaviour this fork adds, kept out of Block.tsx so
// the fork's footprint there stays two lines. Upstream's own GH #57 is the live
// path for the `/Calculator` slash insert; this covers the case it doesn't.
import { createEffect, type Accessor, type Setter } from "solid-js";
import { calcSource } from "../../editor/calc";

/** Latch calc mode ON once the buffer settles into a ```calc fence.
 *
 *  Upstream captures calc mode at editor mount and re-derives it only for a
 *  completion that lands a calc fence (GH #57), so a block that BECOMES a calc
 *  fence some other way mid-session (typing the fence by hand, an external
 *  setRaw) showed no gutter and no live results until a blur and re-enter.
 *  Latching fixes that while keeping upstream's reason for not re-deriving live:
 *  an exit commit must still re-fence even when the committed raw is
 *  momentarily malformed, so this only ever sets true.
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

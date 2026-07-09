import type { RefGroup } from "../types";

// Re-assemble a {{query}}'s result groups after the optional `tine.query-filter::`
// formula has picked which blocks survive. Kept deliberately pure (no Solid, no
// store) so the ordering contract is unit-testable — the memo in Macro.tsx owns
// the reactive wiring around it.

/**
 * Rebuild `groups` keeping only the blocks whose id is in `keep`, preserving the
 * engine's original group AND block order (a global `(sort-by …)` emits one block
 * per group and that order is meaningful), and dropping groups left empty.
 *
 * Identity is preserved where nothing changed: the same array is returned when
 * every block survived, and an untouched group keeps its own object — so a keyed
 * <For> never remounts a result block you're editing just because a *sibling*
 * group was filtered.
 */
export function regroupSurvivors(groups: RefGroup[], keep: ReadonlySet<string>): RefGroup[] {
  let removedAny = false;
  const out: RefGroup[] = [];
  for (const g of groups) {
    const blocks = g.blocks.filter((b) => keep.has(b.id));
    if (blocks.length !== g.blocks.length) removedAny = true;
    if (blocks.length === 0) continue;
    out.push(blocks.length === g.blocks.length ? g : { ...g, blocks });
  }
  return removedAny ? out : groups;
}

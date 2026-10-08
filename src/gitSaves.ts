// FORK: the git integration's read-only view of the save engine. Upstream's
// `notePublished` (src/document/save/engine.ts), which runs exactly when a page
// save lands on disk, calls `noteSavedForGit` here. That is the fork's one line
// in the engine; nothing here can affect the save protocol.
//
// Two outputs, both consumed by src/git.ts:
//   • `savedRev` bumps on every landed save, so the idle auto-commit re-arms
//     (0.7 no longer bumps `dataRev` when a save lands).
//   • `drainSavedPages()` names the pages a commit covers, for its message.
import { createSignal } from "solid-js";
import { graphEpoch } from "./graphSession";

const saved = new Set<string>();
let savedEpoch = -1;
const [savedRev, setSavedRev] = createSignal(0);
export { savedRev };

function sameGraph(): void {
  // A graph switch in this window starts a new repo: forget the old graph's names.
  if (savedEpoch !== graphEpoch()) { saved.clear(); savedEpoch = graphEpoch(); }
}

/** A save of `name` landed on disk. O(1). */
export function noteSavedForGit(name: string): void {
  sameGraph();
  saved.add(name);
  setSavedRev((n) => n + 1);
}

/** Take (and clear) the names of the pages written since the last call. */
export function drainSavedPages(): string[] {
  sameGraph();
  const out = [...saved];
  saved.clear();
  return out;
}

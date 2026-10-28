// FORK: the git integration's read-only view of saving. Since 0.8 the Rust page
// host writes every page; upstream's `notePublication` (src/document/host/
// wiring.ts) learns when the host confirms a batch of pages is on disk, and calls
// `noteSavedForGit` here for each one. That is the fork's one call in the save
// path; nothing here can affect the save protocol. Page creates and renames do
// not pass through it: they re-arm the auto-commit through `dataRev` only.
//
// Two outputs, both consumed by src/git.ts:
//   • `savedRev` bumps on every landed save, so the idle auto-commit re-arms.
//   • `drainSavedPages()` names the pages a commit covers, for its message.
import { createSignal } from "solid-js";
import { clearOnBindingInvalidated } from "./binding";

const saved = new Set<string>();
// A graph switch in this window starts a new repo: forget the old graph's names.
clearOnBindingInvalidated(() => { saved.clear(); });
const [savedRev, setSavedRev] = createSignal(0);
export { savedRev };

/** A save of `name` landed on disk. O(1). */
export function noteSavedForGit(name: string): void {
  saved.add(name);
  setSavedRev((n) => n + 1);
}

/** Take (and clear) the names of the pages written since the last call. */
export function drainSavedPages(): string[] {
  const out = [...saved];
  saved.clear();
  return out;
}

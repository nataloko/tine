// Optional Git integration (issue #33): commit the markdown graph as you work and
// sync it to a remote — a local-first backup / multi-device workflow, modeled on
// the `logseq-plugin-git` plugin but routed through Tine's data-safety protocol.
// OFF by default; opt-in from the "mine (extras)" settings tab.
//
// Shape:
//   • Commit rides every landed save (`savedRev`, src/gitSaves.ts) and every
//     `dataRev` bump (a delete, an external reload), on a long ~60s idle debounce
//     so it never commits mid-keystroke. It also commits on app close (after the
//     close gate saved everything) and on demand.
//   • Push timing is configurable: on close (default) / on every idle commit /
//     manual only. Push never forces — a non-fast-forward reject says "Pull first".
//   • Pull is opt-in on startup + manual; `--ff-only`, so it never merges. Pulled
//     files reload through the normal watcher → reloadDisposition path, so dirty /
//     edited pages are guarded by the sync-conflict UI (ADR 0012/0020) — git never
//     clobbers a live edit.
//
// The Rust side (src-tauri/src/git.rs) shells out to the *system* git; this module
// owns the timing, the descriptive commit message, and the toasts. Neither side
// touches credentials — the machine's git credential helper / ssh-agent does.

import { createEffect, createRoot, createSignal, on } from "solid-js";
import { backend } from "./backend";
import type { GitResult, GitStatus } from "./gitBackend";
import { graphScopedSignal } from "./binding";
import { dbg } from "./debug";
import { dataRev } from "./graphSession";
import { bindingOwner, graphOwner, ownedWhen, readOwned, writeOwned } from "./owned";
import { preferenceReadCurrent, preferenceRevision, seedPreference, writePreference } from "./preferenceWrites";
import { pushToast } from "./toasts";
import { drainSavedPages, savedRev } from "./gitSaves";

export type PushMode = "on-close" | "on-idle" | "manual";

const ENABLED_KEY = "git.enabled";
const PUSH_MODE_KEY = "git.push_mode";
const PULL_ON_START_KEY = "git.pull_on_start";

// Auto-commit fires only after edits go quiet this long. Deliberately long (OG's
// git plugin uses a similar cadence): a commit per keystroke-burst is noise, and
// batching keeps history readable.
const AUTO_COMMIT_MS = 60_000;

const [enabled, setEnabledSig] = createSignal(false);
const [mode, setModeSig] = createSignal<PushMode>("on-close");
const [pullStart, setPullStartSig] = createSignal(false);
// The repo status belongs to this window's graph: a graph switch clears it.
const [repoStatus, setRepoStatus] = graphScopedSignal<GitStatus>();

/** Reactive: is the git integration turned on? Default OFF. */
export const gitEnabled = enabled;
/** Reactive: when to push (commit always happens on idle + close). */
export const gitPushMode = mode;
/** Reactive: pull once on startup? */
export const gitPullOnStart = pullStart;
/** Reactive: latest repo status (null until first refresh / when unavailable). */
export const gitStatus = repoStatus;

function normalizeMode(s: string): PushMode {
  return s === "on-idle" || s === "manual" ? s : "on-close";
}

/** Compose a descriptive commit message from the pages written since the last
 *  commit. Pure (unit-tested). Names beyond the first three collapse to "+N more"
 *  so the subject line stays short. */
export function composeCommitMessage(pages: string[]): string {
  const names = pages.filter((p) => p && p.trim().length > 0);
  if (names.length === 0) return "Tine: update graph";
  const shown = names.slice(0, 3).join(", ");
  if (names.length <= 3) return `Tine: update ${shown}`;
  return `Tine: update ${shown} +${names.length - 3} more`;
}

/** Pull the current repo status into the signal. A failed read keeps the last
 *  good status (it is not "no repo") and goes to the debug log; a status that
 *  lands after a graph switch is dropped. */
async function refreshGitStatus(): Promise<void> {
  try {
    const result = await readOwned(graphOwner(), backend().gitStatus());
    if (result.kind === "current") setRepoStatus(result.value);
  } catch (e) {
    dbg(`git status failed: ${String(e)}`);
  }
}

// --- Op runners (toast + status refresh). Each git op changes the repo of the
// graph this window had when it started, so it runs under that binding: it
// always completes, but its toast and status only land while that graph is
// still open. `quiet` suppresses the success toast for automatic
// (idle/close/startup) ops so they don't nag; failures of manual ops always
// show, and a push-reject stays sticky so the user can act on it. ---

async function runCommit(message: string, quiet: boolean): Promise<GitResult | undefined> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitCommit(message));
    if (result.kind === "stale") return;
    const r = result.value;
    if (!r.ok) pushToast(r.detail, "error");
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    dbg(`git commit failed: ${String(e)}`);
    if (!quiet) pushToast(`Git commit failed — ${String(e)}`, "error");
    return;
  }
}

async function runPush(quiet: boolean): Promise<GitResult | undefined> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitPush());
    if (result.kind === "stale") return;
    const r = result.value;
    // A push rejected because the remote moved stays sticky so the user can act on
    // it. `needs_pull` is a field on the result, not a phrase parsed back out of
    // `detail` — see GitResult in src-tauri/src/git.rs.
    if (!r.ok) pushToast(r.detail, "warn", { sticky: r.needs_pull });
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    dbg(`git push failed: ${String(e)}`);
    if (!quiet) pushToast(`Git push failed — ${String(e)}`, "error");
    return;
  }
}

async function runPull(quiet: boolean): Promise<GitResult | undefined> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitPull());
    if (result.kind === "stale") return;
    const r = result.value;
    if (!r.ok) pushToast(r.detail, "warn");
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    dbg(`git pull failed: ${String(e)}`);
    if (!quiet) pushToast(`Git pull failed — ${String(e)}`, "error");
    return;
  }
}

// Force ops are always manual (Settings buttons, behind a confirm) and always
// loud — they overwrite data, so the outcome must be visible.
async function runForcePush(): Promise<void> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitForcePush());
    if (result.kind === "stale") return;
    pushToast(result.value.detail, result.value.ok ? "success" : "warn");
    await refreshGitStatus();
  } catch (e) {
    pushToast(`Git force-push failed — ${String(e)}`, "error");
  }
}

async function runForcePull(): Promise<void> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitForcePull());
    if (result.kind === "stale") return;
    pushToast(result.value.detail, result.value.ok ? "success" : "warn");
    await refreshGitStatus();
  } catch (e) {
    pushToast(`Git force-pull failed — ${String(e)}`, "error");
  }
}

// --- Auto-commit on idle -----------------------------------------------------

let autoTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoCommit(): void {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    autoTimer = null;
    void autoCommit();
  }, AUTO_COMMIT_MS);
}

async function autoCommit(): Promise<void> {
  if (!enabled()) return;
  const r = await runCommit(composeCommitMessage(drainSavedPages()), true);
  if (r?.ok && mode() === "on-idle") await runPush(true);
}

// Every landed save and every `dataRev` bump (re)arms the idle debounce.
// `on(..., {defer:true})` so it tracks ONLY those two (not `enabled`) and never
// fires on initial run — created once, app-lifetime.
createRoot(() =>
  createEffect(
    on(
      [savedRev, dataRev],
      () => {
        if (enabled()) scheduleAutoCommit();
      },
      { defer: true }
    )
  )
);

// --- Lifecycle + manual actions ---------------------------------------------

/** Load persisted prefs at startup; if enabled, do the opt-in pull-on-start
 *  (before any edits, so its reload is clean) and refresh status. */
export async function initGit(): Promise<void> {
  // Each preference lands only if the user has not changed it meanwhile (the
  // same rule as upstream's device preferences); a failed read toasts and keeps
  // the defaults, i.e. the integration stays off.
  const revisions = [preferenceRevision(enabled), preferenceRevision(mode), preferenceRevision(pullStart)] as const;
  try {
    const loaded = await readOwned(
      ownedWhen(() => preferenceReadCurrent(enabled, revisions[0]) || preferenceReadCurrent(mode, revisions[1])
        || preferenceReadCurrent(pullStart, revisions[2])),
      Promise.all([
        backend().getAppBool(ENABLED_KEY, false),
        backend().getAppString(PUSH_MODE_KEY, "on-close"),
        backend().getAppBool(PULL_ON_START_KEY, false),
      ]),
    );
    if (loaded.kind === "stale") return;
    const [en, m, pull] = loaded.value;
    if (preferenceReadCurrent(enabled, revisions[0])) { setEnabledSig(en); seedPreference(enabled); }
    if (preferenceReadCurrent(mode, revisions[1])) { setModeSig(normalizeMode(m)); seedPreference(mode); }
    if (preferenceReadCurrent(pullStart, revisions[2])) { setPullStartSig(pull); seedPreference(pullStart); }
  } catch {
    pushToast("Could not load git integration preferences.", "error");
    return;
  }
  if (!enabled()) return;
  if (pullStart()) await runPull(true);
  await refreshGitStatus();
}

/** Commit (and, unless push-mode is manual, push) on app close — called after
 *  App's close gate (`safeClose.prepare()`) accepted, so the disk is current.
 *  Awaited within the close cap; best-effort and quiet since the window is going
 *  away. */
export async function commitOnClose(): Promise<void> {
  if (!enabled()) return;
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  const r = await runCommit(composeCommitMessage(drainSavedPages()), true);
  if (r?.ok && mode() !== "manual") await runPush(true);
}

/** Manual "Commit now" (Settings button / topbar). Loud (toasts the outcome). */
export async function commitNow(): Promise<void> {
  await runCommit(composeCommitMessage(drainSavedPages()), false);
}
/** Manual "Push". */
export async function pushNow(): Promise<void> {
  await runPush(false);
}
/** Manual "Pull". */
export async function pullNow(): Promise<void> {
  await runPull(false);
}
/** Manual "Force push" — overwrites the remote. Gate behind a confirm at the UI. */
export async function forcePushNow(): Promise<void> {
  await runForcePush();
}
/** Manual "Force pull" — overwrites local. Gate behind a confirm at the UI. */
export async function forcePullNow(): Promise<void> {
  await runForcePull();
}
/** "Initialize git repo" affordance for an un-versioned graph. */
export async function initRepo(): Promise<void> {
  try {
    const result = await writeOwned(bindingOwner(), backend().gitInit());
    if (result.kind === "stale") return;
    setRepoStatus(result.value);
    pushToast("Initialized a git repo for this graph.", "success");
  } catch (e) {
    pushToast(`Couldn't initialize git — ${String(e)}`, "error");
  }
}

// --- Setters (persist + apply) ----------------------------------------------

// Each applies now and queues a device-local write through upstream's
// preference queue: a failed latest write rolls back and toasts.
export function setGitEnabled(on: boolean): void {
  writePreference(enabled, setEnabledSig, on, (next) => backend().setAppBool(ENABLED_KEY, next), "git integration preference");
  if (on) void refreshGitStatus();
}
export function setGitPushMode(m: PushMode): void {
  writePreference(mode, setModeSig, m, (next) => backend().setAppString(PUSH_MODE_KEY, next), "git push timing");
}
export function setGitPullOnStart(on: boolean): void {
  writePreference(pullStart, setPullStartSig, on, (next) => backend().setAppBool(PULL_ON_START_KEY, next), "git pull-on-startup preference");
}

/** Refresh status on demand (e.g. when the Settings tab opens). */
export async function reloadGitStatus(): Promise<void> {
  await refreshGitStatus();
}

// --- Topbar badge helpers (pure; unit-tested) --------------------------------

/** Compact badge label: branch + dirty/ahead/behind glyphs (e.g. "main ●2 ↑1"). */
export function gitBadgeText(s: GitStatus | null): string {
  if (!s || !s.is_repo) return "";
  const parts = [s.branch || "git"];
  if (s.dirty_count > 0) parts.push(`●${s.dirty_count}`);
  if (s.ahead > 0) parts.push(`↑${s.ahead}`);
  if (s.behind > 0) parts.push(`↓${s.behind}`);
  return parts.join(" ");
}

/** The single most useful next action for a badge click, given the status:
 *  pull (get remote first) → commit (local changes) → push (local ahead). */
export function nextGitAction(s: GitStatus | null): "pull" | "commit" | "push" | "none" {
  if (!s || !s.is_repo) return "none";
  if (s.behind > 0) return "pull";
  if (s.dirty_count > 0) return "commit";
  if (s.ahead > 0) return "push";
  return "none";
}

/** Tooltip for the badge — the state plus what a click will do. */
export function gitBadgeTitle(s: GitStatus | null): string {
  if (!s || !s.is_repo) return "Git";
  const bits = [`On ${s.branch || "(detached)"}`];
  bits.push(s.dirty_count === 0 ? "clean" : `${s.dirty_count} uncommitted`);
  if (s.has_upstream) {
    if (s.ahead) bits.push(`↑${s.ahead}`);
    if (s.behind) bits.push(`↓${s.behind}`);
  } else {
    bits.push("no remote");
  }
  const act = nextGitAction(s);
  return `${bits.join(" · ")} — ${act === "none" ? "up to date" : `click to ${act}`}`;
}

/** Run the smart next action for a topbar badge click. */
export function runGitBadgeAction(): Promise<void> {
  switch (nextGitAction(gitStatus())) {
    case "pull":
      return pullNow();
    case "commit":
      return commitNow();
    case "push":
      return pushNow();
    default:
      return reloadGitStatus();
  }
}

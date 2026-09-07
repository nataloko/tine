// Optional Git integration (issue #33): commit the markdown graph as you work and
// sync it to a remote — a local-first backup / multi-device workflow, modeled on
// the `logseq-plugin-git` plugin but routed through Tine's data-safety protocol.
// OFF by default; opt-in from the "mine (extras)" settings tab.
//
// Shape:
//   • Commit rides the post-save `dataRev` bump (fires ~700ms after a save batch
//     lands = disk is current), on a long ~60s idle debounce so it never commits
//     mid-keystroke. It also commits on app close (after flushAll) and on demand.
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
import { backend, type GitResult, type GitStatus } from "./backend";
import { dataRev, pushToast } from "./ui";
import { drainSavedPages } from "./persistence";

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
const [status, setStatus] = createSignal<GitStatus | null>(null);

/** Reactive: is the git integration turned on? Default OFF. */
export const gitEnabled = enabled;
/** Reactive: when to push (commit always happens on idle + close). */
export const gitPushMode = mode;
/** Reactive: pull once on startup? */
export const gitPullOnStart = pullStart;
/** Reactive: latest repo status (null until first refresh / when unavailable). */
export const gitStatus = status;

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

/** Pull the current repo status into the signal (best-effort; null on failure). */
async function refreshGitStatus(): Promise<void> {
  try {
    setStatus(await backend().gitStatus());
  } catch {
    setStatus(null);
  }
}

// --- Op runners (toast + status refresh). `quiet` suppresses the success toast
// for automatic (idle/close/startup) ops so they don't nag; failures always show,
// and a push-reject stays sticky so the user can act on it. ---

async function runCommit(message: string, quiet: boolean): Promise<GitResult | null> {
  try {
    const r = await backend().gitCommit(message);
    if (!r.ok) pushToast(r.detail, "error");
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    if (!quiet) pushToast(`Git commit failed — ${String(e)}`, "error");
    return null;
  }
}

async function runPush(quiet: boolean): Promise<GitResult | null> {
  try {
    const r = await backend().gitPush();
    // A push rejected because the remote moved stays sticky so the user can act on
    // it. `needs_pull` is a field on the result, not a phrase parsed back out of
    // `detail` — see GitResult in src-tauri/src/git.rs.
    if (!r.ok) pushToast(r.detail, "warn", { sticky: r.needs_pull });
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    if (!quiet) pushToast(`Git push failed — ${String(e)}`, "error");
    return null;
  }
}

async function runPull(quiet: boolean): Promise<GitResult | null> {
  try {
    const r = await backend().gitPull();
    if (!r.ok) pushToast(r.detail, "warn");
    else if (!quiet) pushToast(r.detail, "success");
    await refreshGitStatus();
    return r;
  } catch (e) {
    if (!quiet) pushToast(`Git pull failed — ${String(e)}`, "error");
    return null;
  }
}

// Force ops are always manual (Settings buttons, behind a confirm) and always
// loud — they overwrite data, so the outcome must be visible.
async function runForcePush(): Promise<GitResult | null> {
  try {
    const r = await backend().gitForcePush();
    pushToast(r.detail, r.ok ? "success" : "warn");
    await refreshGitStatus();
    return r;
  } catch (e) {
    pushToast(`Git force-push failed — ${String(e)}`, "error");
    return null;
  }
}

async function runForcePull(): Promise<GitResult | null> {
  try {
    const r = await backend().gitForcePull();
    pushToast(r.detail, r.ok ? "success" : "warn");
    await refreshGitStatus();
    return r;
  } catch (e) {
    pushToast(`Git force-pull failed — ${String(e)}`, "error");
    return null;
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

// Every post-save `dataRev` bump (re)arms the idle debounce. `on(..., {defer:true})`
// so it tracks ONLY dataRev (not `enabled`) and never fires on initial run —
// created once, app-lifetime.
createRoot(() =>
  createEffect(
    on(
      dataRev,
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
  try {
    const [en, m, pull] = await Promise.all([
      backend().getAppBool(ENABLED_KEY, false),
      backend().getAppString(PUSH_MODE_KEY, "on-close"),
      backend().getAppBool(PULL_ON_START_KEY, false),
    ]);
    setEnabledSig(en);
    setModeSig(normalizeMode(m));
    setPullStartSig(pull);
  } catch {
    /* defaults: off */
  }
  if (!enabled()) return;
  if (pullStart()) await runPull(true);
  await refreshGitStatus();
}

/** Commit (and, unless push-mode is manual, push) on app close — called after
 *  `flushAll()` so the disk is current. Awaited within the close cap; best-effort
 *  and quiet since the window is going away. */
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
    setStatus(await backend().gitInit());
    pushToast("Initialized a git repo for this graph.", "success");
  } catch (e) {
    pushToast(`Couldn't initialize git — ${String(e)}`, "error");
  }
}

// --- Setters (persist + apply) ----------------------------------------------

export function setGitEnabled(on: boolean): void {
  setEnabledSig(on);
  void backend().setAppBool(ENABLED_KEY, on).catch(() => {});
  if (on) void refreshGitStatus();
}
export function setGitPushMode(m: PushMode): void {
  setModeSig(m);
  void backend().setAppString(PUSH_MODE_KEY, m).catch(() => {});
}
export function setGitPullOnStart(on: boolean): void {
  setPullStartSig(on);
  void backend().setAppBool(PULL_ON_START_KEY, on).catch(() => {});
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

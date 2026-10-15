// FORK: the git integration's native commands (issue #33), reached through
// `gitBackend()` rather than upstream's `Backend`. Upstream caps a production
// file at 1,500 lines (src/ogEnforcement.test.ts) and since v0.7.2 its own
// backend.ts sits exactly at that cap, so the fork keeps no lines there (nor in
// mock.ts or publishedBackend.ts). Callers still run every command under
// `readOwned`/`writeOwned` (I-20), though that guard only scans `backend()`.
// The command names match `src-tauri/src/git.rs`.

import { backend, isTauri } from "./backend";
import { isPublishedExport } from "./publishedBackend";

/** Repo status for the git integration's status line / topbar badge. */
export interface GitStatus {
  is_repo: boolean;
  branch: string;
  dirty_count: number;
  has_upstream: boolean;
  ahead: number;
  behind: number;
  last_commit: string;
}
export interface GitResult {
  op: string;
  ok: boolean;
  detail: string;
  /** A push was rejected because the remote moved — Pull first. Carried as a
   *  field so the frontend never has to classify `detail` as prose (I-9). */
  needs_pull: boolean;
}

export interface GitBackend {
  /** Optional Git integration (issue #33). All shell out to the *system* git in
   *  the graph root; off unless enabled in the "mine (extras)" tab. Read-only
   *  status of the graph repo (is-repo, branch, dirty/ahead/behind, last commit). */
  gitStatus(): Promise<GitStatus>;
  /** `git init` the graph root + write a default Logseq `.gitignore`; returns the
   *  fresh status. */
  gitInit(): Promise<GitStatus>;
  /** `git add -A && git commit -m <message>`. "Nothing to commit" is a success
   *  no-op, not an error. */
  gitCommit(message: string): Promise<GitResult>;
  /** Push the current branch (never forced — a non-fast-forward reject returns
   *  ok:false with a "Pull first" detail). Awaited, so an on-close push finishes. */
  gitPush(): Promise<GitResult>;
  /** `git pull --ff-only`. Pulled files land on disk and reload through the normal
   *  watcher → reloadDisposition path (dirty pages guarded by the conflict UI). */
  gitPull(): Promise<GitResult>;
  /** `git push --force` — overwrites remote history with the local branch.
   *  Destructive; callers must confirm first. */
  gitForcePush(): Promise<GitResult>;
  /** `git fetch` + `git reset --hard @{upstream}` — discards local commits and
   *  tracked-file edits so the working tree matches the remote. Destructive;
   *  callers must confirm first. The reset reloads through the watcher path. */
  gitForcePull(): Promise<GitResult>;
}

let instance: GitBackend | null = null;

/** The git commands for this window: native in the app, a simulated repo in the
 *  browser mock. A published export is a baked snapshot with no working tree, so
 *  there it is the published backend itself, which refuses (read-only) every
 *  method it does not answer, gitStatus included. */
export function gitBackend(): GitBackend {
  if (isTauri()) return (instance ??= nativeGitCommands());
  if (isPublishedExport()) return backend() as unknown as GitBackend;
  return (instance ??= mockGitCommands());
}

/** Plain IPC: no command here is in upstream's ordered write lane, so a slow
 *  push never holds a save back, and `git.rs` finds the graph from the window. */
function nativeGitCommands(): GitBackend {
  const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  };
  return {
    gitStatus: () => call<GitStatus>("git_status"),
    gitInit: () => call<GitStatus>("git_init"),
    gitCommit: (message) => call<GitResult>("git_commit", { message }),
    gitPush: () => call<GitResult>("git_push"),
    gitPull: () => call<GitResult>("git_pull"),
    gitForcePush: () => call<GitResult>("git_force_push"),
    gitForcePull: () => call<GitResult>("git_force_pull"),
  };
}

/** The browser mock's git (`npm run dev`). A tiny simulated repo so the
 *  "mine (extras)" Git UI is exercisable without a real one: commit clears the
 *  dirty count, push clears "ahead", pull is a no-op. */
function mockGitCommands(): GitBackend {
  const repo = { is_repo: true, branch: "main", dirty: 2, ahead: 1, behind: 0, last: "a1b2c3d edits" };
  const status = async (): Promise<GitStatus> => ({
    is_repo: repo.is_repo,
    branch: repo.branch,
    dirty_count: repo.dirty,
    has_upstream: true,
    ahead: repo.ahead,
    behind: repo.behind,
    last_commit: repo.last,
  });
  return {
    gitStatus: status,
    async gitInit() {
      repo.is_repo = true;
      return status();
    },
    async gitCommit(message) {
      if (repo.dirty === 0) return { op: "commit", ok: true, detail: "Nothing to commit.", needs_pull: false };
      repo.dirty = 0;
      repo.ahead += 1;
      repo.last = `mock ${message.slice(0, 24)}`;
      return { op: "commit", ok: true, detail: "Committed changes.", needs_pull: false };
    },
    async gitPush() {
      repo.ahead = 0;
      return { op: "push", ok: true, detail: "Pushed to remote.", needs_pull: false };
    },
    async gitPull() {
      repo.behind = 0;
      return { op: "pull", ok: true, detail: "Already up to date.", needs_pull: false };
    },
    async gitForcePush() {
      repo.ahead = 0;
      return { op: "push", ok: true, detail: "Force-pushed — remote now matches local.", needs_pull: false };
    },
    async gitForcePull() {
      repo.behind = 0;
      repo.dirty = 0;
      repo.ahead = 0;
      return { op: "pull", ok: true, detail: "Reset to remote — local changes discarded.", needs_pull: false };
    },
  };
}

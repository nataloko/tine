// FORK: the git integration's slice of the `Backend` contract (issue #33), kept
// out of src/backend.ts. Upstream caps a production file at 1,500 lines
// (src/ogEnforcement.test.ts) and backend.ts sits just under it, so the fork's
// whole footprint there is four lines: an import, `Backend extends GitBackend`,
// the matching `interface TauriBackend extends GitBackend {}` merge, and the
// `installGitCommands(TauriBackend.prototype)` call below. The command
// names match `src-tauri/src/git.rs`.

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

type GitCommandHost = { call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };

/** Give the native backend class the seven git commands. Each goes through the
 *  class's own `call`, so it keeps upstream's IPC diagnostics (none is in the
 *  ordered write lane, so a slow push never holds a save back); `git.rs` ignores
 *  the binding generation `call` adds. */
export function installGitCommands(proto: object): void {
  const methods: { [K in keyof GitBackend]: (this: GitCommandHost, ...args: Parameters<GitBackend[K]>) => ReturnType<GitBackend[K]> } = {
    gitStatus() { return this.call<GitStatus>("git_status"); },
    gitInit() { return this.call<GitStatus>("git_init"); },
    gitCommit(message) { return this.call<GitResult>("git_commit", { message }); },
    gitPush() { return this.call<GitResult>("git_push"); },
    gitPull() { return this.call<GitResult>("git_pull"); },
    gitForcePush() { return this.call<GitResult>("git_force_push"); },
    gitForcePull() { return this.call<GitResult>("git_force_pull"); },
  };
  Object.assign(proto, methods);
}

/** The browser mock's git (`npm run dev`), spread into `mockBackend()`. A tiny
 *  simulated repo so the "mine (extras)" Git UI is exercisable without a real
 *  one: commit clears the dirty count, push clears "ahead", pull is a no-op. */
export function mockGitCommands(): GitBackend {
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

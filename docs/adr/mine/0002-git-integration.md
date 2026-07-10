# mine/0002. Optional Git integration via the system git, routed through the save protocol

- **Status:** Accepted
- **Date:** 2026-07-09

## Context

Issue #33 asks for a simple Git integration: commit the graph as you edit and on
close, optionally push, so the markdown graph doubles as a versioned backup / a
multi-device sync. The reference point is `logseq-plugin-git` (Commit / Push / Pull
+ opt-in auto-push); OG Logseq itself is commit-only via a bundled dugite.

Tine already edits the same on-disk graph concurrently with Logseq and file sync,
and it has hard-won machinery for that: `persistence.ts` is the *only* frontend
writer, `commit_write` owns disk truth, and every external on-disk change reloads
through the watcher → `reloadDisposition`, with dirty/edited pages guarded by the
sync-conflict UI (ADR 0012, 0020). A git integration that wrote or reloaded files
"its own way" would be a second writer/reloader — exactly the class of bug those
ADRs exist to prevent. It would also be the first feature to run a long,
network-bound, failure-prone subprocess.

The real tensions:
- **Where git runs.** Bundling a git (dugite) vs. using the machine's git. The user
  has git installed and credentials configured (helper / ssh-agent), so bundling
  adds weight and a second credential story for no gain.
- **Blocking.** A push/pull can take seconds or hang on a credential prompt. A
  synchronous Tauri command runs on the main thread and would freeze the UI.
- **Data safety.** A pull rewrites files under a live editor; a naïve
  `git pull`/`merge` could create merge commits or clobber unsaved edits.
- **Cadence.** Commit-per-keystroke is noise; never-committing defeats the point.

## Decision

**We add an opt-in Git integration (off by default, in the "mine (extras)" tab)
that shells out to the *system* git and never bypasses the save/reload protocol.**

- **Backend (`src-tauri/src/git.rs`).** Five `async` commands — `git_status`,
  `git_init`, `git_commit`, `git_push`, `git_pull` — run the git subprocess in the
  graph root via `spawn_blocking`, so nothing touches the main thread. `git` is
  never bundled and credentials are never handled: `GIT_TERMINAL_PROMPT=0` makes an
  unauthenticated network op fail fast instead of hanging, while the machine's
  credential helper still works. Git only ever writes `.git/`, never graph files, so
  the persistence self-write marker and dirty tracking are untouched.
- **Safety by construction.** Commit only happens when the disk is current
  (auto-commit rides the post-save `dataRev` bump; close-commit runs after
  `flushAll`). Push never mutates local files and never forces — a non-fast-forward
  reject returns a "Pull first" message. Pull is `--ff-only` (never a merge); the
  files it lands reload through the *existing* watcher → `reloadDisposition`, so a
  dirty or edited page is surfaced via the ADR 0020 conflict UI rather than
  overwritten. Every failure toasts but can never block or corrupt the save path.
- **Frontend (`src/git.ts`).** Owns timing and messaging (the Rust layer stays
  dumb). Auto-commit fires on a long ~60s idle debounce off `dataRev`; push timing
  is a user setting (on close / on every idle commit / manual); pull is opt-in on
  startup plus a manual button. Commit messages are composed frontend-side from the
  pages saved since the last commit (a read-only `drainSavedPages` accumulator in
  `persistence.ts`).
- **On-close completion.** The close path *awaits* the commit/push (bounded by the
  existing 4s close cap) rather than firing an event — an emitted background push
  would be killed when the process exits. Awaiting keeps the process alive just long
  enough to finish, and the cap guarantees git can never wedge quit.

## Consequences

- The graph becomes a first-class versioned artifact with almost no new surface:
  ~one Rust module + one frontend module, no bundled binary, no credential storage,
  no new save/reload path. All git flows through primitives ADR 0012/0020 already
  proved safe.
- Because we depend on the system git, behavior varies with the user's git version
  and remote/credential setup. That is an accepted trade for zero bundling; failures
  are reported as friendly toasts, not raw stderr.
- We deliberately do **not** resolve merges: a diverged history stops with "resolve
  manually". Fast-forward-only keeps us from ever inventing a merge the user didn't
  ask for; the conflict UI already covers the on-disk-vs-live case.
- Auto-commit is coarse (60s idle) — history is readable but not fine-grained. Manual
  "Commit now" covers the "checkpoint this exact moment" case.
- Fork-local: this ships on `mine` as a "mine (extras)" feature; it is a candidate
  answer to upstream #33 but is not assumed to be merged upstream.
- **Multi-graph (upstream ADR 0038, adopted v0.5.3):** the git commands resolve the
  graph of the *calling window* (`slot_for_window(&state, window.label())`), not a
  single global graph. Each window owns its own graph, so each is its own repo and
  git acts on the one you invoked it from — auto-commit on a window's close commits
  that window's graph even with other graph windows open.

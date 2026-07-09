//! Optional Git integration (issue #33) — shells out to the *system* `git` in the
//! graph root to snapshot/sync the markdown graph. Off by default; opt-in from the
//! "mine (extras)" settings tab. It NEVER bundles git and NEVER handles credentials:
//! the machine's git + its configured credential helper / ssh-agent do that.
//!
//! Data-safety (ADR 0012/0020): git only ever writes `.git/`, never the graph text
//! files, so the persistence layer's self-write marker and dirty tracking are
//! untouched. A `pull` that rewrites files is picked up by the existing file
//! watcher (`watcher.rs`) → `graph-changed` → the frontend's `reloadDisposition`,
//! which guards dirty/edited pages via the sync-conflict UI — git never overwrites
//! live edits directly.
//!
//! Every command is `async` and runs the (potentially slow, network-bound) git
//! subprocess on the blocking pool via `spawn_blocking`, so it never stalls the
//! main thread. The frontend AWAITS each op (rather than us firing an event), which
//! also keeps the process alive long enough for an on-close push to finish before
//! Tine quits.

use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::Manager;

/// A snapshot of the graph repo for the status line / topbar badge. All-zero /
/// `is_repo:false` when the root isn't a git repo (or git isn't installed).
#[derive(Default, serde::Serialize)]
pub(crate) struct GitStatus {
    is_repo: bool,
    branch: String,
    dirty_count: usize,
    has_upstream: bool,
    ahead: usize,
    behind: usize,
    last_commit: String,
}

/// The result of a git operation, for a toast. `ok:false` is a *handled* failure
/// (a friendly `detail` to show), not a thrown error.
#[derive(Clone, serde::Serialize)]
pub(crate) struct GitResult {
    op: String,
    ok: bool,
    detail: String,
}

impl GitResult {
    fn new(op: &str, ok: bool, detail: impl Into<String>) -> Self {
        GitResult {
            op: op.to_string(),
            ok,
            detail: detail.into(),
        }
    }
}

/// Default `.gitignore` written on auto-init — keeps Logseq's local-only churn
/// (recycle bin, backups, version snapshots, trash) out of version control so
/// commits stay to real graph content.
const DEFAULT_GITIGNORE: &str = "\
.recycle/
logseq/bak/
logseq/version-files/
.trash/
";

/// Resolve the current graph root, releasing the state lock before returning (so
/// the subsequent blocking git work never holds it).
fn graph_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<AppState>();
    let guard = state.graph.read().unwrap();
    guard
        .as_ref()
        .map(|g| g.root.clone())
        .ok_or_else(|| "no graph loaded".to_string())
}

/// A `git` command rooted in the graph, with a clean, non-interactive environment.
/// `GIT_TERMINAL_PROMPT=0` makes a push/pull that lacks credentials fail fast
/// instead of hanging forever on a prompt (the machine's credential helper still
/// works — this only disables the blocking *interactive* fallback). On Linux we
/// also scrub the WebKit/AppImage env vars Tine may set for its own rendering so
/// the system git never loads bundled libs (hygiene, mirrors
/// `platform::opener_command`).
fn git_base(root: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null());
    #[cfg(target_os = "linux")]
    for k in [
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "GIO_MODULE_DIR",
        "GTK_PATH",
        "GDK_PIXBUF_MODULE_FILE",
        "GTK_IM_MODULE_FILE",
    ] {
        cmd.env_remove(k);
    }
    cmd
}

/// Run a git subcommand to completion, capturing output. `Err` only when git
/// itself couldn't be launched (not installed) — a non-zero git exit is still `Ok`.
fn run_git(root: &Path, args: &[&str]) -> Result<Output, String> {
    git_base(root)
        .args(args)
        .output()
        .map_err(|e| format!("couldn't run git: {e}"))
}

/// stdout ++ stderr as lossy UTF-8 (git writes progress/errors to both).
fn combined(out: &Output) -> String {
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    s
}

/// First non-blank line of some git output, trimmed — a compact toast detail.
fn first_line(s: &str) -> String {
    s.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string()
}

/// Count changed entries in `git status --porcelain` output (one path per line).
fn count_porcelain_lines(s: &str) -> usize {
    s.lines().filter(|l| !l.trim().is_empty()).count()
}

/// Parse `git rev-list --count --left-right @{upstream}...HEAD` → "behind<TAB>ahead"
/// (left = upstream-only commits = behind; right = HEAD-only = ahead). Returns
/// `(ahead, behind)`.
fn parse_ahead_behind(s: &str) -> (usize, usize) {
    let mut it = s.split_whitespace();
    let behind = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let ahead = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

/// Map a failed `git push`'s output to a friendly, actionable detail. The
/// non-fast-forward case is the important one: the remote moved, so the user must
/// Pull before pushing (never a forced push).
fn classify_push_error(msg: &str) -> String {
    if msg.contains("non-fast-forward") || msg.contains("fetch first") || msg.contains("[rejected]")
    {
        "Remote moved — Pull first, then Push.".to_string()
    } else if msg.contains("no upstream")
        || msg.contains("no configured push destination")
        || msg.contains("does not appear to be a git repository")
    {
        "No remote configured for this branch.".to_string()
    } else if msg.contains("could not read Username") || msg.contains("Authentication failed") {
        "Git couldn't authenticate — check your credential setup.".to_string()
    } else {
        let l = first_line(msg);
        if l.is_empty() {
            "Push failed.".to_string()
        } else {
            l
        }
    }
}

/// Map a failed `git pull --ff-only`'s output to a friendly detail. A diverged
/// history can't fast-forward — surfaced so the user resolves it deliberately
/// rather than us forcing a merge.
fn classify_pull_error(msg: &str) -> String {
    if msg.contains("Not possible to fast-forward")
        || msg.contains("diverged")
        || msg.contains("non-fast-forward")
    {
        "Local and remote have diverged — resolve manually.".to_string()
    } else if msg.contains("no tracking information") || msg.contains("no upstream") {
        "No remote configured for this branch.".to_string()
    } else if msg.contains("could not read Username") || msg.contains("Authentication failed") {
        "Git couldn't authenticate — check your credential setup.".to_string()
    } else {
        let l = first_line(msg);
        if l.is_empty() {
            "Pull failed.".to_string()
        } else {
            l
        }
    }
}

// --- Blocking implementations (run on the spawn_blocking pool) ---------------

fn status_in(root: &Path) -> GitStatus {
    let is_repo = run_git(root, &["rev-parse", "--is-inside-work-tree"])
        .map(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).trim() == "true")
        .unwrap_or(false);
    if !is_repo {
        return GitStatus::default();
    }
    let mut st = GitStatus {
        is_repo: true,
        ..Default::default()
    };
    if let Ok(o) = run_git(root, &["branch", "--show-current"]) {
        st.branch = String::from_utf8_lossy(&o.stdout).trim().to_string();
    }
    if let Ok(o) = run_git(root, &["status", "--porcelain"]) {
        st.dirty_count = count_porcelain_lines(&String::from_utf8_lossy(&o.stdout));
    }
    // ahead/behind only when the branch has an upstream; the command errors otherwise.
    if let Ok(o) = run_git(
        root,
        &["rev-list", "--count", "--left-right", "@{upstream}...HEAD"],
    ) {
        if o.status.success() {
            st.has_upstream = true;
            let (a, b) = parse_ahead_behind(&String::from_utf8_lossy(&o.stdout));
            st.ahead = a;
            st.behind = b;
        }
    }
    if let Ok(o) = run_git(root, &["log", "-1", "--pretty=format:%h %s"]) {
        if o.status.success() {
            st.last_commit = String::from_utf8_lossy(&o.stdout).trim().to_string();
        }
    }
    st
}

fn init_in(root: &Path) -> Result<GitStatus, String> {
    let out = run_git(root, &["init"])?;
    if !out.status.success() {
        return Err(first_line(&combined(&out)));
    }
    let gi = root.join(".gitignore");
    if !gi.exists() {
        let _ = std::fs::write(&gi, DEFAULT_GITIGNORE);
    }
    Ok(status_in(root))
}

fn commit_in(root: &Path, message: &str) -> Result<GitResult, String> {
    let add = run_git(root, &["add", "-A"])?;
    if !add.status.success() {
        return Ok(GitResult::new("commit", false, first_line(&combined(&add))));
    }
    let out = git_base(root)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| format!("couldn't run git: {e}"))?;
    if out.status.success() {
        return Ok(GitResult::new("commit", true, "Committed changes."));
    }
    let msg = combined(&out);
    if msg.contains("nothing to commit") || msg.contains("working tree clean") {
        return Ok(GitResult::new("commit", true, "Nothing to commit."));
    }
    Ok(GitResult::new("commit", false, first_line(&msg)))
}

fn push_in(root: &Path) -> GitResult {
    match git_base(root).args(["push"]).output() {
        Ok(out) if out.status.success() => GitResult::new("push", true, "Pushed to remote."),
        Ok(out) => GitResult::new("push", false, classify_push_error(&combined(&out))),
        Err(e) => GitResult::new("push", false, format!("couldn't run git: {e}")),
    }
}

fn pull_in(root: &Path) -> GitResult {
    match git_base(root).args(["pull", "--ff-only"]).output() {
        Ok(out) if out.status.success() => {
            let msg = combined(&out);
            let detail = if msg.contains("Already up to date") {
                "Already up to date."
            } else {
                "Pulled from remote."
            };
            GitResult::new("pull", true, detail)
        }
        Ok(out) => GitResult::new("pull", false, classify_pull_error(&combined(&out))),
        Err(e) => GitResult::new("pull", false, format!("couldn't run git: {e}")),
    }
}

// --- Commands (async; blocking git runs off the main thread) -----------------

/// Read-only status of the graph repo. Cheap; polled + refreshed after ops.
#[tauri::command]
pub(crate) async fn git_status(app: tauri::AppHandle) -> Result<GitStatus, String> {
    let root = graph_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || status_in(&root))
        .await
        .map_err(|e| e.to_string())
}

/// `git init` the graph root and drop a default Logseq `.gitignore` if absent. An
/// affordance for turning an un-versioned graph into a repo — never forced.
#[tauri::command]
pub(crate) async fn git_init(app: tauri::AppHandle) -> Result<GitStatus, String> {
    let root = graph_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || init_in(&root))
        .await
        .map_err(|e| e.to_string())?
}

/// `git add -A` then `git commit -m <message>`. "Nothing to commit" is a success
/// no-op (not an error) so an idle auto-commit with no changes is silent.
#[tauri::command]
pub(crate) async fn git_commit(
    message: String,
    app: tauri::AppHandle,
) -> Result<GitResult, String> {
    let root = graph_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || commit_in(&root, &message))
        .await
        .map_err(|e| e.to_string())?
}

/// Push the current branch. Never forces — a non-fast-forward reject becomes a
/// "Pull first" message. Awaited by the frontend, so an on-close push completes
/// before the process exits.
#[tauri::command]
pub(crate) async fn git_push(app: tauri::AppHandle) -> Result<GitResult, String> {
    let root = graph_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || push_in(&root))
        .await
        .map_err(|e| e.to_string())
}

/// Pull with `--ff-only`. A fast-forward-only pull never creates a merge and never
/// rewrites local edits; pulled files land on disk and flow through the watcher →
/// reloadDisposition, so dirty/edited pages are guarded by the sync-conflict UI.
#[tauri::command]
pub(crate) async fn git_pull(app: tauri::AppHandle) -> Result<GitResult, String> {
    let root = graph_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || pull_in(&root))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_porcelain_entries() {
        assert_eq!(count_porcelain_lines(""), 0);
        assert_eq!(count_porcelain_lines("\n\n"), 0);
        assert_eq!(
            count_porcelain_lines(" M pages/A.md\n?? pages/B.md\n D journals/x.md\n"),
            3
        );
    }

    #[test]
    fn parses_ahead_behind_left_right() {
        // "behind<TAB>ahead": 2 upstream-only, 3 HEAD-only.
        assert_eq!(parse_ahead_behind("2\t3\n"), (3, 2));
        assert_eq!(parse_ahead_behind("0\t0"), (0, 0));
        // Malformed / empty → zeros, never a panic.
        assert_eq!(parse_ahead_behind(""), (0, 0));
        assert_eq!(parse_ahead_behind("garbage"), (0, 0));
    }

    #[test]
    fn push_error_is_friendly_and_actionable() {
        let reject = " ! [rejected]        main -> main (non-fast-forward)\nerror: failed to push";
        assert!(classify_push_error(reject).contains("Pull first"));
        assert!(classify_push_error("fatal: no configured push destination").contains("No remote"));
        assert!(
            classify_push_error("fatal: Authentication failed for 'x'").contains("authenticate")
        );
        // Unknown error falls back to its first line, never empty.
        assert!(!classify_push_error("fatal: something else entirely").is_empty());
    }

    #[test]
    fn pull_error_is_friendly() {
        assert!(classify_pull_error("fatal: Not possible to fast-forward, aborting.")
            .contains("diverged"));
        assert!(
            classify_pull_error("There is no tracking information for the current branch.")
                .contains("No remote")
        );
        assert!(!classify_pull_error("fatal: mystery").is_empty());
    }

    #[test]
    fn first_line_skips_blanks() {
        assert_eq!(first_line("\n\n  hello \nworld"), "hello");
        assert_eq!(first_line(""), "");
    }
}

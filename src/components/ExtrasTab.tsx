// FORK: the "mine (extras)" Settings tab — this fork's own, non-Logseq features
// live here in ONE dedicated tab, kept out of the original settings sections and
// out of Settings.tsx itself (which only imports and mounts it), so upstream's
// Settings edits merge without touching fork code. Add future fork toggles here.
import { Show, onMount, type JSX } from "solid-js";
import { backend } from "../backend";
import { bindingOwner, readOwned } from "../owned";
import type { GitStatus } from "../gitBackend";
import {
  threadingEnabled,
  setThreadingEnabled,
  threadColorMode,
  setThreadColorMode,
  threadWeight,
  setThreadWeight,
  threadAnimation,
  setThreadAnimation,
} from "../bulletThreading";
import {
  gitEnabled,
  setGitEnabled,
  gitPushMode,
  setGitPushMode,
  gitPullOnStart,
  setGitPullOnStart,
  gitStatus,
  reloadGitStatus,
  commitNow,
  pushNow,
  pullNow,
  forcePushNow,
  forcePullNow,
  initRepo,
  type PushMode,
} from "../git";
import { Field, Toggle } from "./settingsField";

export function ExtrasTab(): JSX.Element {
  return (
    <>
      <div class="settings-section">Extra features</div>
      <Field
        label="Bullet threading"
        hint="Trace a rounded thread down the active path — from the top level to the block you're editing — curving into each bullet. Helps you see where you are in a deep outline. A Tine touch, off by default."
      >
        <Toggle on={threadingEnabled()} onClick={() => setThreadingEnabled(!threadingEnabled())} />
      </Field>
      <Show when={threadingEnabled()}>
        <Field
          label="Thread colour"
          hint="Rainbow cycles a distinct colour per nesting depth; Accent draws the whole thread in the single accent colour."
        >
          <div class="settings-segment">
            <button
              classList={{ active: threadColorMode() === "rainbow" }}
              onClick={() => setThreadColorMode("rainbow")}
            >
              Rainbow
            </button>
            <button
              classList={{ active: threadColorMode() === "accent" }}
              onClick={() => setThreadColorMode("accent")}
            >
              Accent
            </button>
          </div>
        </Field>
        <Field label="Thread thickness" hint="How bold the thread line is.">
          <div class="settings-segment">
            <button
              classList={{ active: threadWeight() === "thin" }}
              onClick={() => setThreadWeight("thin")}
            >
              Thin
            </button>
            <button
              classList={{ active: threadWeight() === "medium" }}
              onClick={() => setThreadWeight("medium")}
            >
              Medium
            </button>
            <button
              classList={{ active: threadWeight() === "thick" }}
              onClick={() => setThreadWeight("thick")}
            >
              Thick
            </button>
          </div>
        </Field>
        <Field
          label="Animate thread"
          hint="None keeps the thread static. Flow turns it into dashes moving down the path and into the bullet (a conveyor). Beat is a slow pulse. Off by default; follows your system “reduce motion” setting."
        >
          <div class="settings-segment">
            <button
              classList={{ active: threadAnimation() === "none" }}
              onClick={() => setThreadAnimation("none")}
            >
              None
            </button>
            <button
              classList={{ active: threadAnimation() === "flow" }}
              onClick={() => setThreadAnimation("flow")}
            >
              Flow
            </button>
            <button
              classList={{ active: threadAnimation() === "beat" }}
              onClick={() => setThreadAnimation("beat")}
            >
              Beat
            </button>
          </div>
        </Field>
      </Show>
      <GitSection />
    </>
  );
}

/** One-line human summary of the repo state for the status hint. */
function gitStatusHint(s: GitStatus | null): string {
  if (!s || !s.is_repo) return "Not a git repository.";
  const bits: string[] = [`On ${s.branch || "(detached)"}`];
  bits.push(
    s.dirty_count === 0
      ? "clean"
      : `${s.dirty_count} uncommitted change${s.dirty_count === 1 ? "" : "s"}`,
  );
  if (s.has_upstream) {
    if (s.ahead) bits.push(`↑${s.ahead} to push`);
    if (s.behind) bits.push(`↓${s.behind} to pull`);
    if (!s.ahead && !s.behind) bits.push("in sync");
  } else {
    bits.push("no remote tracking");
  }
  let line = bits.join(" · ");
  if (s.last_commit) line += ` · last: ${s.last_commit}`;
  return line;
}

// Git integration (issue #33), in the "mine (extras)" tab so it stays out of the
// original settings. Off by default; when on, exposes push-timing, opt-in
// pull-on-start, manual sync buttons, and a live status line.
function GitSection(): JSX.Element {
  onMount(() => {
    if (gitEnabled()) void reloadGitStatus();
  });
  const modeBtn = (m: PushMode, label: string) => (
    <button classList={{ active: gitPushMode() === m }} onClick={() => setGitPushMode(m)}>
      {label}
    </button>
  );
  // Native GTK confirm — window.confirm silently returns true under WebKitGTK,
  // which would run the destructive op with no prompt (Settings' backup restore
  // does the same). The answer counts only for the graph it was asked about: a
  // graph switch while the dialog is open drops it.
  const forcePush = async () => {
    const s = gitStatus();
    const branch = s?.branch ? `“${s.branch}”` : "this branch";
    const confirmed = await readOwned(bindingOwner(), backend().confirm(
      `Force push ${branch} to the remote?\n\n` +
        `This overwrites the remote branch with your local one, permanently ` +
        `discarding any commits on the remote you don’t have. It can’t be undone.`,
      "Force push",
    ));
    if (confirmed.kind === "stale" || !confirmed.value) return;
    await forcePushNow();
  };
  const forcePull = async () => {
    const s = gitStatus();
    const branch = s?.branch ? `“${s.branch}”` : "this branch";
    const confirmed = await readOwned(bindingOwner(), backend().confirm(
      `Force pull ${branch} from the remote?\n\n` +
        `This discards every local commit and every uncommitted change to tracked ` +
        `files, resetting this graph to exactly match the remote. It can’t be undone.`,
      "Force pull",
    ));
    if (confirmed.kind === "stale" || !confirmed.value) return;
    await forcePullNow();
  };
  return (
    <>
      <div class="settings-section">Git</div>
      <Field
        label="Git integration"
        hint={
          <>
            Commit your graph as you edit and sync it to a remote — a local-first backup or
            multi-device workflow. Uses the <code>git</code> already installed on your machine and
            its existing credential setup; nothing is bundled and no passwords are stored. Off by
            default.
          </>
        }
      >
        <Toggle on={gitEnabled()} onClick={() => setGitEnabled(!gitEnabled())} />
      </Field>

      <Show when={gitEnabled()}>
        <Show
          when={gitStatus()?.is_repo}
          fallback={
            <Field
              label="Repository"
              hint="This graph folder isn’t a git repository yet. Initialize one to start committing — it adds a default Logseq .gitignore (skips backups, the recycle bin, version files, and trash)."
            >
              <button class="btn-secondary" onClick={() => void initRepo()}>
                Initialize git repo
              </button>
            </Field>
          }
        >
          <Field label="Status" hint={gitStatusHint(gitStatus())}>
            <button class="btn-secondary" onClick={() => void reloadGitStatus()}>
              Refresh
            </button>
          </Field>
          <Field
            label="Push"
            hint="Commits happen automatically when you pause editing and when you close Tine. Choose when those commits get pushed to the remote."
          >
            <div class="settings-segment">
              {modeBtn("on-close", "On close")}
              {modeBtn("on-idle", "On every save")}
              {modeBtn("manual", "Manual")}
            </div>
          </Field>
          <Field
            label="Pull on startup"
            hint="When Tine opens, pull the latest from the remote first (fast-forward only, so it never merges over local edits). Off by default."
          >
            <Toggle
              on={gitPullOnStart()}
              onClick={() => setGitPullOnStart(!gitPullOnStart())}
            />
          </Field>
          <Field label="Manual sync" hint="Commit, push, or pull right now.">
            <div class="git-actions">
              <button class="btn-secondary" onClick={() => void commitNow()}>
                Commit now
              </button>
              <button class="btn-secondary" onClick={() => void pushNow()}>
                Push
              </button>
              <button class="btn-secondary" onClick={() => void pullNow()}>
                Pull
              </button>
            </div>
          </Field>
          <Field
            label="Force sync"
            hint="Escape hatch for a diverged branch. Force push overwrites the remote with your local branch; force pull discards every local commit and uncommitted change to match the remote. Both are irreversible — each asks to confirm first."
          >
            <div class="git-actions">
              <button
                class="btn-secondary settings-btn-danger"
                onClick={() => void forcePush()}
              >
                Force push
              </button>
              <button
                class="btn-secondary settings-btn-danger"
                onClick={() => void forcePull()}
              >
                Force pull
              </button>
            </div>
          </Field>
        </Show>
      </Show>
    </>
  );
}


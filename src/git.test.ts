import { describe, it, expect } from "vitest";
import type { GitStatus } from "./backend";
import { composeCommitMessage, gitBadgeText, nextGitAction, gitBadgeTitle } from "./git";

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    is_repo: true,
    branch: "main",
    dirty_count: 0,
    has_upstream: true,
    ahead: 0,
    behind: 0,
    last_commit: "",
    ...overrides,
  };
}

describe("composeCommitMessage", () => {
  it("uses a generic message when nothing was saved", () => {
    expect(composeCommitMessage([])).toBe("Tine: update graph");
  });

  it("names a single page", () => {
    expect(composeCommitMessage(["Project Ideas"])).toBe("Tine: update Project Ideas");
  });

  it("lists up to three pages", () => {
    expect(composeCommitMessage(["A", "B", "C"])).toBe("Tine: update A, B, C");
  });

  it("collapses the tail beyond three into a count", () => {
    expect(composeCommitMessage(["A", "B", "C", "D", "E"])).toBe("Tine: update A, B, C +2 more");
  });

  it("ignores blank / whitespace-only names", () => {
    expect(composeCommitMessage(["", "  ", "Real"])).toBe("Tine: update Real");
  });
});

describe("gitBadgeText", () => {
  it("is empty for a non-repo", () => {
    expect(gitBadgeText(null)).toBe("");
    expect(gitBadgeText(status({ is_repo: false }))).toBe("");
  });

  it("shows just the branch when clean and in sync", () => {
    expect(gitBadgeText(status({ branch: "main" }))).toBe("main");
  });

  it("appends dirty / ahead / behind glyphs", () => {
    expect(gitBadgeText(status({ branch: "wip", dirty_count: 2, ahead: 1, behind: 3 }))).toBe(
      "wip ●2 ↑1 ↓3",
    );
  });
});

describe("nextGitAction", () => {
  it("prioritises pull, then commit, then push", () => {
    expect(nextGitAction(status({ behind: 1, dirty_count: 2, ahead: 3 }))).toBe("pull");
    expect(nextGitAction(status({ dirty_count: 2, ahead: 3 }))).toBe("commit");
    expect(nextGitAction(status({ ahead: 3 }))).toBe("push");
    expect(nextGitAction(status())).toBe("none");
    expect(nextGitAction(null)).toBe("none");
  });
});

describe("gitBadgeTitle", () => {
  it("spells out the state and the click action", () => {
    const t = gitBadgeTitle(status({ branch: "main", dirty_count: 2 }));
    expect(t).toContain("On main");
    expect(t).toContain("2 uncommitted");
    expect(t).toContain("click to commit");
  });

  it("notes when there is no remote", () => {
    expect(gitBadgeTitle(status({ has_upstream: false }))).toContain("no remote");
  });

  it("says up to date when clean and synced", () => {
    expect(gitBadgeTitle(status())).toContain("up to date");
  });
});

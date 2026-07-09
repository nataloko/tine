// "A newer Tine is available" check — a startup toast + an explicit About-tab check.
// Both are NOTIFICATION-ONLY in this fork: they compare the running build against the
// latest UPSTREAM Tine release and, if upstream is newer, just tell you — so you can
// go merge upstream into your own version (see mine.md). Neither installs anything;
// there is deliberately NO self-update code here, so a non-fork build can never be
// installed on top of yours. The About tab keeps a plain "Releases" link (opens the
// page in the browser — a link, not an install).
//
// Deliberately quiet: Tauri-only, silent on ANY failure (offline, rate-limited,
// blocked) — it must never block startup or nag with an error.

import { isTauri, backend } from "./backend";
import { pushToast } from "./ui";

const REPO = "martinkoutecky/tine";
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Parse the first `X.Y.Z` out of a version/tag string (`v0.3.0`, `0.3.0`, …). */
function parseVer(s: string): [number, number, number] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Is `a` a strictly newer semver triple than `b`? */
function isNewer(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** Open the GitHub releases page in the system browser (the About tab's link — a
 *  link, not an install). */
function openReleases(): void {
  void backend().openExternal(RELEASES_PAGE).catch(() => {});
}

/** Check GitHub for a newer published release; toast if there is one. Resolves
 *  silently (never throws) in every failure case. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    const cur = parseVer(await getVersion());
    if (!cur) return;

    // `/releases/latest` is the newest NON-prerelease, NON-draft release.
    const res = await fetch(LATEST_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const data: unknown = await res.json();
    const tag = (data as { tag_name?: unknown })?.tag_name;
    const latest = typeof tag === "string" ? parseVer(tag) : null;
    if (!latest || !isNewer(latest, cur)) return;

    // Notification only: no action button. This toast just tells you a newer
    // upstream Tine exists so you can go merge it into your fork (see mine.md).
    pushToast(
      `Tine ${latest.join(".")} is available — you're on ${cur.join(".")}.`,
      "info",
      { sticky: true }
    );
  } catch {
    // offline / rate-limited / network blocked — never bother the user.
  }
}

export type UpdateStatus =
  | { kind: "current"; version: string }
  | { kind: "available"; version: string; current: string }
  | { kind: "unavailable" }; // offline, rate-limited, or not the packaged app

/** The About tab's explicit "Check for updates" button. Unlike `checkForUpdate`
 *  (silent on the common no-update path), this reports every outcome so the button
 *  can show feedback. Report-only: it NEVER installs — a newer release just means
 *  "go merge upstream into your fork". Never throws. */
export async function checkForUpdateNow(): Promise<UpdateStatus> {
  if (!isTauri()) return { kind: "unavailable" };
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    const curStr = await getVersion();
    const cur = parseVer(curStr);
    if (!cur) return { kind: "unavailable" };

    const res = await fetch(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return { kind: "unavailable" };
    const data: unknown = await res.json();
    const tag = (data as { tag_name?: unknown })?.tag_name;
    const latest = typeof tag === "string" ? parseVer(tag) : null;
    if (!latest) return { kind: "unavailable" };

    if (isNewer(latest, cur)) {
      // Report only — never install. Merge upstream into your fork instead.
      return { kind: "available", version: latest.join("."), current: cur.join(".") };
    }
    return { kind: "current", version: cur.join(".") };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Open the GitHub releases page (exported for the About tab's manual link). */
export function openReleasesPage(): void {
  openReleases();
}

// FORK: the bullet-threading stroke, extracted from Block.tsx.
//
// Block.tsx sits within 5 lines of budget B1 (src/fileSizeRatchet.test.ts) as
// upstream ships it, so the fork's threading presentation lives beside it
// instead of inside it — the same seam upstream uses for sheetSlashAction and
// pointerDrag. readBlockModuleSource() globs this directory, so every guard
// that reads Block.tsx still sees this code.
//
// The feature: a rounded elbow thread traces the active path (the block being
// edited plus each ancestor), curving into every bullet on the way, coloured
// per depth. See src/bulletThreading.ts for the role computation and
// src/styles/app/50-mine.css for the stroke itself.
import { Show, type JSX } from "solid-js";
import { threadingEnabled, threadColorMode, threadRoles, THREAD_PALETTE } from "../../bulletThreading";

/** This block's role in the active-path thread, or undefined when threading is
 *  off. Reading `threadRoles()` only while enabled keeps the feature zero-cost. */
function threadRole(id: string) {
  return threadingEnabled() ? threadRoles().get(id) : undefined;
}

// Elbow geometry. GH #459 derives the bullet column from
// --ls-block-line-height/--ls-block-content-pad-y and centres the bullet on the
// first line, and typography presets retune the line-height token per
// .page-section — so the elbow follows the same tokens instead of fixed
// constants. Bullet centre y = pad + lh/2; the parent bullet sits one first-row
// higher plus the fixed 3px inter-block gap (at the default 26px/2px tokens:
// H-run at y=15, top at y=-18, matching the old measured path within 1px). Read
// off the block itself so a scoped preset override is honoured; each elbow
// re-measures on mount, which the active path does every time focus moves — a
// theme switch mid-thread corrects itself on the next edit interaction.
function threadElbowPath(host: Element): string {
  const cs = getComputedStyle(host);
  const lh = parseFloat(cs.getPropertyValue("--ls-block-line-height")) || 26;
  const pad = parseFloat(cs.getPropertyValue("--ls-block-content-pad-y")) || 2;
  const by = pad + lh / 2;
  const gap = by + 3;
  return `M -4 ${-gap} V ${by - 10} Q -4 ${by} 6 ${by} H 26`;
}

/** `.ls-block` classes for this block's thread role. Spread alongside upstream's
 *  `rowClassList`, whose plugin-thread-lines decoration is active only when a
 *  plugin declares it — so the two never both apply. */
export function threadClassList(id: string): Record<string, boolean> {
  const role = threadRole(id);
  return {
    "thread-elbow": role?.elbow !== undefined,
    "thread-spine": role?.spine !== undefined,
  };
}

/** The per-depth rainbow colour, handed to CSS as an inline `--thread-color`.
 *  Accent mode leaves it unset so the stroke falls back to `var(--accent)`. */
export function threadStyle(id: string): JSX.CSSProperties | undefined {
  const role = threadRole(id);
  if (!role || threadColorMode() === "accent") return undefined;
  return { "--thread-color": THREAD_PALETTE[(role.elbow ?? role.spine ?? 0) % THREAD_PALETTE.length] };
}

/** The stroke itself: an SVG child of the relative `.ls-block`, so it reflows and
 *  scrolls locked to the block. Elbow = a path curving into this bullet; spine =
 *  a straight line clipped to the block height. The elbow's `d` is re-derived
 *  from the bullet-column tokens on mount; the literal is the default geometry. */
export function BulletThread(props: { id: string }): JSX.Element {
  return (
    <Show when={threadingEnabled() && threadRole(props.id)}>
      <Show
        when={threadRole(props.id)?.elbow !== undefined}
        fallback={
          <svg class="thread-svg thread-spine-svg" aria-hidden="true">
            <line x1="8" y1="0" x2="8" y2="9999" />
          </svg>
        }
      >
        <svg
          class="thread-svg thread-elbow-svg"
          aria-hidden="true"
          ref={(el) =>
            queueMicrotask(() => {
              const host = el.closest(".ls-block");
              if (host) el.querySelector("path")?.setAttribute("d", threadElbowPath(host));
            })
          }
        >
          <path d="M -4 -18 V 5 Q -4 15 6 15 H 26" />
        </svg>
      </Show>
    </Show>
  );
}

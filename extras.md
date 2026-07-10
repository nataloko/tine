# Extra features

Everything this fork adds on top of upstream [Tine](https://github.com/martinkoutecky/tine).
On/off toggles live under **Settings → "mine (extras)"**. See **[mine.md](mine.md)** for how the
fork is built and released.

---

## Bullet threading

Traces a rounded "elbow" thread down the **active path** — the block you're editing and each of
its ancestors, from the top level down — curving into each bullet, coloured per depth (rainbow).
It helps you see where you are in a deep outline, like the Logseq bullet-threading plugin.

- **Enable:** Settings → **mine (extras)** → **Bullet threading**. **Off by default.**
- **Colour:** *Rainbow* (a distinct colour per nesting depth, the default) or *Accent* (the whole
  thread in your single accent colour).
- **Thickness:** *Thin* / *Medium* / *Thick* — the geometry re-centres itself on the bullet dots at
  any weight, so it stays pixel-aligned.
- **Animate** (opt-in): *None* (static), *Flow* (dashes moving down the path and into the bullet,
  like a conveyor), or *Beat* (a slow pulse). The thread is an SVG stroke, so the line lands exactly
  on the bullet and dashes can follow the rounded corner. Honours the system “reduce motion” setting.
- Pure CSS draws it on the blocks the editor marks as on-path, so it reflows with the outline and
  can never desync from the caret.
- The preferences are stored device-locally (they survive restarts even though WebKitGTK doesn't
  keep `localStorage` across launches).

---

## Formula query-filter

Refines a `{{query}}`'s results with a **readable boolean formula** instead of Logseq's awkward
Datalog escape hatch. The coarse query still picks *which* blocks (and still round-trips to
Logseq); the formula *narrows* them.

- **Use it:** in a query block's toolbar, click **ƒ filter** → the formula editor opens. Type an
  expression (or use the visual **Builder** — field ▸ operator ▸ value chips, no syntax) → **Save**.
  Results shrink; the count badge tracks the filtered set.
- **Fields:** `priority`, `state`, `scheduled`, `deadline`, `tags`, `page`, and any property name
  (e.g. `owner`, `rating`). **Operators:** `== != < <= > >=`, combined with `&&` / `||`, plus
  functions like `today()`, `isEmpty(…)`, `.contains(…)`.
- **Examples:**
  - `priority == "A"` — only A-priority results
  - `deadline < today()` — overdue
  - `rating >= 4 && owner == "Martin"` — combined
- **Stored as** a `tine.query-filter::` block property. **Logseq ignores it** — open the same graph
  in Logseq and the coarse query still runs, unfiltered, with no error (graceful degradation).
- **Fails open:** a broken or non-boolean expression keeps *all* results and shows an inline
  "Filter disabled" notice — it never silently empties your query.
- It reuses Tine's existing Sheets formula engine, so the same expressions work in sheet views.

Design record: `docs/adr/0038-query-formula-refinement.md`. (The old "⚙ advanced" Datalog switch is
retired but existing Datalog query blocks still render.)

---

## Git integration

Commit your graph as you edit and sync it to a remote — a local-first **backup** or
**multi-device** workflow, in the spirit of the `logseq-plugin-git` plugin but routed through Tine's
data-safety protocol so it can never clobber your notes. Answers upstream issue #33.

- **Enable:** Settings → **mine (extras)** → **Git integration**. **Off by default.**
- **Uses the `git` already on your machine** — nothing is bundled — and **your existing credentials**
  (credential helper / ssh-agent). No passwords are stored; an unauthenticated remote just fails with
  a clear message instead of hanging.
- **Commit** happens automatically when you pause editing (~60s idle) and when you close Tine, with a
  descriptive message naming the pages that changed. **Push timing is yours to choose:** *On close*
  (default), *On every save*, or *Manual*.
- **Pull** is opt-in: turn on **Pull on startup** to fetch before you edit, or use the manual **Pull**
  button. It's fast-forward-only, so it never merges over local edits — pulled files reload through
  the normal watcher and any conflict with an unsaved page is surfaced in the usual conflict UI.
- **Push never forces.** If the remote moved ahead, you get a sticky *"Remote moved — Pull first"*
  toast rather than a rejected-push error.
- **Not a repo yet?** The Git section offers **Initialize git repo**, which runs `git init` and writes
  a sensible Logseq `.gitignore` (skips backups, the recycle bin, version files, and trash).
- A compact **status badge** sits in the topbar (branch · uncommitted · ↑ahead ↓behind); clicking it
  does the most useful next step — pull, then commit, then push.

Design record: `docs/adr/0039-git-integration.md`. Commit only ever happens once your edits are
safely on disk; git touches only `.git/`, never your markdown, so it stays out of Tine's save path.

---

## Settings → "mine (extras)"

A dedicated Settings tab that collects this fork's toggles, kept out of the stock settings
sections. Any future fork feature adds its control here rather than scattering into the original
tabs.

---

## Fixes carried on top of upstream

Not features — bug fixes this fork ships ahead of upstream (candidates to upstream back). No
toggle; they just work.

### draw.io on Windows (GH #38)

Launching draw.io from a **default Windows install** now works out of the box:

- The external-editor command is **quote-aware**, so a path with spaces like
  `"C:\Program Files\draw.io\draw.io.exe" {}` is parsed as one program plus the file argument
  (it used to split on the space and fail).
- **Autodetect** also probes the per-machine install at `%ProgramFiles%\draw.io\draw.io.exe`
  (and the `(x86)` sibling), not just the per-user `%LOCALAPPDATA%` path — and returns it quoted.

This removes the need for the directory-junction / 8.3-short-path workarounds (the short-path route
broke draw.io's own Electron UI). Configure or re-detect under **Settings → Files → Diagram editors**.

### Git integration on Windows (GH #33)

Running git from the app no longer flashes a console window on Windows — the git subprocess is
launched with `CREATE_NO_WINDOW`, so status polls / commits / pushes are silent (they popped a
black terminal for a fraction of a second before).

### Code-block editing (GH #66 + friends)

Fenced code blocks (and the ```calc calculator) now edit sensibly:

- **Enter inside a fence adds a new line** instead of splitting the block into a new bullet (which
  used to break multi-line code — GH #66). Upstream shipped its own fix for this in **v0.5.2**; the
  fork now uses upstream's handler for the plain newline and layers the rest below on top of it.
- **Enter on a trailing blank line exits** to a new bullet below (the "double-Enter" idiom), so a
  code/calc block that's last in the page no longer traps the caret.
- A **language picker** on the opening fence: typing ```lang (or running `/code`) offers an
  autocomplete of ~95 languages, mirroring the `[[` / `#` popup; picking one drops the caret onto
  the code line. Tine loads the *full* highlight.js, so all of them actually colour (not just the
  common few).
- **Live syntax highlighting while editing** (Settings → mine (extras) → *Live code highlighting*,
  on by default): the code is coloured *as you type*, in a box that looks like the rendered block
  (no jump on blur). A syntax-highlighted layer is painted behind the real textarea (which stays the
  sole caret owner — the editor's focus/caret invariant is untouched); turn it off if the caret is
  ever hard to see on your system. Design record: `docs/adr/0040-live-code-highlighting-overlay.md`.

### Click below to add a block

Every page has a Logseq-style **click-to-add** area below its content — a discreet, invisible strip
(text cursor + tooltip on hover). Click the empty space under the last block to add a new bullet and
start typing (it focuses a trailing empty block instead of stacking blanks). A general escape hatch,
so a trailing code/calc block (or anything) never leaves you with nowhere to click.

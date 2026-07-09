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
- Pure CSS draws it on the blocks the editor marks as on-path, so it reflows with the outline and
  can never desync from the caret.
- The preference is stored device-locally (it survives restarts even though WebKitGTK doesn't keep
  `localStorage` across launches).

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

## Settings → "mine (extras)"

A dedicated Settings tab that collects this fork's toggles, kept out of the stock settings
sections. Any future fork feature adds its control here rather than scattering into the original
tabs.

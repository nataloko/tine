# Fork (`mine`) ADRs

Architecture decision records for the features this fork (`nataloko/tine`) carries on top of
upstream — kept on a **separate numbering track** (`0001`, `0002`, …) so upstream's own ADRs (which
grow sequentially and are unaware of ours) never collide with them on a sync. Same `template.md`
(Context → Decision → Consequences → Status) as the [main ADRs](../README.md).

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-query-formula-refinement.md) | Query filtering: coarse structural query (Rust, Logseq-parity) + optional `tine.query-filter::` formula refinement (frontend); Datalog retired-but-rendered | Accepted |
| [0002](0002-git-integration.md) | Optional Git integration via the system git (no bundling/credentials); commit only when disk is current, push never forces, pull is `--ff-only` and reloads through the watcher → conflict UI | Accepted |
| [0003](0003-live-code-highlighting-overlay.md) | Live code highlighting while editing via a passive highlighted `<pre>` overlay behind the unchanged textarea (preserves ADR 0013); WYSIWYG, opt-out toggle, full highlight.js | Accepted |

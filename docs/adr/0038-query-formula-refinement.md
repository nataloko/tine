# 0038. Query filtering: coarse structural query + optional formula refinement

- **Status:** Accepted
- **Date:** 2026-07-09

## Context

Tine inherited Logseq's two-tier query model: a simple S-expression
`{{query (and (task TODO) (priority A))}}` plus an "advanced" Datalog escape
hatch. The Datalog tier reads as awkward, and — decisively — it is a *façade*.
`run_advanced_query` (`crates/tine-core/src/query.rs`) does not run Datascript; it
parses a restricted single-line `[:find …]` shape and maps it back onto the *same*
limited predicate set (`Pred`) the simple queries use. Joins, rules, and
`:result-transform` are silently ignored. So the advanced tier costs legibility
without buying expressive power.

Meanwhile Tine already ships a complete, tested expression language: the Sheets
formula DSL (ADR 0028) — comparisons, date math, boolean logic, a ~20-function
stdlib — which *already* does boolean row filtering for sheet views
(`createFormulaFilterMemo`, stored as `tine.filter::`). Query result blocks arrive
as `BlockDto`s, which the formula field resolver (`readFormulaRowField`) already
handles. The expressive, readable filter the Datalog tier failed to provide is
therefore something Tine can offer by *reusing what it has*, not by inventing a
language.

The constraint that shapes the design is Logseq round-trip (ADR 0004): a query
block's `{{query …}}` text must still run in Logseq. Logseq's simple-query DSL has
no comparison operator and no formula clause — an unknown clause head there makes
the whole query return nothing, not degrade gracefully. So expressive refinement
cannot live *inside* the `{{query}}` text.

## Decision

We will layer query evaluation in two tiers with distinct homes:

1. **Coarse structural query** — the `{{query <DSL>}}` text, built by the visual
   builder, evaluated in Rust over the whole-graph cache. It answers "which
   blocks" and round-trips to Logseq unchanged.
2. **Optional formula refinement** — a `tine.query-filter::` block property holding
   one Sheets-formula boolean expression, evaluated on the frontend over the coarse
   query's returned blocks. Logseq ignores the property (graceful degradation),
   exactly mirroring how sheet views carry `tine.filter::`.

Order of operations is **Rust coarse filter → formula refine → client
sort/aggregate/group**, so counts and aggregates reflect the refined set.

The two filter keys are deliberately distinct so one query block can carry both: a
sheet-view `tine.filter::` (applies inside a table/board face) and a
`tine.query-filter::` (applies to the query's membership). They compose.

The builder's `⚙ advanced` button is repointed: it opens the Sheets **formula
editor** (whose existing visual builder already renders field ▸ operator ▸ value
comparison chips) targeting `tine.query-filter::`, instead of converting the query
to Datalog. Datalog is **retired but still rendered**: existing Datalog blocks
parse and display as before (and may also take a query-filter), and the
Datalog→simple back-conversion stays; Tine simply no longer *offers* the forward
conversion.

Reads stay on the one facet recognizer (`facetsOf` → `sheetConfig` →
`decodeFormulaExpr`, ADR 0009); writes stay on `setBlockProperty` → persistence
(ADR 0012). No second scanner, no bespoke writer.

**Fail-open** matches sheets: a parse error or non-boolean result keeps every block
and shows an inline "Filter disabled: …" notice.

**v1 boundary — refinement, not a whole-graph scan.** The formula runs on the
coarse query's returned blocks. A bare `deadline < today()` over an empty
`{{query}}` (i.e. the entire graph) is out of scope: it would pull the whole graph
to the frontend. A server-side formula evaluator is the deferred path.

**Deferred: a Rust comparison predicate.** We considered adding `(compare k > 3)`
to the coarse DSL so numeric/date comparisons run server-side. We deferred it: such
a clause has no Logseq equivalent, so it would *break* the round-trip for the very
blocks that use it (Logseq returns nothing for an unknown clause), and it would
duplicate coercion logic the formula engine already owns. The formula refinement is
the pressure-relief valve; the comparison predicate is a backlog item to revisit
only if real use shows the formula path is insufficient (see `docs/BACKLOG.md`).

## Consequences

Queries gain a readable, expressive filter without a new language and without
touching Logseq round-trip: the coarse query stays Logseq-clean, the refinement is
an inert `tine.*` property there. Users get no-syntax comparison chips for free via
the formula editor's existing builder.

Back-compat is total: blocks without `tine.query-filter::` behave exactly as
before, and existing Datalog blocks still render. The membership-versus-presentation
boundary of ADR 0030 is preserved — `tine.query-filter::` refines *membership*
(what the query returns), distinct from `tine.view::` presentation and from a sheet
face's own `tine.filter::`.

Costs we accept: expressive filtering is Tine-only (a graph leaning on
`tine.query-filter::` shows unrefined results in Logseq); the v1 refinement can only
narrow a coarse result set, not scan the whole graph; and the retired Datalog
forward-conversion means its stash path is now dead code kept only for the
still-supported back-conversion. If the deferred comparison predicate or a
server-side formula evaluator later lands, each must respect these same seams
(one facet read, one writer, Logseq-inert refinement).

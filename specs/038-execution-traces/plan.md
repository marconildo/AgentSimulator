# Plan: Execution Traces (hierarchical span tree)

> The HOW for `spec.md` (status: planned). Supersedes 015. Respects the
> constitution: pure projection (§7), single source of truth for the visual
> model untouched (no new `Stage`), bilingual (§4).

## Approach

A 2-level span tree is the flat 015 waterfall **promoted one level**: each
contiguous phase occurrence (what `waterfallSegments` already finds) becomes a
**parent node span**, and the END events inside it become **child rows**. So we
keep 015's honest timing model (wall-clock footprint per occurrence; the
`backend`/`frontend` envelope excluded; the run span as the total) and add:

1. **Children.** Per occurrence, derive child rows by node kind:
   - `reason` (→ node **think**) and `generate` → a single child `ChatOpenAI`
     (model from the `agent.think` END `data.model` when present; duration from
     the inner `llm.prompt` / the `llm.generate` span).
   - `tools` → one child per `mcp.call` END, labeled by its `data.tool`.
   - `retrieve` → one child per `rag.*` END (`embed` / `search` / `select`).
   - `route`, `respond`, `memory`, `persist` → no children (leaf).
2. **Tokens + cost.** Sum `metrics.{total_tokens, cost_usd}` over the occurrence's
   END events (only `agent.think` / `llm.generate` carry them today). The root
   totals are the sums across spans; total duration is the run wall-clock span.
3. **Bar geometry.** Each span keeps `offsetMs`/`durationMs`; the component draws
   `width = durationMs / totalMs`, `left = offsetMs / totalMs` (proportional bar).

The node label is LangGraph-faithful (`route`/`think`/`tools`/`generate`/
`respond`/`retrieve`/`memory`/`persist`) — a new bilingual `nodes` label map, so
`think` reads "think" (not the 015 phase label "Reason"). Mapping `TimelinePhase
→ node label` is a small static table (reuse `STAGE_TO_PHASE` for grouping; only
the display name differs).

**Alternative considered:** a brand-new node-grouping independent of
`STAGE_TO_PHASE`. Rejected — `STAGE_TO_PHASE` is already the exhaustive,
test-pinned `Stage → node` grouping; reusing it means a new `Stage` can never
silently fall out of the tree.

## Affected files

**Backend**
- none (pure projection).

**Frontend**
- `frontend/src/lib/executionTree.ts` — **new.** `TraceSpan`/`SpanChild` types +
  `executionTree(events)` pure projection (parents = occurrences, children by
  node kind, token/cost aggregation, root totals).
- `frontend/src/lib/executionTree.test.ts` — **new.** Vitest for AC1–AC4 (+ bar
  geometry for AC5's testable core).
- `frontend/src/components/ExecutionTraces.tsx` — **new.** The tree (rows: indent,
  label, model suffix, duration, tokens, proportional bar; expand/collapse
  children; empty state). **Placement iteration (2026-05-27):** exported as
  `ExecutionTracesDetail` — rendered **inside the Inspector body** like a station
  detail, with a `← Overview` back button at the top and the run totals as chips
  in the header (an earlier draft mounted a full-width overlay over `<main>`,
  rejected by the user as out-of-place).
- `frontend/src/components/InspectorPanel.tsx` — `Overview` lists an "Execution
  traces" **row** (station-button styling + run-total teaser) that calls
  `openTraces`; `if (tracesOpen) return <ExecutionTracesDetail/>` short-circuits
  the body before the `selected` station detail. The inline panel was removed.
- `frontend/src/store/useSimulator.ts` — `tracesOpen` boolean + `openTraces`
  (clears `selected`) and `closeTraces`; `select` clears `tracesOpen` so the two
  body views are mutually exclusive. Kept off `StationId`; reset on clear.
- `frontend/src/i18n/strings.ts` — rename `timeline.timing` → `timeline.execTrace`
  with the new shape (`title`, `root`, `empty`, `nodes` map, child chrome) in
  **en + pt**; update the `UI` type.
- **Remove (superseded by 038):** `frontend/src/components/TimingPanel.tsx`,
  `frontend/src/lib/waterfall.ts`, `frontend/src/lib/waterfall.test.ts`. Confirmed
  the only code consumers are `TimingPanel`/`InspectorPanel`; the `learn/content.ts`
  mention of "waterfall" is prose, not an import.
- `specs/015-latency-waterfall/spec.md` — mark **superseded by 038**.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` change; `schemas.py` ↔ `events.ts` untouched.

## Data model changes

None (no Chroma / SQLite change).

## i18n strings (constitution §4)

`timeline.execTrace` (replaces `timeline.timing`):

| key | en | pt |
|---|---|---|
| `title` | `Execution traces` | `Traces de execução` |
| `subtitle` | `Hierarchical span tree of the run …` | `Árvore hierárquica de spans do run …` |
| `empty` | `Run a turn to see the execution trace.` | `Rode um turno para ver o trace de execução.` |

(The back button reuses `inspector.overviewBack`, matching the station detail.)
| `nodes.route` | `route` | `route` |
| `nodes.think` | `think` | `think` |
| `nodes.tools` | `tools` | `tools` |
| `nodes.generate` | `generate` | `generate` |
| `nodes.respond` | `respond` | `respond` |
| `nodes.retrieve` | `retrieve` | `retrieve` |
| `nodes.memory` | `memory` | `memory` |
| `nodes.persist` | `persist` | `persist` |
| `child.embed` | `embed` | `embed` |
| `child.search` | `search` | `search` |
| `child.select` | `select` | `select` |

`ChatOpenAI` and concrete tool names (`calculator`, `current_time`, `kb_lookup`,
`load_skill`) are proper nouns — rendered verbatim, not in the table.

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | linear log → ordered parent spans (route/think/generate/respond), envelope excluded, offset of first ≈ 0 | `lib/executionTree.test.ts` |
| AC2 | ReAct log → `think`×2 and `tools`×2 as separate spans, order preserved | `lib/executionTree.test.ts` |
| AC3 | think/generate → one `ChatOpenAI` child (model when present); tools → one child per `mcp.call` named by tool; route/respond leaf | `lib/executionTree.test.ts` |
| AC4 | durations = wall-clock footprint; think/generate spans carry tokens+cost; root totals = sums + wall-clock span | `lib/executionTree.test.ts` |
| AC5 | bar geometry: each span's `width=duration/total`, `left=offset/total` ∈ [0,1]; Σ child ≤ parent (testable core of the visual) | `lib/executionTree.test.ts` |
| AC6 | `timeline.execTrace` keys (incl. `nodes.*`, `child.*`) exist in **both** en and pt | `lib/strings.execTrace.test.ts` (or fold into an existing i18n parity test) |

Component mount (the panel renders in the Overview) is covered by `tsc --noEmit`
+ `npm run build`; the frontend has no component-render test layer, so AC5's
machine-checkable core is the bar geometry from the pure function.

## Risks / trade-offs

- **Removing 015's files** drops `waterfall.test.ts`; the new `executionTree.test.ts`
  re-covers the timing model it pinned (envelope exclusion, per-occurrence
  grouping, wall-clock total) plus the new tree behavior. Net test coverage of the
  timing model is preserved, not lost.
- **Model name in the `ChatOpenAI` tag** is read from `agent.think` END `data.model`
  and may be absent on `generate`-only or older traces — the tag degrades to bare
  `ChatOpenAI` (no crash).
- **Single-instance / pure projection** unchanged: the tree reads only the store's
  `events` (live and replay share the path, exactly like 015/030).

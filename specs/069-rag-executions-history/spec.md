# Spec: RAG executions history (navigate every retrieval of the turn)

| | |
|---|---|
| **ID** | 069-rag-executions-history |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

Like the LLM (068), the **Vector DB / RAG** can be invoked **more than once in a single
turn**: each `search_knowledge_base` tool call the agent elects runs a full retrieval
cycle (embed → search → [rerank] → retrieve). A turn that searches the knowledge base
twice (e.g. one query for *"definition of RAG"* and another for *"how retrieval works"*)
produces **two** retrieval cycles with different queries, candidate pools and top chunks.

But the "Open RAG pipeline" drill-in (`RagPipelinePanel`) derives its data with
`lastEnd(stage)`, so it only ever shows the **last** retrieval — the first search's
embedding, candidates and retrieved chunks are invisible. The Agent drill-in already
proves both searches happened (two `search_knowledge_base` calls, each "→ 4 chunks"), so
the RAG panel under-reports what really ran.

## Goals

- Let the learner **navigate between every RAG retrieval cycle** of the turn in the RAG
  pipeline drill-in, not just see the last one.
- Each execution shows its own query, embedding, candidate pool, reranking and retrieved
  chunks — the existing five-stage pipeline view, scoped to that cycle.
- Stay a **pure projection** of existing trace events (no new request, no protocol
  change); live streaming and step/replay identical.
- Preserve today's behavior exactly when the turn retrieves **0 or 1** time.

## Non-goals

- No backend change, no new `Stage`/`Phase`/`TraceEvent`, no new metrics.
- Not changing the per-stage cards / illustrations themselves — only adding an execution
  selector around them.
- Not adding execution navigation to the Inspector's compact `rag` readout or the RAGLESS
  (PageIndex) panel (RAGLESS is a single reasoning path; out of scope here).
- Not re-scoping the "Augmented" stage per-execution (there is one final assembled prompt;
  it stays the turn-level context).

## User-facing behavior

- When the turn ran **one** retrieval, the RAG pipeline panel looks **exactly as today**
  (no selector).
- When it ran **N ≥ 2** retrievals, the panel gains a compact **execution navigator** in
  its header: a `‹ k / N ›` stepper labelled with that execution's query (truncated),
  letting the user step between cycles. Switching execution re-renders the five stage
  cards + the drilled-in detail for that cycle's real data.
- The navigator defaults to the **latest** execution (so a live run shows the cycle that
  just fired); stepping is bounded (no wrap past 1 or N).
- All new chrome ships in **English and Portuguese**.

## Acceptance criteria

1. **AC1** — Given a trace with two `search_knowledge_base` cycles (two `rag.embed` /
   `rag.search` / `rag.retrieve` END sets), when executions are derived, then the helper
   returns **2** `RagPipeline`s in order, each carrying **its own** query and retrieved
   chunks (execution 1 ≠ execution 2).
2. **AC2** — Given a trace with exactly **one** retrieval cycle, the helper returns a
   single-element list equal to today's `deriveRagPipeline` result (byte-for-byte
   behavior); given **zero** retrieval cycles, it returns an **empty** list.
3. **AC3** — A **partial** log (second cycle's embedding has started but its retrieve has
   not) still surfaces the second execution (embedding active, retrieval pending), so the
   navigator count tracks the cursor.
4. **AC4** — The RAG panel renders the execution navigator **only when N ≥ 2**; with N ≤ 1
   no navigator is shown. The navigator reports `k / N` and is bounded at both ends.
5. **AC5** — Selecting execution k renders that cycle's stages (e.g. its retrieval `top`
   source/score and candidate count match cycle k, not the last cycle).
6. **AC6** — Every user-facing string introduced exists in both `en` and `pt`
   (constitution §4).

## Protocol / stage impact

- New/changed `Stage`(s): **none** (pure frontend projection over existing `rag.embed` /
  `rag.search` / `rag.rerank` / `rag.retrieve` / `llm.prompt` events).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: existing `rag` (Vector DB) station — no new station.

## Open questions (clarify before planning)

- [x] Navigator style? → a compact `‹ k / N ›` stepper with the query label in the panel
      header (matches the small anchored panel; no full redesign).

## Out of scope / deferred

- A combined "all executions at a glance" timeline (could be a later enrichment).
- Per-execution augmented context (kept turn-level — one final prompt).

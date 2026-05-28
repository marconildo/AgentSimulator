# Spec: Memory growth — the honest occupation of the context window across turns

| | |
|---|---|
| **ID** | 039-memory-growth-visualization |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> The HOW is in `plan.md`. This spec turns the Agent's Long-term-Memory panel into
> a **turn-by-turn growth view** of what the model actually re-reads from prior
> conversation, so the learner sees that *only the visible text* survives between
> turns — not the compute.

## Problem / motivation

[[spec-036-context-window-budget]] made the headline `used / max` real and the
per-category split honest, but a learner who looked at the panel and asked *"if
turn 1 cost 1000 tokens of compute, how much of those carry into turn 2?"* still
had to read the source code to find out. The current panel shows:

- one `Memory (long-term)` slice (e.g. `20 tokens`) on the budget grid;
- a flat list of `{message, answer}` pairs in the Long-term-Memory panel, with
  no token weight, no ordering by turn, no indication of how the slice grew, and
  no signal of what would fall out of the `limit=5` window next.

So the **actual lesson** of this app's long-term-memory design — *the agent's
memory is only the visible chat text; reasoning, tool calls and observations are
discarded between turns* — is hidden. It is the single most common
misunderstanding learners have about agent context windows
([[token-totals-four-way-parity]] discussion: "if turn 1 cost 1000 tokens, do
1000 carry into turn 2?"). Making it visible costs a small additive event field
and one new panel.

## Goals

- Show, **inside the existing Long-term-Memory panel**, a per-turn list with each
  prior turn's **real token weight** (using the same tokenizer as the Memory
  budget category, so the numbers reconcile).
- Show the **total currently in the window** today (Σ of per-turn weights), and
  flag which turn is **next to fall out** of the `limit=5` window so the learner
  sees the truncation policy as a real thing.
- Make the lesson **explicit in copy**: only `{user message, assistant final
  answer}` survive; reasoning, tool calls and observations don't. Bilingual.
- Backend computes per-pair token counts (one source of truth; mirrors §3 and
  §6); FE renders a pure projection — no new tokenizer path on the FE.
- Degrade gracefully: a trace without the new field still renders the existing
  flat history list (no crash, no regression).

## Non-goals

- **No new `Stage`, station, hop or tier.** This is an *additive enrichment* of
  the existing `db.read` END `data` + a richer render of the existing
  Long-term-Memory panel.
- No change to **what** the agent remembers (still `{message, answer}` pairs
  from `read_history`); we only visualize what is already loaded.
- No history search/edit; no per-turn "clear" controls; no compaction simulation.
- No turn-over-turn diff of the budget categories (that lives in 020).

## User-facing behavior

In the **Agent → full view**, the **Long-term-Memory panel** gains a *Memory
growth* section below the existing flat history list:

```
LONG-TERM MEMORY            survives across requests

CONVERSATION HISTORY · APP DB
  🧑 Ola
  🤖 Olá! Como posso ajudar você hoje?

  🧑 Quanto é 30+5? Explique para um leigo …
  🤖 Vamos imaginar que você tem 30 maças …

MEMORY GROWTH               across this conversation
  T1  ▍ 20
  T2  ████████████████████████ 598
  T3  (this turn — not yet stored)

  Total currently in window:  618 tokens
  Next to fall out (limit 5): T1

  ℓ Only your message + the assistant's final answer carries
    forward; reasoning, tool calls and observations don't.
```

- One row per **stored** prior turn, oldest to newest, with a horizontal weight
  bar proportional to its token count.
- A **total** line summing the in-window weights and a **next-to-fall-out** line
  when there are exactly `limit` turns loaded (or more would fit, but only
  `limit` are loaded).
- A **one-line bilingual explanation** of what survives between turns (kills the
  "compute carries forward" misconception in one sentence).

The current turn ("this turn") is shown as a placeholder row with no weight
because it is not yet `db.write`-ten when the panel renders mid-turn.

## Acceptance criteria

> Token counting is local (`tiktoken`) so all backend tests are **keyless**.

1. **AC1 — Per-pair token count (keyless).** A helper returns one token count per
   `{message, answer}` pair, using the same `tiktoken` encoding as
   `context_budget`'s `memory` slice; an empty list returns `[]`; the count of a
   pair with empty strings is the count of just the framing prefix (not 0 — the
   framing is real).
2. **AC2 — Sum reconciles with the Memory budget slice (keyless).** For a list of
   N pairs, `sum(per_pair_tokens) ≈ context_budget(history=pairs).memory` within
   ±2 tokens (tiktoken BPE may merge across `\n` joins on the boundary; the
   approximation is documented).
3. **AC3 — Emitted on the trace (additive protocol).** `db.read` END `data`
   carries `recent_tokens: list[int]` aligned with the existing `recent` array
   (same order, same length). **No new `Stage`**; `STAGE_TO_STATION` and
   `STAGE_TO_PHASE` are unchanged and still total over `Stage`.
4. **AC4 — Cursor-aware projection (FE, keyless).** A pure function reads
   `recent` + `recent_tokens` from the latest `db.read` END ≤ cursor and returns
   `{ rows: [{turn, message, answer, tokens}], totalTokens, nextToFallOut|null,
   limit }`. Before any `db.read` it returns an empty view (no crash).
5. **AC5 — Render order & cumulative bar widths (FE).** Rows render oldest →
   newest with bar widths proportional to **`Σ tokens[0..i] / totalTokens`**
   (cumulative share of the in-window total). Consequence: bar widths are
   monotonically non-decreasing and the last row always reaches the full bar;
   the visual reads as a **staircase** of the window filling up turn by turn.
   The per-row label shows `cumulative / total` (e.g. `419 / 470`); the per-turn
   token weight survives as the row's hover tooltip so the original "this turn
   cost X" reading is one mouse-over away.
   **Amended 2026-05-28** — the first cut normalized to the *largest* turn
   (`tokens[i] / max(tokens)`), which made a single long answer dominate the
   bars and hid the staircase intuition users were arriving at the panel with.
   The cumulative form keeps every datum the original carried (per-row tokens
   are still in the row data and in the tooltip) while making the "the window
   fills up turn by turn" lesson the headline visual.
6. **AC6 — Limit-5 fall-out signal (FE).** When `recent.length === limit`, the
   oldest row is flagged as *next to fall out*; with fewer rows, no flag is
   shown. `limit` is read from the same `db.read` data (no FE constant).
7. **AC7 — Graceful fallback (FE).** A trace whose `db.read` lacks
   `recent_tokens` still renders the existing flat history list **without** the
   new growth section — no crash, no zero-bars.
8. **AC8 — Bilingual (§4).** Every new string ("Memory growth", "Total currently
   in window", "Next to fall out (limit N)", the one-line lesson, the "this turn
   — not yet stored" placeholder) has non-empty en **and** pt.
9. **AC9 — TypeScript clean.** `tsc --noEmit` is green; the new helper has a
   typed return; the `db.read` data is read via an optional cast (preserves the
   open-map contract).

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **additive** key on the existing `db.read` END `data`
  — `recent_tokens: int[]` (same length and order as `recent`). Documented in
  `schemas.py`'s `TraceEvent` comment block.
- Mirror in `frontend/src/types/events.ts`: optional cast in the new helper (no
  required type change; the data map is open).
- Station it maps to in `stations.ts`: unchanged — `db.read` already → `database`
  station. No `STAGE_TO_STATION` / `STAGE_TO_PHASE` change; both stay total.
- `readoutFor` / `renderDetail`: unchanged. The richer render lives in
  `AgentDetail`'s existing Long-term-Memory panel.

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Backend or frontend tokenization?** → **Backend**, reusing
  `context.py`'s tiktoken encoder so the Memory growth rows and the Memory
  budget slice come from the same numbers (§6). The FE already has
  `js-tiktoken` for the pre-send hint, but its `o200k_base` would drift from
  the backend's `cl100k_base` and break reconciliation with the budget panel.
- [x] **Include the current (in-progress) turn in the growth view?** → As a
  **placeholder row** with no weight ("this turn — not yet stored"). Real
  weight is computed on the next turn's `db.read`. Avoids estimating a
  not-yet-persisted answer mid-stream.
- [x] **Show all turns ever, or only those in the `limit=5` window?** → Only
  what the model actually re-reads (the window), because the lesson is *what
  occupies the model's window*, not the full transcript. The flat history list
  above is already only the window's pairs.
- [x] **What about turns where the answer is empty (e.g. abstain)?** → Still
  counted with the framing prefix; AC1 covers this so the count is honest, not
  zero.

## Out of scope / deferred

- A turn-over-turn delta of the *budget categories* (already 020).
- A per-turn compute cost (the LLM card already shows turn-total cost; 018
  shows conversation-total).
- A visualization of *which* turns in the window the model actually attends to
  (attention patterns) — out of scope and would require a different mental
  model than this app teaches.
- An admin control to change the `limit=5` ceiling at runtime (defer to a
  Settings spec).

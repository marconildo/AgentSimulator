# Spec: Abstain / empty-result badge

| | |
|---|---|
| **ID** | 021-abstain-badge |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

When `kb_lookup` returns "No glossary entry found for 'retrieval'", a well-behaved agent
**abstains** on that sub-query instead of inventing an answer — and in the observed run
it correctly dissolved that into "…while I don't have a specific glossary entry for
'retrieval'…". That's a **good practice**, but it's invisible. Surfacing it with a badge
("⚠️ Tool returned empty — agent abstained on this sub-query") teaches the anti-pattern
of **hallucination-by-filling** and rewards honest abstention.

## Goals

- Detect a tool result that is **empty / not-found** and badge it in the Agent anatomy,
  tied to the specific tool call, so the learner sees the abstain behavior.

## Non-goals

- No new `Stage`; detection reads existing `mcp.call` result data.
- Not judging whether the *final answer* actually abstained (no NLP on the answer here).

## User-facing behavior

- In the Agent anatomy's tool-calls list, a tool call whose result is empty/not-found
  carries an **abstain badge**; normal results carry none.
- Badge text bilingual (en + pt).

## Acceptance criteria

1. **AC1** — A pure predicate classifies a tool result as **empty/not-found** by a
   defined rule (see Open questions); it is true for the "No … found" / empty case and
   false for a substantive result.
2. **AC2** — A tool call classified empty renders the **abstain badge** bound to that
   call in the Agent anatomy; a non-empty call renders **no badge**.
3. **AC3** — The badge text exists in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Tools gain a structured **`found`** signal carried on the `mcp.call` event `data`
  (`data` is an open record → **no schema *type* change, no new Stage**). The
  `@mcp.tool()` registration **and** the `_load_local()` fallback mirror in `client.py`
  are updated together (both, per CLAUDE.md); an optional TS shape in `events.ts` lets
  the inspector read `found` safely.
- Station it maps to in `stations.ts`: **n/a** (Agent anatomy / `mcp` data)

## Clarified (2026-05-27)

- [x] **Detection rule** → **structured signal.** Tools return a `found` flag (false /
  empty content for a not-found result); the predicate detects on that — robust, not a
  brittle string match. Touches the tool contract + the in-process fallback (accepted).
  Complements 017's `error`-on-`data` convention.
- [x] **Scope** → **any tool.** A general predicate over the structured signal — any tool
  reporting `found: false`/empty is badged; `calculator`/`current_time` default to found.

## Out of scope / deferred

- Detecting abstention in the *generated answer* text.
- Counting/aggregating abstentions into the HUD (could extend 018 later).

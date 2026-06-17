# Spec: DeepAgents steps in the execution trace

| | |
|---|---|
| **ID** | 062-deepagents-execution-spans |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

On the Intermediate rung the agent runs the DeepAgents runtime (057): it writes an
explicit **plan** (`write_todos`), reads/writes a **virtual file system**
(`write_file` / `read_file` / `edit_file` / `ls`), and **delegates** to a sub-agent
(`task`). Each of those is already a real trace `Stage` (`agent.plan`,
`agent.fs.write`, `agent.fs.read`, `agent.delegate`) that maps to the `agent`
station, so the canvas animates them.

But the **Execution traces** drill-in (038) — the LangSmith-style span tree — never
surfaces them. Its projection folds every `Stage` through
`STAGE_TO_PHASE → PHASE_TO_NODE`, and all four DeepAgents stages map to the `reason`
phase, which maps to the `think` node. So a DeepAgents run that genuinely planned and
delegated shows only `memory / route / tools / think / generate / respond / persist` —
the plan/file/delegate work is silently absorbed into `think` and disappears. The
learner cannot see the steps that *define* a DeepAgent.

## Goals

- Make the DeepAgents steps visible as their own rows in the Execution traces tree,
  in execution order, alongside `think` / `tools`.
- Show enough context per row to teach what happened: the plan's todo count, the
  edited/read file path, and the sub-agent type + the tools it used.
- Keep the Simple rung byte-for-byte (it never emits these stages, so its trace is
  unchanged).

## Non-goals

- No new `Stage`, no protocol change, no backend change. The events already exist.
- No change to the timeline phase rail (004): DeepAgents stages stay in the `reason`
  phase there — that grouping is correct for the rail and out of scope here.
- No per-sub-step timing for the sub-agent's internal calls beyond what the existing
  events carry.

## User-facing behavior

In the **Execution traces** drill-in, a DeepAgents run shows new top-level rows:

- **plan** — when the agent calls `write_todos`. A leaf row; its detail reads
  `N todos` (en) / `N tarefas` (pt). A second `write_todos` later in the run (a plan
  *update*) is a second `plan` row, in order.
- **file write** / **file read** — when the agent calls `write_file` / `edit_file` /
  `read_file` / `ls`. Leaf rows; the detail is the file path (a proper noun, not
  translated).
- **delegate** — when the agent calls `task`. An expandable row; its detail is the
  sub-agent type (`researcher`, not translated), and its children are the tools the
  sub-agent used (the `steps` trail), so the nested research is shown as the
  sub-agent's own collapsible work (context quarantine) rather than as phantom
  top-level `retrieve` / `tools` rows.

The row labels (`plan`, `delegate`, `file write`, `file read`) stay English in both
languages, consistent with the existing node labels (`route`, `think`, `tools`, …).

## Acceptance criteria

1. **AC1** — Given a run whose log contains an `agent.plan` occurrence, when the tree
   is built, then there is a top-level span with node `plan` at that point in run
   order (not folded into a `think` span), carrying the todo count.
2. **AC2** — Given a run with `agent.fs.write` and `agent.fs.read` occurrences, when
   the tree is built, then there are `fs-write` and `fs-read` top-level spans whose
   `detail` is the file path.
3. **AC3** — Given a run with an `agent.delegate` occurrence that wraps nested
   retrieval/tool events, when the tree is built, then there is exactly one
   `delegate` top-level span (the nested events do not create extra top-level spans),
   its `detail` is the sub-agent type, and its children are the sub-agent's tool
   steps.
4. **AC4** — Given two separate `agent.plan` occurrences in one run, when the tree is
   built, then there are two `plan` spans in order (write plan, then update plan).
5. **AC5** — Given a Simple-rung run (no DeepAgents stages), when the tree is built,
   then the span set is byte-for-byte what it was before this change (no `plan` /
   `delegate` / `fs-*` nodes appear).
6. **AC6** — The `timeline.execTrace.nodes` map has labels for `plan`, `delegate`,
   `fs-write`, `fs-read` in both `en` and `pt`, and the plan-detail word
   (`todos` / `tarefas`) exists in both.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (uses existing `agent.plan`, `agent.fs.write`,
  `agent.fs.read`, `agent.delegate`).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (already the `agent` station; this is a
  change to the 038 execution-tree projection only).

## Open questions (clarify before planning)

- [x] Own parent rows vs. nested children vs. children-of-think? → **own parent rows**
  (user choice, 2026-06-17).

## Out of scope / deferred

- Per-step timing inside a delegated sub-agent.
- Surfacing DeepAgents steps in the timeline phase rail.

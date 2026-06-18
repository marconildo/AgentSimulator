# Spec: DeepAgents step trail in the Agent drill-in

| | |
|---|---|
| **ID** | 067-deepagents-step-trail |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

In the Agent Context Window drill-in (`AgentDetail`), the "Plan" panel (shown only
when the DeepAgents runtime ran) renders **only the final todo list** from the *last*
`agent.plan` event. When the lead agent calls `write_todos` more than once and the final
call replaces the list with a single `in_progress` item, the panel shows just one row
floating above a tall empty space — it reads as "cut off / something missing" (see the
user's screenshots). It hides everything DeepAgents actually did this run: the earlier
plan revisions, the virtual-file writes/reads, and the sub-agent delegation.

The drill-in's whole purpose is to make the DeepAgents runtime legible. Showing only the
last plan snapshot defeats that — the steps that *define* a DeepAgent (plan → files →
delegation) are invisible here, even though the Execution Traces tree already surfaces
them (062).

## Goals

- When (and only when) the DeepAgents runtime ran, the Plan panel shows **every**
  DeepAgents step in chronological run order — plan updates, file writes, file reads,
  and sub-agent delegations — not just the final todo snapshot.
- Each step is self-describing: a plan step shows its todo snapshot with per-item status;
  a file step shows the path; a delegation shows the sub-agent, sub-task and result.
- The Simple rung (no DeepAgents preamble) is unchanged — the panel stays hidden.

## Non-goals

- No backend change. No new `Stage`, `Phase`, or `TraceEvent` field — this is a pure
  re-projection of events already emitted by the DeepAgents runtime.
- Not changing the Execution Traces tree (062) — that projection stays as-is.
- Not changing the Virtual File System sub-section (final file *contents* still render
  below the step trail).

## User-facing behavior

In the Agent Context Window drill-in, on a DeepAgents run, the "Plan" panel becomes a
**chronological step trail**. Each row is one DeepAgents action, in the order it happened:

- **Plan** — a ◐ marker + "{n} todos", with the todo snapshot (each item's status icon +
  text, completed items struck through) listed beneath that step.
- **Wrote file** / **Read file** — a 📄 marker + the file path.
- **Delegated** — a 🤝 marker + the sub-agent name, its sub-task, the returned result, and
  its tool trail.

The Virtual File System sub-section (final files + contents) stays below the trail. All new
prose ships in `en` + `pt` (constitution §4).

## Acceptance criteria

1. **AC1** — Given a DeepAgents run with events in the order `plan → fs.write → delegate →
   fs.write → fs.read`, `deriveDeepAgentsSteps(events)` returns those five steps **in that
   order**, each tagged with the right `kind` (`plan` / `fs-write` / `delegate` /
   `fs-write` / `fs-read`).
2. **AC2** (amended) — The plan is **one evolving artifact**: repeated `write_todos` calls
   collapse into a **single** `plan` step (at the first plan's position) that updates in
   place to the **latest** todo snapshot — not one near-identical block per revision. (The
   original "one block per revision" read as duplicated plans; file/delegate steps still
   each render in order, since those are distinct actions.)
3. **AC3** — A `fs-write` / `fs-read` step carries its file `path`; a `delegate` step carries
   `subagent`, `subtask`, `result`, and the sub-agent's tool `steps`.
4. **AC4** — On a Simple-rung run (no DeepAgents stages), `deriveDeepAgentsSteps` returns `[]`
   and the Plan panel does not render (unchanged behavior).
5. **AC5** — The drill-in renders the step trail in order with a row per step (an `<ol>` of
   the steps), each plan step showing its todo items; rendered only when `hasDeepAgents`.
6. **AC6** — When the DeepAgents run had **no** delegation (no `delegate` step), the STEPS
   panel shows an explicit "no sub-agent delegated this run" line, so the absence of a
   sub-agent is legible (not just inferred from a missing row). On a run that *did* delegate,
   the line is absent and the `delegate` step renders.
7. **AC7** — In the Senses · hands panel, a tool call whose serialized args exceed a length
   threshold (e.g. `write_file` with a long `content`) is **truncated** with a "Read more" /
   "Leia mais" toggle that expands/collapses the full args in place — so one long tool call
   no longer makes the panel scroll for screens. Short calls render fully, with no toggle.
8. **AC8** — When a DeepAgents run finishes (the final answer is produced), the runtime
   reconciles the plan: every remaining `pending`/`in_progress` todo is marked `completed`
   and a closing `agent.plan` event (flagged `finalized`) is emitted — so the plan reads as
   finished instead of leaving the last (synthesis) todo `in_progress`. It is a **no-op**
   when there is no plan (Simple/ReAct runtime) or the plan is already fully completed (no
   redundant event). Because the trail now collapses ALL plan revisions into one step
   (AC2 amended), the `finalized` reconciliation just updates that single step — never a
   separate/duplicate Plan block, regardless of how many times the model called write_todos.
9. **AC9** — In the Virtual File System sub-section, a file's content is **collapsed** to a
   short preview by default with a "Read more" / "Leia mais" toggle that reveals the full
   content; short files render fully, with no toggle.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — pure re-projection of `agent.plan`, `agent.fs.write`,
  `agent.fs.read`, `agent.delegate` (all already emitted by 057).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (still the `agent` station).

## Open questions (clarify before planning)

- (resolved) Keep the final-only todo list, or replace it with the full trail? → **Replace**
  with the full chronological trail; the user asked for "all the steps, not just the plan".
- (resolved) Keep the standalone "Delegated to sub-agent" block? → **Fold** it into the trail
  as a `delegate` step (no duplication). The VFS file-contents sub-section stays.

## Out of scope / deferred

- A collapsible/timeline UI with per-step durations — the Execution Traces tree (038/062)
  already covers timing; this panel stays a simple ordered list.

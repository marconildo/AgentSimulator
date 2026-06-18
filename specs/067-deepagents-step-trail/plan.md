# Plan: DeepAgents step trail in the Agent drill-in

## Approach

Add a single pure derive — `deriveDeepAgentsSteps(events)` in `frontend/src/lib/deepagents.ts`
— that folds the event log into an ordered list of `DeepAgentsStep`s, one per DeepAgents
action END (`agent.plan` / `agent.fs.write` / `agent.fs.read` / `agent.delegate`), preserving
run order. Each step captures exactly the fields that step needs (todo snapshot, path, or the
delegation tuple). It reuses the same normalization the existing `deriveTodos` /
`deriveDelegations` use, so the two projections can't disagree.

In `AgentDetail.tsx`, the Plan panel renders this trail (an `<ol>`) instead of the single
final-todo list + the standalone delegations block. The Virtual File System sub-section is
unchanged. The existing `deriveTodos` / `deriveDelegations` / `derivePlan` functions stay in
the lib (still covered by their own tests) — only `AgentDetail`'s usage switches to the trail.

Alternative considered: keep the final todo list and *append* a steps list. Rejected — it
leaves the confusing single-`in_progress` row at the top, which is the exact complaint.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/deepagents.ts` — new `DeepAgentsStep` type + `deriveDeepAgentsSteps()`.
- `frontend/src/lib/deepagents.test.ts` — tests for the new derive (AC1–AC4).
- `frontend/src/components/AgentDetail.tsx` — Plan panel renders the trail (AC5); swap
  `deriveTodos`/`deriveDelegations` usage for `deriveDeepAgentsSteps`.
- `frontend/src/i18n/strings.ts` — new `agentDetail` keys (`steps`, `stepsHint`, the per-kind
  row words `wroteFile`/`readFile`) in en + pt.

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent` change; `schemas.py` ↔ `events.ts` untouched.

## Data model changes

- None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentDetail.steps` | Steps | Etapas |
| `agentDetail.stepsHint` | every DeepAgents action this run, in order | cada ação do DeepAgents nesta execução, em ordem |
| `agentDetail.wroteFile` | wrote file | escreveu arquivo |
| `agentDetail.readFile` | read file | leu arquivo |

(`plan`, `delegated`, `subagentUsed`, `todoStatus.*` already exist and are reused.)

## Cloud map (constitution §5)

- n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | order + kind of a 5-step DeepAgents run | `frontend/src/lib/deepagents.test.ts` |
| AC2 | two `agent.plan` events → two `plan` steps with their own todos | `frontend/src/lib/deepagents.test.ts` |
| AC3 | path on fs steps; subagent/subtask/result/steps on delegate | `frontend/src/lib/deepagents.test.ts` |
| AC4 | Simple-rung run → `[]` | `frontend/src/lib/deepagents.test.ts` |
| AC5 | render of the trail (covered structurally by the derive tests + `tsc`/build); manual verify in app | manual / build |

## Risks / trade-offs

- Low risk: pure projection, single consumer (`AgentDetail`). The removed standalone todo/
  delegation blocks are fully represented in the trail, so no information is lost.
- Verbosity: many `write_todos` calls produce many plan steps. Acceptable — it is the honest
  trail, and matches the Execution Traces tree's per-occurrence rows.

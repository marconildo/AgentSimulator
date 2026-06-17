# Plan: DeepAgents steps in the execution trace

## Approach

The fix lives entirely in the 038 execution-tree projection. Today
`executionTree` derives a span's node via `STAGE_TO_PHASE[stage] → PHASE_TO_NODE[phase]`,
which collapses the four DeepAgents stages (all in the `reason` phase) into `think`.

We give the execution tree its **own, finer-grained** stage→node mapping for the
DeepAgents stages, bypassing the phase grouping (the phase rail keeps using
`STAGE_TO_PHASE` unchanged). New `TraceNode`s: `plan`, `delegate`, `fs-write`,
`fs-read`. `agent.fs.write` (the `write_file`/`edit_file`/`ls` group emits write and
list; `read_file`/`ls` emit read) maps as: `agent.fs.write → fs-write`,
`agent.fs.read → fs-read`.

`plan` / `fs-write` / `fs-read` are leaf spans. We attach a `detail` (file path, or
the sub-agent type) and a `count` (plan todo count) to the span so the row can show a
tag without the projection knowing about i18n.

`delegate` is special: its `agent.delegate` START…END window wraps the sub-agent's
nested events (rag.embed/search/retrieve, mcp.call). To avoid those producing phantom
top-level `retrieve`/`tools` rows and splitting the delegate span in two, the loop
tracks an active-delegation window: once `agent.delegate` START is seen, **every**
event up to its END is swallowed into the delegate occurrence. The delegate span's
children come from the `steps` array on the `agent.delegate` END `data` (the
sub-agent's tool trail), and its `detail` from `data.subagent` — matching "context
quarantine" (the sub-agent is one collapsible span).

Alternatives considered: (a) re-map DeepAgents stages in `PHASE_TO_NODE` — rejected,
that map is keyed by phase, not stage, so it can't separate them; (b) change
`STAGE_TO_PHASE` — rejected, it would move the stages out of the `reason` phase on the
timeline rail, breaking 004's design and its parity test.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/executionTree.ts` — extend `TraceNode`; add the DeepAgents
  stage→node map; handle the delegate window; add `detail`/`count` to `TraceSpan`;
  build delegate children from `steps`.
- `frontend/src/lib/executionTree.test.ts` — new AC tests.
- `frontend/src/components/ExecutionTraces.tsx` — render the parent-row tag from
  `detail`/`count`.
- `frontend/src/i18n/strings.ts` — `nodes.{plan,delegate,fs-write,fs-read}` +
  `planTodos` in both `en` and `pt`, and the `TraceNode`-typed `nodes` record forces
  parity at the type level.

## Protocol changes (constitution §1)

None. No `Stage`, `Phase`, or `TraceEvent` change; `events.ts` untouched.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `timeline.execTrace.nodes.plan` | `plan` | `plan` |
| `timeline.execTrace.nodes.delegate` | `delegate` | `delegate` |
| `timeline.execTrace.nodes.fs-write` | `file write` | `file write` |
| `timeline.execTrace.nodes.fs-read` | `file read` | `file read` |
| `timeline.execTrace.planTodos` | `todos` | `tarefas` |

(The node labels stay English in both, matching the existing `route`/`think`/… labels;
only the `planTodos` count word is translated.)

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | plan span present, in order, with count | `frontend/src/lib/executionTree.test.ts` |
| AC2 | fs-write/fs-read spans with path detail | same |
| AC3 | single delegate span, detail=subagent, children=steps, no phantom rows | same |
| AC4 | two plan spans in order | same |
| AC5 | Simple-rung run unchanged (no new nodes) | same |
| AC6 | bilingual node labels + planTodos | same (extends the existing AC6 test) |

## Risks / trade-offs

- Delegate-window swallowing assumes every `agent.delegate` START has a matching END
  in the log. A truncated/cancelled run could leave the window open; the final
  `flush()` still emits the partial delegate span, so no events are lost.
- Pure projection, deterministic, no new state — replay/live unaffected.

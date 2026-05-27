# Plan: Diff the context window between turns

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Frontend-only; diffs two existing traces client-side. **Depends on 022** for the
> prior-turn trace. No backend, no protocol, no new `Stage`.

## Approach

Extract the per-section token computation that `AgentDetail` already does inline (the
`tok()` estimate over system / history / rag / tools / user text) into a **shared pure
`contextSections(events)`** → `Record<Section, number>`. The existing context-window bar
is refactored to consume it (no behavior change; a parity test pins it), giving the diff
**one source** identical to what's displayed.

A pure `diffTurns(prev, curr)` then returns a **signed delta per section** plus the
**total delta** (AC1). A section identical in both → delta 0 (`unchanged`); a section in
only one turn → a full add/remove (AC2).

For the data, the current turn's events are in the simulator; the previous turn's trace
is loaded via **022** (the previous persisted message's `trace_id` → `fetchTrace`/cache).
With **no prior turn** (first turn, or the prior trace was evicted), the compare
affordance is **unavailable and says why** (AC3).

**UI.** In the Agent anatomy, a "compare with previous turn" toggle shows the two context
windows side by side, each section annotated grew / shrank / same with its signed delta.

*Alternatives considered:* in-memory run history for the prior turn — rejected in clarify
(session-only, lost on reload); stored-trace-via-022 is consistent with 018. Mixing real
total tokens with estimated sections — rejected: two sources; keep the displayed estimate.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/turnDiff.ts` *(new)* — `Section` type, `contextSections(events)`,
  `diffTurns(prev, curr)` → `{ perSection: Record<Section, number>; total: number }`.
  Pure.
- `frontend/src/lib/turnDiff.test.ts` *(new)* — AC1/AC2 (+ no-prior guard helper).
- `frontend/src/components/AgentDetail.tsx` — refactor the context-window bar to use
  `contextSections`; add the "compare with previous turn" view (loads prior trace via
  022) and the unavailable/explained empty state.
- `frontend/src/i18n/strings.ts` — compare labels (grew/shrank/same, needs-prior) en + pt.

## Protocol changes (constitution §1)

None. Reads existing event `data`; loads prior trace via the existing
`GET /api/trace/{id}` (022). No `Stage`/`Phase`/`TraceEvent` change.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `diff.compareTitle` | Compare with previous turn | Comparar com o turno anterior |
| `diff.grew` | grew | cresceu |
| `diff.shrank` | shrank | encolheu |
| `diff.same` | unchanged | inalterado |
| `diff.needsPrior` | Needs a previous turn to compare. | Precisa de um turno anterior para comparar. |
| `diff.totalDelta` | total change | variação total |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `diffTurns` returns a signed delta per section + total delta | `frontend/src/lib/turnDiff.test.ts` |
| AC2 | identical sections → delta 0; a section in one turn only → full add/remove | `turnDiff.test.ts` |
| AC3 | with no prior turn, the compare affordance is unavailable + explains why | `turnDiff.test.ts` (guard) + manual UI |
| AC4 | compare strings exist in en **and** pt | i18n parity test |
| (parity) | `contextSections` matches the existing bar's per-section numbers | `turnDiff.test.ts` |

## Risks / trade-offs

- **Depends on 022.** Prior-turn trace comes through 022; schedule after it. Evicted
  prior trace → compare unavailable (honest, no faked deltas).
- **Estimated tokens.** Deltas are over the displayed `tok()` estimate, not billed
  tokens — consistent with the bar, labelled as approximate.
- **AgentDetail is a hot file (019/020/021).** Different waves; `turnDiff.ts` is
  conflict-free. The `contextSections` extraction is a behavior-preserving refactor
  (parity test guards it).

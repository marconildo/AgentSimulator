# Plan: <feature name>

> The HOW. Written after `spec.md` is `clarified`. Decisions here must respect every
> principle in `.specify/constitution.md`; if one must bend, amend the constitution
> first and note it.

## Approach
<!-- The shape of the solution in a few sentences. Alternatives considered + why this one. -->

## Affected files

**Backend**
- `backend/app/…` — <what changes>

**Frontend**
- `frontend/src/…` — <what changes>

## Protocol changes (constitution §1)
<!-- If adding/changing a Stage/Phase/TraceEvent: -->
- `backend/app/schemas.py` — …
- `frontend/src/types/events.ts` — mirrored change …
- Emitted in: `backend/app/…` (which node)
- Mapped to station in `frontend/src/lib/stations.ts`: …
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) case added: <yes/n/a>

## Data model changes
<!-- Vector store (Chroma) and/or relational store (SQLite ConversationStore)? Migrations? -->

## i18n strings (constitution §4)
<!-- Every new user-facing string, in both languages, listed here so nothing ships en-only. -->

| key / location | en | pt |
|---|---|---|
| | | |

## Cloud map (constitution §5)
<!-- New tier/station? Fill all three. Otherwise "n/a". -->

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| | | | | |

## Test strategy (constitution §9 — TDD)
<!-- Which test files, which level. Each acceptance criterion → at least one test. -->

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | | `backend/tests/…` |
| AC2 | | |

## Risks / trade-offs
<!-- Determinism, single-instance assumptions, perf, anything that could bite. -->

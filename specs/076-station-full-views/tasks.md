# Tasks: Full-view drill-ins for MCP, App Database, Backend & Frontend

> TDD checklist. Each implementation task is preceded by the test that should fail
> first (red → green → refactor). FE-only — no pytest.

## Tasks

- [x] **T1 — test first (AC1/AC2)**: `StationNode.fullview.test.tsx` — asserts the
      full-view button renders for `mcp`/`database`/`backend`/`frontend`, is absent for
      a comingSoon station, and that clicking toggles the store `detail`.
- [x] **T2 — implement**: add the four ids to `HAS_DETAIL` in `StationNode.tsx`; make T1 green.
- [x] **T3 — implement**: extract `DetailShell.tsx` (header/back/backdrop/empty) used by
      the four new overlays.
- [x] **T4 — test first (AC3/AC7)**: `McpDetail.test.tsx` — discovery + N calls + JSON-RPC
      frames + DeepAgents local calls + empty state.
- [x] **T5 — implement**: `McpDetail.tsx` (+ shared selectors in `lib/stationDetail.ts`); green.
- [x] **T6 — test first (AC4/AC7)**: `DatabaseDetail.test.tsx` — db.read + db.write payloads + empty.
- [x] **T7 — implement**: `DatabaseDetail.tsx`; green.
- [x] **T8 — test first (AC5/AC7)**: `BackendDetail.test.tsx` — request + response + empty.
- [x] **T9 — implement**: `BackendDetail.tsx`; green.
- [x] **T10 — test first (AC6/AC7)**: `FrontendDetail.test.tsx` — sent request + answer + empty.
- [x] **T11 — implement**: `FrontendDetail.tsx`; green.
- [x] **T12 — wire**: render the four overlays in `App.tsx` keyed on `detail`.
- [x] **T13 — i18n (§4)**: add `mcpDetail`/`dbDetail`/`backendDetail`/`frontendDetail`
      string blocks in en + pt.
- [x] **T14 — regression (AC8)**: confirm InspectorPanel mcp/db/backend/frontend suites
      still green; Inspector theory unchanged.
- [x] **T15 — refactor**: dedupe shared selectors, keep all tests green.
- [x] **T16 — demo (standing rule)**: ask whether the GitHub Pages demo (058) needs a
      re-capture — this is FE-only & pure projection over existing fixtures, so likely
      **no** re-capture, but confirm with the user.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched); `pytest -q` still green
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`

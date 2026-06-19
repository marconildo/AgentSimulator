# Tasks: Backend lifecycle flowchart

- [x] **T1 — test first**: extend `BackendDetail.test.tsx` for the 5 ordered steps,
      agent summary, pending + empty (AC1–AC7).
- [x] **T2 — implement**: `selectBackendFlow` in `lib/stationDetail.ts` (steps + data + latency).
- [x] **T3 — implement**: rewrite `BackendDetail.tsx` as a vertical flowchart (step cards
      + connectors + agent summary + pointer).
- [x] **T4 — i18n (§4)**: add the new `backendDetail` step/hop/summary keys en + pt.
- [x] **T5 — refactor**: keep `selectMcp`/`electedToolCalls` reuse; all tests green.
- [x] **T6 — gates**: `npm run build` + the BackendDetail suite green; no protocol change.
- [x] **T7 — demo (standing rule)**: confirm with user whether the GitHub Pages demo (058)
      needs a re-capture (FE-only pure projection ⇒ expected no).

## Definition of done

- [x] Every AC maps to a passing test
- [x] `npm run build` passes
- [x] No protocol change; en + pt parity
- [x] `spec.md` status → done

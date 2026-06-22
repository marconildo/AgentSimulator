# Tasks: Network edge (real reverse proxy / LB / TLS) — expandable box

> Ordered TDD checklist. Each implementation task is preceded by the test that should fail first
> (red → green → refactor). Check boxes as you go.

## Tasks

### Backend — protocol + edge stage
- [x] **T1 — test first (AC4)**: `backend/tests/test_edge.py` — assert `Stage.EDGE == "edge"` exists
      and `ChatRequest(edge=...)` defaults to `False`. (red)
- [x] **T2 — implement**: add `Stage.EDGE` (between `FRONTEND` and `BACKEND`) and
      `ChatRequest.edge: bool = False` in `schemas.py`. (green)
- [x] **T3 — test first (AC2/AC9)**: test `read_edge(request)` — no forwarded headers →
      `proxied=False`, `tls=False`, `client_ip` = socket peer, no `proxy_server`. (red)
- [x] **T4 — implement**: `backend/app/edge.py` with `EdgeInfo` + pure `read_edge`. (green)
- [x] **T5 — test first (AC1)**: request with `edge=true` + `X-Forwarded-For`/`-Proto: https`/
      `X-Request-Id` → exactly one `edge` stage (START+END) ordered before `backend`, END `data`
      has `proxied=true`, `tls=true`, `client_ip`/`request_id` from the headers. (red)
- [x] **T6 — implement**: emit `Stage.EDGE` from `read_edge` in `main.py` before the `BACKEND`
      stage, gated on `req.edge`; thread the FastAPI `Request` through. (green)
- [x] **T7 — test first (AC3)**: `edge=false`/omitted → no `edge` event; the rest of the event
      stream order/data unchanged. (red) → make green (should pass once T6 is gated correctly).

### Protocol mirror
- [x] **T8 — mirror (AC4)**: `frontend/src/types/events.ts` — add `"edge"` to `Stage`, `edge?: boolean`
      to the request type, and `EdgeData` for the END `data`. Update/extend the schemas↔events mirror
      test.

### Frontend — visual model
- [x] **T9 — test first (AC5)**: extend `frontend/src/lib/phases.test.ts` — `STAGE_TO_PHASE` and
      `STAGE_TO_STATION` are total incl. `edge`, parity holds. (red)
- [x] **T10 — implement**: new `edgeTier` + `edge` station in `stations.ts` (bilingual fields +
      `clouds` map); map `Stage.EDGE` into `edge.stages`; add `STAGE_TO_PHASE["edge"]`. (green)
- [x] **T11 — test first (AC6)**: `stations.test.ts` — `visibleStationsFor` includes `edge` iff
      selected; with edge visible the direct client→backend hop is gone and client→edge / edge→backend
      exist with zone + protocol. (red)
- [x] **T12 — implement**: add optional `ComponentId` `edge` (default-on) in `selection.ts`; new
      hops + re-route in `visibleHopsFor`; include edge in `visibleTiersFor`. (green)
- [x] **T13 — test first (AC8)**: i18n/cloud audit — every new `edge` tier/station string has en+pt;
      `clouds` filled for azure/aws/gcp. (red) → green via T10 content.

### Frontend — rendering + exhaustive switches
- [x] **T14 — test first (AC7)**: `derive.test.ts` / component test — collapsed tag vs ⊕ expanded
      chain; TLS/LB segment bound to edge data, DNS/CDN/WAF/API-GW flagged preview. (red)
- [x] **T15 — implement**: `case "edge"` in `readoutFor` (FlowCanvas, proxied vs direct) and
      `renderDetail` (InspectorPanel); the ⊕ expanded chain UI with preview markers. (green)
- [x] **T16 — implement**: `computeLayout` geometry for the edge tier/station (middle column above
      API tier), reflow + boundary recompute. Keep existing layout tests green.
- [x] **T17 — implement**: edge toggle in `ScenarioBuilder.tsx`; carry `edge` through `useExperiment`.

### Infra (real proxy)
- [x] **T18 — implement (AC9)**: `infra/nginx/nginx.conf` (TLS termination, `X-Forwarded-*` /
      `X-Request-Id`, upstream `backend:8000`) + `edge` service in `docker-compose.yml`; retarget
      `VITE_API_BASE` at the proxy. Add a config-presence assertion to `test_edge.py`.
- [ ] **T19 — verify manually** (pending): `docker compose up --build` → a real request returns
      `proxied=true` in the `edge` event; `uvicorn` direct returns `proxied=false`. Covered in CI by
      the `read_edge` unit test + the nginx.conf/compose presence asserts; full-stack run is manual.

### Wrap-up
- [x] **T20 — i18n (AC8)**: add glossary + chrome strings (en + pt) per the plan table.
- [x] **T21 — refactor**: clean up, keep all tests green; update `docs/roadmap.md` (add the
      `network` track + move "network edge" from gap to shipped) and CLAUDE.md if the visual-model
      paragraph needs the new tier mentioned.
- [ ] **T22 — demo note**: flag the 058 GitHub Pages fixture re-capture (standing directive) — old
      fixtures must still render (edge empty/preview, no crash).

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .`
- [x] `pytest -q` green (with `OPENAI_API_KEY`; the edge tests are keyless)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), `Stage.EDGE` mapped to the `edge` station
      and to a `TimelinePhase`
- [x] All new user-facing text exists in en **and** pt; cloud map filled (azure/aws/gcp)
- [x] `spec.md` status updated to `done`

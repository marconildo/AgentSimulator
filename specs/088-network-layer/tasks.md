# Tasks: Real network layer (DNS → CDN/Cache → WAF → TLS/LB → API-GW)

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the test
> that should fail first (red → green → refactor). Build the **skeleton + availability gate +
> ONE appliance (WAF)** end-to-end first to prove the pattern; the other four reuse it.

## Phase 0 — protocol + selection skeleton (no Docker needed)

- [x] **T1 — test**: `selection.test.ts` — `network` absent from default selection; `toggle("network")` adds/removes it (AC1).
- [x] **T2 — impl**: add `network` to `ComponentId`/`ALL_COMPONENTS`/`COMPONENT_IS_REAL=true`/`COMPONENT_FLOOR="advanced"`; `NETWORK_STATIONS` + `resolveStations` special-case. Make T1 green.
- [x] **T3 — test**: `selection.test.ts` — `classify` → `advanced` when `network` enabled (AC2).
- [x] **T4 — impl**: covered by `COMPONENT_FLOOR`; confirm green (AC2).
- [x] **T5 — protocol mirror**: add `DNS/CDN/WAF/LB/APIGW` to `schemas.py::Stage` **and** `events.ts` (+ five `*Data` interfaces) + `ChatRequest.network: bool=False` (AC8). Mirror test green.
- [x] **T6 — test**: `stations.test.ts` — five stations visible in order between frontend/backend when `network` on; none when off; `frontend→backend` hop unchanged when off (AC4, AC10).
- [x] **T7 — impl**: five stations in a new `edge` `TierId` + hops `frontend→dns→cdn→waf→lb→apigw→backend`; `STAGE_TO_STATION` entries; layout geometry for the tier. Make T6 green.
- [x] **T8 — test**: `phases.test.ts` — `STAGE_TO_PHASE` total over the five; parity with `STAGE_TO_STATION` (AC7).
- [x] **T9 — impl**: add the five `STAGE_TO_PHASE` entries (same phase as `EDGE`); `readoutFor` + `renderDetail` cases for the five stations (exhaustive switches). `tsc` clean (AC7).
- [x] **T10 — cloud + i18n**: fill `clouds` (azure/aws/gcp) + en/pt for all five stations and the `edge` tier (AC9); Build label/blurb + disabled tooltip + provisioning/error notes in `strings.ts`.

## Phase 1 — backend evidence parsers + emission (pure, no Docker)

- [x] **T11 — test**: `test_network.py` — five pure `read_*` parsers map real appliance headers → `*Info` (and report only what's proven when a header is absent, `edge.py`-style) (AC5).
- [x] **T12 — impl**: `backend/app/network.py` with the five dataclasses + parsers. Make T11 green.
- [x] **T13 — test**: `test_agent.py`/`test_network.py` — with `network=True` + evidence headers present, `main.py` emits the five stages in DNS→CDN→WAF→LB→GW order before `BACKEND`; with `network=False` the stage stream is byte-for-byte the baseline (AC5, AC10).
- [x] **T14 — impl**: emit the five stages in `main.py` from the parsers, gated on `request.network` + evidence. Make T13 green.

## Phase 2 — availability gate (env flag, no Docker control)

- [x] **T15 — test**: `test_network.py` — `network_available()` true iff the `NETWORK_CHAIN` env flag is set; `/api/config` exposes `network_available` (AC3, AC11).
- [x] **T16 — impl**: `config.py` `network_chain` setting + `network.py::network_available()` + surface in `/api/config`. Make T15 green.
- [x] **T17 — test**: `ScenarioBuilder.test.tsx` — checkbox disabled + bilingual tooltip when `network_available=false`; ordinary enabled toggle when `true` (AC3).
- [x] **T18 — impl**: read `network_available` in the builder; disable + tooltip when false; wire the toggle to the pure `selection` store (no lifecycle store). Make T17 green.

## Phase 3 — the real containers (infra) + the WAF proof

- [x] **T21 — impl**: `docker-compose.yml` — five services (coredns/varnish/modsecurity/haproxy/kong) that come up with `docker compose up`, wired DNS→CDN→WAF→LB→GW→backend; Varnish takes the browser-facing front-door port; backend gets `NETWORK_CHAIN=1`; per-appliance configs under `infra/`. **No `docker.sock`.** Reconcile/supersede the legacy `nginx` edge service.
- [ ] **T22 — test (Docker-gated, NOT yet run)**: `test_network_waf.py` (`@pytest.mark.network`) — a SQLi payload → real **403** from ModSecurity; a benign request reaches the backend; WAF stage reports `blocked`+rule id vs `clean` (AC6). _Needs a live `docker compose up` to validate — not runnable in the dev sandbox._
- [ ] **T23 — verify (Docker-gated, NOT yet run)**: bring the chain up (`docker compose up`) and confirm each appliance injects its evidence header end-to-end + the WAF 403, then tune the configs (`infra/*`) as needed. Configs are written; **header injection (esp. ModSecurity/Varnish) needs real tuning against the running chain.**

## Phase 4 — verify + close

- [ ] **T24 — refactor**: dedupe the five parsers/stations where the pattern repeats; keep all tests green.
- [ ] **T25 — gates**: run the `verify-gates` skill (`ruff`, `pytest`, `tsc`+build, Vitest, protocol mirror, Stage→station, en+pt, cloud map).
- [ ] **T26 — demo directive**: ask the user whether the GitHub Pages mocked demo (058) needs a re-capture (network is Docker-only, so likely N/A — but ask, per the standing rule).
- [ ] **T27 — docs**: update `docs/roadmap.md` (remove the now-real network items) + `CLAUDE.md` architecture note + the 084/085 memory pointers (network is now a real Build component, reversing "no box").

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test (AC6/AC11/AC12 Docker-gated).
- [ ] `ruff check .` + `ruff format .` clean
- [ ] `pytest -q` green (Docker-gated `@network` tests skipped without the chain)
- [ ] `npm run build` passes (`tsc --noEmit` + build) + `npm test` (Vitest) green
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), every new Stage mapped to a station + a phase
- [ ] All new user-facing text exists in en **and** pt; cloud map filled for the `edge` tier + five stations
- [ ] `spec.md` status updated to `done`

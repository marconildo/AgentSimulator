# Tasks: Visualize a WAF block

> Ordered TDD checklist (red → green → refactor). Mostly FE + one infra (CORS).

## Tasks

- [ ] **T1 — test first (AC1)**: `lib/sse.test.ts` — a mocked `403` response from the
  chat POST yields a typed `WafBlocked` signal (not a generic error). Red.
- [ ] **T2 — implement detection**: classify `403` in `lib/sse.ts`; surface
  `WafBlocked`. Green.

- [ ] **T3 — test first (AC2/AC5)**: `derive.test.ts` — `deriveView(events, cursor,
  blocked)` marks waf=blocked, frontend/dns/cdn/lb=reached, apigw/backend/agent/data
  =not-reached; with `blocked == null` the projection is byte-for-byte today's. Red.
- [ ] **T4 — implement projection + store**: add `BlockedOutcome` type + `blocked`
  state in `useSimulator` (set on a blocked send, cleared on send/reset); thread it
  through `deriveView`; add the `"blocked"` station status. Green.

- [ ] **T5 — test first (AC3/AC4)**: WAF drill-in shows verdict blocked + 403 + the
  "never reached the backend" note; the chat bubble shows the bilingual blocked
  message. Red.
- [ ] **T6 — implement render**: blocked-station marker in `FlowCanvas`; WAF
  drill-in blocked branch in `NetworkApplianceDetail`; blocked chat bubble; en + pt
  strings. Green.

- [ ] **T7 — test first (CORS)**: config-audit — `infra/varnish/default.vcl` sets an
  `Access-Control-Allow-Origin` response header. Red.
- [ ] **T8 — implement infra**: add the CORS-on-response directive to Varnish. Green.

- [ ] **T9 — AC6 regression**: a normal (stream) run is unchanged; exhaustive
  `StationId` switches still compile.
- [ ] **T10 — i18n**: every new string en + pt; run the i18n auditor.
- [ ] **T11 — verify gates + smoke**: `tsc` · `npm test` · `npm run build` ·
  `ruff`/`pytest` (config-audit) · manual `docker compose up` smoke (send
  `<script>alert(1)</script>` → see the WAF block). `spec.md` → `done`.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `npm run build` + `npm test` green; `ruff`/`pytest` green (config-audit)
- [ ] No new `Stage`; no fabricated `TraceEvent`s for a block (AC5); no backend diff
- [ ] All new user-facing text exists in en **and** pt
- [ ] Live block verified via `docker compose up` (CI can't run Docker)
- [ ] `spec.md` status updated to `done`

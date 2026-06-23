# Tasks: Network appliance detail enrichment

> Ordered TDD checklist (red → green → refactor). Each implement task is preceded by
> the failing test that drives it.

## Tasks

- [x] **T1/T2 — parsers**: extended `*Info` dataclasses + `read_*` + `as_data()`
  (cdn hits/reason · waf threshold/paranoia · lb pool_size/algorithm/backend · apigw
  policy) with tests in `test_network.py`.
- [x] **T3/T4 — DNS**: `resolve_dns` (dnspython, bounded, honest fallback) +
  `main.py` folds the real address/ttl into the `dns` evidence; `dnspython` added to
  `requirements.txt`. Real-resolution + fallback tests green.
- [x] **T5/T6 — infra**: varnish stamps `X-Cache-Hits`/`X-Cache-Reason`; haproxy
  stamps `X-Lb-Pool-Size`/`X-Lb-Algorithm`/`X-Lb-Backend` (+ `balance roundrobin`);
  kong stamps `X-Waf-Paranoia`/`X-Waf-Threshold` + `X-Gateway-Policy`. Config-audit
  tests green. (No modsecurity rule — v3 can't forward its score upstream.)
- [x] **T7/T8 — log builder + types**: `lib/networkLog.ts` (`buildApplianceLog`, 6
  tests) + the five `events.ts` interfaces extended (optional fields).
- [x] **T9/T10 — view**: redesigned `NetworkApplianceDetail.tsx` (enriched OUT rows,
  honest note line, reconstructed-log block) + en/pt i18n. Component tests green.
- [x] **T11 — i18n**: every new string ships en + pt.
- [x] **T12 — verify gates**: ruff ✓ · tsc ✓ · 695 vitest ✓ · `npm run build` ✓ ·
  full `pytest` green except the **pre-existing** `test_cancel` failure (unrelated).
  Manual `docker compose up` smoke check of the new real headers still recommended
  (CI can't run Docker; config-audit pins their presence).

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [ ] `npm run build` (`tsc --noEmit` + build) + `npm test` green
- [ ] No new `Stage`; `events.ts` mirrors the additive (optional) fields
- [ ] All new user-facing text exists in en **and** pt
- [ ] New headers verified live via `docker compose up` (config-audit green in CI)
- [ ] Demo fixtures still render (older traces lack the new keys → "not reported")
- [ ] `spec.md` status updated to `done`

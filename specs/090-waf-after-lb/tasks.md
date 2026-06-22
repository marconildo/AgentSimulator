# Tasks: WAF after the load balancer + honest CDN bypass

> Ordered TDD checklist (red → green → refactor). Each implement task is preceded
> by the failing test that drives it.

## Tasks

- [x] **T1 — test first (AC1)**: `test_network.py` `_NETWORK_STAGES` → `dns, cdn,
  lb, waf, apigw` + an explicit `seqs["lb"] < seqs["waf"]` assert.
- [x] **T2 — implement (AC1)**: reordered the emission tuple in `main.py` to
  `(DNS, CDN, LB, WAF, APIGW)`.

- [x] **T3 — test first (AC2/AC3)**: `stations.test.ts` asserts `cdn→lb`/`lb→waf`/
  `waf→apigw`, excludes the old pairs, and pins single-TLS-termination + plaintext
  WAF hop.
- [x] **T4 — implement (AC2/AC3)**: rewired `HOPS_SRC`; swapped the `waf`/`lb`
  station declarations; `NETWORK_IDS = ["dns","cdn","lb","waf","apigw"]`.

- [x] **T5 — test first (AC5)**: `read_cdn` BYPASS parser test + `FlowCanvas.readout`
  BYPASS test.
- [x] **T6 — implement (AC5)**: Varnish stamps `BYPASS` on the uncacheable path;
  CDN station prose updated (en+pt).

- [x] **T7 — test first (AC4)**: added the config-audit tests in `test_network.py`
  (`test_real_chain_forwards_waf_after_the_load_balancer`,
  `test_waf_cleared_attestation_is_stamped_downstream_of_the_waf`,
  `test_varnish_reports_bypass_for_the_uncacheable_api`).
- [x] **T8 — implement (AC4)**: reordered `docker-compose.yml`; varnish → haproxy;
  haproxy → modsecurity (and dropped its WAF stamping); modsecurity → kong; Kong
  now stamps `X-Waf-Status`/`X-Waf-Engine`.

- [x] **T9 — AC6 regression**: `test_chat_off_by_default_emits_no_network_stages`
  + full frontend suite green (layout unchanged when network off).

- [x] **T10 — i18n**: every edited hop/station string ships en + pt.
- [x] **T11 — refactor + verify gates**: ruff clean · `test_network`/`test_edge`
  green · tsc clean · 686 vitest green. `spec.md` → `done`.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; keyless guards still run)
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` (Vitest) green
- [ ] No protocol change (verified: `schemas.py` ↔ `events.ts` untouched; every
      Stage still mapped to a station + a phase)
- [ ] All edited user-facing text exists in en **and** pt
- [ ] Real container chain order matches the canvas (config-audit test green)
- [ ] `spec.md` status updated to `done`

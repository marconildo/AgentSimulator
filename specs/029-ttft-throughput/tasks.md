# Tasks: Time-to-first-token & generation throughput

> The work, ordered, as a TDD checklist (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC1/AC2)** `[openai]`: assert a streamed run's `llm.generate`
  END `metrics` has `ttft_ms > 0`, `tokens_per_sec > 0`, and `ttft_ms ≤ latency_ms`.
- [x] **T2 — implement**: measure `ttft_ms` + `tokens_per_sec` in `generate_node` with a
  monotonic clock; add to `rec.metrics`. (Green T1.)
- [x] **T3 — test first (AC3)** `[openai]`: a `mode="batch"` run still records both
  metrics on the generate END event.
- [x] **T4 — implement**: confirm the measurement is outside the `if streaming:` PROGRESS
  branch so batch mode is covered (adjust if needed). (Green T3.)
- [x] **T5 — test first (AC4)**: derive/readout exposes TTFT + throughput when the
  generate metrics are present, and omits them when absent.
- [x] **T6 — implement**: surface the metrics in `deriveView` and render the LLM readout
  rows. (Green T5.)
- [x] **T7 — test first (AC5)**: HUD input+output split sums to total; absent with no
  usage.
- [x] **T8 — implement**: render the input/output split in `ConversationHud`. (Green T7.)
- [x] **T9 — i18n (AC6)**: add `readout.ttft` / `readout.throughput` / `hud.tokensIn` /
  `hud.tokensOut` (en + pt); keep `strings.test.ts` parity green.
- [x] **T10 — parity (AC7)**: confirm `STAGE_TO_STATION` / `STAGE_TO_PHASE` and token-cost
  tests unchanged; legacy trace (no new metrics) replays cleanly.
- [x] **T11 — refactor**: extract a small `formatTps`/`formatMs` helper; guard the
  single-token throughput edge case.

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean
- [ ] `pytest -q` green (with `OPENAI_API_KEY`; keyless guards still run)
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green
- [ ] No new `Stage`/`Phase`/`TraceEvent` type; protocol mirror in sync; every Stage mapped
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`

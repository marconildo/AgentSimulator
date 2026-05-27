# Plan: Live pacing

> HOW for `009-live-pacing`. Respects the constitution: no server change
> (§3), pure projection over the event log (§7), no protocol change (§1).

## Approach

Mirror the **guided-tour** shape: a **pure reducer** in `lib/` that the store
drives with a timer. The reducer decides *which cursor* the live playhead should
sit at for a given `now`; the store owns the ticker and module-level timing state.
Keeping the decision pure makes every acceptance criterion testable synchronously
without leaning on wall-clock timers.

Two event classes:
- **structural** — every stage start/end (a station change worth seeing). Gets a
  **minimum on-screen dwell** (`LIVE_STEP_MS`).
- **fast-forward** — `llm.generate/progress` token events. Zero dwell: they don't
  change the active station, so they flush to the live tail and the answer types at
  the model's real arrival speed.

The reducer advances **at most one structural event per `LIVE_STEP_MS`**, flushing
any run of token events for free. During the initial burst this walks the journey
station-by-station; once it reaches `llm.generate`, the (slowly arriving) tokens
keep pace 1:1 with arrival. After the terminal `backend/end`, the playhead keeps
draining at the same cadence until it reaches the tail, then the run settles via
the existing `deriveView` end-state.

**`pushTrace` stops snapping the cursor** — it only appends to `events`. The paced
ticker (a `setInterval`, like `playTimer`) is the sole owner of live cursor
advancement and runs only while `following` is true.

### Why not server sleeps / why not slow tokens
Server sleeps would fake the pipeline (violates §3). Slowing tokens would make the
answer crawl and misrepresent the model's real speed. Pacing only the *structural*
transitions restores the visible journey while keeping everything else honest.

## Affected files

**Frontend**
- `frontend/src/lib/pacing.ts` — **new.** Pure reducer + constants:
  - `LIVE_STEP_MS` (min structural dwell, ~120ms).
  - `isFastForward(ev)` → `true` for `llm.generate/progress`.
  - `paceAdvance(events, cursor, lastAdvanceAt, now)` → `{ cursor, advancedAt }`:
    flush leading fast-forward events; if `now - lastAdvanceAt >= LIVE_STEP_MS`
    advance one structural event and flush any fast-forward run after it.
- `frontend/src/store/useSimulator.ts`:
  - `pushTrace` → append only; **remove the `following ? tail : cursor` snap**.
  - New module-level `liveTimer` + `liveAdvanceAt`; `startLiveTimer()` /
    `stopLiveTimer()` helpers (mirror `playTimer`).
  - `beginRun` starts the live timer and resets `liveAdvanceAt`.
  - Live tick: if `!following` → stop (replay/tour/scrub took over). Else call
    `paceAdvance(Date.now())`, set `cursor` + `liveAdvanceAt`; when caught up to the
    tail **and** `status !== "streaming"` (run finished + drained) → stop.
  - `reset`, `togglePlay`, `step`, `startTour` already call stop-helpers; add
    `stopLiveTimer()` alongside `stopTimer()`/`stopTourTimer()` so the modes stay
    mutually exclusive.
  - `endRun` → set `status:"done"` but **keep `following`** and **do not snap**
    cursor; the live timer drains the post-`respond` tail (respond → db.write →
    backend/end) and self-stops once settled.
- `frontend/src/lib/pacing.test.ts` — **new** (Vitest): AC1–AC3 against the pure
  reducer + AC3 cross-checked through `deriveView`.
- `frontend/src/store/useSimulator.pacing.test.ts` — **new** (Vitest): AC4–AC5
  store-glue guards (`pushTrace` doesn't snap; ticker no-ops when `!following`).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` change; `schemas.py` ↔ `events.ts` untouched.

## Data model changes

None (no Chroma / SQLite change).

## i18n strings (constitution §4)

None — this spec renders no new text.

| key / location | en | pt |
|---|---|---|
| (none) | | |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 paced, no skip | drive `paceAdvance` one interval at a time → cursor `k,k+1,…` | `lib/pacing.test.ts` |
| AC2 token flush | cursor before token run → one step reaches tail | `lib/pacing.test.ts` |
| AC3 answer never pre-empts | replay full run; pre-LLM cursors ⇒ `deriveView(...).answer === ""` | `lib/pacing.test.ts` |
| AC4 no snap | `beginRun` + N `pushTrace` ⇒ `events.length` grows, `cursor` not at tail | `store/useSimulator.pacing.test.ts` |
| AC5 scoped to following | `following:false` + tick ⇒ cursor unchanged | `store/useSimulator.pacing.test.ts` |
| AC6 settled end | drain to tail ⇒ existing `derive.test.ts` end-state holds | `lib/derive.test.ts` (unchanged) |

## Risks / trade-offs

- **Burst longer than the answer:** if there are many structural events (tools
  loop) the journey could lag behind a fast answer. Mitigated: only structural
  events are paced and there are ~12–18 of them; at ~120ms each the journey is
  ~1.5–2s, comfortably under a typical answer stream.
- **Timer cleanup:** the live timer must stop on `reset`/`togglePlay`/`step`/
  `startTour`/`beginRun` to avoid two timers fighting over the cursor — covered by
  routing every mode switch through the stop-helpers (AC5 guards it).
- **`endRun` no longer snaps:** if the timer were stopped too early the tail would
  freeze before `backend/end`; the drain-then-settle condition (stop only when
  caught up *and* not streaming) prevents that (AC6).

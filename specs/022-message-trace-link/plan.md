# Plan: Revisit a turn's trace (message ↔ trace link)

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Frontend-only on an existing foundation (`GET /api/trace/{id}` + `fetchTrace` +
> per-message `trace_id`). No backend, no protocol, no new `Stage`. **Enables 018/020.**

## Approach

A small memoized loader plus a static "load into the simulator" path:

1. **Memoized trace loader.** `frontend/src/lib/traceCache.ts` wraps the existing
   `fetchTrace(traceId)` with an in-memory cache keyed by `trace_id`: first select
   fetches, subsequent reads hit the cache. A 404 resolves to an **expired** result
   (not a throw the caller must guard everywhere). This is the **shared mechanism 018 and
   020 reuse** to re-derive per-message data.
2. **Static load into the simulator.** Add `loadTrace(events)` to `useSimulator`: set
   `events`, `cursor` to the **last** index, `status: "done"`, `following/playing: false`,
   no live/tour timers — a **settled, static** trace (per the non-goal: no auto-replay;
   the user can press play). `deriveView` renders it; replay/step operate over it (AC1).
   Guard: `loadTrace` is a no-op while a live run is `streaming` (AC3).
3. **Auto-load on switch + click to revisit.** `openSession` (which calls `reset()`)
   auto-loads the **latest** message's trace via the loader → `loadTrace`, so the canvas
   is never dead (AC2). A `selectMessage(id)` loads any past turn's trace on click. An
   expired latest trace falls back to the click-to-load hint (AC2/expired).
4. **Expired state.** When the loader returns expired, the chat/canvas shows a clear
   "trace expired" affordance; the message stays selectable; a fresh `send` still works.

*Secondary (AC4, may ship after 014):* hovering a message emphasizes the stations its
trace touched — reuses 014's `emphasizedStation` plumbing once it exists; kept out of the
022 core so 022 ships first.

*Alternatives considered:* pure refetch (no cache) — rejected: 018/020 would refetch each
turn repeatedly. Explicit-click-only on switch — rejected: leaves the canvas dead,
against Goal #2. `playBatch` for loading — rejected: it auto-plays; the non-goal wants a
static settled trace.

## Affected files

**Backend**
- none (reuses `GET /api/trace/{id}`).

**Frontend**
- `frontend/src/lib/traceCache.ts` *(new)* — memoized `loadTrace(traceId)` over
  `fetchTrace`; `{ ok, events } | { expired: true }` result.
- `frontend/src/lib/traceCache.test.ts` *(new)* — memoization + expired (404) handling.
- `frontend/src/store/useSimulator.ts` — `loadTrace(events)` (static settled load);
  no-op while streaming.
- `frontend/src/store/useSimulator.loadTrace.test.ts` *(new)* — AC1 (events+cursor set,
  step/replay work), AC3 (no-op while streaming; fresh `beginRun` after is clean).
- `frontend/src/store/useChat.ts` — `openSession` auto-loads the latest turn's trace;
  add `selectMessage(id)`; track an `traceExpired` flag.
- `frontend/src/components/ChatPanel.tsx` — click a past agent message to load its trace;
  the "trace expired" state; *(secondary)* hover emphasis.
- `frontend/src/i18n/strings.ts` — click-to-load + trace-expired strings (en + pt).

## Protocol changes (constitution §1)

None. Consumes the existing `TraceSummary` from `GET /api/trace/{id}`.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `trace.clickToLoad` | Click a message to load its trace | Clique numa mensagem para carregar seu trace |
| `trace.loaded` | Showing this turn's trace | Mostrando o trace deste turno |
| `trace.expired` | Trace expired — no longer available | Trace expirado — não está mais disponível |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | selecting a message with a `trace_id` loads it (events+cursor) so `deriveView` renders; replay/step operate | `frontend/src/store/useSimulator.loadTrace.test.ts` |
| AC2 | re-opening a conversation auto-loads the latest trace (not empty); expired → click hint | `traceCache.test.ts` + `useChat` test |
| AC3 | `loadTrace` is a no-op while streaming; selecting while idle is safe; a fresh `send` after still works | `useSimulator.loadTrace.test.ts` |
| AC4 *(secondary)* | hovering a message emphasizes its trace's stations (after 014) | deferred test |
| AC5 | click-to-load + expired strings exist in en **and** pt | i18n parity test |

## Risks / trade-offs

- **TraceStore eviction.** The bounded in-memory store can 404 an old `trace_id`; the
  loader returns an explicit `expired` result so every caller (022 UI, 018, 020) handles
  it uniformly — no crash, no faked data.
- **Cache staleness.** Traces are immutable once finished, so memoizing by `trace_id` is
  safe; the cache is in-memory (resets on reload, §8).
- **Hot store files.** `useSimulator`/`useChat`/`ChatPanel` overlap 016 and 018 — 022 is
  wave 1 (enabler), 018 wave 2, 016 wave 3, so they don't edit these simultaneously.
- **AC4 coupling.** Hover emphasis reuses 014's plumbing; kept secondary so 022 lands
  first.

# Plan: Visualize a WAF block

> The HOW. Respects `.specify/constitution.md`. No new `Stage`; a block is a
> store-level **outcome**, not fabricated events. Mostly frontend + one infra (CORS).

## Approach

A block has no server trace, so we model it as a distinct FE **outcome**:

1. **Detect** — the chat `POST /api/chat` (the fetch-based SSE client in
   `lib/sse.ts`) classifies an **HTTP 403** response as a WAF block (vs. a generic
   stream error). It surfaces a typed `WafBlocked` signal instead of throwing a bare
   error.
2. **Hold** — the store (`useSimulator`) keeps a `blocked: BlockedOutcome | null`
   (`{ at: "waf", httpStatus, message, detail? }`), set when a send is blocked and
   cleared on the next send / reset. It is **not** pushed into the `events` log
   (AC5 — no fake events).
3. **Project** — `deriveView` honors `blocked`: stations **up to the WAF**
   (frontend, dns, cdn, lb) render *reached*; the **WAF** renders *blocked*; every
   station **downstream** (apigw, backend, agent, data tier) renders *not-reached*.
4. **Render** — `FlowCanvas` gives the WAF a blocked marker (🛡️✋ / its warn accent);
   the **WAF drill-in** shows verdict=blocked + HTTP 403 + engine + the "never
   reached the backend" note (reads the `blocked` outcome, since there's no `waf`
   event); the **chat bubble** shows the bilingual "blocked by the WAF" message.

**CORS on the 403 (key risk).** ModSecurity's 403 is cross-origin to the FE
(`:5173` → the chain front door `:8090`) and may lack CORS headers, so the browser
could reject the response before the FE reads `status === 403`. The front door
(**Varnish**) adds an `Access-Control-Allow-Origin` header on responses when absent
(so the 403 is readable). If a deployment can't guarantee it, the FE degrades to an
honest "blocked or unreachable" outcome — still stopping the canvas at the WAF.

Alternative considered: synthesize `TraceEvent`s for the blocked walk. **Rejected**
(AC5) — it would fake server events the backend never emitted; an outcome model is
honest and keeps the event log server-sourced.

## Affected files

**Frontend**
- `frontend/src/lib/sse.ts` — detect `403` → emit a typed `WafBlocked` signal.
- `frontend/src/store/useSimulator.ts` — `blocked` state + set/clear in the send flow.
- `frontend/src/lib/derive.ts` — `deriveView(events, cursor, blocked?)` honors the
  blocked outcome (station statuses); add a `"blocked"` station status (or reuse the
  existing error status with a blocked flag).
- `frontend/src/components/FlowCanvas.tsx` — blocked-station styling/marker; keep the
  `StationId` switches exhaustive.
- `frontend/src/components/NetworkApplianceDetail.tsx` — WAF blocked branch (reads
  the `blocked` outcome; verdict/403/engine/note).
- chat rendering (`components/ChatPanel.tsx` / `lib/chatStatus.ts` / `Thread`) — the
  blocked bubble state.
- `frontend/src/types/events.ts` — a FE-only `BlockedOutcome` type (no protocol change).
- `frontend/src/i18n/strings.ts` — blocked messages/labels, en + pt.

**Infra**
- `infra/varnish/default.vcl` — ensure an `Access-Control-Allow-Origin` response
  header (when absent) so the cross-origin 403 is readable by the FE.

**Backend** — none (the block happens in the chain; the backend never runs). Verified
by the absence of any `backend/` diff.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` shape change. The block reuses the `waf`
station and the existing `status: "blocked"` vocabulary; `BlockedOutcome` is a
FE-only store type. `STAGE_TO_STATION`/`STAGE_TO_PHASE` untouched.

## Data model changes

None (AC: blocked attempts are **not** persisted).

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `chat.wafBlocked` | Blocked by the WAF (403) — the request never reached the agent. | Bloqueado pelo WAF (403) — a requisição não chegou ao agente. |
| `networkDetail.waf.blockedNote` | Stopped here by the WAF — it never reached the backend. | Barrado aqui pelo WAF — não chegou ao backend. |
| `readout.wafBlocked` (HUD/canvas) | blocked · 403 | bloqueado · 403 |

(Exact final wording lives in the code.)

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 detect 403 | `sse.ts` send → a mocked 403 response yields a `WafBlocked` signal | `frontend/src/lib/sse.test.ts` |
| AC2 canvas stops at WAF | `deriveView(..., blocked)` → waf=blocked, downstream not-reached, up-to-WAF reached | `frontend/src/lib/derive.test.ts` |
| AC3 WAF drill-in | blocked outcome → drill-in shows verdict blocked + 403 + note | `NetworkApplianceDetail.test.tsx` |
| AC4 chat bubble | blocked outcome → bilingual blocked message rendered | chat test |
| AC5 no fake trace | a block adds nothing to `events`; `blocked` lives only in the store | store/derive test |
| AC6 inert without chain | a normal (200/stream) run is unchanged | existing send/stream tests |
| CORS (infra) | varnish vcl includes an `Access-Control-Allow-Origin` directive | `backend/tests/test_network.py` config-audit |

Structural assertions, deterministic (mocked fetch / seeded outcome). The live 403 +
CORS behaviour is verified manually with `docker compose up` (CI has no Docker);
config-audit pins the varnish directive.

## Risks / trade-offs

- **CORS on the 403** is the main feasibility risk (above). Mitigated by the Varnish
  header + an honest degraded state; verified on `docker compose up`.
- **403 attribution** — any 403 from the chat endpoint is treated as a WAF block
  (there is no auth in this app, so the WAF is the only 403 source); noted honestly.
- **Reached-but-no-evidence** — DNS/CDN/LB show "reached" without per-request
  evidence on a block (they don't forward it); the drill-ins say so rather than
  inventing values.
- Threading `blocked` into `deriveView` must not regress the normal path (guard:
  `blocked == null` reproduces today's projection exactly — AC6).

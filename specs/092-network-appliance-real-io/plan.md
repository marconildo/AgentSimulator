# Plan: Network appliance drill-in — real IN

> The HOW. Respects `.specify/constitution.md`. FE-only, pure projection, no new
> `Stage`, no backend, no protocol change.

## Approach

The real inbound request is already in the trace: the `frontend` END event carries
`data.message` and `data.request` (the `ChatRequest` body) — the same data
`hopDetail.ts::requestParts` reads for the frontend→backend hop. Reuse it.

Add a tiny pure selector `selectInboundRequest(events)` (cursor-bounded, returns
`{ message?, requestBody? }` or `undefined`) and feed the appliance drill-in's IN
section from it:

- **DNS** — IN leads with the real host queried (the appliance's own `host` value),
  drop the generic sentence.
- **CDN / WAF / TLS-LB / API-GW** — IN shows the real **request line**
  (`POST /api/chat`, the known chat endpoint) + the user's **message** (truncated).
  Optionally one or two compact request fields (`top_k`, `model`) if present.

The request line `POST /api/chat` is a real constant (the only endpoint the FE POSTs
to — `lib/sse.ts`), so it is honest, not fabricated. The message/body come straight
from the event. When no `frontend` event is present at the cursor, IN falls back to
the honest empty/placeholder (AC4).

Alternative considered: pull the method/path from the event. The event doesn't carry
them explicitly, so we use the known endpoint constant rather than invent a field —
simpler and equally honest.

## Affected files

**Frontend (only)**
- `frontend/src/lib/stationDetail.ts` — add `selectInboundRequest(events)` (pure,
  reads the latest `frontend` END event's `message` + `request`).
- `frontend/src/components/NetworkApplianceDetail.tsx` — replace the generic IN
  (`inDesc`) with the real request (HTTP appliances) / the host headline (DNS);
  keep OUT + reconstructed log + verbatim headers untouched.
- `frontend/src/i18n/strings.ts` — add the IN labels (`requestLine`, `message`),
  en + pt; the old per-appliance `inDesc` stays as a secondary hint or is dropped.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent`; no `schemas.py` ↔ `events.ts` edit; no new
exhaustive-map case.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `networkDetail.requestLine` | Request | Requisição |
| `networkDetail.message` | Message | Mensagem |
| `networkDetail.noRequest` | No request captured at this point yet. | Nenhuma requisição capturada até aqui ainda. |

(Exact final wording lives in the code; DNS reuses the existing `dns.host` label.)

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 real request IN (HTTP) | seed a `frontend` event (message + request) + a `waf`/`cdn` event → IN shows `POST /api/chat` + the message | `NetworkApplianceDetail.test.tsx` |
| AC2 host IN (DNS) | DNS drill-in leads with the host value, no generic sentence | `NetworkApplianceDetail.test.tsx` |
| AC3 pure projection | `selectInboundRequest` reads only the `frontend` event and respects the slice | `stationDetail` unit test (or component) |
| AC4 honest empty | no `frontend` event at cursor → IN shows the empty/placeholder | `NetworkApplianceDetail.test.tsx` |
| AC5 OUT/log/headers intact | existing 091 assertions still pass | `NetworkApplianceDetail.test.tsx` |
| AC6 bilingual/default | new labels in en + pt; layout unaffected when network off | i18n + existing layout tests |

Structural assertions (text presence/absence); deterministic, no model calls.

## Risks / trade-offs

- The IN request line is the same across the four HTTP appliances (it's the same
  request) — that's correct; the per-appliance difference lives in OUT. We make this
  legible by keeping each appliance's distinct OUT + summary.
- Truncating the message keeps the box compact; full text remains in the verbatim
  headers / the chat itself.
- WAF 403 capture stays out (deferred) — without it, a blocked request still won't
  appear in the drill-in; that's an honest limitation noted in the spec.

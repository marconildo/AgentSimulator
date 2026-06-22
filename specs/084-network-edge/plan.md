# Plan: Network edge (real reverse proxy / LB / TLS) — expandable box

> The HOW. Written after `spec.md` is `clarified`. Decisions respect every principle in
> `.specify/constitution.md`.

## Approach

A real `nginx` reverse proxy is added to `docker-compose` **in front of** the backend: it
terminates TLS, load-balances, and injects standard forwarded headers (`X-Forwarded-For`,
`X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Real-IP`, `X-Request-Id`) before proxying to
`backend:8000`. The frontend talks to nginx, not the backend directly.

The backend learns about the edge **only from those headers** — it never assumes a proxy. A small
pure helper parses the incoming `Request` into an `EdgeInfo` (`proxied`, `tls`, `client_ip`,
`request_id`, `scheme`, `proxy_server`, `forwarded_host`). When `ChatRequest.edge` is true, the
pipeline emits a single new `Stage.EDGE` (START + END) **before** `BACKEND`, carrying that info.
With no proxy the same helper yields `proxied=false` + the socket peer IP — honest, not faked.
When `edge` is false (default for a bare API call), nothing new is emitted (AC3, byte-for-byte).

On the frontend, the edge is one new `edge` **station** in a new `edgeTier` between the client and
API tiers. It reuses the existing `StationNode` ⊕ inline-expansion pattern: collapsed = compact
tag; expanded = the chain **DNS → CDN → WAF → TLS/LB → API Gateway**, where only the TLS/LB segment
binds to real `edge`-event data and the rest are `comingSoon`-style preview segments (§3). It is an
optional `ComponentId` in the 061 selection (default-on); `visibleStationsFor` shows it iff selected
and re-routes the client→backend hop through it.

**Alternative considered & rejected:** modelling CDN/WAF/DNS as separate real stations now. Rejected
— the user asked for *one expandable box*, and those parts can't run honestly on a laptop; they stay
internal preview segments and graduate to their own specs later.

## Affected files

**Backend**
- `backend/app/schemas.py` — add `Stage.EDGE`; add `ChatRequest.edge: bool = False`.
- `backend/app/edge.py` *(new)* — `EdgeInfo` dataclass + `read_edge(request) -> EdgeInfo` pure
  header-parsing helper (the only unit-testable seam; no I/O).
- `backend/app/main.py` — when `req.edge`, open an `emitter.stage(Stage.EDGE, …)` populated from
  `read_edge(request)` **before** the `BACKEND` stage opens; pass the FastAPI `Request` through.
- `docker-compose.yml` — new `edge` (nginx) service fronting `backend`; frontend `VITE_API_BASE`
  retargeted at the proxy; backend no longer published directly (or kept for dev).
- `infra/nginx/nginx.conf` *(new)* — reverse proxy: TLS termination (self-signed for local),
  `proxy_set_header X-Forwarded-* / X-Request-Id`, upstream `backend:8000`.

**Frontend**
- `frontend/src/types/events.ts` — mirror `Stage.EDGE`; add `edge` to the request payload type;
  add an `EdgeData` shape for the END `data`.
- `frontend/src/lib/stations.ts` — new `edgeTier`; new `edge` station (bilingual title/subtitle/
  blurb/why/whatBreaks/tech + `clouds`); new hops client→edge, edge→backend; drop the direct
  client→backend hop when edge is visible; map `Stage.EDGE` into the `edge` station's `stages`;
  include `edge` in `relabel`/visibility helpers as needed.
- `frontend/src/lib/selection.ts` — new optional `ComponentId` `edge` (default-on); resolve into
  `visibleStationsFor`/`visibleHopsFor`/`visibleTiersFor`.
- `frontend/src/lib/layout.ts` — geometry for the edge tier/station in the middle column above the
  API tier; reflow + boundary recompute.
- `frontend/src/lib/phases.ts` — add `Stage.EDGE` to `STAGE_TO_PHASE` (phase: `request`/ingress).
- `frontend/src/components/FlowCanvas.tsx` — `case "edge"` in `readoutFor` (proxied vs direct);
  render the compact tag + ⊕ expanded chain with preview markers.
- `frontend/src/components/InspectorPanel.tsx` — `case "edge"` in `renderDetail` (theory + real
  header readout).
- `frontend/src/components/ScenarioBuilder.tsx` — edge toggle in the Build popover.
- `frontend/src/lib/experiment.ts` (`useExperiment`) — carry `edge` into the request.
- `frontend/src/i18n/strings.ts` (+ glossary) — new chrome/glossary strings, en + pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `class Stage: … EDGE = "edge"` (between `FRONTEND` and `BACKEND`);
  `ChatRequest.edge: bool = False` with a docstring matching the `rerank`/`hybrid` convention.
- `frontend/src/types/events.ts` — add `"edge"` to the `Stage` union; add `edge?: boolean` to the
  request type; add `EdgeData` (`proxied`, `tls`, `client_ip`, `request_id`, `scheme`,
  `proxy_server?`, `forwarded_host?`).
- Emitted in: `backend/app/main.py` (the request handler, before the `BACKEND` stage).
- Mapped to station in `frontend/src/lib/stations.ts`: `edge`.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) case added: **yes** (`case "edge"`).

## Data model changes

None. No Chroma change, no SQLite schema change. The `edge` event persists through the existing
`trace_events` path (048) like any other `TraceEvent` — no migration.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `edgeTier.alias` | Edge | Borda |
| `edgeTier.generic` | Network edge / ingress (reverse proxy · TLS · LB) | Borda de rede / ingress (reverse proxy · TLS · LB) |
| `station edge.title` | Network Edge | Borda de Rede |
| `station edge.subtitle` | Reverse proxy · TLS termination · load balancing | Reverse proxy · terminação TLS · balanceamento |
| `station edge.blurb` | The first hop in production: TLS is terminated, traffic is load-balanced, and forwarded headers are added before the app sees the request. | O primeiro hop em produção: o TLS é terminado, o tráfego é balanceado e headers de encaminhamento são adicionados antes de o app ver a requisição. |
| `station edge.why` | Never expose the app server directly — the edge handles TLS, LB and forwarding. | Nunca exponha o servidor da aplicação direto — a borda cuida de TLS, LB e encaminhamento. |
| `station edge.whatBreaks` | DNS/CDN/WAF here are preview only; this demo runs a real nginx but no CDN/WAF. | DNS/CDN/WAF aqui são apenas prévia; este demo roda um nginx real, mas sem CDN/WAF. |
| readout `proxied` | proxied via {server} · {scheme} | via proxy {server} · {scheme} |
| readout `direct` | direct access — no edge | acesso direto — sem borda |
| preview seg `dns` | DNS · preview | DNS · prévia |
| preview seg `cdn` | CDN · preview | CDN · prévia |
| preview seg `waf` | WAF · preview | WAF · prévia |
| preview seg `apigw` | API Gateway · preview | API Gateway · prévia |
| build toggle `edge` | Network edge | Borda de rede |
| glossary `Reverse proxy` | A server in front of the app that terminates TLS, load-balances and forwards requests. | Um servidor à frente do app que termina o TLS, balanceia e encaminha as requisições. |
| glossary `TLS termination` | Where HTTPS is decrypted, at the edge, before the request reaches the app. | Onde o HTTPS é descriptografado, na borda, antes de a requisição chegar ao app. |
| glossary `Forwarded headers` | Headers (X-Forwarded-For/Proto, X-Request-Id) the proxy adds so the app knows the real client and scheme. | Headers (X-Forwarded-For/Proto, X-Request-Id) que o proxy adiciona para o app saber o cliente e o esquema reais. |

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| `edgeTier` | Network edge / ingress | Front Door / Application Gateway (WAF) | CloudFront + ALB (AWS WAF) | Cloud Load Balancing + Cloud CDN (Cloud Armor) |
| `edge` station | Reverse proxy / load balancer · TLS termination | Application Gateway | Application Load Balancer | Cloud Load Balancing |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | request with forwarded headers → one `edge` stage before `backend`, `proxied/tls/client_ip/request_id` from headers | `backend/tests/test_edge.py` |
| AC2 | no headers → `edge` fires `proxied=false`, socket-peer IP, no fabricated proxy id | `backend/tests/test_edge.py` |
| AC3 | `edge=false`/omitted → no `edge` event; other stages byte-for-byte | `backend/tests/test_edge.py` |
| AC4 | `Stage.EDGE` in schemas + events mirror; `ChatRequest.edge` defaults False | `backend/tests/test_edge.py` + `frontend/src/types/events.test.ts` (or existing mirror test) |
| AC5 | `STAGE_TO_STATION` + `STAGE_TO_PHASE` total incl. `edge`; phases parity | `frontend/src/lib/phases.test.ts` (extend) |
| AC6 | `visibleStationsFor`/`visibleHopsFor`: edge present iff selected; client→backend re-routed | `frontend/src/lib/stations.test.ts` |
| AC7 | derive/readout: collapsed tag + expanded chain, TLS/LB real vs preview segs; exhaustive switches | `frontend/src/lib/derive.test.ts` + component test |
| AC8 | every new tier/station string has en+pt; cloud map filled | `frontend/src/lib/stations.test.ts` (i18n/cloud audit) |
| AC9 | `read_edge` helper parses headers correctly; `nginx.conf` + compose service present | `backend/tests/test_edge.py` + a config-presence assertion |

`[openai]`-marked agent tests are unaffected (the edge stage is independent of the model). The edge
unit tests are **keyless** (pure header parsing) so they run in CI without a key.

## Risks / trade-offs

- **Determinism:** `client_ip`/`request_id` are run-dependent → tests assert **structure**
  (keys present, `proxied` bool, equality to the *injected* header in the test), never exact IPs.
- **Single-instance (§7):** the LB is real but fronts one backend; we do **not** claim multi-replica
  — `whatBreaks` says so honestly.
- **Demo fixtures (058):** old captured traces have no `edge` events; the station must render an
  empty/preview state gracefully (no crash). Re-capture is a follow-up (standing directive).
- **Default canvas changes:** edge is default-on in the Build selection, so the default view gains a
  box. The *protocol* stays conservative (`edge` defaults False at the schema), so API/tests/old
  clients are byte-for-byte; only the FE default selection opts in.
- **Compose/TLS in CI:** CI can't run the full nginx stack, so AC9 is covered by the pure helper
  test + config-presence assertion, with the end-to-end path verified manually via `docker compose`.

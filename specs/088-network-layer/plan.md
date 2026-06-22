# Plan: Real network layer (DNS → CDN/Cache → WAF → TLS/LB → API-GW)

> The HOW. Written after `spec.md` is `clarified`. Decisions here respect every principle
> in `.specify/constitution.md`. The chain is real infra that comes up with `docker compose
> up`; the Build toggle is **visualization/emission only** (no container lifecycle, no
> `docker.sock`) — the same honesty seam as the existing `edge` toggle.

## Approach

A request in production never goes browser→app; it transits a chain of network appliances.
We make that chain **real**: five separately-deployed Docker containers the request truly
crosses, each reporting honest per-appliance evidence — mirroring exactly how the existing
084 `edge` reads forwarded headers from the real nginx. The five appliances and their real
images:

| # | Station | Container (real image) | Real job | Honest evidence it yields |
|---|---|---|---|---|
| 1 | DNS | `coredns/coredns` | Resolves the next-hop service name for the chain (Docker network resolver) | resolved A-record + TTL (from a real lookup) |
| 2 | CDN/Cache | `varnish` | HTTP edge cache in front of the app | `X-Cache: HIT/MISS`, age |
| 3 | WAF | `owasp/modsecurity-crs:nginx` | OWASP CRS rule engine | clean / `blocked` + rule id + anomaly score; **real 403 on attack** |
| 4 | TLS/LB | `haproxy` | TLS termination + load-balance to the (single) backend | TLS version, chosen upstream, `X-Forwarded-*` |
| 5 | API-GW | `kong:*` (DB-less, declarative) | Routing + rate-limit + key auth | route name, `X-RateLimit-Remaining`, consumer |

**Topology (real transit).** When the chain is up the browser enters at the **front door**
(Varnish, a new host port e.g. `:8090`); the request flows `Varnish → ModSecurity → HAProxy
→ Kong → backend:8000`. CoreDNS is the **resolver** those containers use to find each other
by name (the chain's Docker network sets `dns:` to CoreDNS), so DNS is genuinely exercised —
we are honest that this is *internal* service resolution, not the browser's resolver (the
browser still uses the host's DNS; §3 honesty). Each appliance injects a small evidence
header (Varnish `X-Cache`, HAProxy `X-Forwarded-*`/`X-LB-Upstream`, Kong `X-Kong-*`/rate-limit,
plus an `X-DNS-*` resolution header added by the entry hop); the backend reads them back —
**reporting only what the headers prove**, exactly like `edge.py` does today.

**Emission.** The five stages fire server-side, in order, between `FRONTEND` and `BACKEND`,
only when the chain is detected (evidence headers present) **and** the request opted into the
network component. A new `backend/app/network.py` holds five pure header-readers (the
`edge.py` pattern, one `*Info` dataclass per appliance) so they unit-test without Docker.

**Lifecycle = `docker compose up`, NOT the toggle (revised decision).** The five containers
are regular compose services that come up with `docker compose up` (always real infra in
front of the backend when the stack runs). The Build "Network" component does **not** start
or stop them — it controls only **visualization + emission**: on → draw the five stations +
emit their stages; off → hide + suppress (the request still physically crosses the real
chain, exactly like the existing `edge` toggle). The availability gate
(`/api/config.network_available`) is "**is the chain present**" — the compose stack sets an
env flag (`NETWORK_CHAIN=1`) on the backend service (the same `docker compose up` that brings
the chain up sets it), so bare `uvicorn` reports `false` and the toggle is disabled. No
`docker.sock`, no up/down endpoints, no provisioning state — this removes the whole
Docker-daemon-control seam.

**Frontend.** `network` becomes a real `ComponentId` with an `advanced` floor and five
stations in a new `edge` tier between client and api. Because it maps to *five* stations
(every other component maps to ≤1), `resolveStations` special-cases it (`NETWORK_STATIONS`).
The ScenarioBuilder checkbox reads `network_available` from `/api/config` (disabled + tooltip
when `false`); when available it is an ordinary toggle over the pure `selection` store (no
lifecycle store needed). The frontend's API base already targets the chain front door in the
compose build (`VITE_API_BASE`), so requests genuinely transit the chain whether or not the
toggle is on.

## Affected files

**Backend**
- `backend/app/schemas.py` — five new `Stage` members (`DNS`, `CDN`, `WAF`, `LB`, `APIGW`); extend `ChatRequest` with `network: bool = False`.
- `backend/app/network.py` — **new**: five pure `*Info` dataclasses + `read_*` header-parsers (mirrors `edge.py`); a `network_available()` check that reads the `NETWORK_CHAIN` env flag (set by the compose stack). No Docker control, no lifecycle.
- `backend/app/config.py` — add the `network_chain` setting (env `NETWORK_CHAIN`, default `False`).
- `backend/app/main.py` — emit the five stages (reading `network.py` parsers) before `BACKEND`, gated on `request.network` + evidence present; surface `network_available` in `/api/config`. **No** `/api/network/*` endpoints.
- `backend/app/edge.py` — unchanged (the TLS/LB station reuses its forwarded-header logic; no behavioural change).

**Frontend**
- `frontend/src/types/events.ts` — mirror the five `Stage`s + their `data` shapes (`DnsData`/`CdnData`/`WafData`/`LbData`/`ApiGwData`).
- `frontend/src/lib/selection.ts` — add `network` to `ComponentId`, `ALL_COMPONENTS`, `COMPONENT_IS_REAL` (`true`), `COMPONENT_FLOOR` (`advanced`); `NETWORK_STATIONS` + special-case in `resolveStations`. The availability gate (disable when `!network_available`) is enforced in the builder reading `/api/config`, not here — no lifecycle store.
- `frontend/src/lib/stations.ts` — five new stations (`dns`/`cdn`/`waf`/`lb`/`apigw`) in a new `edge` `TierId`; new hops `frontend→dns→cdn→waf→lb→apigw→backend`; `STAGE_TO_STATION` entries; `clouds` maps; `why`/`controls`/`generic` text en+pt.
- `frontend/src/lib/phases.ts` — `STAGE_TO_PHASE` entries for the five (same `TimelinePhase` as `EDGE`).
- `frontend/src/components/ScenarioBuilder.tsx` — render the `network` component (advanced group); disabled+tooltip when unavailable; spinner while provisioning; wire to `useNetwork`.
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` cases for the five stations.
- `frontend/src/components/InspectorPanel.tsx` — `renderDetail` cases for the five stations.
- `frontend/src/lib/layout.ts` — geometry for the new `edge` tier + five stacked stations.
- `frontend/src/lib/chatApi.ts` — `network` in the request; `network_available` in `AppConfig`.
- `frontend/src/i18n/strings.ts` — Build entry label/blurb + disabled tooltip.

**Infra**
- `docker-compose.yml` — five new services (coredns, varnish, modsecurity, haproxy, kong) that come up with `docker compose up`, wired DNS→CDN→WAF→LB→GW→backend; the browser-facing front door (Varnish) takes the published port the frontend targets; backend service gets `NETWORK_CHAIN=1`. (Optional: a `profiles:` guard so a lighter base run is possible — noted, default is always-up per the decision.) **No `docker.sock` mount.**
- `infra/coredns/Corefile`, `infra/varnish/default.vcl`, `infra/modsecurity/*`, `infra/haproxy/haproxy.cfg`, `infra/kong/kong.yml` — **new** per-appliance configs.
- The legacy standalone `nginx` `edge` service is superseded by the chain's HAProxy/Kong front-of-backend (reconcile in T21; the 084 `edge` Stage still emits from forwarded headers).

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — add `DNS="dns"`, `CDN="cdn"`, `WAF="waf"`, `LB="lb"`, `APIGW="apigw"` to `Stage`; `ChatRequest.network: bool = False`.
- `frontend/src/types/events.ts` — mirror the five `Stage`s + the five `*Data` payload interfaces.
- Emitted in: `backend/app/main.py` (between `FRONTEND` and `BACKEND`, from `network.py` parsers).
- Mapped to stations in `frontend/src/lib/stations.ts`: `dns→dns`, `cdn→cdn`, `waf→waf`, `lb→lb`, `apigw→apigw` (one each in `STAGE_TO_STATION`).
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) cases added: **yes**, five each.
- `STAGE_TO_PHASE` (phases.ts): five entries (same phase as `EDGE`).

## Data model changes

None. No vector-store or SQLite schema change (the chain is request-time + infra only). The
existing `trace_events` table persists the five new stages with no migration (it is
denormalized over `Stage`). `EXPECTED_TABLES`/`EXPECTED_CLEAR_KEYS` unchanged.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| Build `network` label | Network | Redes |
| Build `network` blurb | Real ingress chain: DNS · CDN · WAF · TLS/LB · API-Gateway | Cadeia de entrada real: DNS · CDN · WAF · TLS/LB · API-Gateway |
| disabled tooltip | Available only when running the full Docker stack (the backend must be able to start the network containers). | Disponível apenas rodando o stack Docker completo (o backend precisa conseguir subir os containers de rede). |
| provisioning note | Starting the network containers… | Subindo os containers de rede… |
| error note | Couldn't start the network chain. | Não foi possível subir a cadeia de rede. |
| station `dns` title/blurb | DNS — resolves the service name to an address (A record + TTL). | DNS — resolve o nome do serviço para um endereço (registro A + TTL). |
| station `cdn` title/blurb | CDN / Edge cache — serves cached responses (HIT) or forwards (MISS). | CDN / Cache de borda — serve respostas em cache (HIT) ou encaminha (MISS). |
| station `waf` title/blurb | WAF — OWASP rules inspect the request; attacks are blocked (403). | WAF — regras OWASP inspecionam a requisição; ataques são bloqueados (403). |
| station `lb` title/blurb | TLS / Load Balancer — terminates TLS and balances to the backend. | TLS / Balanceador — termina o TLS e balanceia para o backend. |
| station `apigw` title/blurb | API Gateway — routing, rate-limit and API-key at the edge. | API Gateway — roteamento, rate-limit e chave de API na borda. |
| five `readoutFor` strings | (DNS host+TTL · cache HIT/MISS · WAF clean/blocked · TLS+upstream · route+rate-limit) | (idem, traduzidos) |
| five `why`/`controls` (hops) | per-appliance role + control text | idem |

(Full readout/why/control prose enumerated in `tasks.md` as each station is built.)

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| tier `edge` | Network edge | Front Door / App Gateway | CloudFront / ALB | Cloud CDN / Cloud LB |
| `dns` | DNS resolver | Azure DNS | Route 53 | Cloud DNS |
| `cdn` | CDN / edge cache | Azure CDN / Front Door | CloudFront | Cloud CDN |
| `waf` | Web App Firewall | Azure WAF (Front Door) | AWS WAF | Cloud Armor |
| `lb` | TLS / Load balancer | Application Gateway | ALB / NLB | Cloud Load Balancing |
| `apigw` | API gateway | API Management | API Gateway | API Gateway / Apigee |

## Test strategy (constitution §9 — TDD)

Structural + pure where possible (no Docker needed for most); the two Docker-dependent ACs
get a `@pytest.mark.network` / Vitest integration test skipped unless the chain is up (the
`@pytest.mark.openai` pattern).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 default off + toggle | selection: `network` absent by default; toggle adds/removes | `frontend/src/lib/selection.test.ts` |
| AC2 advanced floor | `classify` → `advanced` when `network` enabled | `frontend/src/lib/selection.test.ts` |
| AC3 disabled when unavailable | builder renders disabled checkbox + tooltip when `network_available=false` | `frontend/src/components/ScenarioBuilder.test.tsx` |
| AC4 five stations in order | `resolveStations`/`visibleStationsFor` show the five between frontend/backend; hidden when off | `frontend/src/lib/stations.test.ts` |
| AC5 five stages, real evidence | `network.py` parsers map real headers → `*Info`; emitter fires five stages in order | `backend/tests/test_network.py` |
| AC6 real WAF 403 | `@network` integration: SQLi → 403 from ModSecurity; benign → reaches backend | `backend/tests/test_network_waf.py` |
| AC7 exhaustive maps total | `STAGE_TO_STATION`/`STAGE_TO_PHASE` parity; tsc clean | `frontend/src/lib/phases.test.ts` + `tsc` |
| AC8 protocol mirror | schemas.py ↔ events.ts parity (the existing mirror test) | `backend/tests/test_protocol_mirror*` |
| AC9 cloud map + bilingual | every new station has azure/aws/gcp + en/pt; i18n auditor | `frontend/src/lib/stations.test.ts` |
| AC10 off = no regression | with `network` off, stage stream + visible stations identical to baseline | `backend/tests/test_agent.py` + `stations.test.ts` |
| AC11 compose up | compose defines the 5 services that come up with `docker compose up`; front door reachable | `backend/tests/test_network.py` (config-level) + manual `verify` |
| AC12 visualization-only | with chain present, `network` off ⇒ stages suppressed + stations hidden (= baseline); on ⇒ emitted/drawn; no container side-effects | `backend/tests/test_network.py` + `stations.test.ts` |

## Risks / trade-offs

- **No Docker-socket seam (the big risk is gone).** The revised decision — chain comes up with `docker compose up`, toggle is visualization-only — means the backend never controls Docker. No `docker.sock`, no host-root exposure. The toggle's only effect is what's drawn/emitted, identical in kind to the existing `edge` toggle.
- **§7 single-instance holds.** The LB fronts the *one* backend (a one-node upstream pool); no replicas, no shared state. We label it honestly as load-balancing to a single upstream, not horizontal scale.
- **Browser DNS honesty (§3).** CoreDNS resolves *internal* service names for the chain, not the browser's lookups — the DNS station says so; we don't pretend the browser used CoreDNS.
- **CI can't run the chain.** AC6/AC11 integration tests are Docker-gated and skipped in the standard CI job (like `@openai`); the pure parser/selection/station tests carry the gate logic so coverage stays high without Docker. Note in `ci.yml` whether a separate compose-based job runs them.
- **Base-compose weight.** Five extra containers come up with every `docker compose up`. Acceptable (it's the explicit decision), but a `profiles:` guard is a trivial future opt-out if the base run should stay light.
- **SSE through the chain.** The stream must survive Varnish→ModSecurity→HAProxy→Kong (buffering off / pass-through, like the nginx edge) or token streaming breaks — verify in T23.
- **Scope.** Five real appliances is large; `tasks.md` builds the skeleton + the availability gate + **one** appliance (WAF) end-to-end first (proves the pattern red→green), then the other four reuse it.

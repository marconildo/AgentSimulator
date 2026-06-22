# Plan: WAF after the load balancer + honest CDN bypass

> The HOW. Respects `.specify/constitution.md`. No constitution amendment needed
> (no new Stage, no single-provider change).

## Approach

The transit order lives in **three** places that must move together; the
header-reading (`network.py`) is order-independent, so it does **not** change:

1. **The real container chain** (docker-compose + the proxy configs) — reorder so
   the request truly crosses `varnish → haproxy → modsecurity → kong → backend`.
2. **The backend emission order** (`main.py`) — emit `LB` before `WAF`.
3. **The frontend visual model** (`stations.ts` hops + `layout.ts` column order).

Because no `Stage` is added or removed, this is a low-risk reorder: `schemas.py`,
`events.ts`, `STAGE_TO_STATION`, `STAGE_TO_PHASE` and the exhaustive switches all
stay as-is. The WAF-cleared attestation (`X-Waf-Status`) moves from HAProxy (which
is now *upstream* of the WAF and can no longer attest it) to **Kong** (now the
first hop *downstream* of the WAF). The CDN bypass fix is a Varnish label change
(`BYPASS` on the uncacheable path) that `read_cdn` already passes through verbatim.

Alternative considered: reorder only the picture, leave the real chain as-is.
**Rejected** — it would make the canvas lie about the real transit order (§2/§3).

## Affected files

**Infra (the real chain — constitution §2 "everything is real")**
- `docker-compose.yml` — reorder `depends_on` and the WAF upstream env:
  `varnish.depends_on: haproxy`; `haproxy.depends_on: modsecurity`;
  `modsecurity.BACKEND: "http://kong:8000"` + `modsecurity.depends_on: kong`;
  `kong.depends_on: backend`. Update the chain comment to the new order.
- `infra/varnish/default.vcl` — backend `.host = "haproxy"`, `.port = "8081"`;
  on the uncacheable pass path stamp `X-Cache = "BYPASS"` (keep `MISS` only for a
  real cacheable GET miss); update the comment to "forwards to the load balancer".
- `infra/haproxy/haproxy.cfg` — `default_backend` → `modsecurity:8080`; **remove**
  the `X-Waf-Status`/`X-Waf-Engine` stamping (HAProxy is now *before* the WAF) and
  the "anything here cleared the WAF" comment; point `X-Lb-Upstream`/`X-Dns-Host`
  at the new next hop (`modsecurity`).
- `infra/kong/kong.yml` — add the WAF-cleared evidence to the `request-transformer`
  (`X-Waf-Status:clean`, `X-Waf-Engine:modsecurity`): Kong is the first hop past
  ModSecurity, so reaching Kong proves the request cleared the WAF.

**Backend**
- `backend/app/main.py` — reorder the ingress emission tuple to
  `(DNS, CDN, LB, WAF, APIGW)`; the `LB` label keeps "TLS terminated", the `WAF`
  label stays "OWASP rules inspected".

**Frontend**
- `frontend/src/lib/stations.ts` — rewire `HOPS_SRC`: replace `cdn→waf`, `waf→lb`,
  `lb→apigw` with `cdn→lb`, `lb→waf`, `waf→apigw`; set protocols so `cdn→lb` is
  HTTPS/TLS 1.3 and `lb→waf`/`waf→apigw` are HTTP; rewrite the `why`/`detail` prose
  (en+pt) for the new order; move the "terminates TLS" wording onto the `cdn→lb`
  (into-LB) hop only; update the CDN station prose to the uncacheable-bypass story.
- `frontend/src/lib/layout.ts` — `NETWORK_IDS = ["dns","cdn","lb","waf","apigw"]`.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed; no `schemas.py` ↔
`events.ts` edit; no new `readoutFor`/`renderDetail`/`STAGE_TO_PHASE` case.

## Data model changes

None (no Chroma or SQLite change).

## i18n strings (constitution §4)

Edited prose (all already `{en, pt}` objects in `stations.ts`):

| key / location | en | pt |
|---|---|---|
| hop `cdn→lb` why/detail | CDN edge passes the uncacheable request to the load balancer, which terminates TLS (single decryption point) and balances onto a backend, adding X-Forwarded-*. | A borda da CDN entrega a requisição não-cacheável ao balanceador, que termina o TLS (único ponto de decriptação) e balanceia para um backend, adicionando X-Forwarded-*. |
| hop `lb→waf` why/detail | Now decrypted (HTTP), the request is screened by the WAF (OWASP CRS) — attacks get a 403, clean traffic passes. ModSecurity can only inspect plaintext, so it sits after TLS termination. | Já decriptada (HTTP), a requisição é triada pelo WAF (OWASP CRS) — ataques levam 403, tráfego limpo passa. O ModSecurity só inspeciona texto claro, então fica depois da terminação do TLS. |
| hop `waf→apigw` why/detail | Clean traffic continues to the API gateway, which routes by path, enforces rate limits and API keys before forwarding to the backend. | Tráfego limpo segue ao API gateway, que roteia por path, aplica rate limits e chaves de API antes de encaminhar ao backend. |
| CDN station why/danger + readout note | The chat API is dynamic and uncacheable, so the CDN never caches it — every request is a BYPASS, passed straight to the chain (a static GET could be a real HIT). | A API de chat é dinâmica e não-cacheável, então a CDN nunca a cacheia — toda requisição é um BYPASS, passada direto à cadeia (um GET estático poderia ser um HIT real). |

(Exact final wording lives in the code; the table is the intent.)

## Cloud map (constitution §5)

n/a — no new tier/station; `cdn`/`waf`/`lb` keep their existing `clouds` maps.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 emission order | assert the stage sequence emitted for a chat with a present chain is `dns, cdn, lb, waf, apigw` (LB before WAF) | `backend/tests/test_network.py` |
| AC2 visual wiring | hops include `cdn→lb`, `lb→waf`, `waf→apigw` and exclude `cdn→waf`/`waf→lb`; `NETWORK_IDS` order is `dns,cdn,lb,waf,apigw` | `frontend/src/lib/stations.test.ts` (+ `layout` test) |
| AC3 single TLS termination | `cdn→lb` protocol contains `TLS`, `lb→waf` protocol is `HTTP` (no TLS); only the into-LB hop prose matches /terminat/ | `frontend/src/lib/stations.test.ts` |
| AC4 real chain + attestation | config-audit: parse infra files — varnish→haproxy, haproxy→modsecurity, modsecurity→kong; `X-Waf-Status` present in `kong.yml`, absent in `haproxy.cfg` | `backend/tests/test_network_chain_config.py` (new) |
| AC5 honest bypass | `read_cdn` surfaces `cache="BYPASS"`; varnish vcl stamps `BYPASS` on the non-GET path (config-audit); FE readout renders `BYPASS` | `backend/tests/test_network.py` + `frontend/.../FlowCanvas.readout.test.ts` |
| AC6 default unchanged | with `network=False`, no ingress stages emitted; `computeLayout` byte-for-byte equal to today when network off | existing `backend/tests/test_chat*` + `frontend layout` tests |

Tests assert **structurally** (order, presence/absence, substring) to tolerate
model variability; the chain-order tests are deterministic (config + emission
order, no model call). The config-audit test pins the real chain so the picture
can never silently drift from the containers again.

## Risks / trade-offs

- **CI doesn't run Docker**, so the real chain order is pinned by a *config-audit*
  test (parsing the infra files), not by exercising live containers — consistent
  with 088's "WAF tested at the backend level only". The audit is the honesty guard.
- HAProxy losing the `X-Waf-Status` stamp means, in the new order, the WAF-cleared
  signal only appears once Kong is crossed — correct, since that is the first hop
  that truly proves the WAF passed.
- Reordering `NETWORK_IDS` reflows only the edge column; the private tiers and the
  public frontier already derive from `tierBoxes.edge`, so geometry stays sound.
- `BYPASS` is a new readout token; the tile already renders the dynamic cache value
  (`d.cache ?? "—"`), so no exhaustive-switch change is needed.

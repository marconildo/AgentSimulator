# Spec: Real network layer (DNS → CDN/Cache → WAF → TLS/LB → API-GW)

| | |
|---|---|
| **ID** | 088-network-layer |
| **Status** | in-progress (Phases 0–2 done & green; Phase 3 infra written, Docker validation pending) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`. If you catch yourself naming a file or a function, move it to the plan.

## Problem / motivation

Today the only network infrastructure the simulator shows for real is a single reverse
proxy (`nginx`, the 084 `edge`), and even that was deliberately drawn with **no box** —
its chain (DNS · CDN · WAF · TLS/LB · API-GW) lives only as *preview* text on the
`frontend→backend` hop (084 §3). That undersells the most realistic, most teachable part
of a production agent deployment: the **request never goes straight from browser to app**
— it traverses a chain of network appliances, each a real, separately-deployed container
with its own job, its own evidence, and its own failure mode.

This project's whole differentiator is **"everything is real"** (constitution §2). A
preview box that only draws a label is the weakest thing we can show. The opportunity is
to make the ingress path **genuinely real**: a chain of actual Docker containers
(`CoreDNS → Varnish → ModSecurity/CRS → HAProxy(TLS/LB) → Kong(API-GW) → backend`) that
the browser truly transits, each reporting honest evidence (resolved host + TTL, cache
`HIT`/`MISS`, WAF rule + anomaly score, TLS version + LB upstream, gateway route +
rate-limit headers). A request carrying an attack signature is **actually blocked** by a
real WAF with a real `403`.

Because this chain only exists when the full Docker topology is running, it must be
**opt-in and honestly gated**: a single "Network" component in the Build popover, marked
**Advanced**, that is **disabled when the chain is not present** (e.g. running the backend
bare with `uvicorn`, where the appliance containers don't exist). Enabling a box for infra
that isn't there would violate §2 and §3 — so we don't let the user.

**The toggle is visualization-only** (clarified 2026-06-22): the five appliance containers
come up **with `docker compose up`** (real infra, always in front of the backend when the
stack is running) — the "Network" component does **not** start or stop containers. Turning
it **on** reveals the five stations and makes the backend **emit** their stages; turning it
**off** hides them and suppresses emission (the request still physically crosses the real
chain — we just don't draw it, exactly like the existing `edge` toggle). The availability
gate is therefore simply "**is the chain present**" (the backend can tell it's running
behind the Docker stack) — no Docker-daemon control, no `docker.sock`, no provisioning.

## Goals

- A new **Build component** ("Network" / "Redes") that toggles the whole ingress chain on/off as one unit.
- Enabling it derives the **Advanced** maturity badge (it carries an advanced floor).
- The toggle is **disabled when the network chain is not available** (backend not behind the Docker chain), with a bilingual explanation of why.
- When enabled and available, the canvas renders **five real stations** in order between Frontend and Backend: **DNS**, **CDN/Cache**, **WAF**, **TLS/LB**, **API-Gateway** — each a visible node with its own hop and its own real per-run evidence.
- The five appliances are **real Docker containers** the request truly transits; each emits a Stage populated from real signals (headers/logs from the actual container), not fabricated data.
- The **WAF is real**: a request with a known attack signature is blocked with a real `403`, surfaced honestly as a blocked WAF event.
- With the component **off (the default)**, the pipeline, the protocol stream, and the canvas are **byte-for-byte unchanged** from today.

## Non-goals

- **Geo-distributed CDN / Anycast / multiple PoPs.** The CDN is a single real *edge cache* container (honestly labelled "edge cache", not "global CDN") — §3 forbids faking the distribution.
- **Service mesh** (Istio/Linkerd), managed-cloud WAF rule sets, or real upstream autoscaling — out of scope; stay in the cloud-overlay `clouds` map as example service names only.
- **Multi-instance / shared state.** The LB fronts the existing **single** backend (constitution §7 still holds); it demonstrates termination + a one-node upstream pool honestly, it does not introduce replicas with shared state.
- **Per-appliance Build sub-toggles.** It is **one** "Network" switch for the whole chain, not five independent toggles.
- **Changing the default ingress.** Without the component, the existing 084 `edge` behaviour (single nginx, `proxied` reported honestly) is untouched.

## User-facing behavior

- In the header **Build** popover, a new **"Network"** entry appears in an **Advanced** grouping, with a one-line bilingual blurb ("Real ingress chain: DNS · CDN · WAF · TLS/LB · API-Gateway" / "Cadeia de entrada real: DNS · CDN · WAF · TLS/LB · API-Gateway").
- When the backend reports the chain is **present** (running behind the Docker stack), the entry is a normal checkbox; toggling it **on** flips the **maturity badge to Advanced**, reveals the five stations on the canvas and makes the backend emit their stages; toggling it **off** hides the stations, suppresses emission and reverts the badge. It never starts or stops containers.
- When the chain is **not present** (backend not behind the Docker stack — e.g. bare `uvicorn`), the checkbox is **disabled and visibly greyed**, with a bilingual tooltip: "Available only when running the full Docker stack (the network containers must be up)." / "Disponível apenas rodando o stack Docker completo (os containers de rede precisam estar no ar)."
- On the canvas, with the component on, the request animates through **Frontend → DNS → CDN/Cache → WAF → TLS/LB → API-Gateway → Backend**. Each station tile shows a real readout (DNS: resolved host + TTL; CDN: `HIT`/`MISS`; WAF: rule count / anomaly score / `clean`; TLS/LB: TLS version + upstream; API-GW: route + remaining rate limit). Clicking a station opens its Inspector detail (theory + the real evidence that crossed it).
- The five new appliances appear in the **cloud overlay** with concrete Azure/AWS/GCP example services, and all their prose ships in **en + pt**.

## Acceptance criteria

1. **AC1** — The Build popover renders a single **"Network"** component; toggling it adds/removes the network chain from the persisted selection (`agentsim.selection`), and the default selection has it **off**.
2. **AC2** — `classify(selection)` returns `"advanced"` whenever the network component is enabled (it carries an `advanced` floor), regardless of the other components.
3. **AC3** — When the backend reports the chain is **not present** (not running behind the Docker stack), the Network checkbox is **disabled** (not toggleable) and shows the bilingual "full Docker stack" tooltip; when present, it is a normal enabled checkbox.
4. **AC4** — With the component enabled and the chain available, exactly **five** stations — `dns`, `cdn`, `waf`, `lb`, `apigw` — are visible, in that order between `frontend` and `backend`, each with its connecting hop; with it disabled, none of them are visible and the `frontend→backend` hop is unchanged.
5. **AC5** — Running a chat with the chain enabled emits **five new Stages** (one per appliance) in DNS→CDN→WAF→TLS/LB→API-GW order, **each carrying real evidence** sourced from the actual container (resolved host/TTL, cache status, WAF rule/anomaly score, TLS version + LB upstream, gateway route + rate-limit), not placeholder constants.
6. **AC6** — A request whose body carries a known attack signature (e.g. an SQL-injection pattern) is **blocked with HTTP 403 by the real ModSecurity/CRS container**, and the WAF Stage reports it honestly as `blocked` with the triggering rule id; a benign request reports `clean` and reaches the backend.
7. **AC7** — Every new Stage is mapped to **exactly one** station in `STAGE_TO_STATION` and to a `TimelinePhase` in `STAGE_TO_PHASE`; both exhaustive maps stay total (`tsc` + parity tests pass), and `readoutFor`/`renderDetail` have a case for each new station.
8. **AC8** — The five new `Stage` values exist in **both** `backend/app/schemas.py` and `frontend/src/types/events.ts` (protocol mirror in sync, §1).
9. **AC9** — All five new stations fill the **cloud map** (`azure`/`aws`/`gcp`) and every new user-facing string (station titles/subtitles/blurbs/why/controls, the Build entry, the disabled tooltip, readouts, inspector text) ships in **en + pt** (§4, §5).
10. **AC10** — With the network component **off**, a chat run produces the **same Stage stream** and the canvas renders the **same stations/hops** as before this spec (additive, opt-in, no regression).
11. **AC11** — `docker-compose` defines the five real appliance containers that come up with **`docker compose up`**, wired in DNS→CDN→WAF→TLS/LB→API-GW→backend order; the browser enters the chain at its front door, and a request that reaches the backend carries forwarded evidence proving it transited the chain. The Build toggle changes **only** what is drawn/emitted — it never starts or stops these containers.
12. **AC12** — With the chain present, toggling the Network component **off** suppresses the five stages and hides the five stations (request still physically transits the real chain), and toggling it **on** emits/draws them — i.e. the toggle is pure visualization/emission with **no container side-effects** (no `docker.sock`, no up/down endpoints).

## Protocol / stage impact

- New/changed `Stage`(s): **five new** — `dns`, `cdn`, `waf`, `lb`, `apigw` (names final at plan time). Existing `edge` Stage is unchanged.
- Mirror in `frontend/src/types/events.ts`: **required** (§1) — same five, plus their event `data` shapes.
- Station it maps to in `stations.ts`: **five new stations** (`dns`, `cdn`, `waf`, `lb`, `apigw`), each owning exactly one of the new stages in `STAGE_TO_STATION`; each also needs a `STAGE_TO_PHASE` entry, a `readoutFor` case, a `renderDetail` case, and full `clouds` maps. New hops `frontend→dns→cdn→waf→lb→apigw→backend`. Likely a new `TierId` for the network/edge tier (decided in plan).

## Open questions (clarify before planning)

_All resolved — see the resolutions below; status is `clarified`._

- [x] **Chain lifecycle** — RESOLVED (revised 2026-06-22): the five containers come up with **`docker compose up`** (always-on real infra). The Build toggle is **visualization/emission only** — it does **not** start/stop containers. No `docker.sock`, no up/down endpoints, no provisioning state. (Reverses the earlier "toggle provisions" answer.)
- [x] **Availability signal** — RESOLVED: the gate is "**is the chain present**" (backend running behind the Docker stack), exposed on `/api/config.network_available` — a simple env/probe signal, no Docker-daemon control.
- [x] **WAF-block demo** — RESOLVED: **backend test only** in 088 (clean request passes, SQLi → real 403). The interactive UI attack demo is deferred to its own spec.
- [ ] **API-Gateway product** (Kong DB-less vs Traefik vs APISIX) — pure HOW; resolve in `plan.md`, not a blocker for `clarified`.

## Out of scope / deferred

- A dedicated **"send a blocked request" experiment** in the UI (could be its own small spec once the chain is real).
- Real **rate-limit throttling demo** (burst → 429) as an interactive experiment.
- Real **DNS failover / multi-record** and **CDN purge** demos.
- Promoting any of these five from the cloud-overlay example services to managed-cloud parity tests.

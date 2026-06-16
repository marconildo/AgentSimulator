# Plan: Online demo mode (mocked, backend-less)

## Approach

A **build-time flag** `VITE_DEMO_MODE` flips the frontend into a self-contained
showcase that needs no backend. The seam is the network boundary: a single
`lib/demo.ts` module exposes drop-in replacements for the handful of functions the
app calls on boot and on send, and the existing helpers (`health.ts`, `chatApi.ts`,
`sse.ts`) gain a one-line `isDemo() ? demoX() : <existing fetch>` guard. Because the
guard is a no-op when the flag is unset, the normal local build is byte-for-byte
unchanged — no behavioral risk to the live, key-required app.

The demo's "data" is a set of **real captured traces** (`POST /api/chat` batch
output) for the four curated sample questions × {simple, intermediate} × {en, pt},
bundled as JSON. Replaying them reuses the app's existing strength: the canvas is a
*pure projection of events* and the tour already replays a canned trace with no
backend (`tourTrace.ts`) — we generalize that to the composer.

Alternatives considered: (a) a hosted stateless backend for live BYO-key — rejected
by the user (online stays 100% mocked); (b) a runtime demo toggle inside one build —
rejected because it would force demo branches into the live app's hot paths.

## Affected files

**Backend**
- None. (Capture uses the existing batch endpoint via `scripts/capture_demo_traces.py`.)

**Frontend**
- `src/demo/fixtures/*.json` — 16 captured traces + `_config.json` snapshot (new).
- `src/demo/fixtures.ts` — typed registry of the captures (new).
- `src/lib/demo.ts` — `isDemo()`, curated questions, `selectDemoTrace`, in-memory
  session store, and demo replacements for health/config/catalog/chat/trace (new).
- `src/lib/health.ts` — `isDemo()` short-circuit in `load()`.
- `src/lib/chatApi.ts` — `isDemo()` guards on the boot/catalog reads.
- `src/lib/sse.ts` — `isDemo()` guards on `streamChat`/`batchChat`/`fetchTrace`.
- `src/components/ChatPanel.tsx` — demo composer lockdown + persistent sample-question bar.
- `src/components/DemoBanner.tsx` — bilingual banner + GitHub CTA (new), mounted in `App.tsx`.
- `src/App.tsx` — mount the banner; hide agent/clear controls in demo.
- `src/i18n/strings.ts` — new `demo.*` strings (en + pt).
- `vite.config.ts` — `base` from `BASE_PATH` env (GitHub Pages project-site).
- `index.html` / build — `404.html` SPA fallback.
- `.github/workflows/deploy-pages.yml` — build with `VITE_DEMO_MODE=1` + base, deploy Pages.

## Protocol changes (constitution §1)

None. No new/changed `Stage`/`Phase`/`TraceEvent`. The demo replays existing events.

## Data model changes

None server-side. The demo keeps a per-tab in-memory session/message store that is
never persisted (matches "nada salvo, só sessão atual").

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `demo.bannerLead` | "Demo mode — sample questions only." | "Modo demo — apenas perguntas de exemplo." |
| `demo.bannerCta` | "Run the full live version with your own key" | "Rode a versão completa com sua própria chave" |
| `demo.composerHint` | "Pick a sample question below" | "Escolha uma pergunta de exemplo abaixo" |
| `demo.sampleBarLabel` | "Sample questions" | "Perguntas de exemplo" |

## Cloud map (constitution §5)

n/a — no new tier/station. (Deployment target is GitHub Pages, a static CDN; it
maps to the existing **Static Hosting / CDN** delivery tier conceptually but adds no
node to the visual model.)

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `isDemo()` default false; helpers keep fetch path | `src/lib/demo.test.ts` |
| AC2 | `demoHealth()` → ok/keyed/model | `src/lib/demo.test.ts` |
| AC3 | demo catalog reads resolve w/o fetch | `src/lib/demo.test.ts` |
| AC4 | `selectDemoTrace` stages map; intermediate RAG has `rag.rerank` | `src/lib/demo.test.ts` |
| AC5 | demo `send` appends message (id===trace_id), settles answer | `src/lib/demo.test.ts` |
| AC6 | `selectDemoTrace` fallback never throws | `src/lib/demo.test.ts` |
| AC7 | composer textarea disabled + no upload + chips render | `src/components/ChatPanel.demo.test.tsx` |
| AC8 | `demo.*` strings present in en + pt | covered by tsc (`Record`-typed strings) + review |
| AC9 | base-path build + 404.html | manual / workflow (documented) |

Tests run offline (no key) — they exercise the demo module and the lockdown render.
The existing backend suite is unchanged (no backend diff).

## Risks / trade-offs

- **Fixture staleness** — if the event protocol (§1) changes, captures must be
  re-recorded (`scripts/capture_demo_traces.py`). `tourTrace.test.ts`-style stage
  mapping guards catch a drift at test time.
- **Bundle size** — 16 JSON traces add ~weight to the demo bundle; acceptable for a
  CDN-served showcase and excluded from nothing the live build ships (they're only
  imported by `demo/` which the live app's tree-shaking keeps but never executes).
- **message.chunks empty in demo** — the per-message "sources" expander is empty in
  demo (the real retrieval is still visible in the trace/inspector). Acceptable.
- **§2/§3 carve-out** — see the constitution amendment; the live app stays fully real.

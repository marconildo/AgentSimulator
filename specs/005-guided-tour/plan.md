# Plan: Guided tour (storytelling mode)

> The HOW for `spec.md` (status `done`). Respects `.specify/constitution.md`.
> Frontend-only; builds on `004-timeline-phases`.

## Approach

Model the tour as a **pure reducer over `004`'s phase markers** plus a thin
driver that ticks it on a timer (the same shape as the existing `togglePlay`
interval in `useSimulator`). The reducer owns *what* the next step is
(`{ cursor, station, phase }`); the driver applies it by calling the store's
existing `setCursor` and `select`, and sets a `caption` string. A `TourControls`
component renders ▶ Tour / pause / stop and the caption bar overlays the canvas.

*Alternative considered:* a fully imperative `setTimeout` chain inside the
component — rejected; a pure reducer keeps the advancement logic unit-testable
(AC1, AC3, AC4) without fake timers and keeps state in one place.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/tour.ts` *(new)* — `tourStep(state)` reducer and the
  `{ cursor, station, phase }` step type, built on `phaseMarkers` /
  `STAGE_TO_STATION` from `004` + `stations.ts`.
- `frontend/src/store/useSimulator.ts` *(or new `useTour.ts`)* — tour fields
  (`touring`, `tourPhaseIndex`, `caption`) and `startTour/pauseTour/stopTour`
  (Q5). The timer mirrors the existing replay `playTimer` pattern.
- `frontend/src/components/TourControls.tsx` *(new)* — ▶ Tour / ⏸ / ⏹ buttons,
  disabled when no trace (AC5).
- `frontend/src/components/FlowCanvas.tsx` — a caption bar overlay at the bottom
  of `<main>` while `touring`.
- `frontend/src/lib/tourCaptions.ts` *(new)* **or** `learn/content.ts` — per-phase
  captions, en + pt (Q2).
- `frontend/src/i18n/strings.ts` — `tour.*` button labels (en + pt).
- `frontend/src/lib/tour.test.ts` *(new)* — the AC tests.

## Protocol changes (constitution §1)

None. The tour reads existing trace events and existing derived phases; it writes
only UI state (`cursor`, `selected`, `caption`).

## Data model changes

None.

## i18n strings (constitution §4)

Button labels + one caption per phase (final captions pending Q2). All en + pt.

| key / location | en | pt |
|---|---|---|
| `tour.start` | ▶ Tour | ▶ Tour |
| `tour.pause` | Pause tour | Pausar tour |
| `tour.stop` | Stop tour | Encerrar tour |
| caption `request` | The browser sends your message to the API over HTTPS. | O navegador envia sua mensagem à API por HTTPS. |
| caption `route` | The agent classifies the request and plans its route. | O agente classifica a requisição e planeja a rota. |
| caption `retrieve` | RAG embeds the query and pulls the most relevant chunks. | O RAG vetoriza a pergunta e busca os trechos mais relevantes. |
| caption `reason` | The agent reasons over context and decides whether to call a tool. | O agente raciocina sobre o contexto e decide se chama uma ferramenta. |
| caption `tools` | A tool runs over MCP and returns an observation. | Uma ferramenta roda via MCP e retorna uma observação. |
| caption `generate` | The model writes the answer, token by token. | O modelo escreve a resposta, token a token. |
| caption `respond` | The finished answer is returned to the client. | A resposta pronta é devolvida ao cliente. |
| caption `persist` | The conversation is saved to the database (long-term memory). | A conversa é salva no banco (memória de longo prazo). |

(Plus `memory` caption if Q1 of `004` keeps that phase.)

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Pure reducer + caption coverage, tested with Vitest.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `tourStep` advances phases in order, yielding correct `{cursor, station, phase}` | `frontend/src/lib/tour.test.ts` |
| AC2 | every phase has en + pt captions | `tour.test.ts` |
| AC3 | pause/resume/stop transitions behave (no advance while paused; stop clears) | `tour.test.ts` |
| AC4 | the last phase auto-stops (no overrun) | `tour.test.ts` |
| AC5 | start is gated on a non-empty trace | `tour.test.ts` (state guard) |
| AC6 | step type carries only `cursor/station/phase`; no fetch; protocol untouched | `tour.test.ts` |

The timer driver + caption bar are guarded by `tsc` + `npm run build` and
verified manually (no RTL in the repo).

## Risks / trade-offs

- **Two timers** (replay `playTimer` + tour) — keep them mutually exclusive:
  starting the tour stops replay and vice-versa (reuse `stopTimer`).
- **Pace vs. comprehension** (Q1): a fixed pace is simplest but `generate` may
  need a longer dwell; latency-proportional pacing reads better but is fiddly.
- **Coupling to `004`**: the tour can't ship before phases exist; if `004` slips,
  this is blocked.

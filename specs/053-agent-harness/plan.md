# Plan: Agent Harness framing + Learn topic

> The HOW. Frontend-only, content + one label. No backend, no protocol.

## Approach

Frame the **runtime** (not the deployment tier) as an "Agent Harness" in three
small, additive places, reusing patterns that already exist:

1. **Glossary term** — add `"Agent Harness"` to the canned glossary (en + pt maps),
   same shape as `ReAct` / `DeepAgents`. This makes the term hover-explainable
   anywhere it's rendered via the existing glossary-tooltip mechanism.
2. **Agent drill-in label** — add one bilingual line/badge to `AgentDetail` that
   names the harness and lists its parts (loop · tools · prompt layers · context ·
   memory), tagged with the glossary term. This is the "título/enquadramento do
   AgentDetail" the user asked for; it sits alongside the existing ReAct view and
   touches nothing in the projection.
3. **Learn topic** — add an `agent-harness` topic to the Gen-AI & Agents section of
   `learn/content.ts`, authored with the full `what/why/how/options/links`
   structure, grounded in the stations this app already shows (so it doubles as
   documentation). Place it next to `agents-react` / `tool-calling`.

Alternatives considered: (a) renaming the `agent` tier `title` to "Agent Harness" —
rejected, it mixes deployment taxonomy with a software concept and breaks the
Client/API/Compute/Data parallelism; (b) overloading the scenario relabel
(`AGENT_SCENARIO_LABEL`) — rejected, harness is orthogonal to the ReAct/DeepAgents
axis and reusing that hook would entangle two unrelated ideas.

## Affected files

**Backend**
- *None.* (AC5 requires zero `backend/` diff.)

**Frontend**
- `frontend/src/i18n/strings.ts` — add `"Agent Harness"` to both `glossary` maps
  (en ~L878, pt ~L1521); add an `agentDetail.harness` string (type + en + pt, all
  three `agentDetail` blocks: interface ~L391, en ~L1046, pt ~L1689).
- `frontend/src/components/AgentDetail.tsx` — render the harness framing line/badge
  (uses `useT().agentDetail.harness`), tagged with the glossary term so the
  existing tooltip mechanism applies.
- `frontend/src/learn/content.ts` — new `agent-harness` `TopicSrc` in the `genai`
  section, near `agents-react`; bilingual `what/why/how/options` + `links`.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed. `STAGE_TO_STATION` and
`STAGE_TO_PHASE` untouched. The `agent` station's `stages` array is unchanged.

## Data model changes

None — no Chroma, no SQLite, no migration.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `glossary["Agent Harness"]` | "Agent Harness — the runtime scaffolding around an LLM that makes it an agent: the reasoning loop, tool calling, prompt assembly, context window and memory." | "Agent Harness — o arcabouço de runtime em volta de um LLM que o torna um agente: o loop de raciocínio, a chamada de ferramentas, a montagem do prompt, a janela de contexto e a memória." |
| `agentDetail.harness` | "Agent Harness — the loop, tools, prompt layers, context window and memory wrapped around the LLM." | "Agent Harness — o loop, as ferramentas, as camadas de prompt, a janela de contexto e a memória em volta do LLM." |
| `content.ts` topic `agent-harness` `title` | "Agent harness" | "Agent harness" |
| ↳ `what` | what it is — scaffolding that turns a stateless LLM call into an agent | o arcabouço que transforma uma chamada de LLM sem estado em um agente |
| ↳ `why` | why it's here — the app's whole agent runtime *is* a harness; naming it ties the pieces together | por que está aqui — todo o runtime do agente *é* um harness; nomeá-lo conecta as peças |
| ↳ `how` | how — route → think ⇄ tools → generate; prompt layers; context window; working + long-term memory | como — route → think ⇄ tools → generate; camadas de prompt; janela de contexto; memória de trabalho + de longo prazo |
| ↳ `options` | alternatives — raw SDK loop, OpenAI Assistants/Agents SDK, LangGraph, CrewAuto, DeepAgents | alternativas — loop com SDK cru, OpenAI Assistants/Agents SDK, LangGraph, CrewAI, DeepAgents |

(Final prose authored in the files; the term "Agent Harness" itself stays English in
both languages — jargon proper noun, matching DeepAgents/Multi-agent precedent.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. The `agent` tier/station already fill
azure/aws/gcp; this spec adds no cloud-mapped element.

## Test strategy (constitution §9 — TDD)

All Vitest (frontend-only feature). Structural assertions over resolved content.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `agentDetail.harness` resolves non-empty for en & pt and contains "Agent Harness" | `frontend/src/i18n/strings.test.ts` (or new `agentHarness.test.ts`) |
| AC2 | `glossary["Agent Harness"]` present + non-empty in en **and** pt maps | `frontend/src/i18n/strings.test.ts` |
| AC3 | `allTopicsFor("en")` and `allTopicsFor("pt")` contain id `agent-harness` with non-empty what/why/how/options and ≥1 link | `frontend/src/learn/content.test.ts` |
| AC4 | `tierByIdFor(lang).agent` title/alias unchanged for en & pt | `frontend/src/lib/stations.test.ts` |
| AC5 | parity: `STAGE_TO_STATION` / `STAGE_TO_PHASE` keys unchanged; (guard) | existing `phases.test.ts` / `stations.test.ts` stay green; `git diff --stat backend/` empty |

## Risks / trade-offs

- **Low risk** — additive content + one label; no projection, no protocol, no state.
- pt wording for "harness": we intentionally keep the English term and translate the
  *gloss* only; reviewers may expect a pt word — documented decision (open Q #3).
- Keep the harness line clearly separate from the scenario relabel so a future real
  DeepAgents/Multi-agent spec doesn't collide with it.

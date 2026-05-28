# 🗺️ Roadmap — what's not implemented yet

🌐 **English** · [Português](#-roadmap--o-que-ainda-não-está-implementado)

This is the **contributor TODO list** for the AI Agent Simulator. Everything below is **visible on
the canvas as a "coming soon" preview tile** (Intermediate / Advanced rungs of the
[maturity ladder](../README.md#-the-maturity-ladder--simple--intermediate--advanced)) or is a
**cross-cutting seam** the code already keeps open — none of it is wired up to actually run yet.

Honesty first (constitution §3, *everything is real*): the preview tiles are clearly labelled and
**do not fake a run**. Sending is gated by `canSend(scenario)` on any rung whose real nodes have not
shipped. Each item here is therefore the *seed of its own spec*.

> **How to take one on.** Every behavior change in this project is **spec-first and test-first**
> (see [`.specify/constitution.md`](../.specify/constitution.md) §9–§10 and
> [`docs/development-workflow.md`](development-workflow.md)). Copy `specs/_template/` to
> `specs/NNN-feature-name/`, write `spec.md` → `plan.md` → `tasks.md`, then implement
> **red → green → refactor**. Pick an item, open a draft spec, and open an issue / PR — small
> targeted PRs are very welcome.

## Status legend

| Symbol | Meaning |
|---|---|
| 🟡 | Preview tile on the canvas — visual only, no backend yet |
| 🏷️ | Label-only marker — the node renders with a planned name but the runtime is unchanged |
| 🔧 | Cross-cutting seam in the code (no canvas tile) — ready for a real implementation |

---

## 🟡 Intermediate rung — RAG quality & "DeepAgents"

The Intermediate rung is the *RAG-quality + honest-cost* tier. Today its scenario is selectable,
the topology renders, but the new nodes are visual previews.

### 🏷️ DeepAgents runtime (the relabelled agent node)
- **Where it shows up.** `frontend/src/lib/stations.ts` → `AGENT_SCENARIO_LABEL.intermediate` renames
  the `agent` node to **`DeepAgents`** on this rung. Glossary tooltip in `frontend/src/i18n/strings.ts`
  (key `DeepAgents`) — flagged *"Planned — not yet implemented."*
- **What it is.** A LangGraph agent pattern that adds **explicit planning, sub-agents and a
  virtual file system** for longer-horizon tasks (a planner that decomposes the task; workers that
  execute focused sub-tasks; a scratchpad that survives across steps).
- **What's missing.** Everything past the label: there is no planner node, no virtual-FS state, no
  sub-agent spawning in `backend/app/agent/graph.py`. The agent is still the ReAct loop from spec
  [026-agent-tool-autonomy](../specs/026-agent-tool-autonomy/).
- **What a spec would add.**
  - A planner node before `think` that produces an explicit plan in `AgentState`.
  - A virtual file system (in-memory or `Skills`-style — see spec
    [027-skills](../specs/027-skills/)) the agent can read/write across steps.
  - New `Stage`s (e.g. `agent.plan`, `agent.fs.read`, `agent.fs.write`) wired into the protocol
    (`backend/app/schemas.py` + `frontend/src/types/events.ts`), `STAGE_TO_STATION` and
    `STAGE_TO_PHASE` (constitution §1, §6).
  - Tests that assert the planner fires and the FS is consulted (structural assertions, real
    OpenAI).

### 🟡 Reranker (cross-encoder)
- **Where it shows up.** `stations.ts` → station `reranker` (tier `services`, scenarios
  `["intermediate", "advanced"]`, `comingSoon: true`, `stages: []`).
- **What it is.** Re-scores the top-N candidates from the vector search with a cross-encoder so the
  most relevant chunks lead — measurably better answer quality on the same index.
- **Cloud examples (already wired in `clouds`).** Azure AI Search semantic ranker · Amazon Bedrock /
  Cohere Rerank · Vertex Ranking API.
- **What a spec would add.**
  - A real reranker call between `rag.search` and `rag.retrieve` (a new `rag.rerank` `Stage`).
  - Mapping the new stage in `STAGE_TO_STATION` / `STAGE_TO_PHASE` and rendering its readout +
    inspector detail.
  - Bilingual blurbs/glossary entries (EN + PT — constitution §4).

### 🟡 Hybrid search (BM25 + vector)
- **Where it shows up.** Called out in the [README ladder table](../README.md#-the-maturity-ladder--simple--intermediate--advanced)
  as "hybrid search"; no dedicated tile yet (it would live inside or beside the `rag` station).
- **What it is.** Combine sparse (BM25 / keyword) and dense (vector) retrieval and fuse the results
  (e.g. RRF) — catches exact-term matches the embedding misses.
- **What a spec would add.** A second retriever, a fusion step, and a way to compare the two sets
  in the inspector (so the *why hybrid?* is visible, not just claimed).

---

## 🟡 Advanced rung — Multi-agents & AI-Ops

The Advanced rung is the *how-agents-live-in-production* tier. It adds a whole new **AI-Ops** tier
(see `stations.ts` → `tiers` → `aiops`) with five preview nodes, plus the multi-agent worker tree
under the orchestrator.

### 🏷️ Multi-agent orchestration (Researcher / Coder / Critic)
- **Where it shows up.** `stations.ts` → stations `researcher`, `coder`, `critic` under the `agent`
  tier; `AGENT_SCENARIO_LABEL.advanced` renames the `agent` node to **`DeepAgents + Multi-agents`**
  (`pt`: `DeepAgentes + Multiagentes`). Hop fan-out (`agent → researcher | coder | critic`) already
  declared but `scenarios: ["advanced"]` and the targets are `comingSoon`. Glossary key
  `Multi-agent` in `strings.ts` — flagged *"Planned — not yet implemented."*
- **What it is.** An **orchestrator** agent that delegates focused tasks to **specialized
  sub-agents** instead of running one monolithic loop:
  - **Researcher** — runs retrieval / tool lookups, returns a digest.
  - **Coder** — does the work (writes code, calls tools, transforms data) under the plan.
  - **Critic** — reviews the draft answer for errors and gaps before it ships.
- **What a spec would add.**
  - A real orchestrator → sub-agent runtime in `backend/app/agent/` (each sub-agent gets its own
    bounded loop and tool subset).
  - Per-sub-agent `Stage`s (`agent.delegate`, `agent.subagent.*`) and mapping in
    `STAGE_TO_STATION` / `STAGE_TO_PHASE`.
  - Per-sub-agent activation in the canvas (the worker that's currently running highlights), and an
    Agent-detail tab that shows the delegation chain.
  - Tests proving delegation actually happens (e.g. a coding question routes to the Coder).

### 🟡 LLM Gateway (router · fallback · budget)
- **Where it shows up.** `stations.ts` → station `gateway` (tier `aiops`, `comingSoon: true`).
- **What it is.** A single egress for every model call — handles routing across providers/models,
  retries, fallback, and budget caps. The natural seam for **multi-provider** (see the
  cross-cutting section below).
- **Cloud examples.** Azure API Management (AI gateway) · Bedrock + API Gateway · Apigee / Vertex
  endpoints.
- **What a spec would add.**
  - A real gateway in front of `LLMProvider.decide` / `stream_answer` that can route by policy
    (cost, latency, model capability) and fall back on failure.
  - New `Stage`s for `gateway.route` and `gateway.fallback`, surfaced on the inspector.
  - Budget caps enforced server-side; the cap and remaining budget visible on the gateway tile.

### 🟡 Guardrails (input / output safety)
- **Where it shows up.** `stations.ts` → station `guardrails` (tier `aiops`, `comingSoon: true`).
- **What it is.** Checks prompts and answers for **prompt injection, PII and unsafe content**
  before they pass. Two real call sites: pre-LLM on the prompt, post-LLM on the answer.
- **Cloud examples.** Azure AI Content Safety · Bedrock Guardrails · Model Armor.
- **What a spec would add.**
  - Real input + output checks (e.g. `presidio` for PII, an open guardrails SDK for the rest).
  - New `Stage`s `guard.input` / `guard.output` with **fail-fast on block** and a clear blocked-answer
    UX (this overlaps with spec [017-failure-injection](../specs/017-failure-injection/) — reuse it).
  - Tests that prove a known-malicious prompt is blocked and a clean prompt passes through.

### 🟡 Semantic Cache (prompt / embedding cache)
- **Where it shows up.** `stations.ts` → station `cache` (tier `aiops`, `comingSoon: true`).
- **What it is.** Returns a stored answer for **semantically near queries** — big latency and cost
  savings. Keyed by embedding similarity, not by exact prompt text.
- **Cloud examples.** Azure Cache for Redis · ElastiCache (Redis) · Memorystore (Redis).
- **What a spec would add.**
  - A real cache check before the LLM call and an upsert after; configurable similarity threshold.
  - New `Stage`s `cache.lookup` (hit / miss) and `cache.upsert`; the HUD shows cache-hit savings
    (ties in with spec [011-token-cost](../specs/011-token-cost/) and
    [018-cumulative-hud](../specs/018-cumulative-hud/)).
  - Honesty: a cached answer must be **labelled as cached** in the UI (it's not a fresh LLM call).

### 🟡 Eval Runner (RAGAS / LLM-as-judge)
- **Where it shows up.** `stations.ts` → station `eval` (tier `aiops`, `comingSoon: true`).
- **What it is.** Scores answers against a **golden set** (faithfulness, answer relevancy, retrieval
  NDCG) and gates regressions in CI — the production answer to *"did our change make things
  better?"*.
- **Cloud examples.** Azure AI Evaluation · Bedrock model evaluation · Vertex Gen AI evaluation.
- **What a spec would add.**
  - A golden set under `backend/app/data/` and a runner under `backend/app/eval/`.
  - An on-demand "Run evals" action in the UI that streams results to a new inspector panel.
  - A CI gate that fails the build when faithfulness / NDCG drop below thresholds (extends
    `ci.yml`).

### 🟡 Observability sink (LLM traces · OpenTelemetry GenAI)
- **Where it shows up.** `stations.ts` → station `observability` (tier `aiops`, `comingSoon: true`).
- **What it is.** Captures **every prompt, completion, token count, latency and cost** as
  structured LLM traces — the production version of what spec
  [038-execution-traces](../specs/038-execution-traces/) shows inline.
- **Cloud examples.** Azure Monitor / App Insights · CloudWatch / X-Ray · Cloud Trace / Monitoring.
- **What a spec would add.**
  - Real OTel GenAI export from the backend (the trace already exists in-memory via
    `app/trace.py` — this is the production sink, not a new trace model).
  - A toggle (env + UI) to enable export; the observability tile shows the configured sink.

---

## 🔧 Cross-cutting seams — not on the canvas

These don't have a tile of their own — they're seams the code already keeps open. Each is a
genuine TODO for production-readiness.

### 🔧 Multi-provider LLM support
- **Where the seam is.** `backend/app/llm/provider.py` — the `LLMProvider` ABC is **explicitly
  kept as a thin seam**. Today `get_provider()` always returns `OpenAIProvider`, and with no
  `OPENAI_API_KEY` it raises `MissingAPIKeyError`. Same story for embeddings in
  `backend/app/rag/embeddings.py`.
- **What's missing.**
  - A second concrete provider (e.g. `AnthropicProvider`, `AzureOpenAIProvider`, an Ollama-backed
    local provider for offline dev) implementing `decide`, `stream_answer` and surfacing real
    `TokenUsage`.
  - Config-driven selection (env: `LLM_PROVIDER=openai|anthropic|...`) instead of hard-coded
    OpenAI in `get_provider()`.
  - The same for embeddings (the `EMBEDDING_PROVIDER` seam).
- **Why this is the right shape.** Once **multi-provider** lands, the **LLM Gateway** above
  becomes the natural orchestrator (routing between providers, fallback when one degrades).
- **Constitution check.** §2 currently mandates *single provider (OpenAI) required* — adding
  multi-provider is an **amendment** (constitution §A) before code. Open a spec under
  `specs/` that proposes the amendment and the implementation together.

### 🔧 Model router (per-request model selection)
- **Where the seam would live.** Either inside the future **LLM Gateway** tile, or as a router
  step in `get_provider()` / inside `OpenAIProvider`. Today the model is fixed to `LLM_MODEL`
  (default `gpt-4o-mini`).
- **What it is.** Route per request to the cheapest model that can do the job (e.g.
  classification → `gpt-4o-mini`; long-form reasoning → `gpt-4o`; tool-heavy → `gpt-4o`). The
  agent declares the *task class*; the router picks the model.
- **What a spec would add.** A routing policy (declarative table or a small classifier), a new
  `gateway.route` `Stage` showing the chosen model + the reason, and per-model cost accounting
  on the HUD.

### 🔧 Authentication, sessions & rate limiting
- **Where it's flagged.** Honest caveats in `stations.ts` (`frontend` + `backend` stations'
  `whatBreaks`): *"this demo has no real authentication — it is a stub; production needs login,
  sessions and rate limiting before the agent ever runs."*
- **What's missing.** A real authn/z layer at the FastAPI ingress (e.g. JWT / session cookies),
  rate limiting per identity, and a real session store.
- **What a spec would add.** A login flow, a session middleware, a rate-limit middleware, and a
  test matrix proving 401 on missing credentials and 429 on burst.

### 🔧 Multi-replica / shared state
- **Where it's flagged.** `database` station `whatBreaks` ("this demo is single-instance; the
  trace store is in-memory, lost on restart, not shared across replicas"). Reinforced by
  constitution §7 (*single-instance*).
- **What's missing.** The in-memory `TraceStore` (and the `MemorySaver` in the LangGraph agent)
  are deliberately process-local. Production needs a shared backend (Redis / managed SQL) and a
  pool in front of the relational DB.
- **What a spec would add.** A pluggable `TraceStore` (Redis impl), a `Checkpointer` swap for
  LangGraph, and a load-test demonstrating two replicas serving the same conversation.
- **Constitution check.** §7 currently mandates *single-instance* — same story as multi-provider:
  amend the constitution as part of the spec.

---

## How to claim an item

1. **Open an issue** on the repo naming the item (e.g. *"Spec: Reranker (Intermediate rung)"*).
2. **Copy the spec template**: `cp -r specs/_template specs/NNN-your-feature/` (pick the next
   zero-padded number).
3. **Write `spec.md` first** — *WHAT + WHY + numbered, testable acceptance criteria.* No code yet.
4. **Plan + tasks** — `plan.md` (HOW, affected files, protocol/i18n/cloud impact) and
   `tasks.md` (TDD checklist; each implement task preceded by the failing test).
5. **Implement red → green → refactor**, keep the spec status moving (`draft → clarified → planned
   → in-progress → done`), and open a PR.
6. **Quality gates (mirror of `ci.yml` + constitution):** `ruff check .` · `ruff format .` ·
   `pytest -q` (with `OPENAI_API_KEY`) · `npm run build` · `npm test` · protocol mirror in sync
   (§1) · every `Stage` mapped to a station (§6) · all user-facing text in **en + pt** (§4) ·
   cloud map filled for any new tier/station (§5).

If a change touches the event protocol, adds/removes a `Stage`, or adds a station/hop/tier, it is
a **feature → spec required**, however small it looks (constitution §10, gray-zone rule).

---
---

# 🗺️ Roadmap — o que ainda não está implementado

🌐 [English](#%EF%B8%8F-roadmap--whats-not-implemented-yet) · **Português**

Esta é a **lista de TODO para colaboradores** do AI Agent Simulator. Tudo abaixo está **visível no
canvas como um bloco de prévia "em breve"** (degraus Intermediário / Avançado da
[escada de maturidade](../README.pt-BR.md#-a-escada-de-maturidade--simples--intermediário--avançado))
ou é uma **costura transversal** que o código já mantém aberta — nada disso está realmente ligado a
uma execução de verdade ainda.

Honestidade em primeiro lugar (constituição §3, *tudo é real*): os blocos de prévia são claramente
rotulados e **não fingem uma execução**. O envio é bloqueado por `canSend(scenario)` em qualquer
degrau cujos nós reais ainda não foram entregues. Cada item aqui é, portanto, a *semente da sua
própria spec*.

> **Como pegar um para si.** Toda mudança de comportamento neste projeto é **spec-first e
> test-first** (veja [`.specify/constitution.md`](../.specify/constitution.md) §9–§10 e
> [`docs/development-workflow.md`](development-workflow.md)). Copie `specs/_template/` para
> `specs/NNN-nome-da-feature/`, escreva `spec.md` → `plan.md` → `tasks.md`, depois implemente
> **red → green → refactor**. Escolha um item, abra uma spec em rascunho e abra uma issue / PR —
> PRs pequenos e focados são muito bem-vindos.

## Legenda de status

| Símbolo | Significado |
|---|---|
| 🟡 | Bloco de prévia no canvas — só visual, sem backend ainda |
| 🏷️ | Marcador só de rótulo — o nó é renderizado com um nome planejado, mas o runtime é o mesmo |
| 🔧 | Costura transversal no código (sem bloco no canvas) — pronta para uma implementação real |

---

## 🟡 Degrau Intermediário — qualidade de RAG & "DeepAgents"

O degrau Intermediário é o nível de *qualidade de RAG + custo honesto*. Hoje o cenário é
selecionável, a topologia é renderizada, mas os novos nós são prévias visuais.

### 🏷️ Runtime DeepAgents (o nó do agente renomeado)
- **Onde aparece.** `frontend/src/lib/stations.ts` → `AGENT_SCENARIO_LABEL.intermediate` renomeia o
  nó `agent` para **`DeepAgents`** neste degrau. Tooltip de glossário em
  `frontend/src/i18n/strings.ts` (chave `DeepAgents`) — marcado como *"Planejado — ainda não
  implementado."*
- **O que é.** Um padrão de agente LangGraph que adiciona **planejamento explícito, subagentes e
  um sistema de arquivos virtual** para tarefas de horizonte mais longo (um planejador que decompõe
  a tarefa; workers que executam subtarefas focadas; um scratchpad que sobrevive entre passos).
- **O que falta.** Tudo além do rótulo: não existe nó de planejador, não existe estado de FS
  virtual, não existe spawn de subagentes em `backend/app/agent/graph.py`. O agente ainda é o loop
  ReAct da spec [026-agent-tool-autonomy](../specs/026-agent-tool-autonomy/).
- **O que uma spec adicionaria.**
  - Um nó de planejador antes do `think` que produza um plano explícito em `AgentState`.
  - Um sistema de arquivos virtual (em memória ou estilo `Skills` — veja a spec
    [027-skills](../specs/027-skills/)) que o agente possa ler/escrever entre passos.
  - Novos `Stage`s (ex.: `agent.plan`, `agent.fs.read`, `agent.fs.write`) ligados ao protocolo
    (`backend/app/schemas.py` + `frontend/src/types/events.ts`), `STAGE_TO_STATION` e
    `STAGE_TO_PHASE` (constituição §1, §6).
  - Testes que afirmam que o planejador dispara e o FS é consultado (asserções estruturais, OpenAI
    real).

### 🟡 Reranker (cross-encoder)
- **Onde aparece.** `stations.ts` → estação `reranker` (tier `services`, cenários
  `["intermediate", "advanced"]`, `comingSoon: true`, `stages: []`).
- **O que é.** Reordena os top-N candidatos da busca vetorial com um cross-encoder para que os
  trechos mais relevantes liderem — qualidade de resposta mensuravelmente melhor no mesmo índice.
- **Exemplos de nuvem (já presentes no `clouds`).** Azure AI Search semantic ranker · Amazon
  Bedrock / Cohere Rerank · Vertex Ranking API.
- **O que uma spec adicionaria.**
  - Uma chamada real ao reranker entre `rag.search` e `rag.retrieve` (um novo `Stage` `rag.rerank`).
  - Mapeamento do novo estágio em `STAGE_TO_STATION` / `STAGE_TO_PHASE` e renderização do seu
    readout + detalhe no inspetor.
  - Blurbs/entradas de glossário bilíngues (EN + PT — constituição §4).

### 🟡 Busca híbrida (BM25 + vetorial)
- **Onde aparece.** Citada na [tabela da escada no README](../README.pt-BR.md#-a-escada-de-maturidade--simples--intermediário--avançado)
  como "busca híbrida"; ainda sem bloco dedicado (ficaria dentro ou ao lado da estação `rag`).
- **O que é.** Combinar recuperação esparsa (BM25 / palavra-chave) e densa (vetorial) e fundir os
  resultados (ex.: RRF) — pega correspondências exatas que o embedding perde.
- **O que uma spec adicionaria.** Um segundo retriever, um passo de fusão, e uma forma de comparar
  os dois conjuntos no inspetor (para o *por que híbrida?* ficar visível, não só afirmado).

---

## 🟡 Degrau Avançado — Multiagentes & AI-Ops

O degrau Avançado é o nível de *como agentes vivem em produção*. Ele adiciona uma nova tier
inteira de **AI-Ops** (veja `stations.ts` → `tiers` → `aiops`) com cinco nós de prévia, mais a
árvore de workers multi-agente sob o orquestrador.

### 🏷️ Orquestração multi-agente (Researcher / Coder / Critic)
- **Onde aparece.** `stations.ts` → estações `researcher`, `coder`, `critic` sob a tier `agent`;
  `AGENT_SCENARIO_LABEL.advanced` renomeia o nó `agent` para **`DeepAgents + Multi-agents`**
  (`pt`: `DeepAgentes + Multiagentes`). O fan-out de hops (`agent → researcher | coder | critic`)
  já está declarado mas com `scenarios: ["advanced"]` e os alvos são `comingSoon`. Chave de
  glossário `Multi-agent` em `strings.ts` — marcada como *"Planejado — ainda não implementado."*
- **O que é.** Um agente **orquestrador** que delega tarefas focadas a **subagentes
  especializados** em vez de rodar um único loop monolítico:
  - **Researcher** — roda recuperação / consultas a ferramentas e devolve um resumo.
  - **Coder** — faz o trabalho (escreve código, chama ferramentas, transforma dados) sob o plano.
  - **Critic** — revisa a resposta rascunho em busca de erros e lacunas antes de sair.
- **O que uma spec adicionaria.**
  - Um runtime orquestrador → subagente real em `backend/app/agent/` (cada subagente tem seu
    próprio loop limitado e subconjunto de ferramentas).
  - `Stage`s por subagente (`agent.delegate`, `agent.subagent.*`) e mapeamento em
    `STAGE_TO_STATION` / `STAGE_TO_PHASE`.
  - Ativação por subagente no canvas (o worker em execução acende) e uma aba no detalhe do Agente
    mostrando a cadeia de delegação.
  - Testes provando que a delegação acontece de fato (ex.: uma pergunta de código vai para o Coder).

### 🟡 Gateway LLM (roteador · fallback · orçamento)
- **Onde aparece.** `stations.ts` → estação `gateway` (tier `aiops`, `comingSoon: true`).
- **O que é.** Uma saída única para toda chamada de modelo — cuida de roteamento entre
  provedores/modelos, retries, fallback e limites de orçamento. A costura natural para
  **multi-provider** (veja a seção transversal abaixo).
- **Exemplos de nuvem.** Azure API Management (AI gateway) · Bedrock + API Gateway · Apigee /
  Vertex endpoints.
- **O que uma spec adicionaria.**
  - Um gateway real na frente de `LLMProvider.decide` / `stream_answer` capaz de rotear por política
    (custo, latência, capacidade do modelo) e dar fallback em falha.
  - Novos `Stage`s para `gateway.route` e `gateway.fallback`, surfaceados no inspetor.
  - Limites de orçamento aplicados no servidor; o limite e o saldo restante visíveis no bloco do
    gateway.

### 🟡 Guardrails (segurança de entrada / saída)
- **Onde aparece.** `stations.ts` → estação `guardrails` (tier `aiops`, `comingSoon: true`).
- **O que é.** Verifica prompts e respostas contra **prompt injection, PII e conteúdo inseguro**
  antes de passarem. Dois pontos de chamada reais: pré-LLM no prompt, pós-LLM na resposta.
- **Exemplos de nuvem.** Azure AI Content Safety · Bedrock Guardrails · Model Armor.
- **O que uma spec adicionaria.**
  - Checagens reais de entrada + saída (ex.: `presidio` para PII, um SDK de guardrails open para o
    resto).
  - Novos `Stage`s `guard.input` / `guard.output` com **fail-fast em bloqueio** e uma UX clara de
    resposta bloqueada (sobrepõe com a spec [017-failure-injection](../specs/017-failure-injection/) —
    reusar).
  - Testes que provam que um prompt sabidamente malicioso é bloqueado e um prompt limpo passa.

### 🟡 Cache Semântico (cache de prompt / embedding)
- **Onde aparece.** `stations.ts` → estação `cache` (tier `aiops`, `comingSoon: true`).
- **O que é.** Devolve uma resposta armazenada para **consultas semanticamente próximas** — grande
  economia de latência e custo. Chave pela similaridade de embedding, não pelo texto exato do prompt.
- **Exemplos de nuvem.** Azure Cache for Redis · ElastiCache (Redis) · Memorystore (Redis).
- **O que uma spec adicionaria.**
  - Uma checagem real de cache antes da chamada ao LLM e um upsert depois; threshold de similaridade
    configurável.
  - Novos `Stage`s `cache.lookup` (hit / miss) e `cache.upsert`; o HUD mostra a economia de
    cache-hit (casa com as specs [011-token-cost](../specs/011-token-cost/) e
    [018-cumulative-hud](../specs/018-cumulative-hud/)).
  - Honestidade: uma resposta cacheada precisa ser **rotulada como cacheada** na UI (não é uma
    chamada fresca ao LLM).

### 🟡 Eval Runner (RAGAS / LLM-como-juiz)
- **Onde aparece.** `stations.ts` → estação `eval` (tier `aiops`, `comingSoon: true`).
- **O que é.** Pontua respostas contra um **golden set** (fidelidade, relevância da resposta, NDCG
  da recuperação) e barra regressões no CI — a resposta de produção para *"nossa mudança melhorou?"*.
- **Exemplos de nuvem.** Azure AI Evaluation · Bedrock model evaluation · Vertex Gen AI evaluation.
- **O que uma spec adicionaria.**
  - Um golden set sob `backend/app/data/` e um runner sob `backend/app/eval/`.
  - Uma ação "Rodar evals" sob demanda na UI que streama resultados para um novo painel de inspetor.
  - Uma porta de CI que falha o build quando fidelidade / NDCG caem abaixo dos thresholds (estende
    `ci.yml`).

### 🟡 Sink de Observabilidade (traces de LLM · OpenTelemetry GenAI)
- **Onde aparece.** `stations.ts` → estação `observability` (tier `aiops`, `comingSoon: true`).
- **O que é.** Captura **cada prompt, resposta, contagem de tokens, latência e custo** como traces
  estruturados de LLM — a versão de produção do que a spec
  [038-execution-traces](../specs/038-execution-traces/) mostra inline.
- **Exemplos de nuvem.** Azure Monitor / App Insights · CloudWatch / X-Ray · Cloud Trace /
  Monitoring.
- **O que uma spec adicionaria.**
  - Export OTel GenAI real do backend (o trace já existe em memória via `app/trace.py` — isso é o
    sink de produção, não um modelo de trace novo).
  - Um toggle (env + UI) para habilitar o export; o bloco de observabilidade mostra o sink
    configurado.

---

## 🔧 Costuras transversais — fora do canvas

Estas não têm bloco próprio — são costuras que o código já mantém abertas. Cada uma é um TODO
genuíno para prontidão de produção.

### 🔧 Suporte a múltiplos provedores de LLM
- **Onde está a costura.** `backend/app/llm/provider.py` — a ABC `LLMProvider` é **explicitamente
  mantida como uma costura fina**. Hoje `get_provider()` sempre devolve `OpenAIProvider`, e sem
  `OPENAI_API_KEY` levanta `MissingAPIKeyError`. Mesma história para embeddings em
  `backend/app/rag/embeddings.py`.
- **O que falta.**
  - Um segundo provedor concreto (ex.: `AnthropicProvider`, `AzureOpenAIProvider`, um provider
    local via Ollama para dev offline) implementando `decide`, `stream_answer` e surfaceando
    `TokenUsage` real.
  - Seleção dirigida por config (env: `LLM_PROVIDER=openai|anthropic|...`) em vez de OpenAI fixo em
    `get_provider()`.
  - O mesmo para embeddings (a costura `EMBEDDING_PROVIDER`).
- **Por que esse é o formato certo.** Uma vez que **multi-provider** entre, o **Gateway de LLM**
  acima vira o orquestrador natural (roteando entre provedores, fallback quando um degrada).
- **Checagem da constituição.** §2 atualmente exige *provedor único (OpenAI) obrigatório* —
  adicionar multi-provider é uma **emenda** (constituição §A) antes do código. Abra uma spec em
  `specs/` que proponha a emenda e a implementação juntas.

### 🔧 Roteador de modelos (seleção de modelo por requisição)
- **Onde a costura ficaria.** Dentro do futuro bloco **Gateway de LLM**, ou como um passo de
  roteamento em `get_provider()` / dentro de `OpenAIProvider`. Hoje o modelo é fixo em `LLM_MODEL`
  (padrão `gpt-4o-mini`).
- **O que é.** Rotear por requisição para o modelo mais barato que dá conta do trabalho (ex.:
  classificação → `gpt-4o-mini`; raciocínio longo → `gpt-4o`; muito uso de ferramentas → `gpt-4o`).
  O agente declara a *classe da tarefa*; o roteador escolhe o modelo.
- **O que uma spec adicionaria.** Uma política de roteamento (tabela declarativa ou um pequeno
  classificador), um novo `Stage` `gateway.route` mostrando o modelo escolhido + a razão, e
  contabilidade de custo por modelo no HUD.

### 🔧 Autenticação, sessões & rate limiting
- **Onde está sinalizado.** Ressalvas honestas em `stations.ts` (`whatBreaks` das estações
  `frontend` + `backend`): *"esta demo não tem autenticação real — é um stub; produção precisa de
  login, sessões e rate limiting antes de o agente rodar."*
- **O que falta.** Uma camada real de authn/z no ingress FastAPI (ex.: JWT / cookies de sessão),
  rate limiting por identidade, e um store de sessão real.
- **O que uma spec adicionaria.** Um fluxo de login, um middleware de sessão, um middleware de
  rate-limit e uma matriz de testes provando 401 sem credenciais e 429 sob burst.

### 🔧 Multi-réplica / estado compartilhado
- **Onde está sinalizado.** `whatBreaks` da estação `database` ("esta demo é de instância única; o
  armazenamento de traces fica em memória, perdido ao reiniciar, não compartilhado entre
  réplicas"). Reforçado pela constituição §7 (*instância única*).
- **O que falta.** O `TraceStore` em memória (e o `MemorySaver` no agente LangGraph) são
  deliberadamente locais do processo. Produção precisa de um backend compartilhado (Redis / SQL
  gerenciado) e de um pool na frente do DB relacional.
- **O que uma spec adicionaria.** Um `TraceStore` plugável (impl Redis), uma troca do
  `Checkpointer` do LangGraph e um teste de carga demonstrando duas réplicas servindo a mesma
  conversa.
- **Checagem da constituição.** §7 atualmente exige *instância única* — mesma história que
  multi-provider: emendar a constituição como parte da spec.

---

## Como reivindicar um item

1. **Abra uma issue** no repositório nomeando o item (ex.: *"Spec: Reranker (degrau
   Intermediário)"*).
2. **Copie o template de spec**: `cp -r specs/_template specs/NNN-sua-feature/` (escolha o próximo
   número com zero-padding).
3. **Escreva `spec.md` primeiro** — *O QUE + POR QUÊ + critérios de aceitação numerados e
   testáveis.* Sem código ainda.
4. **Plano + tarefas** — `plan.md` (COMO, arquivos afetados, impacto em protocolo/i18n/nuvem) e
   `tasks.md` (checklist TDD; cada tarefa de implementação precedida pelo teste que falha).
5. **Implemente red → green → refactor**, mantenha o status da spec andando (`draft → clarified →
   planned → in-progress → done`) e abra um PR.
6. **Portas de qualidade (espelho do `ci.yml` + constituição):** `ruff check .` · `ruff format .` ·
   `pytest -q` (com `OPENAI_API_KEY`) · `npm run build` · `npm test` · espelho do protocolo em
   sincronia (§1) · cada `Stage` mapeado para uma estação (§6) · todo texto voltado ao usuário em
   **en + pt** (§4) · mapa de nuvem preenchido para qualquer nova tier/estação (§5).

Se uma mudança toca o protocolo de eventos, adiciona/remove um `Stage`, ou adiciona uma
estação/hop/tier, ela é uma **feature → spec obrigatória**, por menor que pareça (constituição
§10, regra da zona cinza).

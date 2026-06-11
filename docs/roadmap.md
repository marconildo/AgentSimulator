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

### ✅ DeepAgents runtime — SHIPPED (057-deepagents-runtime)
- **Status.** Done. On the **Intermediate** rung the `DeepAgents` relabel is now backed by a
  **real, model-driven runtime** — planning, a virtual file system and sub-agent delegation are
  **tools the agent elects inside its ReAct loop** (not a scripted preamble; a greeting elects
  none of them). Simple never sees the tools (byte-for-byte).
- **What shipped — the four pillars, hand-built.** Six native tools (`agent/tools.py`, gated by
  `with_deepagents` — Intermediate and not RAGLESS) with handlers in
  `backend/app/agent/deepagents.py`: **(1) Planning** — `write_todos` maintains a todo list with
  per-item *status* (`agent.plan`); **(2) Virtual file system** — `write_file`/`read_file`/
  `edit_file`/`ls` over `AgentState["vfs"]` (`agent.fs.write`/`agent.fs.read`); **(3) Sub-agents** —
  `task` spawns a **real bounded sub-agent** (`run_subagent`: own prompt + tools + thread + ReAct
  loop, context quarantine — only its result returns) (`agent.delegate`); **(4) Detailed prompt** —
  `DEEPAGENTS_PROMPT` on the role layer. Four new `Stage`s mapped to the `agent` station + `reason`
  phase (§1, §6); the Agent drill-in gains **Plan** (with status badges) and **Virtual file system**
  panels + the sub-agent tool-trail (pure projection in `frontend/src/lib/deepagents.ts`); all prose
  bilingual (EN + PT). *Deferred:* the library's summarization middleware + the Advanced
  researcher/coder/critic trio. See [`specs/057-deepagents-runtime/`](../specs/057-deepagents-runtime/).
- **What's still open (later specs).** The Advanced-rung **DeepAgents + Multi-agents**
  orchestration (the full researcher/coder/critic trio under an orchestrator) — see the Advanced
  section below — and persisting the virtual FS across turns.

### ✅ Reranker (cross-encoder) — SHIPPED (054-rag-block-expansion)
- **Status.** Done. Reranking is a **real query-time sub-stage of the `rag` (Vector DB) station**
  (`rag.rerank`, no separate tile), and the Intermediate rung now executes.
- **What shipped.** A real reranker call between `rag.search` and `rag.retrieve` (new `rag.rerank`
  `Stage`), using a **local FlashRank cross-encoder** (`backend/app/rag/reranker.py`; ONNX, no
  torch, no key, deterministic). Retrieval fetches a wider pool (`rerank_fetch_k`), re-scores, and
  trims to `top_k`; the Simple rung never reranks (byte-for-byte). The stage is mapped in
  `STAGE_TO_STATION`/`STAGE_TO_PHASE`, with a readout + inspector rank-movement detail and the
  `RagDetail` "open full view" drill-in (Chunking → Embedding → Retrieval → Reranking), all
  bilingual (EN + PT). See [`specs/054-rag-block-expansion/`](../specs/054-rag-block-expansion/).

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

### 🔧 Security & trust — the *cybersecurity* seams

The five seams below are the security cluster the project owes to a production-ready posture.
The visible tile in this area today is **Guardrails** (🟡 AIOps above), which is scoped to *content
safety* (injection · PII · toxicity). Everything below is about **identity, secrets, the supply
chain and runtime isolation** — none of it is wired up yet, and each is its own future spec.

### 🔧 Secrets management & egress DLP
- **Where the seam would live.** Today secrets come from `backend/.env` (`OPENAI_API_KEY` read via
  `pydantic-settings`). There is no redaction on prompts, answers, traces or logs — `prompt_preview`
  in `backend/app/trace.py` and the `trace_events` SQLite table (spec
  [048-persist-traces](../specs/048-persist-traces/)) store raw text.
- **What's missing.**
  - A real secrets backend (cloud KMS / Vault / Key Vault / Secrets Manager / Secret Manager)
    behind the same `Settings`, so keys are never on disk in plain text.
  - An **egress DLP filter** on every `TraceEvent` and every assistant message: redact API keys,
    cloud credentials, JWTs, emails, CPF/SSN-like strings before they hit the SSE stream, the
    SQLite store *and* the future observability sink.
  - A **prompt-side secret scanner** before the LLM call (catches `OPENAI_API_KEY=…` and friends
    pasted by the user) — the dual to Guardrails' PII check.
- **What a spec would add.**
  - A pluggable `SecretRedactor` invoked from `TraceEmitter._persist` and from the SSE writer; a
    small detection ruleset (regex + entropy) with bilingual test fixtures.
  - A `secrets.redact` `Stage` and inspector readout that says **what** was redacted (kind +
    count), never **the secret**.
  - Tests proving (a) a known-good key in the prompt never reaches the model; (b) a known-good
    key in the answer never reaches the SSE stream nor the DB.
- **Why it's its own seam (not Guardrails).** Guardrails is *content safety*; this is *secrets
  hygiene* — a separate detection problem whose failure mode is a leaked credential, not an
  unsafe sentence.

### 🔧 Supply chain (SBOM · dependency scan · MCP trust)
- **Where the seam would live.** Today CI (`.github/workflows/ci.yml`) runs `ruff` + `pytest` +
  `npm run build` + `npm test`. No SBOM, no dependency scan, no image verification, no MCP
  provenance check.
- **What's missing.**
  - **SBOM generation** in CI (CycloneDX or SPDX) for the backend (`pip-audit` / `cyclonedx-py`)
    and the frontend (`@cyclonedx/cyclonedx-npm`).
  - **Vulnerability scanning** that fails the build on critical CVEs (Snyk / Dependabot / Trivy /
    `pip-audit`), with a documented severity threshold.
  - **Image verification** in the `Dockerfile`s: base image digests pinned (no `:latest`), and the
    published image signed (e.g. cosign / Sigstore) so deploys can verify provenance.
  - **MCP server trust.** Today `backend/app/mcp/client.py` is happy to load tools from any stdio
    process; production needs an **allowlist of trusted MCP servers** (and one day, signed MCP
    manifests) — an untrusted MCP server can return a tool *description* that is itself a
    prompt-injection attack against the agent.
- **What a spec would add.**
  - CI jobs that produce an SBOM artifact per release and run the dep-scanner; image-signing in
    the publish workflow.
  - An `MCP_SERVER_ALLOWLIST` config in `backend/app/config.py` checked in `client.py` before
    `ClientSession.initialize()`; a test that an unlisted server raises and the agent falls back
    to `local-fallback`.
  - Bilingual blurbs in the Tools/MCP inspector readout naming the trust posture.

### 🔧 Tool runtime isolation (sandbox · egress control)
- **Where the seam would live.** Today `backend/app/mcp/server.py` runs **in the same process** as
  the agent in `local-fallback`, and over **stdio in the same container** in the normal path. The
  `calculator` and `current_time` tools are pure; `kb_lookup` and `load_skill` touch the DB. None
  are sandboxed.
- **What's missing.**
  - **Process/container isolation per tool** — a runner that executes each MCP tool in a sandbox
    (gVisor / Kata / Firecracker / a separate container with a read-only FS), so a compromised
    tool cannot read `.env` or the SQLite DB.
  - **Egress allowlist per tool** — declarative network policy (`current_time` may not reach the
    internet; `search_knowledge_base` may only reach the embedding endpoint and Chroma). Default
    deny; surface the allowlist on the tool's inspector card.
  - **Resource caps** — CPU, memory and wall-clock budget per tool call, enforced at the runner
    (today only the agent's `MAX_ITERATIONS=3` bound exists).
- **What a spec would add.**
  - A `ToolRunner` abstraction in `mcp/client.py` with a `LocalRunner` (today) and a
    `SandboxedRunner` (e.g. subprocess + seccomp on Linux, container in production).
  - New `Stage`s `tool.sandbox.start` / `tool.sandbox.deny` carrying the profile + egress
    decision; readouts on the Tools station.
  - Tests proving an offending tool (e.g. one that tries to open `/etc/passwd`) is blocked and
    the agent surfaces a typed error.

### 🔧 Identity (OIDC · workload identity · KMS)
- **Where the seam would live.** The existing *Authentication, sessions & rate limiting* seam
  above covers **user identity** at the FastAPI ingress. This seam is the missing **workload +
  key identity** layer: how the *backend itself* proves who it is to OpenAI, to the DB, to the
  secrets backend.
- **What's missing.**
  - **Workload identity** for the backend container (Azure Workload Identity / AWS IRSA / GKE
    Workload Identity) so the runtime has no static cloud credentials — it federates with the
    cloud IdP via OIDC.
  - **Service-to-service OIDC** between any future tier (gateway → backend, eval-runner → backend)
    instead of shared API keys.
  - **KMS-backed keys** for the SQLite DB and any future managed SQL — encryption at rest with a
    customer-managed key, rotation on schedule.
- **What a spec would add.**
  - A config selector for credential acquisition (`CREDENTIAL_MODE=env|workload-identity`) wired
    through `Settings`; a small integration test using a fake OIDC issuer.
  - A `secrets.acquire` `Stage` emitted once per cold start that records the source (env vs. IdP),
    surfaced on the backend station's tech list.
  - Cloud examples filled for all three (`clouds: { azure, aws, gcp }`) per constitution §5.
- **Why it's separate from the user-auth seam.** User auth answers *"who is talking to the
  agent?"*; this seam answers *"as whom is the agent talking to OpenAI, the DB and the vault?"* —
  different threat model.

### 🔧 Model abuse / jailbreak detection
- **Where the seam would live.** Adjacent to the **Guardrails** tile (🟡 AIOps above), but worth
  naming separately so it isn't confused with content safety. Guardrails today is scoped to
  *injection · PII · toxicity*; abuse detection is the **identity-aware behavioural** layer.
- **What's missing.**
  - **Per-identity budgets** beyond a plain ingress rate-limit — *N tokens/minute per user*,
    *M tool calls/minute*, *cost cap per session* — driven by the future user-auth seam.
  - **Jailbreak classifier** on the prompt (a small classifier or an LLM-judge) flagging known
    patterns; the result feeds the guardrails decision but is reported separately so we can tell
    *content unsafe* from *user trying to jailbreak*.
  - **Abuse-score telemetry** exported to the observability sink for trend analysis
    (Lakera / Adversa / public jailbreak datasets are the obvious comparables).
- **What a spec would add.**
  - A `jailbreak.score` `Stage` between `route` and `think`, emitting a score + label; soft-fail
    (warn + downgrade) below a threshold, hard-fail (refuse) above it.
  - HUD chip showing the score on the current turn; an opt-out for the educational mode so the
    canvas can demonstrate a flagged but allowed run.
  - Tests using public jailbreak fixtures (e.g. a subset of DAN-style prompts) — structural
    assertions, not exact-string.

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

### ✅ Runtime DeepAgents — ENTREGUE (057-deepagents-runtime)
- **Status.** Concluído. No degrau **Intermediário** o rótulo `DeepAgents` agora tem um **runtime
  real e dirigido pelo modelo** — planejamento, sistema de arquivos virtual e delegação a
  subagente são **tools que o agente elege dentro do loop ReAct** (não um preâmbulo roteirizado;
  uma saudação não dispara nenhuma). O Simples nunca vê as tools (byte-for-byte).
- **O que foi entregue — os quatro pilares, feitos à mão.** Seis tools nativas (`agent/tools.py`,
  gateadas por `with_deepagents` — Intermediário e sem RAGLESS) com handlers em
  `backend/app/agent/deepagents.py`: **(1) Planejamento** — `write_todos` mantém uma lista de todos
  com *status* por item (`agent.plan`); **(2) Sistema de arquivos virtual** — `write_file`/
  `read_file`/`edit_file`/`ls` sobre `AgentState["vfs"]` (`agent.fs.write`/`agent.fs.read`);
  **(3) Subagentes** — `task` spawna um **subagente real e limitado** (`run_subagent`: prompt +
  tools + thread + loop ReAct próprios, contexto isolado — só o resultado volta) (`agent.delegate`);
  **(4) Prompt detalhado** — `DEEPAGENTS_PROMPT` na camada de role. Quatro novos `Stage`s mapeados
  para a estação `agent` + fase `reason` (§1, §6); o drill-in do Agente ganha painéis **Plano** (com
  selos de status) e **Sistema de arquivos virtual** + a trilha de tools do subagente (projeção pura
  em `frontend/src/lib/deepagents.ts`); toda prosa bilíngue (EN + PT). *Adiado:* o middleware de
  summarization da lib + o trio researcher/coder/critic do Avançado. Veja
  [`specs/057-deepagents-runtime/`](../specs/057-deepagents-runtime/).
- **O que ainda falta (specs futuras).** A orquestração **DeepAgents + Multiagentes** do degrau
  Avançado (o trio researcher/coder/critic sob um orquestrador) — veja a seção Avançado abaixo — e
  persistir o FS virtual entre turnos.

### ✅ Reranker (cross-encoder) — ENTREGUE (054-rag-block-expansion)
- **Status.** Concluído. O reranking é uma **sub-etapa real de tempo de consulta da estação `rag`
  (Vector DB)** (`rag.rerank`, sem tile separado), e o degrau Intermediário agora executa.
- **O que foi entregue.** Uma chamada real ao reranker entre `rag.search` e `rag.retrieve` (novo
  `Stage` `rag.rerank`), usando um **cross-encoder FlashRank local** (`backend/app/rag/reranker.py`;
  ONNX, sem torch, sem chave, determinístico). A recuperação busca um pool maior (`rerank_fetch_k`),
  reordena e corta para o `top_k`; o degrau Simples nunca reordena (byte-for-byte). O estágio está
  mapeado em `STAGE_TO_STATION`/`STAGE_TO_PHASE`, com readout + detalhe de movimento de rank no
  inspetor e o drill-in `RagDetail` "abrir visão completa" (Chunking → Embedding → Recuperação →
  Reranking), tudo bilíngue (EN + PT). Veja [`specs/054-rag-block-expansion/`](../specs/054-rag-block-expansion/).

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

### 🔧 Segurança & confiança — as costuras de *cibersegurança*

As cinco costuras abaixo são o cluster de segurança que o projeto deve a uma postura pronta para
produção. O único bloco visível nessa área hoje é o **Guardrails** (🟡 AIOps acima), cujo escopo é
*segurança de conteúdo* (injection · PII · toxicidade). Tudo abaixo é sobre **identidade,
segredos, cadeia de suprimentos e isolamento de runtime** — nada disso está ligado ainda, e cada
um é uma spec futura própria.

### 🔧 Gestão de segredos & DLP de egress
- **Onde a costura ficaria.** Hoje os segredos vêm do `backend/.env` (`OPENAI_API_KEY` lido via
  `pydantic-settings`). Não há redação em prompts, respostas, traces ou logs — `prompt_preview` em
  `backend/app/trace.py` e a tabela SQLite `trace_events` (spec
  [048-persist-traces](../specs/048-persist-traces/)) guardam texto cru.
- **O que falta.**
  - Um backend real de segredos (KMS na nuvem / Vault / Key Vault / Secrets Manager / Secret
    Manager) por trás do mesmo `Settings`, para que as chaves nunca fiquem em disco em texto puro.
  - Um **filtro DLP de egress** em todo `TraceEvent` e em toda mensagem do assistente: redigir
    chaves de API, credenciais de nuvem, JWTs, e-mails e strings tipo CPF/SSN antes de chegarem ao
    stream SSE, ao SQLite *e* ao futuro sink de observabilidade.
  - Um **scanner de segredos no lado do prompt** antes da chamada ao LLM (pega `OPENAI_API_KEY=…`
    e parecidos colados pelo usuário) — o dual da checagem de PII do Guardrails.
- **O que uma spec adicionaria.**
  - Um `SecretRedactor` plugável invocado a partir de `TraceEmitter._persist` e do writer SSE; um
    conjunto pequeno de regras de detecção (regex + entropia) com fixtures de teste bilíngues.
  - Um `Stage` `secrets.redact` e um readout no inspetor que diz **o que** foi redigido (tipo +
    contagem), nunca **o segredo**.
  - Testes provando (a) uma chave conhecida no prompt nunca chega ao modelo; (b) uma chave
    conhecida na resposta nunca chega ao stream SSE nem ao DB.
- **Por que é uma costura própria (e não Guardrails).** Guardrails é *segurança de conteúdo*; isto
  é *higiene de segredos* — um problema de detecção distinto cujo modo de falha é uma credencial
  vazada, não uma frase insegura.

### 🔧 Cadeia de suprimentos (SBOM · scan de dependências · confiança em MCP)
- **Onde a costura ficaria.** Hoje o CI (`.github/workflows/ci.yml`) roda `ruff` + `pytest` +
  `npm run build` + `npm test`. Sem SBOM, sem scan de dependências, sem verificação de imagem, sem
  checagem de proveniência de MCP.
- **O que falta.**
  - **Geração de SBOM** no CI (CycloneDX ou SPDX) para o backend (`pip-audit` / `cyclonedx-py`) e
    o frontend (`@cyclonedx/cyclonedx-npm`).
  - **Scan de vulnerabilidades** que faz o build falhar em CVEs críticos (Snyk / Dependabot /
    Trivy / `pip-audit`), com limiar de severidade documentado.
  - **Verificação de imagem** nos `Dockerfile`s: digests da imagem base pinados (sem `:latest`) e a
    imagem publicada assinada (ex.: cosign / Sigstore) para que os deploys verifiquem proveniência.
  - **Confiança em servidor MCP.** Hoje `backend/app/mcp/client.py` aceita carregar tools de
    qualquer processo stdio; produção precisa de uma **allowlist de servidores MCP confiáveis** (e
    um dia, manifestos MCP assinados) — um servidor MCP não confiável pode devolver uma
    *descrição* de tool que é em si um ataque de prompt-injection contra o agente.
- **O que uma spec adicionaria.**
  - Jobs de CI que produzem um artefato SBOM por release e rodam o dep-scanner; assinatura de
    imagem no workflow de publicação.
  - Uma config `MCP_SERVER_ALLOWLIST` em `backend/app/config.py` checada em `client.py` antes de
    `ClientSession.initialize()`; um teste de que um servidor fora da lista levanta e o agente cai
    para `local-fallback`.
  - Blurbs bilíngues no readout do inspetor de Tools/MCP nomeando a postura de confiança.

### 🔧 Isolamento de runtime de tools (sandbox · controle de egress)
- **Onde a costura ficaria.** Hoje `backend/app/mcp/server.py` roda **no mesmo processo** do agente
  no `local-fallback`, e por **stdio no mesmo container** no caminho normal. As tools `calculator`
  e `current_time` são puras; `kb_lookup` e `load_skill` tocam o DB. Nenhuma está em sandbox.
- **O que falta.**
  - **Isolamento por tool (processo/container)** — um runner que execute cada tool MCP em sandbox
    (gVisor / Kata / Firecracker / um container separado com FS read-only), para que uma tool
    comprometida não consiga ler `.env` ou o SQLite.
  - **Allowlist de egress por tool** — política de rede declarativa (`current_time` não pode
    alcançar a internet; `search_knowledge_base` só pode alcançar o endpoint de embeddings e o
    Chroma). Default deny; surfacear a allowlist no card de inspetor da tool.
  - **Limites de recursos** — orçamento de CPU, memória e tempo por chamada de tool, aplicado no
    runner (hoje só existe o limite `MAX_ITERATIONS=3` do agente).
- **O que uma spec adicionaria.**
  - Uma abstração `ToolRunner` em `mcp/client.py` com `LocalRunner` (hoje) e `SandboxedRunner`
    (ex.: subprocess + seccomp no Linux, container em produção).
  - Novos `Stage`s `tool.sandbox.start` / `tool.sandbox.deny` carregando o perfil + decisão de
    egress; readouts na estação Tools.
  - Testes provando que uma tool ofensiva (ex.: uma que tenta abrir `/etc/passwd`) é bloqueada e
    o agente surfacia um erro tipado.

### 🔧 Identidade (OIDC · workload identity · KMS)
- **Onde a costura ficaria.** A costura *Autenticação, sessões & rate limiting* acima cobre a
  **identidade do usuário** no ingress do FastAPI. Esta costura é a camada faltante de
  **identidade de workload + de chaves**: como o *próprio backend* prova quem é para a OpenAI,
  para o DB e para o backend de segredos.
- **O que falta.**
  - **Workload identity** para o container do backend (Azure Workload Identity / AWS IRSA / GKE
    Workload Identity) para que o runtime não tenha credenciais estáticas de nuvem — ele federa
    com o IdP da nuvem via OIDC.
  - **OIDC serviço-a-serviço** entre qualquer tier futura (gateway → backend, eval-runner →
    backend) em vez de chaves de API compartilhadas.
  - **Chaves apoiadas em KMS** para o SQLite e qualquer SQL gerenciado futuro — criptografia em
    repouso com chave gerenciada pelo cliente, rotação em cronograma.
- **O que uma spec adicionaria.**
  - Um seletor de config para aquisição de credencial (`CREDENTIAL_MODE=env|workload-identity`)
    cabeado pelo `Settings`; um teste de integração pequeno usando um issuer OIDC fake.
  - Um `Stage` `secrets.acquire` emitido uma vez por cold start registrando a fonte (env vs. IdP),
    surfaceado na lista `tech` da estação backend.
  - Exemplos de nuvem preenchidos para os três (`clouds: { azure, aws, gcp }`) pela constituição §5.
- **Por que é separada da costura de user-auth.** User-auth responde *"quem está falando com o
  agente?"*; esta responde *"como quem o agente fala com a OpenAI, o DB e o cofre?"* — modelo de
  ameaça diferente.

### 🔧 Abuso de modelo / detecção de jailbreak
- **Onde a costura ficaria.** Adjacente ao bloco **Guardrails** (🟡 AIOps acima), mas vale nomear
  separadamente para não confundir com segurança de conteúdo. Guardrails hoje tem escopo de
  *injection · PII · toxicidade*; detecção de abuso é a camada **comportamental ciente de
  identidade**.
- **O que falta.**
  - **Orçamentos por identidade** além de um rate-limit de ingress simples — *N tokens/minuto por
    usuário*, *M chamadas de tool/minuto*, *teto de custo por sessão* — apoiados pela costura
    futura de user-auth.
  - **Classificador de jailbreak** no prompt (um classificador pequeno ou LLM-juiz) sinalizando
    padrões conhecidos; o resultado alimenta a decisão do guardrails mas é reportado em separado
    para distinguir *conteúdo inseguro* de *usuário tentando jailbreak*.
  - **Telemetria de abuse-score** exportada para o sink de observabilidade para análise de
    tendência (Lakera / Adversa / datasets públicos de jailbreak são os comparáveis óbvios).
- **O que uma spec adicionaria.**
  - Um `Stage` `jailbreak.score` entre `route` e `think`, emitindo score + label; soft-fail (warn +
    downgrade) abaixo de um threshold, hard-fail (recusa) acima dele.
  - Chip no HUD mostrando o score no turno atual; um opt-out para o modo educacional para que o
    canvas possa demonstrar um run sinalizado mas permitido.
  - Testes usando fixtures públicas de jailbreak (ex.: um subset de prompts tipo DAN) — asserções
    estruturais, não string exata.

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

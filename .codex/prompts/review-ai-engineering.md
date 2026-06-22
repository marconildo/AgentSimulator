---
description: Read-only review of the AI-engineering substance — honesty, the bounded ReAct loop, prompts, and RAG correctness.
---

Review the **AI-engineering substance** of the current **AgentSimulator** change — not just whether code compiles, but whether the agentic behavior is honest, bounded, and teaches the right thing. The project's whole purpose is an *honest* visualization of a real agent lifecycle. **Read-only — report, don't edit.** Ground points in `git diff` and `AGENTS.md`.

## Scrutinize

1. **Everything is real, nothing faked (§3).** Reasoning, embeddings, the LangGraph loop, Chroma, SQLite, and MCP tool execution must be genuine. Flag any fabricated result, stubbed score, or hardcoded "answer" presented as real. The line between **real** components (rag · mcp · rerank · hybrid · ragless · deepagents runtime — they execute) and **preview** components (`comingSoon`, `stages: []` — only draw a labelled box) must stay honest: a preview must never fake a run.
2. **Bounded, canonical ReAct loop.** `START → route → think ⇄ tools → generate → respond → END`. `_should_continue` loops to `tools` while there are pending calls and `iterations <= MAX_ITERATIONS (3)`. Flag unbounded loops, a raised cap without justification, or reasoning that bypasses the canonical `AgentState.messages` thread (`AIMessage(tool_calls=…)` appended; tool results as `ToolMessage`).
3. **Retrieval is an honest agent decision (026).** RAG is reached via the native `search_knowledge_base` tool the model *elects* to call — not a forced `retrieve` node. Flag re-introduction of mandatory retrieval or anything that hides the tool-call.
4. **Prompt layering (042/049).** The system message composes identity → guardrails → role → skills catalog via `_effective_system`/`compose_system`. Per-request overrides (`system_prompt`=guardrails, `agent_prompt`=role) fall back on blank, capped at 2000. Flag planning-mandate leakage into the final answer (cf. the deepagents final-answer fix) or dropped identity/guardrail layers.
5. **RAG correctness.** Chunking → embedding → top-k similarity (`similarity = 1 - distance`) → optional rerank (FlashRank cross-encoder) → optional hybrid (BM25+vector RRF). Rerank/hybrid are query-time **sub-stages of the rag station**, not new nodes. Flag a distance used as a similarity, a rerank that mutates the cached registry, or a sub-stage promoted to a fake standalone Stage.
6. **Pedagogical honesty.** Readouts/metrics shown to the user reflect real numbers (tiktoken token counts, retrieval metrics over a labelled golden set with an honest "no ground truth" path, `proxied=false` when no real proxy). Flag invented metrics or misleading labels.
7. **Request-only inputs don't become stages.** `top_k`, `model`, `rerank`, `runtime`, `ragless`, `simulate_failure`, attachments change *how* a run executes without adding a Stage. Omitting all must reproduce default behavior byte-for-byte. Flag a new request input that silently changes the default path.

**Output:** per-area ✅/❌ with `file:line`. Call out any **dishonesty** (faked/preview-as-real) as must-fix, and any unbounded/uncanonical agent behavior. End with a verdict on whether the change keeps the visualization honest. Do not modify files.

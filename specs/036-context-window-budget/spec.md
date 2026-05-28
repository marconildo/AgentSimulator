# Spec: Context-window budget — the `/context`-style token grid

| | |
|---|---|
| **ID** | 036-context-window-budget |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> The HOW is in `plan.md`. This spec turns the Agent-anatomy "context window" panel
> from a composition-only bar into an honest **budget against the model's real
> maximum** — a token grid with a per-category split and free space, in the spirit
> of Claude Code's `/context` "Context Usage" view.

## Problem / motivation

The app's whole pitch is *everything is real*, and the Agent drill-in already promises
to show "the context window." But today's context-window panel (`AgentDetail`,
020-turn-diff) is honest about **composition** and dishonest about **scale**:

- **No ceiling.** It shows the *proportions* of what was assembled (system / rag / tools
  / history) but never against a maximum. The lesson the code itself says it teaches —
  *"the context window is finite and grows with the conversation"* (`turnDiff.ts`) — is
  shown only as growth, never against a limit. There is no "X of N max tokens (Z%)".
- **Estimate, not real.** The split is a coarse `chars/4` estimate (`tok()` in
  `turnDiff.ts`), shown right next to the **real** billed `prompt_tokens`/cost block. An
  app that sells "everything is real" shows an *estimated* window beside *real* costs —
  a small but real credibility crack, and the two can disagree.
- **Tool definitions are invisible.** The tool *schemas* sent to the model on **every**
  reasoning round are usually the biggest hidden slice of the prompt, yet they are
  counted in **no** category. So the natural learner question — *"how many tokens are my
  tools costing me?"* — is unanswerable today. (The current "tools" bucket counts tool
  *result* text, not the definitions.)

Claude Code's `/context` view solves exactly this: a grid of cells sized to the model's
real window, colored by category, with a per-category token+percentage breakdown and an
explicit **Free space** slice. We want the same teaching artifact for our agent, fed by
**real** numbers.

## Goals

- Show the context window **against the model's real maximum**: a "used / max (pct)"
  headline and an explicit **Free space** slice — the window is visibly *finite*.
- Replace the `chars/4` estimate with the **real tokenizer** (`tiktoken`), computed
  **server-side** at prompt-assembly time and emitted on the trace, so the visual is a
  pure projection of real numbers (no FE re-estimation, no estimate-vs-real divergence).
- Attribute tokens to honest categories that mirror `/context`, **including a dedicated
  "Tool definitions" (System tools) category** — directly answering "tokens used by the
  tools."
- Keep it **cursor-aware**: the grid reflects the context window *as of the playhead*
  ("what's in the window up to this moment"), so step/replay and live streaming agree.
- Keep the **used total authoritative**: the headline "used" is the **real billed
  `prompt_tokens`** of the latest reasoning round; the per-category split is labelled an
  *estimate* (as `/context` itself labels it "Estimated usage by category").
- The 020 "compare with previous turn" diff reads the **same real budget** (one source of
  truth), not a parallel estimate.
- Degrade gracefully: a trace without the new fields (older/replayed) still renders,
  labelled estimated, using the existing fallback — no crash, no regression.
- All new prose bilingual (en + pt) per §4.

## Non-goals

- **No new `Stage`, station, hop or tier.** This is an *additive enrichment of existing
  `llm.prompt` event data* + a richer render of the existing Agent panel.
- **No invoice-accurate tool-token accounting.** Counting OpenAI's exact tool-call
  framing overhead is fuzzy; the per-category split is a **labelled teaching
  approximation** (like `pricing.py`), reconciled to the real `prompt_tokens` total.
- **No change to how the prompt is assembled or what the model receives** — purely
  observability. (The separate honesty fix — the Inspector's "assembled prompt" showing
  the *real interleaved thread* instead of only `HumanMessage`s — is **deferred to a
  follow-up spec, 037**; it is not in scope here.)
- No per-round history view of the window (we show the latest round ≤ cursor); no
  context-compaction / eviction simulation.
- No backend token-budget *enforcement* (we never trim to fit) — we only *measure*.

## User-facing behavior

In the **Agent → full view**, the "Context window" panel becomes a `/context`-style
**budget**:

```
CONTEXT WINDOW                          gpt-4o-mini · 128k window
■ ■ ■ ■ ■ ■ ▦ ▦ □ □ □ □ □ □ □ □ □ □ □ □   used 7.9k / 128k  (6%)
□ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □
□ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □   Estimated usage by category
                                          ● System prompt      2.6k   2.0%
                                          ● Tool definitions   3.1k   2.4%   ← tools' real cost
                                          ● Skills             0.3k   0.2%
                                          ● Memory (long-term) 0.4k   0.3%
                                          ● Retrieved context  1.0k   0.8%
                                          ● Messages           0.5k   0.4%
                                          ○ Free space       120.1k  93.8%
```

- A **grid of cells**, each cell ≈ a fixed slice of the model's real window; filled cells
  are colored by category in fixed order, remaining cells are **Free space**.
- A **headline** "used / max (pct)" using the **real** `prompt_tokens`, plus the model
  name + window size.
- A **legend** listing each category's estimated tokens and its % of the **window** (not
  just of the used portion), ending with **Free space**. Labelled "Estimated usage by
  category" so the split is honestly an estimate while used/max is real.
- It updates with the **playhead**: before the first reasoning round it shows an empty
  window (all free); after each `llm.prompt` it reflects that round's assembled window.
- The existing **"compare with previous turn"** (020) keeps working, now diffing the real
  per-category numbers.

Categories (fixed order, each a color), mapping `/context` to our agent:

| Category | What it counts |
|---|---|
| **System prompt** | the base instructions/persona sent to the model |
| **Tool definitions** | the serialized tool schemas (name + description + params) advertised this round — the "System tools" slice |
| **Skills** | the 027 skill catalog block + any loaded skill body |
| **Memory (long-term)** | prior `{message, answer}` turns folded in from the DB |
| **Retrieved context** | the RAG grounding chunks (the retrieval observation) |
| **Messages** | the conversation/working thread: user turn + assistant tool-call messages + non-RAG tool observations |
| **Free space** | `window − used` |

All labels in **en + pt**.

## Acceptance criteria

> Token counting is local (`tiktoken`) so most tests are **keyless**; one `[openai]` test
> pins the live emit end-to-end.

1. **AC1 — Model window map (keyless).** A model→context-window table returns the real
   window for known models (e.g. `gpt-4o-mini`, `gpt-4o`, `gpt-4.1*`); an unknown model
   returns a documented `DEFAULT_CONTEXT_WINDOW` (a sane non-zero fallback), never 0.
2. **AC2 — Real per-category split (keyless).** A `context_budget(...)` helper, given the
   assembled inputs (system, advertised tools, skills, history, retrieved context, thread),
   returns a per-category token count computed with **`tiktoken`** (not `chars/4`); a
   category with no content reports 0; the category set is exactly the seven above (six
   used + free).
3. **AC3 — Tool definitions are attributed (the core ask, keyless).** With tools advertised,
   the **Tool definitions** category is > 0 and equals the `tiktoken` count of the serialized
   tool schemas; with `enabled_tools: []` (no tools) it is 0. It is **distinct** from the
   Messages category (tool *results* are not counted as definitions, and vice-versa).
4. **AC4 — Emitted on the trace (additive protocol).** Each `llm.prompt` END `data` carries
   `context_window` (int) and `context_budget` (the per-category map); these are **mirrored**
   in `frontend/src/types/events.ts` (`PromptPreview`). **No new `Stage`**; `STAGE_TO_STATION`
   and `STAGE_TO_PHASE` are unchanged and still total over `Stage`. (`[openai]` end-to-end +
   a keyless node/provider-level assertion.)
5. **AC5 — Used is real, free = max − used (keyless projection).** Given a trace, the panel's
   "used" equals the **real** `prompt_tokens` of the latest `llm.prompt` round ≤ cursor;
   "Free space" = `context_window − used`; the percentage = `used / context_window`.
6. **AC6 — Cursor-aware (keyless projection).** The budget reflects the latest `llm.prompt`
   END **at or before** the cursor; with the cursor before any `llm.prompt`, the window
   renders fully free (0 used) with no crash; stepping forward fills it.
7. **AC7 — Grid renders `/context`-style (FE).** The Agent context-window panel renders: a
   fixed-count cell grid colored by category proportion with the remainder as Free space; a
   "used / max (pct)" headline with the model name; and a legend of every non-zero category
   with tokens + %-of-window, ending in Free space. `tsc --noEmit` green.
8. **AC8 — Turn-diff reads the real budget (020).** "Compare with previous turn" diffs the
   **emitted real** per-category numbers (one source of truth); when a turn lacks them it
   falls back to the `chars/4` estimate, labelled. The 020 parity test is updated to the
   new category set and passes.
9. **AC9 — Graceful fallback / regression.** A trace **without** `context_window`/`context_budget`
   (pre-feature or replayed) still renders the panel using the existing `chars/4` estimate,
   labelled "estimated", with no ceiling crash; omitting the new fields reproduces today's
   behavior for everything else.
10. **AC10 — Bilingual (§4).** Every new string (category labels, "used / max", "Free space",
    "Tool definitions", "Estimated usage by category", model-window tooltip) has non-empty
    en **and** pt.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **additive** keys on the existing `llm.prompt` END `data` —
  `context_window: int` and `context_budget: { system, tool_defs, skills, memory, retrieved,
  messages }` (token ints). Mirrored in `frontend/src/types/events.ts` (`PromptPreview`).
- Emitted in: `backend/app/agent/graph.py` `think_node`'s `llm.prompt` span (the assembly
  point), computed by a new `backend/app/llm/context.py` helper.
- Station mapping: unchanged — `llm.prompt` already maps to the `llm` station; no
  `STAGE_TO_STATION` / `STAGE_TO_PHASE` change; both stay total.
- `readoutFor` / `renderDetail`: unchanged station set (no new `case`). The richer render
  lives in `AgentDetail`'s existing context-window panel; the LLM Inspector may optionally
  show the used/max headline (no new station).

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Where is the budget computed — backend or frontend?** → **Backend**, with `tiktoken`,
  emitted on the trace. Honors §3 (everything real) and §6 (one source); kills the
  estimate-vs-real divergence. FE renders only.
- [x] **Used total — estimate or real?** → **Real** `prompt_tokens` for used/max; the
  per-category split is a labelled estimate (mirrors `/context`'s own "Estimated usage by
  category").
- [x] **Unknown-model window?** → a documented `DEFAULT_CONTEXT_WINDOW` (non-zero), labelled
  approximate — never 0 (a 0-window breaks the grid).
- [x] **Replace the composition bar or keep both?** → **Replace** it with the budget grid +
  legend (the bar's information is a strict subset of the budget).
- [x] **Does this also fix the "prompt preview shows only HumanMessages" honesty gap?** →
  **No** — that is a separate concern (the Inspector's assembled-prompt readout), deferred
  to **037-prompt-real-thread** to keep this spec single-feature.

## Out of scope / deferred

- **037-prompt-real-thread** — make the Inspector's "assembled prompt" show the real
  interleaved `thread` (system + Human + AIMessage(tool_calls) + ToolMessage), not just the
  user turns.
- Surfacing the loop governance (MAX_ITERATIONS / stop reason) — a separate small spec.
- Context-window *enforcement* / compaction / eviction simulation.
- A dedicated Learn topic for "the context window is finite" — defer to a Learn-content pass
  (023/024 style).

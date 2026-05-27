"""Shared state for the agent graph."""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    message: str
    # Conversation this run belongs to; scopes RAG retrieval to the base corpus
    # plus this conversation's uploaded documents (None = corpus only).
    session_id: str | None
    top_k: int
    # Delivery mode ("stream" | "batch"); batch generates the answer in one shot.
    mode: str
    # Experiment overrides (006-interactive-experiments), request-only inputs:
    #   system_prompt: full replacement for the default prompt (None/blank = default)
    #   enabled_tools: tool names to expose (None = all, [] = none) — gates the
    #                  retrieval tool too (026-agent-tool-autonomy)
    system_prompt: str | None
    enabled_tools: list[str] | None
    # Maturity-ladder rung (008-scenario-framework), request-only. Carried for
    # later specs to branch on; node logic does not read it yet.
    scenario: str
    # Forced failure for this run (017-failure-injection), request-only:
    #   "none" (default, unchanged) | "tool_error" | "llm_timeout".
    simulate_failure: str
    # Long-term memory: prior {message, answer} turns from the application DB.
    history: list[dict[str, str]]
    # Skill catalog (027-skills), request-derived: each {name, description} advertised
    # in the system prompt so the agent knows what it can load via `load_skill`. The
    # body is never here — it is loaded on demand. Empty list = no skills advertised.
    skills_catalog: list[dict[str, str]]
    # The canonical ReAct message thread (026-agent-tool-autonomy). The agent is
    # called on this running thread: a HumanMessage, then AIMessage(tool_calls) →
    # ToolMessage pairs as it decides + observes, then the final AIMessage. The
    # ``add_messages`` reducer appends updates across nodes — this is what a
    # LangSmith trace renders as the standard tool-calling chain, and what makes
    # every tool call (including knowledge-base retrieval) an *agent decision*
    # rather than something injected into the prompt.
    messages: Annotated[list[AnyMessage], add_messages]
    # Display mirrors for the inspector (derived as the thread runs):
    #   context — text of the latest retrieval ToolMessage (the grounding context
    #             the inspector's "context window" view shows); "" until retrieved.
    #   chunks  — the ranked chunks from the latest retrieval (citations/persist).
    #   used_tools — names of tools executed this run.
    context: str
    chunks: list[dict[str, Any]]
    used_tools: list[str]
    iterations: int
    answer: str

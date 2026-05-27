"""Shared state for the agent graph."""

from __future__ import annotations

from typing import Any, TypedDict


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
    #   enabled_tools: tool names to expose (None = all, [] = none)
    system_prompt: str | None
    enabled_tools: list[str] | None
    # Maturity-ladder rung (008-scenario-framework), request-only. Carried for
    # later specs to branch on; node logic does not read it yet.
    scenario: str
    # Forced failure for this run (017-failure-injection), request-only:
    #   "none" (default, unchanged) | "tool_error" | "llm_timeout".
    # The nodes branch on it to inject a *simulated* error so the learner can
    # watch the agent degrade; surfaced as an `error` key on the END `data`.
    simulate_failure: str
    context: str
    chunks: list[dict[str, Any]]
    # Long-term memory: prior {message, answer} turns from the application DB.
    history: list[dict[str, str]]
    pending_tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    used_tools: list[str]
    iterations: int
    answer: str

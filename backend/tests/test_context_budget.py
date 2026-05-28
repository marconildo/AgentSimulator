"""036-context-window-budget — the real token budget for the assembled prompt.

Keyless: token counting is local (`tiktoken`), so the model-window map and the
per-category split are tested without a key. The live end-to-end emit (AC4) is the
`[openai]` test in ``test_agent.py``.

Assertions are structural — counts are checked as ``>0`` / ``==0`` / relative,
never as exact magic numbers (tiktoken versions drift).
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from app.llm.context import (
    BUDGET_CATEGORIES,
    DEFAULT_CONTEXT_WINDOW,
    context_budget,
    context_window,
)
from app.llm.provider import ToolSpec

CALC = ToolSpec(
    name="calculator",
    description="Evaluate an arithmetic expression.",
    schema={"type": "object", "properties": {"expression": {"type": "string"}}},
)
SEARCH = ToolSpec(
    name="search_knowledge_base",
    description="Search the knowledge base (vector RAG) for relevant passages.",
    schema={"type": "object", "properties": {"query": {"type": "string"}}},
)


# --- AC1: model -> context-window map ----------------------------------------


def test_known_models_return_their_real_window():
    # gpt-4o family (128k) and gpt-4.1 family (the long-context million-token one).
    assert context_window("gpt-4o-mini") == 128_000
    assert context_window("gpt-4o") == 128_000
    assert context_window("gpt-4.1") > 128_000
    assert context_window("gpt-4.1-mini") > 128_000
    assert context_window("gpt-4.1-nano") > 128_000


def test_main_openai_lineup_is_mapped():
    # The reasoning o-series (200k) and the GPT-5 family (large window) are above
    # 128k; the legacy gpt-4 (8k) / gpt-3.5 (16k) are below it. Asserted
    # structurally (>/<) so a table tweak doesn't churn magic numbers.
    for big in ["o1", "o3", "o3-mini", "o4-mini", "gpt-5", "gpt-5-mini", "gpt-5-nano"]:
        assert context_window(big) > 128_000, big
    assert context_window("gpt-4-turbo") == 128_000
    assert context_window("o1-mini") == 128_000
    assert context_window("gpt-4") < 128_000  # original 8k
    assert context_window("gpt-3.5-turbo") < 128_000  # 16k


def test_gpt_5_point_family_real_windows():
    # The 5.x lineup (April 2026 frontier release): 5.4 / 5.5 / pro = 1.05M,
    # 5.4-mini = 400k, 5.1 / 5.2 / 5 family = 400k. Verified against the OpenAI
    # API model pages so changing the env's LLM_MODEL renders the right window.
    for big_one_mil in ["gpt-5.4", "gpt-5.4-pro", "gpt-5.5", "gpt-5.5-pro"]:
        assert context_window(big_one_mil) > 1_000_000, big_one_mil
    for four_hundred_k in ["gpt-5.4-mini", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini"]:
        assert context_window(four_hundred_k) == 400_000, four_hundred_k
    # A dated snapshot of a 5.5 release resolves via prefix to the 1.05M family.
    assert context_window("gpt-5.5-2026-04-23") == context_window("gpt-5.5")
    assert context_window("gpt-5.4-mini-2026-04-23") == context_window("gpt-5.4-mini")
    # The 5.4-mini key (longer) must win over the shorter 5.4 key — so a future
    # 5.4-mini snapshot stays at 400k, NOT 1.05M.
    assert context_window("gpt-5.4-mini-2026-xx-xx") == 400_000


def test_dated_model_alias_resolves_by_prefix():
    # A pinned snapshot (e.g. gpt-4o-mini-2024-07-18) resolves to its family window.
    assert context_window("gpt-4o-mini-2024-07-18") == context_window("gpt-4o-mini")
    assert context_window("gpt-4.1-mini-2025-04-14") == context_window("gpt-4.1-mini")
    assert context_window("gpt-5-mini-2025-08-07") == context_window("gpt-5-mini")


def test_prefix_match_prefers_the_most_specific_family():
    # The shorter "gpt-4" key (8k) must NOT swallow gpt-4o / gpt-4.1 snapshots —
    # the longest matching prefix wins.
    assert context_window("gpt-4o-2024-08-06") == context_window("gpt-4o")
    assert context_window("gpt-4o-2024-08-06") != context_window("gpt-4")
    assert context_window("gpt-4.1-2025-04-14") == context_window("gpt-4.1")


def test_unknown_model_falls_back_to_a_nonzero_default():
    w = context_window("totally-made-up-model")
    assert w == DEFAULT_CONTEXT_WINDOW
    assert w == 128_000  # the agreed default for an unlisted model
    assert w > 0  # a 0 window would break the grid


# --- AC2: real per-category split via tiktoken -------------------------------


def test_budget_returns_exactly_the_six_used_categories():
    budget = context_budget(
        system="You are a helpful assistant.",
        tools=[CALC],
        skills="",
        history=[],
        retrieved="",
        thread=[HumanMessage(content="What is 2 + 2?")],
    )
    assert set(budget) == set(BUDGET_CATEGORIES)
    assert len(BUDGET_CATEGORIES) == 6  # six used categories (free is derived)
    # Every value is a non-negative int token count.
    assert all(isinstance(v, int) and v >= 0 for v in budget.values())


def test_each_category_counts_its_own_content_and_zero_when_absent():
    full = context_budget(
        system="You are a careful, grounded assistant that cites its sources.",
        tools=[CALC, SEARCH],
        skills="Skill: summarize — condense a passage into three bullet points.",
        history=[{"message": "hi", "answer": "hello there, how can I help?"}],
        retrieved="[rag.md] Retrieval-Augmented Generation grounds an LLM in documents.",
        thread=[HumanMessage(content="Summarize the RAG document for me please.")],
    )
    for key in BUDGET_CATEGORIES:
        assert full[key] > 0, f"expected {key} > 0 when content is present"

    empty = context_budget(
        system="",
        tools=[],
        skills="",
        history=[],
        retrieved="",
        thread=[],
    )
    for key in BUDGET_CATEGORIES:
        assert empty[key] == 0, f"expected {key} == 0 when no content"


def test_counts_use_tiktoken_not_chars_over_four():
    # A real tokenizer is sub-linear in characters vs the chars/4 heuristic, and is
    # never identical to it for ordinary prose — proves we did not ship chars/4.
    text = "Retrieval-Augmented Generation grounds a language model in real documents."
    budget = context_budget(system=text, tools=[], skills="", history=[], retrieved="", thread=[])
    assert budget["system"] > 0
    assert budget["system"] != -(-len(text) // 4)  # != ceil(len/4)


# --- AC3: tool definitions are their own category ----------------------------


def test_tool_definitions_are_attributed_and_grow_with_more_tools():
    none = context_budget(system="", tools=[], skills="", history=[], retrieved="", thread=[])
    one = context_budget(system="", tools=[CALC], skills="", history=[], retrieved="", thread=[])
    two = context_budget(
        system="", tools=[CALC, SEARCH], skills="", history=[], retrieved="", thread=[]
    )
    assert none["tool_defs"] == 0  # enabled_tools=[] -> no tools advertised
    assert one["tool_defs"] > 0
    assert two["tool_defs"] > one["tool_defs"]  # more advertised tools cost more


def test_tool_definitions_are_distinct_from_tool_results_in_messages():
    # A tool *result* (a ToolMessage) lands in Messages, never in Tool definitions;
    # the schemas land in Tool definitions, never in Messages.
    result = ToolMessage(content="42", tool_call_id="c1", name="calculator")
    budget = context_budget(
        system="",
        tools=[CALC],
        skills="",
        history=[],
        retrieved="",
        thread=[
            HumanMessage(content="What is 6 * 7?"),
            AIMessage(content="", tool_calls=[]),
            result,
        ],
    )
    assert budget["tool_defs"] > 0  # the calculator schema
    assert budget["messages"] > 0  # the user turn + the "42" result

    # No double counting: removing the tool from the advertised set zeroes only
    # tool_defs, leaving Messages (the result) untouched.
    no_defs = context_budget(
        system="", tools=[], skills="", history=[], retrieved="", thread=[result]
    )
    assert no_defs["tool_defs"] == 0
    assert no_defs["messages"] > 0


def test_retrieval_and_skill_observations_are_excluded_from_messages():
    # The RAG observation is counted under Retrieved (passed explicitly), and a
    # loaded-skill body under Skills — neither double-counts into Messages.
    rag_obs = ToolMessage(
        content="[rag.md] long retrieved passage about grounding.",
        tool_call_id="r1",
        name="search_knowledge_base",
    )
    skill_obs = ToolMessage(
        content="Step 1: read the passage. Step 2: write three bullets.",
        tool_call_id="s1",
        name="load_skill",
    )
    plain = context_budget(
        system="",
        tools=[],
        skills="",
        history=[],
        retrieved="x",
        thread=[HumanMessage(content="hello world")],
    )
    with_obs = context_budget(
        system="",
        tools=[],
        skills="",
        history=[],
        retrieved="x",
        thread=[HumanMessage(content="hello world"), rag_obs, skill_obs],
        retrieval_tools={"search_knowledge_base"},
        skill_tools={"load_skill"},
    )
    # The RAG + skill observations did NOT inflate Messages.
    assert with_obs["messages"] == plain["messages"]
    # The loaded-skill body DID land in Skills.
    assert with_obs["skills"] > plain["skills"]


# --- 039-memory-growth-visualization: per-pair token counts -------------------


def test_history_pair_tokens_empty_list_returns_empty():
    """AC1 — `[]` in → `[]` out (no zero-length scan; pure projection)."""
    from app.llm.context import history_pair_tokens

    assert history_pair_tokens([]) == []


def test_history_pair_tokens_returns_one_count_per_pair_positive():
    """AC1 — N pairs → N positive ints, in order."""
    from app.llm.context import history_pair_tokens

    pairs = [
        {"message": "Ola", "answer": "Olá! Como posso ajudar você hoje?"},
        {
            "message": "Quanto é 30+5?",
            "answer": "Vamos imaginar 30 maçãs em uma cesta e mais 5 chegando.",
        },
        {"message": "obrigado", "answer": "De nada — fico feliz em ajudar."},
    ]
    counts = history_pair_tokens(pairs)
    assert len(counts) == len(pairs)
    assert all(isinstance(c, int) and c > 0 for c in counts)
    # The longest pair (turn 2) should carry the most tokens of the three.
    assert counts[1] == max(counts)


def test_history_pair_tokens_empty_pair_counts_the_framing_not_zero():
    """AC1 — an empty `{message: "", answer: ""}` pair still counts the framing
    prefix (the `- user: ... / assistant: ...` scaffolding is real text the
    model sees), so the count is non-zero. This keeps abstained / empty-answer
    turns honest in the growth panel."""
    from app.llm.context import history_pair_tokens

    counts = history_pair_tokens([{"message": "", "answer": ""}])
    assert len(counts) == 1
    assert counts[0] > 0  # framing prefix tokens


def test_history_pair_tokens_sum_reconciles_with_memory_budget_slice():
    """AC2 — Σ per-pair counts ≈ `context_budget(history=pairs).memory` ±2.

    The Memory slice tokenizes `_render_history(pairs)` as one joined string;
    summing per-pair counts can differ by a tiny BPE boundary effect across
    the inter-pair `\\n`. ±2 tokens is the documented tolerance.
    """
    from app.llm.context import context_budget, history_pair_tokens

    pairs = [
        {"message": "Ola", "answer": "Olá! Como posso ajudar?"},
        {"message": "What is RAG?", "answer": "Retrieval-Augmented Generation is …"},
        {"message": "obrigado", "answer": "De nada."},
    ]
    per_pair_sum = sum(history_pair_tokens(pairs))
    memory_slice = context_budget(
        system="",
        tools=[],
        skills="",
        history=pairs,
        retrieved="",
        thread=[],
    )["memory"]
    assert abs(per_pair_sum - memory_slice) <= 2


# --- AC3: db.read END data carries `recent_tokens` aligned with `recent` ------


async def test_db_read_emit_data_aligns_recent_tokens_with_recent(tmp_path):
    """AC3 — the data we put on the `db.read` END (the contract `main.py`
    composes) has `recent_tokens` of the same length as `recent`, in the same
    order, with one count per turn. Keyless: the wiring is structural."""
    from app.db.store import ConversationStore
    from app.llm.context import history_pair_tokens

    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]
    # Two turns, in chronological order.
    await store.write_message(sid, "m1", "Ola", "Olá! Como posso ajudar?")
    await store.write_message(
        sid,
        "m2",
        "Quanto é 30+5?",
        "Vamos imaginar 30 maçãs em uma cesta e mais 5 chegando.",
    )
    history = await store.read_history(sid)
    # The literal recipe `main.py` uses on the db.read END `rec.data`.
    data = {**history, "recent_tokens": history_pair_tokens(history["recent"])}

    assert "recent_tokens" in data
    assert isinstance(data["recent_tokens"], list)
    # One count per recent pair, in the same order.
    assert len(data["recent_tokens"]) == len(data["recent"])
    assert all(isinstance(t, int) and t > 0 for t in data["recent_tokens"])
    # Longer turn → larger count (turn 2 has the longer answer here).
    assert data["recent_tokens"][1] > data["recent_tokens"][0]

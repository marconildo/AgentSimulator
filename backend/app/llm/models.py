"""Curated OpenAI chat model list (042-agent-anatomy).

The simulator advertises a small, curated set of OpenAI chat models the user
can pick from in the Agent Anatomy dialog. The list is deliberately short and
maintained by hand: adding a model is a one-line code change here, and tests
that reference the allowlist do so through :func:`model_ids` rather than
hard-coded strings.

The allowlist is enforced by the API layer (``/api/chat`` returns 422 when
``ChatRequest.model`` is not in :func:`model_ids`), so the agent never sees an
unvetted model id even if a client constructs one.

The default model the server runs with is ``settings.llm_model`` (env-driven);
a startup sanity check in :mod:`app.main` asserts it is in :func:`model_ids` —
booting with an unlisted default is a configuration error, not a runtime
surprise.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class CuratedModel:
    """One row of the curated OpenAI chat-model list."""

    id: str
    label: str
    description: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


# Curated chat models the FE Agent Anatomy dialog lets the user pick from.
# Keep this list short: each entry shows up in a dropdown and adds an
# additional code path the e2e suite would otherwise have to exercise. The
# descriptions are bilingual-friendly *English-only* tooltips (UI chrome
# around them is bilingual; the model id and label are proper nouns).
CURATED_MODELS: tuple[CuratedModel, ...] = (
    # 065-provider-and-model-refresh: the 4.1 + 5 families (gpt-4o family dropped).
    CuratedModel(
        id="gpt-4.1-nano",
        label="GPT-4.1 nano",
        description="GPT-4.1 family — fastest and cheapest, 1M-token context.",
    ),
    CuratedModel(
        id="gpt-4.1-mini",
        label="GPT-4.1 mini",
        description="GPT-4.1 with a 1M-token context window. The default for the simulator.",
    ),
    CuratedModel(
        id="gpt-4.1",
        label="GPT-4.1",
        description="Long-context (1M) reasoning model.",
    ),
    CuratedModel(
        id="gpt-5-nano",
        label="GPT-5 nano",
        description="GPT-5 family — smallest and fastest.",
    ),
    CuratedModel(
        id="gpt-5-mini",
        label="GPT-5 mini",
        description="GPT-5 family — fast, frontier reasoning.",
    ),
    CuratedModel(
        id="gpt-5",
        label="GPT-5",
        description="GPT-5 family — top-end reasoning.",
    ),
    CuratedModel(
        id="gpt-5.5",
        label="GPT-5.5",
        description="Latest GPT-5.5 — most capable reasoning.",
    ),
)


@dataclass(frozen=True)
class Provider:
    """One LLM provider the Agent Anatomy dialog can advertise.

    ``available`` gates whether the provider can actually run. Today only OpenAI
    is available (constitution §2); Ollama is a labelled **preview** (constitution
    §3 — it draws a disabled option, it never runs). Adding a real second provider
    is its own future spec; this list exists so the FE never hardcodes the names.
    """

    id: str
    label: str
    available: bool

    def to_dict(self) -> dict[str, str | bool]:
        return asdict(self)


# 065-provider-and-model-refresh: OpenAI is the one usable provider; Ollama is a
# disabled preview. Proper nouns ("OpenAI", "Ollama (local)") are not translated.
PROVIDERS: tuple[Provider, ...] = (
    Provider(id="openai", label="OpenAI", available=True),
    Provider(id="ollama", label="Ollama (local)", available=False),
)

DEFAULT_PROVIDER = "openai"


def model_ids() -> set[str]:
    """The set of ids the API's allowlist check uses."""
    return {m.id for m in CURATED_MODELS}


def models_payload() -> list[dict[str, str]]:
    """JSON-shape the FE renders directly from ``/api/config.models``."""
    return [m.to_dict() for m in CURATED_MODELS]


def providers_payload() -> list[dict[str, str | bool]]:
    """JSON-shape the FE renders directly from ``/api/config.providers``."""
    return [p.to_dict() for p in PROVIDERS]

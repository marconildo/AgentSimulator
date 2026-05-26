"""[offline] — the full `.env` is bridged into `os.environ`.

`pydantic-settings` only maps the keys declared on :class:`Settings`; any other
key in `backend/.env` is dropped (``extra="ignore"``) and never reaches
``os.environ``. Libraries that read the environment directly — notably LangSmith
tracing (``LANGSMITH_TRACING``/``LANGSMITH_API_KEY``) — would then never see
values placed in `.env`. ``load_env_file`` closes that gap while preserving
precedence (real environment variables are never overridden). These run without
a key.
"""

import os

from app.config import load_env_file


def test_load_env_file_populates_os_environ(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("LANGSMITH_TRACING=true\nLANGSMITH_PROJECT=agent-sim-test\n")
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    load_env_file(env)

    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_PROJECT"] == "agent-sim-test"


def test_load_env_file_does_not_override_real_env(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("LANGSMITH_PROJECT=from-file\n")
    monkeypatch.setenv("LANGSMITH_PROJECT", "from-real-env")

    load_env_file(env)

    # The real environment wins, mirroring pydantic-settings precedence (env > .env).
    assert os.environ["LANGSMITH_PROJECT"] == "from-real-env"


def test_load_env_file_missing_file_is_a_noop(tmp_path):
    # No `.env` present is the common case in CI — must not raise.
    load_env_file(tmp_path / "does-not-exist.env")

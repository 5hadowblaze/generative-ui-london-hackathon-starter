"""
LangGraph entry point for the TripWeaver (travel) example.

Mirrors agent/main.py's provider seam: Gemini 3.5 Flash via the native
Google Gen AI SDK (langchain-google-genai). The native SDK handles
thought-signature replay across tool turns, which langchain-openai's
OpenAI-compat path does not — see FROZEN.md for the history. Do NOT
change the model line without instruction.

Import note:
    This module lives inside the `travel_agent` package whose dir name
    matches the package name. langgraph loads this graph via the
    `./travel_agent/graph.py:graph` entry in `agent/langgraph.json`,
    which keeps Python's package machinery intact — so
    `from .tools import ...` works without any sys.path manipulation.
"""

import os

from copilotkit import CopilotKitMiddleware
from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI

# Imports below try package-relative first (works under langgraph + dev
# server, where the module is loaded inside its `travel_agent` package).
# Fall back to absolute path injection when the file is loaded directly
# via `importlib.util.spec_from_file_location` — which is how
# `pnpm smoke` probes each example's graph. The fallback keeps the smoke
# probe green; the canonical path is the relative import.
try:
    from .prompts import SYSTEM_PROMPT  # type: ignore[import-not-found]
    from .tools import travel_tools  # type: ignore[import-not-found]
except ImportError:
    import sys as _sys
    from pathlib import Path as _Path

    _pkg_root = _Path(__file__).resolve().parent
    _sys.path.insert(0, str(_pkg_root.parent))
    from travel_agent.prompts import SYSTEM_PROMPT  # type: ignore  # noqa: E402
    from travel_agent.tools import travel_tools  # type: ignore  # noqa: E402


model = ChatGoogleGenerativeAI(
    model=os.getenv("MODEL", "gemini-3.5-flash"),
    google_api_key=os.getenv("GEMINI_API_KEY"),
)


agent = create_agent(
    model=model,
    tools=travel_tools,
    middleware=[CopilotKitMiddleware()],
    system_prompt=SYSTEM_PROMPT,
)

graph = agent

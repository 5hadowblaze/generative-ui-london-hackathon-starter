"""
LangGraph entry point for the Homestead realestate buyer's-agent example.

Mirrors agent/main.py's provider seam: Gemini 3.5 Flash via the native
Google Gen AI SDK (langchain-google-genai). The native SDK handles
thought-signature replay across tool turns, which langchain-openai's
OpenAI-compat path does not — see FROZEN.md for the history. Do NOT
change the model line without instruction.

Import note:
    This module lives inside the `realestate_agent` package whose dir
    name matches the package name. langgraph loads this graph via the
    `./realestate_agent/graph.py:graph` entry in `agent/langgraph.json`,
    which keeps Python's package machinery intact when imported through
    the package machinery. But the `pnpm smoke` per-example probe loads
    this file via `importlib.util.spec_from_file_location`, which
    bypasses the package machinery and breaks relative imports.

    The two-line sys.path shim below pre-empts that failure: it adds the
    parent agent/ directory (which contains `realestate_agent/`) to
    sys.path so an absolute import of `realestate_agent.tools` resolves
    cleanly in both the package-machinery and standalone-file cases.
    See `scripts/_smoke-examples.ts:probeExamples` for the loader.
"""

import os
import sys
from pathlib import Path

# Make `realestate_agent` resolvable as an absolute import name even when
# this file is loaded via importlib.util.spec_from_file_location (probe
# path). Inside `langgraph dev` and the runtime, the package is already
# on sys.path; this is a no-op.
_AGENT_DIR = Path(__file__).resolve().parent.parent
if str(_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(_AGENT_DIR))

from copilotkit import CopilotKitMiddleware  # noqa: E402
from langchain.agents import create_agent  # noqa: E402
from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: E402

from realestate_agent.prompts import SYSTEM_PROMPT  # noqa: E402
from realestate_agent.tools import (  # noqa: E402
    draft_offer_letter,
    pick_tour_slot,
    show_listing_detail,
    show_listings,
)


model = ChatGoogleGenerativeAI(
    model=os.getenv("MODEL", "gemini-3.5-flash"),
    google_api_key=os.getenv("GEMINI_API_KEY"),
)


agent = create_agent(
    model=model,
    tools=[
        show_listings,
        show_listing_detail,
        pick_tour_slot,
        draft_offer_letter,
    ],
    middleware=[CopilotKitMiddleware()],
    system_prompt=SYSTEM_PROMPT,
)

graph = agent

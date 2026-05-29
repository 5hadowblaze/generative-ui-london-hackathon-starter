#!/bin/bash
# Boot LangGraph dev from PROJECT ROOT so that `other-examples/*/agent`
# subdirs qualify as valid local dependencies (langgraph dev enforces
# "Local dependency must be a subdirectory of the config file").
# All 6 graphs (sample_agent + 5 examples) are registered in the root
# langgraph.json. See audit item #2 in other-examples/PLAN.md.
#
# We invoke the LOCAL .venv's langgraph binary (NOT the npx wrapper)
# so the run uses our pinned langgraph 1.1.6 / langgraph-api 0.7.101
# from agent/pyproject.toml. The npx wrapper goes through a fresh uv
# ephemeral env that may pull a newer langgraph version with a
# Python 3.13 MRO incompatibility (TypeError on PregelProtocol bases).
cd "$(dirname "$0")/.." || exit 1
exec ./agent/.venv/bin/langgraph dev --config ./langgraph.json --port 8123 --no-browser

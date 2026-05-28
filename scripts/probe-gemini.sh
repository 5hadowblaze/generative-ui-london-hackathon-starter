#!/usr/bin/env bash
# scripts/probe-gemini.sh — Empirically verify which Gemini model IDs 200 with
# tool-calling against the OpenAI-compat endpoint. Workstream A done-criterion.
#
# Usage:  GEMINI_API_KEY=... ./scripts/probe-gemini.sh
# Output: one line per candidate: <model-id>  <http-status>  <tool-called?>  <latency-ms>

set -euo pipefail

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: GEMINI_API_KEY not set" >&2
  echo "Get a free-tier key: https://aistudio.google.com/apikey" >&2
  exit 1
fi

ENDPOINT="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

# Candidates in priority order — latest first.
CANDIDATES=(
  "gemini-3.5-flash"      # Notion v3.1 default; may not exist yet
  "gemini-3.0-flash"
  "gemini-2.5-flash"      # likely current stable as of May 2026
  "gemini-2.5-flash-latest"
  "gemini-2.0-flash"
  "gemini-2.0-flash-001"
  "gemini-1.5-flash"
  "gemini-1.5-flash-latest"
)

REQUEST_BODY=$(cat <<'JSON'
{
  "model": "__MODEL__",
  "messages": [
    {"role": "user", "content": "What's the weather in London? Use the tool."}
  ],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get the current weather for a city",
      "parameters": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }
  }],
  "tool_choice": "auto",
  "max_tokens": 200
}
JSON
)

printf "%-30s %-8s %-12s %-12s %s\n" "MODEL" "STATUS" "TOOL-CALLED" "LATENCY-MS" "NOTES"
printf "%-30s %-8s %-12s %-12s %s\n" "------------------------------" "------" "-----------" "----------" "-----"

for model in "${CANDIDATES[@]}"; do
  body=$(printf '%s' "$REQUEST_BODY" | sed "s/__MODEL__/$model/")

  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  # Capture HTTP status and body in one shot.
  resp=$(curl -sS -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $GEMINI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$body" || echo -e "\nERR")
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  latency=$((end - start))

  status=$(printf '%s' "$resp" | tail -n1)
  body_out=$(printf '%s' "$resp" | sed '$d')

  # Did it call the tool?
  tool_called="no"
  notes=""
  if [[ "$status" == "200" ]]; then
    if printf '%s' "$body_out" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("choices",[{}])[0].get("message",{}).get("tool_calls") else 1)' 2>/dev/null; then
      tool_called="yes"
    else
      tool_called="no"
      notes="200 but no tool_call in response"
    fi
  else
    # Try to extract the API error message
    notes=$(printf '%s' "$body_out" | python3 -c 'import json,sys
try:
  d = json.load(sys.stdin)
  msg = d.get("error",{}).get("message","")
  print(msg[:80])
except: pass' 2>/dev/null || true)
  fi

  printf "%-30s %-8s %-12s %-12s %s\n" "$model" "$status" "$tool_called" "$latency" "$notes"
done

echo
echo "VERDICT: pick the highest-priority candidate above with STATUS=200 and TOOL-CALLED=yes."
echo "Write that ID into agent/main.py, .env.example, agent/pyproject.toml (if applicable), and FROZEN.md."

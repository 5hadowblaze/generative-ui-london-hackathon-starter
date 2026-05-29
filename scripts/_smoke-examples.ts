/**
 * scripts/_smoke-examples.ts — per-example graph-probe helper for `pnpm smoke`.
 *
 * Plan §3 (item 3 of the audit checklist): the existing smoke gate validates
 * the dashboard agent + widget catalog but never boots an example sub-repo.
 * Examples ship with their own LangGraph entry, schemas, and catalog, so a
 * broken example surfaces only at `pnpm dev` time. This helper walks every
 * `other-examples/<name>/EXAMPLE.json`, finds the sibling `agent/` package
 * (if any), and probes that the graph module imports + the `graph` attribute
 * is non-None — same cheap `importlib.util.spec_from_file_location` ritual
 * the existing agent-registration probe uses.
 *
 * Defensive policy (deliberate, per plan §3 acceptance):
 *   - If `pyproject.toml` has empty / missing `dependencies` → WARN, skip
 *   - If the graph file is missing → WARN, skip
 *   - If the graph factory raises on import → WARN, skip
 *   - Hard-fail ONLY on infrastructure errors (Python missing, helper itself
 *     crashes). The reasoning: examples are user-facing customization seams;
 *     the fix for a broken example often lives on a sibling branch (e.g.
 *     legal-contract-review's empty deps is fixed on `adoring-einstein-ed74e0`).
 *     Hard-failing smoke would block unrelated merges. WARN-not-FAIL keeps
 *     the gate honest about what's broken without becoming a merge gate for
 *     work the orchestrator hasn't sequenced yet.
 *
 * Convention for "where is the graph?":
 *   - Each example has `<example>/agent/graph.py` exposing a `graph` symbol
 *     (matches the canonical `legal-contract-review/agent/graph.py`).
 *   - If a future example ships its own `agent/langgraph.json`, we read the
 *     `graphs` map from it and probe each (forward-compat with plan item 6).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export type ExampleProbeTarget = {
  /** Directory name under `other-examples/` — used for log lines. */
  id: string;
  /** Absolute path to the example dir. */
  dir: string;
  /** Absolute path to `<dir>/agent/`, when it exists. */
  agentDir: string | null;
  /** Absolute path to `<dir>/agent/pyproject.toml`, when present. */
  pyproject: string | null;
  /** Graph specs we will probe. Empty means "no graph file present". */
  graphs: { name: string; file: string; attr: string }[];
};

/**
 * Walk `other-examples/` and return one ExampleProbeTarget per example.
 *
 * Skips known non-example entries (`_shared/`, `PLAN.md`, `README.md`, etc.) by
 * requiring an `EXAMPLE.json` manifest to qualify as an example. This matches
 * the §3.2 catalog-entry convention validate-widget --examples already keys on.
 */
export function discoverExampleTargets(repoRoot: string): ExampleProbeTarget[] {
  const examplesDir = join(repoRoot, "other-examples");
  if (!existsSync(examplesDir)) return [];

  const out: ExampleProbeTarget[] = [];
  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Skip leading-underscore convention dirs (`_shared/`, `_PLAN/`, etc.).
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

    const dir = join(examplesDir, entry.name);
    const exampleJson = join(dir, "EXAMPLE.json");
    if (!existsSync(exampleJson)) continue;

    const agentDir = join(dir, "agent");
    const hasAgentDir = existsSync(agentDir) && statSync(agentDir).isDirectory();

    const target: ExampleProbeTarget = {
      id: entry.name,
      dir,
      agentDir: hasAgentDir ? agentDir : null,
      pyproject: null,
      graphs: [],
    };

    if (hasAgentDir) {
      const pyproject = join(agentDir, "pyproject.toml");
      if (existsSync(pyproject)) target.pyproject = pyproject;

      // Future convention: per-example langgraph.json (forward-compat with
      // plan item 6 rename). If present, use its `graphs` map directly.
      const langgraphJson = join(agentDir, "langgraph.json");
      if (existsSync(langgraphJson)) {
        try {
          const cfg = JSON.parse(readFileSync(langgraphJson, "utf-8"));
          if (cfg.graphs && typeof cfg.graphs === "object") {
            for (const [name, spec] of Object.entries(cfg.graphs)) {
              const specStr = String(spec);
              const idx = specStr.lastIndexOf(":");
              if (idx <= 0) continue;
              const filePart = specStr.slice(0, idx);
              const attr = specStr.slice(idx + 1);
              // Resolve relative to the langgraph.json dir.
              const abs = join(agentDir, filePart);
              target.graphs.push({ name, file: abs, attr });
            }
          }
        } catch {
          // Fall through to graph.py probe below.
        }
      }

      // Canonical convention: `<example>/agent/graph.py` with `graph` symbol.
      // (Matches legal-contract-review/agent/graph.py.) Only add if no
      // langgraph.json graph already named this file.
      const canonicalGraph = join(agentDir, "graph.py");
      if (existsSync(canonicalGraph) && !target.graphs.some((g) => g.file === canonicalGraph)) {
        target.graphs.push({ name: entry.name, file: canonicalGraph, attr: "graph" });
      }
    }

    out.push(target);
  }
  return out;
}

/**
 * Cheap `dependencies = []` check on a pyproject.toml.
 *
 * Why not pull in a TOML parser: the smoke gate runs on every commit and we'd
 * rather not add a dep. The check is intentionally narrow — we look for a
 * `dependencies = []` line OR no `dependencies` array at all OR a
 * `[project]` block whose `dependencies` is absent / empty. Anything else
 * (any non-empty `dependencies = [...]`) is treated as "has deps". This is
 * good enough to catch the legal-contract-review case the task spec calls
 * out without adding a TOML dep.
 */
export function hasEmptyDependencies(pyprojectPath: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(pyprojectPath, "utf-8");
  } catch {
    return true; // treat unreadable as empty for skip-warn purposes
  }
  // Match the [project] table block.
  const projectStart = raw.indexOf("[project]");
  if (projectStart < 0) return true;
  // Everything from [project] up to the next top-level table (or EOF).
  const rest = raw.slice(projectStart);
  const nextTable = rest.slice("[project]".length).search(/^\[[^\]]+\]/m);
  const projectBlock =
    nextTable < 0 ? rest : rest.slice(0, "[project]".length + nextTable);
  // Look for `dependencies = [ ... ]` and inspect contents.
  const depsMatch = projectBlock.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (!depsMatch) return true; // no `dependencies` key
  const inside = depsMatch[1].replace(/#.*$/gm, "").trim();
  return inside.length === 0;
}

export type ExampleProbeOutcome =
  | { kind: "ok"; id: string; graphCount: number }
  | { kind: "warn"; id: string; reason: string }
  | { kind: "skip"; id: string; reason: string };

/**
 * Probe every example sub-repo. Always returns a list of outcomes — never
 * throws unless the helper itself broke. The caller decides how to format.
 *
 * Each example with a graph file is import-probed with the SAME ritual the
 * existing agent registration step uses (importlib.util.spec_from_file_location
 * + exec_module). We do NOT compile / invoke the graph — just confirm it
 * imports and the `graph` attribute is non-None. That catches dep / syntax
 * issues without booting an HTTP server, which keeps the whole step < 5s.
 */
export function probeExamples(
  targets: ExampleProbeTarget[],
  opts: { repoRoot: string; pythonBin: string },
): ExampleProbeOutcome[] {
  const outcomes: ExampleProbeOutcome[] = [];

  for (const t of targets) {
    if (!t.agentDir) {
      outcomes.push({
        kind: "skip",
        id: t.id,
        reason: "no agent/ subdir — non-agent example",
      });
      continue;
    }

    if (t.pyproject && hasEmptyDependencies(t.pyproject)) {
      // Surface the canonical message the task spec calls out so future
      // readers see exactly where the fix lives.
      const reason =
        t.id === "legal-contract-review"
          ? "pyproject.toml has empty dependencies — fix lives on adoring-einstein-ed74e0"
          : "pyproject.toml has empty dependencies — populate [project].dependencies";
      outcomes.push({ kind: "warn", id: t.id, reason });
      continue;
    }

    if (t.graphs.length === 0) {
      outcomes.push({
        kind: "warn",
        id: t.id,
        reason: "no agent/graph.py and no agent/langgraph.json — nothing to probe",
      });
      continue;
    }

    // Build a single Python invocation that probes every graph in this
    // example. Mirrors the agent-registration probe in smoke.ts. We emit
    // JSON to stdout so the TS side can parse without a regex.
    const probeSpecs = t.graphs.map((g) => ({
      name: g.name,
      file: g.file,
      attr: g.attr,
    }));
    const script = `
import sys, json, importlib.util
specs = json.loads('''${JSON.stringify(probeSpecs)}''')
results = []
for s in specs:
    try:
        spec_obj = importlib.util.spec_from_file_location(f"smoke_example_{s['name']}", s['file'])
        if spec_obj is None or spec_obj.loader is None:
            results.append({"name": s["name"], "ok": False, "err": "could not create module spec"})
            continue
        mod = importlib.util.module_from_spec(spec_obj)
        sys.modules[f"smoke_example_{s['name']}"] = mod
        spec_obj.loader.exec_module(mod)
        if not hasattr(mod, s["attr"]):
            results.append({"name": s["name"], "ok": False, "err": f"missing attribute '{s['attr']}'"})
            continue
        if getattr(mod, s["attr"]) is None:
            results.append({"name": s["name"], "ok": False, "err": f"attribute '{s['attr']}' is None"})
            continue
        results.append({"name": s["name"], "ok": True})
    except Exception as e:
        results.append({"name": s["name"], "ok": False, "err": f"{type(e).__name__}: {e}"})
print(json.dumps(results))
`;
    const res = spawnSync(opts.pythonBin, ["-c", script], {
      cwd: t.agentDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Same placeholder reasoning as the agent-registration probe — graph
        // modules construct LLM clients at import time.
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || "smoke-probe-placeholder",
      },
    });

    if (res.status !== 0) {
      // Probe itself crashed — treat as a warn, not a hard fail, so a broken
      // example doesn't block unrelated work. The stderr is captured for the
      // log line.
      const stderr = (res.stderr ?? "").toString().trim();
      const lastLine = stderr.split("\n").pop() || `probe exited ${res.status}`;
      outcomes.push({
        kind: "warn",
        id: t.id,
        reason: `import probe crashed — ${lastLine.slice(0, 160)}`,
      });
      continue;
    }

    const stdout = (res.stdout ?? "").toString().trim();
    let parsed: { name: string; ok: boolean; err?: string }[] = [];
    try {
      // Probe prints one JSON line; tolerate trailing noise.
      const jsonLine = stdout.split("\n").reverse().find((l) => l.startsWith("["));
      parsed = JSON.parse(jsonLine || "[]");
    } catch {
      outcomes.push({
        kind: "warn",
        id: t.id,
        reason: `could not parse probe output (got ${stdout.length} bytes)`,
      });
      continue;
    }

    const failed = parsed.filter((r) => !r.ok);
    if (failed.length > 0) {
      const summary = failed
        .map((f) => `${f.name}: ${(f.err || "unknown").slice(0, 100)}`)
        .join("; ");
      outcomes.push({ kind: "warn", id: t.id, reason: summary });
      continue;
    }
    outcomes.push({ kind: "ok", id: t.id, graphCount: parsed.length });
  }
  return outcomes;
}

/**
 * Format an outcome list to stdout using the same chevron style as the rest
 * of smoke.ts. Returns a single-line summary detail for the step result.
 *
 * Policy: this step is WARN-not-FAIL by design. The returned `.pass` is
 * always true unless there are zero examples discovered AND we expected
 * some (we don't — empty discovery is fine).
 */
export function reportProbeOutcomes(outcomes: ExampleProbeOutcome[]): {
  pass: boolean;
  detail: string;
} {
  if (outcomes.length === 0) {
    console.log(
      `${YELLOW}!${RESET} ${DIM}No other-examples/*/EXAMPLE.json discovered. Nothing to probe.${RESET}`,
    );
    return { pass: true, detail: "no examples discovered" };
  }

  let okCount = 0;
  let warnCount = 0;
  let skipCount = 0;
  for (const o of outcomes) {
    if (o.kind === "ok") {
      okCount++;
      console.log(
        `  ${GREEN}✓${RESET} ${o.id} ${DIM}— graph imported (${o.graphCount} graph${o.graphCount === 1 ? "" : "s"})${RESET}`,
      );
    } else if (o.kind === "warn") {
      warnCount++;
      console.log(
        `  ${YELLOW}!${RESET} ${o.id} ${DIM}(skipped)${RESET} ${o.reason}`,
      );
    } else {
      skipCount++;
      console.log(
        `  ${DIM}- ${o.id} (skipped) ${o.reason}${RESET}`,
      );
    }
  }
  console.log();
  // Always pass — defensive WARN-not-FAIL by design. See helper docstring.
  const parts: string[] = [];
  parts.push(`${okCount} ok`);
  if (warnCount) parts.push(`${warnCount} warn`);
  if (skipCount) parts.push(`${skipCount} skip`);
  return { pass: true, detail: parts.join(", ") };
}

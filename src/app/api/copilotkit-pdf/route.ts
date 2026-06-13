import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const FIXED_AGENT_URL =
  process.env.FIXED_AGENT_URL ?? "http://localhost:8123/fixed";
const DYNAMIC_AGENT_URL =
  process.env.DYNAMIC_AGENT_URL ?? "http://localhost:8123/dynamic";
const BANKING_AGENT_URL =
  process.env.BANKING_AGENT_URL ?? "http://localhost:8123/banking";

const fixedAgent = new HttpAgent({ url: FIXED_AGENT_URL });
const dynamicAgent = new HttpAgent({ url: DYNAMIC_AGENT_URL });
const bankingAgent = new HttpAgent({ url: BANKING_AGENT_URL });

const runtime = new CopilotRuntime({
  agents: {
    // CopilotKit's V2 client expects an agent named "default" for any hook
    // that doesn't pass an explicit agentId (e.g. our root provider mounted
    // on pages that don't render a chat). We alias it to the banking agent.
    default: bankingAgent,
    banking_agent: bankingAgent,
    fixed_agent: fixedAgent,
    dynamic_agent: dynamicAgent,
  },
  // The A2UI middleware intercepts tool results that contain a2ui_operations
  // and turns them into rendered surfaces. We deliberately set
  // `injectA2UITool: false` so the runtime does NOT register `render_a2ui`
  // as a frontend tool. instead, the dynamic agent has a Python
  // `generate_a2ui` tool that calls a secondary LLM and returns operations
  // as a normal tool result. This avoids the CopilotKitMiddleware
  // strip-and-restore lifecycle that leaves orphan tool_calls in agent
  // state (which was crashing turn 2 with INCOMPLETE_STREAM).
  a2ui: {
    injectA2UITool: false,
  },
});

const handler = createCopilotRuntimeHandler({
  runtime,
  // Isolated from the host's v1 route at /api/copilotkit/[[...slug]].
  // The pdf-analyst Providers point CopilotKit's runtimeUrl here.
  basePath: "/api/copilotkit-pdf",
  mode: "single-route",
});

export function GET(request: Request) {
  const { pathname } = new URL(request.url);

  if (pathname.endsWith("/threads")) {
    return Response.json({
      threads: [],
      hasMore: false,
      nextCursor: null,
    });
  }

  return new Response("Not found", { status: 404 });
}

export { handler as POST };

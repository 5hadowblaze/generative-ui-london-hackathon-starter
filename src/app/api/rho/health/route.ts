import type { NextRequest } from "next/server";

const BANKING_BACKEND_URL =
  process.env.BANKING_BACKEND_URL ?? "http://localhost:8123";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const liveA2A = request.nextUrl.searchParams.get("liveA2A") !== "false";
  const target = `${BANKING_BACKEND_URL.replace(/\/$/, "")}/rho/health?live_a2a=${liveA2A ? "true" : "false"}`;

  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return Response.json(
      {
        checks: [
          {
            name: "A2A",
            status: liveA2A ? "blocked" : "off",
            message: "Unable to reach the banking backend health endpoint.",
          },
          {
            name: "Redis",
            status: liveA2A ? "blocked" : "off",
            message: "Unable to reach the banking backend health endpoint.",
          },
          {
            name: "LinkUp",
            status: liveA2A ? "blocked" : "off",
            message: "Unable to reach the banking backend health endpoint.",
          },
          {
            name: "Gemini",
            status: "blocked",
            message:
              error instanceof Error
                ? error.message
                : "Unable to reach the banking backend health endpoint.",
          },
        ],
      },
      { status: 200 },
    );
  }
}

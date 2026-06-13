import type { NextRequest } from "next/server";

const BANKING_BACKEND_URL =
  process.env.BANKING_BACKEND_URL ?? "http://localhost:8123";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<unknown> },
) {
  const rawParams = (await params) as { contextId?: string };
  const contextId = rawParams.contextId;
  if (!contextId) {
    return Response.json(
      {
        status: "failed",
        contextId: "",
        message: "Missing contextId.",
      },
      { status: 400 },
    );
  }
  const target = `${BANKING_BACKEND_URL.replace(/\/$/, "")}/rho/full-a2a/${encodeURIComponent(contextId)}`;

  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
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
        status: "unavailable",
        contextId,
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the banking backend transcript endpoint.",
      },
      { status: 200 },
    );
  }
}

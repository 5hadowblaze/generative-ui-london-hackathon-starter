import FixedPageClient, {
  type HealthCheck,
} from "./FixedPageClient";

const BANKING_BACKEND_URL =
  process.env.BANKING_BACKEND_URL ?? "http://localhost:8123";

export const dynamic = "force-dynamic";

export default async function FixedPage() {
  const initialHealthChecks = await loadInitialHealthChecks();

  return <FixedPageClient initialHealthChecks={initialHealthChecks} />;
}

async function loadInitialHealthChecks(): Promise<HealthCheck[] | null> {
  const target = `${BANKING_BACKEND_URL.replace(/\/$/, "")}/rho/health?live_a2a=true`;

  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { checks?: unknown };
    const checks = parseServerHealthChecks(payload.checks);
    return checks.length ? checks : null;
  } catch {
    return null;
  }
}

function parseServerHealthChecks(raw: unknown): HealthCheck[] {
  if (!Array.isArray(raw)) return [];
  const allowedNames = new Set(["A2A", "Redis", "LinkUp", "Gemini"]);
  const allowedStatuses = new Set(["live", "off", "blocked"]);
  return raw
    .map((item): HealthCheck | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      if (
        typeof record.name !== "string" ||
        !allowedNames.has(record.name) ||
        typeof record.status !== "string" ||
        !allowedStatuses.has(record.status)
      ) {
        return null;
      }
      return {
        name: record.name as HealthCheck["name"],
        status: record.status as HealthCheck["status"],
        message:
          typeof record.message === "string"
            ? record.message
            : "No health detail returned.",
      };
    })
    .filter((item): item is HealthCheck => Boolean(item));
}

import { logError, sanitizeLogValue } from "@/lib/observability";

/** Non-throwing reporting boundary for write pipelines. */
export async function reportSyncError(error: unknown, context: Record<string, unknown>): Promise<void> {
  const reportedError = error instanceof Error ? error : new Error(String(error));
  const safeContext = sanitizeLogValue(context) as Record<string, unknown>;
  logError(reportedError, safeContext);
  if (!process.env.HONEYBADGER_API_KEY) return;
  try {
    const Honeybadger = (await import("@honeybadger-io/js")).default;
    Honeybadger.configure({
      apiKey: process.env.HONEYBADGER_API_KEY,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    });
    await Honeybadger.notifyAsync(reportedError, safeContext);
  } catch {
    // Reporting must never change sync control flow.
  }
}

import { logError } from "@/lib/observability";

/** Non-throwing reporting boundary for write pipelines. */
export async function reportSyncError(error: unknown, context: Record<string, unknown>): Promise<void> {
  logError(error instanceof Error ? error : String(error), context);
}

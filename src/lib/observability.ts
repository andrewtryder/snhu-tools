import "server-only";
import { sanitizeLogValue } from "@/lib/logSanitization";

export { sanitizeLogValue } from "@/lib/logSanitization";

export interface LogContext {
  catalogId?: string;
  syncId?: string;
  cursor?: number;
  expectedCount?: number;
  importedCount?: number;
  warningCount?: number;
  environment?: string;
  [key: string]: unknown;
}

export function logInfo(message: string, context?: LogContext): void {
  const safeCtx = sanitizeLogValue(context);
  console.log(`[INFO] ${message}`, safeCtx || "");
}

export function logWarning(message: string, context?: LogContext): void {
  const safeCtx = sanitizeLogValue(context);
  console.warn(`[WARN] ${message}`, safeCtx || "");
}

export function logError(error: Error | string, context?: LogContext): void {
  const msg = sanitizeLogValue(typeof error === "string" ? error : error.message);
  const safeCtx = sanitizeLogValue(context);
  console.error(`[ERROR] ${msg}`, safeCtx || "");
}

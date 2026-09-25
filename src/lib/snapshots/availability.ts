/**
 * Classify Postgres/Neon availability failures vs programmer/schema bugs.
 * Availability errors may fall back to last-known-good snapshots.
 */

const AVAILABILITY_SQLSTATES = new Set([
  "53000", // insufficient_resources (Neon quota / compute limits)
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "08007", // transaction_resolution_unknown
]);

const AVAILABILITY_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const AVAILABILITY_MESSAGE =
  /exceeded the quota|upgrade your plan to increase limits|connection terminated unexpectedly|connection terminated|timeout expired|Connection terminated|sorry, too many clients|remaining connection slots|the database system is starting|the database system is shutting|could not connect|Connection refused|connect ETIMEDOUT|connect ECONNREFUSED/i;

export type DbAvailabilityReason =
  | "postgres-53000"
  | "postgres-connection"
  | "network"
  | "timeout"
  | "quota-message"
  | "unknown-availability";

export interface DbAvailabilityClassification {
  isAvailability: true;
  reason: DbAvailabilityReason;
  sqlState?: string;
  code?: string;
}

function readSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { code?: unknown; sqlState?: unknown };
  const code = typeof record.code === "string" ? record.code : undefined;
  const sqlState = typeof record.sqlState === "string" ? record.sqlState : undefined;
  // node-pg puts SQLSTATE in `code` for Postgres errors (e.g. "53000").
  if (code && /^[0-9A-Z]{5}$/.test(code)) return code;
  if (sqlState && /^[0-9A-Z]{5}$/.test(sqlState)) return sqlState;
  return undefined;
}

function readNodeCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return undefined;
  if (/^[0-9A-Z]{5}$/.test(code)) return undefined; // SQLSTATE, not errno
  return code;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error ?? "");
}

export function classifyDbAvailabilityError(
  error: unknown,
): DbAvailabilityClassification | null {
  const sqlState = readSqlState(error);
  if (sqlState && AVAILABILITY_SQLSTATES.has(sqlState)) {
    return {
      isAvailability: true,
      reason: sqlState === "53000" ? "postgres-53000" : "postgres-connection",
      sqlState,
    };
  }

  const nodeCode = readNodeCode(error);
  if (nodeCode && AVAILABILITY_CODES.has(nodeCode)) {
    return {
      isAvailability: true,
      reason: nodeCode === "ETIMEDOUT" ? "timeout" : "network",
      code: nodeCode,
    };
  }

  const message = readMessage(error);
  if (AVAILABILITY_MESSAGE.test(message)) {
    const reason: DbAvailabilityReason = /quota|upgrade your plan/i.test(message)
      ? "quota-message"
      : /timeout/i.test(message)
        ? "timeout"
        : "unknown-availability";
    return { isAvailability: true, reason, sqlState, code: nodeCode };
  }

  return null;
}

export function isDbAvailabilityError(error: unknown): boolean {
  return classifyDbAvailabilityError(error) !== null;
}

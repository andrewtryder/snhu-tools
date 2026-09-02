export type DatabaseRuntimeMode = "legacy" | "unified";

/**
 * Returns whether the unified runtime database topology is active.
 *
 * - "unified": all feature domains (Programs, Courses, Transfers) share a single
 *   pg.Pool connection instance pointing to POSTGRES_URL.
 * - "legacy" (or unset / empty): each feature domain maintains its isolated
 *   runtime pool and dedicated connection string environment variable.
 *
 * Throws an explicit Error if an unrecognized non-empty mode is configured.
 */
export function isUnifiedDatabaseRuntime(): boolean {
  const mode = process.env.SNHU_TOOLS_DATABASE_MODE?.trim();

  if (!mode || mode === "legacy") {
    return false;
  }

  if (mode === "unified") {
    return true;
  }

  throw new Error(
    `Invalid SNHU_TOOLS_DATABASE_MODE: "${mode}". Expected "legacy", "unified", or unset.`
  );
}

export function getDatabaseRuntimeMode(): DatabaseRuntimeMode {
  return isUnifiedDatabaseRuntime() ? "unified" : "legacy";
}

import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { resolvePgConnectionConfig } from "./ssl";

export const POOL_OPTIONS = {
  max: 1,
  idleTimeoutMillis: 5_000,
  // Allow enough time for suspended serverless Postgres compute to resume before failing the initial connection.
  connectionTimeoutMillis: 15_000,
} as const;

const globalForPg = globalThis as typeof globalThis & {
  pgPool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("POSTGRES_URL is required");
  }

  const { connectionString: cleanedConnectionString, ssl } =
    resolvePgConnectionConfig(connectionString);

  const pool = new Pool({
    connectionString: cleanedConnectionString,
    ssl,
    ...POOL_OPTIONS,
  });

  attachDatabasePool(pool);

  return pool;
}

export function getPool(): Pool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = createPool();
  }

  return globalForPg.pgPool;
}

export const RUNTIME_POOL_MAX = POOL_OPTIONS.max;
export const RUNTIME_POOL_CONNECTION_TIMEOUT_MS = POOL_OPTIONS.connectionTimeoutMillis;

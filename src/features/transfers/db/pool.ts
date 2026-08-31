import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { resolvePgConnectionConfig } from "@/lib/db/ssl";

export const TRANSFERS_POOL_OPTIONS = {
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
} as const;

const globalForTransfersPg = globalThis as typeof globalThis & {
  transfersPgPool?: Pool;
};

function createTransfersPool(): Pool {
  const connectionString = process.env.TRANSFERS_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("TRANSFERS_POSTGRES_URL is required to query transfer data");
  }

  const { connectionString: cleanedConnectionString, ssl } =
    resolvePgConnectionConfig(connectionString, process.env.TRANSFERS_POSTGRES_CA_CERT);

  const pool = new Pool({
    connectionString: cleanedConnectionString,
    ssl,
    ...TRANSFERS_POOL_OPTIONS,
  });

  attachDatabasePool(pool);

  return pool;
}

export function getTransfersPool(): Pool {
  if (!globalForTransfersPg.transfersPgPool) {
    globalForTransfersPg.transfersPgPool = createTransfersPool();
  }

  return globalForTransfersPg.transfersPgPool;
}

export const TRANSFERS_RUNTIME_POOL_MAX = TRANSFERS_POOL_OPTIONS.max;

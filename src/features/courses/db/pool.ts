import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { getPool } from "@/lib/db/pool";
import { isUnifiedDatabaseRuntime } from "@/lib/db/runtimeMode";
import { resolvePgConnectionConfig } from "@/lib/db/ssl";
import { augmentQueryClient } from "./sql";
import type { QueryClient } from "./types";

export const COURSES_POOL_OPTIONS = {
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
} as const;

const globalForCoursesPg = globalThis as typeof globalThis & {
  coursesPgPool?: Pool;
};

function createCoursesPool(): Pool {
  const connectionString = process.env.COURSES_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("COURSES_POSTGRES_URL is required");
  }

  const { connectionString: cleanedConnectionString, ssl } =
    resolvePgConnectionConfig(connectionString, process.env.COURSES_POSTGRES_CA_CERT);

  const pool = new Pool({
    connectionString: cleanedConnectionString,
    ssl,
    ...COURSES_POOL_OPTIONS,
  });

  attachDatabasePool(pool);

  return pool;
}

export function getCoursesPool(): Pool {
  if (isUnifiedDatabaseRuntime()) {
    return getPool();
  }

  if (!globalForCoursesPg.coursesPgPool) {
    globalForCoursesPg.coursesPgPool = createCoursesPool();
  }

  return globalForCoursesPg.coursesPgPool;
}

export async function withPoolClient<T>(
  fn: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const pool = getCoursesPool();
  const rawClient = await pool.connect();
  const client = augmentQueryClient(rawClient);

  try {
    return await fn(client);
  } finally {
    rawClient.release();
  }
}

export const COURSES_RUNTIME_POOL_MAX = COURSES_POOL_OPTIONS.max;

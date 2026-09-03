import { getPool } from "@/lib/db/pool";
import { augmentQueryClient } from "./sql";
import type { QueryClient } from "./types";

export async function withPoolClient<T>(
  fn: (client: QueryClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const rawClient = await pool.connect();
  const client = augmentQueryClient(rawClient);

  try {
    return await fn(client);
  } finally {
    rawClient.release();
  }
}

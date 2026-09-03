import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "@/lib/db/pool";
import * as schema from "./schema";

export type TransfersDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForTransfersDb = globalThis as typeof globalThis & {
  transfersDrizzleDb?: TransfersDatabase;
};

function createDb(): TransfersDatabase {
  return drizzle(getPool(), { schema });
}

function getDb(): TransfersDatabase {
  if (!globalForTransfersDb.transfersDrizzleDb) {
    globalForTransfersDb.transfersDrizzleDb = createDb();
  }

  return globalForTransfersDb.transfersDrizzleDb;
}

/**
 * Lazily create the database client. Importing a page during `next build` must
 * not require a production connection string; request-time data loaders call
 * through this proxy only after `connection()` has deferred prerendering.
 */
export const db = new Proxy({} as TransfersDatabase, {
  get(_target, property) {
    const database = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = database[property];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

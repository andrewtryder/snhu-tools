import { drizzle } from "drizzle-orm/node-postgres";
import { getTransfersPool } from "./pool";
import * as schema from "./schema";

export type TransfersDatabase = ReturnType<typeof drizzle<typeof schema>>;

const globalForTransfersDb = globalThis as typeof globalThis & {
  transfersDrizzleDb?: TransfersDatabase;
};

function createDb(): TransfersDatabase {
  const connectionString = process.env.TRANSFERS_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("TRANSFERS_POSTGRES_URL is required to query transfer data");
  }

  return drizzle(getTransfersPool(), { schema });
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

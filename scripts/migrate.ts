import dotenv from "dotenv";
import { createPgClient } from "@/lib/db/client";
import { migrateCourses } from "./migrations/courses";
import { migratePrograms } from "./migrations/programs";
import { migrateTransfers } from "./migrations/transfers";

dotenv.config();

export async function runMigrations(connectionString = process.env.POSTGRES_URL): Promise<void> {
  if (!connectionString) throw new Error("POSTGRES_URL environment variable is required.");

  const client = createPgClient(connectionString);
  await client.connect();
  try {
    await migratePrograms(client);
    await migrateCourses(client);
    await migrateTransfers(client);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error("[Migration Error] Unable to complete database migration:", error);
    process.exitCode = 1;
  });
}

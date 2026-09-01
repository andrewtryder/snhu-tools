import dotenv from "dotenv";
import { bootstrapCatalog } from "@/features/courses/sync";

dotenv.config();

export async function main(): Promise<void> {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");
  const result = await bootstrapCatalog();
  console.log(JSON.stringify({ action: "promoted", ...result }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Catalog bootstrap failed:", error);
    process.exitCode = 1;
  });
}

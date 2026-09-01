import dotenv from "dotenv";
import { runCatalogSyncToCompletion } from "@/features/courses/sync";

dotenv.config();

export async function main(args = process.argv.slice(2)): Promise<void> {
  const unsupported = args.filter((arg) => arg !== "--ignore-lease");
  if (unsupported.length > 0) throw new Error(`Unsupported argument(s): ${unsupported.join(", ")}`);
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");

  const result = await runCatalogSyncToCompletion({ ignoreLease: args.includes("--ignore-lease") });
  console.log(JSON.stringify(result));
  if (result.action === "error") process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({ action: "error", error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}

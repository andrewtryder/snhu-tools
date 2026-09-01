import dotenv from "dotenv";
import { runTransferSyncToCompletion } from "@/features/transfers/sync";

dotenv.config();

export async function runToCompletion(
  options: { ignoreLease?: boolean; allowLargeShrink?: boolean } = {},
): Promise<number> {
  if (!process.env.POSTGRES_URL) return 1;
  const result = await runTransferSyncToCompletion(options);
  console.log(JSON.stringify(result));
  return result.action === "error" ? 1 : 0;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const unsupported = args.filter((arg) => arg !== "--ignore-lease" && arg !== "--allow-large-shrink");
  if (unsupported.length > 0) {
    console.log(JSON.stringify({ action: "error", error: `Unsupported argument(s): ${unsupported.join(", ")}` }));
    process.exitCode = 1;
    return;
  }
  process.exitCode = await runToCompletion({
    ignoreLease: args.includes("--ignore-lease"),
    allowLargeShrink: args.includes("--allow-large-shrink"),
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({ action: "error", error: String(error) }));
    process.exitCode = 1;
  });
}

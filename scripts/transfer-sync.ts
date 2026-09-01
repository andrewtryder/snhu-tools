import dotenv from "dotenv";
import { runTransferSync } from "@/features/transfers/sync";

dotenv.config();

export async function runToCompletion(
  options: { ignoreLease?: boolean; allowLargeShrink?: boolean } = {},
): Promise<number> {
  if (!process.env.POSTGRES_URL) return 1;
  let batch = 0;
  while (true) {
    const result = await runTransferSync(options);
    console.log(JSON.stringify({ batch, ...result }));
    if (result.action === "error") return 1;
    if (result.action === "skipped" || result.action === "promoted") return 0;
    batch += 1;
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
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

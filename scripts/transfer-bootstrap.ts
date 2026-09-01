import dotenv from "dotenv";
import { bootstrapTransfer } from "@/features/transfers/sync";

dotenv.config();

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required");
  const result = await bootstrapTransfer({ allowLargeShrink: args.includes("--allow-large-shrink") });
  console.log(JSON.stringify({ action: "promoted", ...result }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Transfer bootstrap failed:", error);
    process.exitCode = 1;
  });
}

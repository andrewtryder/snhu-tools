import dotenv from "dotenv";
import { runProgramSync } from "@/lib/program-sync";
import { SyncOptions } from "@/lib/program-sync/types";

dotenv.config();

export function parseSyncArgs(args = process.argv.slice(2)): SyncOptions {
  const options: SyncOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ignore-lease") {
      options.ignoreLease = true;
    } else if (args[i] === "--allow-large-shrink") {
      options.allowLargeShrink = true;
    } else if (args[i] === "--catalog" && args[i + 1]) {
      if (args[i + 1].startsWith("--")) throw new Error("--catalog requires a catalog ID");
      options.catalogId = args[i + 1];
      i++;
    } else if (args[i] === "--catalog") {
      throw new Error("--catalog requires a catalog ID");
    } else {
      throw new Error(`Unsupported argument: ${args[i]}`);
    }
  }

  return options;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseSyncArgs(args);
  const result = await runProgramSync(options);

  // Single compact JSON line output for CircleCI parsing
  console.log(JSON.stringify(result));

  if (result.action === "error") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    const errObj = {
      action: "error",
      status: "error",
      importedCount: 0,
      skippedCount: 0,
      failedCount: 1,
      promoted: false,
      error: (err as Error).message,
    };
    console.log(JSON.stringify(errObj));
    process.exitCode = 1;
  });
}

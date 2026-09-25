import dotenv from "dotenv";
import {
  publishProgramsSnapshot,
  publishCoursesSnapshot,
  publishTransfersSnapshot,
  publishSearchSnapshot,
  gcSnapshotVersions,
} from "@/lib/snapshots";

dotenv.config();

type DomainArg = "programs" | "courses" | "transfers" | "search" | "all";

function parseDomain(args: string[]): DomainArg {
  const flag = args.find((a) => a.startsWith("--domain="));
  const value = (flag?.slice("--domain=".length) || "all").toLowerCase();
  if (
    value === "programs" ||
    value === "courses" ||
    value === "transfers" ||
    value === "search" ||
    value === "all"
  ) {
    return value;
  }
  throw new Error(
    `Unsupported --domain=${value}. Use programs|courses|transfers|search|all`,
  );
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is required");
  }

  // Prefer filesystem store for local CLI unless explicitly configured.
  if (!process.env.SNAPSHOT_STORE && !process.env.BLOB_READ_WRITE_TOKEN) {
    process.env.SNAPSHOT_STORE = "fs";
  }

  const domain = parseDomain(args);
  const results: Record<string, unknown> = {};

  if (domain === "programs" || domain === "all") {
    results.programs = await publishProgramsSnapshot();
  }
  if (domain === "courses" || domain === "all") {
    results.courses = await publishCoursesSnapshot();
  }
  if (domain === "transfers" || domain === "all") {
    results.transfers = await publishTransfersSnapshot();
  }
  if (domain === "search" || domain === "all") {
    // After domain publishes, rebuild search from published bundles.
    results.search = await publishSearchSnapshot({ fromPublishedDomains: true });
  }

  const gc = await gcSnapshotVersions();
  results.gc = { deleted: gc.deleted.length, retained: gc.retained.length };

  console.log(JSON.stringify({ action: "ok", domain, ...results }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
